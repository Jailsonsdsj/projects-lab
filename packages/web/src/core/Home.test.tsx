import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoutes, LABS } from "../app";
import type { LabDefinition, LabSummary } from "./lab-registry";
import { platformLab } from "./screens";

// Core never imports a lab, tests included: take the labs from the registry.
function registered(id: LabDefinition["id"]): LabDefinition {
  const lab = LABS.find((l) => l.id === id);
  if (!lab) throw new Error(`no lab ${id} in the registry`);
  return lab;
}
const studyLab = registered("study");
const careerLab = registered("career");

function renderHome(labs: readonly LabDefinition[] = LABS) {
  const router = createMemoryRouter(createRoutes(labs), {
    initialEntries: ["/"],
  });
  render(<RouterProvider router={router} />);
  return router;
}

const card = (name: string) =>
  screen
    .getAllByText(name, { selector: ".labcard__name" })[0]
    ?.closest(".labcard") as HTMLElement;

afterEach(() => {
  document.documentElement.removeAttribute("data-lab");
});

describe("Home", () => {
  it("shows a lab with no data as its empty state, not an error", async () => {
    renderHome();
    for (const lab of [studyLab, careerLab]) {
      await waitFor(() =>
        expect(card(lab.name)).not.toHaveAttribute("aria-busy"),
      );
      const el = card(lab.name);
      expect(el).toHaveTextContent(lab.home?.emptyText ?? "");
      expect(el).not.toHaveClass("is-muted");
      expect(el.tagName).toBe("A");
      expect(el).toHaveAttribute("href", lab.tabs[0]?.path);
    }
    expect(screen.queryByText("Couldn't load the summary.")).toBeNull();
  });

  it("keeps one lab's failure inside its own card, and Retry reads again", async () => {
    const user = userEvent.setup();
    const summary: LabSummary = {
      stats: [
        { value: "2", label: "tracked jobs" },
        { value: "62%", label: "best readiness" },
        { value: "3", label: "gaps" },
      ],
      foot: { label: "Best match", value: "Acme" },
    };
    const failing = vi
      .fn<() => Promise<LabSummary | null>>()
      .mockRejectedValueOnce(new Error("503"))
      .mockResolvedValueOnce({ stats: [{ value: "1", label: "in progress" }] });
    const labs = [
      platformLab,
      { ...studyLab, home: { load: failing, emptyText: "none" } },
      { ...careerLab, home: { load: async () => summary, emptyText: "none" } },
    ];
    renderHome(labs);

    const study = await waitFor(() => {
      const el = card("Study Lab");
      expect(el).toHaveClass("is-muted");
      return el;
    });
    expect(study).toHaveTextContent("Couldn't load the summary.");
    const career = card("Career Lab");
    await waitFor(() => expect(career).toHaveTextContent("62%"));
    expect(career).toHaveTextContent("best readiness");
    expect(career).toHaveTextContent("Best match Acme");

    await user.click(within(study).getByRole("button", { name: "Retry" }));
    await waitFor(() =>
      expect(card("Study Lab")).toHaveTextContent("in progress"),
    );
    expect(failing).toHaveBeenCalledTimes(2);
  });

  it("shows a skeleton card, named for its lab, while the summary loads", () => {
    const labs = [
      platformLab,
      {
        ...studyLab,
        home: { load: () => new Promise<null>(() => {}), emptyText: "none" },
      },
    ];
    renderHome(labs);
    expect(screen.getByRole("region", { name: "Study Lab" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
  });

  it("opens the lab from its card without leaving the app", async () => {
    const user = userEvent.setup();
    const router = renderHome();
    await waitFor(() =>
      expect(card("Career Lab")).not.toHaveAttribute("aria-busy"),
    );
    await user.click(card("Career Lab"));
    expect(router.state.location.pathname).toBe("/career");
    expect(document.documentElement.dataset.lab).toBe("career");
  });
});
