import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json } from "../../../test/api";
import bigO from "../../../test/fixtures/big-o-notation__fast-track.md?raw";
import { createRoutes } from "../../app";

// "Take the test" (ST-13e1): the form in the course reader, and the course's
// exams in its outline.
vi.mock("mermaid", () => ({
  default: {
    initialize: () => {},
    render: () => Promise.reject(new Error("no Mermaid in jsdom")),
  },
}));

const SHA = "c".repeat(40);
const COURSE = {
  courseId: "course-bigo",
  topicId: "CS-01",
  skill: "Big-O notation",
  level: "fast_track",
  module: 1,
  path: "Study Lab/cs-fundamentals/big-o-notation/big-o-notation__fast-track.md",
  recordedAt: "2026-10-19T12:00:00.000Z",
  sha: SHA,
  name: "big-o-notation__fast-track.md",
  images: {},
};
const exam = (
  examId: string,
  attempt: number,
  over: Record<string, unknown> = {},
) => ({
  examId,
  topicId: "CS-01",
  level: "fast_track",
  attempt,
  mdPath: `Study Lab/x/${examId}.md`,
  pdfPath: null,
  source: "app",
  createdAt: "t",
  grade: null,
  gradedAt: null,
  ...over,
});
const EXAMS = [
  exam("cc1", 1, {
    source: "claude",
    pdfPath: "Study Lab/x/cc1.pdf",
    grade: 85,
    gradedAt: "g",
  }),
  exam("cc2", 2, { source: "claude", pdfPath: "Study Lab/x/cc2.pdf" }),
  exam("app3", 3),
  exam("other", 1, { level: "essential" }),
];

interface Sent {
  body: unknown;
  key: string | null;
}
function api(
  generate: () => Response = () =>
    json({
      exam: {
        examId: "new-exam",
        topicId: "CS-01",
        level: "fast_track",
        attempt: 4,
        title: "Big-O",
        questions: [],
      },
    }),
) {
  const sent: Sent[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === "/api/study/courses/course-bigo")
      return json({ course: COURSE });
    if (path === `/api/study/content/${SHA}/big-o-notation__fast-track.md`)
      return new Response(bigO, {
        headers: { "Content-Type": "text/markdown" },
      });
    if (path === "/api/study/exams?topicId=CS-01")
      return json({ exams: EXAMS });
    if (
      path === "/api/study/courses/course-bigo/exams" &&
      init?.method === "POST"
    ) {
      sent.push({
        body: JSON.parse(String(init.body)),
        key: new Headers(init.headers).get("Idempotency-Key"),
      });
      return generate();
    }
    // The exam the reader opens afterwards: not under test here.
    return new Response(null, { status: 404 });
  });
  return sent;
}

function tablet() {
  document.documentElement.style.setProperty("--breakpoint-tablet", "768px");
  vi.spyOn(window, "matchMedia").mockImplementation(
    (media) =>
      ({
        matches: media.includes("768px"),
        media,
        addEventListener: () => {},
        removeEventListener: () => {},
      }) as unknown as MediaQueryList,
  );
}

function open(at = "/study/courses/course-bigo") {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [at] });
  render(<RouterProvider router={router} />);
  return router;
}

beforeEach(() => {
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
});
afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
  document.documentElement.style.removeProperty("--breakpoint-tablet");
});

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(
    await screen.findByRole("button", { name: "Take the test" }),
  );
  return screen.findByRole("dialog", { name: "Take the test" });
}

