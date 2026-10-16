import {
  deriveAuthKey,
  loginResponseSchema,
  saltResponseSchema,
} from "@projects-lab/shared";
import { type FailureKind, failureKind } from "./failure";
import { startSession } from "./session";

export type SignInResult =
  | { ok: true }
  | { ok: false; reason: "wrong_passphrase" | "not_provisioned" | FailureKind }
  | { ok: false; reason: "too_many_attempts"; retryAfterSeconds: number };

/**
 * Salt → KDF in the browser → login. The passphrase never leaves the device;
 * only `authKey` does. On success the session starts.
 */
export async function signIn(passphrase: string): Promise<SignInResult> {
  try {
    const saltResponse = await fetch("/api/auth/salt");
    if (saltResponse.status === 404)
      return { ok: false, reason: "not_provisioned" };
    if (!saltResponse.ok) return { ok: false, reason: "error" };
    const { salt, iterations } = saltResponseSchema.parse(
      await saltResponse.json(),
    );

    const authKey = await deriveAuthKey(passphrase, salt, iterations);
    const response = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ authKey }),
    });
    if (response.status === 429)
      return {
        ok: false,
        reason: "too_many_attempts",
        retryAfterSeconds: Number(response.headers.get("Retry-After")) || 0,
      };
    if (response.status === 401)
      return { ok: false, reason: "wrong_passphrase" };
    if (!response.ok) return { ok: false, reason: "error" };

    startSession(loginResponseSchema.parse(await response.json()).token);
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: failureKind(error) };
  }
}
