import "server-only";
import type { AnalysisTrigger } from "@/lib/generated/prisma/enums";
import { getDb, withTransaction, type Db } from "@/lib/db";
import type { RowMessage } from "@/lib/csv/normalize";
import { runRowRules } from "./row-rules";
import {
  findDuplicateIdentifierPairs,
  findPotentialDuplicatePairs,
  findPricePerM2Outliers,
  findSamePropertyPairs,
} from "./sql-rules";
import { conflictDetections, duplicateIdentifierDetections, outlierDetections, potentialDuplicateDetections } from "./cross-rules";
import { reconcile } from "./reconcile";
import { ENGINE_RULES, RULES_VERSION, type Detection, type PropertySnapshot } from "./types";

export async function loadSnapshots(db: Db): Promise<PropertySnapshot[]> {
  const rows = await db.property.findMany({
    select: {
      id: true, referenceCode: true, name: true, address: true, normalizedAddress: true, municipality: true,
      department: true, propertyType: true, rawPropertyType: true, cadastralId: true, landAreaM2: true,
      buildingAreaM2: true, askingPriceUsd: true, pricePerM2Usd: true, sourcePricePerM2: true,
      verificationStatus: true, sourceUpdatedAt: true,
      importRow: { select: { messages: true } },
    },
  });
  return rows.map(({ importRow, ...p }) => ({
    ...p,
    importMessages: Array.isArray(importRow?.messages) ? (importRow.messages as unknown as RowMessage[]) : [],
  }));
}

/** Run all deterministic rules against the current data. Read-only. */
export async function detectAll(db: Db, now = new Date()): Promise<{ detections: Detection[]; scanned: number }> {
  const snapshots = await loadSnapshots(db);
  const byId = new Map(snapshots.map((s) => [s.id, s]));
  const [dupIds, samePairs, potential, outliers] = await Promise.all([
    findDuplicateIdentifierPairs(db),
    findSamePropertyPairs(db),
    findPotentialDuplicatePairs(db),
    findPricePerM2Outliers(db),
  ]);
  const detections = [
    ...snapshots.flatMap((s) => runRowRules(s, now)),
    ...duplicateIdentifierDetections(dupIds),
    ...conflictDetections(samePairs, byId),
    ...potentialDuplicateDetections(potential, byId),
    ...outlierDetections(outliers, byId),
  ];
  return { detections, scanned: snapshots.length };
}

export interface AnalysisSummary {
  runId: string;
  propertiesScanned: number;
  issuesDetected: number;
  issuesNew: number;
  issuesReopened: number;
  issuesAutoResolved: number;
}

/**
 * Full analysis run: detect, then reconcile with stored issues in one transaction so
 * review decisions are preserved and every status change is recorded.
 */
export async function runAnalysis(trigger: AnalysisTrigger, importId?: string): Promise<AnalysisSummary> {
  const db = getDb();
  const run = await db.analysisRun.create({
    data: { trigger, importId, rulesVersion: RULES_VERSION, status: "RUNNING" },
  });

  try {
    const summary = await withTransaction(async (tx) => {
      const { detections, scanned } = await detectAll(tx);
      const existing = await tx.dataQualityIssue.findMany({
        where: { ruleCode: { in: ENGINE_RULES } },
        select: { id: true, fingerprint: true, status: true, severity: true, observedValue: true, expectedValue: true, explanation: true },
      });
      const plan = reconcile(existing, detections);
      const now = new Date();

      if (plan.create.length > 0) {
        await tx.dataQualityIssue.createMany({
          data: plan.create.map((d) => ({
            fingerprint: d.fingerprint,
            ruleCode: d.ruleCode,
            category: d.category,
            severity: d.severity,
            propertyId: d.propertyId,
            relatedPropertyId: d.relatedPropertyId ?? null,
            field: d.field ?? null,
            observedValue: d.observedValue ?? null,
            expectedValue: d.expectedValue ?? null,
            explanation: d.explanation,
            recommendation: d.recommendation,
            firstRunId: run.id,
            detectedAt: now,
            lastDetectedAt: now,
          })),
          skipDuplicates: true,
        });
      }

      const unchangedIds = plan.stillDetected.filter((s) => !s.detailsChanged).map((s) => s.id);
      if (unchangedIds.length > 0) {
        await tx.dataQualityIssue.updateMany({ where: { id: { in: unchangedIds } }, data: { lastDetectedAt: now } });
      }
      for (const s of plan.stillDetected.filter((x) => x.detailsChanged)) {
        await tx.dataQualityIssue.update({ where: { id: s.id }, data: detailFields(s.detection, now) });
      }
      for (const r of plan.reopen) {
        await tx.dataQualityIssue.update({ where: { id: r.id }, data: { ...detailFields(r.detection, now), status: "OPEN" } });
      }
      if (plan.autoResolve.length > 0) {
        await tx.dataQualityIssue.updateMany({ where: { id: { in: plan.autoResolve.map((a) => a.id) } }, data: { status: "RESOLVED" } });
      }
      const events = [
        ...plan.reopen.map((r) => ({ issueId: r.id, fromStatus: "RESOLVED" as const, toStatus: "OPEN" as const, note: `Detected again by analysis run ${run.id}.`, actor: "system" })),
        ...plan.autoResolve.map((a) => ({ issueId: a.id, fromStatus: "OPEN" as const, toStatus: "RESOLVED" as const, note: `No longer detected by analysis run ${run.id}.`, actor: "system" })),
      ];
      if (events.length > 0) await tx.issueReviewEvent.createMany({ data: events });

      return {
        propertiesScanned: scanned,
        issuesDetected: plan.create.length + plan.stillDetected.length + plan.reopen.length,
        issuesNew: plan.create.length,
        issuesReopened: plan.reopen.length,
        issuesAutoResolved: plan.autoResolve.length,
      };
    }, 120_000);

    await db.analysisRun.update({ where: { id: run.id }, data: { ...summary, status: "COMPLETED", finishedAt: new Date() } });
    return { runId: run.id, ...summary };
  } catch (error) {
    await db.analysisRun.update({
      where: { id: run.id },
      data: { status: "FAILED", finishedAt: new Date(), errorMessage: error instanceof Error ? error.message.slice(0, 2000) : "Unknown error" },
    });
    throw error;
  }
}

function detailFields(d: Detection, now: Date) {
  return {
    severity: d.severity,
    observedValue: d.observedValue ?? null,
    expectedValue: d.expectedValue ?? null,
    explanation: d.explanation,
    recommendation: d.recommendation,
    lastDetectedAt: now,
  };
}
