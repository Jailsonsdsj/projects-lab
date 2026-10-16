// Login rate limit (docs/prd/01-identity-and-access.md): 10 attempts per fixed
// 15-minute window per hashed IP, shared by the app login and the OAuth sign-in.

export const AUTH_ATTEMPT_LIMIT = 10;
export const AUTH_WINDOW_SECONDS = 15 * 60;

export type AttemptResult = {
  allowed: boolean;
  /** Seconds until the current window ends. */
  retryAfter: number;
};

/**
 * Counts one attempt and says whether it is allowed. A single upsert with
 * RETURNING, so concurrent attempts can't both read a stale count.
 */
export async function recordAuthAttempt(
  db: D1Database,
  ipHash: string,
  nowSeconds: number,
): Promise<AttemptResult> {
  const windowStart =
    Math.floor(nowSeconds / AUTH_WINDOW_SECONDS) * AUTH_WINDOW_SECONDS;
  const row = await db
    .prepare(
      `INSERT INTO auth_attempt (ip_hash, window_start, count) VALUES (?, ?, 1)
       ON CONFLICT (ip_hash, window_start) DO UPDATE SET count = count + 1
       RETURNING count`,
    )
    .bind(ipHash, windowStart)
    .first<{ count: number }>();
  if (!row) throw new Error("auth_attempt upsert returned no row");
  return {
    allowed: row.count <= AUTH_ATTEMPT_LIMIT,
    retryAfter: windowStart + AUTH_WINDOW_SECONDS - nowSeconds,
  };
}
