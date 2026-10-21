import { expect, test } from "./signed-in";

// The Grades tab (ST-08b) in WebKit at every width, against a mocked API.
test.use({ serviceWorkers: "block" });

const topic = (id: string, skill: string, status: string, grade: number) => ({
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
const exam = (examId: string, topicId: string, grade: number, at: string) => ({
  examId,
  topicId,
  level: "essential",
  attempt: 1,
  mdPath: `Study Lab/x/${examId}.md`,
  pdfPath: `Study Lab/x/${examId}.pdf`,
  source: "claude",
  createdAt: at,
  grade,
  gradedAt: at,
});

test("shows the stats and graded exams, and opens one", async ({ page }) => {
  await page.route("**/api/study/backlog", (route) =>
    route.fulfill({
      json: {
        areas: [
          { prefix: "CS", name: "CS Fundamentals", position: 1 },
          { prefix: "DB", name: "Databases and Data", position: 4 },
        ],
        topics: [
          topic("CS-01", "Big-O notation", "done", 85),
          topic(
            "DB-01",
            "Transactions and isolation levels in PostgreSQL",
            "done",
            55,
          ),
        ],
      },
    }),
  );
  await page.route("**/api/study/exams", (route) =>
    route.fulfill({
      json: {
        exams: [
          exam("db-1", "DB-01", 55, "2026-10-16T10:00:00.000Z"),
          exam("cs-1", "CS-01", 85, "2026-10-15T10:00:00.000Z"),
        ],
      },
    }),
  );
  await page.route("**/api/study/exams/*", (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
  await page.goto("/study/grades");
  await expect(page.locator(".stat").first()).toContainText("7.0");
  const passed = page.getByRole("region", { name: "Passed" });
  await expect(
    passed.getByText("Verified").locator("visible=true"),
  ).toHaveCount(1);
  await expect(page.getByRole("region", { name: "To review" })).toContainText(
    "5.5",
  );
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  await passed.getByRole("link", { name: /CS-01/ }).click();
  await expect(page).toHaveURL(/\/study\/exams\/cs-1$/);
});
