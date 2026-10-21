import { DocumentError } from "@/lib/documents/pdf";
import { analyzeDocument } from "@/lib/services/documents";

export const maxDuration = 60;

export async function POST(_request: Request, ctx: RouteContext<"/api/documents/[id]/analyze">) {
  const { id } = await ctx.params;
  try {
    return Response.json(await analyzeDocument(id));
  } catch (error) {
    if (error instanceof DocumentError) return Response.json({ error: error.message }, { status: 404 });
    console.error("Document re-analysis failed", error);
    return Response.json({ error: "The document could not be analyzed." }, { status: 500 });
  }
}
