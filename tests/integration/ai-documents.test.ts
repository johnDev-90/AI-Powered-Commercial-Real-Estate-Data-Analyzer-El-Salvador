import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase } from "../support/test-db";
import { getDb } from "@/lib/db";
import { investigate } from "@/lib/ai/investigate";
import { AiError, setLlmClientForTesting, type CompletionRequest, type CompletionResult, type LlmClient } from "@/lib/ai/llm";
import { executeTool } from "@/lib/ai/tools";
import { loadDemoData } from "@/lib/services/demo";
import { analyzeDocument, uploadDocument } from "@/lib/services/documents";

let stop: () => Promise<void>;

beforeAll(async () => {
  ({ stop } = await startTestDatabase());
  await loadDemoData();
});
afterAll(async () => {
  await stop();
});
afterEach(() => {
  setLlmClientForTesting(null);
  delete process.env.OPENAI_API_KEY;
});

/** Scripted LLM: each step receives the request and returns a result. */
function scripted(steps: Array<(req: CompletionRequest) => Partial<CompletionResult>>): LlmClient & { requests: CompletionRequest[] } {
  const requests: CompletionRequest[] = [];
  return {
    model: "fake-model",
    requests,
    async complete(req) {
      requests.push(structuredClone({ ...req, signal: undefined }));
      const step = steps[Math.min(requests.length - 1, steps.length - 1)];
      return { content: null, toolCalls: [], model: "fake-model", ...step(req) };
    },
  };
}

describe("AI tools", () => {
  it("validate arguments and enforce limits", async () => {
    expect((await executeTool("drop_tables", "{}")).error).toBe("unknown_tool");
    expect((await executeTool("search_properties", "{not json")).error).toBe("invalid_json");
    expect((await executeTool("search_properties", JSON.stringify({ limit: 500 }))).error).toBe("invalid_args");
    const ok = await executeTool("search_properties", JSON.stringify({ municipality: "Santa Tecla", limit: 3 }));
    expect(ok.propertyIds).toHaveLength(3);
  });

  it("rank properties by issue severity using SQL aggregates", async () => {
    const r = await executeTool("rank_properties_by_issues", JSON.stringify({ limit: 5 }));
    const ranking = (r.data as { ranking: Array<{ score: number }> }).ranking;
    expect(ranking).toHaveLength(5);
    expect(ranking[0].score).toBeGreaterThanOrEqual(ranking[4].score);
  });
});

describe("investigate()", () => {
  it("runs the tool loop, validates the answer and strips citations that were not retrieved", async () => {
    let retrievedId = "";
    const llm = scripted([
      () => ({ toolCalls: [{ id: "c1", name: "get_property", arguments: JSON.stringify({ id: "SYN-AC-0004" }) }] }),
      (req) => {
        const toolMsg = req.messages.find((m) => m.role === "tool");
        retrievedId = JSON.parse(toolMsg!.role === "tool" ? toolMsg!.content : "{}").records[0].property.id;
        return {
          content: JSON.stringify({
            answer: "SYN-AC-0004 has two records with different asking prices.",
            findings: [{ statement: "Asking prices differ", basis: "DETECTED_ISSUE", propertyRecordIds: [retrievedId, "cm_fabricated"], fields: ["askingPriceUsd"] }],
            limitations: ["Asking prices only"],
            suggestedFollowUps: [],
          }),
          usage: { inputTokens: 100, outputTokens: 50 },
        };
      },
    ]);
    setLlmClientForTesting(llm);

    const result = await investigate({ question: "Does SYN-AC-0004 have conflicting information?" });
    expect(result.toolCalls).toEqual([expect.objectContaining({ tool: "get_property", ok: true })]);
    expect(result.answer.findings[0].properties).toEqual([{ id: retrievedId, referenceCode: "SYN-AC-0004" }]);
    expect(result.answer.citationWarnings).toBe(1);
    // System prompt and tool list were sent; the model never receives SQL capability.
    expect(llm.requests[0].messages[0].content).toMatch(/Never invent property facts/);
    expect(llm.requests[0].tools?.map((t) => t.name)).not.toContain("sql");

    const messages = await getDb().aIMessage.findMany({ where: { conversationId: result.conversationId }, orderBy: { createdAt: "asc" } });
    expect(messages.map((m) => m.role)).toEqual(["USER", "ASSISTANT"]);
    expect(messages[1].inputTokens).toBe(100);
  });

  it("stops offering tools after the round limit", async () => {
    const llm = scripted([
      (req) =>
        req.tools
          ? { toolCalls: [{ id: `c${Math.random()}`, name: "list_issues", arguments: "{}" }] }
          : { content: JSON.stringify({ answer: "Done", findings: [], limitations: [], suggestedFollowUps: [] }) },
    ]);
    setLlmClientForTesting(llm);
    const result = await investigate({ question: "Loop forever please" });
    expect(result.toolCalls).toHaveLength(4);
    expect(llm.requests.at(-1)?.tools).toBeUndefined();
  });

  it("rejects malformed model output and records the failure", async () => {
    setLlmClientForTesting(scripted([() => ({ content: "not json" })]));
    const error = await investigate({ question: "Anything" }).catch((e) => e);
    expect(error).toBeInstanceOf(AiError);
    expect(error.code).toBe("INVALID_OUTPUT");
    const failed = await getDb().aIMessage.findFirst({ where: { conversationId: error.conversationId, errorCode: "INVALID_OUTPUT" } });
    expect(failed).not.toBeNull();
  });

  it("propagates rate limits and reports when AI is not configured", async () => {
    setLlmClientForTesting({ model: "x", complete: async () => { throw new AiError("RATE_LIMITED", "429"); } });
    await expect(investigate({ question: "Anything" })).rejects.toMatchObject({ code: "RATE_LIMITED" });
    setLlmClientForTesting(null);
    await expect(investigate({ question: "Anything" })).rejects.toMatchObject({ code: "NOT_CONFIGURED" });
  });

  it("times out slow providers", async () => {
    setLlmClientForTesting({
      model: "slow",
      complete: (req) => new Promise((_, reject) => req.signal?.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })))),
    });
    await expect(investigate({ question: "Anything" }, 200)).rejects.toMatchObject({ code: "TIMEOUT" });
  });
});

