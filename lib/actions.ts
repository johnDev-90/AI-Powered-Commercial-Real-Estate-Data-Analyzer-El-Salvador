"use server";

import { redirect } from "next/navigation";
import { refresh } from "next/cache";
import { getDb } from "@/lib/db";
import { runAnalysis } from "@/lib/quality/engine";
import { issueReviewSchema } from "@/lib/validation/issues";
import { propertyFormSchema } from "@/lib/validation/property";
import { loadDemoData } from "@/lib/services/demo";
import { createProperty, updateProperty } from "@/lib/services/properties";
import { IssueTransitionError, reviewIssue } from "@/lib/services/issues";

export interface ActionState {
  ok: boolean;
  message?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

export async function loadDemoDataAction(): Promise<ActionState> {
  try {
    const existing = await getDb().property.count();
    if (existing > 0) return { ok: false, message: "The database already contains properties. Demo data is only loaded into an empty database." };
    const results = await loadDemoData();
    refresh();
    const total = results.reduce((n, r) => n + r.accepted + r.flagged, 0);
    return { ok: true, message: `Loaded ${total} synthetic properties.` };
  } catch (error) {
    console.error(error);
    return { ok: false, message: "Could not load the demo data. Check the database connection and try again." };
  }
}

export async function runAnalysisAction(): Promise<ActionState> {
  try {
    const summary = await runAnalysis("MANUAL");
    refresh();
    return {
      ok: true,
      message: `Analysis complete: ${summary.issuesDetected} issues detected (${summary.issuesNew} new, ${summary.issuesAutoResolved} no longer detected, ${summary.issuesReopened} reopened).`,
    };
  } catch (error) {
    console.error(error);
    return { ok: false, message: "The analysis failed. No issues were changed." };
  }
}

export async function savePropertyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const id = formData.get("id");
  const parsed = propertyFormSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, message: "Please correct the highlighted fields.", fieldErrors: parsed.error.flatten().fieldErrors };
  }
  let targetId: string;
  try {
    if (typeof id === "string" && id.length > 0) {
      const exists = await getDb().property.findUnique({ where: { id }, select: { id: true } });
      if (!exists) return { ok: false, message: "This property no longer exists." };
      await updateProperty(id, parsed.data);
      targetId = id;
    } else {
      targetId = (await createProperty(parsed.data)).id;
    }
  } catch (error) {
    console.error(error);
    return { ok: false, message: "The property could not be saved. Please try again." };
  }
  redirect(`/properties/${targetId}?saved=1`);
}

export async function reviewIssueAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = issueReviewSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, message: "Invalid review request." };
  try {
    await reviewIssue(parsed.data.issueId, parsed.data.status, parsed.data.note);
  } catch (error) {
    if (error instanceof IssueTransitionError) return { ok: false, message: error.message };
    console.error(error);
    return { ok: false, message: "The review could not be saved." };
  }
  refresh();
  return { ok: true, message: `Issue marked ${parsed.data.status.toLowerCase()}.` };
}
