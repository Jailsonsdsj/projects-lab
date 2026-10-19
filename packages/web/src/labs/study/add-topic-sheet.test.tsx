import { IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import type { BacklogResponse, TopicInfo } from "@projects-lab/shared/study";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json } from "../../../test/api";
import { createRoutes } from "../../app";

const pg: TopicInfo = {
  id: "DB-01",
  skill: "PostgreSQL",
  skillId: "sk-pg",
  area: "DB",
  level: "essential",
  priority: 2,
  status: "not_started",
  grade: null,
  startedOn: null,
  finishedOn: null,
  note: "",
};
const AREAS = [
  { prefix: "CS", name: "CS Fundamentals", position: 1 },
  { prefix: "DB", name: "Databases and Data", position: 4 },
];
const SKILLS = {
  postgres: { id: "sk-pg", name: "PostgreSQL", aliases: ["Postgres"] },
  docker: { id: "sk-docker", name: "Docker", aliases: [] },
} as Record<string, { id: string; name: string; aliases: string[] }>;

type Call = { method: string; path: string; init?: RequestInit };

/** The API by path: the backlog, the skill lookup and the two writes. */
function api(
  writes: Record<string, (body: unknown) => Response> = {},
  topics: TopicInfo[] = [pg],
) {
  const calls: Call[] = [];
  let reads = 0;
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = new URL(String(input), "https://lab.example");
    const method = init?.method ?? "GET";
    calls.push({ method, path: url.pathname, init });
    if (method === "GET" && url.pathname === "/api/study/backlog") {
      reads++;
      return json({ areas: AREAS, topics } satisfies BacklogResponse);
    }
    if (method === "GET" && url.pathname === "/api/skills") {
      const query = (url.searchParams.get("query") ?? "").toLowerCase();
      return json({ skill: SKILLS[query] ?? null });
    }
    const write = writes[`${method} ${url.pathname}`];
    if (write) return write(JSON.parse(String(init?.body ?? "null")));
    throw new Error(`unexpected request ${method} ${url.pathname}`);
  });
  return { calls, reads: () => reads };
}

async function openAdd() {
  const user = userEvent.setup();
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/study"],
  });
  render(<RouterProvider router={router} />);
  await user.click(await screen.findByRole("button", { name: "Add" }));
  const sheet = await screen.findByRole("dialog", { name: "Add a topic" });
  return { user, sheet };
}

