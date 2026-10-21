import type { Metadata } from "next";
import Link from "next/link";
import { connection } from "next/server";
import { Suspense } from "react";
import { DownloadIcon } from "@/components/icons";
import { ImportWizard } from "@/components/import-wizard";
import { Badge, Card, PageHeader, TableSkeleton, Td, Th } from "@/components/ui";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Imports" };

export default function ImportsPage() {
  return (
    <>
      <PageHeader title="Imports" description="Import property records from CSV files with column mapping. Every row is kept with its original values for provenance." />
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2"><ImportWizard /></div>
        <Card title="Sample files (synthetic)" description="Fictional data with intentional quality issues for testing.">
          <ul className="space-y-3 text-sm">
            <li>
              <a href="/samples/properties-portfolio.csv" download className="inline-flex items-center gap-1.5 font-medium text-accent-strong hover:underline"><DownloadIcon />properties-portfolio.csv</a>
              <p className="text-xs text-ink-3">101 rows · English headers · m² · comma-separated</p>
            </li>
            <li>
              <a href="/samples/listados-corredor.csv" download className="inline-flex items-center gap-1.5 font-medium text-accent-strong hover:underline"><DownloadIcon />listados-corredor.csv</a>
              <p className="text-xs text-ink-3">15 rows · Spanish headers · v² · “1.250.000,00” numbers · semicolon-separated · overlaps with the portfolio</p>
            </li>
          </ul>
        </Card>
      </div>
      <div className="mt-6">
        <Suspense fallback={<TableSkeleton rows={4} />}>
          <ImportHistory />
        </Suspense>
      </div>
    </>
  );
}

async function ImportHistory() {
  await connection();
  const imports = await getDb().dataImport.findMany({
    orderBy: { createdAt: "desc" },
    take: 50,
    select: { id: true, fileName: true, status: true, totalRows: true, acceptedRows: true, flaggedRows: true, rejectedRows: true, createdAt: true, isSynthetic: true, errorMessage: true },
  });
  return (
    <Card title="Import history">
      {imports.length === 0 ? (
        <p className="text-sm text-ink-3">No imports yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse">
            <thead><tr><Th>File</Th><Th>Date</Th><Th>Status</Th><Th align="right">Rows</Th><Th align="right">Accepted</Th><Th align="right">Flagged</Th><Th align="right">Rejected</Th></tr></thead>
            <tbody>
              {imports.map((i) => (
                <tr key={i.id}>
                  <Td>
                    <Link href={`/imports/${i.id}`} className="font-medium hover:underline">{i.fileName}</Link>
                    {i.isSynthetic && <Badge tone="outline" className="ml-2">Synthetic</Badge>}
                  </Td>
                  <Td className="text-xs whitespace-nowrap">{formatDateTime(i.createdAt)}</Td>
                  <Td>
                    <Badge tone={i.status === "COMPLETED" ? "good" : i.status === "FAILED" ? "critical" : "neutral"}>
                      {i.status === "PENDING_MAPPING" ? "Awaiting mapping" : i.status === "COMPLETED" ? "Completed" : "Failed"}
                    </Badge>
                  </Td>
                  <Td align="right">{i.totalRows}</Td>
                  <Td align="right">{i.status === "COMPLETED" ? i.acceptedRows : "—"}</Td>
                  <Td align="right">{i.status === "COMPLETED" ? i.flaggedRows : "—"}</Td>
                  <Td align="right">{i.status === "COMPLETED" ? i.rejectedRows : "—"}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  );
}
