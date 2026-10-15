import { expect, type Page, test } from "@playwright/test";

const ROUTES = [
  "/",
  "/connections",
  "/settings",
  "/study",
  "/study/courses",
  "/study/grades",
  "/career",
  "/career/skills",
  "/career/profile",
  "/career/documents",
];

for (const path of ROUTES) {
  test(`no horizontal scroll at ${path}`, async ({ page }) => {
    await page.goto(path);
    await expect(page.locator(".shell")).toBeVisible();
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  });
}

/** The painted colour of the visible LabSwitcher's mark: the lab accent. */
async function accent(page: Page): Promise<string> {
  return page
    .locator(".labsw:visible .labsw__mark")
    .first()
    .evaluate((el) => getComputedStyle(el).backgroundColor);
}

test("switching lab repaints the accent without a page reload", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() => {
    (window as unknown as { __sameDocument: boolean }).__sameDocument = true;
  });
  const before = await accent(page);

  await page
    .getByRole("button", { name: "Home", exact: false })
    .first()
    .click();
  // Home also has a "Study Lab" card: pick the switcher's option.
  await page
    .getByRole("navigation", { name: "Labs" })
    .getByRole("link", { name: /Study Lab/ })
    .click();

  await expect(page).toHaveURL(/\/study$/);
  await expect(page.locator("html")).toHaveAttribute("data-lab", "study");
  // The accent crossfades over --duration-lab-switch; wait for the new colour.
  await expect.poll(() => accent(page)).not.toBe(before);
  expect(
    await page.evaluate(
      () => (window as unknown as { __sameDocument?: boolean }).__sameDocument,
    ),
  ).toBe(true);
});

test("only one navigation is visible", async ({ page }, testInfo) => {
  await page.goto("/study");
  const visible = page.getByRole("navigation", { name: "Study Lab" });
  await expect(visible).toHaveCount(1);
  const expected = testInfo.project.name === "phone" ? "btabs" : "rail";
  await expect(visible).toHaveClass(new RegExp(expected));
});

test("closed dialogs and popovers stay hidden", async ({ page }) => {
  await page.goto("/study");
  await expect(page.locator(".shell")).toBeVisible();
  const overlays = await page.locator("dialog, [popover]").all();
  expect(overlays.length).toBeGreaterThan(0); // phone: the switcher Sheet; tablet: its popover
  for (const overlay of overlays) {
    await expect(overlay).toBeHidden();
  }
});
