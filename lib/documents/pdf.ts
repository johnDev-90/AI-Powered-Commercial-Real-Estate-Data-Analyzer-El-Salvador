import { extractText, getDocumentProxy } from "unpdf";

export const MAX_PDF_BYTES = 4 * 1024 * 1024; // under Vercel's 4.5 MB request limit
export const MAX_PDF_PAGES = 50;

export class DocumentError extends Error {}

export interface ExtractedPage {
  page: number;
  text: string;
}

/** Checks the %PDF magic bytes; the browser-supplied MIME type is not trusted. */
export function isPdf(bytes: Uint8Array): boolean {
  return bytes.length > 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46;
}

/** Extract text per page from a text-based PDF. Scanned (image-only) PDFs yield no text; OCR is out of scope. */
export async function extractPdfPages(bytes: Uint8Array): Promise<{ pages: ExtractedPage[]; totalPages: number }> {
  if (!isPdf(bytes)) throw new DocumentError("The file is not a valid PDF.");
  let pdf;
  try {
    // Copy: pdf.js may transfer/detach the buffer it receives.
    pdf = await getDocumentProxy(new Uint8Array(bytes));
  } catch {
    throw new DocumentError("The PDF could not be opened. It may be corrupted or password-protected.");
  }
  if (pdf.numPages > MAX_PDF_PAGES) throw new DocumentError(`The PDF has ${pdf.numPages} pages; the maximum is ${MAX_PDF_PAGES}.`);
  const { text, totalPages } = await extractText(pdf, { mergePages: false });
  const pages = text.map((t, i) => ({ page: i + 1, text: t.replace(/[ \t]+/g, " ").trim() }));
  if (pages.every((p) => p.text.length === 0)) {
    throw new DocumentError("No text could be extracted. The PDF appears to be scanned images; OCR is not supported in this version.");
  }
  return { pages, totalPages };
}
