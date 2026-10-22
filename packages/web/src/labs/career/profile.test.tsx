import type {
  JobKit,
  JobSummary,
  ProfileResponse,
} from "@projects-lab/shared/career";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const PROFILE: ProfileResponse = {
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
    languages: [{ name: "English", level: "C1" }],
    photo: null,
    updatedAt: "2026-10-20T00:00:00.000Z",
  },
  links: [
    {
      id: "l1",
      kind: "linkedin",
      label: "LinkedIn URL",
      url: "https://www.linkedin.com/in/sam-rivera",
      position: 0,
    },
  ],
  experiences: [],
  education: [],
  facts: [],
  skills: [],
};

/** Saved out of order and with their own labels: the copy section orders and
 *  names them the way forms ask. */
const ORDERED_LINKS: ProfileResponse["links"] = [
  {
    id: "l4",
    kind: "other",
    label: "Conference talk",
    url: "https://talks.example/sam",
    position: 0,
  },
  {
    id: "l3",
    kind: "portfolio",
    label: "My site",
    url: "https://sam.example",
    position: 1,
  },
  {
    id: "l1",
    kind: "linkedin",
    label: "LinkedIn URL",
    url: "https://www.linkedin.com/in/sam-rivera",
    position: 2,
  },
  {
    id: "l2",
    kind: "github",
    label: "Code",
    url: "https://github.com/sam-rivera",
    position: 3,
  },
];

const job = (id: string, company: string, role: string): JobSummary => ({
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
const JOBS = [
  job("acme", "Acme", "Senior Full-Stack Engineer"),
  job("globex", "Globex", "Frontend Platform Engineer"),
];
const kit = (jobId: string, over: Partial<JobKit> = {}): JobKit => ({
  jobId,
  intro: "",
  salary: null,
  answers: [],
  selection: null,
  ...over,
});
const KITS = {
  acme: kit("acme", {
    intro: "I build evals that ship.",
    salary: { min: 40, max: 60, currency: "USD", period: "hour" },
    answers: [
      { question: "Why this company?", answer: "Acme builds the tools…" },
    ],
  }),
  globex: kit("globex"),
};

function api(over: Record<string, (init?: RequestInit) => Response> = {}) {
  return mockApi({
    "GET /api/career/profile": () => json(PROFILE),
    "GET /api/career/standard-answers": () =>
      json({ answers: [{ label: "Notice period", value: "30 days" }] }),
    "GET /api/career/jobs": () => json({ jobs: JOBS }),
    "GET /api/career/jobs/acme/kit": () => json({ kit: KITS.acme }),
    "GET /api/career/jobs/globex/kit": () => json({ kit: KITS.globex }),
    ...over,
  });
}

function openProfile() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/career/profile"],
  });
  render(<RouterProvider router={router} />);
}

