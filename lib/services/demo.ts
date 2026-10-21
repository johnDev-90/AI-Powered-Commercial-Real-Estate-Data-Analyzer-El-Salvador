import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { suggestAreaUnit, suggestMapping, type ImportOptions } from "@/lib/csv/mapping";
import { commitImport, createImport, type ImportResult } from "./import-service";

/** The synthetic sample files and the parsing options they need. */
export const DEMO_SAMPLES = [
  { file: "properties-portfolio.csv", decimalSeparator: ".", dateFormat: "DMY" },
  { file: "listados-corredor.csv", decimalSeparator: ",", dateFormat: "DMY" },
] as const;

/** Load the SYNTHETIC demo dataset through the regular import pipeline. */
export async function loadDemoData(): Promise<Array<ImportResult & { file: string }>> {
  const results: Array<ImportResult & { file: string }> = [];
  for (const sample of DEMO_SAMPLES) {
    const content = await readFile(join(process.cwd(), "public", "samples", sample.file), "utf8");
    const created = await createImport(sample.file, content);
    const mapping = suggestMapping(created.headers);
    const options: ImportOptions = {
      decimalSeparator: sample.decimalSeparator,
      dateFormat: sample.dateFormat,
      landAreaUnit: suggestAreaUnit(mapping.landArea),
      buildingAreaUnit: suggestAreaUnit(mapping.buildingArea),
      isSynthetic: true,
    };
    results.push({ file: sample.file, ...(await commitImport(created.importId, mapping, options, "SEED")) });
  }
  return results;
}