describe("Take the test", () => {
  it("asks for 10 questions by default and opens the exam it gets", async () => {
    tablet();
    const sent = api();
    const user = userEvent.setup();
    const router = open();
    const form = await openForm(user);
    expect(within(form).getByLabelText("Questions")).toHaveValue("10");
    // Every lesson is covered unless some are unticked.
    const lessons = within(form).getAllByRole("checkbox").slice(1);
    expect(lessons.length).toBe(3);
    for (const box of lessons) expect(box).toBeChecked();

    await user.click(within(form).getByRole("button", { name: "Generate" }));
    expect(sent).toEqual([
      {
        body: { questions: 10 },
        key: expect.stringMatching(/^[0-9a-f-]{36}$/),
      },
    ]);
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/study/exams/new-exam"),
    );
  });

  it("sends the types, the lessons and the focus when chosen; the types must add up", async () => {
    tablet();
    const sent = api();
    const user = userEvent.setup();
    open();
    const form = await openForm(user);
    const questions = within(form).getByLabelText("Questions");
    await user.clear(questions);
    await user.type(questions, "5");
    await user.click(
      within(form).getByRole("checkbox", { name: "Choose question types" }),
    );
    expect(within(form).getByRole("alert")).toHaveTextContent(
      "The types add up to 10, not 5.",
    );
    await user.click(within(form).getByRole("button", { name: "Generate" }));
    expect(sent).toEqual([]);

    for (const [label, value] of [
      ["Multiple choice (MC)", "2"],
      ["True or false (TF)", "1"],
      ["Open (OPEN)", "1"],
      ["Code fill-in (CODE)", "0"],
      ["Code multiple choice (CODE-MC)", "1"],
    ] as const) {
      const field = within(form).getByLabelText(label);
      await user.clear(field);
      await user.type(field, value);
    }
    expect(within(form).getByText("Total 5 of 5.")).toBeInTheDocument();
    const lessons = within(form).getAllByRole("checkbox").slice(1);
    await user.click(lessons[1] as HTMLElement);
    await user.type(within(form).getByLabelText(/Focus/), "trade-offs");
    await user.click(within(form).getByRole("button", { name: "Generate" }));
    expect(sent[0]?.body).toEqual({
      questions: 5,
      mix: { MC: 2, TF: 1, OPEN: 1, CODE: 0, CODE_MC: 1 },
      lessons: [1, 3],
      focus: "trade-offs",
    });
  });

  it("needs a number of questions from 1 to 20 and at least one lesson", async () => {
    tablet();
    const sent = api();
    const user = userEvent.setup();
    open();
    const form = await openForm(user);
    const questions = within(form).getByLabelText("Questions");
    await user.clear(questions);
    await user.type(questions, "21");
    expect(
      within(form).getByText("A whole number from 1 to 20."),
    ).toBeInTheDocument();
    await user.clear(questions);
    await user.type(questions, "3");
    for (const box of within(form).getAllByRole("checkbox").slice(1))
      await user.click(box);
    expect(
      within(form).getByText("Choose at least one lesson."),
    ).toBeInTheDocument();
    await user.click(within(form).getByRole("button", { name: "Generate" }));
    expect(sent).toEqual([]);
  });

  it("covers the whole screen while the exam is written, ignoring Escape, until it arrives", async () => {
    tablet();
    let arrive: (response: Response) => void = () => {};
    api(
      () =>
        new Promise<Response>((resolve) => {
          arrive = resolve;
        }) as unknown as Response,
    );
    const user = userEvent.setup();
    const router = open();
    const form = await openForm(user);
    await user.click(within(form).getByRole("button", { name: "Generate" }));
    const busy = await screen.findByRole("dialog", {
      name: "Writing your exam…",
    });
    expect(busy).toHaveAttribute("open");
    expect(busy).toHaveTextContent("This can take up to a minute.");
    // Escape asks a modal to close: this one stays.
    const cancel = new Event("cancel", { cancelable: true });
    busy.dispatchEvent(cancel);
    expect(cancel.defaultPrevented).toBe(true);
    expect(busy).toHaveAttribute("open");

    arrive(
      json({
        exam: {
          examId: "new-exam",
          topicId: "CS-01",
          level: "fast_track",
          attempt: 4,
          title: "Big-O",
          questions: [],
        },
      }),
    );
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/study/exams/new-exam"),
    );
  });

  it("lifts the overlay when writing fails", async () => {
    tablet();
    api(() =>
      json(
        { error: "ai_overloaded", message: "The AI service is busy." },
        { status: 503 },
      ),
    );
    const user = userEvent.setup();
    open();
    const form = await openForm(user);
    await user.click(within(form).getByRole("button", { name: "Generate" }));
    expect(
      await within(form).findByText("Couldn't write the exam."),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("dialog", { name: "Writing your exam…" }),
    ).toBeNull();
  });

  it("says why it couldn't write the exam, keeps the choices, and retries with the same key", async () => {
    tablet();
    let fail = true;
    const sent = api(() =>
      fail
        ? json(
            {
              error: "ai_overloaded",
              message: "The AI service is busy. Try again in a moment.",
            },
            { status: 503 },
          )
        : json({
            exam: {
              examId: "new-exam",
              topicId: "CS-01",
              level: "fast_track",
              attempt: 4,
              title: "Big-O",
              questions: [],
            },
          }),
    );
    const user = userEvent.setup();
    const router = open();
    const form = await openForm(user);
    await user.click(within(form).getByRole("button", { name: "Generate" }));
    expect(
      await within(form).findByText("Couldn't write the exam."),
    ).toBeInTheDocument();
    expect(
      within(form).getByText("The AI service is busy. Try again in a moment."),
    ).toBeInTheDocument();
    expect(within(form).getByLabelText("Questions")).toHaveValue("10");
    fail = false;
    await user.click(within(form).getByRole("button", { name: "Generate" }));
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/study/exams/new-exam"),
    );
    // The same settings, the same key: a lost answer can't buy a second exam.
    expect(sent[1]?.key).toBe(sent[0]?.key);
  });

  it("says a connection is needed when offline", async () => {
    tablet();
    api(() => {
      throw new TypeError("Load failed");
    });
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    const user = userEvent.setup();
    open();
    const form = await openForm(user);
    await user.click(within(form).getByRole("button", { name: "Generate" }));
    expect(
      await within(form).findByText("You're offline."),
    ).toBeInTheDocument();
  });

  it("is in the phone header and at the end of the last page", async () => {
    api();
    const user = userEvent.setup();
    open("/study/courses/course-bigo?p=4");
    await screen.findByText("Done reading?");
    const buttons = screen.getAllByRole("button", { name: "Take the test" });
    expect(buttons.length).toBe(2);
    await user.click(buttons[1] as HTMLElement);
    expect(
      await screen.findByRole("dialog", { name: "Take the test" }),
    ).toBeInTheDocument();
  });
});

describe("the course's exams", () => {
  it("lists this level's attempts in the outline: graded, awaiting grade, to answer", async () => {
    tablet();
    api();
    open();
    const list = await screen.findByRole("navigation", { name: "Exams" });
    const links = within(list).getAllByRole("link");
    expect(links.map((l) => l.textContent)).toEqual([
      "Exam #18.5",
      "Exam #2Awaiting grade",
      "Exam #3To answer",
    ]);
    expect(links[2]).toHaveAttribute("href", "/study/exams/app3");
  });
});
