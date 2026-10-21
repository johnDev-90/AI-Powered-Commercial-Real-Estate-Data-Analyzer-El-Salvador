import { getDb } from "@/lib/db";

/** Download the original PDF. Served as an attachment so it never renders inline in the app origin. */
export async function GET(_request: Request, ctx: RouteContext<"/api/documents/[id]/file">) {
  const { id } = await ctx.params;
  const doc = await getDb().propertyDocument.findUnique({ where: { id }, select: { fileName: true, content: true } });
  if (!doc) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(doc.content), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${doc.fileName.replace(/[^\w.-]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
