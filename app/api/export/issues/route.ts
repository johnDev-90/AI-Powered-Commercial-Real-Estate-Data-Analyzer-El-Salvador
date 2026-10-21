import { exportIssues } from "@/lib/services/exports";
import { issueListQuerySchema } from "@/lib/validation/issues";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return exportIssues(issueListQuerySchema.parse(params));
}
