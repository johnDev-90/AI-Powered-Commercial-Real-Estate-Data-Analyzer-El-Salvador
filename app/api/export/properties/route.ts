import { exportProperties } from "@/lib/services/exports";
import { propertyListQuerySchema } from "@/lib/validation/property";

export async function GET(request: Request) {
  const params = Object.fromEntries(new URL(request.url).searchParams);
  return exportProperties(propertyListQuerySchema.parse(params));
}
