import { z } from "zod";
import { DocumentError, MAX_PDF_BYTES } from "@/lib/documents/pdf";
import { analyzeDocument, uploadDocument } from "@/lib/services/documents";

export const maxDuration = 60;

const fieldsSchema = z.object({ propertyId: z.string().min(1).max(60) });

/** Upload a PDF for a property, extract its text and analyze it against the record. */
export async function POST(request: Request) {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "Expected a multipart form upload." }, { status: 400 });
  }
  const fields = fieldsSchema.safeParse({ propertyId: form.get("propertyId") });
  const file = form.get("file");
  if (!fields.success || !(file instanceof File)) return Response.json({ error: "A property and a PDF file are required." }, { status: 400 });
  if (file.size > MAX_PDF_BYTES) return Response.json({ error: `The file exceeds ${MAX_PDF_BYTES / 1024 / 1024} MB.` }, { status: 413 });

  try {
    const documentId = await uploadDocument(fields.data.propertyId, file.name || "document.pdf", new Uint8Array(await file.arrayBuffer()));
    // Text extraction succeeded; analysis failures leave the document available for retry.
    try {
      const analysis = await analyzeDocument(documentId);
      return Response.json({ documentId, ...analysis });
    } catch (error) {
      console.error("Document analysis failed", error);
      return Response.json({ documentId, analysisError: "The document was stored but could not be analyzed. Retry from the document page." });
    }
  } catch (error) {
    if (error instanceof DocumentError) return Response.json({ error: error.message }, { status: 422 });
    console.error("Document upload failed", error);
    return Response.json({ error: "The document could not be processed." }, { status: 500 });
  }
}
