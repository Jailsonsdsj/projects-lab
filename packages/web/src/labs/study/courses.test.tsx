import type { TopicInfo } from "@projects-lab/shared/study";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const topic = (
  id: string,
  skill: string,
  status: TopicInfo["status"],
): TopicInfo => ({
  id,
  skill,
  skillId: `sk-${id}`,
  area: id.slice(0, 2),
  level: "essential",
  priority: 2,
  status,
  grade: null,
  startedOn: null,
  finishedOn: null,
  note: "",
});
const BACKLOG = {
  areas: [
    { prefix: "CS", name: "CS Fundamentals", position: 1 },
    { prefix: "FE", name: "Frontend", position: 2 },
  ],
  topics: [
    topic("CS-01", "Big-O notation", "done"),
    topic("CS-02", "Graphs", "in_progress"),
    topic("FE-01", "React", "not_started"),
  ],
};
const course = (
  courseId: string,
  topicId: string,
  recordedAt: string,
  level = "essential",
  module = 1,
) => ({
  courseId,
  topicId,
  level,
  module,
  path: `Study Lab/x/${courseId}/${courseId}__${level}.md`,
  recordedAt,
});
// Newest first, as the API sends them.
const COURSES = {
  courses: [
    course("c-bigo", "CS-01", "2026-10-18T00:00:00.000Z"),
    course("c-react", "FE-01", "2026-10-10T00:00:00.000Z", "specialized", 2),
    course("c-graphs", "CS-02", "2026-10-02T00:00:00.000Z"),
  ],
};

function openCourses() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/study/courses"],
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Courses", () => {
  it("groups by area with In progress topics first, each linking to the reader", async () => {
    mockApi({
      "GET /api/study/courses": () => json(COURSES),
      "GET /api/study/backlog": () => json(BACKLOG),
    });
    openCourses();
    const cs = await screen.findByRole("region", { name: "CS Fundamentals" });
    const links = within(cs).getAllByRole("link");
    expect(links.map((l) => l.querySelector(".row__id")?.textContent)).toEqual([
      "CS-02",
      "CS-01",
    ]);
    expect(links[0]).toHaveAttribute("href", "/study/courses/c-graphs");
    expect(links[0]).toHaveTextContent("In progress");
    expect(screen.getByText("3 courses · 1 in progress")).toBeInTheDocument();
    const fe = screen.getByRole("region", { name: "Frontend" });
    expect(fe).toHaveTextContent(
      "Specialized · Module 2 · Recorded 2026-10-10",
    );
  });

  it("opens the reader from a row", async () => {
    mockApi({
      "GET /api/study/courses": () => json(COURSES),
      "GET /api/study/backlog": () => json(BACKLOG),
      "GET /api/study/courses/c-graphs": () =>
        json(
          { error: "not_found", message: "No such course." },
          { status: 404 },
        ),
    });
    const router = openCourses();
    await userEvent.click(
      await screen.findByRole("link", { name: /CS-02.*Graphs/ }),
    );
    expect(router.state.location.pathname).toBe("/study/courses/c-graphs");
    expect(document.querySelector(".shell")).toBeNull(); // the reader is full screen
  });

  it("names /learn when there are no courses", async () => {
    mockApi({
      "GET /api/study/courses": () => json({ courses: [] }),
      "GET /api/study/backlog": () => json(BACKLOG),
    });
    openCourses();
    expect(await screen.findByText("No courses yet")).toBeInTheDocument();
    expect(screen.getByText("/learn <topic>")).toBeInTheDocument();
  });

  it("tells a failed read from offline", async () => {
    mockApi({
      "GET /api/study/courses": () =>
        json({ error: "internal" }, { status: 500 }),
      "GET /api/study/backlog": () => json(BACKLOG),
    });
    openCourses();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Load failed"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
  });
});
