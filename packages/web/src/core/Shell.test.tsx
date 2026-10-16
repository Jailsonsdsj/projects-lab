import { act, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createMemoryRouter } from "react-router";
import { RouterProvider } from "react-router/dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { routes } from "../app";

function renderAt(path: string) {
  const router = createMemoryRouter(routes, { initialEntries: [path] });
  const view = render(<RouterProvider router={router} />);
  return { router, ...view };
}

const lab = () => document.documentElement.dataset.lab;

// jsdom applies no CSS, so the rail (hidden on phone) is in the tree too: scope
// phone assertions to the BottomTabs. The WebKit e2e test checks real visibility.
function bottomTabs(name: string): HTMLElement {
  const nav = screen
    .getAllByRole("navigation", { name })
    .find((n) => n.classList.contains("btabs"));
  if (!nav) throw new Error(`no BottomTabs named ${name}`);
  return nav;
}

afterEach(() => {
  document.documentElement.removeAttribute("data-lab");
  document.documentElement.removeAttribute("style");
  vi.restoreAllMocks();
});

describe("Shell on phone", () => {
  it("switches lab from the header without reloading: same shell, new data-lab and tabs", async () => {
    const user = userEvent.setup();
    const { router, container } = renderAt("/");
    const shell = container.querySelector(".shell");
    expect(lab()).toBe("platform");
    expect(
      within(bottomTabs("Home")).getByRole("link", {
        name: "Home",
      }),
    ).toHaveAttribute("aria-current", "page");

    await user.click(
      screen.getByRole("button", { name: /Home/, expanded: false }),
    );
    const sheet = screen.getByRole("dialog", { name: "Switch lab" });
    await user.click(within(sheet).getByRole("link", { name: /Study Lab/ }));

    expect(router.state.location.pathname).toBe("/study");
    expect(lab()).toBe("study");
    expect(container.querySelector(".shell")).toBe(shell);
    const tabs = bottomTabs("Study Lab");
    expect(within(tabs).getByRole("link", { name: "Backlog" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      within(tabs).queryByRole("link", { name: "Connections" }),
    ).toBeNull();
  });

  it("opens a deep link in its own lab", () => {
    renderAt("/career/skills");
    expect(lab()).toBe("career");
    const tabs = bottomTabs("Career Lab");
    expect(within(tabs).getByRole("link", { name: "Skills" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(
      screen.getByRole("heading", { level: 1, name: "Skills" }),
    ).toBeInTheDocument();
  });

  it("navigates tabs client-side and marks the current one", async () => {
    const user = userEvent.setup();
    const { router } = renderAt("/study");
    const tabs = bottomTabs("Study Lab");
    await user.click(within(tabs).getByRole("link", { name: "Grades" }));
    expect(router.state.location.pathname).toBe("/study/grades");
    expect(within(tabs).getByRole("link", { name: "Grades" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  it("shows Home with the number of labs from the registry", () => {
    renderAt("/");
    expect(
      screen.getByRole("heading", { level: 1, name: "Home" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Your two labs")).toBeInTheDocument();
  });
});

describe("Shell on tablet", () => {
  it("puts the switcher in the rail as a popover and switches lab", async () => {
    document.documentElement.style.setProperty("--breakpoint-tablet", "768px");
    document.documentElement.style.setProperty(
      "--breakpoint-landscape",
      "1024px",
    );
    vi.spyOn(window, "matchMedia").mockImplementation(
      (media) =>
        ({
          matches: media.includes("768px"),
          media,
          addEventListener: () => {},
          removeEventListener: () => {},
        }) as unknown as MediaQueryList,
    );
    const user = userEvent.setup();
    const { container } = renderAt("/study/courses");

    const rail = container.querySelector(".rail");
    expect(rail).toHaveClass("rail--compact"); // tablet, but narrower than landscape
    const switcher = within(rail as HTMLElement).getByRole("button", {
      name: /Study Lab/,
    });
    expect(switcher).toHaveClass("labsw--block");
    await user.click(switcher);
    await user.click(screen.getByRole("link", { name: /Career Lab/ }));
    await act(async () => {});
    expect(lab()).toBe("career");
  });
});
