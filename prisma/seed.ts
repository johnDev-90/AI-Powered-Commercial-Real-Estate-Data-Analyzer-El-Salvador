/**
 * Loads the SYNTHETIC demo dataset through the same import pipeline users run.
 *
 *   npm run db:seed                 # import samples (warns if data already exists)
 *   npm run db:seed -- --if-empty   # only when the database has no properties (used on deploy)
 *   npm run db:reset-demo           # delete ALL data, then import samples
 */
import "dotenv/config";
import { getDb } from "@/lib/db";
import { deleteAllData } from "@/lib/services/admin";
import { loadDemoData } from "@/lib/services/demo";

async function main() {
  const args = process.argv.slice(2);
  const db = getDb();
  const count = await db.property.count();

  if (args.includes("--reset")) {
    await deleteAllData();
    console.log("Deleted all data.");
  } else if (count > 0) {
    if (args.includes("--if-empty")) {
      console.log(`Database already has ${count} properties; skipping demo seed.`);
      return;
    }
    console.log(`Database already has ${count} properties; importing the samples again (duplicates will be flagged).`);
  }

  for (const r of await loadDemoData()) {
    console.log(
      `${r.file}: ${r.accepted} accepted, ${r.flagged} flagged, ${r.rejected} rejected` +
        (r.analysis ? `; ${r.analysis.issuesDetected} open issues after analysis` : `; analysis failed: ${r.analysisError}`),
    );
  }
}

main()
  .then(() => getDb().$disconnect())
  .catch(async (error) => {
    console.error(error);
    await getDb().$disconnect();
    process.exit(1);
  });
