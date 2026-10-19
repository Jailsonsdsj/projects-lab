import type { BacklogResponse, TopicInfo } from "@projects-lab/shared/study";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const AREAS = [
  { prefix: "CS", name: "CS Fundamentals", position: 1 },
  { prefix: "FE", name: "Frontend", position: 2 },
  { prefix: "SE", name: "Security", position: 7 },
];
const topic = (
  over: Partial<TopicInfo> & Pick<TopicInfo, "id" | "skill">,
): TopicInfo => ({
  skillId: `sk-${over.id}`,
  area: over.id.slice(0, 2),
  level: "essential",
  priority: 2,
  status: "not_started",
  grade: null,
  startedOn: null,
  finishedOn: null,
  note: "",
  ...over,
});
// In backlog order, as the API sends it (In progress, Not started, Done; priority; number).
const BACKLOG: BacklogResponse = {
  areas: AREAS,
  topics: [
    topic({ id: "CS-02", skill: "Graphs", status: "in_progress", priority: 1 }),
    topic({ id: "CS-01", skill: "Big-O notation", level: "fast_track" }),
    topic({ id: "FE-10", skill: "CSS", priority: 1 }),
    topic({ id: "FE-02", skill: "React", status: "done", grade: 85 }),
    topic({
      id: "FE-03",
      skill: "Vue",
      status: "done",
      grade: 60,
      level: "unset",
    }),
  ],
};

function openBacklog() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/study"],
  });
  render(<RouterProvider router={router} />);
}

const rowIds = (section: HTMLElement) =>
  [...section.querySelectorAll(".row__id")].map((el) => el.textContent);

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Backlog", () => {
  it("groups by area in position order and keeps the API's order inside each", async () => {
    mockApi({ "GET /api/study/backlog": () => json(BACKLOG) });
    openBacklog();
    await screen.findByRole("region", { name: "CS Fundamentals" });
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "CS Fundamentals",
      "Frontend",
      "Security",
    ]);
    expect(rowIds(sections[0] as HTMLElement)).toEqual(["CS-02", "CS-01"]);
    expect(rowIds(sections[1] as HTMLElement)).toEqual([
      "FE-10",
      "FE-02",
      "FE-03",
    ]);
  });

  it("summarizes in the subtitle: topics, in progress, average of graded Done topics", async () => {
    mockApi({ "GET /api/study/backlog": () => json(BACKLOG) });
    openBacklog();
    // (85 + 60) / 2 = 72.5 → 73 → "7.3"
    expect(
      await screen.findByText("5 topics · 1 in progress · avg grade 7.3"),
    ).toBeInTheDocument();
  });

  it("shows an empty area with 'No topics yet', and grades with one decimal", async () => {
    mockApi({ "GET /api/study/backlog": () => json(BACKLOG) });
    openBacklog();
    const security = await screen.findByRole("region", { name: "Security" });
    expect(security).toHaveTextContent("No topics yet");
    const frontend = screen.getByRole("region", { name: "Frontend" });
    const values = [...frontend.querySelectorAll(".row__value")].map(
      (v) => v.textContent,
    );
    expect(values).toEqual(["8.5", "6.0"]);
    expect(frontend).toHaveTextContent("P1");
    expect(frontend).toHaveTextContent("Done");
  });

  it("filters by status with counts, hiding areas with no match", async () => {
    mockApi({ "GET /api/study/backlog": () => json(BACKLOG) });
    openBacklog();
    const tabs = await screen.findByRole("tablist", {
      name: "Filter by status",
    });
    expect(
      within(tabs).getByRole("tab", { name: "Done 2" }),
    ).toBeInTheDocument();
    await userEvent.click(within(tabs).getByRole("tab", { name: "Done 2" }));
    const sections = screen.getAllByRole("region");
    expect(sections.map((s) => s.getAttribute("aria-label"))).toEqual([
      "Frontend",
    ]);
    expect(rowIds(sections[0] as HTMLElement)).toEqual(["FE-02", "FE-03"]);
  });

  it("searches by skill or ID and says how many match", async () => {
    mockApi({ "GET /api/study/backlog": () => json(BACKLOG) });
    openBacklog();
    const search = await screen.findByRole("searchbox", {
      name: "Search backlog",
    });
    await userEvent.type(search, "big");
    expect(screen.getByRole("status")).toHaveTextContent(
      "1 of 5 matches “big”",
    );
    expect(
      rowIds(screen.getByRole("region", { name: "CS Fundamentals" })),
    ).toEqual(["CS-01"]);
    await userEvent.click(screen.getByRole("button", { name: "Clear search" }));
    expect(screen.getAllByRole("region")).toHaveLength(3);
  });

  it("shows the empty state, not an error, when there are no topics", async () => {
    mockApi({
      "GET /api/study/backlog": () => json({ areas: AREAS, topics: [] }),
    });
    openBacklog();
    expect(await screen.findByText("No topics yet")).toBeInTheDocument();
    expect(screen.getByText(/ask Claude to/)).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load this")).toBeNull();
  });

  it("tells a failed read from being offline, each with Retry", async () => {
    mockApi({
      "GET /api/study/backlog": () =>
        json({ error: "internal" }, { status: 500 }),
    });
    openBacklog();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    vi.restoreAllMocks();

    const offline = vi
      .spyOn(globalThis, "fetch")
      .mockRejectedValue(new TypeError("Load failed"));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
    offline.mockResolvedValue(json(BACKLOG));
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    await waitFor(() => expect(screen.getAllByRole("region")).toHaveLength(3));
  });
});
