import "server-only";
import { z } from "zod";
import { getDb } from "@/lib/db";
import { toPropertyDTO, type PropertyDTO } from "./dto";

export const MAX_COMPARE = 6;

export const compareIdsSchema = z
  .string()
  .max(1000)
  .transform((v) => [...new Set(v.split(",").map((s) => s.trim()).filter(Boolean))].slice(0, MAX_COMPARE));

export interface ComparisonGap {
  propertyId: string;
  missing: string[];
}

/** Properties for side-by-side comparison plus the gaps that limit comparison quality. */
export async function getComparison(ids: string[]) {
  if (ids.length === 0) return { properties: [] as Array<PropertyDTO & { openIssues: number }>, gaps: [] as ComparisonGap[], notes: [] as string[] };
  const rows = await getDb().property.findMany({
    where: { id: { in: ids } },
    include: { _count: { select: { issues: { where: { status: "OPEN" } } } } },
  });
  const order = new Map(ids.map((id, i) => [id, i]));
  const properties = rows
    .sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0))
    .map((r) => ({ ...toPropertyDTO(r), openIssues: r._count.issues }));

  const gaps = properties.map((p) => ({
    propertyId: p.id,
    missing: [
      !p.propertyType && "Property type",
      !p.askingPriceUsd && "Asking price",
      !p.landAreaM2 && "Land area",
      p.propertyType && p.propertyType !== "COMMERCIAL_LAND" && !p.buildingAreaM2 && "Building area",
      !p.pricePerM2Usd && "Price per m² (cannot be calculated)",
      !p.verificationStatus && "Verification status",
      p.openIssues > 0 && `${p.openIssues} open data quality issue(s)`,
    ].filter((x): x is string => Boolean(x)),
  }));

  const notes: string[] = [];
  const types = new Set(properties.map((p) => p.propertyType).filter(Boolean));
  if (types.size > 1) notes.push("The selection mixes property types. Price per m² for land uses land area and for built properties uses building area, so those values are not directly comparable.");
  const bases = new Set(properties.map((p) => p.pricePerM2Basis).filter(Boolean));
  if (bases.size > 1) notes.push("Price per m² values use different area bases (land vs building).");
  if (properties.some((p) => p.verificationStatus !== "VERIFIED")) notes.push("Some records are not marked as verified; values come from listing sources.");
  if (properties.some((p) => p.isSynthetic)) notes.push("The selection includes synthetic demo records.");
  return { properties, gaps, notes };
}
