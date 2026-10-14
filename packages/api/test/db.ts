import { env } from "cloudflare:workers";

// Generated bindings are optional while env.preview declares none (until G-03).
export function db(): D1Database {
  if (!env.DB) throw new Error("env.DB is not bound: check wrangler.jsonc");
  return env.DB;
}
