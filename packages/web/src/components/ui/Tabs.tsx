import { type KeyboardEvent, type ReactNode, useRef } from "react";
import { cx } from "./cx";

export interface TabItem<Id extends string = string> {
  id: Id;
  label: ReactNode;
  count?: number;
  disabled?: boolean;
}

export interface TabsProps<Id extends string = string> {
  /** Names the tablist for assistive tech, e.g. "Filter by status". */
  label: string;
  items: readonly TabItem<Id>[];
  value: Id;
  onChange: (id: Id) => void;
  className?: string;
}

/**
 * The ARIA tabs pattern: one tab stop (the selected tab); Left/Right move and
 * select, Home/End jump to the ends, disabled tabs are skipped.
 */
export function Tabs<Id extends string = string>({
  label,
  items,
  value,
  onChange,
  className,
}: TabsProps<Id>) {
  const refs = useRef(new Map<Id, HTMLButtonElement>());

  const move = (from: number, step: 1 | -1) => {
    for (let i = 1; i <= items.length; i++) {
      const next = items[(from + step * i + items.length) % items.length];
      if (next && !next.disabled) return next;
    }
    return undefined;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = items.findIndex((item) => item.id === value);
    const enabled = items.filter((item) => !item.disabled);
    const target =
      event.key === "ArrowRight"
        ? move(current, 1)
        : event.key === "ArrowLeft"
          ? move(current, -1)
          : event.key === "Home"
            ? enabled[0]
            : event.key === "End"
              ? enabled.at(-1)
              : undefined;
    if (!target) return;
    event.preventDefault();
    onChange(target.id);
    refs.current.get(target.id)?.focus();
  };

  return (
    <div
      className={cx("tabs", className)}
      role="tablist"
      aria-label={label}
      onKeyDown={onKeyDown}
    >
      {items.map((item) => {
        const selected = item.id === value;
        return (
          <button
            key={item.id}
            ref={(node) => {
              if (node) refs.current.set(item.id, node);
              else refs.current.delete(item.id);
            }}
            className="tab"
            role="tab"
            type="button"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            disabled={item.disabled}
            onClick={() => onChange(item.id)}
          >
            {item.label}
            {item.count !== undefined && (
              <>
                {" "}
                <span className="tab__count">{item.count}</span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
