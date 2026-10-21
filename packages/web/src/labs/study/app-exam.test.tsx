import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json } from "../../../test/api";
import { createRoutes } from "../../app";

// An exam made in the app (ST-13e2), in the exam viewer: the answer form with
// its self-saving draft, submitting, and the results.
const MD_SHA = "a".repeat(40);
const QUESTIONS = [
  {
    type: "MC",
    stem: "What is the cost of binary search?",
    options: ["O(1)", "O(log n)", "O(n)", "O(n log n)", "O(n²)"],
  },
  {
    type: "TF",
    statements: [
      "O(2n) is O(n).",
      "O(n²) is O(n³).",
      "includes is O(1).",
      "push is O(1) amortized.",
      "Merge sort is O(1) space.",
    ],
  },
  { type: "OPEN", stem: "Why can O(n²) beat O(n log n)?" },
  {
    type: "CODE",
    stem: "Make it O(log n).",
    code: "for (let i = 1; i < n; i ____(1)____ 2) {}",
    language: "ts",
  },
];
const EMPTY = [
  { type: "MC", choice: null },
  { type: "TF", marks: [null, null, null, null, null] },
  { type: "OPEN", text: "" },
  { type: "CODE", blanks: [""] },
];
const paper = (over: Record<string, unknown> = {}) => ({
  examId: "app-1",
  topicId: "CS-01",
  skill: "Big-O notation",
  level: "fast_track",
  attempt: 2,
  title: "Big-O Notation",
  questions: QUESTIONS,
  draft: EMPTY,
  submittedAt: null,
  result: null,
  ...over,
});
const GRADED = {
  grade: 43,
  review: "Revisit lesson 2.",
  questions: [
    {
      number: 1,
      accuracy: 0,
      points: "0.0 / 2.5",
      answer: { type: "MC", choice: "C" },
      key: { type: "MC", answer: "B", why: "It halves the range." },
    },
    {
      number: 2,
      accuracy: 80,
      points: "2.0 / 2.5",
      answer: { type: "TF", marks: [true, false, false, true, false] },
      key: {
        type: "TF",
        answers: [true, true, false, true, false],
        why: "Upper bounds stack.",
      },
    },
    {
      number: 3,
      accuracy: 50,
      points: "1.25 / 2.5",
      feedback: "Half there.",
      missing: "small inputs",
      answer: { type: "OPEN", text: "Constants." },
      key: {
        type: "OPEN",
        modelAnswer: "Constants and small n.",
        mustCover: ["constants"],
      },
    },
    {
      number: 4,
      accuracy: 100,
      points: "2.5 / 2.5",
      feedback: "Right.",
      answer: { type: "CODE", blanks: ["*="] },
      key: {
        type: "CODE",
        blanks: ["*="],
        solution: "for (let i = 1; i < n; i *= 2) {}",
      },
    },
  ],
};

interface Calls {
  drafts: unknown[];
  submits: unknown[];
}
function api(
  current: () => Record<string, unknown> = () => paper(),
  submit: () => Response = () =>
    json({ paper: paper({ submittedAt: "s", result: GRADED }) }),
) {
  const calls: Calls = { drafts: [], submits: [] };
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const path = String(input);
    if (path === "/api/study/exams/app-1")
      return json({
        exam: {
          examId: "app-1",
          topicId: "CS-01",
          skill: "Big-O notation",
          level: "fast_track",
          attempt: 2,
          mdPath: "Study Lab/x/app-1.md",
          pdfPath: null,
          source: "app",
          createdAt: "t",
          grade: null,
          gradedAt: null,
          md: { sha: MD_SHA, name: "app-1.md" },
          pdf: null,
        },
      });
    if (path === `/api/study/content/${MD_SHA}/app-1.md`)
      return new Response("# Final exam · Big-O Notation\n");
    if (path === "/api/study/exams/app-1/paper")
      return json({ paper: current() });
    if (path === "/api/study/exams/app-1/draft") {
      calls.drafts.push(JSON.parse(String(init?.body)));
      return json({ savedAt: "t" });
    }
    if (path === "/api/study/exams/app-1/submit") {
      calls.submits.push(JSON.parse(String(init?.body)));
      return submit();
    }
    throw new Error(`unexpected request ${path}`);
  });
  return calls;
}

