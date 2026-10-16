import { endSession, isExpired, sessionToken } from "./session";

/** Thrown after a 401: the session is over and the app is on its way to
 *  /login. Nothing renders it; RequireSession has already moved on. */
export class SessionEnded extends Error {
  constructor() {
    super("The session ended; signing in again.");
    this.name = "SessionEnded";
  }
}

/** A 401 that answers a wrong passphrase (the passphrase change) rather than a
 *  dead session: the form shows it, and the session stays. */
async function isWrongPassphrase(response: Response): Promise<boolean> {
  const body = await response
    .clone()
    .json()
    .catch(() => null);
  return (body as { error?: unknown } | null)?.error === "invalid_passphrase";
}

/**
 * fetch() for /api with this device's session. A 401 ends the session (as
 * "expired" when the token's own exp has passed) instead of reaching a screen,
 * unless it says `invalid_passphrase`. Login and the salt lookup don't use it.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = sessionToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401 && !(await isWrongPassphrase(response))) {
    await endSession(token && isExpired(token) ? "expired" : "invalid");
    throw new SessionEnded();
  }
  return response;
}
