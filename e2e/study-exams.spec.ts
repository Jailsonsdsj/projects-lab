import { expect, test } from "./signed-in";

// Exam attempts (ST-08a) in WebKit at every width, against a mocked API: from
// a topic's sheet to the exam viewer, and its PDF link.
test.use({ serviceWorkers: "block" });

const MD = "a".repeat(40);
const PDF = "b".repeat(40);
const BASE =
  "Study Lab/cs-fundamentals/big-o-notation/big-o-notation__essential__exam-1";
const EXAM = {
  examId: "exam-1",
  topicId: "CS-01",
  level: "essential",
  attempt: 1,
  mdPath: `${BASE}.md`,
  pdfPath: `${BASE}.pdf`,
  source: "claude",
  createdAt: "2026-10-18T12:00:00.000Z",
  grade: 85,
  gradedAt: "2026-10-18T15:00:00.000Z",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/study/backlog", (route) =>
    route.fulfill({
      json: {
        areas: [{ prefix: "CS", name: "CS Fundamentals", position: 1 }],
        topics: [
          {
            id: "CS-01",
            skill: "Big-O notation",
            skillId: "sk-bigo",
            area: "CS",
            level: "essential",
            priority: 2,
            status: "done",
            grade: 85,
            startedOn: "2026-10-01",
            finishedOn: "2026-10-18",
            note: "",
          },
        ],
      },
    }),
  );
  await page.route("**/api/study/exams?topicId=CS-01", (route) =>
    route.fulfill({ json: { exams: [EXAM] } }),
  );
  await page.route("**/api/study/exams/exam-1", (route) =>
    route.fulfill({
      json: {
        exam: {
          ...EXAM,
          skill: "Big-O notation",
          md: { sha: MD, name: "big-o-notation__essential__exam-1.md" },
          pdf: { sha: PDF, name: "big-o-notation__essential__exam-1.pdf" },
        },
      },
    }),
  );
  await page.route(`**/api/study/content/${MD}/**`, (route) =>
    route.fulfill({
      body: "# Final exam · Big-O Notation\n\n**1. [MC · 1 pt]** What does Big-O describe, in a sentence long enough to wrap on a phone?\n",
      contentType: "text/markdown",
    }),
  );
});

test("opens an attempt from the topic sheet, with its PDF link", async ({
  page,
}) => {
  await page.goto("/study");
  await page.getByRole("button", { name: /CS-01.*Big-O notation/ }).click();
  const sheet = page.getByRole("dialog", { name: "CS-01 · Big-O notation" });
  const attempt = sheet
    .getByRole("region", { name: "Exams" })
    .getByRole("link", { name: /Essential exam #1/ });
  await expect(attempt).toContainText("8.5");
  await attempt.click();

  await expect(page).toHaveURL(/\/study\/exams\/exam-1$/);
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Final exam · Big-O Notation",
    }),
  ).toBeVisible();
  await expect(page.locator(".reader__meta")).toContainText("Grade 8.5");
  await expect(
    page.getByRole("link", { name: "Open the PDF" }),
  ).toHaveAttribute(
    "href",
    `/api/study/content/${PDF}/big-o-notation__essential__exam-1.pdf`,
  );
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
