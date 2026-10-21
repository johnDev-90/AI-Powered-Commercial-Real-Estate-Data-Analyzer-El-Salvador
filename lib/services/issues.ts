import "server-only";
import type { IssueStatus, Prisma } from "@/lib/generated/prisma/client";
import { getDb, withTransaction } from "@/lib/db";
import type { IssueListQuery } from "@/lib/validation/issues";

export function issueWhere(q: Partial<IssueListQuery>): Prisma.DataQualityIssueWhereInput {
  const and: Prisma.DataQualityIssueWhereInput[] = [];
  if (q.status && q.status !== "ALL") and.push({ status: q.status });
  if (q.severity) and.push({ severity: q.severity });
  if (q.category) and.push({ category: q.category });
  if (q.rule) and.push({ ruleCode: q.rule });
  if (q.property) and.push({ propertyId: q.property });
  if (q.municipality) and.push({ property: { municipality: { equals: q.municipality, mode: "insensitive" } } });
  if (q.q) {
    and.push({
      OR: [
        { property: { referenceCode: { contains: q.q, mode: "insensitive" } } },
        { property: { name: { contains: q.q, mode: "insensitive" } } },
        { explanation: { contains: q.q, mode: "insensitive" } },
      ],
    });
  }
  return and.length > 0 ? { AND: and } : {};
}

const issueInclude = {
  property: { select: { id: true, referenceCode: true, name: true, municipality: true, department: true, isSynthetic: true } },
  relatedProperty: { select: { id: true, referenceCode: true, name: true } },
  document: { select: { id: true, fileName: true } },
} satisfies Prisma.DataQualityIssueInclude;

type IssueWithRefs = Prisma.DataQualityIssueGetPayload<{ include: typeof issueInclude }>;

function toIssueDTO(i: IssueWithRefs) {
  return {
    id: i.id,
    ruleCode: i.ruleCode,
    category: i.category,
    severity: i.severity,
    status: i.status,
    field: i.field,
    observedValue: i.observedValue,
    expectedValue: i.expectedValue,
    explanation: i.explanation,
    recommendation: i.recommendation,
    detectedAt: i.detectedAt.toISOString(),
    lastDetectedAt: i.lastDetectedAt.toISOString(),
    property: i.property,
    relatedProperty: i.relatedProperty,
    document: i.document,
  };
}

export type IssueDTO = ReturnType<typeof toIssueDTO>;

const SEVERITY_ORDER: Prisma.DataQualityIssueOrderByWithRelationInput[] = [{ severity: "desc" }, { detectedAt: "desc" }, { id: "asc" }];

export async function listIssues(q: IssueListQuery) {
  const db = getDb();
  const where = issueWhere(q);
  const [rows, total, bySeverity] = await Promise.all([
    db.dataQualityIssue.findMany({ where, include: issueInclude, orderBy: SEVERITY_ORDER, skip: (q.page - 1) * q.pageSize, take: q.pageSize }),
    db.dataQualityIssue.count({ where }),
    db.dataQualityIssue.groupBy({ by: ["severity"], where, _count: true }),
  ]);
  return {
    items: rows.map(toIssueDTO),
    total,
    page: q.page,
    pageSize: q.pageSize,
    pageCount: Math.max(1, Math.ceil(total / q.pageSize)),
    severityCounts: Object.fromEntries(bySeverity.map((s) => [s.severity, s._count])) as Partial<Record<"HIGH" | "MEDIUM" | "LOW", number>>,
  };
}

export async function listIssuesForExport(q: Partial<IssueListQuery>, limit = 10_000) {
  const rows = await getDb().dataQualityIssue.findMany({ where: issueWhere(q), include: issueInclude, orderBy: SEVERITY_ORDER, take: limit });
  return rows.map(toIssueDTO);
}

export async function getIssue(id: string) {
  const issue = await getDb().dataQualityIssue.findUnique({
    where: { id },
    include: { ...issueInclude, reviewEvents: { orderBy: { createdAt: "asc" } }, firstRun: { select: { id: true, startedAt: true, trigger: true } } },
  });
  if (!issue) return null;
  return {
    ...toIssueDTO(issue),
    firstRun: issue.firstRun ? { ...issue.firstRun, startedAt: issue.firstRun.startedAt.toISOString() } : null,
    events: issue.reviewEvents.map((e) => ({ ...e, createdAt: e.createdAt.toISOString() })),
  };
}

export class IssueTransitionError extends Error {}

/** Change review status and record the transition. The property record is never modified. */
export async function reviewIssue(issueId: string, status: IssueStatus, note: string | null): Promise<void> {
  await withTransaction(async (tx) => {
    const issue = await tx.dataQualityIssue.findUnique({ where: { id: issueId }, select: { status: true } });
    if (!issue) throw new IssueTransitionError("Issue not found.");
    if (issue.status === status) throw new IssueTransitionError(`Issue is already ${status.toLowerCase()}.`);
    await tx.dataQualityIssue.update({ where: { id: issueId }, data: { status } });
    await tx.issueReviewEvent.create({ data: { issueId, fromStatus: issue.status, toStatus: status, note, actor: "user" } });
  });
}
