import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { getDb } from "@/lib/db";
import { runAnalysis, type AnalysisSummary } from "@/lib/quality/engine";
import type { PropertyFormValues, PropertyListQuery } from "@/lib/validation/property";
import { toPropertyDTO } from "./dto";
import { deriveFields } from "./property-write";

export function propertyWhere(query: Partial<PropertyListQuery>): Prisma.PropertyWhereInput {
  const where: Prisma.PropertyWhereInput = {};
  const and: Prisma.PropertyWhereInput[] = [];
  if (query.q) {
    const q = query.q;
    and.push({
      OR: [
        { name: { contains: q, mode: "insensitive" } },
        { address: { contains: q, mode: "insensitive" } },
        { referenceCode: { contains: q, mode: "insensitive" } },
        { cadastralId: { contains: q, mode: "insensitive" } },
      ],
    });
  }
  if (query.municipality) and.push({ municipality: { equals: query.municipality, mode: "insensitive" } });
  if (query.department) and.push({ department: { equals: query.department, mode: "insensitive" } });
  if (query.type) and.push({ propertyType: query.type });
  if (query.verification === "MISSING") and.push({ verificationStatus: null });
  else if (query.verification) and.push({ verificationStatus: query.verification });
  if (query.issues === "open") and.push({ issues: { some: { status: "OPEN" } } });
  if (query.issues === "none") and.push({ issues: { none: { status: "OPEN" } } });
  if (and.length > 0) where.AND = and;
  return where;
}

function propertyOrder(sort: PropertyListQuery["sort"]): Prisma.PropertyOrderByWithRelationInput[] {
  switch (sort) {
    case "name": return [{ name: { sort: "asc", nulls: "last" } }];
    case "price": return [{ askingPriceUsd: { sort: "asc", nulls: "last" } }];
    case "priceDesc": return [{ askingPriceUsd: { sort: "desc", nulls: "last" } }];
    case "pricePerM2": return [{ pricePerM2Usd: { sort: "asc", nulls: "last" } }];
    case "pricePerM2Desc": return [{ pricePerM2Usd: { sort: "desc", nulls: "last" } }];
    case "area": return [{ landAreaM2: { sort: "desc", nulls: "last" } }];
    case "issues": return [{ issues: { _count: "desc" } }];
    default: return [{ updatedAt: "desc" }];
  }
}

export async function listProperties(query: PropertyListQuery) {
  const db = getDb();
  const where = propertyWhere(query);
  const [rows, total] = await Promise.all([
    db.property.findMany({
      where,
      orderBy: [...propertyOrder(query.sort), { id: "asc" }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: { _count: { select: { issues: { where: { status: "OPEN" } } } } },
    }),
    db.property.count({ where }),
  ]);
  return {
    items: rows.map((r) => ({ ...toPropertyDTO(r), openIssues: r._count.issues })),
    total,
    page: query.page,
    pageSize: query.pageSize,
    pageCount: Math.max(1, Math.ceil(total / query.pageSize)),
  };
}

/** Distinct locations present in the data, for filter dropdowns. */
export async function getLocationFacets() {
  const db = getDb();
  const [municipalities, departments] = await Promise.all([
    db.property.findMany({ where: { municipality: { not: null } }, distinct: ["municipality"], select: { municipality: true }, orderBy: { municipality: "asc" } }),
    db.property.findMany({ where: { department: { not: null } }, distinct: ["department"], select: { department: true }, orderBy: { department: "asc" } }),
  ]);
  return {
    municipalities: municipalities.map((m) => m.municipality!),
    departments: departments.map((d) => d.department!),
  };
}

export async function getPropertyDetail(id: string) {
  const db = getDb();
  const property = await db.property.findUnique({
    where: { id },
    include: {
      import: { select: { id: true, fileName: true, createdAt: true, headers: true } },
      importRow: { select: { rowNumber: true, rawData: true, status: true, messages: true } },
      issues: {
        orderBy: [{ status: "asc" }, { severity: "desc" }, { detectedAt: "desc" }],
        include: { relatedProperty: { select: { id: true, referenceCode: true, name: true } } },
      },
      relatedIssues: {
        where: { status: "OPEN" },
        include: { property: { select: { id: true, referenceCode: true, name: true } } },
      },
      documents: {
        select: { id: true, fileName: true, sizeBytes: true, pageCount: true, status: true, summary: true, createdAt: true, analyzedAt: true, errorMessage: true },
        orderBy: { createdAt: "desc" },
      },
    },
  });
  if (!property) return null;
  const { import: imp, importRow, issues, relatedIssues, documents, ...rest } = property;
  return {
    property: toPropertyDTO(rest),
    import: imp ? { id: imp.id, fileName: imp.fileName, createdAt: imp.createdAt.toISOString() } : null,
    importRow: importRow
      ? {
          rowNumber: importRow.rowNumber,
          status: importRow.status,
          rawData: orderedRaw(importRow.rawData as Record<string, string>, imp?.headers),
          messages: (importRow.messages ?? []) as Array<{ code: string; message: string; field?: string }>,
        }
      : null,
    issues: issues.map((i) => ({
      id: i.id, ruleCode: i.ruleCode, category: i.category, severity: i.severity, status: i.status, field: i.field,
      observedValue: i.observedValue, expectedValue: i.expectedValue, explanation: i.explanation, recommendation: i.recommendation,
      detectedAt: i.detectedAt.toISOString(), relatedProperty: i.relatedProperty,
    })),
    relatedIssues: relatedIssues.map((i) => ({ id: i.id, ruleCode: i.ruleCode, severity: i.severity, field: i.field, property: i.property })),
    documents: documents.map((d) => ({ ...d, createdAt: d.createdAt.toISOString(), analyzedAt: d.analyzedAt?.toISOString() ?? null })),
  };
}

export type PropertyDetail = NonNullable<Awaited<ReturnType<typeof getPropertyDetail>>>;

/** jsonb does not preserve key order; restore the file's column order for display. */
export function orderedRaw(raw: Record<string, string>, headers: string[] | undefined): Array<[string, string]> {
  const keys = headers?.length ? [...headers.filter((h) => h in raw), ...Object.keys(raw).filter((k) => !headers.includes(k))] : Object.keys(raw);
  return keys.map((k) => [k, raw[k]]);
}

export async function createProperty(values: PropertyFormValues): Promise<{ id: string; analysis: AnalysisSummary | null }> {
  const db = getDb();
  const rawPropertyType = values.propertyType;
  const created = await db.property.create({
    data: { ...values, rawPropertyType, ...deriveFields({ ...values }), source: "MANUAL", isSynthetic: false },
  });
  return { id: created.id, analysis: await runAnalysisSafely() };
}

export async function updateProperty(id: string, values: PropertyFormValues): Promise<{ analysis: AnalysisSummary | null }> {
  const db = getDb();
  await db.property.update({
    where: { id },
    data: { ...values, rawPropertyType: values.propertyType, ...deriveFields({ ...values }) },
  });
  return { analysis: await runAnalysisSafely() };
}

/** Edits must succeed even if re-analysis fails; the next run will catch up. */
async function runAnalysisSafely(): Promise<AnalysisSummary | null> {
  try {
    return await runAnalysis("PROPERTY_EDIT");
  } catch (error) {
    console.error("Re-analysis after property edit failed", error);
    return null;
  }
}
