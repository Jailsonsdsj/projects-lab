import { expect, type Page, test } from "./signed-in";

// H-01: every lab screen, offline and against a failing server, in WebKit at
// every width. Offline: the app loads online, the browser goes offline, then
// each screen is opened client-side and must say it's offline (with Retry).
// Server down: every /api request answers 500, and each screen shows its error
// state with Retry. No screen ever shows a stack trace or a raw error.
// Service workers are blocked so page.route sees every request.
test.use({ serviceWorkers: "block" });

/** Every screen that reads from the API, with its views. */
const SCREENS = [
  "/study",
  "/study/courses",
  "/study/grades",
  "/study/courses/c1",
  "/study/exams/e1",
  "/career",
  "/career?view=openings",
  "/career?view=criteria",
  "/career/jobs/j1",
  "/career/skills",
  "/career/profile",
  "/career/documents",
  "/career/interviews",
  "/career/interviews?view=stories",
  "/career/interviews?view=practice",
  "/connections",
];

/** What a raw error or a stack trace looks like on a page. */
const RAW =
  /\b(TypeError|ReferenceError|SyntaxError|Uncaught|at \w+ \(|stack trace|undefined is not|\[object Object\])/;

async function noRawError(page: Page) {
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(RAW);
}

/** A client-side navigation, as a link would make: no page load, so it works offline. */
async function openClientSide(page: Page, path: string) {
  await page.evaluate((to) => {
    history.pushState(null, "", to);
    dispatchEvent(new PopStateEvent("popstate"));
  }, path);
}

test("offline: every screen says so, with Retry", async ({ page, context }) => {
  await page.route("**/api/*/summary", (route) =>
    route.fulfill({ json: null }),
  );
  await page.goto("/");
  await expect(
    page.getByRole("heading", { level: 1, name: "Home" }),
  ).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText("You're offline.").first()).toBeVisible();
  await noRawError(page);

  for (const path of SCREENS) {
    // Through Settings (it reads nothing) first, so what's checked next comes
    // from this screen, not the one before.
    await openClientSide(page, "/settings");
    await expect(
      page.getByRole("heading", { level: 1, name: "Settings" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Retry" })).toHaveCount(0);
    await openClientSide(page, path);
    const main = page.locator("main, .focus").first();
    await expect(
      main.getByText(/offline|once you're back online|once online/i).first(),
      path,
    ).toBeVisible();
    await expect(
      main.getByRole("button", { name: "Retry" }).first(),
      path,
    ).toBeVisible();
    await noRawError(page);
  }
  await context.setOffline(false);
});

test("server down: every screen shows its error, with Retry", async ({
  page,
}) => {
  await page.route("**/api/**", (route) =>
    route.fulfill({ status: 500, json: { error: "internal" } }),
  );
  for (const path of ["/", ...SCREENS]) {
    await page.goto(path);
    await expect(
      page.getByRole("button", { name: "Retry" }).first(),
      path,
    ).toBeVisible();
    await expect(page.getByText(/offline/i), path).toHaveCount(0);
    await noRawError(page);
  }
});
