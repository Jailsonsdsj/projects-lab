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
  source: "claude",
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

  it("offers no PDF for an exam made in the app, and says it's to answer", async () => {
    api(() =>
      json({
        exam: {
          ...exam({
            pdfPath: null,
            source: "app",
            grade: null,
            gradedAt: null,
          }),
          pdf: null,
        },
      }),
    );
    open();
    // The answer form is app-exam.test.tsx's: here, the frame around it.
    expect(await screen.findByText("To answer")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Open the PDF" })).toBeNull();
  });

  it("names the path when a file left study-materials", async () => {
    const message = `This exam file is no longer in study-materials: ${BASE}.pdf`;
    api(() => json({ error: "not_found", message }, { status: 404 }));
    open();
    expect(await screen.findByText(message)).toBeInTheDocument();
  });
});

describe("Deleting an exam", () => {
  interface Sent {
    method: string;
    path: string;
    key: string | null;
  }
  /** The exam opened from Grades; `deleted` and `restored` answer the writes. */
  function api(
    deleted: () => Response = () =>
      json({ exam: { ...exam(), deletedAt: "d" } }),
    restored: () => Response = () =>
      json({ exam: { ...exam(), deletedAt: null } }),
  ) {
    const sent: Sent[] = [];
    let gradesReads = 0;
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const path = String(input);
      const method = init?.method ?? "GET";
      if (method !== "GET") {
        sent.push({
          method,
          path,
          key: new Headers(init?.headers).get("Idempotency-Key"),
        });
        return path.endsWith("/restore") ? restored() : deleted();
      }
      if (path === "/api/study/exams/exam-2") return json({ exam: exam() });
      if (path.startsWith(`/api/study/content/${MD_SHA}/`))
        return new Response(MARKDOWN);
      if (path === "/api/study/exams") {
        gradesReads += 1;
        return json({ exams: [] });
      }
      if (path === "/api/study/backlog") return json({ areas: [], topics: [] });
      throw new Error(`unexpected request ${method} ${path}`);
    });
    return { sent, gradesReads: () => gradesReads };
  }

  function fromGrades() {
    const router = createMemoryRouter(createRoutes(), {
      initialEntries: ["/study/grades", "/study/exams/exam-2"],
      initialIndex: 1,
    });
    render(<RouterProvider router={router} />);
    return router;
  }

  it("asks first, then deletes and goes back to Grades, which reads again; Undo brings it back", async () => {
    const { sent, gradesReads } = api();
    const user = userEvent.setup();
    const router = fromGrades();
    await user.click(
      await screen.findByRole("button", { name: "Delete exam" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete exam #2?",
    });
    expect(dialog).toHaveTextContent(
      "CS-01 · Essential retake #2 leaves Grades and its course, and the topic's grade is worked out without it. Its files leave study-materials tonight; until then, Undo brings it back.",
    );
    // Cancel sends nothing.
    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(sent).toEqual([]);

    await user.click(screen.getByRole("button", { name: "Delete exam" }));
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Delete exam #2?" }),
      ).getByRole("button", { name: "Delete" }),
    );
    expect(
      await screen.findByText("CS-01 exam #2 deleted"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/study/grades");
    expect(sent).toEqual([
      {
        method: "DELETE",
        path: "/api/study/exams/exam-2",
        key: expect.any(String),
      },
    ]);
    await screen.findByRole("heading", { name: "Grades" });
    const before = gradesReads();

    await user.click(screen.getByRole("button", { name: "Undo" }));
    expect(
      await screen.findByText("CS-01 exam #2 is back"),
    ).toBeInTheDocument();
    expect(sent[1]).toEqual({
      method: "POST",
      path: "/api/study/exams/exam-2/restore",
      key: expect.any(String),
    });
    // Grades, on screen, reads again to show it.
    await vi.waitFor(() => expect(gradesReads()).toBeGreaterThan(before));
  });

  it("takes an exam already gone (404) as deleted", async () => {
    api(() => json({ error: "not_found" }, { status: 404 }));
    const user = userEvent.setup();
    const router = fromGrades();
    await user.click(
      await screen.findByRole("button", { name: "Delete exam" }),
    );
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Delete exam #2?" }),
      ).getByRole("button", { name: "Delete" }),
    );
    expect(
      await screen.findByText("CS-01 exam #2 deleted"),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/study/grades");
  });

  it("stays on the exam and says so when the delete fails", async () => {
    const { sent } = api(() => new Response("boom", { status: 500 }));
    const user = userEvent.setup();
    const router = fromGrades();
    await user.click(
      await screen.findByRole("button", { name: "Delete exam" }),
    );
    const dialog = await screen.findByRole("dialog", {
      name: "Delete exam #2?",
    });
    await user.click(within(dialog).getByRole("button", { name: "Delete" }));
    expect(
      await within(dialog).findByText(
        "Couldn't delete it. Check your connection and try again.",
      ),
    ).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/study/exams/exam-2");
    expect(sent).toHaveLength(1);
  });

  async function deleteThenUndo(user: ReturnType<typeof userEvent.setup>) {
    fromGrades();
    await user.click(
      await screen.findByRole("button", { name: "Delete exam" }),
    );
    await user.click(
      within(
        await screen.findByRole("dialog", { name: "Delete exam #2?" }),
      ).getByRole("button", { name: "Delete" }),
    );
    await user.click(await screen.findByRole("button", { name: "Undo" }));
  }

  it("says why when Undo comes after its files are removed", async () => {
    api(undefined, () =>
      json(
        {
          error: "conflict",
          message:
            "Its files were removed from study-materials, so this exam stays deleted.",
        },
        { status: 409 },
      ),
    );
    await deleteThenUndo(userEvent.setup());
    expect(
      await screen.findByText(
        "Its files were removed from study-materials, so this exam stays deleted.",
      ),
    ).toBeInTheDocument();
  });

  it("offers Retry when Undo fails", async () => {
    const answers = [
      () => new Response("boom", { status: 500 }),
      () => json({ exam: { ...exam(), deletedAt: null } }),
    ];
    const { sent } = api(undefined, () => (answers.shift() ?? answers[0])!());
    const user = userEvent.setup();
    await deleteThenUndo(user);
    expect(
      await screen.findByText("Couldn't bring back CS-01 exam #2."),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(
      await screen.findByText("CS-01 exam #2 is back"),
    ).toBeInTheDocument();
    expect(sent.map((s) => s.method)).toEqual(["DELETE", "POST", "POST"]);
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
