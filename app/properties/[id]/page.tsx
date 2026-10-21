import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DocumentUpload } from "@/components/document-upload";
import { FileIcon, SparkIcon } from "@/components/icons";
import {
  Badge, ButtonLink, Card, DefinitionList, EmptyState, IssueStatusBadge, Notice, PageHeader, SeverityBadge,
  SyntheticBadge, TableSkeleton, Td, Th, VerificationBadge,
} from "@/components/ui";
import { FIELD_LABELS, PROPERTY_TYPE_LABELS } from "@/lib/domain/labels";
import { formatArea, formatDate, formatDateTime, formatUsd, formatUsdPerM2 } from "@/lib/format";
import { ruleLabel } from "@/lib/quality/rule-codes";
import { getPropertyDetail, type PropertyDetail } from "@/lib/services/properties";

export const metadata: Metadata = { title: "Property" };

export default function PropertyPage({ params, searchParams }: PageProps<"/properties/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton rows={12} />}>
      <PropertyContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function PropertyContent({ params, searchParams }: { params: PageProps<"/properties/[id]">["params"]; searchParams: PageProps<"/properties/[id]">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const detail = await getPropertyDetail(id);
  if (!detail) notFound();
  const { property: p, issues, relatedIssues, importRow, documents } = detail;
  const openIssues = issues.filter((i) => i.status === "OPEN");
  const fieldsWithIssues = new Set(openIssues.map((i) => i.field).filter(Boolean));
  const mark = (field: string, value: React.ReactNode) =>
    fieldsWithIssues.has(field) ? (
      <span className="inline-flex items-center gap-1.5">{value}<Badge tone="critical" title="This field has an open data quality issue">issue</Badge></span>
    ) : value;

  return (
    <>
      <PageHeader
        eyebrow={<Link href="/properties" className="hover:underline">← Properties</Link>}
        title={p.name ?? "Unnamed property"}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-ink">{p.referenceCode ?? "No property ID"}</span>
            <span>·</span>
            <span>{[p.municipality, p.department].filter(Boolean).join(", ") || "Location missing"}</span>
            {p.isSynthetic && <SyntheticBadge />}
            <VerificationBadge status={p.verificationStatus} />
          </span>
        }
        actions={
          <>
            <ButtonLink href={`/investigate?property=${p.id}`}><SparkIcon />Ask AI about this property</ButtonLink>
            <ButtonLink href={`/properties/${p.id}/edit`} variant="primary">Edit</ButtonLink>
          </>
        }
      />
      {sp.saved && <div className="mb-4"><Notice tone="success">Saved. The data quality analysis was re-run.</Notice></div>}

      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card title="Property data" description="Values as currently recorded. Asking prices are listing data, not transaction prices.">
            <DefinitionList
              items={[
                { label: "Property type", value: mark("propertyType", p.propertyType ? PROPERTY_TYPE_LABELS[p.propertyType] : p.rawPropertyType ? `${p.rawPropertyType} (unsupported)` : "—") },
                { label: "Address", value: mark("address", p.address ?? "—") },
                { label: "Municipality / district", value: mark("municipality", p.municipality ?? "—") },
                { label: "Department", value: mark("department", p.department ?? "—") },
                { label: "Asking price", value: mark("askingPriceUsd", formatUsd(p.askingPriceUsd, { cents: true })) },
                {
                  label: "Asking price per m²",
                  value: mark("pricePerM2Usd", formatUsdPerM2(p.pricePerM2Usd)),
                  hint: p.pricePerM2Basis ? `Based on ${p.pricePerM2Basis === "LAND" ? "land" : "building"} area` : "Cannot be calculated with the available data",
                },
                { label: "Land area", value: mark("landAreaM2", formatArea(p.landAreaM2)) },
                { label: "Building area", value: mark("buildingAreaM2", formatArea(p.buildingAreaM2)) },
                { label: "Cadastral / parcel ID", value: mark("cadastralId", p.cadastralId ?? "—"), hint: p.cadastralId ? "As provided by the source; not verified" : undefined },
                { label: "Zoning / land use", value: p.zoning ?? "—", hint: p.zoning ? "As provided by the source; not verified" : undefined },
                { label: "Source price per m²", value: mark("sourcePricePerM2", formatUsdPerM2(p.sourcePricePerM2)), hint: "As stated in the source file" },
                { label: "Last updated (source)", value: mark("sourceUpdatedAt", formatDate(p.sourceUpdatedAt)) },
              ]}
            />
            {p.description && (
              <div className="mt-4 border-t border-border pt-3">
                <div className="text-xs font-medium text-ink-3">Description</div>
                <p className="mt-1 text-sm whitespace-pre-line text-ink-2">{p.description}</p>
              </div>
            )}
          </Card>

          <IssuesCard issues={issues} relatedIssues={relatedIssues} propertyId={p.id} />

          <Card title="Documents" description="PDF documents associated with this property. Extracted information is compared with the record and never treated as officially verified.">
            {documents.length > 0 && (
              <ul className="mb-4 divide-y divide-border">
                {documents.map((d) => (
                  <li key={d.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileIcon className="shrink-0 text-ink-3" />
                      <Link href={`/documents/${d.id}`} className="truncate font-medium hover:underline">{d.fileName}</Link>
                    </div>
                    <div className="shrink-0 text-xs text-ink-3">
                      {d.pageCount ? `${d.pageCount} page${d.pageCount === 1 ? "" : "s"} · ` : ""}
                      {d.status === "ANALYZED" ? "analyzed" : d.status === "FAILED" ? "failed" : "text extracted"} · {formatDateTime(d.createdAt)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <DocumentUpload propertyId={p.id} />
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Provenance" description="Where this record came from.">
            <DefinitionList
              items={[
                { label: "Source", value: p.source === "MANUAL" ? "Entered manually" : p.source === "SEED" ? "Synthetic demo seed" : "CSV import" },
                {
                  label: "Import",
                  value: detail.import ? <Link href={`/imports/${detail.import.id}`} className="text-accent-strong hover:underline">{detail.import.fileName}</Link> : "—",
                  hint: importRow ? `Row ${importRow.rowNumber} · imported ${formatDateTime(detail.import?.createdAt)}` : undefined,
                },
                { label: "Record created", value: formatDateTime(p.createdAt) },
                { label: "Record updated", value: formatDateTime(p.updatedAt) },
              ]}
            />
          </Card>
          {importRow && (
            <Card title="Original source row" description="Verbatim values from the imported file. Never modified.">
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <tbody>
                    {importRow.rawData.map(([k, v]) => (
                      <tr key={k} className="border-b border-border last:border-0">
                        <th scope="row" className="py-1 pr-2 text-left align-top font-medium text-ink-3">{k}</th>
                        <td className="py-1 break-words text-ink">{v || <span className="text-ink-3">(empty)</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function IssuesCard({ issues, relatedIssues, propertyId }: { issues: PropertyDetail["issues"]; relatedIssues: PropertyDetail["relatedIssues"]; propertyId: string }) {
  return (
    <Card
      title={`Data quality issues (${issues.filter((i) => i.status === "OPEN").length} open)`}
      description="Detected by deterministic rules. Unusual values are flagged for review, not treated as errors."
      actions={<Link href={`/issues?property=${propertyId}&status=ALL`} className="text-xs text-accent-strong">View in issue manager</Link>}
    >
      {issues.length === 0 ? (
        <EmptyState title="No issues detected" description="All deterministic checks passed for this record." />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] border-collapse">
            <thead><tr><Th>Severity</Th><Th>Issue</Th><Th>Field</Th><Th>Observed</Th><Th>Status</Th></tr></thead>
            <tbody>
              {issues.map((i) => (
                <tr key={i.id}>
                  <Td><SeverityBadge severity={i.severity} /></Td>
                  <Td>
                    <Link href={`/issues/${i.id}`} className="font-medium hover:underline">{ruleLabel(i.ruleCode)}</Link>
                    <div className="mt-0.5 max-w-md text-xs text-ink-3">{i.explanation}</div>
                    {i.relatedProperty && (
                      <div className="mt-0.5 text-xs">Related: <Link href={`/properties/${i.relatedProperty.id}`} className="text-accent-strong hover:underline">{i.relatedProperty.referenceCode ?? i.relatedProperty.name}</Link></div>
                    )}
                  </Td>
                  <Td className="text-xs whitespace-nowrap">{i.field ? FIELD_LABELS[i.field] ?? i.field : "—"}</Td>
                  <Td className="max-w-48 text-xs break-words">{i.observedValue ?? "—"}</Td>
                  <Td><IssueStatusBadge status={i.status} /></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {relatedIssues.length > 0 && (
        <div className="mt-4 border-t border-border pt-3 text-sm">
          <div className="text-xs font-medium text-ink-3">Other records referencing this one</div>
          <ul className="mt-1 space-y-1">
            {relatedIssues.map((r) => (
              <li key={r.id}>
                <Link href={`/issues/${r.id}`} className="hover:underline">{ruleLabel(r.ruleCode)}</Link>
                <span className="text-ink-3"> on </span>
                <Link href={`/properties/${r.property.id}`} className="text-accent-strong hover:underline">{r.property.referenceCode ?? r.property.name}</Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
