import { readFileSync } from "node:fs";
import { render, screen } from "@testing-library/react";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoutes } from "../app";
import { endSession } from "../core/session";

// The app draws edge to edge (viewport-fit=cover): on iPhone and iPad, in
// Safari's glass layout or from the Home Screen, the page runs under the
// status bar. Every surface at the top of the screen pads the safe-area
// inset itself. No test browser has a notch (env() is 0 there), so these
// check the rules that make the room.

// Read from disk (Vitest runs in packages/web): a ?raw import of this file
// comes back empty, being Tailwind-processed (@variant).
const css = readFileSync("src/styles/app-components.css", "utf8");

/** The innermost block around `index`: from its `{` to its `}`. */
function blockAround(source: string, index: number): string {
  const open = source.lastIndexOf("{", index);
  const close = source.indexOf("}", index);
  return source.slice(open, close);
}

describe("the top of the screen", () => {
  it("is left free by everything pinned there", () => {
    const pinned = [...css.matchAll(/\btop: 0;/g)].map((m) => m.index ?? 0);
    expect(pinned.length).toBeGreaterThanOrEqual(3);
    for (const at of pinned) {
      const block = blockAround(css, at);
      expect(block, block.slice(0, 120)).toContain("env(safe-area-inset-top)");
    }
  });

  it("is left free by the iPad page, the outline under the reader's header, sheets and dialogs", () => {
    const rule = (selector: string) => {
      const at = css.indexOf(`${selector} {`);
      expect(at, selector).toBeGreaterThan(-1);
      return css.slice(at, css.indexOf("\n}\n", at));
    };
    expect(rule(".shell__main")).toMatch(
      /@variant tablet \{[^}]*padding-top: env\(safe-area-inset-top\)/,
    );
    expect(rule(".reader__aside")).toContain(
      "top: calc(var(--size-header) + var(--border-thin) + env(safe-area-inset-top))",
    );
    expect(css).toContain(
      "max-height: calc(100dvh - var(--space-12) - env(safe-area-inset-top));",
    );
    expect(css).toContain(
      "max-height: calc(100dvh - var(--space-8) - env(safe-area-inset-top));",
    );
    expect(rule(".safe-top")).toContain(
      "padding-top: env(safe-area-inset-top)",
    );
  });
});

describe("the iPad status bar", () => {
  // Installed on iPad, WebKit fills the status bar with the colour of a fixed
  // box covering the top edge (≥ 90% wide, > 10px tall, sampled 4px below
  // its midpoint), and blurs the page there when there's none.
  const html = readFileSync("index.html", "utf8");
  const tokens = readFileSync("src/styles/tokens.css", "utf8");

  it("has a band in the page from the first frame, after the app so it paints above it", () => {
    const band = html.indexOf('<div class="status-band" aria-hidden="true">');
    expect(band).toBeGreaterThan(html.indexOf('<div id="root">'));
    expect(band).toBeLessThan(html.indexOf("<script"));
  });

  it("covers the top edge, installed on iOS at tablet width, in the ground's colour, painting nothing and taking no taps", () => {
    expect(css).toMatch(/\.status-band \{\s*display: none;\s*\}/);
    const at = css.indexOf("@media (display-mode: standalone)");
    expect(at).toBeGreaterThan(-1);
    const rule = css.slice(at, css.indexOf("\n}\n", at));
    expect(rule).toContain("@supports (-webkit-touch-callout: none)");
    expect(rule).toMatch(/\.status-band \{\s*@variant tablet \{/);
    for (const declaration of [
      "display: block;",
      "position: fixed;",
      "inset: 0 0 auto;",
      "height: var(--space-3);",
      "background-color: var(--color-ground);",
      "background-clip: text;",
      "pointer-events: none;",
    ])
      expect(rule).toContain(declaration);
    const height = Number(tokens.match(/--space-3:\s*(\d+)px;/)?.[1]);
    expect(height).toBeGreaterThan(10);
  });
});

describe("screens outside the shell", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  /** The screen's outermost element, found from something on it. */
  const outermost = async (path: string, find: () => Promise<Element>) => {
    // Signed out, or /login goes straight to Home.
    await endSession("signed-out");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(null, { status: 404 }),
    );
    const router = createMemoryRouter(createRoutes(), {
      initialEntries: [path],
    });
    const { container, unmount } = render(<RouterProvider router={router} />);
    const shown = await find();
    let node: Element | null = shown;
    while (node?.parentElement && node.parentElement !== container)
      node = node.parentElement;
    unmount();
    return node;
  };

  it("start below the status bar: login and Claude's sign-in", async () => {
    expect(
      await outermost("/login", () => screen.findByLabelText("Passphrase")),
    ).toHaveClass("safe-top");
    expect(
      await outermost("/oauth/authorize", () =>
        screen.findByText("This page expired"),
      ),
    ).toHaveClass("safe-top");
  });
});
