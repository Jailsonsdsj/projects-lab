// Request helpers shared by Career's routes: a schema failure or a refused
// service call becomes PRD 02's { error, message } with its status.
import type { Context } from "hono";
import type { z } from "zod";
import { database } from "../../core/db";
import { type LabEnv, ToolError } from "../../core/lab";

const STATUS = {
  bad_request: 400,
  not_found: 404,
  conflict: 409,
  github_token_invalid: 502,
  github_rate_limited: 503,
} as const;

export function invalid(c: Context, error: z.ZodError) {
  const issue = error.issues[0];
  const where = issue?.path.join(".");
  return c.json(
    {
      error: "bad_request",
      message: where ? `${where}: ${issue?.message}` : issue?.message,
    },
    400,
  );
}

/** A refused service call becomes PRD 02's { error, message } with its status. */
export function refused(c: Context, error: unknown) {
  if (error instanceof ToolError)
    return c.json(
      { error: error.code, message: error.message },
      STATUS[error.code],
    );
  throw error;
}

export async function body(c: Context): Promise<unknown> {
  return c.req.json().catch(() => null);
}

/** Validates the JSON body, runs the service, maps a refusal. */
export function write<S extends z.ZodType, R>(
  schema: S,
  run: (db: D1Database, input: z.infer<S>, now: Date) => Promise<R>,
  respond: (result: R) => unknown,
) {
  return async (c: Context<LabEnv>) => {
    const parsed = schema.safeParse(await body(c));
    if (!parsed.success) return invalid(c, parsed.error);
    try {
      return c.json(
        respond(await run(database(c.env), parsed.data, new Date())),
      );
    } catch (error) {
      return refused(c, error);
    }
  };
}
