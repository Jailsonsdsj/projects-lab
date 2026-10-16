import {
  type ChangePassphraseRequest,
  deriveAuthKey,
  generateSalt,
  IDEMPOTENCY_KEY_HEADER,
  KDF_ITERATIONS,
  loginResponseSchema,
  saltResponseSchema,
} from "@projects-lab/shared";
import { apiFetch, SessionEnded } from "./api";
import { type FailureKind, failureKind } from "./failure";
import { startSession } from "./session";

export type ChangePassphraseResult =
  | { ok: true }
  | {
      ok: false;
      reason: "wrong_passphrase" | "session_ended" | FailureKind;
    }
  | { ok: false; reason: "too_many_attempts"; retryAfterSeconds: number };

/**
 * Both keys are derived here, in the browser: the current one with the stored
 * salt and cost, the new one with a fresh salt and KDF_ITERATIONS. Neither
 * passphrase leaves the device. On success this device's session is swapped
 * for the fresh one; every other session has ended.
 *
 * `idempotencyKey`: reuse it for a retry after no answer (offline), so a change
 * that went through is replayed, not refused as a wrong passphrase.
 */
export async function changePassphrase(
  current: string,
  next: string,
  idempotencyKey: string,
): Promise<ChangePassphraseResult> {
  try {
    const saltResponse = await fetch("/api/auth/salt");
    if (!saltResponse.ok) return { ok: false, reason: "error" };
    const { salt, iterations } = saltResponseSchema.parse(
      await saltResponse.json(),
    );
    const newSalt = generateSalt();
    const request: ChangePassphraseRequest = {
      currentAuthKey: await deriveAuthKey(current, salt, iterations),
      newAuthKey: await deriveAuthKey(next, newSalt, KDF_ITERATIONS),
      newSalt,
      newIterations: KDF_ITERATIONS,
    };

    const response = await apiFetch("/api/auth/passphrase", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        [IDEMPOTENCY_KEY_HEADER]: idempotencyKey,
      },
      body: JSON.stringify(request),
    });
    if (response.status === 401)
      return { ok: false, reason: "wrong_passphrase" };
    if (response.status === 429)
      return {
        ok: false,
        reason: "too_many_attempts",
        retryAfterSeconds: Number(response.headers.get("Retry-After")) || 0,
      };
    if (!response.ok) return { ok: false, reason: "error" };

    startSession(loginResponseSchema.parse(await response.json()).token);
    return { ok: true };
  } catch (error) {
    if (error instanceof SessionEnded)
      return { ok: false, reason: "session_ended" };
    return { ok: false, reason: failureKind(error) };
  }
}
