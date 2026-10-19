import { IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import type { BacklogResponse, TopicInfo } from "@projects-lab/shared/study";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../../test/api";
import { createRoutes } from "../../app";

const graphs: TopicInfo = {
  id: "CS-02",
  skill: "Graphs",
  skillId: "sk-graphs",
  area: "CS",
  level: "essential",
  priority: 2,
  status: "in_progress",
  grade: null,
  startedOn: "2026-10-01",
  finishedOn: null,
  note: "m1 of 2",
};
const backlog = (topics: TopicInfo[]): BacklogResponse => ({
  areas: [{ prefix: "CS", name: "CS Fundamentals", position: 1 }],
  topics,
});

function openBacklog() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/study"],
  });
  render(<RouterProvider router={router} />);
}

async function openGraphs() {
  const user = userEvent.setup();
  openBacklog();
  await user.click(
    await screen.findByRole("button", { name: /CS-02.*Graphs/ }),
  );
  const sheet = await screen.findByRole("dialog", { name: "CS-02 · Graphs" });
  return { user, sheet };
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Topic sheet", () => {
  it("opens from a row with the topic's values and facts", async () => {
    mockApi({ "GET /api/study/backlog": () => json(backlog([graphs])) });
    const { sheet } = await openGraphs();
    expect(within(sheet).getByLabelText("Level")).toHaveValue("essential");
    expect(within(sheet).getByLabelText("Priority")).toHaveValue("2");
    expect(within(sheet).getByLabelText("Status")).toHaveValue("in_progress");
    expect(within(sheet).getByLabelText(/Note/)).toHaveValue("m1 of 2");
    expect(sheet).toHaveTextContent("2026-10-01");
    expect(within(sheet).getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("saves only what changed, with an Idempotency-Key, then reads the backlog again", async () => {
    let reads = 0;
    const patch = vi.fn((init?: RequestInit) => {
      expect(
        new Headers(init?.headers).get(IDEMPOTENCY_KEY_HEADER),
      ).toBeTruthy();
      return json({ topic: { ...graphs, priority: 1 } });
    });
    mockApi({
      "GET /api/study/backlog": () => {
        reads++;
        return json(backlog([reads > 1 ? { ...graphs, priority: 1 } : graphs]));
      },
      "PATCH /api/study/topics/CS-02": patch,
    });
    const { user, sheet } = await openGraphs();
    await user.selectOptions(within(sheet).getByLabelText("Priority"), "1");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));

    expect(JSON.parse(String(patch.mock.calls[0]?.[0]?.body))).toEqual({
      priority: 1,
    });
    expect(await screen.findByText("CS-02 saved")).toBeInTheDocument();
    await waitFor(() => expect(reads).toBe(2));
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /CS-02.*Graphs/ }),
      ).toHaveTextContent("P1"),
    );
  });

  it("refuses a note over 120 characters in the form", async () => {
    mockApi({ "GET /api/study/backlog": () => json(backlog([graphs])) });
    const { user, sheet } = await openGraphs();
    const note = within(sheet).getByLabelText(/Note/);
    await user.clear(note);
    await user.click(note);
    await user.paste("x".repeat(121));
    expect(
      within(sheet).getByText(/At most 120 characters/),
    ).toBeInTheDocument();
    expect(within(sheet).getByRole("button", { name: "Save" })).toBeDisabled();
    await user.keyboard("{Backspace}");
    expect(within(sheet).getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("removes after a danger confirm, with an Idempotency-Key", async () => {
    let removed = false;
    mockApi({
      "GET /api/study/backlog": () => json(backlog(removed ? [] : [graphs])),
      "DELETE /api/study/topics/CS-02": (init) => {
        expect(
          new Headers(init?.headers).get(IDEMPOTENCY_KEY_HEADER),
        ).toBeTruthy();
        removed = true;
        return new Response(null, { status: 204 });
      },
    });
    const { user, sheet } = await openGraphs();
    await user.click(within(sheet).getByRole("button", { name: "Remove" }));
    const confirm = await screen.findByRole("dialog", {
      name: "Remove CS-02 from the backlog?",
    });
    expect(confirm).toHaveTextContent("adding Graphs again restores it");
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));
    expect(await screen.findByText("CS-02 removed")).toBeInTheDocument();
    expect(await screen.findByText("No topics yet")).toBeInTheDocument();
  });

  it("keeps the edits on a failed save, and says offline when it never got there", async () => {
    mockApi({
      "GET /api/study/backlog": () => json(backlog([graphs])),
      "PATCH /api/study/topics/CS-02": () =>
        json({ error: "internal" }, { status: 500 }),
    });
    const { user, sheet } = await openGraphs();
    await user.selectOptions(within(sheet).getByLabelText("Status"), "done");
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(
      await within(sheet).findByText("Couldn't save."),
    ).toBeInTheDocument();
    expect(within(sheet).getByLabelText("Status")).toHaveValue("done");

    vi.restoreAllMocks();
    vi.spyOn(globalThis, "fetch").mockRejectedValue(
      new TypeError("Load failed"),
    );
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(
      await within(sheet).findByText("You're offline."),
    ).toBeInTheDocument();
  });

  it("closes and reads again when the topic was removed meanwhile", async () => {
    let reads = 0;
    mockApi({
      "GET /api/study/backlog": () => {
        reads++;
        return json(backlog(reads > 1 ? [] : [graphs]));
      },
      "PATCH /api/study/topics/CS-02": () =>
        json({ error: "not_found" }, { status: 404 }),
    });
    const { user, sheet } = await openGraphs();
    await user.selectOptions(
      within(sheet).getByLabelText("Level"),
      "specialized",
    );
    await user.click(within(sheet).getByRole("button", { name: "Save" }));
    expect(
      await screen.findByText("CS-02 was already removed"),
    ).toBeInTheDocument();
    expect(await screen.findByText("No topics yet")).toBeInTheDocument();
  });
});
