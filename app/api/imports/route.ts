import { CsvParseError } from "@/lib/csv/parse";
import { createImport, MAX_CSV_BYTES } from "@/lib/services/import-service";

/** Step 1 of an import: upload and parse the file; returns headers, preview and suggested mapping. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Choose a CSV file to upload." }, { status: 400 });
  if (file.size === 0) return Response.json({ error: "The file is empty." }, { status: 400 });
  if (file.size > MAX_CSV_BYTES) return Response.json({ error: `The file exceeds ${MAX_CSV_BYTES / 1024 / 1024} MB.` }, { status: 413 });
  if (!/\.(csv|txt)$/i.test(file.name)) return Response.json({ error: "Only .csv files are supported." }, { status: 415 });

  const text = new TextDecoder("utf-8", { fatal: false }).decode(await file.arrayBuffer());
  if (text.includes("\u0000")) return Response.json({ error: "The file appears to be binary, not CSV text." }, { status: 415 });
  try {
    return Response.json(await createImport(file.name, text));
  } catch (error) {
    if (error instanceof CsvParseError) return Response.json({ error: error.message }, { status: 422 });
    console.error("CSV upload failed", error);
    return Response.json({ error: "The file could not be processed." }, { status: 500 });
  }
}
