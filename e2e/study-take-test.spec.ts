import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "./signed-in";

// "Take the test" (ST-13e1) in WebKit at every width, against a mocked API:
// the form (types open, no horizontal scroll), generating, opening the new
// exam, and the course's exams in the outline on tablet.
test.use({ serviceWorkers: "block" });

const SHA = "c".repeat(40);
const MARKDOWN = readFileSync(
  path.join(
    import.meta.dirname,
    "../packages/web/test/fixtures/big-o-notation__fast-track.md",
  ),
  "utf8",
);
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

const sent: unknown[] = [];
test.beforeEach(async ({ page }) => {
  sent.length = 0;
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
  await page.route("**/api/study/exams?topicId=CS-01", (route) =>
    route.fulfill({
      json: {
        exams: [
          exam("cc1", 1, {
            source: "claude",
            pdfPath: "Study Lab/x/cc1.pdf",
            grade: 85,
            gradedAt: "g",
          }),
          exam("app2", 2),
        ],
      },
    }),
  );
  await page.route("**/api/study/courses/course-bigo/exams", async (route) => {
    sent.push(route.request().postDataJSON());
    // The model takes a while: the form shows it's working.
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({
      json: {
        exam: {
          examId: "new-exam",
          topicId: "CS-01",
          level: "fast_track",
          attempt: 3,
          title: "Big-O",
          questions: [],
        },
      },
    });
  });
});

const noHorizontalScroll = async (page: Page) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
};

test("takes the test: the form, generating, the new exam", async ({ page }) => {
  await page.goto("/study/courses/course-bigo");
  await expect(
    page.getByRole("heading", { level: 1, name: "Big-O Notation" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Take the test" }).first().click();
  const form = page.getByRole("dialog", { name: "Take the test" });
  await expect(form).toBeVisible();

  await form.getByLabel("Questions").fill("4");
  await form.getByText("Choose question types").click();
  await expect(form.getByRole("alert")).toHaveText(
    "The types add up to 10, not 4.",
  );
  for (const [label, value] of [
    ["Multiple choice (MC)", "2"],
    ["True or false (TF)", "1"],
    ["Open (OPEN)", "1"],
    ["Code fill-in (CODE)", "0"],
    ["Code multiple choice (CODE-MC)", "0"],
  ] as const)
    await form.getByLabel(label).fill(value);
  await expect(form.getByText("Total 4 of 4.")).toBeVisible();
  await noHorizontalScroll(page);

  await form.getByRole("button", { name: "Generate" }).click();
  // The whole screen waits: a tap on the form (its button, always on screen in
  // the sheet's footer) lands on the overlay instead.
  const busy = page.getByRole("dialog", { name: "Writing your exam…" });
  await expect(busy).toBeVisible();
  const button = await form
    .getByRole("button", { name: "Writing your exam" })
    .boundingBox();
  const hit = await page.evaluate(
    ({ x, y }) => document.elementFromPoint(x, y)?.closest("dialog")?.className,
    { x: (button?.x ?? 0) + 8, y: (button?.y ?? 0) + 8 },
  );
  expect(hit).toBe("busy");
  await page.keyboard.press("Escape");
  await expect(busy).toBeVisible();
  await expect(page).toHaveURL(/\/study\/exams\/new-exam$/);
  expect(sent).toEqual([
    { questions: 4, mix: { MC: 2, TF: 1, OPEN: 1, CODE: 0, CODE_MC: 0 } },
  ]);
});

test("lists the course's exams in the outline, with their status", async ({
  page,
}, info) => {
  test.skip(
    info.project.name === "phone",
    "the phone's outline is a sheet, covered by the unit test",
  );
  await page.goto("/study/courses/course-bigo");
  const exams = page.getByRole("navigation", { name: "Exams" });
  await expect(exams.getByRole("link")).toHaveText([
    /Exam #1\s*8\.5/,
    /Exam #2\s*To answer/,
  ]);
  await noHorizontalScroll(page);
});
