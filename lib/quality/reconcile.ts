import type { IssueStatus } from "@/lib/generated/prisma/enums";
import { fingerprintOf, type Detection } from "./types";

export interface ExistingIssue {
  id: string;
  fingerprint: string;
  status: IssueStatus;
  severity: string;
  observedValue: string | null;
  expectedValue: string | null;
  explanation: string;
}

export interface ReconcilePlan {
  create: Array<Detection & { fingerprint: string }>;
  /** Still detected: refresh lastDetectedAt (and details when they changed). */
  stillDetected: Array<{ id: string; detection: Detection; detailsChanged: boolean }>;
  /** Resolved earlier but detected again: reopen. */
  reopen: Array<{ id: string; detection: Detection }>;
  /** Open but no longer detected: resolve automatically. */
  autoResolve: Array<{ id: string }>;
}

/**
 * Decide how a new set of detections changes stored issues.
 * - DISMISSED issues stay dismissed (a reviewer accepted them), but are refreshed.
 * - RESOLVED issues that reappear are reopened.
 * - OPEN issues no longer detected are resolved by the system.
 */
export function reconcile(existing: ExistingIssue[], detections: Detection[]): ReconcilePlan {
  const plan: ReconcilePlan = { create: [], stillDetected: [], reopen: [], autoResolve: [] };
  const byFingerprint = new Map(existing.map((e) => [e.fingerprint, e]));
  const seen = new Set<string>();

  for (const detection of detections) {
    const fingerprint = fingerprintOf(detection);
    if (seen.has(fingerprint)) continue;
    seen.add(fingerprint);
    const current = byFingerprint.get(fingerprint);
    if (!current) {
      plan.create.push({ ...detection, fingerprint });
      continue;
    }
    if (current.status === "RESOLVED") {
      plan.reopen.push({ id: current.id, detection });
      continue;
    }
    const detailsChanged =
      current.severity !== detection.severity ||
      current.observedValue !== (detection.observedValue ?? null) ||
      current.expectedValue !== (detection.expectedValue ?? null) ||
      current.explanation !== detection.explanation;
    plan.stillDetected.push({ id: current.id, detection, detailsChanged });
  }

  for (const issue of existing) {
    if (issue.status === "OPEN" && !seen.has(issue.fingerprint)) plan.autoResolve.push({ id: issue.id });
  }
  return plan;
}
