import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import type { PropertyType } from "@/lib/generated/prisma/enums";
import { getDb } from "@/lib/db";
import type { PropertyListQuery } from "@/lib/validation/property";

/** Builds a SQL WHERE fragment equivalent to the property list filters (parameterized). */
function sqlFilters(f: Partial<PropertyListQuery>): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`TRUE`];
  if (f.q) {
    const like = `%${f.q}%`;
    parts.push(Prisma.sql`(p."name" ILIKE ${like} OR p."address" ILIKE ${like} OR p."referenceCode" ILIKE ${like} OR p."cadastralId" ILIKE ${like})`);
  }
  if (f.municipality) parts.push(Prisma.sql`lower(p."municipality") = lower(${f.municipality})`);
  if (f.department) parts.push(Prisma.sql`lower(p."department") = lower(${f.department})`);
  if (f.type) parts.push(Prisma.sql`p."propertyType" = ${f.type}::"PropertyType"`);
  if (f.verification === "MISSING") parts.push(Prisma.sql`p."verificationStatus" IS NULL`);
  else if (f.verification) parts.push(Prisma.sql`p."verificationStatus" = ${f.verification}::"VerificationStatus"`);
  if (f.issues === "open") parts.push(Prisma.sql`EXISTS (SELECT 1 FROM "DataQualityIssue" i WHERE i."propertyId" = p."id" AND i."status" = 'OPEN')`);
  if (f.issues === "none") parts.push(Prisma.sql`NOT EXISTS (SELECT 1 FROM "DataQualityIssue" i WHERE i."propertyId" = p."id" AND i."status" = 'OPEN')`);
  return Prisma.join(parts, " AND ");
}

export interface TypeStats {
  propertyType: PropertyType;
  count: number;
  withPricePerM2: number;
  avgPricePerM2: string | null;
  medianPricePerM2: string | null;
  minPricePerM2: string | null;
  maxPricePerM2: string | null;
  avgAskingPrice: string | null;
}

/** Asking price per m² statistics by property type (never mixed across types). */
export async function getTypeStats(filters: Partial<PropertyListQuery> = {}): Promise<TypeStats[]> {
  const rows = await getDb().$queryRaw<Array<Omit<TypeStats, "count" | "withPricePerM2"> & { count: number; withPricePerM2: number }>>`
    SELECT p."propertyType"::text AS "propertyType",
           count(*)::int AS "count",
           count(p."pricePerM2Usd")::int AS "withPricePerM2",
           round(avg(p."pricePerM2Usd"), 2)::text AS "avgPricePerM2",
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY p."pricePerM2Usd")::numeric, 2)::text AS "medianPricePerM2",
           min(p."pricePerM2Usd")::text AS "minPricePerM2",
           max(p."pricePerM2Usd")::text AS "maxPricePerM2",
           round(avg(p."askingPriceUsd"), 2)::text AS "avgAskingPrice"
    FROM "Property" p
    WHERE p."propertyType" IS NOT NULL AND ${sqlFilters(filters)}
    GROUP BY p."propertyType"
    ORDER BY count(*) DESC`;
  return rows;
}

export async function getMunicipalityStats(filters: Partial<PropertyListQuery> = {}, limit = 12) {
  return getDb().$queryRaw<Array<{ municipality: string; department: string | null; count: number; medianPricePerM2: string | null; openIssues: number }>>`
    SELECT COALESCE(p."municipality", '(missing)') AS "municipality",
           mode() WITHIN GROUP (ORDER BY p."department") AS "department",
           count(*)::int AS "count",
           round(percentile_cont(0.5) WITHIN GROUP (ORDER BY p."pricePerM2Usd")::numeric, 2)::text AS "medianPricePerM2",
           (SELECT count(*)::int FROM "DataQualityIssue" i JOIN "Property" q ON q."id" = i."propertyId"
             WHERE i."status" = 'OPEN' AND q."municipality" IS NOT DISTINCT FROM p."municipality") AS "openIssues"
    FROM "Property" p
    WHERE ${sqlFilters(filters)}
    GROUP BY p."municipality"
    ORDER BY count(*) DESC
    LIMIT ${limit}`;
}