describe("document analysis", () => {
  const pdf = (name: string) => new Uint8Array(readFileSync(join(process.cwd(), "public", "samples", "docs", name)));

  it("extracts, compares with the record and flags the land-area difference (rule-based, no AI key)", async () => {
    const property = await getDb().property.findFirstOrThrow({ where: { referenceCode: "SYN-SS-0001" }, orderBy: { createdAt: "asc" } });
    const id = await uploadDocument(property.id, "summary.pdf", pdf("SYN-SS-0001-property-summary.pdf"));
    const result = await analyzeDocument(id);
    expect(result.method).toBe("RULES");
    const issues = await getDb().dataQualityIssue.findMany({ where: { documentId: id }, orderBy: { field: "asc" } });
    // Land area differs by 12%; the record has no zoning while the document states one (low severity).
    expect(issues.map((i) => [i.field, i.severity])).toEqual([["landAreaM2", "MEDIUM"], ["zoning", "LOW"]]);
    expect(issues[0].observedValue).toMatch(/document p\. 1/);

    // Re-analysis is idempotent.
    await analyzeDocument(id);
    expect(await getDb().dataQualityIssue.count({ where: { documentId: id } })).toBe(2);
  });

  it("treats embedded instructions as data: warns, never changes verification status", async () => {
    const property = await getDb().property.findFirstOrThrow({ where: { referenceCode: "SYN-AC-0003" } });
    const id = await uploadDocument(property.id, "broker.pdf", pdf("SYN-AC-0003-broker-sheet.pdf"));
    // The AI path is used and receives the document only as delimited data, with no tools.
    process.env.OPENAI_API_KEY = "test";
    const llm = scripted([() => ({ content: JSON.stringify({ summary: "Broker sheet.", fields: [{ field: "askingPriceUsd", value: "1", page: 1, excerpt: "not on the page", }], containsInstructionsToAI: true }) })]);
    setLlmClientForTesting(llm);
    await analyzeDocument(id);
    expect(llm.requests[0].tools).toBeUndefined();
    expect(llm.requests[0].messages[1].content).toMatch(/^<document>/);
    const doc = await getDb().propertyDocument.findUniqueOrThrow({ where: { id } });
    const extraction = doc.extraction as { warnings: string[]; fields: Array<{ excerptVerified: boolean }> };
    expect(extraction.warnings.join(" ")).toMatch(/instructions/);
    expect(extraction.fields[0].excerptVerified).toBe(false);
    const after = await getDb().property.findUniqueOrThrow({ where: { id: property.id } });
    expect(after.verificationStatus).toBe(property.verificationStatus);
  });

  it("rejects non-PDF uploads", async () => {
    const property = await getDb().property.findFirstOrThrow();
    await expect(uploadDocument(property.id, "x.pdf", new TextEncoder().encode("hello"))).rejects.toThrow(/not a valid PDF/);
  });
});
