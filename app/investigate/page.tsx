import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { InvestigationPanel, type InvestigationContext } from "@/components/investigation-panel";
import { ButtonLink, Card, PageHeader, TableSkeleton, cx } from "@/components/ui";
import { getConversation, listConversations } from "@/lib/ai/investigate";
import { isAiConfigured } from "@/lib/ai/llm";
import { getDb } from "@/lib/db";
import { formatDateTime } from "@/lib/format";
import { ruleLabel } from "@/lib/quality/rule-codes";

export const metadata: Metadata = { title: "AI investigation" };

export default function InvestigatePage({ searchParams }: PageProps<"/investigate">) {
  return (
    <>
      <PageHeader
        title="AI investigation"
        description="Ask questions about property records, detected issues and documents. Answers cite the records they rely on and separate stored facts from AI interpretation."
        actions={<ButtonLink href="/investigate">New conversation</ButtonLink>}
      />
      <Suspense fallback={<TableSkeleton rows={6} />}>
        <InvestigateContent searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function InvestigateContent({ searchParams }: { searchParams: PageProps<"/investigate">["searchParams"] }) {
  const sp = await searchParams;
  const conversationId = one(sp.c);
  const propertyParam = one(sp.property);
  const idsParam = one(sp.ids);
  const issueId = one(sp.issue);
  const documentId = one(sp.document);

  const db = getDb();
  const [conversation, conversations] = await Promise.all([conversationId ? getConversation(conversationId) : null, listConversations()]);

  let context: InvestigationContext | undefined;
  let suggestions: string[] | undefined;
  const propertyIds = (idsParam?.split(",") ?? (propertyParam ? [propertyParam] : [])).filter(Boolean).slice(0, 6);

  if (issueId) {
    const issue = await db.dataQualityIssue.findUnique({ where: { id: issueId }, select: { id: true, ruleCode: true, propertyId: true, property: { select: { referenceCode: true } } } });
    if (issue) {
      context = { issueId: issue.id, propertyIds: [issue.propertyId], label: `${ruleLabel(issue.ruleCode)} · ${issue.property.referenceCode ?? "property"}` };
      suggestions = ["Explain this issue and what evidence supports it.", "What should be checked to resolve this issue?", "Are there related records with similar problems?"];
    }
  } else if (documentId) {
    const doc = await db.propertyDocument.findUnique({ where: { id: documentId }, select: { id: true, fileName: true, propertyId: true } });
    if (doc) {
      context = { documentId: doc.id, propertyIds: [doc.propertyId], label: `Document ${doc.fileName}` };
      suggestions = ["Summarize the findings from this document and compare them with the database record.", "Which document values differ from the record?"];
    }
  } else if (propertyIds.length > 0) {
    const props = await db.property.findMany({ where: { id: { in: propertyIds } }, select: { id: true, referenceCode: true } });
    if (props.length > 0) {
      context = { propertyIds: props.map((p) => p.id), label: props.map((p) => p.referenceCode ?? p.id).join(", ") };
      suggestions =
        props.length === 1
          ? ["Summarize the available information for this property.", "Which values of this record need verification?", "Does this record conflict with other records?"]
          : ["Compare the asking prices per m² of these properties.", "What information is missing before these properties can be compared reliably?"];
    }
  }
  if (conversation?.context && !context) context = { ...conversation.context, label: "Continued conversation" };

  return (
    <div className="grid gap-4 lg:grid-cols-4">
      <div className="lg:col-span-3">
        <Card>
          <InvestigationPanel
            key={conversation?.id ?? JSON.stringify(context ?? {})}
            conversationId={conversation?.id}
            messages={(conversation?.messages ?? []).map((m) => ({ id: m.id, role: m.role, content: m.content, structured: m.structured, toolCalls: m.toolCalls, errorCode: m.errorCode }))}
            context={context}
            aiConfigured={isAiConfigured()}
            suggestions={suggestions}
          />
        </Card>
      </div>
      <Card title="Recent conversations">
        {conversations.length === 0 ? (
          <p className="text-sm text-ink-3">No conversations yet.</p>
        ) : (
          <ul className="space-y-1">
            {conversations.map((c) => (
              <li key={c.id}>
                <Link href={`/investigate?c=${c.id}`} className={cx("block rounded px-2 py-1.5 text-sm hover:bg-surface-2", c.id === conversation?.id && "bg-accent-soft")}>
                  <div className="truncate text-ink">{c.title}</div>
                  <div className="text-xs text-ink-3">{formatDateTime(c.updatedAt)} · {c.messages} messages</div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
