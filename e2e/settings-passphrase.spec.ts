import { expect, type Page, test } from "./signed-in";

// Settings' Change passphrase card in WebKit at every width: closed until its
// title is tapped, then the fields slide down (and back up), growing frame by
// frame rather than appearing at once; with reduced motion they don't slide.
test.use({ serviceWorkers: "block" });

/** The fields' height on every frame for a while after tapping the title. */
async function heights(page: Page): Promise<number[]> {
  const sampled = page.evaluate(
    () =>
      new Promise<number[]>((done) => {
        const fields = document.getElementById(
          "settings-passphrase-fields",
        ) as HTMLElement;
        const hs = [fields.getBoundingClientRect().height];
        const until = performance.now() + 600;
        const frame = () => {
          hs.push(fields.getBoundingClientRect().height);
          if (performance.now() < until) requestAnimationFrame(frame);
          else done(hs);
        };
        document.addEventListener("click", () => requestAnimationFrame(frame), {
          once: true,
          capture: true,
        });
      }),
  );
  await page.getByRole("button", { name: "Change passphrase" }).click();
  return sampled;
}

async function openSettings(page: Page) {
  await page.route("**/api/backup", (route) =>
    route.fulfill({ json: { lastExportedAt: null } }),
  );
  await page.goto("/settings");
  await expect(
    page.getByRole("button", { name: "Change passphrase" }),
  ).toHaveAttribute("aria-expanded", "false");
}

test("opens the passphrase fields with a slide, and closes them the same way", async ({
  page,
}) => {
  await openSettings(page);
  await expect(page.getByLabel("Current passphrase")).toBeHidden();

  const down = await heights(page);
  const [start, end] = [down[0] as number, down.at(-1) as number];
  expect(start).toBeLessThan(1);
  expect(end).toBeGreaterThan(200);
  // Growing, and through heights in between: a slide, not a jump.
  expect(down.slice(1).every((h, i) => h >= (down[i] as number))).toBe(true);
  expect(down.some((h) => h > start + 20 && h < end - 20)).toBe(true);
  await expect(page.getByLabel("Current passphrase")).toBeVisible();
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  const up = await heights(page);
  expect(up.slice(1).every((h, i) => h <= (up[i] as number))).toBe(true);
  expect(up.some((h) => h > 20 && h < end - 20)).toBe(true);
  expect(up.at(-1)).toBeLessThan(1);
  await expect(page.getByLabel("Current passphrase")).toBeHidden();
});

test("with reduced motion the fields open at once", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await openSettings(page);
  const down = await heights(page);
  // The first frame after the tap is already the last.
  expect(new Set(down.slice(1)).size).toBe(1);
  expect(down[1]).toBeGreaterThan(200);
});
