import type { ReactNode } from "react";
import { ErrorState } from "../components/ui";

export type FailureKind = "error" | "offline";

// What each browser's fetch() rejects with when the request never got an
// answer (Chrome, Safari, Firefox). A module script that fails to load is not
// in this list: online, that's a stale deploy, and Reload is the fix.
const NETWORK_FAILURE = [
  /^Failed to fetch$/,
  /^Load failed$/,
  /^NetworkError when attempting to fetch resource\.?$/,
];

/** `offline` when the browser is offline or the request never reached the
 *  server; `error` for everything that got an answer, or broke on its own. */
export function failureKind(error: unknown): FailureKind {
  if (typeof navigator !== "undefined" && navigator.onLine === false)
    return "offline";
  if (
    error instanceof TypeError &&
    NETWORK_FAILURE.some((pattern) => pattern.test(error.message))
  )
    return "offline";
  return "error";
}

const COPY: Record<FailureKind, { title: string; text: string }> = {
  error: {
    title: "Couldn't load this",
    text: "Something went wrong on the way. Try again in a moment.",
  },
  offline: {
    title: "You're offline",
    text: "This needs a connection. Try again once you're back online.",
  },
};

/** A failed read or screen: never "nothing here yet". */
export function Failure({
  kind,
  title,
  children,
  code,
  actions,
}: {
  kind: FailureKind;
  title?: string;
  children?: ReactNode;
  code?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <ErrorState
      kind={kind}
      title={title ?? COPY[kind].title}
      code={code}
      actions={actions}
    >
      {children ?? COPY[kind].text}
    </ErrorState>
  );
}
