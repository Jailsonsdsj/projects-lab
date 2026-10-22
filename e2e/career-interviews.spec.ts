import { expect, test } from "./signed-in";

// The Interviews tab (CA-13) in WebKit at every width, against a mocked API:
// answers grouped by job with the intro first, a video answer in Drive's
// sandboxed player with its fallback message, a non-Drive link refused before
// anything is sent, the story bank and the practice log. Drive's player is
// answered locally so no request leaves the test. Service workers are blocked.
test.use({ serviceWorkers: "block" });

const DRIVE_ID = "1aBcD_eFgHiJ-kLmNoPqRsTuVwXyZ012";

test("answers, the Drive player, a refused link, stories and practice", async ({
  page,
}, testInfo) => {
  const posts: unknown[] = [];
  await page.route("https://drive.google.com/**", (route) =>
    route.fulfill({ contentType: "text/html", body: "<p>player</p>" }),
  );
  await page.route("**/api/career/answers", async (route) => {
    if (route.request().method() === "POST") {
      posts.push(route.request().postDataJSON());
      return route.fulfill({ json: { answer: {} } });
    }
    await route.fulfill({
      json: {
        answers: [
          {
            id: "a1",
            question: "Tell me about a hard deadline you met under pressure",
            answer: "At Acme…",
            video: {
              fileId: DRIVE_ID,
              previewUrl: `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
            },
            storyId: null,
            jobId: "acme",
            updatedAt: "t",
          },
        ],
      },
    });
  });
  await page.route("**/api/career/stories", (route) =>
    route.fulfill({
      json: {
        stories: [
          {
            id: "s1",
            title: "Faster evals",
            situation: "s",
            task: "t",
            action: "a",
            result: "r",
            experienceId: null,
            facts: [],
            skills: [],
            verified: false,
            updatedAt: "t",
          },
        ],
      },
    }),
  );
  await page.route("**/api/career/jobs", (route) =>
    route.fulfill({
      json: {
        jobs: [
          {
            id: "acme",
            company: "Acme",
            role: "AI Engineer",
            status: "applied",
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
  await page.route("**/api/career/jobs/acme/kit", (route) =>
    route.fulfill({
      json: {
        kit: {
          jobId: "acme",
          intro: "I build evals that ship.",
          salary: null,
          answers: [],
          selection: null,
        },
      },
    }),
  );
  await page.route("**/api/career/profile", (route) =>
    route.fulfill({
      json: {
        person: {
          fullName: "Sam",
          headline: "",
          location: "",
          city: "",
          region: "",
          country: "",
          timezone: "",
          email: "",
          phone: "",
          summary: "",
          languages: [],
          photo: null,
          updatedAt: "t",
        },
        links: [],
        experiences: [],
        education: [],
        facts: [],
        skills: [],
      },
    }),
  );
  await page.route("**/api/career/drills?limit=50", (route) =>
    route.fulfill({
      json: {
        drills: [
          {
            id: "d1",
            at: "2026-10-20T10:00:00.000Z",
            mode: "behavioral",
            topic: "Acme",
            weakest: ["No number in the result"],
            fix: "Quantify",
          },
        ],
      },
    }),
  );
  await page.goto("/career/interviews");

  const acme = page.getByRole("region", { name: "Acme · AI Engineer" });
  await expect(acme.getByText("Tell me about yourself")).toBeVisible();
  await acme.getByRole("button", { name: /hard deadline/ }).click();
  const sheet = page.getByRole("dialog", { name: "Answer" });
  const player = sheet.getByTitle(/Video:/);
  await expect(player).toHaveAttribute(
    "src",
    `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
  );
  await expect(
    sheet.getByText(/If it doesn't play, share it with your Google account/),
  ).toBeVisible();
  await sheet.getByLabel(/Drive video/).fill("https://youtu.be/dQw4w9WgXcQ");
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(sheet.getByText(/A Google Drive file link/)).toBeVisible();
  expect(posts).toEqual([]);
  await sheet.getByRole("button", { name: "Close" }).click();

  if (testInfo.project.name === "phone") {
    const tabs = page.getByRole("navigation", { name: "Career Lab" }).last();
    await expect(tabs.getByRole("link")).toHaveCount(5);
  }
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth);

  await page.getByRole("tab", { name: "Stories" }).click();
  await expect(
    page
      .getByRole("region", { name: "Story bank" })
      .getByText("Unverified", { exact: true })
      .locator("visible=true"),
  ).toHaveCount(1);
  await page.getByRole("tab", { name: "Practice" }).click();
  await expect(
    page.getByRole("region", { name: "Practice log" }),
  ).toContainText("Fix: Quantify");
});
