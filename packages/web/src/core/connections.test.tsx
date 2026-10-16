import { type Connection, IDEMPOTENCY_KEY_HEADER } from "@projects-lab/shared";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../test/api";
import { createRoutes } from "../app";
import { relativeTime } from "./ConnectionsScreen";

const HOUR = 3600 * 1000;
const claude: Connection = {
  id: "g1",
  clientName: "Claude",
  origin: "claude.ai",
  grantedAt: new Date(Date.now() - 48 * HOUR).toISOString(),
  lastUsedAt: new Date(Date.now() - 2 * HOUR).toISOString(),
};
const claudeCode: Connection = {
  id: "g2",
  clientName: "Claude Code",
  origin: "localhost",
  grantedAt: new Date(Date.now() - 24 * HOUR).toISOString(),
  lastUsedAt: null,
};

function openConnections() {
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/connections"],
  });
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  vi.restoreAllMocks();
  document.documentElement.removeAttribute("data-lab");
});

describe("Connections", () => {
  it("lists each client with where it connects from and when it last wrote", async () => {
    mockApi({
      "GET /api/connections": () => json({ connections: [claude, claudeCode] }),
    });
    openConnections();
    const rows = await screen.findAllByRole("listitem");
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent("Claude");
    expect(rows[0]).toHaveTextContent("claude.ai · last used 2 hours ago");
    expect(rows[1]).toHaveTextContent("localhost · not used yet");
    expect(
      within(rows[1] as HTMLElement).getByRole("button", {
        name: "Revoke Claude Code",
      }),
    ).toBeInTheDocument();
  });

  it("renders a client's name as text", async () => {
    const name = "<b>Bold</b> client";
    mockApi({
      "GET /api/connections": () =>
        json({ connections: [{ ...claude, clientName: name }] }),
    });
    openConnections();
    expect(await screen.findByText(name)).toBeInTheDocument();
    expect(document.querySelector("li b")).toBeNull();
  });

  it("shows no connections as empty, and a failed read as an error", async () => {
    mockApi({ "GET /api/connections": () => json({ connections: [] }) });
    openConnections();
    expect(await screen.findByText("No connections")).toBeInTheDocument();
  });

  it("never shows a failed read as 'No connections'", async () => {
    mockApi({
      "GET /api/connections": () =>
        json({ error: "internal" }, { status: 500 }),
    });
    openConnections();
    expect(await screen.findByText("Couldn't load this")).toBeInTheDocument();
    expect(screen.queryByText("No connections")).toBeNull();
  });

  it("asks before revoking, then revokes, says so and drops it from the list", async () => {
    const user = userEvent.setup();
    let revoked = false;
    const fetchMock = mockApi({
      "GET /api/connections": () =>
        json({ connections: revoked ? [claudeCode] : [claude, claudeCode] }),
      "DELETE /api/connections/g1": () => {
        revoked = true;
        return new Response(null, { status: 204 });
      },
    });
    openConnections();
    await user.click(
      await screen.findByRole("button", { name: "Revoke Claude" }),
    );
    const dialog = screen.getByRole("dialog", { name: "Revoke Claude?" });
    expect(dialog).toHaveTextContent(
      "It loses access to your Projects Lab straight away.",
    );

    await user.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(revoked).toBe(false);

    await user.click(screen.getByRole("button", { name: "Revoke Claude" }));
    await user.click(
      within(screen.getByRole("dialog", { name: "Revoke Claude?" })).getByRole(
        "button",
        { name: "Revoke" },
      ),
    );
    expect(await screen.findByText("Claude was revoked")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getAllByRole("listitem")).toHaveLength(1),
    );
    const del = fetchMock.mock.calls.find(
      ([, init]) => init?.method === "DELETE",
    );
    const headers = new Headers(del?.[1]?.headers);
    expect(headers.get(IDEMPOTENCY_KEY_HEADER)).toMatch(/^[0-9a-f-]{36}$/);
    expect(headers.get("Authorization")).toMatch(/^Bearer /);
  });
});

describe("relativeTime", () => {
  it("speaks in the largest whole unit", () => {
    const now = Date.parse("2026-10-16T12:00:00Z");
    expect(relativeTime("2026-10-16T10:00:00Z", now)).toBe("2 hours ago");
    expect(relativeTime("2026-10-15T12:00:00Z", now)).toBe("yesterday");
    expect(relativeTime("2026-10-16T11:59:40Z", now)).toBe("just now");
  });
});
