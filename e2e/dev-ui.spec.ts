import { expect, test } from "./signed-in";

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

// The bundle's element reset (.pl button { color: inherit }) once outranked
// every component's own colour and font: solid buttons drew ink on the accent.
// jsdom has no real cascade, so this is checked here, against computed styles.
test("buttons draw their own colours and weight, not the reset's", async ({
  page,
}) => {
  await page.goto("/dev/ui");
  await expect(page.locator(".ks")).toBeVisible();
  const styles = await page.evaluate(() => {
    const probe = (css: string) => {
      const el = document.createElement("span");
      el.setAttribute("style", css);
      document.querySelector(".ks")?.append(el);
      const cs = getComputedStyle(el);
      const out = { color: cs.color, weight: cs.fontWeight };
      el.remove();
      return out;
    };
    const first = (selector: string) => {
      const el = document.querySelector(selector);
      if (!el) throw new Error(`no ${selector} on /dev/ui`);
      const cs = getComputedStyle(el);
      return { color: cs.color, weight: cs.fontWeight };
    };
    return {
      solid: first(
        ".btn:not(.btn--soft):not(.btn--outline):not(.btn--ghost):not(.btn--neutral):not(.btn--danger):not(:disabled)",
      ),
      ghost: first(
        ".btn.btn--ghost:not(.btn--neutral):not(.btn--danger):not(:disabled)",
      ),
      onAccent: probe("color: var(--color-lab-on-accent)").color,
      accent: probe("color: var(--color-lab-accent)").color,
      medium: probe("font-weight: var(--font-weight-medium)").weight,
    };
  });
  expect(styles.solid.color).toBe(styles.onAccent);
  expect(styles.solid.weight).toBe(styles.medium);
  expect(styles.ghost.color).toBe(styles.accent);
});
