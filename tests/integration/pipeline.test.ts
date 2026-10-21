import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { startTestDatabase } from "../support/test-db";
import { getDb } from "@/lib/db";
import { loadDemoData } from "@/lib/services/demo";
import { commitImport, createImport, ImportError } from "@/lib/services/import-service";
import { runAnalysis } from "@/lib/quality/engine";
import { reviewIssue, IssueTransitionError } from "@/lib/services/issues";
import { updateProperty } from "@/lib/services/properties";
import { getDashboard, getTypeStats } from "@/lib/services/analytics";
import { getComparison } from "@/lib/services/compare";

let stop: () => Promise<void>;

beforeAll(async () => {
  ({ stop } = await startTestDatabase());
});
afterAll(async () => {
  await stop();
});

const opts = { decimalSeparator: "." as const, dateFormat: "DMY" as const, landAreaUnit: "M2" as const, buildingAreaUnit: "M2" as const, isSynthetic: true };

describe("import transaction behavior", () => {
  it("rolls back the entire file when any row fails to persist", async () => {
    const csv = "id,name,address,price\nT-1,Good,Calle 1,1000\nT-2,Overflow,Calle 2,99999999999999999999\n";
    const created = await createImport("overflow.csv", csv);
    await expect(commitImport(created.importId, { referenceCode: "id", name: "name", address: "address", askingPrice: "price" }, opts)).rejects.toThrow();
    const db = getDb();
    expect(await db.property.count({ where: { referenceCode: { in: ["T-1", "T-2"] } } })).toBe(0);
    expect(await db.importRow.count({ where: { importId: created.importId } })).toBe(0);
    expect((await db.dataImport.findUniqueOrThrow({ where: { id: created.importId } })).status).toBe("FAILED");
  });

  it("refuses to commit the same import twice and rejects unknown columns", async () => {
    const created = await createImport("small.csv", "id,name\nX-1,One\n");
    await expect(commitImport(created.importId, { referenceCode: "nope" }, opts)).rejects.toThrow(ImportError);
    await commitImport(created.importId, { referenceCode: "id", name: "name" }, opts);
    await expect(commitImport(created.importId, { referenceCode: "id" }, opts)).rejects.toThrow(/already been processed/);
    await getDb().$transaction([
      getDb().importRow.deleteMany({ where: { importId: created.importId } }),
      getDb().dataQualityIssue.deleteMany({}),
      getDb().property.deleteMany({ where: { importId: created.importId } }),
    ]);
  });
});