const labels = () =>
  [...document.querySelectorAll(".copy__label")].map((el) => el.textContent);

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Profile copy panel", () => {
  it("lists the standard fields in order, empty ones left out, then the job's answers", async () => {
    api({
      "GET /api/career/profile": () =>
        json({ ...PROFILE, links: ORDERED_LINKS }),
    });
    openProfile();
    await screen.findByRole("button", { name: "Copy name" });
    expect(
      screen.getByRole("heading", { level: 1, name: "Profile" }),
    ).toBeVisible();
    expect(labels()).toEqual([
      "Name",
      "Email",
      "City",
      "State/Province",
      "Country",
      "LinkedIn",
      "GitHub",
      "Website",
      "Conference talk",
      "Notice period",
      "Tell me about yourself",
      "Salary range",
      "Why this company?",
    ]);
    expect(screen.getByText("USD 40–60 / hour")).toBeInTheDocument();
    expect(document.querySelector(".copy__value.mono")).toHaveTextContent(
      "https://www.linkedin.com/in/sam-rivera",
    );
    expect(
      screen.getByRole("button", { name: "Copy state/province" }),
    ).toBeInTheDocument();
    // No photo: initials.
    expect(screen.getByRole("img", { name: "Sam Rivera" })).toHaveTextContent(
      "SR",
    );
  });

  it("switches jobs without asking the network again", async () => {
    const fetch = api();
    openProfile();
    const picker = await screen.findByLabelText("Answers for");
    const before = fetch.mock.calls.length;
    await userEvent.selectOptions(picker, "globex");
    expect(screen.queryByText("Why this company?")).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "No answers for this job yet: ask Claude to prepare them.",
      ),
    ).toBeInTheDocument();
    await userEvent.selectOptions(picker, "acme");
    expect(screen.getByText("Why this company?")).toBeInTheDocument();
    expect(fetch.mock.calls.length).toBe(before);
  });

  it("copies a value, and shows a toast when the clipboard refuses", async () => {
    api();
    openProfile();
    const button = await screen.findByRole("button", { name: "Copy email" });
    await act(async () => fireEvent.click(button));
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith(
      "sam.rivera@example.com",
    );
    expect(
      screen.getByRole("button", { name: "Copied email" }),
    ).toBeInTheDocument();

    vi.mocked(navigator.clipboard.writeText).mockRejectedValue(
      new Error("denied"),
    );
    await act(async () =>
      fireEvent.click(screen.getByRole("button", { name: "Copy name" })),
    );
    expect(
      await screen.findByText("Couldn't copy: select the text instead."),
    ).toBeInTheDocument();
  });

  it("loads the photo through the session cookie when there is one", async () => {
    api({
      "GET /api/career/profile": () =>
        json({
          ...PROFILE,
          person: { ...PROFILE.person, photo: { type: "image/png" } },
        }),
    });
    openProfile();
    const img = await screen.findByRole("img", { name: "Sam Rivera" });
    // The person's updatedAt busts the cache after an upload.
    expect(img).toHaveAttribute(
      "src",
      `/api/career/photo?v=${encodeURIComponent("2026-10-20T00:00:00.000Z")}`,
    );
  });

  it("hides the job picker with no jobs", async () => {
    api({ "GET /api/career/jobs": () => json({ jobs: [] }) });
    openProfile();
    await screen.findByRole("button", { name: "Copy name" });
    expect(screen.queryByLabelText("Answers for")).not.toBeInTheDocument();
  });

  it("says the profile is empty, and tells a failed read apart", async () => {
    api({
      "GET /api/career/profile": () =>
        json({
          ...PROFILE,
          person: { ...PROFILE.person, updatedAt: null },
          links: [],
        }),
      "GET /api/career/standard-answers": () => json({ answers: [] }),
    });
    openProfile();
    expect(
      await screen.findByText("Your profile is empty"),
    ).toBeInTheDocument();
  });

  it("shows an error with Retry when the read fails", async () => {
    api({
      "GET /api/career/profile": () => new Response(null, { status: 500 }),
    });
    openProfile();
    const main = await screen.findByRole("button", { name: "Retry" });
    expect(
      within(main.closest(".empty") as HTMLElement).getByRole("button"),
    ).toBe(main);
    expect(screen.queryByText("Your profile is empty")).not.toBeInTheDocument();
  });
});

const FULL: ProfileResponse = {
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
  education: [
    {
      id: "e1",
      institution: "UFPE",
      degree: "BSc",
      field: "CS",
      start: "2015",
      end: "2019",
      notes: "",
      position: 0,
      facts: [],
    },
  ],
};

