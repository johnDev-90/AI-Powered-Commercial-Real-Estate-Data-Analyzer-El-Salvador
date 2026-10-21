import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { IssueReviewForm } from "@/components/action-forms";
import { SparkIcon } from "@/components/icons";
import { ButtonLink, Card, DefinitionList, IssueStatusBadge, PageHeader, SeverityBadge, SyntheticBadge, TableSkeleton, Td, Th } from "@/components/ui";
import { CATEGORY_LABELS, FIELD_LABELS, PROPERTY_TYPE_LABELS, STATUS_LABELS } from "@/lib/domain/labels";
import { getDb } from "@/lib/db";
import { formatArea, formatDateTime, formatUsd } from "@/lib/format";
import { ruleLabel } from "@/lib/quality/rule-codes";
import { toPropertyDTO, type PropertyDTO } from "@/lib/services/dto";
import { getIssue } from "@/lib/services/issues";
import { orderedRaw } from "@/lib/services/properties";

export const metadata: Metadata = { title: "Issue" };

export default function IssuePage({ params }: PageProps<"/issues/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <IssueContent params={params} />
    </Suspense>
  );
}

const COMPARE_ROWS: Array<{ field: keyof PropertyDTO; label: string; render?: (p: PropertyDTO) => string }> = [
  { field: "referenceCode", label: FIELD_LABELS.referenceCode },
  { field: "name", label: FIELD_LABELS.name },
  { field: "address", label: FIELD_LABELS.address },
  { field: "municipality", label: FIELD_LABELS.municipality },
  { field: "department", label: FIELD_LABELS.department },
  { field: "propertyType", label: FIELD_LABELS.propertyType, render: (p) => (p.propertyType ? PROPERTY_TYPE_LABELS[p.propertyType] : p.rawPropertyType ?? "—") },
  { field: "cadastralId", label: FIELD_LABELS.cadastralId },
  { field: "landAreaM2", label: FIELD_LABELS.landAreaM2, render: (p) => formatArea(p.landAreaM2) },
  { field: "buildingAreaM2", label: FIELD_LABELS.buildingAreaM2, render: (p) => formatArea(p.buildingAreaM2) },
  { field: "askingPriceUsd", label: FIELD_LABELS.askingPriceUsd, render: (p) => formatUsd(p.askingPriceUsd) },
  { field: "verificationStatus", label: FIELD_LABELS.verificationStatus, render: (p) => p.verificationStatus ?? "Not recorded" },
];

async function IssueContent({ params }: { params: PageProps<"/issues/[id]">["params"] }) {
  const { id } = await params;
  const issue = await getIssue(id);
  if (!issue) notFound();
  const db = getDb();
  const [property, related, importRow] = await Promise.all([
    db.property.findUnique({ where: { id: issue.property.id } }),
    issue.relatedProperty ? db.property.findUnique({ where: { id: issue.relatedProperty.id } }) : null,
    db.importRow.findUnique({ where: { propertyId: issue.property.id }, select: { rowNumber: true, rawData: true, import: { select: { id: true, fileName: true, headers: true } } } }),
  ]);
  const p = property ? toPropertyDTO(property) : null;
  const r = related ? toPropertyDTO(related) : null;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/issues" className="hover:underline">← Data quality</Link>}
        title={ruleLabel(issue.ruleCode)}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <SeverityBadge severity={issue.severity} />
            <span>·</span>
            <span>{CATEGORY_LABELS[issue.category]}</span>
            <span>·</span>
            <IssueStatusBadge status={issue.status} />
            {issue.property.isSynthetic && <SyntheticBadge />}
          </span>
        }
        actions={<ButtonLink href={`/investigate?issue=${issue.id}`}><SparkIcon />Ask AI to explain</ButtonLink>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Finding">
            <p className="text-sm text-ink">{issue.explanation}</p>
            <div className="mt-4">
              <DefinitionList
                items={[
                  { label: "Property", value: <Link href={`/properties/${issue.property.id}`} className="text-accent-strong hover:underline">{issue.property.referenceCode ?? "no ID"} · {issue.property.name ?? "Unnamed"}</Link> },
                  { label: "Affected field", value: issue.field ? FIELD_LABELS[issue.field] ?? issue.field : "—" },
                  { label: "Observed value", value: issue.observedValue ?? "(empty)" },
                  { label: "Expected / reference", value: issue.expectedValue ?? "—" },
                  { label: "Detected", value: formatDateTime(issue.detectedAt), hint: `Last confirmed ${formatDateTime(issue.lastDetectedAt)}` },
                  { label: "Source", value: issue.document ? <Link href={`/documents/${issue.document.id}`} className="text-accent-strong hover:underline">Document: {issue.document.fileName}</Link> : `Rule ${issue.ruleCode}` },
                ]}
              />
            </div>
            <div className="mt-4 rounded-md bg-surface-2 p-3 text-sm">
              <div className="text-xs font-semibold text-ink-2">Recommended next step</div>
              <p className="mt-0.5 text-ink">{issue.recommendation}</p>
            </div>
          </Card>

          {p && (
            <Card title={r ? "Records side by side" : "Current record values"} description="Current values. Differences are highlighted.">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead>
                    <tr>
                      <Th>Field</Th>
                      <Th><Link href={`/properties/${p.id}`} className="hover:underline">This record</Link></Th>
                      {r && <Th><Link href={`/properties/${r.id}`} className="hover:underline">Related record</Link></Th>}
                    </tr>
                  </thead>
                  <tbody>
                    {COMPARE_ROWS.map((row) => {
                      const a = row.render ? row.render(p) : String(p[row.field] ?? "—");
                      const b = r ? (row.render ? row.render(r) : String(r[row.field] ?? "—")) : null;
                      const highlight = (r && a !== b) || row.field === issue.field;
                      return (
                        <tr key={row.field} className={highlight ? "bg-[#fdf6e3]" : undefined}>
                          <Td className="text-xs font-medium text-ink-2">{row.label}</Td>
                          <Td className="text-sm break-words">{a}</Td>
                          {r && <Td className="text-sm break-words">{b}</Td>}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}

          {importRow && (
            <Card title="Original source values" description={`Row ${importRow.rowNumber} of ${importRow.import.fileName}, exactly as imported.`}>
              <div className="flex flex-wrap gap-x-6 gap-y-2 text-xs">
                {orderedRaw(importRow.rawData as Record<string, string>, importRow.import.headers).map(([k, v]) => (
                  <div key={k}><span className="text-ink-3">{k}: </span><span className="text-ink">{v || "(empty)"}</span></div>
                ))}
              </div>
            </Card>
          )}
        </div>

        <div className="space-y-4">
          <Card title="Review" description="The property record is not modified by reviewing.">
            <IssueReviewForm issueId={issue.id} status={issue.status} />
          </Card>
          <Card title="History">
            <ol className="space-y-2 text-sm">
              <li className="text-xs text-ink-2">
                <span className="font-medium text-ink">Detected</span> · {formatDateTime(issue.detectedAt)}
                {issue.firstRun && <> · {issue.firstRun.trigger.toLowerCase().replace("_", " ")} run</>}
              </li>
              {issue.events.map((e) => (
                <li key={e.id} className="text-xs text-ink-2">
                  <span className="font-medium text-ink">{STATUS_LABELS[e.fromStatus]} → {STATUS_LABELS[e.toStatus]}</span> · {e.actor} · {formatDateTime(e.createdAt)}
                  {e.note && <p className="mt-0.5 text-ink">“{e.note}”</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
