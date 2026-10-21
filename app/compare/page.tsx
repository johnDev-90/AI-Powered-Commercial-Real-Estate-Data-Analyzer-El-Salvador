import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { HorizontalBars } from "@/components/charts";
import { DownloadIcon, SparkIcon } from "@/components/icons";
import { ButtonAnchor, ButtonLink, Card, EmptyState, Notice, PageHeader, SyntheticBadge, TableSkeleton, Td, Th, VerificationBadge } from "@/components/ui";
import { PROPERTY_TYPE_LABELS } from "@/lib/domain/labels";
import { formatArea, formatDate, formatUsd, formatUsdPerM2 } from "@/lib/format";
import { compareIdsSchema, getComparison } from "@/lib/services/compare";
import type { PropertyDTO } from "@/lib/services/dto";

export const metadata: Metadata = { title: "Compare properties" };

export default function ComparePage({ searchParams }: PageProps<"/compare">) {
  return (
    <>
      <PageHeader
        title="Compare properties"
        description="Side-by-side comparison of up to 6 records using asking (listing) prices. This is not a valuation and does not reflect verified transaction prices."
      />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <CompareContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

type Row = { label: string; value: (p: PropertyDTO & { openIssues: number }) => React.ReactNode; numeric?: boolean };

const ROWS: Row[] = [
  { label: "Property type", value: (p) => (p.propertyType ? PROPERTY_TYPE_LABELS[p.propertyType] : <span className="text-critical-text">{p.rawPropertyType ?? "Missing"}</span>) },
  { label: "Municipality", value: (p) => p.municipality ?? "—" },
  { label: "Department", value: (p) => p.department ?? "—" },
  { label: "Asking price", value: (p) => formatUsd(p.askingPriceUsd), numeric: true },
  { label: "Land area", value: (p) => formatArea(p.landAreaM2), numeric: true },
  { label: "Building area", value: (p) => formatArea(p.buildingAreaM2), numeric: true },
  { label: "Asking price / m²", value: (p) => formatUsdPerM2(p.pricePerM2Usd), numeric: true },
  { label: "Price basis", value: (p) => (p.pricePerM2Basis === "LAND" ? "Land area" : p.pricePerM2Basis === "BUILDING" ? "Building area" : "—") },
  { label: "Cadastral ID", value: (p) => p.cadastralId ?? "—" },
  { label: "Zoning (as stated)", value: (p) => p.zoning ?? "—" },
  { label: "Verification", value: (p) => <VerificationBadge status={p.verificationStatus} /> },
  { label: "Open issues", value: (p) => (p.openIssues > 0 ? <Link href={`/issues?property=${p.id}`} className="underline">{p.openIssues}</Link> : "0"), numeric: true },
  { label: "Last updated (source)", value: (p) => formatDate(p.sourceUpdatedAt) },
];

async function CompareContent({ searchParams }: { searchParams: PageProps<"/compare">["searchParams"] }) {
  const sp = await searchParams;
  const ids = compareIdsSchema.parse(typeof sp.ids === "string" ? sp.ids : "");
  const { properties, gaps, notes } = await getComparison(ids);

  if (properties.length < 2) {
    return (
      <EmptyState
        title="Select at least two properties"
        description="Use the checkboxes on the Properties page to choose up to 6 records, then click Compare."
        action={<ButtonLink href="/properties" variant="primary">Choose properties</ButtonLink>}
      />
    );
  }

  const idParam = properties.map((p) => p.id).join(",");
  const withPpm = properties.filter((p) => p.pricePerM2Usd);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap justify-end gap-2">
        <ButtonLink href={`/investigate?ids=${idParam}`}><SparkIcon />Ask AI to compare</ButtonLink>
        <ButtonAnchor href={`/api/export/compare?ids=${idParam}`}><DownloadIcon />Export comparison CSV</ButtonAnchor>
      </div>
      {notes.length > 0 && (
        <Notice tone="warning" title="Comparison caveats">
          <ul className="list-disc pl-4">{notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Notice>
      )}

      <div className="overflow-x-auto rounded-lg border border-border bg-surface-1">
        <table className="w-full min-w-[720px] border-collapse">
          <thead>
            <tr>
              <Th className="w-44">Field</Th>
              {properties.map((p) => (
                <Th key={p.id}>
                  <Link href={`/properties/${p.id}`} className="block font-semibold text-ink hover:underline">{p.name ?? "Unnamed"}</Link>
                  <span className="font-mono font-normal text-ink-3">{p.referenceCode ?? "no ID"}</span> {p.isSynthetic && <SyntheticBadge />}
                </Th>
              ))}
            </tr>
          </thead>
          <tbody>
            {ROWS.map((row) => (
              <tr key={row.label}>
                <Td className="text-xs font-medium text-ink-2">{row.label}</Td>
                {properties.map((p) => <Td key={p.id} className={row.numeric ? "tabular" : undefined}>{row.value(p)}</Td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card title="Asking price" description="USD, listing data.">
          <HorizontalBars label="Asking price" format="usd" data={properties.filter((p) => p.askingPriceUsd).map((p) => ({ label: p.referenceCode ?? p.name ?? p.id, value: Number(p.askingPriceUsd) }))} />
        </Card>
        <Card title="Asking price per m²" description={withPpm.length < properties.length ? `${properties.length - withPpm.length} record(s) cannot be calculated.` : "Basis shown in the table."}>
          <HorizontalBars label="Asking price per m²" format="usdPerM2" data={withPpm.map((p) => ({ label: p.referenceCode ?? p.name ?? p.id, value: Number(p.pricePerM2Usd), note: p.pricePerM2Basis === "LAND" ? "land basis" : "building basis" }))} />
        </Card>
        <Card title="Land area" description="m²">
          <HorizontalBars label="Land area" data={properties.filter((p) => p.landAreaM2).map((p) => ({ label: p.referenceCode ?? p.name ?? p.id, value: Number(p.landAreaM2) }))} />
        </Card>
      </div>

      <Card title="Missing information affecting comparison quality">
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {gaps.map((g) => {
            const p = properties.find((x) => x.id === g.propertyId)!;
            return (
              <li key={g.propertyId} className="rounded-md border border-border p-3 text-sm">
                <div className="font-mono text-xs text-ink-3">{p.referenceCode ?? "no ID"}</div>
                {g.missing.length === 0 ? <p className="mt-1 text-good-text">Complete for comparison</p> : (
                  <ul className="mt-1 list-disc pl-4 text-ink-2">{g.missing.map((m) => <li key={m}>{m}</li>)}</ul>
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}
