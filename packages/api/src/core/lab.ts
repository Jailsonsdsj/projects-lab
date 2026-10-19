// What a lab gives the platform (docs/architecture.md §4): routes under
// /api/<lab> and MCP tools named <lab>_*. Core knows this shape and never a
// lab; the composition root (src/index.ts) builds the labs and mounts them.
import type { LabId } from "@projects-lab/shared";
import type { Hono } from "hono";
import type { z } from "zod";
import { type AuthVariables, requireAuth } from "./auth/require-auth";

export type LabEnv = { Bindings: Env; Variables: AuthVariables };

/** What a tool's `run` gets: the database and who is calling. */
export interface ToolContext {
  db: D1Database;
  env: Env;
  userId: string;
  /** The OAuth client the grant belongs to, as the audit records it. */
  clientName: string;
}

/**
 * An MCP tool (docs/prd/02-integration.md): a thin adapter. `input` is the
 * shared Zod schema of the matching /api route; `run` calls the same service
 * function and returns compact JSON. No SQL here: a test scans tool files.
 * Write tools get an optional `idempotencyKey` and an mcp_call audit row from
 * the registry (mcp/server.ts); `run` never sees either.
 */
export interface LabTool<Input extends z.ZodObject = z.ZodObject> {
  /** `<lab>_<verb>`, the same rule as mcp_call.tool (C-4). */
  name: string;
  /** One or two sentences: what it does and when Claude should use it. */
  description: string;
  kind: "read" | "write";
  input: Input;
  run(input: z.infer<Input>, ctx: ToolContext): Promise<unknown>;
}

/** A refusal a tool reports to Claude as `{ error, message }` (PRD 02). */
export class ToolError extends Error {
  constructor(
    readonly code:
      | "bad_request"
      | "not_found"
      | "conflict"
      // study-materials unreachable (PRD 02): the message names the fix.
      | "github_token_invalid"
      | "github_rate_limited",
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/** Declares a tool with its input type inferred from its schema. */
export function defineTool<Input extends z.ZodObject>(
  tool: LabTool<Input>,
): LabTool {
  return tool as unknown as LabTool;
}

export interface ApiLab {
  id: LabId;
  /** Mounted at /api/<id>, behind requireAuth. */
  routes: Hono<LabEnv>;
  tools: readonly LabTool[];
}

/**
 * Mounts every lab at /api/<id> behind a session and returns all their tools
 * for the MCP registry. A tool whose name isn't `<id>_[a-z_]+` stops the
 * Worker from starting rather than reaching the audit table's CHECK.
 */
export function mountLabs(
  app: Hono<LabEnv>,
  labs: readonly ApiLab[],
): LabTool[] {
  const tools: LabTool[] = [];
  for (const lab of labs) {
    const pattern = new RegExp(`^${lab.id}_[a-z_]+$`);
    for (const tool of lab.tools) {
      if (!pattern.test(tool.name))
        throw new Error(
          `MCP tool "${tool.name}" from ${lab.id} must be named ${lab.id}_<verb> (lowercase, underscores)`,
        );
      tools.push(tool);
    }
    app.use(`/api/${lab.id}/*`, requireAuth);
    app.route(`/api/${lab.id}`, lab.routes);
  }
  return tools;
}
