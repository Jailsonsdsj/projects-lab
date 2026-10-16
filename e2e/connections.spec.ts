import { expect, test } from "./signed-in";

// Connections (F-16) in WebKit at every width, against a mocked API: the list,
// then Revoke through the danger dialog to the toast. Service workers are
// blocked so page.route sees every request.
test.use({ serviceWorkers: "block" });

const HOUR = 3600 * 1000;
const connection = (id: string, clientName: string, origin: string) => ({
  id,
  clientName,
  origin,
  grantedAt: new Date(Date.now() - 48 * HOUR).toISOString(),
  lastUsedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
});

test("lists connections and revokes one", async ({ page }) => {
  let revoked = false;
  await page.route("**/api/connections", (route) =>
    route.fulfill({
      json: {
        connections: [
          ...(revoked ? [] : [connection("g1", "Claude", "claude.ai")]),
          connection("g2", "Claude Code", "localhost"),
        ],
      },
    }),
  );
  await page.route("**/api/connections/g1", (route) => {
    revoked = true;
    return route.fulfill({ status: 204 });
  });

  await page.goto("/connections");
  await expect(page.getByRole("listitem")).toHaveCount(2);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  await page
    .getByRole("button", { name: "Revoke Claude", exact: true })
    .click();
  const dialog = page.getByRole("dialog", { name: "Revoke Claude?" });
  await dialog.getByRole("button", { name: "Revoke" }).click();
  await expect(page.getByText("Claude was revoked")).toBeVisible();
  await expect(page.getByRole("listitem")).toHaveCount(1);
});
