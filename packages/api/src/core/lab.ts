// What a lab gives the platform (docs/architecture.md §4): routes under
// /api/<lab> and MCP tools named <lab>_*. Core knows this shape and never a
// lab; the composition root (src/index.ts) builds the labs and mounts them.
import type { LabId } from "@projects-lab/shared";
import type { Hono } from "hono";
import { type AuthVariables, requireAuth } from "./auth/require-auth";

export type LabEnv = { Bindings: Env; Variables: AuthVariables };

/** An MCP tool as a lab declares it. F-15 adds its schema and handler. */
export interface LabTool {
  /** `<lab>_<verb>`, the same rule as mcp_call.tool (C-4). */
  name: string;
  description: string;
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
