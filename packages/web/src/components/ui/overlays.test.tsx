import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Button } from "./Button";
import { Dialog } from "./Dialog";
import { OptionsMenu } from "./OptionsMenu";
import { Sheet } from "./Sheet";
import { ToastProvider, useToast } from "./Toast";

// Tokens normally come from tokens.css; tests set the ones they exercise.
const setToken = (name: string, value: string) =>
  document.documentElement.style.setProperty(name, value);

afterEach(() => {
  document.documentElement.removeAttribute("style");
  vi.useRealTimers();
});

function DialogHarness({ onClose = () => {} }: { onClose?: () => void }) {
  const [open, setOpen] = useState(false);
  const close = () => {
    onClose();
    setOpen(false);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Log out
      </button>
      <Dialog
        open={open}
        onClose={close}
        title="Log out of Projects Lab?"
        icon="log-out"
        actions={
          <>
            <Button variant="outline" tone="neutral" onClick={close}>
              Cancel
            </Button>
            <Button tone="neutral">Confirm</Button>
          </>
        }
      >
        You'll need your passphrase to sign back in.
      </Dialog>
    </>
  );
}

describe("Dialog", () => {
  it("closes on Escape and returns focus to its opener", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<DialogHarness onClose={onClose} />);
    const opener = screen.getByRole("button", { name: "Log out" });

    await user.click(opener);
    const dialog = screen.getByRole("dialog", {
      name: "Log out of Projects Lab?",
    });
    expect(dialog).toHaveAttribute("open");
    expect(dialog).toHaveAccessibleDescription(
      "You'll need your passphrase to sign back in.",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus();

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledOnce();
    await waitFor(() => expect(dialog).not.toHaveAttribute("open"));
    expect(opener).toHaveFocus();
  });

  it("stays open with the exit animation for --duration-dialog-out, then closes", async () => {
    setToken("--duration-dialog-out", "150ms");
    vi.useFakeTimers();
    render(<DialogHarness />);
    const opener = screen.getByRole("button", { name: "Log out" });
    opener.focus(); // fireEvent.click doesn't move focus the way a real click does
    fireEvent.click(opener);
    const dialog = screen.getByRole("dialog", { hidden: true });

    fireEvent.click(
      screen.getByRole("button", { name: "Cancel", hidden: true }),
    );
    expect(dialog).toHaveClass("is-closing");
    expect(dialog).toHaveAttribute("open");
    act(() => vi.advanceTimersByTime(149));
    expect(dialog).toHaveAttribute("open");
    act(() => vi.advanceTimersByTime(1));
    expect(dialog).not.toHaveAttribute("open");
    expect(dialog).not.toHaveClass("is-closing");
    expect(opener).toHaveFocus();
  });
});

describe("Sheet", () => {
  it("is named by its title and closes from its Close button", async () => {
    const user = userEvent.setup();
    function Harness() {
      const [open, setOpen] = useState(true);
      return (
        <Sheet
          open={open}
          onClose={() => setOpen(false)}
          title="Filter backlog"
        >
          <p>Status</p>
        </Sheet>
      );
    }
    render(<Harness />);
    const sheet = screen.getByRole("dialog", { name: "Filter backlog" });
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(sheet).not.toHaveAttribute("open"));
  });
});

