import type { JobDetail, JobSummary } from "@projects-lab/shared/career";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const summary = (over: Partial<JobSummary>): JobSummary => ({
  id: "acme",
  company: "Acme",
  role: "Senior Full-Stack Engineer",
  status: "evaluated",
  statusAt: "t",
  fit: { total: 75, decision: "apply" },
  readiness: { required: { ready: 5, total: 8 }, nice: { ready: 0, total: 0 } },
  nextUp: [],
  silent: false,
  updatedAt: "t",
  ...over,
});

const req = (
  id: string,
  text: string,
  readiness: "verified" | "declared" | "gap",
  study: JobDetail["requirements"][number]["study"] = null,
  type: "required" | "nice" = "required",
) => ({
  id,
  text,
  type,
  skillId: `sk-${id}`,
  skill: text,
  position: Number(id.slice(1)),
  readiness,
  study,
});

const JOB: JobDetail = {
  ...summary({}),
  seniority: "Senior",
  language: "en",
  workShape: "contract, remote",
  sourceUrl: null,
  posting: "Acme needs a senior full-stack engineer.",
  fit: {
    total: 75,
    decision: "apply",
    scores: { constraints: 20, skills: 20, growth: 15, pay: 10, signal: 10 },
  },
  fitNotes: "Ask about the on-call rota.",
  requirements: [
    req("r1", "PostgreSQL", "verified", {
      topicId: "DB-01",
      status: "done",
      grade: 85,
    }),
    req("r2", "TypeScript", "declared"),
    req("r3", "React and Next.js", "declared", {
      topicId: "FE-01",
      status: "in_progress",
      grade: null,
    }),
    req("r4", "Algorithms", "gap", {
      topicId: "CS-01",
      status: "not_started",
      grade: null,
    }),
    req("r5", "Kubernetes", "gap"),
    req("r6", "GraphQL", "gap", null, "nice"),
  ],
  notMapped: [
    {
      id: "r7",
      text: "5+ years",
      type: "not_mapped",
      skillId: null,
      skill: null,
      position: 7,
    },
  ],
  events: [{ status: "evaluated", at: "t", note: "" }],
  createdAt: "t",
};
const AREAS = [
  { prefix: "CS", name: "CS Fundamentals" },
  { prefix: "DO", name: "DevOps" },
];

function open(path: string) {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Jobs list", () => {
  it("lists tracked jobs in the API's order with status, fit and readiness", async () => {
    mockApi({
      "GET /api/career/jobs": () =>
        json({
          jobs: [
            summary({}),
            summary({
              id: "globex",
              company: "Globex",
              role: "Frontend Engineer",
              status: "applied",
              silent: true,
              fit: { total: 60, decision: "maybe" },
              readiness: {
                required: { ready: 1, total: 4 },
                nice: { ready: 0, total: 0 },
              },
            }),
          ],
        }),
    });
    const router = open("/career");
    const tracked = await screen.findByRole("region", { name: "Tracked" });
    const rows = within(tracked).getAllByRole("link");
    expect(rows).toHaveLength(2);
    for (const text of [
      "Senior Full-Stack Engineer",
      "Acme · Evaluated",
      "Apply",
      "5/8",
    ])
      expect(rows[0]).toHaveTextContent(text);
    for (const text of [
      "Frontend Engineer",
      "Globex · Applied · No answer in 3 weeks",
      "Maybe",
      "1/4",
    ])
      expect(rows[1]).toHaveTextContent(text);
    await userEvent.click(rows[1] as HTMLElement);
    expect(router.state.location.pathname).toBe("/career/jobs/globex");
  });

  it("says what to do with no jobs", async () => {
    mockApi({ "GET /api/career/jobs": () => json({ jobs: [] }) });
    open("/career");
    expect(await screen.findByText("No jobs tracked yet")).toBeInTheDocument();
  });
});

