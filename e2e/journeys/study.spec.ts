import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "@playwright/test";
import { sql } from "./stack";

// H-03, journey 1, on the real stack (scripts/e2e-stack.sh): log in with the
// passphrase → add a topic to the backlog → Claude records a course for it →
// read the course. Everything goes through the Worker and D1 except the two
// reads that need GitHub (the course's file and its text), answered here with
// the real Big-O course. Service workers are blocked so page.route sees them.
test.use({ serviceWorkers: "block" });

const SHA = "c".repeat(40);
const MARKDOWN = readFileSync(
  path.join(
    import.meta.dirname,
    "../../packages/web/test/fixtures/big-o-notation__fast-track.md",
  ),
  "utf8",
);

// Every attempt counts toward the login limit (10 per 15 minutes): each test
// starts in a fresh window, as a later visit would.
test.beforeEach(() => {
  sql("DELETE FROM auth_attempt");
});

const visible = (page: Page, name: string) =>
  page
    .getByRole("link", { name, exact: true })
    .filter({ visible: true })
    .first();

test("log in → add a backlog topic → read its course", async ({
  page,
}, info) => {
  // Unique per width and run: the stack's database lives for the whole run.
  const run = `${info.project.name}-${info.repeatEachIndex}`;
  const skill = `Big-O notation ${run}`;

  // Log in: the browser derives the key from the seed owner's passphrase.
  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page.getByLabel("Passphrase", { exact: true }).fill("projects-lab-dev");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("Your two labs")).toBeVisible();

  // Add a topic from the backlog, opened with the lab switcher (Home's Study
  // card continues the latest course once there is one).
  await page.getByRole("button", { name: "Home" }).first().click();
  await page
    .getByRole("navigation", { name: "Labs" })
    .getByRole("link", { name: /Study Lab/ })
    .click();
  await expect(page).toHaveURL(/\/study$/);
  // The first run starts on an empty backlog: its empty state has the button.
  await page
    .getByRole("button", { name: /^Add( a topic)?$/ })
    .first()
    .click();
  const sheet = page.getByRole("dialog", { name: "Add a topic" });
  await sheet.getByLabel("Skill").fill(skill);
  await expect(sheet.getByText("A new skill.")).toBeVisible();
  await sheet.getByLabel("Area").selectOption("CS");
  await sheet.getByLabel("Level").selectOption("fast_track");
  await sheet.getByRole("button", { name: "Add to backlog" }).click();
  const added = page.getByText(new RegExp(`^Added CS-\\d+ · ${skill}$`));
  await expect(added).toBeVisible();
  const code = /CS-\d+/.exec(await added.innerText())?.[0] ?? "";
  await expect(sheet).toBeHidden();

  // It's in the database: a reload reads it back, not started.
  await page.reload();
  const row = page.getByRole("button", {
    name: new RegExp(`${code}.*${skill}`),
  });
  await expect(
    row.getByText("Not started").locator("visible=true"),
  ).toBeVisible();

  // Claude records the course (study_record_course): the same two writes as
  // recordCourse, which first checks the file on GitHub, so it's SQL here.
  const slug = `big-o-${run}`;
  const coursePath = `Study Lab/cs-fundamentals/${slug}/${slug}__fast-track.md`;
  const now = new Date().toISOString();
  sql(
    `INSERT INTO learn_course (id, topic_id, level, module, path, recorded_at)
       SELECT 'course-${slug}', id, 'fast_track', 1, '${coursePath}', '${now}'
       FROM learn_topic WHERE code = '${code}';
     UPDATE learn_topic SET status = 'in_progress', started_on = '${now.slice(0, 10)}',
       updated_at = '${now}' WHERE code = '${code}'`,
  );
  await page.route(`**/api/study/courses/course-${slug}`, (route) =>
    route.fulfill({
      json: {
        course: {
          courseId: `course-${slug}`,
          topicId: code,
          skill,
          level: "fast_track",
          module: 1,
          path: coursePath,
          recordedAt: now,
          sha: SHA,
          name: `${slug}__fast-track.md`,
          images: {},
        },
      },
    }),
  );
  await page.route(`**/api/study/content/${SHA}/**`, (route) =>
    route.fulfill({ body: MARKDOWN, contentType: "text/markdown" }),
  );

  // The backlog now shows it in progress, and Courses lists it.
  await page.reload();
  await expect(
    row.getByText("In progress").locator("visible=true"),
  ).toBeVisible();
  await visible(page, "Courses").click();
  await expect(page).toHaveURL(/\/study\/courses$/);
  const cs = page.getByRole("region", { name: "CS Fundamentals" });
  await cs.getByRole("link", { name: new RegExp(code) }).click();

  // Read it, full screen, page by page.
  await expect(page).toHaveURL(new RegExp(`/study/courses/course-${slug}$`));
  await expect(
    page.getByRole("heading", { level: 1, name: "Big-O Notation" }),
  ).toBeVisible();
  await expect(page.locator(".shell")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Lesson 1 · What Big-O measures and why" })
    .click();
  await expect(page.getByText("📖 Lesson 1 of 3")).toBeVisible();
  await page
    .getByRole("button", { name: "Lesson 2 · The common complexity classes" })
    .click();
  await expect(page.getByText("📖 Lesson 2 of 3")).toBeVisible();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  // Home's Study card continues it, from the real summary.
  await page.goto("/");
  await expect(page.locator('.labcard[data-lab="study"]')).toContainText(
    `Continue ${code}`,
  );
});
