// The one Anthropic API client (AI-02; docs/architecture.md §1). Only the AI
// integrations listed there call it. Plain fetch to the Messages API, no SDK.
// A call asks for JSON in one shape: the model must answer through a single
// tool whose input schema is the caller's Zod schema, and the reply is parsed
// with that schema before anyone uses it. Never retried here: each call is
// billed, and the owner decides whether to try again.
import {
  AI_MODEL,
  AI_TIMEOUT_MS,
  type AiErrorCode,
  ANTHROPIC_VERSION,
} from "@projects-lab/shared";
import { toJSONSchema, type ZodObject, type z } from "zod";

const MESSAGES = "https://api.anthropic.com/v1/messages";

/** An AI call that failed, with what the owner can do about it. */
export class AiError extends Error {
  constructor(
    readonly code: AiErrorCode,
    message: string,
    /** Seconds until the API takes calls again (ai_rate_limited). */
    readonly retryAfter?: number,
  ) {
    super(message);
    this.name = "AiError";
  }
}

/** How a route answers each failure: 502 the call went wrong, 503 try later, 504 too slow. */
export const AI_ERROR_STATUS: Record<AiErrorCode, 502 | 503 | 504> = {
  ai_key_missing: 502,
  ai_key_invalid: 502,
  ai_rate_limited: 503,
  ai_overloaded: 503,
  ai_timeout: 504,
  ai_refused: 502,
  ai_bad_reply: 502,
};

export interface AiDeps {
  key: string;
  fetch: typeof fetch;
}

/** The key from the Worker's env. Read outside any `try`: missing is its own named error. */
export function aiDeps(env: Env): AiDeps {
  const key = env.ANTHROPIC_API_KEY;
  if (!key)
    throw new AiError(
      "ai_key_missing",
      "ANTHROPIC_API_KEY is unset: locally, add it to packages/api/.dev.vars; " +
        "in production the owner runs `wrangler secret put ANTHROPIC_API_KEY` " +
        "with a key from console.anthropic.com (set a monthly spend limit there).",
    );
  return { key, fetch: (input, init) => fetch(input, init) };
}

export interface JsonRequest<Schema extends ZodObject> {
  /** Instructions the model follows (the integration's rules). */
  system: string;
  /** What to do this time, with the material it works from. */
  prompt: string;
  /** The answer's shape; the reply is parsed with it. */
  schema: Schema;
  /** The tool the model answers through, e.g. "write_exam". */
  tool: { name: string; description: string };
  maxTokens: number;
}

/** The answer the model gives through the tool, checked against `schema`. */
export async function askForJson<Schema extends ZodObject>(
  deps: AiDeps,
  request: JsonRequest<Schema>,
): Promise<z.infer<Schema>> {
  const { $schema: _, ...inputSchema } = toJSONSchema(request.schema, {
    io: "input",
  }) as Record<string, unknown>;

  let response: Response;
  try {
    response = await deps.fetch(MESSAGES, {
      method: "POST",
      headers: {
        "x-api-key": deps.key,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: AI_MODEL,
        max_tokens: request.maxTokens,
        system: request.system,
        messages: [{ role: "user", content: request.prompt }],
        tools: [
          {
            name: request.tool.name,
            description: request.tool.description,
            input_schema: inputSchema,
          },
        ],
        tool_choice: { type: "tool", name: request.tool.name },
      }),
      signal: AbortSignal.timeout(AI_TIMEOUT_MS),
    });
  } catch (error) {
    if (error instanceof Error && error.name === "TimeoutError")
      throw new AiError(
        "ai_timeout",
        `The AI didn't answer within ${AI_TIMEOUT_MS / 1000} seconds. Try again.`,
      );
    throw new AiError(
      "ai_overloaded",
      "Couldn't reach the AI service. Try again in a moment.",
    );
  }

  if (!response.ok) throw await failure(response);

  const reply = (await response.json().catch(() => null)) as {
    stop_reason?: string;
    content?: { type: string; name?: string; input?: unknown }[];
  } | null;
  if (reply?.stop_reason === "max_tokens")
    throw new AiError(
      "ai_bad_reply",
      "The AI's answer was cut off before it finished. Try again with less.",
    );
  const call = reply?.content?.find(
    (block) => block.type === "tool_use" && block.name === request.tool.name,
  );
  if (!call)
    throw new AiError(
      "ai_bad_reply",
      "The AI answered without the expected result. Try again.",
    );
  const parsed = request.schema.safeParse(call.input);
  if (!parsed.success)
    throw new AiError(
      "ai_bad_reply",
      "The AI's answer wasn't in the expected shape. Try again.",
    );
  return parsed.data;
}

/** A non-2xx answer from the API, named. The body's message never carries the key. */
async function failure(response: Response): Promise<AiError> {
  const body = (await response.json().catch(() => null)) as {
    error?: { message?: string };
  } | null;
  const detail = body?.error?.message;
  switch (true) {
    case response.status === 401 || response.status === 403:
      return new AiError(
        "ai_key_invalid",
        "ANTHROPIC_API_KEY was refused: create a new key at console.anthropic.com " +
          "and set it again (`wrangler secret put ANTHROPIC_API_KEY`).",
      );
    case response.status === 429: {
      const retryAfter =
        Number(response.headers.get("retry-after")) || undefined;
      return new AiError(
        "ai_rate_limited",
        "The AI service's rate limit was reached. Try again in a minute.",
        retryAfter,
      );
    }
    case response.status === 529 || response.status >= 500:
      return new AiError(
        "ai_overloaded",
        "The AI service is busy. Try again in a moment.",
      );
    default:
      return new AiError(
        "ai_refused",
        `The AI service refused the request${detail ? `: ${detail}` : "."}`,
      );
  }
}
