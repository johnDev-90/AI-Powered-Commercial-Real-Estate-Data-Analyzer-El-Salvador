import type { Db } from "@/lib/db";

/**
 * Cross-record rules implemented in SQL. These return candidates; the engine turns
 * them into issues. Column names are the Prisma field names (no @map in the schema).
 */

export interface PairRow {
  olderId: string;
  newerId: string;
}

/** Records sharing the same Property ID. Pairs are ordered (older, newer). */
export async function findDuplicateIdentifierPairs(db: Db): Promise<Array<PairRow & { referenceCode: string }>> {
  return db.$queryRaw<Array<PairRow & { referenceCode: string }>>`
    SELECT a."id" AS "olderId", b."id" AS "newerId", a."referenceCode" AS "referenceCode"
    FROM "Property" a
    JOIN "Property" b
      ON a."referenceCode" = b."referenceCode"
     AND (a."createdAt", a."id") < (b."createdAt", b."id")
    WHERE a."referenceCode" IS NOT NULL
    ORDER BY a."referenceCode", b."createdAt"`;
}

/** Records that refer to the same property: same Property ID or same cadastral ID. */
export async function findSamePropertyPairs(db: Db): Promise<Array<PairRow & { matchedBy: "referenceCode" | "cadastralId" }>> {
  return db.$queryRaw<Array<PairRow & { matchedBy: "referenceCode" | "cadastralId" }>>`
    SELECT a."id" AS "olderId", b."id" AS "newerId",
           CASE WHEN a."referenceCode" = b."referenceCode" THEN 'referenceCode' ELSE 'cadastralId' END AS "matchedBy"
    FROM "Property" a
    JOIN "Property" b
      ON (a."createdAt", a."id") < (b."createdAt", b."id")
     AND (
          (a."referenceCode" IS NOT NULL AND a."referenceCode" = b."referenceCode")
       OR (a."cadastralId" IS NOT NULL AND a."cadastralId" = b."cadastralId")
     )`;
}

export interface PotentialDuplicateRow extends PairRow {
  similarity: number;
  matchedBy: "cadastralId" | "exactAddress" | "similarAddress";
}

/**
 * Different Property IDs that look like the same property: same cadastral ID, or the
 * same/similar normalized address within the same municipality (pg_trgm similarity).
 */
export async function findPotentialDuplicatePairs(db: Db, minSimilarity = 0.75): Promise<PotentialDuplicateRow[]> {
  return db.$queryRaw<PotentialDuplicateRow[]>`
    SELECT a."id" AS "olderId", b."id" AS "newerId",
           COALESCE(similarity(a."normalizedAddress", b."normalizedAddress"), 0)::float8 AS "similarity",
           CASE
             WHEN a."cadastralId" IS NOT NULL AND a."cadastralId" = b."cadastralId" THEN 'cadastralId'
             WHEN a."normalizedAddress" = b."normalizedAddress" THEN 'exactAddress'
             ELSE 'similarAddress'
           END AS "matchedBy"
    FROM "Property" a
    JOIN "Property" b
      ON (a."createdAt", a."id") < (b."createdAt", b."id")
    WHERE (a."referenceCode" IS NULL OR b."referenceCode" IS NULL OR a."referenceCode" <> b."referenceCode")
      AND (
            (a."cadastralId" IS NOT NULL AND a."cadastralId" = b."cadastralId")
         OR (
              a."normalizedAddress" IS NOT NULL AND b."normalizedAddress" IS NOT NULL
              AND lower(a."municipality") = lower(b."municipality")
              AND (a."normalizedAddress" = b."normalizedAddress"
                   OR (similarity(a."normalizedAddress", b."normalizedAddress") >= ${minSimilarity}
                       -- same street but a different number (or km marker) is a different property
                       AND trim(regexp_replace(a."normalizedAddress", '[^0-9]+', ' ', 'g'))
                         = trim(regexp_replace(b."normalizedAddress", '[^0-9]+', ' ', 'g'))))
            )
      )`;
}

export interface OutlierRow {
  id: string;
  pricePerM2: number;
  median: number;
  mad: number;
  groupSize: number;
  scope: "municipality" | "department";
  robustZ: number;
}

/**
 * Asking price per m² outliers using a robust z-score (median / MAD) on the log of
 * price per m² (prices are multiplicative). Each property is compared with listings of
 * the same type in its municipality, or in its department when the municipality has
 * fewer than `minGroup` comparable records. There is no country-wide fallback: mixing
 * markets would flag ordinary regional price differences.
 */
export async function findPricePerM2Outliers(db: Db, threshold = 3.5, minGroup = 5): Promise<OutlierRow[]> {
  return db.$queryRaw<OutlierRow[]>`
    WITH base AS (
      SELECT "id", "propertyType"::text AS t,
             lower(COALESCE("municipality", '')) AS m, lower(COALESCE("department", '')) AS d,
             ln("pricePerM2Usd"::float8) AS p
      FROM "Property"
      WHERE "pricePerM2Usd" > 0 AND "propertyType" IS NOT NULL
    ),
    keyed AS (
      SELECT "id", t, p, 'municipality' AS lvl, m AS k FROM base WHERE m <> ''
      UNION ALL
      SELECT "id", t, p, 'department' AS lvl, d AS k FROM base WHERE d <> ''
    ),
    med AS (
      SELECT lvl, t, k, count(*)::int AS n, percentile_cont(0.5) WITHIN GROUP (ORDER BY p) AS med
      FROM keyed GROUP BY lvl, t, k
    ),
    stats AS (
      SELECT x.lvl, x.t, x.k, s.n, s.med,
             percentile_cont(0.5) WITHIN GROUP (ORDER BY abs(x.p - s.med)) AS mad
      FROM keyed x JOIN med s ON s.lvl = x.lvl AND s.t = x.t AND s.k = x.k
      GROUP BY x.lvl, x.t, x.k, s.n, s.med
    ),
    chosen AS (
      SELECT DISTINCT ON (x."id") x."id", x.p, s.med, s.mad, s.n, s.lvl
      FROM keyed x
      JOIN stats s ON s.lvl = x.lvl AND s.t = x.t AND s.k = x.k
      WHERE s.n >= ${minGroup} AND s.mad > 0
      ORDER BY x."id", CASE s.lvl WHEN 'municipality' THEN 0 ELSE 1 END
    )
    SELECT "id", exp(p) AS "pricePerM2", exp(med) AS "median", mad AS "mad", n AS "groupSize", lvl AS "scope",
           (0.6745 * (p - med) / mad)::float8 AS "robustZ"
    FROM chosen
    WHERE abs(0.6745 * (p - med) / mad) > ${threshold}`;
}
