// Every screen sits behind the session gate (F-10a). The preview server has no
// API, so tests start with a token the app accepts: it reads `exp`, and only
// the Worker verifies signatures. Same shape as packages/web/test/session.ts.
import { test as base } from "@playwright/test";

export { expect, type Page } from "@playwright/test";

const base64url = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

function fakeToken(): string {
  const now = Math.floor(Date.now() / 1000);
  const day = 24 * 60 * 60;
  return [
    base64url({ alg: "HS256", typ: "JWT" }),
    base64url({ sub: "owner", iat: now, exp: now + day, sv: 0 }),
    "signature",
  ].join(".");
}

export const test = base.extend({
  page: async ({ page }, use) => {
    await page.addInitScript((token) => {
      if (!localStorage.getItem("pl_session"))
        localStorage.setItem("pl_session", token);
    }, fakeToken());
    await use(page);
  },
});
