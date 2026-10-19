import {
  type AuthorizePage,
  generateSalt,
  OAUTH_CONSENT_ELEMENT_ID,
} from "@projects-lab/shared";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { json, mockApi } from "../../test/api";
import { createRoutes } from "../app";
import { leaveTo } from "./oauth-consent";

vi.mock("./oauth-consent", async (original) => ({
  ...(await original<typeof import("./oauth-consent")>()),
  leaveTo: vi.fn(),
}));

const SALT = { salt: generateSalt(), iterations: 1000 };
const PASSPHRASE = "the owner's passphrase";
const PAGE: AuthorizePage = {
  handle: "handle-1",
  clientName: "Claude",
  clientDomain: "claude.ai",
  redirectHost: "claude.ai",
  redirectIsLoopback: false,
};
const CODE_URL = "https://claude.ai/api/mcp/auth_callback?code=abc&state=s1";
const DENIED_URL =
  "https://claude.ai/api/mcp/auth_callback?error=access_denied&state=s1";

/** The page as the Worker serves it: the consent details in a JSON script. */
function openAuthorize(page: AuthorizePage | null = PAGE) {
  if (page) {
    const script = document.createElement("script");
    script.type = "application/json";
    script.id = OAUTH_CONSENT_ELEMENT_ID;
    script.textContent = JSON.stringify(page);
    document.head.append(script);
  }
  const router = createMemoryRouter(createRoutes(), {
    initialEntries: ["/oauth/authorize?client_id=c1&state=s1"],
  });
  render(<RouterProvider router={router} />);
}

afterEach(() => {
  document.getElementById(OAUTH_CONSENT_ELEMENT_ID)?.remove();
  document.documentElement.removeAttribute("data-lab");
  vi.restoreAllMocks();
  vi.mocked(leaveTo).mockReset();
});

type Decision = { decision: string; handle: string; authKey?: string };

/** /oauth/authorize answers: verify 204 (or `verify`), allow/deny redirect. */
function worker({
  verify = () => new Response(null, { status: 204 }),
}: {
  verify?: () => Response;
} = {}) {
  const decisions: Decision[] = [];
  const fetchMock = mockApi({
    "GET /api/auth/salt": () => json(SALT),
    "POST /oauth/authorize": (init) => {
      const body = JSON.parse(String(init?.body)) as Decision;
      decisions.push(body);
      if (body.decision === "verify") return verify();
      return json({
        redirectTo: body.decision === "allow" ? CODE_URL : DENIED_URL,
      });
    },
  });
  return { decisions, fetchMock };
}

async function signIn(user = userEvent.setup()) {
  await user.type(screen.getByLabelText("Passphrase"), PASSPHRASE);
  await user.click(screen.getByRole("button", { name: "Sign in" }));
  return user;
}

describe("Claude's sign-in", () => {
  it("signs in, shows the consent, and Allow sends the browser back with a code", async () => {
    const { decisions, fetchMock } = worker();
    openAuthorize();
    const user = await signIn();

    expect(
      await screen.findByRole("heading", {
        name: "Claude wants to read and write your Projects Lab",
      }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Access goes to/)).toHaveTextContent(
      "Access goes to claude.ai.",
    );
    await user.click(screen.getByRole("button", { name: "Allow" }));

    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(CODE_URL));
    expect(decisions.map((d) => d.decision)).toEqual(["verify", "allow"]);
    expect(decisions[1]?.authKey).toBe(decisions[0]?.authKey);
    expect(decisions[1]?.handle).toBe("handle-1");
    const sent = fetchMock.mock.calls.map(([, init]) => String(init?.body));
    expect(sent.join(" ")).not.toContain(PASSPHRASE);
  });

  it("keeps a wrong passphrase on the sign-in step", async () => {
    worker({
      verify: () => json({ error: "invalid_passphrase" }, { status: 401 }),
    });
    openAuthorize();
    await signIn();
    const field = screen.getByLabelText("Passphrase");
    await waitFor(() =>
      expect(field).toHaveAccessibleDescription("Wrong passphrase"),
    );
    expect(screen.queryByRole("button", { name: "Allow" })).toBeNull();
    expect(leaveTo).not.toHaveBeenCalled();
  });

  it("sends Cancel back to the client as access_denied, without the key", async () => {
    const { decisions } = worker();
    openAuthorize();
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(leaveTo).toHaveBeenCalledWith(DENIED_URL));
    expect(decisions.at(-1)).toEqual({ decision: "deny", handle: "handle-1" });
  });

  it("renders a client's name as text, never as markup", async () => {
    const name = '<img src="x" onerror="alert(1)">';
    worker();
    openAuthorize({ ...PAGE, clientName: name, clientDomain: undefined });
    await signIn();
    // Wait for the consent screen's heading by name: right after Sign in, the
    // sign-in screen's own H1 ("Projects Lab") is still there while the key
    // derivation runs, and an unnamed query could catch it (seen in CI).
    const heading = await screen.findByRole("heading", {
      level: 1,
      name: `${name} wants to read and write your Projects Lab`,
    });
    expect(heading).toHaveTextContent(`${name} wants to read and write`);
    expect(document.querySelector("img")).toBeNull();
    expect(
      screen.getByText(/This app named itself; its name isn't verified/),
    ).toBeInTheDocument();
  });

  it("warns when the access goes to an app on this device", async () => {
    worker();
    openAuthorize({
      ...PAGE,
      redirectHost: "127.0.0.1",
      redirectIsLoopback: true,
    });
    await signIn();
    expect(await screen.findByRole("alert")).toHaveTextContent(
      "An app on this device.",
    );
  });

  it("says the page expired when it has no details, or the Worker says so", async () => {
    openAuthorize(null);
    expect(
      screen.getByRole("heading", { name: "This page expired" }),
    ).toBeInTheDocument();
  });

  it("turns an expired handle at Allow into the expired page", async () => {
    mockApi({
      "GET /api/auth/salt": () => json(SALT),
      "POST /oauth/authorize": (init) =>
        JSON.parse(String(init?.body)).decision === "verify"
          ? new Response(null, { status: 204 })
          : json({ error: "consent_expired" }, { status: 400 }),
    });
    openAuthorize();
    const user = await signIn();
    await user.click(await screen.findByRole("button", { name: "Allow" }));
    expect(
      await screen.findByRole("heading", { name: "This page expired" }),
    ).toBeInTheDocument();
    expect(leaveTo).not.toHaveBeenCalled();
  });
});
