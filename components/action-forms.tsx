"use client";

import { useActionState, useState } from "react";
import { loadDemoDataAction, reviewIssueAction, runAnalysisAction, type ActionState } from "@/lib/actions";
import type { IssueStatus } from "@/lib/generated/prisma/enums";
import { DatabaseIcon, RefreshIcon } from "./icons";
import { Button, Notice, inputClass, labelClass } from "./ui";

const initial: ActionState = { ok: false };

function Feedback({ state }: { state: ActionState }) {
  if (!state.message) return null;
  return <Notice tone={state.ok ? "success" : "error"}>{state.message}</Notice>;
}

export function LoadDemoDataButton() {
  const [state, action, pending] = useActionState(loadDemoDataAction, initial);
  return (
    <form action={action} className="flex flex-col items-center gap-3">
      <Button type="submit" variant="primary" disabled={pending}>
        <DatabaseIcon />
        {pending ? "Loading synthetic data…" : "Load synthetic demo data"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}

export function RunAnalysisButton() {
  const [state, action, pending] = useActionState(runAnalysisAction, initial);
  return (
    <form action={action} className="flex flex-col items-end gap-2">
      <Button type="submit" disabled={pending}>
        <RefreshIcon />
        {pending ? "Running analysis…" : "Re-run analysis"}
      </Button>
      {state.message && <div className="max-w-sm"><Feedback state={state} /></div>}
    </form>
  );
}

/** Resolve / dismiss / reopen with an optional note. Original records are never changed. */
export function IssueReviewForm({ issueId, status }: { issueId: string; status: IssueStatus }) {
  const [state, action, pending] = useActionState(reviewIssueAction, initial);
  const [note, setNote] = useState("");
  const options: Array<{ value: IssueStatus; label: string; variant: "primary" | "secondary" }> =
    status === "OPEN"
      ? [
          { value: "RESOLVED", label: "Mark resolved", variant: "primary" },
          { value: "DISMISSED", label: "Dismiss", variant: "secondary" },
        ]
      : [{ value: "OPEN", label: "Reopen", variant: "secondary" }];
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="issueId" value={issueId} />
      <div>
        <label htmlFor={`note-${issueId}`} className={labelClass}>Review note (optional)</label>
        <textarea
          id={`note-${issueId}`}
          name="note"
          rows={2}
          maxLength={1000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
          className={inputClass}
          placeholder={status === "OPEN" ? "e.g. Confirmed with broker; price updated on 2026-10-01" : "Reason for reopening"}
        />
      </div>
      <div className="flex flex-wrap gap-2">
        {options.map((o) => (
          <Button key={o.value} type="submit" name="status" value={o.value} variant={o.variant} disabled={pending}>
            {o.label}
          </Button>
        ))}
      </div>
      <Feedback state={state} />
    </form>
  );
}
