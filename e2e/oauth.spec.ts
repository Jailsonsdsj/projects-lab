import { randomBytes } from "node:crypto";
import { expect, type Page, test } from "@playwright/test";

// Claude's sign-in (F-14b) in WebKit at every width. The preview server has no
// Worker, so this test plays its part: it serves the built page with the
// consent details injected (as GET /oauth/authorize does) and answers the
// sign-in and decision. Service workers are blocked so page.route sees all.
test.use({ serviceWorkers: "block" });

const CALLBACK = "https://claude.example/api/mcp/auth_callback";
const PAGE = {
  handle: "handle-1",
  clientName: "Claude",
  clientDomain: "claude.ai",
  redirectHost: "claude.example",
  redirectIsLoopback: false,
};

async function playTheWorker(page: Page) {
  const decisions: string[] = [];
  await page.route("**/oauth/authorize?*", async (route) => {
    const shell = await route.fetch({
      url: new URL("/", route.request().url()).href,
    });
    const html = (await shell.text()).replace(
      "</head>",
      `<script type="application/json" id="oauth-consent">${JSON.stringify(PAGE)}</script></head>`,
    );
    await route.fulfill({ status: 200, contentType: "text/html", body: html });
  });
  await page.route("**/api/auth/salt", (route) =>
    route.fulfill({
      json: { salt: randomBytes(16).toString("base64"), iterations: 1000 },
    }),
  );
  await page.route("**/oauth/authorize", async (route) => {
    const { decision } = route.request().postDataJSON() as { decision: string };
    decisions.push(decision);
    if (decision === "verify") return route.fulfill({ status: 204 });
    const redirectTo =
      decision === "allow"
        ? `${CALLBACK}?code=abc&state=s1`
        : `${CALLBACK}?error=access_denied&state=s1`;
    return route.fulfill({ json: { redirectTo } });
  });
  await page.route(`${CALLBACK}*`, (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>Back in Claude</p>" }),
  );
  return decisions;
}

async function signIn(page: Page) {
  await page.goto("/oauth/authorize?client_id=c1&state=s1");
  await page
    .getByLabel("Passphrase", { exact: true })
    .fill("the owner's passphrase");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Claude wants to read and write your Projects Lab",
    }),
  ).toBeVisible();
}

test("Allow sends the browser back to Claude with a code", async ({ page }) => {
  const decisions = await playTheWorker(page);
  await signIn(page);
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
  await page.getByRole("button", { name: "Allow" }).click();
  await expect(page).toHaveURL(`${CALLBACK}?code=abc&state=s1`);
  expect(decisions).toEqual(["verify", "allow"]);
});

test("Cancel sends it back with access_denied", async ({ page }) => {
  await playTheWorker(page);
  await signIn(page);
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page).toHaveURL(/error=access_denied/);
});
