import { expect, test } from "./signed-in";

// The Guide tab (docs/user-guide.md in the app) in WebKit at every width:
// reached from the platform's navigation, every part without horizontal scroll
// (it has wide tables), and a link into another part landing on its heading.
test.use({ serviceWorkers: "block" });

test("opens from the navigation; every part fits; links cross parts", async ({
  page,
}) => {
  await page.route("**/api/*/summary", (route) =>
    route.fulfill({ json: null }),
  );
  await page.goto("/settings");
  await page
    .getByRole("link", { name: "Guide" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/guide$/);
  await expect(
    page.getByRole("heading", { level: 1, name: "Guide" }),
  ).toBeVisible();

  const tabs = page.getByRole("tablist", { name: "Guide parts" });
  for (const name of ["The app", "Claude", "Develop", "Help"]) {
    await tabs.getByRole("tab", { name }).click();
    await expect(tabs.getByRole("tab", { name })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    const { scrollWidth, innerWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    expect(scrollWidth, name).toBeLessThanOrEqual(innerWidth);
  }

  await tabs.getByRole("tab", { name: "The app" }).click();
  await page.getByRole("link", { name: "Backup and restore" }).click();
  await expect(page).toHaveURL(/\/guide\?view=help#backup-and-restore$/);
  await expect(
    page.getByRole("heading", { level: 2, name: "Backup and restore" }),
  ).toBeInViewport();
});
