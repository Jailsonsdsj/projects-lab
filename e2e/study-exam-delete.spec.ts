import { expect, test } from "./signed-in";

// Deleting an exam (ST-14b) in WebKit at every width, against a mocked API
// that keeps the deletion: open the latest exam from Grades, delete it, land
// back on Grades without it and with the topic's grade worked out again, then
// Undo. Service workers are blocked so page.route sees every request.
test.use({ serviceWorkers: "block" });

const SHA = "a".repeat(40);
const exam = (examId: string, attempt: number, grade: number, at: string) => ({
  examId,
  topicId: "CS-01",
  level: "essential",
  attempt,
  mdPath: `Study Lab/cs/big-o/big-o__essential__exam-${attempt}.md`,
  pdfPath: `Study Lab/cs/big-o/big-o__essential__exam-${attempt}.pdf`,
  source: "claude",
  createdAt: at,
  grade,
  gradedAt: at,
});
const FIRST = exam("cs-1", 1, 60, "2026-10-15T10:00:00.000Z");
const LATEST = exam("cs-2", 2, 90, "2026-10-20T10:00:00.000Z");

test("deletes an exam from its page, Grades drops it, and Undo brings it back", async ({
  page,
}) => {
  let deleted = false;
  const writes: string[] = [];
  await page.route("**/api/study/backlog", (route) =>
    route.fulfill({
      json: {
        areas: [{ prefix: "CS", name: "CS Fundamentals", position: 1 }],
        topics: [
          {
            id: "CS-01",
            skill: "Big-O notation",
            skillId: "sk-1",
            area: "CS",
            level: "essential",
            priority: 2,
            status: "done",
            // Derived from the latest exam left.
            grade: deleted ? 60 : 90,
            startedOn: null,
            finishedOn: null,
            note: "",
          },
        ],
      },
    }),
  );
  await page.route("**/api/study/exams", (route) =>
    route.fulfill({ json: { exams: deleted ? [FIRST] : [LATEST, FIRST] } }),
  );
  await page.route("**/api/study/exams/cs-2", async (route) => {
    const method = route.request().method();
    if (method === "DELETE") {
      writes.push(method);
      deleted = true;
      return route.fulfill({ json: { exam: { ...LATEST, deletedAt: "d" } } });
    }
    return route.fulfill({
      json: {
        exam: {
          ...LATEST,
          skill: "Big-O notation",
          md: { sha: SHA, name: "big-o__essential__exam-2.md" },
          pdf: { sha: "b".repeat(40), name: "big-o__essential__exam-2.pdf" },
        },
      },
    });
  });
  await page.route("**/api/study/exams/cs-2/restore", (route) => {
    writes.push(route.request().method());
    deleted = false;
    return route.fulfill({ json: { exam: { ...LATEST, deletedAt: null } } });
  });
  await page.route(`**/api/study/content/${SHA}/**`, (route) =>
    route.fulfill({
      contentType: "text/markdown",
      body: "# Final exam · Big-O\n\n**1.** What does Big-O describe?\n",
    }),
  );

  await page.goto("/study/grades");
  const stat = page.locator(".stat").first();
  await expect(stat).toContainText("9.0");
  const retake = page
    .getByRole("link", { name: /retake #2/i })
    .locator("visible=true");
  await expect(retake).toHaveCount(1);
  await page
    .getByRole("region", { name: "Passed" })
    .getByRole("link", { name: /CS-01/ })
    .click();
  await expect(page).toHaveURL(/\/study\/exams\/cs-2$/);

  await page.getByRole("button", { name: "Delete exam" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete exam #2?" });
  await expect(dialog).toContainText("Undo brings it back");
  await dialog.getByRole("button", { name: "Delete" }).click();

  await expect(page).toHaveURL(/\/study\/grades$/);
  await expect(page.getByText("CS-01 exam #2 deleted")).toBeVisible();
  // Grades without it: the topic's grade is the exam before.
  await expect(stat).toContainText("6.0");
  await expect(retake).toHaveCount(0);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("CS-01 exam #2 is back")).toBeVisible();
  await expect(stat).toContainText("9.0");
  await expect(retake).toHaveCount(1);
  expect(writes).toEqual(["DELETE", "POST"]);
});
