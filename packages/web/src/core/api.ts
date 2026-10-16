import { endSession, isExpired, sessionToken } from "./session";

/** Thrown after a 401: the session is over and the app is on its way to
 *  /login. Nothing renders it; RequireSession has already moved on. */
export class SessionEnded extends Error {
  constructor() {
    super("The session ended; signing in again.");
    this.name = "SessionEnded";
  }
}

/**
 * fetch() for /api with this device's session. Any 401 ends the session (as
 * "expired" when the token's own exp has passed) instead of reaching a screen.
 * Login and the salt lookup don't use it: their 401 is a wrong passphrase.
 */
export async function apiFetch(
  path: string,
  init: RequestInit = {},
): Promise<Response> {
  const token = sessionToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(path, { ...init, headers });
  if (response.status === 401) {
    endSession(token && isExpired(token) ? "expired" : "invalid");
    throw new SessionEnded();
  }
  return response;
}
