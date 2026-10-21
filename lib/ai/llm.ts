import "server-only";
import OpenAI from "openai";

/** Provider-agnostic chat types used by the investigation and document services. */
export type ChatMessage =
  | { role: "system" | "user"; content: string }
  | { role: "assistant"; content: string | null; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string };

export interface ToolCall {
  id: string;
  name: string;
  arguments: string;
}

export interface ToolSpec {
  name: string;
  description: string;
  /** JSON Schema for the arguments. */
  parameters: Record<string, unknown>;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  tools?: ToolSpec[];
  /** When set, the final answer must be JSON matching this schema. */
  responseFormat?: { name: string; schema: Record<string, unknown> };
  maxOutputTokens?: number;
  signal?: AbortSignal;
}

export interface CompletionResult {
  content: string | null;
  toolCalls: ToolCall[];
  usage?: { inputTokens: number; outputTokens: number };
  model: string;
}

export interface LlmClient {
  readonly model: string;
  complete(request: CompletionRequest): Promise<CompletionResult>;
}

export type AiErrorCode = "NOT_CONFIGURED" | "RATE_LIMITED" | "TIMEOUT" | "AUTH" | "UPSTREAM" | "INVALID_OUTPUT" | "BAD_REQUEST";

export class AiError extends Error {
  constructor(public code: AiErrorCode, message: string) {
    super(message);
  }
}

export const AI_ERROR_MESSAGES: Record<AiErrorCode, string> = {
  NOT_CONFIGURED: "AI analysis is not configured. Set OPENAI_API_KEY on the server to enable it. All deterministic features keep working.",
  RATE_LIMITED: "The AI provider is rate-limiting requests. Wait a moment and try again.",
  TIMEOUT: "The AI provider did not respond in time. Try again or ask a narrower question.",
  AUTH: "The AI provider rejected the API key. Check OPENAI_API_KEY on the server.",
  UPSTREAM: "The AI provider returned an error. Try again later.",
  INVALID_OUTPUT: "The AI response could not be validated, so it was discarded. Try rephrasing the question.",
  BAD_REQUEST: "The AI request was rejected. Try a shorter question.",
};

export function aiConfig() {
  return {
    apiKey: process.env.OPENAI_API_KEY?.trim() || null,
    model: process.env.OPENAI_MODEL?.trim() || "gpt-5.4-mini",
    timeoutMs: Number(process.env.OPENAI_TIMEOUT_MS ?? 45_000),
  };
}

export function isAiConfigured(): boolean {
  return Boolean(aiConfig().apiKey);
}

/** Map SDK/network errors to stable codes shown to users. */
export function toAiError(error: unknown): AiError {
  if (error instanceof AiError) return error;
  if (error instanceof OpenAI.APIConnectionTimeoutError) return new AiError("TIMEOUT", "Request timed out");
  if (error instanceof OpenAI.RateLimitError) return new AiError("RATE_LIMITED", "Rate limited");
  if (error instanceof OpenAI.AuthenticationError || error instanceof OpenAI.PermissionDeniedError) return new AiError("AUTH", "Authentication failed");
  if (error instanceof OpenAI.BadRequestError) return new AiError("BAD_REQUEST", error.message);
  if (error instanceof OpenAI.APIError) return new AiError("UPSTREAM", error.message);
  if (error instanceof Error && error.name === "AbortError") return new AiError("TIMEOUT", "Request aborted");
  return new AiError("UPSTREAM", error instanceof Error ? error.message : "Unknown AI error");
}

class OpenAiClient implements LlmClient {
  private client: OpenAI;
  constructor(apiKey: string, readonly model: string, timeoutMs: number) {
    // The SDK retries 429 / 5xx / connection errors with exponential backoff.
    this.client = new OpenAI({ apiKey, timeout: timeoutMs, maxRetries: 2 });
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    try {
      const response = await this.client.chat.completions.create(
        {
          model: this.model,
          messages: req.messages.map((m) => {
            if (m.role === "tool") return { role: "tool" as const, tool_call_id: m.toolCallId, content: m.content };
            if (m.role === "assistant") {
              return {
                role: "assistant" as const,
                content: m.content,
                ...(m.toolCalls?.length
                  ? { tool_calls: m.toolCalls.map((c) => ({ id: c.id, type: "function" as const, function: { name: c.name, arguments: c.arguments } })) }
                  : {}),
              };
            }
            return { role: m.role, content: m.content };
          }),
          ...(req.tools?.length
            ? { tools: req.tools.map((t) => ({ type: "function" as const, function: { name: t.name, description: t.description, parameters: t.parameters } })) }
            : {}),
          ...(req.responseFormat
            ? { response_format: { type: "json_schema" as const, json_schema: { name: req.responseFormat.name, schema: req.responseFormat.schema, strict: true } } }
            : {}),
          max_completion_tokens: req.maxOutputTokens ?? 2000,
        },
        { signal: req.signal },
      );
      const choice = response.choices[0];
      return {
        content: choice?.message.content ?? null,
        toolCalls: (choice?.message.tool_calls ?? [])
          .filter((c) => c.type === "function")
          .map((c) => ({ id: c.id, name: c.function.name, arguments: c.function.arguments })),
        usage: response.usage ? { inputTokens: response.usage.prompt_tokens, outputTokens: response.usage.completion_tokens } : undefined,
        model: response.model,
      };
    } catch (error) {
      throw toAiError(error);
    }
  }
}

let override: LlmClient | null = null;

/** Tests inject a scripted client; production uses OpenAI. */
export function setLlmClientForTesting(client: LlmClient | null): void {
  override = client;
}

export function getLlmClient(): LlmClient {
  if (override) return override;
  const config = aiConfig();
  if (!config.apiKey) throw new AiError("NOT_CONFIGURED", "OPENAI_API_KEY is not set");
  return new OpenAiClient(config.apiKey, config.model, config.timeoutMs);
}
