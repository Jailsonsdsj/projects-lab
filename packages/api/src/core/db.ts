/** env.DB, which the generated types mark optional while env.preview declares no bindings (G-03). */
export function database(env: Env): D1Database {
  if (!env.DB) throw new Error("env.DB is not bound: check wrangler.jsonc");
  return env.DB;
}
