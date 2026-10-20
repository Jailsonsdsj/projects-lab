// How long the platform keeps operational rows (docs/prd/90-services.md §
// Retention; F-19). The daily Cron Trigger prunes anything older.

/** Idempotency claims and stored responses (playbook §8: ~7 days). */
export const MUTATION_RETENTION_DAYS = 7;

/** Login rate-limit windows: a window lasts 15 minutes; a week is plenty. */
export const AUTH_ATTEMPT_RETENTION_DAYS = 7;

/** The MCP audit the owner reads (what Claude changed). */
export const MCP_CALL_RETENTION_DAYS = 90;
