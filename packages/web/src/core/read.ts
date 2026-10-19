import { useCallback, useEffect, useRef, useState } from "react";
import { type FailureKind, failureKind } from "./failure";

/** A read: `load` resolves to null when there is no data yet, and rejects only
 *  when the read itself failed (the same contract as a lab's Home summary). */
export type Load<T> = (signal: AbortSignal) => Promise<T | null>;

export type ReadState<T> =
  | { status: "loading" }
  | { status: "loaded"; data: T }
  | { status: "empty" }
  | { status: FailureKind; error: unknown };

/** What started a read: the mount or Retry (shows loading), or the app coming
 *  back (foreground, connection) while something is already on screen. */
interface Run {
  n: number;
  background: boolean;
}

/**
 * Runs `load` on mount, on `retry()`, and again whenever the app comes back to
 * the foreground or back online, so data Claude wrote meanwhile shows up
 * without navigating. A background read swaps the data in when it arrives and,
 * if it fails, keeps what's on screen. An empty answer and a failed read are
 * different states, so a failure never renders as "nothing here yet". To read
 * new inputs, give the component a new `key`. To read again after a write
 * (keeping what's on screen, like a foreground read), change `refresh`.
 */
export function useRead<T>(
  load: Load<T>,
  refresh = 0,
): {
  state: ReadState<T>;
  retry: () => void;
} {
  const [state, setState] = useState<ReadState<T>>({ status: "loading" });
  const [run, setRun] = useState<Run>({ n: 0, background: false });
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  useEffect(() => {
    const controller = new AbortController();
    loadRef.current(controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setState(
          data === null ? { status: "empty" } : { status: "loaded", data },
        );
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        setState((shown) =>
          run.background &&
          (shown.status === "loaded" || shown.status === "empty")
            ? shown
            : { status: failureKind(error), error },
        );
      },
    );
    return () => controller.abort();
  }, [run]);

  useEffect(() => {
    const readAgain = () => {
      if (document.visibilityState === "visible")
        setRun((r) => ({ n: r.n + 1, background: true }));
    };
    document.addEventListener("visibilitychange", readAgain);
    window.addEventListener("online", readAgain);
    return () => {
      document.removeEventListener("visibilitychange", readAgain);
      window.removeEventListener("online", readAgain);
    };
  }, []);

  useEffect(() => {
    if (refresh !== 0) setRun((r) => ({ n: r.n + 1, background: true }));
  }, [refresh]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setRun((r) => ({ n: r.n + 1, background: false }));
  }, []);

  return { state, retry };
}
