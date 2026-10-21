import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getDb, withTransaction } from "@/lib/db";
import { toStrictJsonSchema } from "@/lib/ai/answer";
import { AiError, getLlmClient, isAiConfigured, toAiError } from "@/lib/ai/llm";
import { compareWithRecord } from "@/lib/documents/compare";
import {
  detectInjection, documentPrompt, extractionSchema, extractWithRules, verifyExcerpt, EXTRACTION_SYSTEM_PROMPT,
  type DocumentExtraction,
} from "@/lib/documents/extract";
import { DocumentError, extractPdfPages, MAX_PDF_BYTES, type ExtractedPage } from "@/lib/documents/pdf";
import { fingerprintOf } from "@/lib/quality/types";

/** Store the PDF and its per-page text. Analysis runs separately so upload never depends on the AI. */
export async function uploadDocument(propertyId: string, fileName: string, bytes: Uint8Array) {
  if (bytes.byteLength === 0) throw new DocumentError("The file is empty.");
  if (bytes.byteLength > MAX_PDF_BYTES) throw new DocumentError(`The file exceeds ${MAX_PDF_BYTES / 1024 / 1024} MB.`);
  const db = getDb();
  const property = await db.property.findUnique({ where: { id: propertyId }, select: { id: true } });
  if (!property) throw new DocumentError("Property not found.");
  const { pages, totalPages } = await extractPdfPages(bytes);
  const doc = await db.propertyDocument.create({
    data: {
      propertyId,
      fileName: fileName.replace(/[^\w.\- ()]/g, "_").slice(0, 200),
      mimeType: "application/pdf",
      sizeBytes: bytes.byteLength,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      content: Buffer.from(bytes),
      pageCount: totalPages,
      extractedPages: pages as unknown as Prisma.InputJsonValue,
      status: "EXTRACTED",
    },
    select: { id: true },
  });
  return doc.id;
}

