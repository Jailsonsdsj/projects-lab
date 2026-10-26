import { env } from "cloudflare:workers";

// A binding missing from wrangler.jsonc reads undefined at runtime, whatever the generated type says.
export function db(): D1Database {
  if (!env.DB) throw new Error("env.DB is not bound: check wrangler.jsonc");
  return env.DB;
}
