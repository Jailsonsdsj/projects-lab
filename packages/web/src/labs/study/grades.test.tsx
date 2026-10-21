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
  grade: number | null,
): TopicInfo => ({
  id,
  skill,
  skillId: `sk-${id}`,
  area: id.slice(0, 2),
  level: "essential",
  priority: 2,
  status,
  grade,
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
    topic("CS-01", "Big-O notation", "done", 85),
    topic("FE-01", "React", "done", 60),
    topic("FE-02", "Vue", "in_progress", null),
  ],
};
const exam = (
  examId: string,
  topicId: string,
  attempt: number,
  grade: number | null,
  gradedAt: string | null,
) => ({
  examId,
  topicId,
  level: "essential",
  attempt,
  mdPath: `Study Lab/x/${examId}.md`,
  pdfPath: `Study Lab/x/${examId}.pdf`,
  source: "claude",
  createdAt: "2026-10-01T00:00:00.000Z",
  grade,
  gradedAt,
});
const EXAMS = {
  exams: [
    // React: passed #1, then a retake graded lower (#2): the skill isn't verified.
    exam("fe-2", "FE-01", 2, 60, "2026-10-12T10:00:00.000Z"),
    // Big-O: one exam, corrected to 85; gradedAt is the first grading's.
    exam("cs-1", "CS-01", 1, 85, "2026-10-15T10:00:00.000Z"),
    exam("fe-1", "FE-01", 1, 75, "2026-10-05T10:00:00.000Z"),
    // Vue: recorded, awaiting a grade: not a grade yet.
    exam("vue-1", "FE-02", 1, null, null),
  ],
};

function openGrades() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/study/grades"],
  });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Grades", () => {
  it("shows the average of Done topics and courses done", async () => {
    mockApi({
      "GET /api/study/exams": () => json(EXAMS),
      "GET /api/study/backlog": () => json(BACKLOG),
    });
    openGrades();
    const stats = await screen.findAllByText(/Average grade|Courses done/, {
      selector: ".stat__label",
    });
    expect(stats).toHaveLength(2);
    // (85 + 60) / 2 = 72.5 → 7.3
    expect(stats[0]?.closest(".stat")).toHaveTextContent("7.3/ 10");
    expect(stats[1]?.closest(".stat")).toHaveTextContent("2of 3");
  });

  it("groups Passed and To review, newest first, Verified only where it holds now", async () => {
    mockApi({
      "GET /api/study/exams": () => json(EXAMS),
      "GET /api/study/backlog": () => json(BACKLOG),
    });
    const user = userEvent.setup();
    const router = openGrades();
    const passed = await screen.findByRole("region", { name: "Passed" });
    const passedRows = within(passed).getAllByRole("link");
    expect(
      passedRows.map((r) => r.querySelector(".row__id")?.textContent),
    ).toEqual(["CS-01", "FE-01"]);
    expect(passedRows[0]).toHaveTextContent("Verified");
    expect(passedRows[0]).toHaveTextContent("Essential exam #1 · 2026-10-15");
    expect(passedRows[0]).toHaveTextContent("8.5");
    // React's passed #1 was superseded by a lower retake: not verified now.
    expect(passedRows[1]).not.toHaveTextContent("Verified");
    const review = screen.getByRole("region", { name: "To review" });
    expect(within(review).getByRole("link")).toHaveTextContent(
      "Essential retake #2",
    );
    expect(screen.queryByText(/Vue/)).toBeNull();
    expect(
      screen.getByText("A passed exam marks the skill Verified in Career Lab."),
    ).toBeInTheDocument();

    await user.click(passedRows[0] as HTMLElement);
    expect(router.state.location.pathname).toBe("/study/exams/cs-1");
  });

  it("names /final-exam when nothing is graded yet", async () => {
    mockApi({
      "GET /api/study/exams": () =>
        json({ exams: [exam("vue-1", "FE-02", 1, null, null)] }),
      "GET /api/study/backlog": () => json(BACKLOG),
    });
    openGrades();
    expect(await screen.findByText("No grades yet")).toBeInTheDocument();
    expect(screen.getByText("/final-exam")).toBeInTheDocument();
  });

  it("tells a failed read from offline", async () => {
    mockApi({
      "GET /api/study/exams": () =>
        json({ error: "internal" }, { status: 500 }),
      "GET /api/study/backlog": () => json(BACKLOG),
    });
    openGrades();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Load failed"),
    );
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(await screen.findByText("You're offline")).toBeInTheDocument();
  });
});
