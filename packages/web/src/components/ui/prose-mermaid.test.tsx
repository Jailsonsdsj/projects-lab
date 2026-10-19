import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prose } from "./Prose";

const mermaid = vi.hoisted(() => ({
  imported: 0,
  initialize: vi.fn(),
  render: vi.fn(),
}));
vi.mock("mermaid", () => {
  mermaid.imported++;
  return {
    default: { initialize: mermaid.initialize, render: mermaid.render },
  };
});

const DIAGRAM = "Before\n\n```mermaid\nflowchart LR\n  A --> B\n```\n";

beforeEach(() => {
  mermaid.initialize.mockReset();
  mermaid.render.mockReset();
});

describe("Mermaid in Prose", () => {
  it("never loads Mermaid for Markdown without a diagram", async () => {
    const before = mermaid.imported;
    render(<Prose markdown={"# Title\n\n```ts\nconst a = 1;\n```"} />);
    await new Promise((r) => setTimeout(r, 0));
    expect(mermaid.imported).toBe(before);
    expect(mermaid.render).not.toHaveBeenCalled();
  });

  it("draws a diagram in strict mode with colours from the tokens", async () => {
    mermaid.render.mockResolvedValue({
      svg: '<svg data-testid="drawn"></svg>',
    });
    render(<Prose markdown={DIAGRAM} />);
    // The code shows until the diagram is drawn.
    expect(screen.getByText("mermaid")).toBeInTheDocument();
    const figure = await screen.findByRole("figure", {
      name: "Diagram: flowchart",
    });
    expect(figure.querySelector("svg")).not.toBeNull();
    const config = mermaid.initialize.mock.calls[0]?.[0];
    expect(config).toMatchObject({
      securityLevel: "strict",
      theme: "base",
      startOnLoad: false,
    });
    // Each colour is read from its token through a probe element. jsdom
    // echoes var(...) where a browser resolves it (the e2e checks real colours).
    expect(config.themeVariables.textColor).toBe("var(--color-ink)");
    expect(config.themeVariables.primaryBorderColor).toBe(
      "var(--color-lab-accent)",
    );
    expect(mermaid.render.mock.calls[0]?.[1]).toBe("flowchart LR\n  A --> B");
  });

  it("keeps the code and says so when Mermaid can't draw it", async () => {
    mermaid.render.mockRejectedValue(new Error("Parse error"));
    render(<Prose markdown={DIAGRAM} />);
    expect(
      await screen.findByText("Couldn't draw this diagram."),
    ).toBeInTheDocument();
    expect(screen.getByText("mermaid")).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("figure")).toBeNull());
  });
});
