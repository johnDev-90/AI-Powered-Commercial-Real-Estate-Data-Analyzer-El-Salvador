import { createHash, randomUUID } from "node:crypto";
import type { Prisma, RecordSource } from "@/lib/generated/prisma/client";
import { getDb, withTransaction } from "@/lib/db";
import { parseCsv } from "@/lib/csv/parse";
import { suggestAreaUnit, suggestMapping, type ColumnMapping, type ImportOptions } from "@/lib/csv/mapping";
import { normalizeRow } from "@/lib/csv/normalize";
import { runRowRules } from "@/lib/quality/row-rules";
import { runAnalysis, type AnalysisSummary } from "@/lib/quality/engine";
import { deriveFields } from "./property-write";

export const MAX_CSV_BYTES = 4 * 1024 * 1024; // stays under Vercel's 4.5 MB request body limit

export class ImportError extends Error {}

/** Step 1: store the uploaded file and return headers, a preview and a suggested mapping. */
export async function createImport(fileName: string, content: string) {
  const parsed = parseCsv(content);
  const fileSha256 = createHash("sha256").update(content).digest("hex");
  const db = getDb();
  const previous = await db.dataImport.findFirst({
    where: { fileSha256, status: "COMPLETED" },
    select: { id: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  const created = await db.dataImport.create({
    data: {
      fileName: fileName.slice(0, 255),
      fileSha256,
      fileContent: content,
      delimiter: parsed.delimiter,
      headers: parsed.headers,
      status: "PENDING_MAPPING",
      totalRows: parsed.rows.length,
    },
  });
  const mapping = suggestMapping(parsed.headers);
  return {
    importId: created.id,
    headers: parsed.headers,
    totalRows: parsed.rows.length,
    preview: parsed.rows.slice(0, 5).map((r) => r.values),
    suggestedMapping: mapping,
    suggestedOptions: {
      landAreaUnit: suggestAreaUnit(mapping.landArea),
      buildingAreaUnit: suggestAreaUnit(mapping.buildingArea),
    },
    previousImport: previous,
  };
}

export interface ImportResult {
  importId: string;
  accepted: number;
  flagged: number;
  rejected: number;
  analysis: AnalysisSummary | null;
  analysisError?: string;
}

/**
 * Step 2: normalize every row and persist properties + raw rows atomically.
 * Either the whole file is imported or nothing is. Analysis then runs over all data.
 */
export async function commitImport(
  importId: string,
  mapping: ColumnMapping,
  options: ImportOptions,
  source: RecordSource = "CSV_IMPORT",
): Promise<ImportResult> {
  const db = getDb();
  const record = await db.dataImport.findUnique({ where: { id: importId } });
  if (!record) throw new ImportError("Import not found.");
  if (record.status !== "PENDING_MAPPING") throw new ImportError("This import has already been processed.");
  for (const header of Object.values(mapping)) {
    if (header && !record.headers.includes(header)) throw new ImportError(`Column "${header}" does not exist in the file.`);
  }

  const parsed = parseCsv(record.fileContent);
  const counts = { accepted: 0, flagged: 0, rejected: 0 };
  const properties: Prisma.PropertyCreateManyInput[] = [];
  const rows: Prisma.ImportRowCreateManyInput[] = [];
  const startedAt = Date.now();

  // Normalize and pre-check in memory; IDs are generated here so rows can be batch-inserted.
  for (const row of parsed.rows) {
    const normalized = normalizeRow(row.values, mapping, options, row.errors);
    if (normalized.rejectionReasons.length > 0) {
      counts.rejected++;
      rows.push({
        importId,
        rowNumber: row.rowNumber,
        rawData: row.values,
        status: "REJECTED",
        messages: normalized.rejectionReasons.map((message) => ({ code: "UNIDENTIFIABLE", message })) as Prisma.InputJsonValue,
      });
      continue;
    }
    const id = `p_${randomUUID().replace(/-/g, "")}`;
    const p = normalized.property;
    const derived = deriveFields(p);
    // Millisecond offsets keep file order as creation order (used to order duplicate pairs).
    const createdAt = new Date(startedAt + row.rowNumber);
    properties.push({ id, ...p, ...derived, source, isSynthetic: options.isSynthetic, importId, createdAt, updatedAt: createdAt });
    // Row-level preview decides FLAGGED vs ACCEPTED; the full analysis runs after commit.
    const rowIssues = runRowRules({ ...p, ...derived, id, importMessages: normalized.messages });
    const status = rowIssues.length > 0 || normalized.messages.length > 0 ? "FLAGGED" : "ACCEPTED";
    if (status === "FLAGGED") counts.flagged++;
    else counts.accepted++;
    rows.push({
      importId,
      rowNumber: row.rowNumber,
      rawData: row.values,
      status,
      messages: [
        ...normalized.messages,
        ...rowIssues.map((i) => ({ code: i.ruleCode, field: i.field ?? undefined, message: i.explanation })),
      ] as unknown as Prisma.InputJsonValue,
      propertyId: id,
    });
  }

  try {
    await withTransaction(async (tx) => {
      for (const chunk of chunks(properties, 500)) await tx.property.createMany({ data: chunk });
      for (const chunk of chunks(rows, 500)) await tx.importRow.createMany({ data: chunk });
      await tx.dataImport.update({
        where: { id: importId },
        data: {
          status: "COMPLETED",
          columnMapping: { mapping, options } as unknown as Prisma.InputJsonValue,
          isSynthetic: options.isSynthetic,
          acceptedRows: counts.accepted,
          flaggedRows: counts.flagged,
          rejectedRows: counts.rejected,
          completedAt: new Date(),
        },
      });
    }, 180_000);
  } catch (error) {
    await db.dataImport.update({
      where: { id: importId },
      data: { status: "FAILED", errorMessage: error instanceof Error ? error.message.slice(0, 2000) : "Unknown error" },
    });
    throw error;
  }

  // Cross-record checks need the committed data; a failure here does not undo the import.
  try {
    const analysis = await runAnalysis("IMPORT", importId);
    return { importId, ...counts, analysis };
  } catch (error) {
    return { importId, ...counts, analysis: null, analysisError: error instanceof Error ? error.message : "Analysis failed" };
  }
}

function chunks<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
