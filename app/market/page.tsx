import type { Metadata } from "next";
import { Suspense } from "react";
import { HorizontalBars } from "@/components/charts";
import { DownloadIcon } from "@/components/icons";
import { PropertyFilters } from "@/components/property-filters";
import { ButtonAnchor, Card, EmptyState, Notice, PageHeader, StatTile, TableSkeleton, Td, Th, withParams } from "@/components/ui";
import { PROPERTY_TYPE_LABELS } from "@/lib/domain/labels";
import { formatUsd, formatUsdPerM2, percent } from "@/lib/format";
import { getCompleteness, getMunicipalityStats, getTypeStats } from "@/lib/services/analytics";
import { getLocationFacets } from "@/lib/services/properties";
import { propertyListQuerySchema, searchParamsToObject } from "@/lib/validation/property";

export const metadata: Metadata = { title: "Market analysis" };

export default function MarketPage({ searchParams }: PageProps<"/market">) {
  return (
    <>
      <PageHeader
        title="Market analysis"
        description="Descriptive statistics of ASKING prices from listing records. These are not verified transaction prices and not official market valuations."
      />
      <Suspense fallback={<TableSkeleton rows={10} />}>
        <MarketContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function MarketContent({ searchParams }: { searchParams: PageProps<"/market">["searchParams"] }) {
  const raw = searchParamsToObject(await searchParams);
  const query = propertyListQuerySchema.parse(raw);
  const [types, municipalities, completeness, facets] = await Promise.all([
    getTypeStats(query),
    getMunicipalityStats(query, 20),
    getCompleteness(query),
    getLocationFacets(),
  ]);
  const { page: _p, sort: _s, ...filters } = raw;
  const c = completeness;

  return (
    <>
      <PropertyFilters action="/market" query={query} facets={facets} showSort={false} />
      {c.total === 0 ? (
        <EmptyState title="No records match these filters" />
      ) : (
        <div className="space-y-4">
          <div className="flex justify-end">
            <ButtonAnchor href={withParams("/api/export/properties", filters, {})} variant="ghost"><DownloadIcon />Export {c.total} filtered records</ButtonAnchor>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <StatTile label="Records in selection" value={c.total} />
            <StatTile label="With price per m²" value={c.total - c.noPricePerM2} hint={`${percent(c.total - c.noPricePerM2, c.total)} usable for rate comparison`} />
            <StatTile label="Missing verification status" value={c.missingVerification} hint={percent(c.missingVerification, c.total)} />
            <StatTile label="Missing cadastral ID" value={c.missingCadastral} hint={percent(c.missingCadastral, c.total)} />
          </div>

          {c.noPricePerM2 > 0 && (
            <Notice tone="info">
              {c.noPricePerM2} of {c.total} records are excluded from price-per-m² statistics because price, type or the relevant area is missing or invalid.
              Outliers are included and flagged separately on the Data quality page.
            </Notice>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Property type distribution">
              <HorizontalBars label="Records by property type" data={types.map((t) => ({ label: PROPERTY_TYPE_LABELS[t.propertyType], value: t.count }))} />
            </Card>
            <Card title="Distribution by municipality" description="Top 20 by record count.">
              <HorizontalBars label="Records by municipality" data={municipalities.map((m) => ({ label: m.municipality, value: m.count, note: m.department ?? undefined }))} />
            </Card>
          </div>

          <Card title="Asking price per m² by property type" description="Land: per m² of land. Built properties: per m² of building. Types are never pooled.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse">
                <thead><tr><Th>Type</Th><Th align="right">Records</Th><Th align="right">With rate</Th><Th align="right">Median /m²</Th><Th align="right">Average /m²</Th><Th align="right">Min /m²</Th><Th align="right">Max /m²</Th><Th align="right">Avg asking price</Th></tr></thead>
                <tbody>
                  {types.map((t) => (
                    <tr key={t.propertyType}>
                      <Td>{PROPERTY_TYPE_LABELS[t.propertyType]}</Td>
                      <Td align="right">{t.count}</Td>
                      <Td align="right">{t.withPricePerM2}</Td>
                      <Td align="right">{formatUsdPerM2(t.medianPricePerM2)}</Td>
                      <Td align="right">{formatUsdPerM2(t.avgPricePerM2)}</Td>
                      <Td align="right">{formatUsdPerM2(t.minPricePerM2)}</Td>
                      <Td align="right">{formatUsdPerM2(t.maxPricePerM2)}</Td>
                      <Td align="right">{formatUsd(t.avgAskingPrice)}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card title="By municipality">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse">
                <thead><tr><Th>Municipality</Th><Th>Department</Th><Th align="right">Records</Th><Th align="right">Median /m² (all types)</Th><Th align="right">Open issues</Th></tr></thead>
                <tbody>
                  {municipalities.map((m) => (
                    <tr key={m.municipality}>
                      <Td>{m.municipality}</Td>
                      <Td className="text-ink-2">{m.department ?? "—"}</Td>
                      <Td align="right">{m.count}</Td>
                      <Td align="right">{formatUsdPerM2(m.medianPricePerM2)}</Td>
                      <Td align="right">{m.openIssues}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-xs text-ink-3">The all-types median mixes land and building rates and is shown only as a rough indicator; filter by property type for meaningful rates.</p>
          </Card>

          <Card title="Data completeness" description="Missing inputs reduce comparison reliability.">
            <ul className="grid gap-2 text-sm sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["Missing asking price", c.missingPrice],
                ["Missing all areas", c.missingArea],
                ["Unsupported / missing type", c.missingType],
                ["Missing zoning information", c.missingZoning],
              ].map(([label, n]) => (
                <li key={label as string} className="rounded-md border border-border p-3">
                  <div className="tabular text-lg font-semibold">{n as number} <span className="text-xs font-normal text-ink-3">({percent(n as number, c.total)})</span></div>
                  <div className="text-xs text-ink-2">{label as string}</div>
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}
