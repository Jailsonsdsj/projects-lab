/** env.DB, checked: a binding missing from wrangler.jsonc reads undefined at runtime, whatever the generated type says. */
export function database(env: Env): D1Database {
  if (!env.DB) throw new Error("env.DB is not bound: check wrangler.jsonc");
  return env.DB;
}
