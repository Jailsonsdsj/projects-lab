import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, test } from "./signed-in";

// The course reader (ST-07a) in WebKit at every width, against a mocked API
// serving the real Big-O course: full screen, the outline (a Sheet on phone,
// beside the text on tablet), Next through the lessons, no horizontal scroll.
test.use({ serviceWorkers: "block" });

const SHA = "c".repeat(40);
const MARKDOWN = readFileSync(
  path.join(
    import.meta.dirname,
    "../packages/web/test/fixtures/big-o-notation__fast-track.md",
  ),
  "utf8",
);

test.beforeEach(async ({ page }) => {
  await page.route("**/api/study/courses/course-bigo", (route) =>
    route.fulfill({
      json: {
        course: {
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
        },
      },
    }),
  );
  await page.route(`**/api/study/content/${SHA}/**`, (route) =>
    route.fulfill({ body: MARKDOWN, contentType: "text/markdown" }),
  );
});

const noHorizontalScroll = async (page: import("@playwright/test").Page) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

test("reads the course page by page, full screen", async ({ page }) => {
  await page.goto("/study/courses/course-bigo");
  await expect(
    page.getByRole("heading", { level: 1, name: "Big-O Notation" }),
  ).toBeVisible();
  await expect(page.locator(".shell")).toHaveCount(0);
  await noHorizontalScroll(page);

  await page
    .getByRole("button", { name: "Lesson 1 · What Big-O measures and why" })
    .click();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Lesson 1 · What Big-O measures and why",
    }),
  ).toBeVisible();
  await expect(page.getByText("📖 Lesson 1 of 3")).toBeVisible();
  await expect(page).toHaveURL(/\?p=1$/);

  // Lesson 2 has the widest tables and code: still no horizontal scroll.
  await page
    .getByRole("button", { name: "Lesson 2 · The common complexity classes" })
    .click();
  await expect(page.getByText("📖 Lesson 2 of 3")).toBeVisible();
  await noHorizontalScroll(page);
});

test("shows the outline: a Sheet on phone, beside the text on tablet", async ({
  page,
}, info) => {
  await page.goto("/study/courses/course-bigo?p=1");
  await expect(page.getByText("📖 Lesson 1 of 3")).toBeVisible();
  let outline = page.getByRole("complementary", { name: "Lesson outline" });
  if (info.project.name === "phone") {
    await expect(outline).toHaveCount(0);
    await page.getByRole("button", { name: "Lesson outline" }).click();
    outline = page.getByRole("dialog", { name: "Lesson outline" });
  }
  await expect(outline).toBeVisible();
  await expect(
    outline.getByRole("navigation", { name: "Lessons" }).getByRole("link"),
  ).toHaveCount(3);
  await outline.getByRole("link", { name: /Analyzing your own code/ }).click();
  await expect(page.getByText("📖 Lesson 3 of 3")).toBeVisible();
  await noHorizontalScroll(page);
});

test("keeps a lesson's answers hidden until asked for", async ({ page }) => {
  await page.goto("/study/courses/course-bigo?p=2");
  await expect(page.getByText("📖 Lesson 2 of 3")).toBeVisible();
  const answer = page.getByText("Binary search halves the search space");
  await expect(answer).toHaveCount(0);
  await page.getByRole("button", { name: "Show answer key" }).click();
  await expect(answer).toBeVisible();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
