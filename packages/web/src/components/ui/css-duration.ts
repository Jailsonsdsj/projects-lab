/**
 * A duration token (e.g. `--duration-toast-hold: 4000ms`) in milliseconds, read
 * from the document so timings live in tokens.css only. Null when the token is
 * missing or isn't a ms/s value; callers decide what that means.
 */
export function cssDurationMs(
  token: `--duration-${string}`,
  element: Element = document.documentElement,
): number | null {
  const raw = getComputedStyle(element).getPropertyValue(token).trim();
  const match = /^(-?[\d.]+)(ms|s)$/.exec(raw);
  if (!match?.[1]) return null;
  const value = Number.parseFloat(match[1]);
  return match[2] === "s" ? value * 1000 : value;
}
