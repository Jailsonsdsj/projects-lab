import type { ButtonHTMLAttributes, Ref } from "react";
import { cx } from "./cx";

export interface ChipProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-pressed"> {
  /** A filter chip is a toggle: its state is aria-pressed. */
  pressed: boolean;
  /** Trailing count in mono (`.chip__count`). */
  count?: number;
  ref?: Ref<HTMLButtonElement>;
}

export function Chip({
  pressed,
  count,
  type = "button",
  className,
  children,
  ...rest
}: ChipProps) {
  return (
    <button
      type={type}
      className={cx("chip", className)}
      aria-pressed={pressed}
      {...rest}
    >
      {children}
      {/* The bundle's markup has a space here; it keeps "Not started 6" readable to screen readers. */}
      {count !== undefined && (
        <>
          {" "}
          <span className="chip__count">{count}</span>
        </>
      )}
    </button>
  );
}
