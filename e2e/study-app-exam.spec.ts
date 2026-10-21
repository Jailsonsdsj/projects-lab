import { expect, type Page, test } from "./signed-in";

// An exam made in the app (ST-13e2) in WebKit at every width, against a mocked
// API that keeps the draft: answering each type, the draft back after a
// reload, submitting, the results; never a horizontal scroll.
test.use({ serviceWorkers: "block" });

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
  {
    type: "OPEN",
    stem: "Why can an O(n²) sort beat an O(n log n) one on small inputs?",
  },
  {
    type: "CODE",
    stem: "Fill in the blanks so the loop runs in O(log n).",
    code: "for (let i = 1; i < items.length; i ____(1)____ 2) {\n  total += items[____(2)____];\n}",
    language: "ts",
  },
];
const EMPTY = [
  { type: "MC", choice: null },
  { type: "TF", marks: [null, null, null, null, null] },
  { type: "OPEN", text: "" },
  { type: "CODE", blanks: ["", ""] },
];

async function mock(page: Page) {
  let draft: unknown[] = EMPTY;
  let graded = false;
  await page.route("**/api/study/exams/app-1", (route) =>
    route.fulfill({
      json: {
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
          grade: graded ? 63 : null,
          gradedAt: graded ? "2026-10-21T12:00:00.000Z" : null,
          md: { sha: MD_SHA, name: "app-1.md" },
          pdf: null,
        },
      },
    }),
  );
  await page.route(`**/api/study/content/${MD_SHA}/**`, (route) =>
    route.fulfill({
      body: "# Final exam · Big-O Notation\n",
      contentType: "text/markdown",
    }),
  );
  const paper = () => ({
    examId: "app-1",
    topicId: "CS-01",
    skill: "Big-O notation",
    level: "fast_track",
    attempt: 2,
    title: "Big-O Notation",
    questions: QUESTIONS,
    draft,
    submittedAt: graded ? "s" : null,
    result: graded
      ? {
          grade: 63,
          review:
            "Revisit lesson 2 (the classes) and lesson 3 (constants in practice).",
          questions: [
            {
              number: 1,
              accuracy: 100,
              points: "2.5 / 2.5",
              answer: draft[0],
              key: {
                type: "MC",
                answer: "B",
                why: "Each step halves the range.",
              },
            },
            {
              number: 2,
              accuracy: 60,
              points: "1.5 / 2.5",
              answer: draft[1],
              key: {
                type: "TF",
                answers: [true, true, false, true, false],
                why: "Upper bounds stack; includes scans.",
              },
            },
            {
              number: 3,
              accuracy: 40,
              points: "1.0 / 2.5",
              feedback: "Mentions constants, not small inputs.",
              missing: "Why small n favours the simpler loop.",
              answer: draft[2],
              key: {
                type: "OPEN",
                modelAnswer:
                  "Hidden constants and cache-friendly loops win while n is small.",
                mustCover: ["constants", "small n"],
              },
            },
            {
              number: 4,
              accuracy: 50,
              points: "1.25 / 2.5",
              feedback: "The step is right; the index isn't.",
              answer: draft[3],
              key: {
                type: "CODE",
                blanks: ["*=", "i"],
                solution:
                  "for (let i = 1; i < items.length; i *= 2) {\n  total += items[i];\n}",
              },
            },
          ],
        }
      : null,
  });
  await page.route("**/api/study/exams/app-1/paper", (route) =>
    route.fulfill({ json: { paper: paper() } }),
  );
  await page.route("**/api/study/exams/app-1/draft", (route) => {
    draft = (route.request().postDataJSON() as { answers: unknown[] }).answers;
    return route.fulfill({ json: { savedAt: "t" } });
  });
  await page.route("**/api/study/exams/app-1/submit", async (route) => {
    draft = (route.request().postDataJSON() as { answers: unknown[] }).answers;
    await new Promise((resolve) => setTimeout(resolve, 400));
    graded = true;
    return route.fulfill({ json: { paper: paper() } });
  });
}

const noHorizontalScroll = async (page: Page) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

test("answers each type, keeps the draft, submits and shows the results", async ({
  page,
}) => {
  await mock(page);
  await page.goto("/study/exams/app-1");
  await expect(page.getByText("To answer")).toBeVisible();

  const q1 = page.getByRole("region", { name: /Question 1/ });
  await q1.getByText("B) O(log n)").click();
  const q2 = page.getByRole("region", { name: /Question 2/ });
  for (const [statement, value] of [
    ["I. O(2n) is O(n).", "True"],
    ["II. O(n²) is O(n³).", "False"],
    ["III. includes is O(1).", "False"],
  ] as const)
    await q2.getByRole("group", { name: statement }).getByText(value).click();
  await page
    .getByRole("region", { name: /Question 3/ })
    .getByLabel("Your answer")
    .fill("Constants hide the real cost.");
  const q4 = page.getByRole("region", { name: /Question 4/ });
  await q4.getByLabel("Blank (1)").fill("*=");
  await q4.getByLabel("Blank (2)").fill("i - 1");
  await expect(page.getByText(/Saved/)).toBeVisible();
  await noHorizontalScroll(page);

  // The draft comes back.
  await page.reload();
  await expect(
    page.getByRole("region", { name: /Question 3/ }).getByLabel("Your answer"),
  ).toHaveValue("Constants hide the real cost.");
  await expect(q1.getByRole("radio", { name: "B) O(log n)" })).toBeChecked();

  await page.getByRole("button", { name: "Submit answers" }).click();
  const confirm = page.getByRole("dialog", { name: "Submit your answers?" });
  await expect(confirm).toContainText(
    "1 question is not answered and will score 0.",
  );
  await confirm.getByRole("button", { name: "Submit" }).click();
  await expect(page.getByRole("status")).toContainText("Grading your answers…");

  const grade = page.getByRole("region", { name: "Grade" });
  await expect(grade).toContainText("6.3 / 10");
  // The header follows at once, without a reload.
  await expect(page.locator(".reader__meta")).toContainText(
    "Grade 6.3 · today",
  );
  await expect(page.getByText("Review suggestions")).toBeVisible();
  await expect(page.getByRole("region", { name: /Question 4/ })).toContainText(
    "Reference solution",
  );
  await noHorizontalScroll(page);
});