describe("demo dataset through the import pipeline", () => {
  let results: Awaited<ReturnType<typeof loadDemoData>>;

  beforeAll(async () => {
    results = await loadDemoData();
  });

  it("imports both sample files with accepted/flagged/rejected counts and provenance", async () => {
    expect(results.map((r) => r.accepted + r.flagged + r.rejected)).toEqual([101, 15]);
    expect(results.every((r) => r.rejected === 0)).toBe(true);
    const row = await getDb().importRow.findFirstOrThrow({ where: { importId: results[1].importId, rowNumber: 1 }, include: { property: true } });
    expect((row.rawData as Record<string, string>)["Precio (USD)"]).toBe("1.197.000,00");
    expect(row.property?.askingPriceUsd?.toFixed(2)).toBe("1197000.00");
  });

  it("detects each class of planted problem", async () => {
    const counts = await getDb().dataQualityIssue.groupBy({ by: ["ruleCode"], where: { status: "OPEN" }, _count: true });
    const by = Object.fromEntries(counts.map((c) => [c.ruleCode, c._count]));
    expect(by.DUPLICATE_IDENTIFIER).toBe(8);
    expect(by.CONFLICTING_VALUES).toBe(6);
    expect(by.POTENTIAL_DUPLICATE).toBe(3);
    expect(by.LOCATION_MISMATCH).toBe(2);
    expect(by.INVALID_PROPERTY_TYPE).toBe(2);
    expect(by.UNPARSEABLE_VALUE).toBe(1);
    expect(by.PRICE_PER_M2_MISMATCH).toBe(3);
    expect(by.PRICE_PER_M2_OUTLIER).toBeGreaterThanOrEqual(3);
    expect(by.MISSING_VERIFICATION).toBeGreaterThanOrEqual(9);
  });

  it("does not report identical records (after v² conversion) as conflicting", async () => {
    const conflicts = await getDb().dataQualityIssue.findMany({ where: { ruleCode: "CONFLICTING_VALUES" }, include: { property: { select: { referenceCode: true } } } });
    const ids = new Set(conflicts.map((c) => c.property.referenceCode));
    expect(ids.has("SYN-SS-0001")).toBe(false);
    expect(ids.has("SYN-ST-0001")).toBe(false);
    expect(ids.has("SYN-AC-0001")).toBe(true);
  });

  it("is idempotent when re-run", async () => {
    const before = await getDb().dataQualityIssue.count();
    const summary = await runAnalysis("MANUAL");
    expect(summary.issuesNew).toBe(0);
    expect(summary.issuesAutoResolved).toBe(0);
    expect(await getDb().dataQualityIssue.count()).toBe(before);
  });

  it("auto-resolves an issue after the record is corrected, logging a system event", async () => {
    const db = getDb();
    const issue = await db.dataQualityIssue.findFirstOrThrow({ where: { ruleCode: "LOCATION_MISMATCH", status: "OPEN" }, include: { property: true } });
    const p = issue.property;
    await updateProperty(p.id, {
      referenceCode: p.referenceCode, name: p.name ?? "Fixed", address: p.address ?? "Calle", municipality: p.municipality!, department: "La Libertad",
      propertyType: p.propertyType!, cadastralId: p.cadastralId, landAreaM2: p.landAreaM2?.toFixed(2) ?? null, buildingAreaM2: p.buildingAreaM2?.toFixed(2) ?? null,
      askingPriceUsd: p.askingPriceUsd?.toFixed(2) ?? null, description: p.description, zoning: p.zoning, verificationStatus: p.verificationStatus, sourceUpdatedAt: p.sourceUpdatedAt,
    });
    const after = await db.dataQualityIssue.findUniqueOrThrow({ where: { id: issue.id }, include: { reviewEvents: true } });
    expect(after.status).toBe("RESOLVED");
    expect(after.reviewEvents.at(-1)).toMatchObject({ actor: "system", fromStatus: "OPEN", toStatus: "RESOLVED" });
    // The original imported row is untouched.
    const row = await db.importRow.findUniqueOrThrow({ where: { propertyId: p.id } });
    expect(Object.values(row.rawData as Record<string, string>)).toContain("San Salvador");
  });

  it("keeps dismissed issues dismissed across re-runs and records every review", async () => {
    const db = getDb();
    const outlier = await db.dataQualityIssue.findFirstOrThrow({ where: { ruleCode: "PRICE_PER_M2_OUTLIER", status: "OPEN" } });
    await reviewIssue(outlier.id, "DISMISSED", "Confirmed with broker: premium finishes.");
    await expect(reviewIssue(outlier.id, "DISMISSED", null)).rejects.toThrow(IssueTransitionError);
    await runAnalysis("MANUAL");
    const after = await db.dataQualityIssue.findUniqueOrThrow({ where: { id: outlier.id }, include: { reviewEvents: true } });
    expect(after.status).toBe("DISMISSED");
    expect(after.reviewEvents).toHaveLength(1);
    expect(after.reviewEvents[0].note).toMatch(/premium finishes/);
  });

  it("reopens a manually resolved issue that is still detected", async () => {
    const db = getDb();
    const dup = await db.dataQualityIssue.findFirstOrThrow({ where: { ruleCode: "DUPLICATE_IDENTIFIER", status: "OPEN" } });
    await reviewIssue(dup.id, "RESOLVED", "Thought it was fixed");
    const summary = await runAnalysis("MANUAL");
    expect(summary.issuesReopened).toBe(1);
    expect((await db.dataQualityIssue.findUniqueOrThrow({ where: { id: dup.id } })).status).toBe("OPEN");
  });

  it("computes dashboard metrics and per-type statistics from the data", async () => {
    const d = await getDashboard();
    expect(d.totals.properties).toBe(116);
    expect(d.totals.synthetic).toBe(116);
    expect(d.totals.duplicateProperties).toBeGreaterThan(0);
    const stats = await getTypeStats({ type: "COMMERCIAL_LAND" });
    expect(stats).toHaveLength(1);
    expect(Number(stats[0].medianPricePerM2)).toBeGreaterThan(0);
  });

  it("reports missing information that limits comparison", async () => {
    const db = getDb();
    const office = await db.property.findFirstOrThrow({ where: { propertyType: "OFFICE", buildingAreaM2: null } });
    const land = await db.property.findFirstOrThrow({ where: { propertyType: "COMMERCIAL_LAND", pricePerM2Usd: { not: null } } });
    const { gaps, notes } = await getComparison([office.id, land.id]);
    expect(gaps[0].missing).toContain("Building area");
    expect(notes.join(" ")).toMatch(/mixes property types/);
  });
});
