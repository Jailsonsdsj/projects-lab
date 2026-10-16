import type { ReactNode } from "react";
import { Button } from "../components/ui";
import { Failure } from "./failure";
import { type Load, useRead } from "./read";

export interface ReadViewProps<T> {
  load: Load<T>;
  /** Shown when the read succeeded with nothing in it: say what to do next. */
  empty: ReactNode;
  /** Shown while loading; the shape of what's coming. */
  skeleton?: ReactNode;
  children: (data: T) => ReactNode;
}

/** A screen's read in its four states: loading, data, empty, failed (error or
 *  offline, with Retry). Remount it with a new `key` to read new inputs. */
export function ReadView<T>({
  load,
  empty,
  skeleton,
  children,
}: ReadViewProps<T>) {
  const { state, retry } = useRead(load);
  switch (state.status) {
    case "loading":
      return skeleton ?? null;
    case "empty":
      return empty;
    case "loaded":
      return children(state.data);
    default:
      return (
        <Failure
          kind={state.status}
          actions={
            <Button variant="outline" tone="neutral" onClick={retry}>
              Retry
            </Button>
          }
        />
      );
  }
}
