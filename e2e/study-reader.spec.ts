import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, type Page, test } from "./signed-in";

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

test("puts the outline on the left; hidden, the text takes the width", async ({
  page,
}, info) => {
  await page.goto("/study/courses/course-bigo?p=2");
  await expect(page.getByText("📖 Lesson 2 of 3")).toBeVisible();
  if (info.project.name === "phone") {
    await expect(
      page.getByRole("button", { name: "Hide lesson outline" }),
    ).toHaveCount(0);
    return;
  }
  const aside = page.getByRole("complementary", { name: "Lesson outline" });
  const main = page.locator(".reader__main");
  const prose = page.locator(".reader__main .prose");
  const asideBox = await aside.boundingBox();
  const mainBox = await main.boundingBox();
  expect(asideBox && mainBox && asideBox.x < mainBox.x).toBe(true);
  const narrow = (await prose.boundingBox())?.width ?? 0;

  // It slides out: frame by frame, further left each time, never jumping
  // straight to the end.
  const out = await slide(page, "Hide lesson outline");
  expect(out.length).toBeGreaterThan(3);
  expect(out.slice(1).every((x, i) => x <= (out[i] as number))).toBe(true);
  const start = out[0] as number;
  const end = out.at(-1) as number;
  expect(end).toBeLessThan(start - 200); // --size-outline is 240px
  expect(out.some((x) => x < start - 20 && x > end + 20)).toBe(true);
  await expect(aside).toHaveCount(0);
  const viewport = page.viewportSize()?.width ?? 0;
  const appMax = 1200; // --size-app-max
  // Up to the app's maximum, centred beyond it, once the slide ends.
  await expect
    .poll(async () => (await main.boundingBox())?.width ?? 0)
    .toBeCloseTo(Math.min(viewport, appMax), 0);
  const wide = await main.boundingBox();
  expect(wide?.x).toBeCloseTo(Math.max(0, (viewport - appMax) / 2), 0);
  // The text fills the column: padding kept, no 68ch cap.
  expect((await prose.boundingBox())?.width ?? 0).toBeGreaterThan(narrow);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  // And back in, frame by frame, to where it started.
  const back = await slide(page, "Show lesson outline");
  expect(back.slice(1).every((x, i) => x >= (back[i] as number))).toBe(true);
  expect(back.some((x) => x > end + 20 && x < start - 20)).toBe(true);
  expect(back.at(-1)).toBeCloseTo(start, 0);
  await expect(aside).toBeVisible();
});

test("with reduced motion the outline goes and comes back at once", async ({
  page,
}, info) => {
  test.skip(info.project.name === "phone", "no outline column on phone");
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/study/courses/course-bigo?p=2");
  await expect(page.getByText("📖 Lesson 2 of 3")).toBeVisible();
  const out = await slide(page, "Hide lesson outline");
  // The first frame after the tap is already the last.
  expect(new Set(out.slice(1)).size).toBe(1);
  expect(out[1]).toBeLessThan((out[0] as number) - 200);
});

/** The outline column's left edge on every frame for a while after tapping
 *  `button`, starting with where it was. */
async function slide(page: Page, button: string): Promise<number[]> {
  const xs = page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const aside = document.getElementById("reader-outline") as HTMLElement;
        const xs = [aside.getBoundingClientRect().x];
        const until = performance.now() + 600;
        const frame = () => {
          xs.push(aside.getBoundingClientRect().x);
          if (performance.now() < until) requestAnimationFrame(frame);
          else done(xs);
        };
        // Starts with the tap: the button's click runs the first frame.
        document.addEventListener("click", () => requestAnimationFrame(frame), {
          once: true,
          capture: true,
        });
      }),
  );
  await page.getByRole("button", { name: button }).click();
  return xs;
}

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

test("loads Mermaid only for a page with a diagram, and draws it", async ({
  page,
}) => {
  const mermaidRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/assets\/mermaid\.core-[^/]*\.js$/.test(request.url()))
      mermaidRequests.push(request.url());
  });
  await page.goto("/study/courses/course-bigo?p=1");
  await expect(page.getByText("📖 Lesson 1 of 3")).toBeVisible();
  await page.waitForLoadState("networkidle");
  expect(mermaidRequests).toEqual([]);

  await page
    .getByRole("button", { name: "Lesson 2 · The common complexity classes" })
    .click();
  const figure = page.getByRole("figure", { name: "Diagram: flowchart" });
  await expect(figure.locator("svg")).toBeVisible();
  expect(mermaidRequests).toHaveLength(1);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test("draws diagrams in the token colours, dark scheme included", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/study/courses/course-bigo?p=2");
  const label = page
    .getByRole("figure", { name: "Diagram: flowchart" })
    .locator(".nodeLabel")
    .first();
  await expect(label).toBeVisible();
  const { drawn, ink } = await label.evaluate((el) => {
    const probe = document.createElement("span");
    probe.style.color = "var(--color-ink)";
    document.body.append(probe);
    const ink = getComputedStyle(probe).color;
    probe.remove();
    return { drawn: getComputedStyle(el).color, ink };
  });
  expect(drawn).toBe(ink);
});

// The quick check answers itself from the lesson's key. jsdom has no cascade:
// green and red are checked here, against computed styles.
test("checks the quick check as it's answered, in green and red", async ({
  page,
}) => {
  await page.goto("/study/courses/course-bigo?p=2");
  const choice = page.getByRole("radiogroup", {
    name: "Which complexity class describes binary search on a sorted array?",
  });
  await choice.getByText("O(n)", { exact: true }).click();
  const wrong = choice.locator(".quiz__opt.is-wrong");
  const right = choice.locator(".quiz__opt.is-correct");
  await expect(right).toContainText("O(log n)");
  const tint = (el: import("@playwright/test").Locator) =>
    el.evaluate((node) => getComputedStyle(node).backgroundColor);
  const probe = (token: string) =>
    page.evaluate((t) => {
      const el = document.createElement("span");
      el.style.backgroundColor = `var(${t})`;
      document.body.append(el);
      const value = getComputedStyle(el).backgroundColor;
      el.remove();
      return value;
    }, token);
  const success = await probe("--color-success-tint");
  const danger = await probe("--color-danger-tint");
  await expect.poll(() => tint(right)).toBe(success);
  await expect.poll(() => tint(wrong)).toBe(danger);

  const statement = page.getByRole("radiogroup", {
    name: /A single for loop over an array is always/,
  });
  // On a slow runner, revealing the first answer's explanation can still move
  // this row as the click lands (CI, 2026-10-21): click until the radio is
  // checked, then check what answering it does.
  await expect(async () => {
    await statement.getByText("True", { exact: true }).click();
    await expect(statement.getByRole("radio", { name: "True" })).toBeChecked({
      timeout: 1000,
    });
  }).toPass();
  await expect(statement).toHaveClass(/is-wrong/);
  await expect.poll(() => tint(statement)).toBe(danger);
  await noHorizontalScroll(page);
});
