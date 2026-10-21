import { Decimal, relativeDifference, toDecimal } from "@/lib/domain/decimal";
import { FIELD_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/domain/labels";
import { normalizeText } from "@/lib/domain/text";
import { parsePropertyType } from "@/lib/csv/normalize";
import type { Detection } from "@/lib/quality/types";
import { NUMERIC_DOCUMENT_FIELDS, type ExtractedField } from "./extract";

export interface RecordValues {
  id: string;
  referenceCode: string | null;
  name: string | null;
  address: string | null;
  municipality: string | null;
  department: string | null;
  propertyType: string | null;
  cadastralId: string | null;
  landAreaM2: Decimal | null;
  buildingAreaM2: Decimal | null;
  askingPriceUsd: Decimal | null;
  zoning: string | null;
}

export const DOCUMENT_TOLERANCE = new Decimal("0.01");

function recordDisplay(field: string, value: unknown): string {
  if (value === null || value === undefined) return "(empty)";
  if (field === "propertyType") return PROPERTY_TYPE_LABELS[value as keyof typeof PROPERTY_TYPE_LABELS] ?? String(value);
  if (value instanceof Decimal) return value.toFixed(2);
  return String(value);
}

/**
 * Compare extracted document values with the database record. Differences become
 * DOCUMENT_MISMATCH detections for human review; nothing on the record is changed.
 * Free-text fields (name, address, zoning) are compared loosely to avoid noise.
 */
export function compareWithRecord(record: RecordValues, fields: ExtractedField[], documentId: string, fileName: string): Detection[] {
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const f of fields) {
    if (seen.has(f.field)) continue;
    seen.add(f.field);
    const recordValue = record[f.field as keyof RecordValues];
    let differs = false;
    let docDisplay = f.value;

    if (NUMERIC_DOCUMENT_FIELDS.includes(f.field)) {
      const docNumber = toDecimal(f.value.replace(/[^\d.]/g, ""));
      if (!docNumber) continue;
      docDisplay = docNumber.toFixed(2);
      const rec = recordValue as Decimal | null;
      differs = rec === null || relativeDifference(docNumber, rec).gt(DOCUMENT_TOLERANCE);
    } else if (f.field === "propertyType") {
      const docType = parsePropertyType(f.value);
      if (!docType) continue;
      differs = docType !== recordValue;
      docDisplay = PROPERTY_TYPE_LABELS[docType];
    } else if (f.field === "name" || f.field === "address" || f.field === "zoning") {
      const a = normalizeText(f.value);
      const b = normalizeText(String(recordValue ?? ""));
      differs = b.length === 0 || (!a.includes(b) && !b.includes(a));
    } else {
      differs = normalizeText(f.value) !== normalizeText(String(recordValue ?? ""));
    }
    if (!differs) continue;

    const label = FIELD_LABELS[f.field] ?? f.field;
    out.push({
      ruleCode: "DOCUMENT_MISMATCH",
      category: "DOCUMENT",
      severity: NUMERIC_DOCUMENT_FIELDS.includes(f.field) || f.field === "cadastralId" || f.field === "referenceCode" ? "MEDIUM" : "LOW",
      propertyId: record.id,
      documentId,
      field: f.field,
      observedValue: `${docDisplay} (document p. ${f.page})`,
      expectedValue: `${recordDisplay(f.field, recordValue)} (record)`,
      explanation: `${label} in "${fileName}" (page ${f.page}: "${f.excerpt.slice(0, 140)}") differs from the database record.${f.excerptVerified ? "" : " The supporting excerpt could not be confirmed on that page."}`,
      recommendation: "Confirm which value is correct using authoritative documents. The document itself has not been officially verified.",
    });
  }
  return out;
}