describe("Profile records", () => {
  it("lists experiences with their facts, unverified ones badged", async () => {
    api({ "GET /api/career/profile": () => json(FULL) });
    openProfile();
    const acme = await screen.findByRole("region", { name: "Engineer · Acme" });
    const rows = within(acme).getAllByRole("button");
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("2023-04 – now · Remote"),
      expect.stringContaining("Built the eval harness"),
      expect.stringContaining("Cut eval runtime by 40%"),
      "Add a fact",
    ]);
    expect(
      within(rows[2] as HTMLElement).getByText("Unverified"),
    ).toBeInTheDocument();
    expect(
      within(rows[1] as HTMLElement).queryByText("Unverified"),
    ).not.toBeInTheDocument();
    expect(
      within(screen.getByRole("region", { name: "BSc · UFPE" })).getByText(
        "2015 – 2019 · CS",
      ),
    ).toBeInTheDocument();
  });

  it("verifies a fact in its sheet, with an Idempotency-Key, then reads again", async () => {
    let reads = 0;
    let sent: { headers: Headers; body: unknown } | null = null;
    api({
      "GET /api/career/profile": () => {
        reads++;
        return json(FULL);
      },
      "POST /api/career/facts": (init) => {
        sent = {
          headers: new Headers(init?.headers),
          body: JSON.parse(String(init?.body)),
        };
        return json({ fact: {} });
      },
    });
    openProfile();
    await userEvent.click(
      await screen.findByRole("button", { name: /Cut eval runtime/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Fact" });
    await userEvent.click(
      within(sheet).getByRole("checkbox", { name: /Verified/ }),
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Saved")).toBeInTheDocument();
    expect(sent).toMatchObject({
      body: {
        id: "f2",
        experienceId: "x1",
        text: "Cut eval runtime by 40%",
        verified: true,
      },
    });
    expect(
      (sent as unknown as { headers: Headers }).headers.get("Idempotency-Key"),
    ).toMatch(/^[0-9a-f-]{36}$/);
    await vi.waitFor(() => expect(reads).toBe(2));
  });

  it("checks an experience's dates before sending, and shows the API's refusal", async () => {
    let posts = 0;
    api({
      "GET /api/career/profile": () => json(FULL),
      "POST /api/career/experiences": () => {
        posts++;
        return json(
          {
            error: "bad_request",
            message: "The experience ends 2024, before 2025: give its end too",
          },
          { status: 400 },
        );
      },
    });
    openProfile();
    await userEvent.click(
      await screen.findByRole("button", { name: "Add experience" }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Add an experience",
    });
    await userEvent.type(within(sheet).getByLabelText("Title"), "Researcher");
    await userEvent.type(within(sheet).getByLabelText("Organization"), "Lab");
    await userEvent.type(within(sheet).getByLabelText("Start"), "2023-04");
    await userEvent.type(within(sheet).getByLabelText(/End/), "2023-03");
    await userEvent.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(
      within(sheet).getByText("The end is before the start."),
    ).toBeInTheDocument();
    expect(posts).toBe(0);

    await userEvent.clear(within(sheet).getByLabelText(/End/));
    await userEvent.click(within(sheet).getByRole("button", { name: "Add" }));
    expect(
      await within(sheet).findByText(/ends 2024, before 2025/),
    ).toBeInTheDocument();
  });

  it("opens a fresh form each time: closing or adding leaves nothing behind", async () => {
    api({
      "GET /api/career/profile": () => json(FULL),
      "POST /api/career/education": () => json({ education: { id: "e2" } }),
    });
    const user = userEvent.setup();
    openProfile();
    const addEducation = async () => {
      await user.click(
        await screen.findByRole("button", { name: "Add education" }),
      );
      return screen.findByRole("dialog", { name: "Add education" });
    };
    const closed = () =>
      waitFor(() =>
        expect(
          screen.queryByRole("dialog", { name: "Add education" }),
        ).toBeNull(),
      );

    // Typed, then closed: the next one starts empty.
    let sheet = await addEducation();
    await user.type(within(sheet).getByLabelText("Degree"), "MSc");
    await user.type(within(sheet).getByLabelText("Institution"), "USP");
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    await closed();
    sheet = await addEducation();
    expect(within(sheet).getByLabelText("Degree")).toHaveValue("");
    expect(within(sheet).getByLabelText("Institution")).toHaveValue("");

    // Added: the next one starts empty too.
    await user.type(within(sheet).getByLabelText("Degree"), "MSc");
    await user.type(within(sheet).getByLabelText("Institution"), "USP");
    await user.type(within(sheet).getByLabelText("Start"), "2024");
    await user.click(within(sheet).getByRole("button", { name: "Add" }));
    await closed();
    sheet = await addEducation();
    expect(within(sheet).getByLabelText("Degree")).toHaveValue("");
    expect(within(sheet).getByLabelText("Start")).toHaveValue("");
    await user.click(within(sheet).getByRole("button", { name: "Close" }));
    await closed();

    // An experience opened to edit, then closed: Add experience is empty.
    await user.click(await screen.findByRole("button", { name: /Engineer/ }));
    const edit = await screen.findByRole("dialog", { name: "Experience" });
    expect(within(edit).getByLabelText("Organization")).toHaveValue("Acme");
    await user.click(within(edit).getByRole("button", { name: "Close" }));
    await waitFor(() =>
      expect(screen.queryByRole("dialog", { name: "Experience" })).toBeNull(),
    );
    await user.click(screen.getByRole("button", { name: "Add experience" }));
    const add = await screen.findByRole("dialog", {
      name: "Add an experience",
    });
    expect(within(add).getByLabelText("Organization")).toHaveValue("");
    expect(within(add).getByLabelText("Title")).toHaveValue("");
  });

  it("removes an experience after confirming", async () => {
    let removed = false;
    api({
      "GET /api/career/profile": () => json(FULL),
      "DELETE /api/career/items/experience/x1": () => {
        removed = true;
        return new Response(null, { status: 204 });
      },
    });
    openProfile();
    await userEvent.click(
      await screen.findByRole("button", { name: /2023-04 – now/ }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Experience" });
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Remove" }),
    );
    const confirm = await screen.findByRole("dialog", {
      name: "Remove this experience?",
    });
    expect(removed).toBe(false);
    await userEvent.click(
      within(confirm).getByRole("button", { name: "Remove" }),
    );
    expect(await screen.findByText("Removed")).toBeInTheDocument();
    expect(removed).toBe(true);
  });

  it("edits the address in its three parts", async () => {
    let body: Record<string, unknown> | null = null;
    api({
      "GET /api/career/profile": () => json(FULL),
      "PATCH /api/career/person": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ person: FULL.person });
      },
    });
    openProfile();
    await userEvent.click(
      await screen.findByRole("button", { name: /Sam Rivera/ }),
    );
    const sheet = await screen.findByRole("dialog", {
      name: "Name and contact",
    });
    expect(within(sheet).getByLabelText(/^City/)).toHaveValue("Recife");
    const region = within(sheet).getByLabelText(/^State or province/);
    expect(region).toHaveValue("Pernambuco");
    await userEvent.clear(region);
    await userEvent.type(region, "PE");
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await vi.waitFor(() =>
      expect(body).toMatchObject({
        city: "Recife",
        region: "PE",
        country: "Brazil",
      }),
    );
    expect(body).not.toHaveProperty("location");
  });

  it("replaces the links from their sheet, https only", async () => {
    let body: unknown = null;
    api({
      "GET /api/career/profile": () => json(FULL),
      "PUT /api/career/links": (init) => {
        body = JSON.parse(String(init?.body));
        return json({ links: [] });
      },
    });
    openProfile();
    await userEvent.click(
      await screen.findByRole("button", { name: "Edit links" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Links" });
    await userEvent.click(
      within(sheet).getByRole("button", { name: "Add a link" }),
    );
    const second = within(sheet).getByRole("group", { name: "Link 2" });
    await userEvent.selectOptions(
      within(second).getByLabelText("Kind"),
      "github",
    );
    await userEvent.type(
      within(second).getByLabelText("URL"),
      "http://github.com/sam",
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(within(second).getByText("An https:// link.")).toBeInTheDocument();
    expect(body).toBeNull();
    await userEvent.clear(within(second).getByLabelText("URL"));
    await userEvent.type(
      within(second).getByLabelText("URL"),
      "https://github.com/sam",
    );
    await userEvent.click(within(sheet).getByRole("button", { name: "Save" }));
    await screen.findByText("Saved");
    expect(body).toEqual({
      links: [
        { kind: "linkedin", label: "LinkedIn URL", url: PROFILE.links[0]?.url },
        { kind: "github", label: "GitHub", url: "https://github.com/sam" },
      ],
    });
  });

  it("uploads a photo after checking its type and size", async () => {
    let put: { type: string | null; size: number } | null = null;
    api({
      "GET /api/career/profile": () => json(FULL),
      "PUT /api/career/photo": (init) => {
        put = {
          type: new Headers(init?.headers).get("Content-Type"),
          size: (init?.body as Blob | undefined)?.size ?? 0,
        };
        return json({ photo: { type: "image/png" } });
      },
    });
    openProfile();
    const input = (await screen.findByLabelText(
      "Photo file",
    )) as HTMLInputElement;
    await userEvent.upload(
      input,
      new File(["gif"], "a.gif", { type: "image/gif" }),
      {
        applyAccept: false,
      },
    );
    expect(
      await screen.findByText("A photo is JPEG, PNG or WebP."),
    ).toBeInTheDocument();
    const big = new File([new Uint8Array(2 * 1024 * 1024 + 1)], "big.png", {
      type: "image/png",
    });
    await userEvent.upload(input, big);
    expect(
      await screen.findByText("A photo is at most 2 MB."),
    ).toBeInTheDocument();
    expect(put).toBeNull();
    await userEvent.upload(
      input,
      new File(["png"], "me.png", { type: "image/png" }),
    );
    expect(await screen.findByText("Photo updated")).toBeInTheDocument();
    expect(put).toEqual({ type: "image/png", size: 3 });
  });
});
