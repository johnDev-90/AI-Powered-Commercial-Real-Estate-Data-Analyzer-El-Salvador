import { compareIdsSchema } from "@/lib/services/compare";
import { exportComparison } from "@/lib/services/exports";

export async function GET(request: Request) {
  const ids = compareIdsSchema.parse(new URL(request.url).searchParams.get("ids") ?? "");
  if (ids.length === 0) return Response.json({ error: "Provide ids=<id1>,<id2>" }, { status: 400 });
  return exportComparison(ids);
}
