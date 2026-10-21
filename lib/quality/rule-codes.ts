// Client-safe rule identifiers and labels.

export const RULE_CODES = [
  "MISSING_REQUIRED_FIELD",
  "UNPARSEABLE_VALUE",
  "INVALID_AREA",
  "AREA_INCONSISTENCY",
  "INVALID_PRICE",
  "PRICE_PER_M2_MISMATCH",
  "LOCATION_MISMATCH",
  "UNKNOWN_LOCATION",
  "MISSING_VERIFICATION",
  "INVALID_PROPERTY_TYPE",
  "INVALID_DATE",
  "DUPLICATE_IDENTIFIER",
  "POTENTIAL_DUPLICATE",
  "CONFLICTING_VALUES",
  "PRICE_PER_M2_OUTLIER",
  "DOCUMENT_MISMATCH",
] as const;

export type RuleCode = (typeof RULE_CODES)[number];

export const RULE_LABELS: Record<RuleCode, string> = {
  MISSING_REQUIRED_FIELD: "Missing required field",
  UNPARSEABLE_VALUE: "Unreadable value",
  INVALID_AREA: "Invalid area",
  AREA_INCONSISTENCY: "Inconsistent areas",
  INVALID_PRICE: "Invalid asking price",
  PRICE_PER_M2_MISMATCH: "Price per m² inconsistent",
  LOCATION_MISMATCH: "Department / municipality mismatch",
  UNKNOWN_LOCATION: "Location not in reference list",
  MISSING_VERIFICATION: "Missing verification status",
  INVALID_PROPERTY_TYPE: "Unsupported property type",
  INVALID_DATE: "Invalid date",
  DUPLICATE_IDENTIFIER: "Duplicate property ID",
  POTENTIAL_DUPLICATE: "Potential duplicate property",
  CONFLICTING_VALUES: "Conflicting values between records",
  PRICE_PER_M2_OUTLIER: "Unusual price per m² (review)",
  DOCUMENT_MISMATCH: "Document differs from record",
};

/** Rules whose issues are owned by the analysis engine (auto-resolved when no longer detected). */
export const ENGINE_RULES: RuleCode[] = RULE_CODES.filter((c) => c !== "DOCUMENT_MISMATCH");

export function ruleLabel(code: string): string {
  return (RULE_LABELS as Record<string, string>)[code] ?? code;
}
