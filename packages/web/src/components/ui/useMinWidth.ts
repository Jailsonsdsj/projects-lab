import { useSyncExternalStore } from "react";

type BreakpointToken =
  | "--breakpoint-tablet"
  | "--breakpoint-landscape"
  | "--breakpoint-wide";

/** The token's value as written in tokens.css, or null when tokens.css isn't loaded. */
function breakpoint(token: BreakpointToken): string | null {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue(token)
    .trim();
  return value === "" ? null : value;
}

/**
 * True when the viewport is at least the breakpoint token wide. Layout should
 * use CSS (`tablet:` variants); this is for the few choices CSS can't make,
 * like a Sheet on phone versus a popover on tablet. No pixel value lives here.
 */
export function useMinWidth(token: BreakpointToken): boolean {
  const query = () => {
    const width = breakpoint(token);
    return width && typeof window.matchMedia === "function"
      ? window.matchMedia(`(min-width: ${width})`)
      : null;
  };
  return useSyncExternalStore(
    (onChange) => {
      const list = query();
      list?.addEventListener("change", onChange);
      return () => list?.removeEventListener("change", onChange);
    },
    () => query()?.matches ?? false,
    () => false,
  );
}
