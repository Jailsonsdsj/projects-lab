// The daily prune (F-19): operational rows past their window go, in one
// batch. Strictly older than the cutoff: a row exactly at it stays.
import {
  AUTH_ATTEMPT_RETENTION_DAYS,
  MCP_CALL_RETENTION_DAYS,
  MUTATION_RETENTION_DAYS,
} from "@projects-lab/shared";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Also clears an idempotency claim left in flight by a Worker that died. */
export async function pruneOldRows(db: D1Database, nowMs: number) {
  const before = (days: number) => nowMs - days * DAY_MS;
  const iso = (ms: number) => new Date(ms).toISOString();
  const results = await db.batch([
    db
      .prepare("DELETE FROM mutation WHERE created_at < ?")
      .bind(iso(before(MUTATION_RETENTION_DAYS))),
    db
      .prepare("DELETE FROM auth_attempt WHERE window_start < ?")
      .bind(Math.floor(before(AUTH_ATTEMPT_RETENTION_DAYS) / 1000)),
    db
      .prepare("DELETE FROM mcp_call WHERE created_at < ?")
      .bind(iso(before(MCP_CALL_RETENTION_DAYS))),
  ]);
  const [mutation, authAttempt, mcpCall] = results.map((r) => r.meta.changes);
  return { mutation, authAttempt, mcpCall };
}
