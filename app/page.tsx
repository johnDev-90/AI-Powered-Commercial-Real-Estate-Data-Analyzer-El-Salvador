import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { LoadDemoDataButton, RunAnalysisButton } from "@/components/action-forms";
import { HorizontalBars } from "@/components/charts";
import { SeverityGlyph } from "@/components/icons";
import { Badge, Card, EmptyState, PageHeader, Skeleton, StatTile, Td, Th } from "@/components/ui";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, SEVERITY_LABELS } from "@/lib/domain/labels";
import { formatDateTime, formatNumber, formatUsdPerM2, percent } from "@/lib/format";
import { getDashboard } from "@/lib/services/analytics";

export default function DashboardPage() {
  return (
    <>
      <PageHeader
        title="Dashboard"
        description="Data quality and market overview for commercial property records in El Salvador. All metrics are computed from the records in the database."
        actions={<RunAnalysisButton />}
      />
      <Suspense fallback={<DashboardSkeleton />}>
        <DashboardContent />
      </Suspense>
    </>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading dashboard">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">{Array.from({ length: 6 }, (_, i) => <Skeleton key={i} className="h-20" />)}</div>
      <div className="grid gap-4 lg:grid-cols-2"><Skeleton className="h-72" /><Skeleton className="h-72" /></div>
    </div>
  );
}

async function DashboardContent() {
  await connection(); // live data: render per request, never during the build's prerender
  const d = await getDashboard();
  const t = d.totals;

  if (t.properties === 0) {
    return (
      <EmptyState
        title="No properties yet"
        description="Load the synthetic demo dataset (≈115 fictional commercial properties with intentional data quality issues), or import your own CSV."
        action={
          <div className="flex flex-col items-center gap-3">
            <LoadDemoDataButton />
            <Link href="/imports" className="text-sm text-accent-strong underline">Import a CSV instead</Link>
          </div>
        }
      />
    );
  }

  const ppmTypes = d.typeStats.filter((s) => s.medianPricePerM2 !== null);

  return (
    <div className="space-y-4">
      {t.synthetic > 0 && (
        <div className="flex items-center gap-2 text-xs text-ink-3">
          <Badge tone="outline">Synthetic</Badge>
          {t.synthetic === t.properties ? "All" : `${t.synthetic} of ${t.properties}`} records are fictional demo data, not real listings.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Properties" value={formatNumber(t.properties)} href="/properties" />
        <StatTile label="Open data quality issues" value={formatNumber(t.openIssues)} href="/issues" />
        <StatTile label="Properties in duplicate sets" value={formatNumber(t.duplicateProperties)} hint="Same ID or likely same property" href="/issues?category=DUPLICATION" />
        <StatTile label="Missing / invalid values" value={formatNumber(t.missingOrInvalid)} hint="Completeness + validity issues" href="/issues?category=COMPLETENESS" />
        <StatTile label="Require review" value={formatNumber(t.needsReview)} hint={`${percent(t.needsReview, t.properties)} of properties`} href="/properties?issues=open" />
        <StatTile
          label="Open issues by severity"
          value={
            <span className="flex items-center gap-3 text-base">
              {(["HIGH", "MEDIUM", "LOW"] as const).map((s) => (
                <span key={s} className="inline-flex items-center gap-1" title={SEVERITY_LABELS[s]}>
                  <SeverityGlyph severity={s} />
                  <span className="sr-only">{SEVERITY_LABELS[s]}:</span>
                  {d.severity[s] ?? 0}
                </span>
              ))}
            </span>
          }
          hint="High · Medium · Low"
          href="/issues"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Open issues by category" description="Deterministic validation rules; no AI involved.">
          <HorizontalBars label="Open issues by category" data={d.categories.map((c) => ({ label: CATEGORY_LABELS[c.category], value: c.count }))} />
        </Card>
        <Card title="Properties by municipality" description="Top municipalities by record count.">
          <HorizontalBars
            label="Properties by municipality"
            data={d.municipalities.map((m) => ({ label: m.municipality, value: m.count, note: m.department ?? undefined }))}
          />
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card
          title="Median asking price per m², by property type"
          description="Asking (listing) prices only — not transaction prices or valuations. Land uses land area; built properties use building area."
        >
          {ppmTypes.length === 0 ? (
            <p className="text-sm text-ink-3">Not enough records with price and area to calculate price per m².</p>
          ) : (
            <>
              <HorizontalBars
                label="Median asking price per m² by type"
                format="usdPerM2"
                data={ppmTypes.map((s) => ({ label: PROPERTY_TYPE_LABELS[s.propertyType], value: Number(s.medianPricePerM2), note: `n=${s.withPricePerM2} of ${s.count}` }))}
              />
              <table className="mt-3 w-full text-sm">
                <thead>
                  <tr><Th>Type</Th><Th align="right">Average</Th><Th align="right">Median</Th><Th align="right">Based on</Th></tr>
                </thead>
                <tbody>
                  {ppmTypes.map((s) => (
                    <tr key={s.propertyType}>
                      <Td>{PROPERTY_TYPE_LABELS[s.propertyType]}</Td>
                      <Td align="right">{formatUsdPerM2(s.avgPricePerM2)}</Td>
                      <Td align="right">{formatUsdPerM2(s.medianPricePerM2)}</Td>
                      <Td align="right">{s.withPricePerM2} of {s.count}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Recent imports" actions={<Link href="/imports" className="text-xs text-accent-strong">All imports</Link>}>
            <ul className="divide-y divide-border">
              {d.imports.map((i) => (
                <li key={i.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <Link href={`/imports/${i.id}`} className="truncate font-medium text-ink hover:underline">{i.fileName}</Link>
                    <div className="text-xs text-ink-3">{formatDateTime(i.createdAt)}{i.isSynthetic ? " · synthetic" : ""}</div>
                  </div>
                  <div className="tabular shrink-0 text-xs text-ink-2">
                    {i.status === "COMPLETED" ? `${i.acceptedRows} accepted · ${i.flaggedRows} flagged · ${i.rejectedRows} rejected` : i.status.replace("_", " ").toLowerCase()}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
          <Card title="Recent analysis runs">
            <ul className="divide-y divide-border">
              {d.runs.map((r) => (
                <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div>
                    <span className="font-medium text-ink">{r.trigger.replace("_", " ").toLowerCase()}</span>
                    <span className="text-xs text-ink-3"> · {formatDateTime(r.startedAt)}</span>
                  </div>
                  <div className="tabular text-xs text-ink-2">
                    {r.status === "COMPLETED" ? `${r.issuesDetected} detected · ${r.issuesNew} new · ${r.issuesAutoResolved} cleared` : r.status.toLowerCase()}
                  </div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
}
