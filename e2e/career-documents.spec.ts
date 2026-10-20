import { expect, test } from "./signed-in";

// The Documents tab (CA-12) in WebKit at every width, against a mocked API
// that keeps what's written: the kit and the last document's items, a prompt
// copied for Claude, the kit edited in its sheet. WebKit can't grant clipboard
// reads, so the page's clipboard is a recorder. Service workers are blocked.
test.use({ serviceWorkers: "block" });

test("shows a job's kit, copies the prompt, and edits the kit", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const copied: string[] = [];
    Object.assign(window, { __copied: copied });
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: async (text: string) => void copied.push(text) },
      configurable: true,
    });
  });
  const kit = {
    jobId: "acme",
    intro: "I build evals that ship.",
    salary: null as null | Record<string, unknown>,
    answers: [{ question: "Why us?", answer: "Your eval problem." }],
    selection: {
      variant: "ai",
      items: [{ kind: "fact", id: "f1", label: "Built the eval harness" }],
    },
  };
  await page.route("**/api/career/jobs", (route) =>
    route.fulfill({
      json: {
        jobs: [
          {
            id: "acme",
            company: "Acme",
            role: "Senior Full-Stack Engineer with a long title",
            status: "evaluated",
            statusAt: "t",
            fit: null,
            readiness: {
              required: { ready: 0, total: 0 },
              nice: { ready: 0, total: 0 },
            },
            nextUp: [],
            silent: false,
            updatedAt: "t",
          },
        ],
      },
    }),
  );
  await page.route("**/api/career/jobs/acme/kit", async (route) => {
    if (route.request().method() === "PUT") {
      const body = route.request().postDataJSON() as typeof kit;
      Object.assign(kit, {
        salary: body.salary,
        intro: body.intro,
        answers: body.answers,
      });
    }
    await route.fulfill({ json: { kit } });
  });
  await page.goto("/career/documents");

  await expect(
    page.getByRole("region", { name: "Last document used · ai" }),
  ).toContainText("Built the eval harness");
  await page.getByRole("button", { name: "Copy resume prompt" }).click();
  await expect(
    page.getByRole("button", { name: "Copied resume prompt" }),
  ).toBeVisible();
  const copied = await page.evaluate(
    () => (window as unknown as { __copied: string[] }).__copied,
  );
  expect(copied[0]).toContain(
    "career_document_brief with jobId acme and kind resume",
  );

  await page.getByRole("button", { name: "Edit kit" }).click();
  const sheet = page.getByRole("dialog", { name: "Kit for Acme" });
  await sheet.getByLabel(/Minimum/).fill("40");
  await sheet.getByLabel(/Maximum/).fill("60");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet).toBeHidden();
  await expect(
    page.getByRole("region", { name: "Application kit" }),
  ).toContainText("USD 40–60 / hour");

  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);
});