/** Share of records missing the inputs needed for a reliable comparison. */
export async function getCompleteness(filters: Partial<PropertyListQuery> = {}) {
  const [row] = await getDb().$queryRaw<Array<Record<string, number>>>`
    SELECT count(*)::int AS "total",
           count(*) FILTER (WHERE p."askingPriceUsd" IS NULL)::int AS "missingPrice",
           count(*) FILTER (WHERE p."landAreaM2" IS NULL AND p."buildingAreaM2" IS NULL)::int AS "missingArea",
           count(*) FILTER (WHERE p."pricePerM2Usd" IS NULL)::int AS "noPricePerM2",
           count(*) FILTER (WHERE p."verificationStatus" IS NULL)::int AS "missingVerification",
           count(*) FILTER (WHERE p."cadastralId" IS NULL)::int AS "missingCadastral",
           count(*) FILTER (WHERE p."zoning" IS NULL)::int AS "missingZoning",
           count(*) FILTER (WHERE p."propertyType" IS NULL)::int AS "missingType"
    FROM "Property" p
    WHERE ${sqlFilters(filters)}`;
  return row as {
    total: number; missingPrice: number; missingArea: number; noPricePerM2: number; missingVerification: number;
    missingCadastral: number; missingZoning: number; missingType: number;
  };
}

export async function getDashboard() {
  const db = getDb();
  const [totals] = await db.$queryRaw<Array<Record<string, number>>>`
    SELECT
      (SELECT count(*)::int FROM "Property") AS "properties",
      (SELECT count(*)::int FROM "Property" WHERE "isSynthetic") AS "synthetic",
      (SELECT count(*)::int FROM "DataQualityIssue" WHERE "status" = 'OPEN') AS "openIssues",
      (SELECT count(DISTINCT x.id)::int FROM (
         SELECT "propertyId" AS id FROM "DataQualityIssue" WHERE "status" = 'OPEN' AND "ruleCode" IN ('DUPLICATE_IDENTIFIER', 'POTENTIAL_DUPLICATE')
         UNION SELECT "relatedPropertyId" FROM "DataQualityIssue" WHERE "status" = 'OPEN' AND "ruleCode" IN ('DUPLICATE_IDENTIFIER', 'POTENTIAL_DUPLICATE') AND "relatedPropertyId" IS NOT NULL
      ) x) AS "duplicateProperties",
      (SELECT count(*)::int FROM "DataQualityIssue" WHERE "status" = 'OPEN' AND "category" IN ('COMPLETENESS', 'VALIDITY')) AS "missingOrInvalid",
      (SELECT count(DISTINCT p."id")::int FROM "Property" p
        WHERE p."verificationStatus" = 'PENDING_REVIEW'
           OR EXISTS (SELECT 1 FROM "DataQualityIssue" i WHERE i."propertyId" = p."id" AND i."status" = 'OPEN' AND i."severity" IN ('HIGH', 'MEDIUM'))) AS "needsReview"`;

  const [severity, categories, imports, runs, typeStats, municipalities] = await Promise.all([
    db.dataQualityIssue.groupBy({ by: ["severity"], where: { status: "OPEN" }, _count: true }),
    db.dataQualityIssue.groupBy({ by: ["category"], where: { status: "OPEN" }, _count: true, orderBy: { _count: { category: "desc" } } }),
    db.dataImport.findMany({ orderBy: { createdAt: "desc" }, take: 5, select: { id: true, fileName: true, status: true, totalRows: true, acceptedRows: true, flaggedRows: true, rejectedRows: true, createdAt: true, isSynthetic: true } }),
    db.analysisRun.findMany({ orderBy: { startedAt: "desc" }, take: 5, select: { id: true, trigger: true, status: true, issuesDetected: true, issuesNew: true, issuesAutoResolved: true, issuesReopened: true, startedAt: true, propertiesScanned: true } }),
    getTypeStats(),
    getMunicipalityStats({}, 8),
  ]);

  return {
    totals: totals as { properties: number; synthetic: number; openIssues: number; duplicateProperties: number; missingOrInvalid: number; needsReview: number },
    severity: Object.fromEntries(severity.map((s) => [s.severity, s._count])) as Partial<Record<"HIGH" | "MEDIUM" | "LOW", number>>,
    categories: categories.map((c) => ({ category: c.category, count: c._count })),
    imports: imports.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() })),
    runs: runs.map((r) => ({ ...r, startedAt: r.startedAt.toISOString() })),
    typeStats,
    municipalities,
  };
}
