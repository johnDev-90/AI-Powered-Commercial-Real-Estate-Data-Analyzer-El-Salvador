import { Decimal, relativeDifference } from "@/lib/domain/decimal";
import { FIELD_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/domain/labels";
import { normalizeText } from "@/lib/domain/text";
import type { OutlierRow, PotentialDuplicateRow } from "./sql-rules";
import type { Detection, PropertySnapshot } from "./types";

/** Relative tolerance before two numeric values are considered conflicting. */
export const CONFLICT_TOLERANCE = new Decimal("0.01");

const label = (p: PropertySnapshot) => p.referenceCode ?? p.name ?? p.id;

export function duplicateIdentifierDetections(pairs: Array<{ olderId: string; newerId: string; referenceCode: string }>): Detection[] {
  return pairs.map((pair) => ({
    ruleCode: "DUPLICATE_IDENTIFIER",
    category: "DUPLICATION",
    severity: "HIGH",
    propertyId: pair.newerId,
    relatedPropertyId: pair.olderId,
    field: "referenceCode",
    observedValue: pair.referenceCode,
    explanation: `Property ID ${pair.referenceCode} is used by more than one record.`,
    recommendation: "Confirm whether both records describe the same property. Keep the current record and dismiss or correct the other; assign a new ID if they are different properties.",
  }));
}

type Comparable = {
  field: string;
  severity: Detection["severity"];
  get: (p: PropertySnapshot) => string | Decimal | null;
  display: (v: string | Decimal) => string;
};

const fmtNumber = (v: string | Decimal) =>
  v instanceof Decimal ? v.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",") : v;

const COMPARABLE_FIELDS: Comparable[] = [
  { field: "askingPriceUsd", severity: "HIGH", get: (p) => p.askingPriceUsd, display: (v) => `$${fmtNumber(v)}` },
  { field: "landAreaM2", severity: "HIGH", get: (p) => p.landAreaM2, display: (v) => `${fmtNumber(v)} m²` },
  { field: "buildingAreaM2", severity: "HIGH", get: (p) => p.buildingAreaM2, display: (v) => `${fmtNumber(v)} m²` },
  { field: "propertyType", severity: "MEDIUM", get: (p) => p.propertyType, display: (v) => PROPERTY_TYPE_LABELS[v as keyof typeof PROPERTY_TYPE_LABELS] ?? String(v) },
  { field: "municipality", severity: "MEDIUM", get: (p) => p.municipality, display: String },
  { field: "department", severity: "MEDIUM", get: (p) => p.department, display: String },
  { field: "address", severity: "MEDIUM", get: (p) => p.address, display: String },
  { field: "cadastralId", severity: "HIGH", get: (p) => p.cadastralId, display: String },
];

function differs(a: string | Decimal, b: string | Decimal): boolean {
  if (a instanceof Decimal && b instanceof Decimal) return relativeDifference(a, b).gt(CONFLICT_TOLERANCE);
  return normalizeText(String(a)) !== normalizeText(String(b));
}

/**
 * Field-level conflicts between records that refer to the same property.
 * Missing values on one side are not conflicts (they are completeness issues).
 */
export function conflictDetections(
  pairs: Array<{ olderId: string; newerId: string; matchedBy: "referenceCode" | "cadastralId" }>,
  byId: Map<string, PropertySnapshot>,
): Detection[] {
  const out: Detection[] = [];
  for (const pair of pairs) {
    const older = byId.get(pair.olderId);
    const newer = byId.get(pair.newerId);
    if (!older || !newer) continue;
    for (const c of COMPARABLE_FIELDS) {
      if (pair.matchedBy === "cadastralId" && c.field === "cadastralId") continue;
      const a = c.get(older);
      const b = c.get(newer);
      if (a === null || b === null || !differs(a, b)) continue;
      const basis = pair.matchedBy === "referenceCode" ? `Property ID ${newer.referenceCode}` : `cadastral ID ${newer.cadastralId}`;
      out.push({
        ruleCode: "CONFLICTING_VALUES",
        category: "CONSISTENCY",
        severity: c.severity,
        propertyId: newer.id,
        relatedPropertyId: older.id,
        field: c.field,
        observedValue: `${c.display(b)} (this record)`,
        expectedValue: `${c.display(a)} (record ${label(older)})`,
        explanation: `Two records share ${basis} but disagree on ${FIELD_LABELS[c.field].toLowerCase()}.`,
        recommendation: "Determine which source is current (check dates and documents), correct the outdated record, then resolve this issue.",
      });
    }
  }
  return out;
}

export function potentialDuplicateDetections(rows: PotentialDuplicateRow[], byId: Map<string, PropertySnapshot>): Detection[] {
  const out: Detection[] = [];
  for (const row of rows) {
    const older = byId.get(row.olderId);
    const newer = byId.get(row.newerId);
    if (!older || !newer) continue;
    const reason =
      row.matchedBy === "cadastralId"
        ? `both records have cadastral ID ${newer.cadastralId}`
        : row.matchedBy === "exactAddress"
          ? `both records have the same address in ${newer.municipality}`
          : `the addresses are ${(row.similarity * 100).toFixed(0)}% similar within ${newer.municipality}`;
    out.push({
      ruleCode: "POTENTIAL_DUPLICATE",
      category: "DUPLICATION",
      severity: "MEDIUM",
      propertyId: newer.id,
      relatedPropertyId: older.id,
      field: row.matchedBy === "cadastralId" ? "cadastralId" : "address",
      observedValue: row.matchedBy === "cadastralId" ? newer.cadastralId : newer.address,
      expectedValue: `${label(older)}: ${row.matchedBy === "cadastralId" ? older.cadastralId : older.address}`,
      explanation: `This record may describe the same property as ${label(older)}: ${reason}, but the Property IDs differ.`,
      recommendation: "Compare both records. If they are the same property, keep one and correct the other; if not, dismiss this issue.",
    });
  }
  return out;
}

export function outlierDetections(rows: OutlierRow[], byId: Map<string, PropertySnapshot>): Detection[] {
  const out: Detection[] = [];
  for (const row of rows) {
    const p = byId.get(row.id);
    if (!p || !p.propertyType) continue;
    const direction = row.robustZ > 0 ? "above" : "below";
    const scope = `${PROPERTY_TYPE_LABELS[p.propertyType].toLowerCase()} listings in ${row.scope === "municipality" ? p.municipality : `${p.department} department`}`;
    out.push({
      ruleCode: "PRICE_PER_M2_OUTLIER",
      category: "ANOMALY",
      severity: Math.abs(row.robustZ) > 7 ? "MEDIUM" : "LOW",
      propertyId: p.id,
      field: "pricePerM2Usd",
      observedValue: `$${row.pricePerM2.toFixed(2)}/m²`,
      expectedValue: `median $${row.median.toFixed(2)}/m² (n=${row.groupSize})`,
      explanation: `Asking price per m² is far ${direction} the median of ${scope} (robust z-score ${row.robustZ.toFixed(1)}). This may be legitimate (location, condition, finishes) or a data error. Comparison uses asking prices, not transaction prices.`,
      recommendation: "Review the listing source and areas. Dismiss if the value is confirmed; correct the price or area if it is a data error.",
    });
  }
  return out;
}
