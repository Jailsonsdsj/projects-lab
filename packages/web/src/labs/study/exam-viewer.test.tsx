import type {
  BacklogResponse,
  ExamInfo,
  TopicInfo,
} from "@projects-lab/shared/study";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json } from "../../../test/api";
import { createRoutes } from "../../app";

const MD_SHA = "a".repeat(40);
const PDF_SHA = "b".repeat(40);
const BASE =
  "Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-2";
const exam = (over: Partial<ExamInfo> = {}) => ({
  examId: "exam-2",
  topicId: "CS-01",
  skill: "Big-O notation",
  level: "essential",
  attempt: 2,
  mdPath: `${BASE}.md`,
  pdfPath: `${BASE}.pdf`,
  createdAt: "2026-10-18T12:00:00.000Z",
  grade: 90,
  // Graded first on the 18th; corrected later, which kept this date.
  gradedAt: "2026-10-18T15:00:00.000Z",
  md: { sha: MD_SHA, name: "big-o-notation__essential__exam-2.md" },
  pdf: { sha: PDF_SHA, name: "big-o-notation__essential__exam-2.pdf" },
  ...over,
});
const MARKDOWN =
  "# Final exam · Big-O Notation\n\n**1. [MC · 1 pt]** What does Big-O describe?\n";

function api(meta: () => Response) {
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
    const path = String(input);
    if (path === "/api/study/exams/exam-2") return meta();
    if (
      path ===
      `/api/study/content/${MD_SHA}/big-o-notation__essential__exam-2.md`
    )
      return new Response(MARKDOWN);
    throw new Error(`unexpected request ${path}`);
  });
}

function open(at = "/study/exams/exam-2") {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [at] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Exam viewer", () => {
  it("shows the questions, the grade with the date it was first given, and the PDF link", async () => {
    api(() => json({ exam: exam() }));
    open();
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Final exam · Big-O Notation",
      }),
    ).toBeInTheDocument();
    expect(document.querySelector(".phead__title")).toHaveTextContent(
      "CS-01 · Essential retake #2",
    );
    expect(document.querySelector(".reader__meta")).toHaveTextContent(
      "Grade 9.0 · 2026-10-18",
    );
    expect(screen.getByRole("link", { name: "Open the PDF" })).toHaveAttribute(
      "href",
      `/api/study/content/${PDF_SHA}/big-o-notation__essential__exam-2.pdf`,
    );
    expect(document.querySelector(".shell")).toBeNull();
  });

  it("says Awaiting grade before it's graded", async () => {
    api(() => json({ exam: exam({ grade: null, gradedAt: null }) }));
    open();
    expect(await screen.findByText("Awaiting grade")).toBeInTheDocument();
  });

  it("names the path when a file left study-materials", async () => {
    const message = `This exam file is no longer in study-materials: ${BASE}.pdf`;
    api(() => json({ error: "not_found", message }, { status: 404 }));
    open();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});

describe("Exams in the topic sheet", () => {
  const bigO: TopicInfo = {
    id: "CS-01",
    skill: "Big-O notation",
    skillId: "sk-bigo",
    area: "CS",
    level: "essential",
    priority: 2,
    status: "done",
    grade: 90,
    startedOn: "2026-10-01",
    finishedOn: "2026-10-18",
    note: "",
  };
  const backlog: BacklogResponse = {
    areas: [{ prefix: "CS", name: "CS Fundamentals", position: 1 }],
    topics: [bigO],
  };

  it("lists attempts newest first with the grade or Awaiting grade, linking to each", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const path = String(input);
      if (path === "/api/study/backlog") return json(backlog);
      if (path === "/api/study/exams?topicId=CS-01")
        return json({
          exams: [
            exam({ examId: "exam-3", attempt: 3, grade: null, gradedAt: null }),
            exam(),
          ],
        });
      return json({ error: "not_found" }, { status: 404 });
    });
    const user = userEvent.setup();
    const router = open("/study");
    await user.click(
      await screen.findByRole("button", { name: /CS-01.*Big-O notation/ }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "CS-01 · Big-O notation",
    });
    const exams = await within(sheet).findByRole("region", { name: "Exams" });
    const links = within(exams).getAllByRole("link");
    expect(
      links.map((l) => l.querySelector(".row__title")?.textContent),
    ).toEqual(["Essential retake #3", "Essential retake #2"]);
    expect(links[0]).toHaveTextContent("Awaiting grade");
    expect(links[1]).toHaveTextContent("9.0");
    await user.click(links[1] as HTMLElement);
    expect(router.state.location.pathname).toBe("/study/exams/exam-2");
  });
});
