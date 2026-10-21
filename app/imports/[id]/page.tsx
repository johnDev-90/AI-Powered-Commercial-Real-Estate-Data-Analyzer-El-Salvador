import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ImportWizard } from "@/components/import-wizard";
import { Badge, ButtonLink, Card, Notice, PageHeader, Pagination, StatTile, TableSkeleton, Td, Th, cx, withParams } from "@/components/ui";
import type { ImportRowStatus } from "@/lib/generated/prisma/enums";
import { suggestAreaUnit, suggestMapping } from "@/lib/csv/mapping";
import { parseCsv } from "@/lib/csv/parse";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Import" };

const PAGE_SIZE = 50;
const STATUSES: ImportRowStatus[] = ["ACCEPTED", "FLAGGED", "REJECTED"];

export default function ImportPage({ params, searchParams }: PageProps<"/imports/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <ImportContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ImportContent({ params, searchParams }: { params: PageProps<"/imports/[id]">["params"]; searchParams: PageProps<"/imports/[id]">["searchParams"] }) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const db = getDb();
  const record = await db.dataImport.findUnique({
    where: { id },
    select: { id: true, fileName: true, status: true, totalRows: true, acceptedRows: true, flaggedRows: true, rejectedRows: true, createdAt: true, completedAt: true, isSynthetic: true, errorMessage: true, headers: true, columnMapping: true, delimiter: true, fileSha256: true, fileContent: true },
  });
  if (!record) notFound();

  const header = (
    <PageHeader
      eyebrow={<Link href="/imports" className="hover:underline">← Imports</Link>}
      title={record.fileName}
      description={`Uploaded ${formatDateTime(record.createdAt)} · ${record.totalRows} rows · delimiter "${record.delimiter === "\t" ? "tab" : record.delimiter}" · SHA-256 ${record.fileSha256.slice(0, 12)}…`}
      actions={record.isSynthetic ? <Badge tone="outline">Synthetic</Badge> : undefined}
    />
  );

  if (record.status === "PENDING_MAPPING") {
    const parsed = parseCsv(record.fileContent);
    const mapping = suggestMapping(parsed.headers);
    return (
      <>
        {header}
        <ImportWizard
          initial={{
            importId: record.id,
            headers: parsed.headers,
            totalRows: parsed.rows.length,
            preview: parsed.rows.slice(0, 5).map((r) => r.values),
            suggestedMapping: mapping,
            suggestedOptions: { landAreaUnit: suggestAreaUnit(mapping.landArea), buildingAreaUnit: suggestAreaUnit(mapping.buildingArea) },
            previousImport: null,
          }}
        />
      </>
    );
  }

  const status = STATUSES.find((s) => s === sp.status);
  const page = Math.max(1, Number(sp.page) || 1);
  const where = { importId: id, ...(status ? { status } : {}) };
  const [rows, total] = await Promise.all([
    db.importRow.findMany({ where, orderBy: { rowNumber: "asc" }, skip: (page - 1) * PAGE_SIZE, take: PAGE_SIZE, include: { property: { select: { id: true, referenceCode: true, name: true } } } }),
    db.importRow.count({ where }),
  ]);
  const mapping = (record.columnMapping as { mapping?: Record<string, string>; options?: Record<string, unknown> } | null) ?? {};

  return (
    <>
      {header}
      {record.status === "FAILED" && <div className="mb-4"><Notice tone="error" title="Import failed and was rolled back">{record.errorMessage ?? "Unknown error"}</Notice></div>}
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Rows" value={record.totalRows} />
        <StatTile label="Accepted" value={record.acceptedRows} hint="No issues detected" href={`/imports/${id}?status=ACCEPTED`} />
        <StatTile label="Flagged" value={record.flaggedRows} hint="Imported with issues" href={`/imports/${id}?status=FLAGGED`} />
        <StatTile label="Rejected" value={record.rejectedRows} hint="Not imported" href={`/imports/${id}?status=REJECTED`} />
      </div>

      <div className="grid gap-4 lg:grid-cols-4">
        <Card title="Rows" className="lg:col-span-3" actions={
          <div className="flex gap-1 text-xs">
            {[undefined, ...STATUSES].map((s) => (
              <Link key={s ?? "all"} href={withParams(`/imports/${id}`, {}, { status: s })} className={cx("rounded px-2 py-1", status === s ? "bg-accent-soft font-medium text-accent-strong" : "text-ink-2 hover:bg-surface-2")}>
                {s ? s.charAt(0) + s.slice(1).toLowerCase() : "All"}
              </Link>
            ))}
          </div>
        }>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse">
              <thead><tr><Th>Row</Th><Th>Status</Th><Th>Record</Th><Th>Messages</Th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const messages = (r.messages ?? []) as Array<{ code: string; message: string }>;
                  return (
                    <tr key={r.id}>
                      <Td className="tabular">{r.rowNumber}</Td>
                      <Td><Badge tone={r.status === "ACCEPTED" ? "good" : r.status === "REJECTED" ? "critical" : "accent"}>{r.status.toLowerCase()}</Badge></Td>
                      <Td>
                        {r.property ? (
                          <Link href={`/properties/${r.property.id}`} className="hover:underline">
                            <span className="font-mono text-xs">{r.property.referenceCode ?? "no ID"}</span> {r.property.name}
                          </Link>
                        ) : (
                          <span className="text-xs text-ink-3">{Object.values(r.rawData as Record<string, string>).filter(Boolean).slice(0, 3).join(" · ") || "(empty row)"}</span>
                        )}
                      </Td>
                      <Td className="text-xs text-ink-2">
                        {messages.length === 0 ? "—" : (
                          <ul className="space-y-0.5">{messages.slice(0, 4).map((m, i) => <li key={i}>{m.message}</li>)}{messages.length > 4 && <li className="text-ink-3">+{messages.length - 4} more</li>}</ul>
                        )}
                      </Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageCount={Math.max(1, Math.ceil(total / PAGE_SIZE))} total={total} hrefFor={(p) => withParams(`/imports/${id}`, {}, { status, page: p })} />
        </Card>

        <Card title="Column mapping used">
          <dl className="space-y-1.5 text-xs">
            {Object.entries(mapping.mapping ?? {}).map(([target, source]) => (
              <div key={target}><dt className="text-ink-3">{target}</dt><dd className="font-mono text-ink">{source}</dd></div>
            ))}
          </dl>
          {mapping.options && <pre className="mt-3 rounded bg-surface-2 p-2 text-[11px] whitespace-pre-wrap text-ink-2">{JSON.stringify(mapping.options, null, 2)}</pre>}
          <div className="mt-3"><ButtonLink href="/issues">Review issues</ButtonLink></div>
        </Card>
      </div>
    </>
  );
}
