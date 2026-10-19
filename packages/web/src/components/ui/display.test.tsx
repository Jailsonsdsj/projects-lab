import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import componentsCss from "../../styles/components.css?raw";
import tokensCss from "../../styles/tokens.css?raw";
import { Banner } from "./Banner";
import { Button } from "./Button";
import { EmptyState, ErrorState } from "./EmptyState";
import { ImageTile, initialsOf } from "./ImageTile";
import { ProgressBar } from "./ProgressBar";
import { Skeleton } from "./Skeleton";
import { StatCard } from "./StatCard";

describe("ProgressBar", () => {
  it("exposes its value, range and name to assistive tech", () => {
    render(
      <ProgressBar
        value={1}
        max={3}
        label="Lesson progress"
        caption="Lesson 1 of 3"
        valueText="33%"
      />,
    );
    const bar = screen.getByRole("progressbar", { name: "Lesson progress" });
    expect(bar).toHaveAttribute("aria-valuenow", "1");
    expect(bar).toHaveAttribute("aria-valuemin", "0");
    expect(bar).toHaveAttribute("aria-valuemax", "3");
    const fill = bar.firstElementChild as HTMLElement;
    expect(fill.style.getPropertyValue("--_value")).toBe(`${100 / 3}%`);
  });

  it("clamps out-of-range values", () => {
    render(<ProgressBar value={140} label="Done" />);
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "100",
    );
  });
});

describe("Skeleton", () => {
  it("is decorative and takes its pulse only from --animate-skeleton", () => {
    const { container } = render(<Skeleton shape="title" width="75%" />);
    const skel = container.querySelector(".skel");
    expect(skel).toHaveAttribute("aria-hidden", "true");
    expect(skel).toHaveClass("skel--title");
    expect(skel?.getAttribute("style")).not.toMatch(/animation/);
    expect(componentsCss).toMatch(
      /\.skel \{[^}]*animation: var\(--animate-skeleton\)/,
    );
  });

  it("holds still under reduced motion (the token becomes none)", () => {
    const reduced = tokensCss.match(
      /@media \(prefers-reduced-motion: reduce\) \{([\s\S]*?)\n\}/,
    );
    expect(reduced?.[1]).toMatch(/--animate-skeleton:\s*none;/);
  });
});

describe("ImageTile", () => {
  it("shimmers while loading, then shows the photo", () => {
    const { container } = render(
      <ImageTile src="/photo.jpg" name="Sam Rivera" round />,
    );
    const tile = container.querySelector(".tile");
    expect(tile).toHaveClass("is-loading");
    expect(tile).toHaveAttribute("aria-busy", "true");
    fireEvent.load(screen.getByAltText("Sam Rivera"));
    expect(tile).not.toHaveClass("is-loading");
    expect(tile).not.toHaveAttribute("aria-busy");
  });

  it("falls back to initials, named by the person, when the photo fails", () => {
    render(<ImageTile src="/missing.jpg" name="Sam Rivera" />);
    fireEvent.error(screen.getByRole("img"));
    const tile = screen.getByRole("img", { name: "Sam Rivera" });
    expect(tile).toHaveClass("is-failed");
    expect(tile).toHaveTextContent("SR");
  });

  it("shows initials when there is no photo at all", () => {
    render(<ImageTile name="Ada" />);
    expect(screen.getByRole("img", { name: "Ada" })).toHaveTextContent("A");
    expect(initialsOf("  grace  brewster hopper ")).toBe("GB");
  });
});

describe("EmptyState and ErrorState", () => {
  it("keeps an empty answer and a failed read visibly different", () => {
    const { container } = render(
      <>
        <EmptyState icon="book" title="Your backlog is empty">
          Ask Claude to plan a topic.
        </EmptyState>
        <ErrorState
          title="Couldn't load your backlog"
          code="503 · req 7f3a-19c2"
          actions={<Button>Retry</Button>}
        >
          Nothing you saved is lost.
        </ErrorState>
        <ErrorState kind="offline" title="You're offline" />
      </>,
    );
    const [empty, error, offline] = container.querySelectorAll(".empty");
    expect(empty).not.toHaveClass("empty--error");
    expect(error).toHaveClass("empty--error");
    expect(error).toHaveTextContent("503 · req 7f3a-19c2");
    expect(offline).toHaveClass("empty--offline");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
  });
});

describe("Banner", () => {
  it("interrupts for warning and danger, waits its turn for info and offline", () => {
    const { rerender } = render(
      <Banner tone="warning" title="Session expired.">
        Sign in again.
      </Banner>,
    );
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Session expired. Sign in again.",
    );
    expect(screen.getByRole("alert")).toHaveClass("banner banner--warning");
    rerender(<Banner tone="offline">You're offline.</Banner>);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByRole("status")).toHaveClass("banner--offline");
  });
});

describe("StatCard", () => {
  it("shows its label, value with unit, note and what it holds", () => {
    const { container } = render(
      <StatCard label="Courses done" value="1" unit="of 8" note="This term">
        <span>bar</span>
      </StatCard>,
    );
    expect(container.querySelector(".stat__label")).toHaveTextContent(
      "Courses done",
    );
    expect(container.querySelector(".stat__value")).toHaveTextContent("1of 8");
    expect(container.querySelector(".stat__note")).toHaveTextContent(
      "This term",
    );
    expect(container.querySelector(".stat")).toHaveTextContent("bar");
  });
});
