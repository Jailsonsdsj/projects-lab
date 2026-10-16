/**
 * The app's public origin (wrangler.jsonc `PUBLIC_ORIGIN`): the OAuth issuer,
 * and `<origin>/mcp` is the resource every token is bound to. Read outside any
 * try; unset, it throws a message naming the fix.
 */
export function publicOrigin(env: { PUBLIC_ORIGIN?: string }): string {
  const value = env.PUBLIC_ORIGIN;
  if (!value) {
    throw new Error(
      "PUBLIC_ORIGIN is not set. Locally: add PUBLIC_ORIGIN=http://localhost:8787 " +
        "to packages/api/.dev.vars. In production the owner sets it in " +
        "wrangler.jsonc `vars` to the app's https origin (F-20).",
    );
  }
  const url = new URL(value);
  if (url.origin !== value)
    throw new Error(
      `PUBLIC_ORIGIN must be a bare origin like https://lab.example.com, not ${value}`,
    );
  return url.origin;
}
