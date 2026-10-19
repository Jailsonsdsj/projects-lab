// ```mermaid blocks drawn as diagrams (PRD 11 § Reading). Mermaid is imported
// only here, dynamically, so it never reaches a page without a diagram; it runs
// in the browser (never server-side: 10 ms CPU) with securityLevel "strict",
// which sanitizes labels and drops scripts and click handlers. Colours come
// from the tokens, resolved at runtime; no literal colour lives here.
import { type ReactNode, useEffect, useId, useState } from "react";

/** Mermaid's theme variables, each from a colour token. */
const THEME_TOKENS = {
  primaryColor: "--color-lab-accent-tint",
  primaryBorderColor: "--color-lab-accent",
  primaryTextColor: "--color-ink",
  secondaryColor: "--color-surface-1",
  tertiaryColor: "--color-surface-1",
  mainBkg: "--color-lab-accent-tint",
  nodeBorder: "--color-lab-accent",
  lineColor: "--color-ink-secondary",
  textColor: "--color-ink",
  clusterBkg: "--color-surface-1",
  clusterBorder: "--color-border",
  edgeLabelBackground: "--color-surface-1",
  background: "--color-surface-1",
} as const;

/** A token's colour as the browser resolves it now (light-dark() included). */
function resolvedColour(token: string): string {
  const probe = document.createElement("span");
  probe.style.color = `var(${token})`;
  probe.hidden = true;
  document.body.append(probe);
  const colour = getComputedStyle(probe).color;
  probe.remove();
  return colour;
}

export function themeFromTokens(): Record<string, string> {
  return {
    ...Object.fromEntries(
      Object.entries(THEME_TOKENS).map(([name, token]) => [
        name,
        resolvedColour(token),
      ]),
    ),
    fontFamily: getComputedStyle(document.body).fontFamily,
  };
}

/** Changes when the colour scheme does, so diagrams redraw in the new colours. */
function useColorScheme(): string {
  const [query] = useState(() =>
    typeof window.matchMedia === "function"
      ? window.matchMedia("(prefers-color-scheme: dark)")
      : null,
  );
  const [dark, setDark] = useState(Boolean(query?.matches));
  useEffect(() => {
    if (!query) return;
    const change = () => setDark(query.matches);
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, [query]);
  return dark ? "dark" : "light";
}

/** The diagram's kind from its first line ("flowchart LR" → "flowchart"). */
const kindOf = (code: string) =>
  code
    .trim()
    .split(/\s+/)[0]
    ?.replace(/[^\w-]/g, "") || "diagram";

/**
 * Shows `fallback` (the labelled code block) until the diagram is drawn, and
 * keeps it, with a note, if Mermaid can't draw it.
 */
export function MermaidDiagram({
  code,
  fallback,
}: {
  code: string;
  fallback: ReactNode;
}) {
  const id = `mermaid-${useId().replace(/[^\w-]/g, "")}`;
  const scheme = useColorScheme();
  const [svg, setSvg] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        const theme = themeFromTokens();
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          fontFamily: theme.fontFamily,
          themeVariables: theme,
          // Natural size, never shrunk to the column: a wide diagram scrolls
          // sideways in its figure instead of shrinking past reading size.
          flowchart: { useMaxWidth: false },
          sequence: { useMaxWidth: false },
          class: { useMaxWidth: false },
          state: { useMaxWidth: false },
          er: { useMaxWidth: false },
          gantt: { useMaxWidth: false },
          journey: { useMaxWidth: false },
          pie: { useMaxWidth: false },
          mindmap: { useMaxWidth: false },
          timeline: { useMaxWidth: false },
        });
        const drawn = await mermaid.render(`${id}-${scheme}`, code);
        if (!cancelled) setSvg(drawn.svg);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [code, id, scheme]);

  if (svg)
    return (
      <figure
        className="prose__diagram"
        aria-label={`Diagram: ${kindOf(code)}`}
        // biome-ignore lint/security/noDangerouslySetInnerHtml: Mermaid's own output under securityLevel "strict" (sanitized, no scripts).
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    );
  return (
    <>
      {fallback}
      {failed && (
        <p className="prose__diagram-note">Couldn't draw this diagram.</p>
      )}
    </>
  );
}
