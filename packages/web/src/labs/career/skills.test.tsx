import type { SkillsResponse } from "@projects-lab/shared/career";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const SKILLS: SkillsResponse = {
  skills: [
    {
      skillId: "py",
      name: "Python",
      level: "working",
      years: 1,
      note: "",
      readiness: "declared",
      grade: null,
    },
    {
      skillId: "ts",
      name: "TypeScript",
      level: "strong",
      years: 6,
      note: "Mostly React",
      readiness: "verified",
      grade: 85,
    },
  ],
  offers: [{ skillId: "k8s", name: "Kubernetes", grade: 72 }],
};

function openSkills() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/career/skills"],
  });
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Skills", () => {
  it("groups declared skills by level, strongest first, with their readiness", async () => {
    mockApi({ "GET /api/career/skills": () => json(SKILLS) });
    openSkills();
    await screen.findByRole("region", { name: "Strong" });
    expect(
      screen.getAllByRole("region").map((r) => r.getAttribute("aria-label")),
    ).toEqual(["Verified in Study, not declared", "Strong", "Working"]);
    const strong = screen.getByRole("region", { name: "Strong" });
    expect(
      within(strong).getByText("6 years · Study grade 8.5 · Mostly React"),
    ).toBeInTheDocument();
    expect(within(strong).getAllByText("Verified").length).toBeGreaterThan(0);
    const working = screen.getByRole("region", { name: "Working" });
    expect(within(working).getByText("1 year")).toBeInTheDocument();
    expect(within(working).getAllByText("Declared").length).toBeGreaterThan(0);
    expect(
      screen.getByText("2 declared · 1 verified in Study"),
    ).toBeInTheDocument();
  });

  it("declares an offered skill once, and the offer goes", async () => {
    let state = structuredClone(SKILLS);
    const puts: unknown[] = [];
    mockApi({
      "GET /api/career/skills": () => json(state),
      "PUT /api/career/skills": (init) => {
        const body = JSON.parse(String(init?.body));
        puts.push(body);
        state = {
          skills: [
            ...state.skills,
            {
              skillId: "k8s",
              name: "Kubernetes",
              level: body.level,
              years: body.years,
              note: body.note,
              readiness: "verified",
              grade: 72,
            },
          ],
          offers: [],
        };
        return json({ skill: {} });
      },
    });
    openSkills();
    const offers = await screen.findByRole("region", {
      name: "Verified in Study, not declared",
    });
    await userEvent.click(
      within(offers).getByRole("button", { name: /Kubernetes/ }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Declare Kubernetes",
    });
    expect(
      within(sheet).getByText(/Study verified it with a grade of 7.2/),
    ).toBeInTheDocument();
    expect(within(sheet).queryByLabelText("Skill")).not.toBeInTheDocument();
    await userEvent.selectOptions(
      within(sheet).getByLabelText("Level"),
      "familiar",
    );
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Declare" }),
    );
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(puts).toEqual([
      { skill: "Kubernetes", level: "familiar", years: null, note: "" },
    ]);
    await vi.waitFor(() =>
      expect(
        screen.queryByRole("region", {
          name: "Verified in Study, not declared",
        }),
      ).not.toBeInTheDocument(),
    );
    expect(
      within(screen.getByRole("region", { name: "Familiar" })).getByText(
        "Kubernetes",
      ),
    ).toBeInTheDocument();
  });

  it("removes a declaration after confirming", async () => {
    let removed: string | null = null;
    mockApi({
      "GET /api/career/skills": () => json(SKILLS),
      "DELETE /api/career/skills/Python": () => {
        removed = "Python";
        return new Response(null, { status: 204 });
      },
    });
    openSkills();
    await userEvent.click(
      await screen.findByRole("button", { name: /Python/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Python" });
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Remove" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Remove Python from your profile?",
    });
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Remove" }),
    );
    expect(await screen.findByText("Removed")).toBeInTheDocument();
    expect(removed).toBe("Python");
  });

  it("declares a new skill by name, refusing years that aren't whole", async () => {
    const puts: unknown[] = [];
    mockApi({
      "GET /api/career/skills": () => json(SKILLS),
      "PUT /api/career/skills": (init) => {
        puts.push(JSON.parse(String(init?.body)));
        return json({ skill: {} });
      },
    });
    openSkills();
    await userEvent.click(
      await screen.findByRole("button", { name: "Declare a skill" }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Declare a skill",
    });
    await userEvent.type(within(sheet).getByLabelText("Skill"), "Go");
    await userEvent.type(within(sheet).getByLabelText(/Years/), "2.5");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Declare" }),
    );
    expect(within(sheet).getByText("Whole years, e.g. 3.")).toBeInTheDocument();
    expect(puts).toEqual([]);
    await userEvent.clear(within(sheet).getByLabelText(/Years/));
    await userEvent.type(within(sheet).getByLabelText(/Years/), "2");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Declare" }),
    );
    await screen.findByText("Saved");
    expect(puts).toEqual([
      { skill: "Go", level: "working", years: 2, note: "" },
    ]);
  });

  it("says what to do with no skills, and tells a failed read apart", async () => {
    mockApi({
      "GET /api/career/skills": () => json({ skills: [], offers: [] }),
    });
    openSkills();
    expect(await screen.findByText("No skills yet")).toBeInTheDocument();
  });

  it("shows Retry when the read fails", async () => {
    mockApi({
      "GET /api/career/skills": () => new Response(null, { status: 500 }),
    });
    openSkills();
    expect(
      await screen.findByRole("button", { name: "Retry" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("No skills yet")).not.toBeInTheDocument();
  });
});
