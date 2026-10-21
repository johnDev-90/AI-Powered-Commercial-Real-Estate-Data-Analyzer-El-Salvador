"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { CheckedAnswer } from "@/lib/ai/answer";
import { AiAnswer } from "./ai-answer";
import { SparkIcon } from "./icons";
import { Button, Notice, inputClass } from "./ui";

interface ToolAudit {
  tool: string;
  arguments: unknown;
  ok: boolean;
  returnedPropertyIds: string[];
}

export interface PanelMessage {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  structured: CheckedAnswer | null;
  toolCalls: ToolAudit[];
  errorCode: string | null;
}

export interface InvestigationContext {
  propertyIds?: string[];
  issueId?: string;
  documentId?: string;
  label?: string;
}

const DEFAULT_QUESTIONS = [
  "Which properties have the most significant data quality issues?",
  "Which property records contain conflicting information?",
  "Which records require additional verification?",
  "What information is missing before these properties can be compared reliably?",
];

export function InvestigationPanel({
  conversationId: initialId,
  messages: initialMessages,
  context,
  aiConfigured,
  suggestions = DEFAULT_QUESTIONS,
}: {
  conversationId?: string;
  messages: PanelMessage[];
  context?: InvestigationContext;
  aiConfigured: boolean;
  suggestions?: string[];
}) {
  const router = useRouter();
  const [conversationId, setConversationId] = useState(initialId);
  const [messages, setMessages] = useState(initialMessages);
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(text: string) {
    const q = text.trim();
    if (q.length < 3 || pending) return;
    setPending(true);
    setError(null);
    setMessages((m) => [...m, { id: `local-${Date.now()}`, role: "USER", content: q, structured: null, toolCalls: [], errorCode: null }]);
    setQuestion("");
    try {
      const res = await fetch("/api/ai/investigate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId,
          question: q,
          context: context ? { propertyIds: context.propertyIds, issueId: context.issueId, documentId: context.documentId } : undefined,
        }),
      });
      const body = await res.json().catch(() => null);
      if (body?.conversationId && !conversationId) setConversationId(body.conversationId);
      if (!res.ok) {
        setError(body?.error?.message ?? "The request failed.");
        return;
      }
      setMessages((m) => [...m, { id: body.messageId, role: "ASSISTANT", content: body.answer.answer, structured: body.answer, toolCalls: body.toolCalls, errorCode: null }]);
      if (!conversationId) {
        setConversationId(body.conversationId);
        // Make the conversation addressable (and listed) without losing the rendered answer.
        window.history.replaceState(null, "", `/investigate?c=${body.conversationId}`);
      }
      router.refresh();
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  }

  if (!aiConfigured) {
    return (
      <Notice tone="info" title="AI investigation is not configured">
        Set <code>OPENAI_API_KEY</code> (and optionally <code>OPENAI_MODEL</code>) in the server environment to enable grounded AI questions.
        Data quality checks, comparisons and exports work without it.
      </Notice>
    );
  }

  return (
    <div className="space-y-4">
      {context?.label && (
        <div className="flex items-center gap-2 text-xs text-ink-2">
          <span className="text-ink-3">Context:</span>
          <span className="rounded bg-surface-2 px-1.5 py-0.5 font-medium">{context.label}</span>
        </div>
      )}

      {messages.length === 0 && (
        <div>
          <div className="mb-2 text-xs font-medium text-ink-3">Suggested questions</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((s) => (
              <button key={s} type="button" onClick={() => ask(s)} disabled={pending} className="rounded-full border border-border-strong bg-surface-1 px-3 py-1 text-left text-xs text-ink-2 hover:bg-surface-2 disabled:opacity-50">
                {s}
              </button>
            ))}
          </div>
        </div>
      )}

      <ol className="space-y-4" aria-live="polite">
        {messages.map((m) =>
          m.role === "USER" ? (
            <li key={m.id} className="ml-auto max-w-2xl rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink">{m.content}</li>
          ) : (
            <li key={m.id} className="rounded-lg border border-border bg-surface-0 p-3">
              {m.errorCode ? (
                <p className="text-sm text-critical-text">This request failed ({m.errorCode.toLowerCase().replace("_", " ")}).</p>
              ) : m.structured ? (
                <AiAnswer answer={m.structured} />
              ) : (
                <p className="text-sm">{m.content}</p>
              )}
              {m.toolCalls.length > 0 && (
                <details className="mt-3 text-xs text-ink-3">
                  <summary className="cursor-pointer select-none">Data retrieved ({m.toolCalls.length} validated quer{m.toolCalls.length === 1 ? "y" : "ies"})</summary>
                  <ul className="mt-1 space-y-1 font-mono">
                    {m.toolCalls.map((t, i) => (
                      <li key={i} className="break-all">
                        {t.ok ? "✓" : "✗"} {t.tool}({JSON.stringify(t.arguments)}) → {t.returnedPropertyIds.length} record(s)
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </li>
          ),
        )}
        {pending && (
          <li className="flex items-center gap-2 rounded-lg border border-border bg-surface-0 p-3 text-sm text-ink-2" aria-busy="true">
            <SparkIcon className="animate-spin" /> Retrieving records and analyzing…
          </li>
        )}
      </ol>

      {error && <Notice tone="error">{error}</Notice>}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          ask(question);
        }}
        className="flex flex-col gap-2 sm:flex-row"
      >
        <label htmlFor="question" className="sr-only">Question</label>
        <textarea
          id="question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              ask(question);
            }
          }}
          rows={2}
          maxLength={2000}
          placeholder="Ask about records, issues, comparisons or documents…"
          className={`${inputClass} flex-1 resize-y`}
        />
        <Button type="submit" variant="primary" disabled={pending || question.trim().length < 3} className="sm:self-end">
          <SparkIcon />
          Ask
        </Button>
      </form>
      <p className="text-xs text-ink-3">The assistant can only read data through validated, read-only queries. It cannot modify records or run SQL.</p>
    </div>
  );
}
