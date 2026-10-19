import { expect, test } from "./signed-in";

// The Courses tab and Home's Continue (ST-07c) in WebKit at every width,
// against a mocked API. Service workers are blocked so page.route sees all.
test.use({ serviceWorkers: "block" });

const topic = (id: string, skill: string, status: string) => ({
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

test.beforeEach(async ({ page }) => {
  await page.route("**/api/study/backlog", (route) =>
    route.fulfill({
      json: {
        areas: [{ prefix: "CS", name: "CS Fundamentals", position: 1 }],
        topics: [
          topic("CS-01", "Big-O notation", "done"),
          topic(
            "CS-02",
            "Graphs and the algorithms that walk them",
            "in_progress",
          ),
        ],
      },
    }),
  );
  await page.route("**/api/study/courses", (route) =>
    route.fulfill({
      json: {
        courses: [
          {
            courseId: "c-bigo",
            topicId: "CS-01",
            level: "fast_track",
            module: 1,
            path: "Study Lab/cs/big-o/big-o__fast-track.md",
            recordedAt: "2026-10-18T00:00:00.000Z",
          },
          {
            courseId: "c-graphs",
            topicId: "CS-02",
            level: "specialized",
            module: 2,
            path: "Study Lab/cs/graphs/graphs__specialized_m2.md",
            recordedAt: "2026-10-02T00:00:00.000Z",
          },
        ],
      },
    }),
  );
  // The reader's own read isn't under test here.
  await page.route("**/api/study/courses/*", (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
});

test("lists courses with In progress first and opens the reader", async ({
  page,
}) => {
  await page.goto("/study/courses");
  const cs = page.getByRole("region", { name: "CS Fundamentals" });
  await expect(cs.locator(".row__id")).toHaveText(["CS-02", "CS-01"]);
  await expect(cs).toContainText("Specialized · Module 2");
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  await cs.getByRole("link", { name: /CS-02/ }).click();
  await expect(page).toHaveURL(/\/study\/courses\/c-graphs$/);
  await expect(page.locator(".shell")).toHaveCount(0);
});

test("Home's Study card continues the latest course", async ({ page }) => {
  await page.route("**/api/study/summary", (route) =>
    route.fulfill({
      json: {
        stats: [
          { value: "1", label: "In progress" },
          { value: "0", label: "Not started" },
          { value: "—", label: "Average grade" },
        ],
        foot: { label: "Continue", value: "CS-02 Graphs" },
        href: "/study/courses/c-graphs",
      },
    }),
  );
  await page.goto("/");
  const study = page.locator('.labcard[data-lab="study"]');
  await expect(study).toContainText("Continue CS-02 Graphs");
  await study.click();
  await expect(page).toHaveURL(/\/study\/courses\/c-graphs$/);
});