function open() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/study/exams/app-1"],
  });
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("answering an exam made in the app", () => {
  it("asks each question in its own way, and saves the draft a moment after each change", async () => {
    const calls = api();
    const user = userEvent.setup();
    open();
    expect(await screen.findByText("To answer")).toBeInTheDocument();
    const mc = await screen.findByRole("group", { name: "Your answer" });
    await user.click(within(mc).getByRole("radio", { name: "B) O(log n)" }));
    const statementTwo = screen.getByRole("group", {
      name: "II. O(n²) is O(n³).",
    });
    await user.click(within(statementTwo).getByRole("radio", { name: "True" }));
    await user.type(
      screen.getByRole("textbox", { name: "Your answer" }),
      "Constants",
    );
    await user.type(screen.getByRole("textbox", { name: "Blank (1)" }), "*=");
    await vi.waitFor(() =>
      expect(calls.drafts.at(-1)).toEqual({
        answers: [
          { type: "MC", choice: "B" },
          { type: "TF", marks: [null, true, null, null, null] },
          { type: "OPEN", text: "Constants" },
          { type: "CODE", blanks: ["*="] },
        ],
      }),
    );
    expect(await screen.findByText(/Saved/)).toBeInTheDocument();
  });

  it("brings the saved draft back", async () => {
    api(() =>
      paper({
        draft: [
          { type: "MC", choice: "C" },
          EMPTY[1],
          { type: "OPEN", text: "Earlier words" },
          EMPTY[3],
        ],
      }),
    );
    open();
    const mc = await screen.findByRole("group", { name: "Your answer" });
    expect(within(mc).getByRole("radio", { name: "C) O(n)" })).toBeChecked();
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "Earlier words",
    );
  });

  it("confirms, counting the unanswered, then shows the grade and each result", async () => {
    const calls = api();
    const user = userEvent.setup();
    open();
    const mc = await screen.findByRole("group", { name: "Your answer" });
    await user.click(within(mc).getByRole("radio", { name: "C) O(n)" }));
    // One statement of five marked: that question still counts as unanswered.
    await user.click(
      within(
        screen.getByRole("group", { name: "I. O(2n) is O(n)." }),
      ).getByRole("radio", { name: "True" }),
    );
    await user.click(screen.getByRole("button", { name: "Submit answers" }));
    const dialog = await screen.findByRole("dialog", {
      name: "Submit your answers?",
    });
    expect(dialog).toHaveTextContent(
      "3 questions are not answered and will score 0.",
    );
    await user.click(within(dialog).getByRole("button", { name: "Submit" }));

    const grade = await screen.findByRole("region", { name: "Grade" });
    expect(grade).toHaveTextContent("4.3 / 10");
    expect(grade).toHaveTextContent("Below 7.0");
    expect((calls.submits[0] as { answers: unknown[] }).answers[0]).toEqual({
      type: "MC",
      choice: "C",
    });
    expect(screen.getByText("Review suggestions")).toBeInTheDocument();
    const first = screen.getByRole("region", { name: /Question 1/ });
    expect(first).toHaveTextContent("0.0 / 2.5 pt");
    expect(within(first).getByText("Wrong")).toBeInTheDocument();
    expect(first).toHaveTextContent("Your answer C · correct B");
    expect(first).toHaveTextContent("It halves the range.");
    const tf = screen.getByRole("region", { name: /Question 2/ });
    const rows = within(tf)
      .getAllByRole("row")
      .map((r) => r.textContent);
    expect(rows[2]).toBe("II. O(n²) is O(n³).FT");
    expect(document.querySelector(".reader__meta")).toHaveTextContent(
      "Grade 4.3 · today",
    );
    const open3 = screen.getByRole("region", { name: /Question 3/ });
    expect(open3).toHaveTextContent("Model answer: Constants and small n.");
    expect(open3).toHaveTextContent("What was missing: small inputs");
    expect(screen.queryByRole("button", { name: "Submit answers" })).toBeNull();
  });

  it("keeps the answers and says why when grading fails, or when offline", async () => {
    let offline = false;
    api(
      () => paper(),
      () => {
        if (offline) throw new TypeError("Load failed");
        return json(
          {
            error: "ai_overloaded",
            message: "The AI service is busy. Try again in a moment.",
          },
          { status: 503 },
        );
      },
    );
    const user = userEvent.setup();
    open();
    await user.type(
      await screen.findByRole("textbox", { name: "Your answer" }),
      "Kept",
    );
    await user.click(screen.getByRole("button", { name: "Submit answers" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Submit",
      }),
    );
    expect(
      await screen.findByText("Couldn't grade your answers."),
    ).toBeInTheDocument();
    expect(screen.getByText(/The AI service is busy/)).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Your answer" })).toHaveValue(
      "Kept",
    );

    offline = true;
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    await user.click(screen.getByRole("button", { name: "Submit answers" }));
    await user.click(
      within(await screen.findByRole("dialog")).getByRole("button", {
        name: "Submit",
      }),
    );
    expect(
      await screen.findByText(
        "Submitting needs a connection. Your answers are saved here.",
      ),
    ).toBeInTheDocument();
  });

  it("opens straight to the results once graded", async () => {
    api(() =>
      paper({ submittedAt: "s", result: { ...GRADED, grade: 85, review: "" } }),
    );
    open();
    const grade = await screen.findByRole("region", { name: "Grade" });
    expect(grade).toHaveTextContent("8.5 / 10");
    expect(grade).toHaveTextContent(
      "Verified: Big-O notation now counts as proven",
    );
    expect(screen.queryByText("Review suggestions")).toBeNull();
    expect(screen.queryByRole("button", { name: "Submit answers" })).toBeNull();
  });
});
