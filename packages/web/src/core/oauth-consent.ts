// The browser side of Claude's sign-in (F-14b): the Worker served this page
// with the consent details in it (F-14a, api/src/core/oauth/authorize.ts).
import {
  type AuthorizePage,
  authorizeResponseSchema,
  deriveAuthKey,
  OAUTH_CONSENT_ELEMENT_ID,
  OAUTH_CONSENT_EXPIRED,
  saltResponseSchema,
} from "@projects-lab/shared";
import { type FailureKind, failureKind } from "./failure";
import type { PassphraseAttempt } from "./PassphraseForm";

/** The details the Worker put in the page, or null (opened some other way). */
export function readConsentPage(): AuthorizePage | null {
  const text = document.getElementById(OAUTH_CONSENT_ELEMENT_ID)?.textContent;
  if (!text) return null;
  try {
    return JSON.parse(text) as AuthorizePage;
  } catch {
    return null;
  }
}

const post = (body: unknown) =>
  fetch("/oauth/authorize", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

const retryAfter = (response: Response) =>
  Number(response.headers.get("Retry-After")) || 0;

/**
 * The sign-in step: derives the authKey here (the passphrase never leaves the
 * device) and has the Worker check it, without using up the consent handle.
 */
export async function verifyOwner(
  passphrase: string,
  handle: string,
): Promise<PassphraseAttempt & { authKey?: string }> {
  try {
    const saltResponse = await fetch("/api/auth/salt");
    if (saltResponse.status === 404)
      return { ok: false, reason: "not_provisioned" };
    if (!saltResponse.ok) return { ok: false, reason: "error" };
    const { salt, iterations } = saltResponseSchema.parse(
      await saltResponse.json(),
    );
    const authKey = await deriveAuthKey(passphrase, salt, iterations);
    const response = await post({ decision: "verify", handle, authKey });
    if (response.status === 204) return { ok: true, authKey };
    if (response.status === 401)
      return { ok: false, reason: "wrong_passphrase" };
    if (response.status === 429)
      return {
        ok: false,
        reason: "too_many_attempts",
        retryAfterSeconds: retryAfter(response),
      };
    return { ok: false, reason: "error" };
  } catch (error) {
    return { ok: false, reason: failureKind(error) };
  }
}

export type DecisionResult =
  | { ok: true; redirectTo: string }
  | {
      ok: false;
      reason:
        | "consent_expired"
        | "wrong_passphrase"
        | "too_many_attempts"
        | FailureKind;
    };

/** Allow (with the verified authKey) or deny; on success, where to go. */
export async function decide(
  decision: "allow" | "deny",
  handle: string,
  authKey: string | null,
): Promise<DecisionResult> {
  try {
    const response = await post(
      decision === "allow"
        ? { decision, handle, authKey }
        : { decision, handle },
    );
    if (response.ok)
      return {
        ok: true,
        redirectTo: authorizeResponseSchema.parse(await response.json())
          .redirectTo,
      };
    if (response.status === 401)
      return { ok: false, reason: "wrong_passphrase" };
    if (response.status === 429)
      return { ok: false, reason: "too_many_attempts" };
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    if (body?.error === OAUTH_CONSENT_EXPIRED)
      return { ok: false, reason: "consent_expired" };
    return { ok: false, reason: "error" };
  } catch (error) {
    return { ok: false, reason: failureKind(error) };
  }
}

/** Hands the browser back to the client. Its own module, so tests can see it. */
export function leaveTo(url: string): void {
  window.location.assign(url);
}
