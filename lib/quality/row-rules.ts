import { computePricePerM2, Decimal, relativeDifference } from "@/lib/domain/decimal";
import { checkLocation } from "@/lib/domain/geography";
import { FIELD_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/domain/labels";
import type { TargetField } from "@/lib/csv/mapping";
import type { Detection, PropertySnapshot } from "./types";

/** Thresholds for deterministic checks. Values outside them are flagged for review, not rejected. */
export const THRESHOLDS = {
  minPlausibleAreaM2: new Decimal(10),
  maxPlausibleAreaM2: new Decimal(5_000_000),
  maxBuildingToLandRatio: new Decimal(20),
  minPlausiblePriceUsd: new Decimal(1_000),
  maxPlausiblePriceUsd: new Decimal(1_000_000_000),
  pricePerM2Tolerance: new Decimal("0.02"),
  futureDateToleranceMs: 24 * 60 * 60 * 1000,
};

const IMPORT_FIELD_TO_PROPERTY: Partial<Record<TargetField, string>> = {
  landArea: "landAreaM2",
  buildingArea: "buildingAreaM2",
  askingPrice: "askingPriceUsd",
  pricePerArea: "sourcePricePerM2",
  lastUpdated: "sourceUpdatedAt",
};

const usd = (d: Decimal) => `$${d.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
const m2 = (d: Decimal) => `${d.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")} m²`;

/** Single-record rules. Pure functions: no database access. */
export function runRowRules(p: PropertySnapshot, now: Date = new Date()): Detection[] {
  const out: Detection[] = [];
  const add = (d: Omit<Detection, "propertyId">) => out.push({ ...d, propertyId: p.id });
  const unparseable = new Map<string, string>();
  for (const m of p.importMessages) {
    if (m.code === "UNPARSEABLE_VALUE" && m.field) {
      const field = IMPORT_FIELD_TO_PROPERTY[m.field];
      if (field) unparseable.set(field, m.rawValue ?? "");
    }
  }

  // 1. Unreadable values from the source, still not corrected on the record.
  const current: Record<string, unknown> = {
    landAreaM2: p.landAreaM2,
    buildingAreaM2: p.buildingAreaM2,
    askingPriceUsd: p.askingPriceUsd,
    sourcePricePerM2: p.sourcePricePerM2,
    sourceUpdatedAt: p.sourceUpdatedAt,
  };
  for (const [field, raw] of unparseable) {
    if (current[field] !== null) continue;
    add({
      ruleCode: field === "sourceUpdatedAt" ? "INVALID_DATE" : "UNPARSEABLE_VALUE",
      category: "VALIDITY",
      severity: field === "askingPriceUsd" ? "HIGH" : "MEDIUM",
      field,
      observedValue: raw,
      explanation: `The source value "${raw}" for ${FIELD_LABELS[field] ?? field} could not be interpreted, so the field is empty.`,
      recommendation: "Check the original listing and enter the value in a numeric format, or confirm it is unavailable.",
    });
  }

  // 2. Missing required fields.
  const required: Array<{ field: string; value: unknown; severity: Detection["severity"] }> = [
    { field: "name", value: p.name, severity: "MEDIUM" },
    { field: "address", value: p.address, severity: "HIGH" },
    { field: "municipality", value: p.municipality, severity: "HIGH" },
    { field: "department", value: p.department, severity: "HIGH" },
    { field: "propertyType", value: p.propertyType ?? p.rawPropertyType, severity: "HIGH" },
    { field: "askingPriceUsd", value: p.askingPriceUsd ?? (unparseable.has("askingPriceUsd") ? "x" : null), severity: "HIGH" },
  ];
  for (const r of required) {
    if (r.value !== null && r.value !== undefined) continue;
    add({
      ruleCode: "MISSING_REQUIRED_FIELD",
      category: "COMPLETENESS",
      severity: r.severity,
      field: r.field,
      observedValue: null,
      explanation: `${FIELD_LABELS[r.field]} is missing.`,
      recommendation: `Obtain the ${FIELD_LABELS[r.field].toLowerCase()} from the listing source before using this record in comparisons.`,
    });
  }
  const anyArea = p.landAreaM2 ?? p.buildingAreaM2 ?? (unparseable.has("landAreaM2") || unparseable.has("buildingAreaM2") ? "x" : null);
  if (anyArea === null) {
    add({
      ruleCode: "MISSING_REQUIRED_FIELD",
      category: "COMPLETENESS",
      severity: "HIGH",
      field: "landAreaM2",
      explanation: "Neither land area nor building area is available.",
      recommendation: "Obtain the land and/or building area from the source or a survey document.",
    });
  } else if (p.propertyType && p.propertyType !== "COMMERCIAL_LAND" && p.buildingAreaM2 === null && !unparseable.has("buildingAreaM2")) {
    add({
      ruleCode: "MISSING_REQUIRED_FIELD",
      category: "COMPLETENESS",
      severity: "MEDIUM",
      field: "buildingAreaM2",
      explanation: `Building area is missing for a ${PROPERTY_TYPE_LABELS[p.propertyType].toLowerCase()}, so asking price per m² cannot be calculated.`,
      recommendation: "Obtain the building area; price per m² for built properties uses building area.",
    });
  } else if (p.propertyType === "COMMERCIAL_LAND" && p.landAreaM2 === null && !unparseable.has("landAreaM2")) {
    add({
      ruleCode: "MISSING_REQUIRED_FIELD",
      category: "COMPLETENESS",
      severity: "MEDIUM",
      field: "landAreaM2",
      explanation: "Land area is missing for commercial land, so asking price per m² cannot be calculated.",
      recommendation: "Obtain the land area; price per m² for land uses land area.",
    });
  }

  // 3. Area validity and consistency.
  for (const field of ["landAreaM2", "buildingAreaM2"] as const) {
    const value = p[field];
    if (!value) continue;
    if (value.lte(0)) {
      add({
        ruleCode: "INVALID_AREA",
        category: "VALIDITY",
        severity: "HIGH",
        field,
        observedValue: value.toFixed(2),
        expectedValue: "> 0",
        explanation: `${FIELD_LABELS[field]} is ${value.isZero() ? "zero" : "negative"}.`,
        recommendation: "Correct the area from the source; zero or negative areas cannot be used.",
      });
    } else if (value.lt(THRESHOLDS.minPlausibleAreaM2) || value.gt(THRESHOLDS.maxPlausibleAreaM2)) {
      add({
        ruleCode: "INVALID_AREA",
        category: "VALIDITY",
        severity: "MEDIUM",
        field,
        observedValue: m2(value),
        expectedValue: `${m2(THRESHOLDS.minPlausibleAreaM2)} – ${m2(THRESHOLDS.maxPlausibleAreaM2)}`,
        explanation: `${FIELD_LABELS[field]} of ${m2(value)} is outside the plausible range for commercial property. It may be in a different unit (e.g. v² or manzanas) or mistyped.`,
        recommendation: "Confirm the value and the unit of measure with the source.",
      });
    }
  }
  if (p.landAreaM2?.gt(0) && p.buildingAreaM2?.gt(0)) {
    const ratio = p.buildingAreaM2.div(p.landAreaM2);
    if (ratio.gt(THRESHOLDS.maxBuildingToLandRatio)) {
      add({
        ruleCode: "AREA_INCONSISTENCY",
        category: "CONSISTENCY",
        severity: "MEDIUM",
        field: "buildingAreaM2",
        observedValue: `${m2(p.buildingAreaM2)} built on ${m2(p.landAreaM2)} of land (ratio ${ratio.toFixed(1)}×)`,
        expectedValue: `ratio ≤ ${THRESHOLDS.maxBuildingToLandRatio.toFixed(0)}×`,
        explanation: "Building area is unusually large relative to land area. The areas may be swapped or in different units.",
        recommendation: "Verify both areas and their units against the source documents.",
      });
    }
  }

  // 4. Price validity and stated price-per-m² consistency.
  if (p.askingPriceUsd) {
    const price = p.askingPriceUsd;
    if (price.lte(0)) {
      add({
        ruleCode: "INVALID_PRICE",
        category: "VALIDITY",
        severity: "HIGH",
        field: "askingPriceUsd",
        observedValue: usd(price),
        expectedValue: "> $0",
        explanation: "Asking price is zero or negative.",
        recommendation: "Confirm the asking price with the source, or clear it if the price is 'on request'.",
      });
    } else if (price.lt(THRESHOLDS.minPlausiblePriceUsd)) {
      add({
        ruleCode: "INVALID_PRICE",
        category: "VALIDITY",
        severity: "HIGH",
        field: "askingPriceUsd",
        observedValue: usd(price),
        expectedValue: `≥ ${usd(THRESHOLDS.minPlausiblePriceUsd)}`,
        explanation: `An asking price of ${usd(price)} is implausibly low for a commercial property. It may be expressed in thousands, be a price per m², or be a monthly rent.`,
        recommendation: "Check whether the source quotes the price in thousands, per m², or as rent.",
      });
    } else if (price.gt(THRESHOLDS.maxPlausiblePriceUsd)) {
      add({
        ruleCode: "INVALID_PRICE",
        category: "VALIDITY",
        severity: "MEDIUM",
        field: "askingPriceUsd",
        observedValue: usd(price),
        explanation: `An asking price of ${usd(price)} is above the plausible range and may contain extra digits.`,
        recommendation: "Confirm the asking price with the source.",
      });
    }
  }
  const computed = computePricePerM2(p);
  if (computed && p.sourcePricePerM2?.gt(0)) {
    const diff = relativeDifference(computed.value, p.sourcePricePerM2);
    if (diff.gt(THRESHOLDS.pricePerM2Tolerance)) {
      add({
        ruleCode: "PRICE_PER_M2_MISMATCH",
        category: "CONSISTENCY",
        severity: "MEDIUM",
        field: "sourcePricePerM2",
        observedValue: `${usd(p.sourcePricePerM2)}/m² stated`,
        expectedValue: `${usd(computed.value)}/m² (asking price ÷ ${computed.basis === "LAND" ? "land" : "building"} area)`,
        explanation: `The price per m² stated by the source differs by ${diff.mul(100).toFixed(1)}% from the value calculated from asking price and area. The price or the area may be wrong.`,
        recommendation: "Determine which of price, area or stated rate is correct and update the record.",
      });
    }
  }

  // 5. Location consistency against the reference list.
  if (p.municipality && p.department) {
    const check = checkLocation(p.municipality, p.department);
    if (check.status === "mismatch") {
      add({
        ruleCode: "LOCATION_MISMATCH",
        category: "LOCATION",
        severity: "HIGH",
        field: "department",
        observedValue: `${p.municipality}, ${p.department}`,
        expectedValue: check.expectedDepartments.join(" or "),
        explanation: `${p.municipality} is listed under ${check.expectedDepartments.join(" or ")} in the reference list, not ${p.department}.`,
        recommendation: "Correct the department or the municipality after confirming the property location.",
      });
    } else if (check.status === "unknown_department") {
      add({
        ruleCode: "UNKNOWN_LOCATION",
        category: "LOCATION",
        severity: "MEDIUM",
        field: "department",
        observedValue: p.department,
        explanation: `"${p.department}" is not one of El Salvador's 14 departments.`,
        recommendation: "Correct the department name.",
      });
    } else if (check.status === "unknown_locality") {
      add({
        ruleCode: "UNKNOWN_LOCATION",
        category: "LOCATION",
        severity: check.departmentListComplete ? "MEDIUM" : "LOW",
        field: "municipality",
        observedValue: p.municipality,
        explanation: `"${p.municipality}" was not found in the application's reference list for ${p.department}${check.departmentListComplete ? "" : " (the list for this department is partial)"}. It may be misspelled or a neighborhood rather than a municipality/district.`,
        recommendation: "Verify the municipality or district name against official sources.",
      });
    }
  }

  // 6. Verification / documentation status.
  if (!p.verificationStatus) {
    const raw = p.importMessages.find((m) => m.field === "verificationStatus")?.rawValue;
    add({
      ruleCode: "MISSING_VERIFICATION",
      category: "VERIFICATION",
      severity: "LOW",
      field: "verificationStatus",
      observedValue: raw ?? null,
      explanation: raw
        ? `The verification status "${raw}" was not recognized, so documentation status is unknown.`
        : "No documentation or verification status is recorded for this property.",
      recommendation: "Record whether documents (title, cadastral record, zoning) have been reviewed.",
    });
  }

  // 7. Classification.
  if (!p.propertyType && p.rawPropertyType) {
    add({
      ruleCode: "INVALID_PROPERTY_TYPE",
      category: "CLASSIFICATION",
      severity: "MEDIUM",
      field: "propertyType",
      observedValue: p.rawPropertyType,
      expectedValue: Object.values(PROPERTY_TYPE_LABELS).join(", "),
      explanation: `"${p.rawPropertyType}" is not a supported commercial property type.`,
      recommendation: "Reclassify the property into a supported type, or exclude it if it is not commercial.",
    });
  }

  // 8. Dates.
  if (p.sourceUpdatedAt && p.sourceUpdatedAt.getTime() > now.getTime() + THRESHOLDS.futureDateToleranceMs) {
    add({
      ruleCode: "INVALID_DATE",
      category: "VALIDITY",
      severity: "LOW",
      field: "sourceUpdatedAt",
      observedValue: p.sourceUpdatedAt.toISOString().slice(0, 10),
      explanation: "The last-updated date is in the future.",
      recommendation: "Correct the date from the source.",
    });
  }

  return out;
}
