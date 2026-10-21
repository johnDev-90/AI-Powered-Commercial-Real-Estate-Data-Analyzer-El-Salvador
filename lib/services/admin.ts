import { getDb } from "@/lib/db";

/** Delete every record (used by the demo reset). Order respects foreign keys. */
export async function deleteAllData(): Promise<void> {
  const db = getDb();
  await db.$transaction([
    db.aIMessage.deleteMany(),
    db.aIConversation.deleteMany(),
    db.issueReviewEvent.deleteMany(),
    db.dataQualityIssue.deleteMany(),
    db.propertyDocument.deleteMany(),
    db.importRow.deleteMany(),
    db.analysisRun.deleteMany(),
    db.property.deleteMany(),
    db.dataImport.deleteMany(),
  ]);
}
