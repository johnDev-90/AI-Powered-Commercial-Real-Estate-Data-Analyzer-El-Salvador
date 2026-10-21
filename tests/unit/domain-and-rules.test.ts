import { describe, expect, it } from "vitest";
import { computePricePerM2, Decimal, relativeDifference } from "@/lib/domain/decimal";
import { checkLocation } from "@/lib/domain/geography";
import { normalizeAddress } from "@/lib/domain/text";
import { toSquareMeters } from "@/lib/domain/units";
import { conflictDetections, duplicateIdentifierDetections } from "@/lib/quality/cross-rules";
import { reconcile } from "@/lib/quality/reconcile";
import { runRowRules } from "@/lib/quality/row-rules";
import { fingerprintOf, type PropertySnapshot } from "@/lib/quality/types";

const D = (v: string) => new Decimal(v);

function snapshot(overrides: Partial<PropertySnapshot> = {}): PropertySnapshot {
  return {
    id: "p1", referenceCode: "SYN-1", name: "Torre", address: "Calle 1 #10", normalizedAddress: "calle 1 10",
    municipality: "San Salvador", department: "San Salvador", propertyType: "OFFICE", rawPropertyType: "Office",
    cadastralId: null, landAreaM2: D("1000"), buildingAreaM2: D("3000"), askingPriceUsd: D("6000000"),
    pricePerM2Usd: D("2000"), sourcePricePerM2: null, verificationStatus: "VERIFIED", sourceUpdatedAt: null, importMessages: [],
    ...overrides,
  };
}
const codes = (s: PropertySnapshot) => runRowRules(s, new Date("2026-10-21T00:00:00Z")).map((d) => `${d.ruleCode}:${d.field}`);

describe("financial and area calculations", () => {
  it("uses building area for built properties and land area for land", () => {
    expect(computePricePerM2({ askingPriceUsd: "6000000", landAreaM2: "1000", buildingAreaM2: "3000", propertyType: "OFFICE" })).toEqual({ value: D("2000"), basis: "BUILDING" });
    expect(computePricePerM2({ askingPriceUsd: "500000", landAreaM2: "1000", buildingAreaM2: null, propertyType: "COMMERCIAL_LAND" })?.basis).toBe("LAND");
  });

  it("rounds half-up to cents without floating point error", () => {
    // 0.1 + 0.2 style traps: 1000.10 / 3 = 333.3666… → 333.37
    expect(computePricePerM2({ askingPriceUsd: "1000.10", landAreaM2: null, buildingAreaM2: "3", propertyType: "RETAIL" })?.value.toFixed(2)).toBe("333.37");
    expect(computePricePerM2({ askingPriceUsd: "0.05", landAreaM2: null, buildingAreaM2: "2", propertyType: "RETAIL" })?.value.toFixed(2)).toBe("0.03");
  });

  it("returns null when the basis area is missing, zero or negative, without falling back", () => {
    expect(computePricePerM2({ askingPriceUsd: "100", landAreaM2: "50", buildingAreaM2: null, propertyType: "OFFICE" })).toBeNull();
    expect(computePricePerM2({ askingPriceUsd: "100", landAreaM2: "0", buildingAreaM2: null, propertyType: "COMMERCIAL_LAND" })).toBeNull();
    expect(computePricePerM2({ askingPriceUsd: "100", landAreaM2: "-5", buildingAreaM2: null, propertyType: "COMMERCIAL_LAND" })).toBeNull();
    expect(computePricePerM2({ askingPriceUsd: "100", landAreaM2: "5", buildingAreaM2: null, propertyType: null })).toBeNull();
  });

  it("converts varas cuadradas and manzanas", () => {
    expect(toSquareMeters(D("1000"), "V2").toFixed(2)).toBe("698.90");
    expect(toSquareMeters(D("1"), "MZ").toFixed(2)).toBe("6988.96");
  });

  it("computes relative differences symmetrically", () => {
    expect(relativeDifference(D("100"), D("102")).toFixed(4)).toBe("0.0196");
    expect(relativeDifference(D("0"), D("0")).toString()).toBe("0");
  });
});

describe("normalization and geography", () => {
  it("normalizes address abbreviations and accents to the same key", () => {
    expect(normalizeAddress("79 Av. Norte No. 4462, San Salvador")).toBe(normalizeAddress("79 Avenida Norte #4462, San Salvador"));
    expect(normalizeAddress("Blvd. Los Héroes")).toBe("boulevard los heroes");
    expect(normalizeAddress("   ")).toBeNull();
  });

  it("checks department/municipality consistency including 2024 names", () => {
    expect(checkLocation("Santa Tecla", "La Libertad")).toEqual({ status: "ok" });
    expect(checkLocation("La Libertad Sur", "La Libertad")).toEqual({ status: "ok" });
    expect(checkLocation("santa tecla", "San Salvador")).toEqual({ status: "mismatch", expectedDepartments: ["La Libertad"] });
    expect(checkLocation("Merliot", "La Libertad")).toEqual({ status: "unknown_locality", departmentListComplete: true });
    expect(checkLocation("X", "Santa Anna")).toEqual({ status: "unknown_department" });
  });
});

