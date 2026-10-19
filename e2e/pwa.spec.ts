import { expect, type Page, test } from "./signed-in";

/** Waits until the service worker controls the page. In prompt mode the first
 *  worker doesn't claim the page that installed it; the next load is controlled. */
async function installed(page: Page) {
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
    )
    .toBe(true);
}

// Expected noise: while installing, the service worker itself fetches Home's
// /api/study/summary. WebKit's Playwright can't route a worker's requests, so
// they reach the preview server, which logs "http proxy error … ECONNREFUSED"
// (it has no API behind it). The card shows its error state; nothing fails.
test("the shell opens offline, on Home and on a deep link", async ({
  page,
  context,
}) => {
  await installed(page);
  await context.setOffline(true);

  await page.reload();
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.getByText("Your two labs")).toBeVisible();

  await page.goto("/study/grades");
  await expect(page.locator(".shell")).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-lab", "study");
});

test("the installed app links its manifest and Apple icon", async ({
  page,
}) => {
  await page.goto("/");
  const manifest = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  const response = await page.request.get(manifest ?? "");
  expect(await response.json()).toMatchObject({
    display: "standalone",
    orientation: "any",
  });
  const apple = await page
    .locator('link[rel="apple-touch-icon"]')
    .getAttribute("href");
  expect((await page.request.get(apple ?? "")).status()).toBe(200);
});
