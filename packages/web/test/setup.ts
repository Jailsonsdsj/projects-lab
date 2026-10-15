import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterEach } from "vitest";
import { TEST_TIMEOUT_MS } from "../vitest.config";

configure({ asyncUtilTimeout: TEST_TIMEOUT_MS / 2 });

afterEach(() => {
  cleanup();
});

// ── Stand-ins for browser APIs jsdom lacks ────────────────────────────────
// Each follows the HTML spec closely enough for behaviour tests, and does no
// more: components own their logic (animated close, focus return, menu keys),
// so tests exercise that logic, not these stand-ins.

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

if (!HTMLDialogElement.prototype.showModal) {
  const openModals: HTMLDialogElement[] = [];

  HTMLDialogElement.prototype.showModal = function showModal() {
    this.setAttribute("open", "");
    openModals.push(this);
    // Dialog focusing steps: [autofocus], else the first focusable descendant.
    const target =
      this.querySelector<HTMLElement>("[autofocus]") ??
      this.querySelector<HTMLElement>(FOCUSABLE);
    target?.focus();
  };
  HTMLDialogElement.prototype.close = function close() {
    if (!this.hasAttribute("open")) return;
    this.removeAttribute("open");
    openModals.splice(openModals.indexOf(this), 1);
    this.dispatchEvent(new Event("close"));
  };
  Object.defineProperty(HTMLDialogElement.prototype, "open", {
    get(this: HTMLDialogElement) {
      return this.hasAttribute("open");
    },
    configurable: true,
  });

  // Escape on a modal fires a cancelable `cancel`; if nobody cancels it, close.
  document.addEventListener("keydown", (event) => {
    const top = openModals.at(-1);
    if (event.key !== "Escape" || !top) return;
    const cancel = new Event("cancel", { cancelable: true });
    if (top.dispatchEvent(cancel)) top.close();
  });
}

if (!HTMLElement.prototype.showPopover) {
  const isOpen = new WeakSet<HTMLElement>();
  // jsdom's UA sheet hides every [popover] and can't match :popover-open, so an
  // open popover is shown with an inline display, as the browser's UA sheet would.
  const toggle = (el: HTMLElement, newState: "open" | "closed") => {
    if (newState === "open") {
      isOpen.add(el);
      el.style.display = "block";
    } else {
      isOpen.delete(el);
      el.style.removeProperty("display");
    }
    const event = Object.assign(new Event("toggle"), {
      newState,
      oldState: newState === "open" ? "closed" : "open",
    });
    el.dispatchEvent(event);
  };

  HTMLElement.prototype.showPopover = function showPopover() {
    if (!isOpen.has(this)) toggle(this, "open");
  };
  HTMLElement.prototype.hidePopover = function hidePopover() {
    if (isOpen.has(this)) toggle(this, "closed");
  };
  HTMLElement.prototype.togglePopover = function togglePopover() {
    if (isOpen.has(this)) this.hidePopover();
    else this.showPopover();
    return isOpen.has(this);
  };

  // A popovertarget button toggles its popover when clicked.
  document.addEventListener("click", (event) => {
    const invoker = (event.target as Element | null)?.closest?.(
      "[popovertarget]",
    );
    const id = invoker?.getAttribute("popovertarget");
    const popover = id ? document.getElementById(id) : null;
    popover?.togglePopover();
  });
}

// jsdom has no matchMedia: report "no match", i.e. phone width. A test that
// needs tablet overrides it (vi.spyOn(window, "matchMedia")).
if (typeof window.matchMedia !== "function") {
  window.matchMedia = (media: string) =>
    ({
      matches: false,
      media,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}
