import Link from "next/link";
import { BASIS_LABELS, type CheckedAnswer, type FindingBasis } from "@/lib/ai/answer";
import { FIELD_LABELS } from "@/lib/domain/labels";
import { cx } from "./ui";

const BASIS_STYLE: Record<FindingBasis, string> = {
  DATABASE_RECORD: "border-[#cde2fb] bg-accent-soft text-accent-strong",
  DETECTED_ISSUE: "border-[#cde2fb] bg-accent-soft text-accent-strong",
  USER_PROVIDED: "border-border-strong bg-surface-2 text-ink-2",
  DOCUMENT_EXTRACT: "border-border-strong bg-surface-2 text-ink-2",
  AI_INTERPRETATION: "border-dashed border-border-strong bg-surface-1 text-ink-2",
};

/** Renders an AI answer with its evidence basis and citations to property records. */
export function AiAnswer({ answer }: { answer: CheckedAnswer }) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-xs text-ink-3">
        <span className="rounded border border-dashed border-border-strong px-1.5 py-0.5">AI-generated</span>
        Grounded in records retrieved from the database. Verify before acting.
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-line text-ink">{answer.answer}</p>

      {answer.findings.length > 0 && (
        <ul className="space-y-2">
          {answer.findings.map((f, i) => (
            <li key={i} className="rounded-md border border-border bg-surface-1 p-2.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className={cx("rounded border px-1.5 py-0.5 text-[11px] font-medium", BASIS_STYLE[f.basis])}>{BASIS_LABELS[f.basis]}</span>
                {f.properties.map((p) => (
                  <Link key={p.id} href={`/properties/${p.id}`} className="font-mono text-xs text-accent-strong hover:underline">
                    {p.referenceCode ?? p.id.slice(0, 10)}
                  </Link>
                ))}
                {f.fields.map((field) => (
                  <span key={field} className="text-[11px] text-ink-3">{FIELD_LABELS[field] ?? field}</span>
                ))}
              </div>
              <p className="mt-1.5 text-sm text-ink">{f.statement}</p>
              {f.removedCitations > 0 && (
                <p className="mt-1 text-xs text-critical-text">{f.removedCitations} citation{f.removedCitations === 1 ? "" : "s"} removed: the record was not part of the retrieved data.</p>
              )}
            </li>
          ))}
        </ul>
      )}

      {answer.limitations.length > 0 && (
        <div className="rounded-md border border-[#f5d58a] bg-[#fdf6e3] p-2.5">
          <div className="text-xs font-semibold text-ink">Limitations</div>
          <ul className="mt-1 list-disc space-y-0.5 pl-4 text-sm text-ink-2">
            {answer.limitations.map((l, i) => <li key={i}>{l}</li>)}
          </ul>
        </div>
      )}
      {answer.citationWarnings > 0 && (
        <p className="text-xs text-critical-text">The grounding check removed {answer.citationWarnings} unsupported citation(s) from this answer.</p>
      )}
    </div>
  );
}
