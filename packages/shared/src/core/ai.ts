// The AI integrations (docs/architecture.md §1): the one model every Anthropic
// API call from the Worker uses, and the errors a call can end in. Changing
// the model is a decision, made here only.
export const AI_MODEL = "claude-sonnet-5-5";

/** The Messages API version the Worker's client speaks (the `anthropic-version` header). */
export const ANTHROPIC_VERSION = "2023-06-01";

/** How long the Worker waits for one reply before giving up (no retry follows). */
export const AI_TIMEOUT_MS = 120_000;

/**
 * Why an AI call failed, as the app reports it. Every one is shown to the
 * owner with what to do; none is retried automatically (each call is billed).
 */
export const AI_ERROR_CODES = [
  "ai_key_missing",
  "ai_key_invalid",
  "ai_rate_limited",
  "ai_overloaded",
  "ai_timeout",
  "ai_refused",
  "ai_bad_reply",
] as const;
export type AiErrorCode = (typeof AI_ERROR_CODES)[number];
