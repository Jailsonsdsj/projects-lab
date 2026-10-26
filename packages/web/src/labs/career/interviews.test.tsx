import type {
  Answer,
  JobKit,
  JobSummary,
  ProfileResponse,
  Story,
} from "@projects-lab/shared/career";
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const DRIVE_ID = "1aBcD_eFgHiJ-kLmNoPqRsTuVwXyZ012";
const JOB: JobSummary = {
  id: "acme",
  company: "Acme",
  role: "AI Engineer",
  status: "applied",
  statusAt: "t",
  fit: null,
  readiness: { required: { ready: 0, total: 0 }, nice: { ready: 0, total: 0 } },
  nextUp: [],
  silent: false,
  updatedAt: "t",
};
const KIT: JobKit = {
  jobId: "acme",
  intro: "I build evals that ship.",
  salary: null,
  answers: [],
  selection: null,
  ats: null,
};
const answer = (id: string, over: Partial<Answer> = {}): Answer => ({
  id,
  question: `Question ${id}`,
  answer: `Answer ${id}`,
  video: null,
  storyId: null,
  jobId: null,
  updatedAt: "t",
  ...over,
});
const STORIES: Story[] = [
  {
    id: "s1",
    title: "Faster evals",
    situation: "s",
    task: "t",
    action: "a",
    result: "Runtime cut",
    experienceId: null,
    facts: [{ id: "f1", text: "Shipped the harness", verified: true }],
    skills: [{ id: "k1", name: "LLM evaluation" }],
    verified: true,
    updatedAt: "t",
  },
  {
    id: "s2",
    title: "Rate talk",
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
];
const PROFILE: ProfileResponse = {
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
  facts: [
    {
      id: "f1",
      text: "Shipped the harness",
      verified: true,
      position: 0,
      skills: [],
    },
    {
      id: "f2",
      text: "Cut runtime by 40%",
      verified: false,
      position: 1,
      skills: [],
    },
  ],
  skills: [],
};

function api(over: Record<string, (init?: RequestInit) => Response> = {}) {
  return mockApi({
    "GET /api/career/answers": () =>
      json({
        answers: [
          answer("a1", {
            jobId: "acme",
            video: {
              fileId: DRIVE_ID,
              previewUrl: `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
            },
          }),
          answer("a2"),
        ],
      }),
    "GET /api/career/stories": () => json({ stories: STORIES }),
    "GET /api/career/jobs": () => json({ jobs: [JOB] }),
    "GET /api/career/jobs/acme/kit": () => json({ kit: KIT }),
    "GET /api/career/profile": () => json(PROFILE),
    "GET /api/career/drills?limit=50": () =>
      json({
        drills: [
          {
            id: "d1",
            at: "2026-10-20T10:00:00.000Z",
            mode: "negotiation",
            topic: "Acme",
            weakest: ["Conceded the floor"],
            fix: "Hold the range",
          },
        ],
      }),
    ...over,
  });
}
function open(path = "/career/interviews") {
  const router = createMemoryRouter(createRoutes(), { initialEntries: [path] });
  render(<RouterProvider router={router} />);
  return router;
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Interviews · answers", () => {
  it("groups answers by job (its intro first), then general", async () => {
    api();
    open();
    const acme = await screen.findByRole("region", {
      name: "Acme · AI Engineer",
    });
    const rows = within(acme).getAllByRole("button");
    expect(
      within(acme).getByText("Tell me about yourself"),
    ).toBeInTheDocument();
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Question a1"),
      "Add an answer for Acme",
    ]);
    expect(within(acme).getAllByText("Video").length).toBeGreaterThan(0);
    expect(screen.getByRole("region", { name: "General" })).toHaveTextContent(
      "Question a2",
    );
  });

  it("plays an answer's video in Drive's sandboxed player, with the way out on screen", async () => {
    api();
    open();
    await userEvent.click(
      await screen.findByRole("button", { name: /Question a1/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Answer" });
    const player = within(sheet).getByTitle("Video: Question a1");
    expect(player).toHaveAttribute(
      "src",
      `https://drive.google.com/file/d/${DRIVE_ID}/preview`,
    );
    expect(player).toHaveAttribute(
      "sandbox",
      "allow-scripts allow-same-origin allow-presentation",
    );
    expect(
      within(sheet).getByText(
        /If it doesn't play, share it with your Google account/,
      ),
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText(/Drive video/)).toHaveValue(
      `https://drive.google.com/file/d/${DRIVE_ID}/view`,
    );
  });

  it("refuses a link that isn't a Drive file, then saves a Drive one", async () => {
    let body: unknown = null;
    api({
      "POST /api/career/answers": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ answer: answer("a3") });
      },
    });
    open();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add an answer" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Add an answer" });
    await userEvent.type(
      within(sheet).getByLabelText("Question"),
      "Why evals?",
    );
    await userEvent.type(
      within(sheet).getByLabelText("Your answer"),
      "Because…",
    );
    await userEvent.type(
      within(sheet).getByLabelText(/Drive video/),
      "https://youtu.be/dQw4w9WgXcQ",
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(
      within(sheet).getByText(/A Google Drive file link/),
    ).toBeInTheDocument();
    expect(body).toBeNull();

    await userEvent.clear(within(sheet).getByLabelText(/Drive video/));
    await userEvent.type(
      within(sheet).getByLabelText(/Drive video/),
      `https://drive.google.com/open?id=${DRIVE_ID}`,
    );
    await userEvent.selectOptions(within(sheet).getByLabelText("For"), "acme");
    await userEvent.selectOptions(
      within(sheet).getByLabelText("Story it uses"),
      "s1",
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(body).toEqual({
      question: "Why evals?",
      answer: "Because…",
      driveLink: `https://drive.google.com/open?id=${DRIVE_ID}`,
      jobId: "acme",
      storyId: "s1",
    });
  });

  it("removes a video by emptying its link", async () => {
    let body: { driveLink?: unknown } | null = null;
    api({
      "POST /api/career/answers": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ answer: answer("a1") });
      },
    });
    open();
    await userEvent.click(
      await screen.findByRole("button", { name: /Question a1/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Answer" });
    await userEvent.clear(within(sheet).getByLabelText(/Drive video/));
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(body).toMatchObject({ id: "a1", driveLink: null, jobId: "acme" });
  });
});

describe("Interviews · stories and practice", () => {
  it("marks stories verified or not, and saves the facts a story rests on", async () => {
    let body: unknown = null;
    api({
      "POST /api/career/stories": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ story: STORIES[1] });
      },
    });
    open("/career/interviews?view=stories");
    const bank = await screen.findByRole("region", { name: "Story bank" });
    const rows = within(bank).getAllByRole("button");
    expect(
      within(rows[0] as HTMLElement).getAllByText("Verified").length,
    ).toBeGreaterThan(0);
    expect(
      within(rows[1] as HTMLElement).getAllByText("Unverified").length,
    ).toBeGreaterThan(0);

    await userEvent.click(rows[1] as HTMLElement);
    const sheet = await screen.findByRole("dialog", { name: "Story" });
    await userEvent.click(
      within(sheet).getByRole("checkbox", {
        name: "Cut runtime by 40% (unverified)",
      }),
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(body).toMatchObject({
      id: "s2",
      title: "Rate talk",
      factIds: ["f2"],
    });
  });

  it("lists practice sessions with what to fix", async () => {
    api();
    const router = open("/career/interviews");
    await screen.findByRole("region", { name: "General" });
    await userEvent.click(screen.getByRole("tab", { name: "Practice" }));
    expect(router.state.location.search).toBe("?view=practice");
    const log = await screen.findByRole("region", { name: "Practice log" });
    expect(log).toHaveTextContent("Negotiation · Acme");
    expect(log).toHaveTextContent(
      "2026-10-20 · Weakest: Conceded the floor · Fix: Hold the range",
    );
  });
});
