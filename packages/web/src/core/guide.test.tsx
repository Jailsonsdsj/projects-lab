import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import source from "../../../../docs/user-guide.md?raw";
import { mockApi } from "../../test/api";
import { createRoutes } from "../app";
import { Prose } from "../components/ui";
import {
  GUIDE,
  GUIDE_REPO,
  guidePath,
  parseGuide,
  resolveGuideLink,
} from "./guide";

function open(path: string) {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("the guide's parts", () => {
  it("are the file's H2s, Contents aside, with every line of each", () => {
    const h2s = [...source.matchAll(/^## (.+)$/gm)].map((m) => m[1]);
    expect(GUIDE.parts.map((p) => p.title)).toEqual(
      h2s.filter((t) => t !== "Contents"),
    );
    // Nothing is dropped: each body line of the file is in the intro or a part.
    const shown = [GUIDE.intro, ...GUIDE.parts.map((p) => p.markdown)].join(
      "\n",
    );
    const contents = source.slice(
      source.indexOf("## Contents"),
      source.indexOf("\n## ", source.indexOf("## Contents") + 1),
    );
    for (const line of source.split("\n")) {
      if (!line.trim() || /^#|^---$/.test(line) || contents.includes(line))
        continue;
      expect(shown, line).toContain(line);
    }
  });

  it("send each in-page link of the file to a heading that part renders", () => {
    const anchors = new Set(
      [...source.matchAll(/\]\(#([a-z0-9-]+)\)/g)].map((m) => m[1] as string),
    );
    expect(anchors.size).toBeGreaterThan(10);
    for (const anchor of anchors) {
      const path = resolveGuideLink(`#${anchor}`);
      expect(path, anchor).toMatch(/^\/guide/);
      const view = new URLSearchParams(path.split("?")[1]?.split("#")[0]).get(
        "view",
      );
      const part = GUIDE.parts.find(
        (p) => p.id === (view ?? GUIDE.parts[0]?.id),
      );
      // Rendered as the screen renders it, the heading carries that id.
      const { container, unmount } = render(
        <Prose markdown={part?.markdown ?? ""} headingLevels={["h2", "h3"]} />,
      );
      if (path.includes("#"))
        expect(
          container.querySelector(`[id="${anchor}"]`),
          anchor,
        ).not.toBeNull();
      else expect(part?.id).toBe(anchor);
      unmount();
    }
  });

  it("open other repo files on GitHub and leave web links alone", () => {
    expect(resolveGuideLink("prd/90-services.md")).toBe(
      `${GUIDE_REPO}prd/90-services.md`,
    );
    expect(resolveGuideLink("../CLAUDE.md")).toBe(
      "https://github.com/Jailsonsdsj/projects-lab/blob/main/CLAUDE.md",
    );
    expect(resolveGuideLink("https://example.com/x")).toBe(
      "https://example.com/x",
    );
    expect(resolveGuideLink("#no-such-heading")).toBe("#no-such-heading");
  });

  it("lift each part one heading level and leave out the file's title", () => {
    const guide = parseGuide(
      "# Title\n\nIntro.\n\n## Contents\n\n- x\n\n---\n\n## One\n\n### Sec\n\n#### Sub\n\ntext\n\n---\n",
    );
    expect(guide.intro).toBe("Intro.");
    expect(guide.parts).toEqual([
      {
        id: "one",
        title: "One",
        markdown: "## Sec\n\n### Sub\n\ntext",
        anchors: ["sec", "sub"],
      },
    ]);
  });
});

describe("the Guide tab", () => {
  it("sits with Home, Connections and Settings, and opens the first part", async () => {
    mockApi({});
    open("/guide");
    expect(
      await screen.findByRole("heading", { level: 1, name: "Guide" }),
    ).toBeInTheDocument();
    const tabs = screen.getByRole("tablist", { name: "Guide parts" });
    expect(
      within(tabs)
        .getAllByRole("tab")
        .map((t) => t.textContent),
    ).toEqual(["The app", "Claude", "Develop", "Help"]);
    expect(within(tabs).getByRole("tab", { name: "The app" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    expect(
      screen.getByRole("heading", { level: 2, name: "Getting started" }),
    ).toHaveAttribute("id", "getting-started");
    const nav = screen
      .getAllByRole("link", { name: "Guide" })
      .map((a) => a.getAttribute("href"));
    expect(nav).toContain("/guide");
  });

  it("switches part by tab, and a link to another part opens it at the heading", async () => {
    mockApi({});
    const router = open("/guide");
    await userEvent.click(await screen.findByRole("tab", { name: "Develop" }));
    expect(router.state.location.search).toBe("?view=developing-projects-lab");
    expect(
      screen.getByRole("heading", { level: 2, name: "pnpm commands" }),
    ).toBeInTheDocument();

    // Using the app → Settings says "See Backup and restore", which is in Help.
    await userEvent.click(screen.getByRole("tab", { name: "The app" }));
    // Handled in the app (no page load): the click's default is prevented.
    const toHelp = screen.getByRole("link", { name: "Backup and restore" });
    expect(fireEvent.click(toHelp)).toBe(false);
    await screen.findByRole("heading", { level: 2, name: "Troubleshooting" });
    expect(router.state.location.search).toBe("?view=help");
    expect(router.state.location.hash).toBe("#backup-and-restore");
    expect(screen.getByRole("tab", { name: "Help" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // A link to a repo file opens GitHub in a new tab.
    const spec = screen.getByRole("link", { name: "prd/90-services.md" });
    expect(spec).toHaveAttribute("href", `${GUIDE_REPO}prd/90-services.md`);
    expect(spec).toHaveAttribute("target", "_blank");
    expect(guidePath("help", "troubleshooting")).toBe(
      "/guide?view=help#troubleshooting",
    );
  });
});

describe("Prose heading ids", () => {
  it("stay on H3s only for courses", () => {
    const { container } = render(<Prose markdown={"## Lesson\n\n### Part"} />);
    expect(container.querySelector("h2")).not.toHaveAttribute("id");
    expect(container.querySelector("h3")).toHaveAttribute("id", "part");
  });
});