describe("row rules", () => {
  it("passes a complete, consistent record", () => {
    expect(codes(snapshot())).toEqual([]);
  });

  it("detects missing required fields", () => {
    expect(codes(snapshot({ name: null, address: null, askingPriceUsd: null, pricePerM2Usd: null }))).toEqual(
      expect.arrayContaining(["MISSING_REQUIRED_FIELD:name", "MISSING_REQUIRED_FIELD:address", "MISSING_REQUIRED_FIELD:askingPriceUsd"]),
    );
    expect(codes(snapshot({ landAreaM2: null, buildingAreaM2: null }))).toContain("MISSING_REQUIRED_FIELD:landAreaM2");
    expect(codes(snapshot({ buildingAreaM2: null }))).toContain("MISSING_REQUIRED_FIELD:buildingAreaM2");
  });

  it("reports unreadable source values once instead of also as missing", () => {
    const c = codes(snapshot({ askingPriceUsd: null, importMessages: [{ code: "UNPARSEABLE_VALUE", field: "askingPrice", rawValue: "Consultar", message: "" }] }));
    expect(c).toContain("UNPARSEABLE_VALUE:askingPriceUsd");
    expect(c).not.toContain("MISSING_REQUIRED_FIELD:askingPriceUsd");
  });

  it("clears the unreadable-value issue once the field has been corrected", () => {
    const c = codes(snapshot({ importMessages: [{ code: "UNPARSEABLE_VALUE", field: "askingPrice", rawValue: "Consultar", message: "" }] }));
    expect(c).not.toContain("UNPARSEABLE_VALUE:askingPriceUsd");
  });

  it("detects zero, negative, implausible and inconsistent areas", () => {
    expect(codes(snapshot({ landAreaM2: D("0") }))).toContain("INVALID_AREA:landAreaM2");
    expect(codes(snapshot({ landAreaM2: D("-1") }))).toContain("INVALID_AREA:landAreaM2");
    expect(codes(snapshot({ buildingAreaM2: D("6") }))).toContain("INVALID_AREA:buildingAreaM2");
    expect(codes(snapshot({ landAreaM2: D("100"), buildingAreaM2: D("2500") }))).toContain("AREA_INCONSISTENCY:buildingAreaM2");
  });

  it("detects invalid prices and stated price-per-m² mismatches beyond 2%", () => {
    expect(codes(snapshot({ askingPriceUsd: D("0") }))).toContain("INVALID_PRICE:askingPriceUsd");
    expect(codes(snapshot({ askingPriceUsd: D("950") }))).toContain("INVALID_PRICE:askingPriceUsd");
    expect(codes(snapshot({ sourcePricePerM2: D("2030") }))).not.toContain("PRICE_PER_M2_MISMATCH:sourcePricePerM2");
    expect(codes(snapshot({ sourcePricePerM2: D("2300") }))).toContain("PRICE_PER_M2_MISMATCH:sourcePricePerM2");
  });

  it("detects location, verification, classification and date problems", () => {
    expect(codes(snapshot({ municipality: "Santa Tecla", department: "San Salvador" }))).toContain("LOCATION_MISMATCH:department");
    expect(codes(snapshot({ municipality: "Merliot", department: "La Libertad" }))).toContain("UNKNOWN_LOCATION:municipality");
    expect(codes(snapshot({ verificationStatus: null }))).toContain("MISSING_VERIFICATION:verificationStatus");
    expect(codes(snapshot({ propertyType: null, rawPropertyType: "Hotel" }))).toContain("INVALID_PROPERTY_TYPE:propertyType");
    expect(codes(snapshot({ sourceUpdatedAt: new Date("2027-03-15") }))).toContain("INVALID_DATE:sourceUpdatedAt");
  });
});

describe("cross-record rules", () => {
  it("creates one duplicate-ID issue per pair on the newer record", () => {
    const [d] = duplicateIdentifierDetections([{ olderId: "a", newerId: "b", referenceCode: "SYN-1" }]);
    expect(d).toMatchObject({ propertyId: "b", relatedPropertyId: "a", severity: "HIGH" });
  });

  it("reports field conflicts above tolerance and ignores missing values", () => {
    const a = snapshot({ id: "a" });
    const b = snapshot({ id: "b", askingPriceUsd: D("7000000"), landAreaM2: D("1005"), municipality: "san salvador", department: null });
    const byId = new Map([["a", a], ["b", b]]);
    const fields = conflictDetections([{ olderId: "a", newerId: "b", matchedBy: "referenceCode" }], byId).map((d) => d.field);
    expect(fields).toEqual(["askingPriceUsd"]); // 0.5% area diff, case-only municipality diff and missing department are not conflicts
  });
});

describe("reconciliation", () => {
  const det = { ruleCode: "INVALID_AREA" as const, category: "VALIDITY" as const, severity: "HIGH" as const, propertyId: "p1", field: "landAreaM2", explanation: "x", recommendation: "y" };
  const fp = fingerprintOf(det);

  it("is idempotent: unchanged detections are refreshed, not duplicated", () => {
    const plan = reconcile([{ id: "i1", fingerprint: fp, status: "OPEN", severity: "HIGH", observedValue: null, expectedValue: null, explanation: "x" }], [det]);
    expect(plan.create).toHaveLength(0);
    expect(plan.stillDetected).toEqual([{ id: "i1", detection: det, detailsChanged: false }]);
  });

  it("auto-resolves open issues that disappear, reopens resolved ones, and respects dismissals", () => {
    const base = { severity: "HIGH", observedValue: null, expectedValue: null, explanation: "x" };
    expect(reconcile([{ id: "i1", fingerprint: fp, status: "OPEN", ...base }], []).autoResolve).toEqual([{ id: "i1" }]);
    expect(reconcile([{ id: "i1", fingerprint: fp, status: "RESOLVED", ...base }], [det]).reopen).toHaveLength(1);
    const dismissed = reconcile([{ id: "i1", fingerprint: fp, status: "DISMISSED", ...base }], [det]);
    expect(dismissed.reopen).toHaveLength(0);
    expect(dismissed.stillDetected).toHaveLength(1);
    expect(reconcile([{ id: "i1", fingerprint: fp, status: "DISMISSED", ...base }], []).autoResolve).toHaveLength(0);
  });
});
