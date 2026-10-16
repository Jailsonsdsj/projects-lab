import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";
import { Button } from "./Button";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export interface OptionsMenuItem {
  label: string;
  icon?: IconName;
  onSelect: () => void;
  danger?: boolean;
  /** Stays focusable (aria-disabled) so it can say why, but does nothing. */
  disabled?: boolean;
}

export type OptionsMenuEntry = OptionsMenuItem | "separator";

export interface OptionsMenuProps {
  /** Names the trigger and the menu, e.g. "Options for FE-01". */
  label: string;
  /** Optional kicker above the items, e.g. "FE-01 · Next.js". */
  heading?: ReactNode;
  items: readonly OptionsMenuEntry[];
}

/**
 * A "more" button that opens a menu in the top layer (popover="auto": Escape
 * and outside clicks close it), anchored under the trigger with CSS anchor
 * positioning. Arrow keys move between items; focus returns to the trigger.
 */
function menuItems(menu: HTMLElement | null): HTMLButtonElement[] {
  return Array.from(
    menu?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]') ?? [],
  );
}

export function OptionsMenu({ label, heading, items }: OptionsMenuProps) {
  const reactId = useId();
  const menuId = `menu-${reactId.replace(/[^\w-]/g, "")}`;
  const anchor = `--${menuId}`;
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const onToggle = (event: Event) => {
      const isOpen =
        (event as Event & { newState?: string }).newState === "open";
      setOpen(isOpen);
      if (isOpen) {
        menuItems(menu)
          .find((b) => b.getAttribute("aria-disabled") !== "true")
          ?.focus();
      } else if (
        menu.contains(document.activeElement) ||
        document.activeElement === document.body
      ) {
        triggerRef.current?.focus();
      }
    };
    menu.addEventListener("toggle", onToggle);
    return () => menu.removeEventListener("toggle", onToggle);
  }, []);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const buttons = menuItems(menuRef.current);
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    const target =
      event.key === "ArrowDown"
        ? buttons[(index + 1) % buttons.length]
        : event.key === "ArrowUp"
          ? buttons[(index - 1 + buttons.length) % buttons.length]
          : event.key === "Home"
            ? buttons[0]
            : event.key === "End"
              ? buttons.at(-1)
              : undefined;
    if (event.key === "Escape") {
      event.preventDefault();
      menuRef.current?.hidePopover();
      return;
    }
    if (!target) return;
    event.preventDefault();
    target.focus();
  };

  const select = (item: OptionsMenuItem) => {
    if (item.disabled) return;
    menuRef.current?.hidePopover();
    item.onSelect();
  };

  return (
    <>
      <Button
        ref={triggerRef}
        variant="ghost"
        tone="neutral"
        iconOnly
        icon="more"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        popoverTarget={menuId}
        style={{ anchorName: anchor } as CSSProperties}
      />
      <div
        ref={menuRef}
        id={menuId}
        className="menu"
        role="menu"
        aria-label={label}
        popover="auto"
        onKeyDown={onKeyDown}
        style={{ positionAnchor: anchor } as CSSProperties}
      >
        {heading && <div className="menu__label kicker">{heading}</div>}
        {items.map((entry, i) => {
          if (entry !== "separator") {
            return (
              <button
                key={entry.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={cx(
                  "menu__item",
                  entry.danger && "menu__item--danger",
                  entry.disabled && "is-disabled",
                )}
                aria-disabled={entry.disabled || undefined}
                onClick={() => select(entry)}
              >
                {entry.icon && <Icon name={entry.icon} />}
                <span>{entry.label}</span>
              </button>
            );
          }
          // A separator is named by the item above it (labels are unique).
          const above = items[i - 1];
          const key = `sep-after-${typeof above === "object" ? above.label : "start"}`;
          return (
            // The bundle's markup: a div styled by .menu__sep, not an <hr>
            // (which brings its own border).
            // biome-ignore lint/a11y/useSemanticElements: matches the bundle, see above
            <div key={key} className="menu__sep" role="separator" />
          );
        })}
      </div>
    </>
  );
}