describe("OptionsMenu", () => {
  function Harness({ onCopy = () => {}, onRegen = () => {} }) {
    return (
      <OptionsMenu
        label="Options for FE-01"
        heading="FE-01 · Next.js"
        items={[
          { label: "Open course", icon: "book", onSelect: () => {} },
          { label: "Copy ID", icon: "copy", onSelect: onCopy },
          {
            label: "Regenerate",
            icon: "refresh",
            onSelect: onRegen,
            disabled: true,
          },
          "separator",
          { label: "Remove", icon: "trash", onSelect: () => {}, danger: true },
        ]}
      />
    );
  }

  it("opens on its trigger, focuses the first item and moves with arrows", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Options for FE-01" });
    expect(trigger).toHaveAttribute("aria-haspopup", "menu");
    expect(trigger).toHaveAttribute("aria-expanded", "false");

    await user.click(trigger);
    expect(trigger).toHaveAttribute("aria-expanded", "true");
    const items = screen.getAllByRole("menuitem");
    expect(items[0]).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[1]).toHaveFocus();
    await user.keyboard("{End}");
    expect(items.at(-1)).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(items[0]).toHaveFocus();
  });

  it("closes on Escape and gives focus back to the trigger", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "Options for FE-01" });
    await user.click(trigger);
    await user.keyboard("{Escape}");
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).toHaveFocus();
  });

  it("runs an item and closes; a disabled item does nothing", async () => {
    const user = userEvent.setup();
    const onCopy = vi.fn();
    const onRegen = vi.fn();
    render(<Harness onCopy={onCopy} onRegen={onRegen} />);
    const trigger = screen.getByRole("button", { name: "Options for FE-01" });

    await user.click(trigger);
    await user.click(screen.getByRole("menuitem", { name: "Regenerate" }));
    expect(onRegen).not.toHaveBeenCalled();
    expect(trigger).toHaveAttribute("aria-expanded", "true");

    await user.click(screen.getByRole("menuitem", { name: "Copy ID" }));
    expect(onCopy).toHaveBeenCalledOnce();
    expect(trigger).toHaveAttribute("aria-expanded", "false");
  });
});

describe("Toast", () => {
  function Shower({ action = false, tone = "success" as const }) {
    const toast = useToast();
    return (
      <button
        type="button"
        onClick={() =>
          toast.show({
            message: "Link copied",
            tone,
            action: action ? { label: "Undo", onClick: () => {} } : undefined,
          })
        }
      >
        Show
      </button>
    );
  }
  const renderToasts = (ui = <Shower />) =>
    render(<ToastProvider>{ui}</ToastProvider>);

  it("holds for --duration-toast-hold, then leaves for --duration-toast-out", () => {
    setToken("--duration-toast-hold", "1234ms");
    setToken("--duration-toast-out", "160ms");
    vi.useFakeTimers();
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    const toast = screen.getByRole("status");
    expect(toast).toHaveTextContent("Link copied");

    act(() => vi.advanceTimersByTime(1233));
    expect(toast).not.toHaveClass("is-leaving");
    act(() => vi.advanceTimersByTime(1));
    expect(toast).toHaveClass("is-leaving");
    act(() => vi.advanceTimersByTime(160));
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("holds a toast with an action for --duration-toast-hold-action", () => {
    setToken("--duration-toast-hold", "1000ms");
    setToken("--duration-toast-hold-action", "2s");
    vi.useFakeTimers();
    renderToasts(<Shower action />);
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    act(() => vi.advanceTimersByTime(1999));
    expect(screen.getByRole("status")).not.toHaveClass("is-leaving");
    act(() => vi.advanceTimersByTime(1));
    expect(screen.getByRole("status")).toHaveClass("is-leaving");
  });

  it("pauses while hovered and restarts the hold afterwards", () => {
    setToken("--duration-toast-hold", "1000ms");
    vi.useFakeTimers();
    renderToasts();
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    const toast = screen.getByRole("status");
    act(() => vi.advanceTimersByTime(900));
    fireEvent.mouseEnter(toast);
    act(() => vi.advanceTimersByTime(5000));
    expect(toast).not.toHaveClass("is-leaving");
    fireEvent.mouseLeave(toast);
    act(() => vi.advanceTimersByTime(999));
    expect(toast).not.toHaveClass("is-leaving");
    act(() => vi.advanceTimersByTime(1));
    expect(toast).toHaveClass("is-leaving");
  });

  it("announces danger as an alert and never auto-dismisses without its token", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.useFakeTimers();
    renderToasts(<Shower tone={"danger" as never} />);
    fireEvent.click(screen.getByRole("button", { name: "Show" }));
    act(() => vi.advanceTimersByTime(60_000));
    expect(screen.getByRole("alert")).not.toHaveClass("is-leaving");
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("--duration-toast-hold"),
    );
    warn.mockRestore();
  });
});
