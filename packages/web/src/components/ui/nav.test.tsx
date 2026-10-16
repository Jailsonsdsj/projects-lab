import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { BottomTabs } from "./BottomTabs";
import { LabCard } from "./LabCard";
import { type LabOption, LabSwitcher } from "./LabSwitcher";
import type { NavItem } from "./nav";
import { SideRail } from "./SideRail";

// The nav components render real links and hand plain clicks to the app's
// router through onNavigate; everything else stays the browser's.

/** Clicks a link and reports whether the browser would follow it. jsdom can't
 *  load another document, so the click's default is cancelled once it has
 *  bubbled past React. */
function browserFollows(link: HTMLElement, init?: MouseEventInit) {
  let follows = false;
  const settle = (event: Event) => {
    follows = !event.defaultPrevented;
    event.preventDefault();
  };
  document.addEventListener("click", settle, { once: true });
  fireEvent.click(link, init);
  return follows;
}

const ITEMS: NavItem[] = [
  { label: "Backlog", icon: "list", href: "/study", current: true },
  { label: "Grades", icon: "award", href: "/study/grades" },
];

const LABS: LabOption[] = [
  {
    id: "study",
    name: "Study Lab",
    description: "Courses and grades",
    icon: "book",
    href: "/study",
  },
  {
    id: "career",
    name: "Career Lab",
    description: "Skills and interviews",
    icon: "briefcase",
    href: "/career",
  },
];

describe("BottomTabs", () => {
  it("follows a plain click client-side and marks the current tab", () => {
    const navigate = vi.fn();
    render(
      <BottomTabs label="Study Lab" items={ITEMS} onNavigate={navigate} />,
    );
    const nav = screen.getByRole("navigation", { name: "Study Lab" });
    expect(nav).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Backlog" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const grades = screen.getByRole("link", { name: "Grades" });
    expect(grades).not.toHaveAttribute("aria-current");
    expect(browserFollows(grades)).toBe(false);
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/study/grades");
  });
});

describe("SideRail", () => {
  it.each([
    ["Cmd held", { metaKey: true }],
    ["Ctrl held", { ctrlKey: true }],
    ["Shift held", { shiftKey: true }],
    ["Alt held", { altKey: true }],
    ["the middle button", { button: 1 }],
  ])(
    "leaves a click with %s to the browser (new tab, new window, download)",
    (_, init) => {
      const navigate = vi.fn();
      render(
        <SideRail
          label="Study Lab"
          section="Study"
          items={ITEMS}
          footItems={[
            { label: "Settings", icon: "settings", href: "/settings" },
          ]}
          onNavigate={navigate}
        />,
      );
      for (const name of ["Grades", "Settings"]) {
        expect(browserFollows(screen.getByRole("link", { name }), init)).toBe(
          true,
        );
      }
      expect(navigate).not.toHaveBeenCalled();
    },
  );
});

describe("LabSwitcher", () => {
  it("opens the labs in a sheet on phone; picking one navigates and closes it", async () => {
    const user = userEvent.setup();
    const navigate = vi.fn();
    render(
      <LabSwitcher
        labs={LABS}
        current="study"
        variant="sheet"
        onNavigate={navigate}
      />,
    );
    const trigger = screen.getByRole("button", { name: "Study Lab" });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const sheet = screen.getByRole("dialog", { name: "Switch lab" });
    expect(sheet).toHaveAttribute("open");
    expect(screen.getByRole("link", { name: /Study Lab/ })).toHaveAttribute(
      "aria-current",
      "true",
    );

    await user.click(screen.getByRole("link", { name: /Career Lab/ }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/career");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    await waitFor(() => expect(sheet).not.toHaveAttribute("open"));
  });
});

describe("LabCard", () => {
  const card = {
    lab: "study",
    name: "Study Lab",
    icon: "book",
    href: "/study",
  } as const;

  it("opens its lab client-side when it has a summary", async () => {
    const navigate = vi.fn();
    render(
      <LabCard
        {...card}
        state={{
          status: "loaded",
          data: { stats: [{ value: "3", label: "courses" }] },
        }}
        onNavigate={navigate}
      />,
    );
    await userEvent.click(screen.getByRole("link", { name: /Study Lab/ }));
    expect(navigate).toHaveBeenCalledExactlyOnceWith("/study");
  });

  it("offers Retry, not a link, when the read failed", async () => {
    const navigate = vi.fn();
    const onRetry = vi.fn();
    render(
      <LabCard
        {...card}
        state={{ status: "error", onRetry }}
        onNavigate={navigate}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledOnce();
    expect(navigate).not.toHaveBeenCalled();
  });
});
