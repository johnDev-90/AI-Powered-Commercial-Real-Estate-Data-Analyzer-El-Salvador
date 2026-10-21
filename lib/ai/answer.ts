import { z } from "zod";

const UNSUPPORTED_STRICT_KEYWORDS = new Set(["$schema", "maxItems", "minItems", "maxLength", "minLength", "pattern", "format", "minimum", "maximum"]);

/**
 * JSON Schema for provider-side structured output (strict mode). Size/format limits are
 * removed for compatibility; the server re-validates the full Zod schema anyway.
 */
export function toStrictJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const strip = (node: unknown): unknown => {
    if (Array.isArray(node)) return node.map(strip);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).filter(([k]) => !UNSUPPORTED_STRICT_KEYWORDS.has(k)).map(([k, v]) => [k, strip(v)]));
    }
    return node;
  };
  return strip(z.toJSONSchema(schema)) as Record<string, unknown>;
}

/** Basis of each finding, so users can tell record facts from AI interpretation. */
export const FINDING_BASES = ["DATABASE_RECORD", "DETECTED_ISSUE", "USER_PROVIDED", "DOCUMENT_EXTRACT", "AI_INTERPRETATION"] as const;
export type FindingBasis = (typeof FINDING_BASES)[number];

export const BASIS_LABELS: Record<FindingBasis, string> = {
  DATABASE_RECORD: "Database record",
  DETECTED_ISSUE: "Detected issue (rule-based)",
  USER_PROVIDED: "User-provided / unverified",
  DOCUMENT_EXTRACT: "Document extract (unverified)",
  AI_INTERPRETATION: "AI interpretation",
};

/** Strict schema for the model's final answer (all fields required, nullable instead of optional). */
export const answerSchema = z.strictObject({
  answer: z.string().describe("Concise answer in plain text. Refer to properties by their Property ID."),
  findings: z
    .array(
      z.strictObject({
        statement: z.string(),
        basis: z.enum(FINDING_BASES),
        propertyRecordIds: z.array(z.string()).describe("Internal record ids (field `id`) supporting the statement"),
        fields: z.array(z.string()).describe("Field names supporting the statement, e.g. askingPriceUsd"),
      }),
    )
    .describe("Up to 12 key findings"),
  limitations: z.array(z.string()).describe("Missing data or caveats that limit the answer"),
  suggestedFollowUps: z.array(z.string()),
});

export type ModelAnswer = z.infer<typeof answerSchema>;

export interface CheckedFinding {
  statement: string;
  basis: FindingBasis;
  fields: string[];
  properties: Array<{ id: string; referenceCode: string | null }>;
  /** Citations that did not appear in retrieved data were removed. */
  removedCitations: number;
}

export interface CheckedAnswer {
  answer: string;
  findings: CheckedFinding[];
  limitations: string[];
  suggestedFollowUps: string[];
  citationWarnings: number;
}

/**
 * Server-side grounding check: a finding may only cite records that the tools actually
 * returned during this turn. Unknown ids are stripped and counted; a factual finding left
 * with no valid citation is downgraded to AI interpretation.
 */
export function checkCitations(answer: ModelAnswer, retrieved: Map<string, string | null>): CheckedAnswer {
  let citationWarnings = 0;
  const findings = answer.findings.slice(0, 12).map((f): CheckedFinding => {
    const valid = [...new Set(f.propertyRecordIds)].filter((id) => retrieved.has(id));
    const removed = new Set(f.propertyRecordIds).size - valid.length;
    citationWarnings += removed;
    const groundedBasis = f.basis === "DATABASE_RECORD" || f.basis === "DETECTED_ISSUE" || f.basis === "DOCUMENT_EXTRACT";
    return {
      statement: f.statement,
      basis: groundedBasis && valid.length === 0 && f.propertyRecordIds.length > 0 ? "AI_INTERPRETATION" : f.basis,
      fields: f.fields.slice(0, 10),
      properties: valid.map((id) => ({ id, referenceCode: retrieved.get(id) ?? null })),
      removedCitations: removed,
    };
  });
  return {
    answer: answer.answer,
    findings,
    limitations: answer.limitations.slice(0, 8),
    suggestedFollowUps: answer.suggestedFollowUps.slice(0, 3),
    citationWarnings,
  };
}
