// The app's session on this device (docs/prd/01-identity-and-access.md). The
// Worker sets an HttpOnly cookie too, but /api calls send the JWT as a Bearer
// header, so the app keeps its own copy. Only the Worker verifies it; the app
// reads `exp` to tell an expired session from one that was ended.
import { API_CACHE } from "@projects-lab/shared";
import { useSyncExternalStore } from "react";

const TOKEN_KEY = "pl_session";

/** Why the last session ended: shown on the login screen when it's "expired". */
export type SessionEnd = "expired" | "invalid";

let ended: SessionEnd | null = null;
const listeners = new Set<() => void>();
const emit = () => {
  for (const listener of listeners) listener();
};

function stored(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null; // storage blocked: signed out
  }
}

export function sessionToken(): string | null {
  return stored();
}

export function startSession(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
  ended = null;
  emit();
}

/** Drops the token and the cached /api reads, which hold this session's data. */
export function endSession(reason: SessionEnd): void {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
  ended = reason;
  emit();
  if (typeof caches !== "undefined") void caches.delete(API_CACHE);
}

export function sessionEnded(): SessionEnd | null {
  return ended;
}

/** The token's `exp` in seconds, or null when it isn't a readable JWT. */
export function tokenExpiry(token: string): number | null {
  try {
    const payload = token.split(".")[1] ?? "";
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const exp = (JSON.parse(json) as { exp?: unknown }).exp;
    return typeof exp === "number" ? exp : null;
  } catch {
    return null;
  }
}

export function isExpired(token: string, nowMs = Date.now()): boolean {
  const exp = tokenExpiry(token);
  return exp !== null && exp * 1000 <= nowMs;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  // Another tab signing in or out changes this one too.
  const onStorage = (event: StorageEvent) => {
    if (event.key === TOKEN_KEY || event.key === null) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

/** The current token; re-renders when a session starts or ends. */
export function useSessionToken(): string | null {
  return useSyncExternalStore(subscribe, stored, () => null);
}
