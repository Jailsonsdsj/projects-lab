import { expect, type Page, test } from "./signed-in";

// The Profile tab's copy panel (CA-09a) in WebKit at every width, against a
// mocked API: fields in order, Copy → Copied → Copy, the job picker working
// offline from loaded data, a failed photo falling back to initials, and no
// horizontal scroll. WebKit can't grant clipboard reads, so the page's
// clipboard is replaced by a recorder. Service workers are blocked so
// page.route sees every request.
test.use({ serviceWorkers: "block" });

const PROFILE = {
  person: {
    fullName: "Sam Rivera",
    headline: "AI engineer",
    location: "Recife, Pernambuco, Brazil",
    city: "Recife",
    region: "Pernambuco",
    country: "Brazil",
    timezone: "America/Recife",
    email: "sam.rivera@example.com",
    phone: "",
    summary: "",
    languages: [],
    photo: null as { type: string } | null,
    updatedAt: "2026-10-20T00:00:00.000Z",
  },
  links: [
    {
      id: "l1",
      kind: "linkedin",
      label: "LinkedIn URL",
      url: "https://www.linkedin.com/in/sam-rivera-with-a-long-handle-for-wrapping",
      position: 0,
    },
  ],
  experiences: [],
  education: [],
  facts: [],
  skills: [],
};
const job = (id: string, company: string, role: string) => ({
  id,
  company,
  role,
  status: "evaluated",
  statusAt: "t",
  fit: null,
  readiness: { required: { ready: 0, total: 0 }, nice: { ready: 0, total: 0 } },
  nextUp: [],
  silent: false,
  updatedAt: "t",
});
const kit = (
  jobId: string,
  answers: { question: string; answer: string }[],
) => ({
  jobId,
  intro: "",
  salary: null,
  answers,
  selection: null,
});

async function mockCareer(page: Page, profile = PROFILE) {
  await page.route("**/api/career/profile", (route) =>
    route.fulfill({ json: profile }),
  );
  await page.route("**/api/career/standard-answers", (route) =>
    route.fulfill({
      json: { answers: [{ label: "Notice period", value: "30 days" }] },
    }),
  );
  await page.route("**/api/career/jobs", (route) =>
    route.fulfill({
      json: {
        jobs: [
          job("acme", "Acme", "Senior Full-Stack Engineer"),
          job("globex", "Globex", "Frontend Platform Engineer"),
        ],
      },
    }),
  );
  await page.route("**/api/career/jobs/acme/kit", (route) =>
    route.fulfill({
      json: {
        kit: kit("acme", [
          {
            question: "Why this company?",
            answer:
              "Acme builds the scheduling tools my last two teams relied on, and its platform team is working on the problem I enjoy most.",
          },
        ]),
      },
    }),
  );
  await page.route("**/api/career/jobs/globex/kit", (route) =>
    route.fulfill({
      json: {
        kit: kit("globex", [
          { question: "Why Globex?", answer: "Your frontend platform." },
        ]),
      },
    }),
  );
}

/** The copied text, recorded in place of the real clipboard. */
async function recordClipboard(page: Page) {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, "clipboard", {
      value: {
        writeText: async (text: string) => {
          copied.push(text);
        },
      },
      configurable: true,
    });
  });
}
const copied = (page: Page) =>
  page.evaluate(() => (window as unknown as { __copied: string[] }).__copied);

