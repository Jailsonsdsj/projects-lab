// The MCP endpoint (F-15, docs/prd/02-integration.md). OAuthProvider has
// checked the access token before a request gets here; `props` carry the
// grant's user and client. Stateless: a fresh server per request.

import { McpServer } from "@modelcontextprotocol/server";
import { IDEMPOTENCY_KEY_MAX_LENGTH } from "@projects-lab/shared";
import { createMcpHandler, getMcpAuthContext } from "agents/mcp/server";
import { z } from "zod";
import { database } from "../core/db";
import {
  claimIdempotencyKey,
  releaseIdempotencyKey,
  storeIdempotentResponse,
} from "../core/idempotency";
import { type LabTool, type ToolContext, ToolError } from "../core/lab";
import { publicOrigin } from "../core/oauth/origin";

type ToolResult = {
  content: { type: "text"; text: string }[];
  isError?: boolean;
};

const ok = (value: unknown): ToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value) }],
});

const refused = (error: string, message: string): ToolResult => ({
  isError: true,
  content: [{ type: "text", text: JSON.stringify({ error, message }) }],
});

const MESSAGES: Record<string, string> = {
  idempotency_key_reused:
    "This idempotencyKey was already used with another tool. Use a new key.",
  idempotency_key_in_progress:
    "A call with this idempotencyKey hasn't finished. Retry later, or use a new key.",
};

/** A thrown error as Claude should see it: a ToolError's own words, else
 *  `internal` with no details (they go to the Worker's log). */
function failure(error: unknown): ToolResult {
  if (error instanceof ToolError) return refused(error.code, error.message);
  console.error(error);
  return refused("internal", "Something went wrong on the server. Try again.");
}

/** One mcp_call row per call to a write tool, replays and failures included. */
function audit(ctx: ToolContext, tool: string, succeeded: boolean) {
  return ctx.db
    .prepare(
      "INSERT INTO mcp_call (id, tool, client_name, ok, created_at) VALUES (?, ?, ?, ?, ?)",
    )
    .bind(
      crypto.randomUUID(),
      tool,
      ctx.clientName,
      succeeded ? 1 : 0,
      new Date().toISOString(),
    )
    .run();
}

async function runWrite(
  tool: LabTool,
  args: Record<string, unknown>,
  ctx: ToolContext,
): Promise<ToolResult> {
  const { idempotencyKey, ...input } = args as {
    idempotencyKey?: string;
  } & Record<string, unknown>;
  let succeeded = false;
  try {
    if (idempotencyKey) {
      const claim = await claimIdempotencyKey(
        ctx.db,
        idempotencyKey,
        tool.name,
      );
      if (claim.kind === "error")
        return refused(claim.error, MESSAGES[claim.error] ?? claim.error);
      if (claim.kind === "replay") {
        succeeded = true;
        return { content: [{ type: "text", text: claim.stored.body }] };
      }
    }
    let value: unknown;
    try {
      value = await tool.run(input, ctx);
    } catch (error) {
      if (idempotencyKey)
        await releaseIdempotencyKey(ctx.db, idempotencyKey, tool.name);
      return failure(error);
    }
    const text = JSON.stringify(value);
    if (idempotencyKey)
      await storeIdempotentResponse(ctx.db, idempotencyKey, tool.name, {
        status: 200,
        contentType: "application/json",
        body: text,
      });
    succeeded = true;
    return { content: [{ type: "text", text }] };
  } finally {
    await audit(ctx, tool.name, succeeded);
  }
}

/** The server for one request: every tool, wrapped by the registry rules. */
function buildServer(tools: readonly LabTool[], env: Env): McpServer {
  const server = new McpServer({ name: "projects-lab", version: "1.0.0" });
  for (const tool of tools) {
    const input =
      tool.kind === "write"
        ? tool.input.extend({
            idempotencyKey: z
              .string()
              .min(1)
              .max(IDEMPOTENCY_KEY_MAX_LENGTH)
              .optional()
              .describe(
                "Any unique string (a UUID). Retrying with the same key returns the first result instead of writing twice.",
              ),
          })
        : tool.input;
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: input },
      async (args: Record<string, unknown>) => {
        const props = getMcpAuthContext()?.props ?? {};
        const userId = typeof props.userId === "string" ? props.userId : null;
        if (!userId) return failure(new Error("MCP call without a user"));
        const ctx: ToolContext = {
          db: database(env),
          env,
          userId,
          clientName:
            typeof props.clientName === "string" ? props.clientName : "unknown",
        };
        if (tool.kind === "write") return runWrite(tool, args, ctx);
        try {
          return ok(await tool.run(args, ctx));
        } catch (error) {
          return failure(error);
        }
      },
    );
  }
  return server;
}

/** The handler OAuthProvider calls for /mcp. Built per request (it's
 *  stateless), so the tools reach this request's env. */
export function mcpApiHandler(tools: readonly LabTool[]) {
  return {
    fetch(request, env, ctx) {
      const handler = createMcpHandler(() => buildServer(tools, env), {
        route: "/mcp",
        // Only this app's hostname: no DNS-rebinding route to the tools.
        allowedHostnames: [new URL(publicOrigin(env)).hostname],
      });
      return handler(request, env, ctx);
    },
  } satisfies ExportedHandler<Env>;
}
