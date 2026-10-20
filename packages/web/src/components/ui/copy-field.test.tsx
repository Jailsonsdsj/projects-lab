import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CopyField } from "./CopyField";

const writeText = vi.fn();

beforeEach(() => {
  document.documentElement.style.setProperty(
    "--duration-copied-hold",
    "2000ms",
  );
  writeText.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    value: { writeText },
    configurable: true,
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("CopyField", () => {
  it("shows its label and value, and copies the value", async () => {
    render(<CopyField label="Email" value="sam@example.com" />);
    expect(screen.getByText("Email")).toHaveClass("copy__label");
    expect(screen.getByText("sam@example.com")).toHaveClass("copy__value");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    });
    expect(writeText).toHaveBeenCalledWith("sam@example.com");
  });

  it("says Copied for --duration-copied-hold, then Copy again", async () => {
    vi.useFakeTimers();
    render(<CopyField label="Email" value="sam@example.com" />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    });
    const copied = screen.getByRole("button", { name: "Copied email" });
    expect(copied).toHaveClass("btn--copied");
    expect(copied).toHaveTextContent("Copied");
    expect(screen.getByText("Email copied")).toHaveAttribute(
      "aria-live",
      "polite",
    );
    act(() => vi.advanceTimersByTime(1999));
    expect(
      screen.getByRole("button", { name: "Copied email" }),
    ).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("button", { name: "Copy email" })).not.toHaveClass(
      "btn--copied",
    );
    expect(screen.queryByText("Email copied")).not.toBeInTheDocument();
  });

  it("puts a long value under its label, and a URL in mono", () => {
    const { container } = render(
      <>
        <CopyField label="Why this company?" value="Because…" long />
        <CopyField label="LinkedIn" value="https://linkedin.com/in/x" mono />
      </>,
    );
    const [long, link] = [...container.querySelectorAll(".copy")];
    expect(long).toHaveClass("copy--long");
    // The bundle's long layout: label, button, then the value full width.
    expect([...(long?.children ?? [])].map((el) => el.className)).toEqual([
      "copy__label",
      expect.stringContaining("copy__btn"),
      "copy__value",
      "sr-only",
    ]);
    expect(link?.querySelector(".copy__value")).toHaveClass("mono");
  });

  it("reports a clipboard that refuses, and stays on Copy", async () => {
    writeText.mockRejectedValue(new DOMException("denied", "NotAllowedError"));
    const failed = vi.fn();
    render(<CopyField label="Email" value="x" onCopyFailed={failed} />);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Copy email" }));
    });
    expect(failed).toHaveBeenCalledOnce();
    expect(
      screen.getByRole("button", { name: "Copy email" }),
    ).toBeInTheDocument();
  });
});