async function extractWithAi(pages: ExtractedPage[]): Promise<DocumentExtraction> {
  const llm = getLlmClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45_000);
  try {
    // No tools are offered here: document text can never trigger data access.
    const result = await llm.complete({
      messages: [
        { role: "system", content: EXTRACTION_SYSTEM_PROMPT },
        { role: "user", content: documentPrompt(pages) },
      ],
      responseFormat: { name: "document_extraction", schema: toStrictJsonSchema(extractionSchema) },
      maxOutputTokens: 2000,
      signal: controller.signal,
    });
    let json: unknown;
    try {
      json = JSON.parse(result.content ?? "");
    } catch {
      throw new AiError("INVALID_OUTPUT", "Extraction was not JSON");
    }
    const parsed = extractionSchema.safeParse(json);
    if (!parsed.success) throw new AiError("INVALID_OUTPUT", "Extraction did not match the schema");
    const warnings: string[] = [];
    if (parsed.data.containsInstructionsToAI) warnings.push("The AI reported text in the document that attempts to give instructions to automated systems. It was ignored.");
    return {
      method: "AI",
      model: result.model,
      summary: parsed.data.summary.slice(0, 2000),
      fields: parsed.data.fields.slice(0, 30).map((f) => ({
        field: f.field,
        value: f.value.slice(0, 300),
        page: f.page,
        excerpt: f.excerpt.slice(0, 300),
        excerptVerified: verifyExcerpt(f.excerpt, f.page, pages),
      })),
      warnings,
    };
  } catch (error) {
    throw toAiError(controller.signal.aborted ? new AiError("TIMEOUT", "Extraction timed out") : error);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Extract fields (AI if configured, otherwise labelled-pattern rules), verify excerpts,
 * compare with the record and store DOCUMENT_MISMATCH issues for review.
 */
export async function analyzeDocument(documentId: string): Promise<{ mismatches: number; method: "AI" | "RULES"; aiError?: string }> {
  const db = getDb();
  const doc = await db.propertyDocument.findUnique({ where: { id: documentId }, include: { property: true } });
  if (!doc) throw new DocumentError("Document not found.");
  const pages = (doc.extractedPages ?? []) as unknown as ExtractedPage[];

  let extraction: DocumentExtraction;
  let aiError: string | undefined;
  if (isAiConfigured()) {
    try {
      extraction = await extractWithAi(pages);
    } catch (error) {
      aiError = toAiError(error).code;
      extraction = extractWithRules(pages);
      extraction.warnings.push(`AI extraction failed (${aiError}); rule-based extraction was used instead.`);
    }
  } else {
    extraction = extractWithRules(pages);
  }
  const injectionPages = detectInjection(pages);
  if (injectionPages.length > 0) {
    extraction.warnings.push(`Possible embedded instructions to AI systems on page(s) ${injectionPages.join(", ")}. They were treated as data and ignored.`);
  }
  const unverified = extraction.fields.filter((f) => !f.excerptVerified).length;
  if (unverified > 0) extraction.warnings.push(`${unverified} extracted value(s) could not be matched to the cited page text.`);

  const detections = compareWithRecord(doc.property, extraction.fields, doc.id, doc.fileName);

  await withTransaction(async (tx) => {
    const existing = await tx.dataQualityIssue.findMany({ where: { documentId: doc.id, ruleCode: "DOCUMENT_MISMATCH" }, select: { id: true, fingerprint: true, status: true } });
    const now = new Date();
    const seen = new Set<string>();
    for (const d of detections) {
      const fingerprint = fingerprintOf(d);
      seen.add(fingerprint);
      const data = { severity: d.severity, observedValue: d.observedValue ?? null, expectedValue: d.expectedValue ?? null, explanation: d.explanation, recommendation: d.recommendation, lastDetectedAt: now };
      const prev = existing.find((e) => e.fingerprint === fingerprint);
      if (prev) {
        await tx.dataQualityIssue.update({ where: { id: prev.id }, data: { ...data, ...(prev.status === "RESOLVED" ? { status: "OPEN" } : {}) } });
        if (prev.status === "RESOLVED") await tx.issueReviewEvent.create({ data: { issueId: prev.id, fromStatus: "RESOLVED", toStatus: "OPEN", note: "Mismatch detected again on document re-analysis.", actor: "system" } });
      } else {
        await tx.dataQualityIssue.create({
          data: { ...data, fingerprint, ruleCode: d.ruleCode, category: d.category, propertyId: d.propertyId, documentId: doc.id, field: d.field ?? null, detectedAt: now },
        });
      }
    }
    for (const e of existing.filter((x) => x.status === "OPEN" && !seen.has(x.fingerprint))) {
      await tx.dataQualityIssue.update({ where: { id: e.id }, data: { status: "RESOLVED" } });
      await tx.issueReviewEvent.create({ data: { issueId: e.id, fromStatus: "OPEN", toStatus: "RESOLVED", note: "No longer detected on document re-analysis.", actor: "system" } });
    }
    await tx.propertyDocument.update({
      where: { id: doc.id },
      data: { extraction: extraction as unknown as Prisma.InputJsonValue, summary: extraction.summary, status: "ANALYZED", analyzedAt: now, errorMessage: null },
    });
  });

  return { mismatches: detections.length, method: extraction.method, aiError };
}

export async function getDocument(id: string) {
  const doc = await getDb().propertyDocument.findUnique({
    where: { id },
    select: {
      id: true, fileName: true, sizeBytes: true, pageCount: true, status: true, summary: true, extraction: true, extractedPages: true,
      errorMessage: true, createdAt: true, analyzedAt: true, sha256: true,
      property: { select: { id: true, referenceCode: true, name: true, isSynthetic: true } },
      issues: { orderBy: { severity: "desc" }, select: { id: true, field: true, severity: true, status: true, observedValue: true, expectedValue: true, explanation: true } },
    },
  });
  if (!doc) return null;
  return {
    ...doc,
    createdAt: doc.createdAt.toISOString(),
    analyzedAt: doc.analyzedAt?.toISOString() ?? null,
    extraction: doc.extraction as unknown as DocumentExtraction | null,
    extractedPages: (doc.extractedPages ?? []) as unknown as ExtractedPage[],
  };
}
