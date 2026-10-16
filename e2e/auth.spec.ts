import { randomBytes } from "node:crypto";
import { expect, test } from "@playwright/test";

// Sign in → Home → Settings → Log out, against a mocked API (the preview
// server has none). Service workers are blocked so page.route sees every
// request; the API cache is created by hand to prove Log out deletes it.
test.use({ serviceWorkers: "block" });

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");
const now = Math.floor(Date.now() / 1000);
const token = [
  base64url({ alg: "HS256", typ: "JWT" }),
  base64url({ sub: "owner", iat: now, exp: now + 3600, sv: 0 }),
  "signature",
].join(".");

test("sign in, then log out: back on /login, and a reload stays there", async ({
  page,
}) => {
  const loggedOut: string[] = [];
  await page.route("**/api/auth/salt", (route) =>
    route.fulfill({
      json: { salt: randomBytes(16).toString("base64"), iterations: 1000 },
    }),
  );
  await page.route("**/api/auth/login", (route) =>
    route.fulfill({ json: { token } }),
  );
  await page.route("**/api/auth/logout", (route) => {
    loggedOut.push(route.request().headers().authorization ?? "");
    return route.fulfill({ status: 204 });
  });

  await page.goto("/");
  await expect(page).toHaveURL(/\/login$/);
  await page
    .getByLabel("Passphrase", { exact: true })
    .fill("correct horse battery");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("Your two labs")).toBeVisible();

  await page.evaluate(() => caches.open("api"));
  await page
    .getByRole("link", { name: "Settings" })
    .filter({ visible: true })
    .first()
    .click();
  await expect(page).toHaveURL(/\/settings$/);
  await page.getByRole("button", { name: "Log out" }).click();
  await page
    .getByRole("dialog", { name: "Log out of Projects Lab?" })
    .getByRole("button", { name: "Log out" })
    .click();

  await expect(page).toHaveURL(/\/login$/);
  expect(loggedOut).toEqual([`Bearer ${token}`]);
  expect(await page.evaluate(() => caches.has("api"))).toBe(false);
  expect(
    await page.evaluate(() => localStorage.getItem("pl_session")),
  ).toBeNull();

  await page.reload();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(page.getByRole("alert")).toHaveCount(0); // not "expired"
});
