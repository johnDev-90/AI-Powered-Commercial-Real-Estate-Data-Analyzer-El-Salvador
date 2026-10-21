import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { RunAnalysisButton } from "@/components/action-forms";
import { DownloadIcon, SearchIcon, SparkIcon } from "@/components/icons";
import {
  Button, ButtonAnchor, ButtonLink, EmptyState, IssueStatusBadge, PageHeader, Pagination, SeverityBadge, TableSkeleton, Td, Th,
  inputClass, labelClass, withParams,
} from "@/components/ui";
import { CATEGORY_LABELS, FIELD_LABELS, ISSUE_CATEGORIES, ISSUE_SEVERITIES, ISSUE_STATUSES, SEVERITY_LABELS, STATUS_LABELS } from "@/lib/domain/labels";
import { RULE_CODES, RULE_LABELS, ruleLabel } from "@/lib/quality/rule-codes";
import { listIssues } from "@/lib/services/issues";
import { getLocationFacets } from "@/lib/services/properties";
import { issueListQuerySchema, type IssueListQuery } from "@/lib/validation/issues";
import { searchParamsToObject } from "@/lib/validation/property";

export const metadata: Metadata = { title: "Data quality" };

export default function IssuesPage({ searchParams }: PageProps<"/issues">) {
  return (
    <>
      <PageHeader
        title="Data quality findings"
        description="Issues detected by deterministic validation rules. Resolving or dismissing an issue never changes the property record; every review is logged."
        actions={<RunAnalysisButton />}
      />
      <Suspense fallback={<TableSkeleton />}>
        <IssuesContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function IssuesContent({ searchParams }: { searchParams: PageProps<"/issues">["searchParams"] }) {
  const raw = searchParamsToObject(await searchParams);
  const query = issueListQuerySchema.parse(raw);
  const [result, facets] = await Promise.all([listIssues(query), getLocationFacets()]);
  const { page: _p, ...filterParams } = raw;

  return (
    <>
      <IssueFilters query={query} municipalities={facets.municipalities} />
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-4 text-sm text-ink-2">
          {ISSUE_SEVERITIES.map((s) => (
            <span key={s} className="inline-flex items-center gap-1.5"><SeverityBadge severity={s} /><span className="tabular">{result.severityCounts[s] ?? 0}</span></span>
          ))}
        </div>
        <ButtonAnchor href={withParams("/api/export/issues", filterParams, {})} variant="ghost"><DownloadIcon />Export {result.total} findings to CSV</ButtonAnchor>
      </div>

      {result.total === 0 ? (
        <EmptyState title="No issues match these filters" description="Try a different status or reset the filters." action={<ButtonLink href="/issues?status=ALL">Show all issues</ButtonLink>} />
      ) : (
        <>
          <div className="overflow-x-auto rounded-lg border border-border bg-surface-1">
            <table className="w-full min-w-[1000px] border-collapse">
              <thead>
                <tr><Th>Severity</Th><Th>Issue</Th><Th>Property</Th><Th>Field</Th><Th>Observed</Th><Th>Expected / reference</Th><Th>Status</Th><Th><span className="sr-only">Actions</span></Th></tr>
              </thead>
              <tbody>
                {result.items.map((i) => (
                  <tr key={i.id} className="hover:bg-surface-0">
                    <Td><SeverityBadge severity={i.severity} /></Td>
                    <Td className="max-w-80">
                      <Link href={`/issues/${i.id}`} className="font-medium hover:text-accent-strong hover:underline">{ruleLabel(i.ruleCode)}</Link>
                      <div className="mt-0.5 text-xs text-ink-3">{CATEGORY_LABELS[i.category]}</div>
                    </Td>
                    <Td>
                      <Link href={`/properties/${i.property.id}`} className="font-mono text-xs text-accent-strong hover:underline">{i.property.referenceCode ?? "no ID"}</Link>
                      <div className="max-w-48 truncate text-xs text-ink-2">{i.property.name ?? "Unnamed"}</div>
                      <div className="text-xs text-ink-3">{i.property.municipality ?? "—"}</div>
                    </Td>
                    <Td className="text-xs whitespace-nowrap">{i.field ? FIELD_LABELS[i.field] ?? i.field : "—"}</Td>
                    <Td className="max-w-48 text-xs break-words">{i.observedValue ?? <span className="text-ink-3">(empty)</span>}</Td>
                    <Td className="max-w-48 text-xs break-words text-ink-2">{i.expectedValue ?? "—"}</Td>
                    <Td><IssueStatusBadge status={i.status} /></Td>
                    <Td>
                      <Link href={`/investigate?issue=${i.id}`} className="inline-flex items-center gap-1 text-xs whitespace-nowrap text-accent-strong hover:underline" title="Ask AI to explain this issue">
                        <SparkIcon width={12} height={12} />Explain
                      </Link>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <Pagination page={result.page} pageCount={result.pageCount} total={result.total} hrefFor={(p) => withParams("/issues", raw, { page: p })} />
        </>
      )}
    </>
  );
}

function IssueFilters({ query, municipalities }: { query: IssueListQuery; municipalities: string[] }) {
  return (
    <form action="/issues" method="get" role="search" className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-border bg-surface-1 p-3 sm:grid-cols-2 lg:grid-cols-7">
      {query.property && <input type="hidden" name="property" value={query.property} />}
      <div className="lg:col-span-2">
        <label htmlFor="iq" className={labelClass}>Search</label>
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-ink-3" />
          <input id="iq" name="q" defaultValue={query.q ?? ""} placeholder="Property ID, name or text" className={`${inputClass} pl-8`} />
        </div>
      </div>
      <Select id="status" label="Review status" value={query.status} options={[...ISSUE_STATUSES.map((s) => [s, STATUS_LABELS[s]] as const), ["ALL", "All statuses"] as const]} />
      <Select id="severity" label="Severity" value={query.severity} empty="All" options={ISSUE_SEVERITIES.map((s) => [s, SEVERITY_LABELS[s]] as const)} />
      <Select id="category" label="Category" value={query.category} empty="All" options={ISSUE_CATEGORIES.map((c) => [c, CATEGORY_LABELS[c]] as const)} />
      <Select id="rule" label="Rule" value={query.rule} empty="All" options={RULE_CODES.map((r) => [r, RULE_LABELS[r]] as const)} />
      <Select id="municipality" label="Municipality" value={query.municipality} empty="All" options={municipalities.map((m) => [m, m] as const)} />
      <div className="flex items-end gap-2 lg:col-span-7">
        <Button type="submit" variant="primary">Apply filters</Button>
        <ButtonLink href="/issues" variant="ghost">Reset</ButtonLink>
        {query.property && <span className="text-xs text-ink-3">Filtered to one property · <Link href="/issues" className="underline">clear</Link></span>}
      </div>
    </form>
  );
}

function Select({ id, label, value, options, empty }: { id: string; label: string; value?: string; options: ReadonlyArray<readonly [string, string]>; empty?: string }) {
  return (
    <div>
      <label htmlFor={id} className={labelClass}>{label}</label>
      <select id={id} name={id} defaultValue={value ?? ""} className={inputClass}>
        {empty && <option value="">{empty}</option>}
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </div>
  );
}
