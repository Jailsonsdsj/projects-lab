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

/**
 * Runs `load` once per mount and on `retry()`. An empty answer and a failed
 * read are different states, so a failure can never render as "nothing here
 * yet". To read again with new inputs, give the component a new `key`.
 */
export function useRead<T>(load: Load<T>): {
  state: ReadState<T>;
  retry: () => void;
} {
  const [state, setState] = useState<ReadState<T>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: attempt is the trigger for reading again
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
        setState({ status: failureKind(error), error });
      },
    );
    return () => controller.abort();
  }, [attempt]);

  const retry = useCallback(() => {
    setState({ status: "loading" });
    setAttempt((n) => n + 1);
  }, []);

  return { state, retry };
}
