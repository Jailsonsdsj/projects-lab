import { expect, test } from "@playwright/test";

// D-06: every component, every variant × state, at phone and tablet widths
// (and the two layout edges). The catalog count comes from the page itself.
test("/dev/ui shows every component section without horizontal scroll", async ({
  page,
}) => {
  await page.goto("/dev/ui");
  const root = page.locator(".ks");
  await expect(root).toBeVisible();
  const expected = Number(await root.getAttribute("data-sections"));
  expect(expected).toBeGreaterThan(20);

  const sections = page.locator(".ks-section");
  await expect(sections).toHaveCount(expected);
  for (const section of await sections.all()) {
    await section.scrollIntoViewIfNeeded();
    await expect(section).toBeVisible();
    await expect(section.locator(".ks-cell").first()).toBeVisible();
  }

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
