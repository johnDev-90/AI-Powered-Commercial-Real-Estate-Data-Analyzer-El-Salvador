import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { DownloadIcon, SparkIcon } from "@/components/icons";
import { ReanalyzeDocumentButton } from "@/components/reanalyze-document";
import { Badge, ButtonAnchor, ButtonLink, Card, EmptyState, IssueStatusBadge, Notice, PageHeader, SeverityBadge, TableSkeleton, Td, Th } from "@/components/ui";
import { FIELD_LABELS } from "@/lib/domain/labels";
import { formatDateTime } from "@/lib/format";
import { getDocument } from "@/lib/services/documents";

export const metadata: Metadata = { title: "Document analysis" };

export default function DocumentPage({ params }: PageProps<"/documents/[id]">) {
  return (
    <Suspense fallback={<TableSkeleton rows={10} />}>
      <DocumentContent params={params} />
    </Suspense>
  );
}

async function DocumentContent({ params }: { params: PageProps<"/documents/[id]">["params"] }) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) notFound();
  const ex = doc.extraction;

  return (
    <>
      <PageHeader
        eyebrow={<Link href={`/properties/${doc.property.id}`} className="hover:underline">← {doc.property.referenceCode ?? doc.property.name}</Link>}
        title={doc.fileName}
        description={`${doc.pageCount ?? "?"} page(s) · uploaded ${formatDateTime(doc.createdAt)}${doc.analyzedAt ? ` · analyzed ${formatDateTime(doc.analyzedAt)}` : ""}`}
        actions={
          <>
            <ButtonLink href={`/investigate?document=${doc.id}`}><SparkIcon />Ask AI about this document</ButtonLink>
            <ButtonAnchor href={`/api/documents/${doc.id}/file`}><DownloadIcon />Download</ButtonAnchor>
            <ReanalyzeDocumentButton documentId={doc.id} />
          </>
        }
      />

      <div className="mb-4">
        <Notice tone="info">
          Document contents are user-provided and have <strong>not been officially verified</strong>. Differences from the record are flagged for human review only.
        </Notice>
      </div>
      {ex?.warnings.map((w) => <div key={w} className="mb-2"><Notice tone="warning">{w}</Notice></div>)}

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card title="Summary" actions={ex && <Badge tone="outline">{ex.method === "AI" ? `AI extraction${ex.model ? ` · ${ex.model}` : ""}` : "Rule-based extraction"}</Badge>}>
            {ex ? (
              <p className="text-sm whitespace-pre-line text-ink-2">
                {ex.method === "AI" && <span className="mr-1 rounded border border-dashed border-border-strong px-1 text-[11px] text-ink-3">AI-generated</span>}
                {ex.summary}
              </p>
            ) : (
              <p className="text-sm text-ink-3">Not analyzed yet.</p>
            )}
          </Card>

          <Card title="Extracted values" description="Each value cites its page and a source excerpt. Excerpts are checked against the page text.">
            {!ex || ex.fields.length === 0 ? (
              <EmptyState title="No values extracted" description="The document may not state property details in a recognizable form." />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse">
                  <thead><tr><Th>Field</Th><Th>Value</Th><Th>Source</Th></tr></thead>
                  <tbody>
                    {ex.fields.map((f, i) => (
                      <tr key={i}>
                        <Td className="text-xs font-medium whitespace-nowrap">{FIELD_LABELS[f.field] ?? f.field}</Td>
                        <Td className="tabular text-sm">{f.value}</Td>
                        <Td className="text-xs text-ink-2">
                          <span className="font-medium">p. {f.page}</span> · “{f.excerpt}”
                          <div className="mt-0.5">{f.excerptVerified ? <Badge tone="good">Excerpt found on page</Badge> : <Badge tone="critical">Excerpt not found</Badge>}</div>
                        </Td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <Card title={`Differences from the record (${doc.issues.length})`}>
            {doc.issues.length === 0 ? (
              <p className="text-sm text-ink-3">{ex ? "No differences between extracted values and the record." : "Run the analysis to compare."}</p>
            ) : (
              <ul className="divide-y divide-border">
                {doc.issues.map((i) => (
                  <li key={i.id} className="py-2 text-sm">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeverityBadge severity={i.severity} />
                      <Link href={`/issues/${i.id}`} className="font-medium hover:underline">{i.field ? FIELD_LABELS[i.field] ?? i.field : "Value"}</Link>
                      <IssueStatusBadge status={i.status} />
                    </div>
                    <div className="mt-1 text-xs text-ink-2">Document: {i.observedValue} · Record: {i.expectedValue}</div>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>

        <Card title="Extracted text" description="Raw text per page as read from the PDF (no OCR).">
          <div className="max-h-[720px] space-y-4 overflow-y-auto">
            {doc.extractedPages.map((p) => (
              <section key={p.page}>
                <h3 className="mb-1 text-xs font-semibold text-ink-3">Page {p.page}</h3>
                <pre className="rounded bg-surface-2 p-2 font-mono text-xs whitespace-pre-wrap text-ink-2">{p.text || "(no text on this page)"}</pre>
              </section>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
