import { commitImportSchema } from "@/lib/csv/mapping";
import { commitImport, ImportError } from "@/lib/services/import-service";

export const maxDuration = 60;

/** Step 2 of an import: apply the column mapping and options, persist atomically, run analysis. */
export async function POST(request: Request, ctx: RouteContext<"/api/imports/[id]/commit">) {
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  const parsed = commitImportSchema.safeParse(body);
  if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? "Invalid mapping." }, { status: 400 });
  try {
    return Response.json(await commitImport(id, parsed.data.mapping, parsed.data.options));
  } catch (error) {
    if (error instanceof ImportError) return Response.json({ error: error.message }, { status: 409 });
    console.error("Import commit failed", error);
    return Response.json({ error: "The import failed and was rolled back. No records were created." }, { status: 500 });
  }
}