describe("Job screen", () => {
  const api = (over: Record<string, (init?: RequestInit) => Response> = {}) =>
    mockApi({
      "GET /api/career/jobs/acme": () => json({ job: JOB }),
      "GET /api/career/study-areas": () => json({ areas: AREAS }),
      ...over,
    });

  it("keeps the Jobs tab current and shows the meter from the required skills", async () => {
    api();
    open("/career/jobs/acme");
    expect(
      await screen.findByRole("heading", {
        level: 1,
        name: "Senior Full-Stack Engineer",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText("Acme · Evaluated")).toBeInTheDocument();
    expect(
      screen.getByRole("img", {
        name: "1 verified, 2 declared, 2 gaps out of 5 required skills",
      }),
    ).toBeInTheDocument();
    // The rail and the bottom tabs both render in jsdom: Jobs is current in each.
    for (const nav of screen.getAllByRole("navigation", { name: "Career Lab" }))
      expect(within(nav).getByRole("link", { name: /Jobs/ })).toHaveAttribute(
        "aria-current",
        "page",
      );
  });

  it("says where each requirement stands, gaps first, and offers Add only for a gap not in Study", async () => {
    api();
    open("/career/jobs/acme");
    const list = await screen.findByRole("region", { name: "Requirements" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows.map((r) => r.querySelector(".req__name")?.textContent)).toEqual(
      [
        "Algorithms",
        "Kubernetes",
        "TypeScript",
        "React and Next.js",
        "PostgreSQL",
      ],
    );
    expect(rows[0]).toHaveTextContent(
      "Already in your backlog as CS-01 Algorithms",
    );
    expect(rows[1]).toHaveTextContent("Not in your profile or backlog");
    expect(rows[2]).toHaveTextContent("In your profile · no exam yet");
    expect(rows[3]).toHaveTextContent("Studying now: FE-01 React and Next.js");
    expect(rows[4]).toHaveTextContent("Passed DB-01 PostgreSQL · 8.5");
    expect(
      rows.map(
        (r) =>
          within(r).queryByRole("button", { name: "Add to Study backlog" }) !==
          null,
      ),
    ).toEqual([false, true, false, false, false]);
    expect(
      screen.getByRole("region", { name: "Nice to have" }),
    ).toHaveTextContent("GraphQL");
    expect(
      screen.getByRole("region", { name: "Not mapped to a skill" }),
    ).toHaveTextContent("5+ years");
  });

  it("adds a gap to Study in the area chosen, then reads again", async () => {
    let reads = 0;
    let body: unknown = null;
    api({
      "GET /api/career/jobs/acme": () => {
        reads++;
        return json({ job: JOB });
      },
      "POST /api/career/jobs/acme/gaps": (init) => {
        body = JSON.parse(String(init?.body));
        return json({
          gaps: [
            {
              requirementId: "r5",
              skill: "Kubernetes",
              topicId: "DO-02",
              created: true,
            },
          ],
        });
      },
    });
    open("/career/jobs/acme");
    const kube = (await screen.findAllByRole("listitem")).find((r) =>
      r.textContent?.includes("Kubernetes"),
    ) as HTMLElement;
    await userEvent.click(
      within(kube).getByRole("button", { name: "Add to Study backlog" }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Add Kubernetes to Study",
    });
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Add to Study backlog" }),
    );
    expect(
      within(sheet).getByText("Choose where it goes."),
    ).toBeInTheDocument();
    expect(body).toBeNull();
    await userEvent.selectOptions(within(sheet).getByLabelText("Area"), "DO");
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Add to Study backlog" }),
    );
    expect(
      await screen.findByText("Added to Study backlog as DO-02 Kubernetes"),
    ).toBeInTheDocument();
    expect(body).toEqual({
      gaps: [{ requirementId: "r5", area: "DO", priority: 2 }],
    });
    await vi.waitFor(() => expect(reads).toBe(2));
  });

  it("changes the status with a note", async () => {
    let body: unknown = null;
    api({
      "PATCH /api/career/jobs/acme": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ job: JOB });
      },
    });
    open("/career/jobs/acme");
    await userEvent.click(
      await screen.findByRole("button", { name: "Options for this job" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Change status" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Change status" });
    await userEvent.selectOptions(
      within(sheet).getByLabelText("Status"),
      "applied",
    );
    await userEvent.type(within(sheet).getByLabelText(/Note/), "Sent via form");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(body).toEqual({ status: "applied", note: "Sent via form" });
  });

  it("stops tracking after confirming, back to Jobs", async () => {
    let removed = false;
    api({
      "DELETE /api/career/jobs/acme": () => {
        removed = true;
        return new Response(null, { status: 204 });
      },
      "GET /api/career/jobs": () => json({ jobs: [] }),
    });
    const router = open("/career/jobs/acme");
    await userEvent.click(
      await screen.findByRole("button", { name: "Options for this job" }),
    );
    await userEvent.click(
      screen.getByRole("menuitem", { name: "Stop tracking" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Stop tracking this job?",
    });
    expect(removed).toBe(false);
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Stop tracking" }),
    );
    await vi.waitFor(() =>
      expect(router.state.location.pathname).toBe("/career"),
    );
    expect(removed).toBe(true);
  });

  it("can't open a job that isn't there", async () => {
    api({
      "GET /api/career/jobs/acme": () =>
        json({ error: "not_found", message: "No job acme" }, { status: 404 }),
    });
    open("/career/jobs/acme");
    expect(
      await screen.findByText("Couldn't open this job"),
    ).toBeInTheDocument();
  });
});
