import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { isExpired, sessionEnded, useSessionToken } from "./session";

/** Where /login sends the owner back to, and whether to say the session expired. */
export interface LoginState {
  from?: string;
  expired?: boolean;
}

/** Every screen needs a session: without one (or with an expired one) the app
 *  goes to /login, remembering where it was. */
export function RequireSession({ children }: { children: ReactNode }) {
  const token = useSessionToken();
  const { pathname, search } = useLocation();
  if (token && !isExpired(token)) return children;
  const state: LoginState = {
    from: pathname + search,
    expired: token ? true : sessionEnded() === "expired",
  };
  return <Navigate to="/login" replace state={state} />;
}