test("copies each field, Copied holds then goes back", async ({ page }) => {
  await recordClipboard(page);
  await mockCareer(page);
  await page.goto("/career/profile");

  await expect(page.locator(".copy__label")).toHaveText([
    "Name",
    "Email",
    "City",
    "State/Province",
    "Country",
    "LinkedIn",
    "Notice period",
    "Why this company?",
  ]);
  await page.getByRole("button", { name: "Copy email" }).click();
  const done = page.getByRole("button", { name: "Copied email" });
  await expect(done).toHaveClass(/btn--copied/);
  expect(await copied(page)).toEqual(["sam.rivera@example.com"]);
  // --duration-copied-hold is 2 s; then Copy again.
  await expect(page.getByRole("button", { name: "Copy email" })).toBeVisible({
    timeout: 4000,
  });

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test("switches jobs and copies offline, from what's loaded", async ({
  page,
  context,
}) => {
  await recordClipboard(page);
  await mockCareer(page);
  await page.goto("/career/profile");
  await expect(page.getByText("Why this company?")).toBeVisible();

  await context.setOffline(true);
  await page.getByLabel("Answers for").selectOption("globex");
  await page.getByRole("button", { name: "Copy why globex?" }).click();
  await expect(
    page.getByRole("button", { name: "Copied why globex?" }),
  ).toBeVisible();
  expect(await copied(page)).toEqual(["Your frontend platform."]);
  await page.getByLabel("Answers for").selectOption("acme");
  await expect(page.getByText("Why this company?")).toBeVisible();
  await context.setOffline(false);
});

test("a photo that fails to load shows the initials", async ({ page }) => {
  await mockCareer(page, {
    ...PROFILE,
    person: { ...PROFILE.person, photo: { type: "image/png" } },
  });
  await page.route("**/api/career/photo", (route) =>
    route.fulfill({ status: 404, json: { error: "not_found" } }),
  );
  await page.goto("/career/profile");
  const tile = page.getByRole("img", { name: "Sam Rivera" });
  await expect(tile).toHaveText("SR");
  await expect(tile).toHaveClass(/is-failed/);
});

// CA-09b: the records under the panel, edited through sheets against a mocked
// API that keeps what's written, so a save shows in the list it came from.
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

async function statefulCareer(page: Page) {
  const profile = structuredClone({
    ...PROFILE,
    experiences: [
      {
        id: "x1",
        organization: "Acme",
        title: "Engineer",
        kind: "contract",
        start: "2023-04",
        end: null,
        location: "Remote",
        summary: "",
        position: 0,
        facts: [
          {
            id: "f1",
            text: "Built the eval harness",
            verified: true,
            position: 0,
            skills: [{ id: "s1", name: "LLM evaluation" }],
          },
          {
            id: "f2",
            text: "Cut eval runtime by 40%",
            verified: false,
            position: 1,
            skills: [],
          },
        ],
      },
    ],
  });
  const keys: string[] = [];
  await mockCareer(page);
  await page.route("**/api/career/profile", (route) =>
    route.fulfill({ json: profile }),
  );
  await page.route("**/api/career/facts", async (route) => {
    keys.push(route.request().headers()["idempotency-key"] ?? "");
    const body = route.request().postDataJSON() as {
      id: string;
      verified: boolean;
      text: string;
    };
    const fact = profile.experiences[0]?.facts.find((f) => f.id === body.id);
    if (fact) Object.assign(fact, { verified: body.verified, text: body.text });
    await route.fulfill({ json: { fact } });
  });
  await page.route("**/api/career/photo**", async (route) => {
    const method = route.request().method();
    if (method === "PUT") {
      keys.push(route.request().headers()["idempotency-key"] ?? "");
      profile.person.photo = { type: "image/png" };
      profile.person.updatedAt = new Date().toISOString();
      return route.fulfill({ json: { photo: { type: "image/png" } } });
    }
    if (method === "DELETE") {
      profile.person.photo = null;
      profile.person.updatedAt = new Date().toISOString();
      return route.fulfill({ status: 204 });
    }
    return profile.person.photo
      ? route.fulfill({ body: PNG_1PX, contentType: "image/png" })
      : route.fulfill({ status: 404, json: { error: "not_found" } });
  });
  return { profile, keys };
}

test("lists the records, and the owner verifies a fact in its sheet", async ({
  page,
}) => {
  const { keys } = await statefulCareer(page);
  await page.goto("/career/profile");
  const acme = page.getByRole("region", { name: "Engineer · Acme" });
  await expect(acme.locator(".row__title")).toHaveText([
    "Engineer · Acme",
    "Built the eval harness",
    "Cut eval runtime by 40%",
    "Add a fact",
  ]);
  const claim = acme.getByRole("button", { name: /Cut eval runtime/ });
  await expect(
    claim.getByText("Unverified").locator("visible=true"),
  ).toHaveCount(1);

  await claim.click();
  const sheet = page.getByRole("dialog", { name: "Fact" });
  await sheet.getByRole("checkbox", { name: /Verified/ }).check();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByText("Saved", { exact: true }).locator("visible=true"),
  ).toHaveCount(1);
  await expect(acme.getByText("Unverified")).toHaveCount(0);
  expect(keys).toHaveLength(1);
  expect(keys[0]).toMatch(/^[0-9a-f-]{36}$/);

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});

test("adds a photo, then removes it", async ({ page }) => {
  await statefulCareer(page);
  await page.goto("/career/profile");
  await expect(page.getByRole("img", { name: "Sam Rivera" })).toHaveText("SR");

  await page.getByLabel("Photo file").setInputFiles({
    name: "me.png",
    mimeType: "image/png",
    buffer: PNG_1PX,
  });
  await expect(page.getByText("Photo updated")).toBeVisible();
  await expect(page.locator(".tile__photo")).toBeVisible();

  await page.getByRole("button", { name: "Remove photo" }).click();
  const confirm = page.getByRole("dialog", { name: "Remove your photo?" });
  await confirm.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText("Photo removed")).toBeVisible();
  await expect(page.getByRole("img", { name: "Sam Rivera" })).toHaveText("SR");
});
