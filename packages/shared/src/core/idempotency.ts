// Idempotency (playbook §8): every mutation accepts this header; MCP write
// tools take the same key as `idempotencyKey`. A retry with the same key gets
// the stored response instead of running twice.
import { z } from "zod";

export const IDEMPOTENCY_KEY_HEADER = "Idempotency-Key";

/** Set on a response that was replayed from storage, not produced again. */
export const IDEMPOTENT_REPLAY_HEADER = "Idempotent-Replay";

/** Longest key accepted; a UUID is 36. */
export const IDEMPOTENCY_KEY_MAX_LENGTH = 200;

export const idempotencyErrorCodes = [
  /** Empty or longer than IDEMPOTENCY_KEY_MAX_LENGTH. */
  "idempotency_key_invalid",
  /** The key was used for a different route or tool: never replayed. */
  "idempotency_key_reused",
  /** The first request with this key hasn't finished (or never stored its
   *  response). Retry later or with a new key. */
  "idempotency_key_in_progress",
] as const;

export const idempotencyErrorSchema = z.object({
  error: z.enum(idempotencyErrorCodes),
});
export type IdempotencyError = z.infer<typeof idempotencyErrorSchema>;
