import { AI_ERROR_MESSAGES, AiError } from "@/lib/ai/llm";
import { investigate, investigationRequestSchema } from "@/lib/ai/investigate";

export const maxDuration = 60;

const STATUS: Record<string, number> = { NOT_CONFIGURED: 503, RATE_LIMITED: 429, TIMEOUT: 504, AUTH: 502, UPSTREAM: 502, INVALID_OUTPUT: 502, BAD_REQUEST: 400 };

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: "BAD_REQUEST", message: "Request body must be JSON." } }, { status: 400 });
  }
  const parsed = investigationRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: { code: "BAD_REQUEST", message: parsed.error.issues[0]?.message ?? "Invalid request." } }, { status: 400 });
  }
  try {
    const result = await investigate(parsed.data);
    return Response.json(result);
  } catch (error) {
    if (error instanceof AiError) {
      const conversationId = (error as AiError & { conversationId?: string }).conversationId;
      return Response.json({ error: { code: error.code, message: AI_ERROR_MESSAGES[error.code] }, conversationId }, { status: STATUS[error.code] ?? 502 });
    }
    console.error("Investigation failed", error);
    return Response.json({ error: { code: "UPSTREAM", message: "The investigation failed unexpectedly." } }, { status: 500 });
  }
}