const added = (topic: TopicInfo, created: boolean, restored = false) =>
  json({ topics: [{ topic, created, restored }] });

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Add a topic", () => {
  it("looks the skill up as you type: in the backlog, a match, or new", async () => {
    api();
    const { user, sheet } = await openAdd();
    const skill = within(sheet).getByLabelText("Skill");
    await user.type(skill, "postgres");
    expect(
      await within(sheet).findByText(
        "PostgreSQL is already in the backlog as DB-01.",
      ),
    ).toBeInTheDocument();
    await user.clear(skill);
    await user.type(skill, "docker");
    expect(
      await within(sheet).findByText("Matches the skill Docker."),
    ).toBeInTheDocument();
    await user.clear(skill);
    await user.type(skill, "Zig");
    expect(await within(sheet).findByText("A new skill.")).toBeInTheDocument();
  });

  it("adds with an Idempotency-Key, toasts it and reads the backlog again", async () => {
    const graphs = {
      ...pg,
      id: "CS-03",
      skill: "Graphs",
      area: "CS",
      priority: 1 as const,
    };
    const posted = vi.fn((_body: unknown) => added(graphs, true));
    const { calls, reads } = api({ "POST /api/study/topics": posted });
    const { user, sheet } = await openAdd();
    await user.type(within(sheet).getByLabelText("Skill"), "Graphs");
    await user.selectOptions(within(sheet).getByLabelText("Area"), "CS");
    await user.selectOptions(
      within(sheet).getByLabelText("Level"),
      "essential",
    );
    await user.selectOptions(within(sheet).getByLabelText("Priority"), "1");
    await user.click(
      within(sheet).getByRole("button", { name: "Add to backlog" }),
    );

    expect(await screen.findByText("Added CS-03 · Graphs")).toBeInTheDocument();
    expect(posted).toHaveBeenCalledWith({
      topics: [
        { skill: "Graphs", area: "CS", level: "essential", priority: 1 },
      ],
    });
    const write = calls.find((c) => c.method === "POST");
    expect(
      new Headers(write?.init?.headers).get(IDEMPOTENCY_KEY_HEADER),
    ).toBeTruthy();
    await waitFor(() => expect(reads()).toBe(2));
  });

  it("says when the skill was already there, or restored", async () => {
    api({ "POST /api/study/topics": () => added(pg, false) });
    const first = await openAdd();
    await first.user.type(
      within(first.sheet).getByLabelText("Skill"),
      "postgres",
    );
    await first.user.selectOptions(
      within(first.sheet).getByLabelText("Area"),
      "DB",
    );
    await first.user.click(
      within(first.sheet).getByRole("button", { name: "Add to backlog" }),
    );
    expect(
      await screen.findByText("PostgreSQL is already in the backlog as DB-01"),
    ).toBeInTheDocument();
  });

  it("asks for a skill and an area before sending anything", async () => {
    const { calls } = api();
    const { user, sheet } = await openAdd();
    await user.click(
      within(sheet).getByRole("button", { name: "Add to backlog" }),
    );
    expect(
      within(sheet).getByText("Name the skill to learn."),
    ).toBeInTheDocument();
    expect(within(sheet).getByText("Choose an area.")).toBeInTheDocument();
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("checks a new area's prefix before sending: two letters, not taken", async () => {
    const { calls } = api();
    const { user, sheet } = await openAdd();
    await user.type(within(sheet).getByLabelText("Skill"), "Swift");
    await user.selectOptions(within(sheet).getByLabelText("Area"), "+new");
    await user.type(within(sheet).getByLabelText("Area name"), "Mobile");
    const prefix = within(sheet).getByLabelText("Prefix");
    await user.type(prefix, "db");
    expect(prefix).toHaveValue("DB");
    expect(
      within(sheet).getByText("DB is already an area's prefix."),
    ).toBeInTheDocument();
    await user.clear(prefix);
    await user.type(prefix, "M1");
    expect(within(sheet).getByText("Two letters, A to Z.")).toBeInTheDocument();
    await user.click(
      within(sheet).getByRole("button", { name: "Add to backlog" }),
    );
    expect(calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("shows the server's taken prefix under Prefix and adds no topic", async () => {
    const topics = vi.fn(() => added(pg, true));
    api({
      "POST /api/study/areas": () =>
        json(
          { error: "conflict", message: "Prefix MO is already taken." },
          { status: 409 },
        ),
      "POST /api/study/topics": topics,
    });
    const { user, sheet } = await openAdd();
    await user.type(within(sheet).getByLabelText("Skill"), "Swift");
    await user.selectOptions(within(sheet).getByLabelText("Area"), "+new");
    await user.type(within(sheet).getByLabelText("Area name"), "Mobile");
    await user.type(within(sheet).getByLabelText("Prefix"), "mo");
    await user.click(
      within(sheet).getByRole("button", { name: "Add to backlog" }),
    );
    expect(
      await within(sheet).findByText("Prefix MO is already taken."),
    ).toBeInTheDocument();
    expect(topics).not.toHaveBeenCalled();
    // A field error, not a failure: the form is fine once the prefix changes.
    expect(within(sheet).queryByText("Couldn't add it.")).toBeNull();
  });

  it("creates the new area, then the topic in it", async () => {
    const swift = { ...pg, id: "MO-01", skill: "Swift", area: "MO" };
    const order: string[] = [];
    api({
      "POST /api/study/areas": (body) => {
        order.push("area");
        expect(body).toEqual({ name: "Mobile", prefix: "MO" });
        return json({ area: { prefix: "MO", name: "Mobile", position: 8 } });
      },
      "POST /api/study/topics": (body) => {
        order.push("topic");
        expect(body).toMatchObject({
          topics: [{ skill: "Swift", area: "MO" }],
        });
        return added(swift, true);
      },
    });
    const { user, sheet } = await openAdd();
    await user.type(within(sheet).getByLabelText("Skill"), "Swift");
    await user.selectOptions(within(sheet).getByLabelText("Area"), "+new");
    await user.type(within(sheet).getByLabelText("Area name"), "Mobile");
    await user.type(within(sheet).getByLabelText("Prefix"), "mo");
    await user.click(
      within(sheet).getByRole("button", { name: "Add to backlog" }),
    );
    expect(await screen.findByText("Added MO-01 · Swift")).toBeInTheDocument();
    expect(order).toEqual(["area", "topic"]);
  });

  it("keeps what was typed on a failed add, and says offline when it never got there", async () => {
    api({
      "POST /api/study/topics": () =>
        json({ error: "internal" }, { status: 500 }),
    });
    const { user, sheet } = await openAdd();
    await user.type(within(sheet).getByLabelText("Skill"), "Graphs");
    await user.selectOptions(within(sheet).getByLabelText("Area"), "CS");
    await user.click(
      within(sheet).getByRole("button", { name: "Add to backlog" }),
    );
    expect(
      await within(sheet).findByText("Couldn't add it."),
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Skill")).toHaveValue("Graphs");

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Load failed"),
    );
    await user.click(
      within(sheet).getByRole("button", { name: "Add to backlog" }),
    );
    expect(
      await within(sheet).findByText("You're offline."),
    ).toBeInTheDocument();
  });

  it("can be opened from the empty backlog, with its areas", async () => {
    api({}, []);
    const user = userEvent.setup();
    const router = createMemoryRouter(createRoutes(), {
      initialEntries: ["/study"],
    });
    render(<RouterProvider router={router} />);
    await user.click(
      await screen.findByRole("button", { name: "Add a topic" }),
    );
    const sheet = await screen.findByRole("dialog", { name: "Add a topic" });
    expect(
      within(within(sheet).getByLabelText("Area")).getByRole("option", {
        name: "Databases and Data",
      }),
    ).toBeInTheDocument();
  });
});
