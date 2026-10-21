// The Anthropic client (AI-02): the API is a stand-in on the global fetch, so
// nothing here reaches the real service or spends money.
import { env } from "cloudflare:workers";
import {
  AI_ERROR_CODES,
  AI_MODEL,
  AI_TIMEOUT_MS,
  ANTHROPIC_VERSION,
} from "@projects-lab/shared";
import { afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  AI_ERROR_STATUS,
  type AiDeps,
  AiError,
  aiDeps,
  askForJson,
} from "../src/core/ai";

const KEY = "sk-ant-test-key";
const answer = z.object({
  title: z.string(),
  questions: z.array(z.object({ stem: z.string(), points: z.number() })),
});
const request = {
  system: "You write exams.",
  prompt: "Three questions on Big-O.",
  schema: answer,
  tool: { name: "write_exam", description: "Return the exam." },
  maxTokens: 4000,
};
const valid = {
  title: "Big-O",
  questions: [{ stem: "What is O(1)?", points: 3.33 }],
};

/** The API answers every call with `reply`; the calls are recorded. */
function api(reply: () => Response) {
  const calls: { url: string; init: RequestInit }[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    calls.push({ url: new Request(input).url, init: init ?? {} });
    return reply();
  });
  const deps: AiDeps = { key: KEY, fetch: (i, n) => fetch(i, n) };
  return { calls, deps };
}

const toolReply = (input: unknown, extra: Record<string, unknown> = {}) =>
  Response.json({
    stop_reason: "tool_use",
    content: [{ type: "tool_use", name: "write_exam", input }],
    ...extra,
  });

async function failure(promise: Promise<unknown>): Promise<AiError> {
  const error = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(error).toBeInstanceOf(AiError);
  return error as AiError;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("askForJson", () => {
  it("asks the Messages API for one forced tool call with the schema, and returns the parsed answer", async () => {
    const { calls, deps } = api(() => toolReply(valid));
    expect(await askForJson(deps, request)).toEqual(valid);

    expect(calls).toHaveLength(1);
    const [call] = calls;
    expect(call?.url).toBe("https://api.anthropic.com/v1/messages");
    expect(call?.init.method).toBe("POST");
    const headers = new Headers(call?.init.headers);
    expect(headers.get("x-api-key")).toBe(KEY);
    expect(headers.get("anthropic-version")).toBe(ANTHROPIC_VERSION);
    expect(headers.get("content-type")).toBe("application/json");
    expect(call?.init.signal).toBeInstanceOf(AbortSignal);

    const body = JSON.parse(String(call?.init.body));
    expect(body).toMatchObject({
      model: AI_MODEL,
      max_tokens: 4000,
      system: "You write exams.",
      messages: [{ role: "user", content: "Three questions on Big-O." }],
      tool_choice: { type: "tool", name: "write_exam" },
    });
    expect(body.tools).toHaveLength(1);
    expect(body.tools[0]).toMatchObject({
      name: "write_exam",
      description: "Return the exam.",
      input_schema: {
        type: "object",
        required: ["title", "questions"],
        properties: { title: { type: "string" } },
      },
    });
    expect(body.tools[0].input_schema.$schema).toBeUndefined();
    // The key travels in its header only.
    expect(String(call?.init.body)).not.toContain(KEY);
  });

  it("refuses an answer cut off, without the tool, or out of shape", async () => {
    for (const reply of [
      () => toolReply(valid, { stop_reason: "max_tokens" }),
      () =>
        Response.json({
          stop_reason: "end_turn",
          content: [{ type: "text", text: "Here is your exam…" }],
        }),
      () => toolReply({ title: "Big-O", questions: [{ stem: 1 }] }),
      () => new Response("not json"),
    ]) {
      const { deps } = api(reply);
      const error = await failure(askForJson(deps, request));
      expect(error.code).toBe("ai_bad_reply");
      vi.restoreAllMocks();
    }
  });

  it("names each failure of the API, and never retries", async () => {
    const cases: [Response, string, number | undefined][] = [
      [new Response(null, { status: 401 }), "ai_key_invalid", undefined],
      [new Response(null, { status: 403 }), "ai_key_invalid", undefined],
      [
        new Response(null, { status: 429, headers: { "retry-after": "17" } }),
        "ai_rate_limited",
        17,
      ],
      [new Response(null, { status: 529 }), "ai_overloaded", undefined],
      [new Response(null, { status: 500 }), "ai_overloaded", undefined],
      [
        Response.json(
          { error: { message: "prompt is too long" } },
          { status: 400 },
        ),
        "ai_refused",
        undefined,
      ],
    ];
    for (const [response, code, retryAfter] of cases) {
      const { calls, deps } = api(() => response);
      const error = await failure(askForJson(deps, request));
      expect(error.code, code).toBe(code);
      expect(error.retryAfter).toBe(retryAfter);
      expect(error.message).not.toContain(KEY);
      expect(calls).toHaveLength(1);
      vi.restoreAllMocks();
    }
    const { deps } = api(() =>
      Response.json(
        { error: { message: "prompt is too long" } },
        { status: 400 },
      ),
    );
    expect((await failure(askForJson(deps, request))).message).toContain(
      "prompt is too long",
    );
  });

  it("gives up after its own time limit, and on a network failure", async () => {
    vi.spyOn(AbortSignal, "timeout").mockImplementation((ms) => {
      expect(ms).toBe(AI_TIMEOUT_MS);
      return AbortSignal.abort(new DOMException("timed out", "TimeoutError"));
    });
    const timedOut = {
      key: KEY,
      fetch: async (_: RequestInfo | URL, init?: RequestInit) => {
        throw init?.signal?.reason;
      },
    } as AiDeps;
    expect((await failure(askForJson(timedOut, request))).code).toBe(
      "ai_timeout",
    );

    const offline = {
      key: KEY,
      fetch: async () => {
        throw new TypeError("network connection lost");
      },
    } as AiDeps;
    expect((await failure(askForJson(offline, request))).code).toBe(
      "ai_overloaded",
    );
  });
});

describe("aiDeps", () => {
  it("names the missing key and its fix, before any call", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const error = (() => {
      try {
        aiDeps({ ...env, ANTHROPIC_API_KEY: undefined });
        return null;
      } catch (e) {
        return e as AiError;
      }
    })();
    expect(error?.code).toBe("ai_key_missing");
    expect(error?.message).toContain("ANTHROPIC_API_KEY");
    expect(error?.message).toContain("wrangler secret put ANTHROPIC_API_KEY");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(aiDeps({ ...env, ANTHROPIC_API_KEY: KEY }).key).toBe(KEY);
  });

  it("has a status for every error code", () => {
    expect(Object.keys(AI_ERROR_STATUS).sort()).toEqual(
      [...AI_ERROR_CODES].sort(),
    );
  });
});
