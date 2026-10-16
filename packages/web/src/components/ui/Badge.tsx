import type { HTMLAttributes } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export type BadgeTone =
  | "neutral"
  | "accent"
  | "success"
  | "warning"
  | "danger"
  | "info"
  | "verified"
  | "declared"
  | "gap"
  | "todo"
  | "doing"
  | "done"
  | "p1"
  | "p2"
  | "p3";

/** Every semantic badge carries an icon, so meaning never rests on colour alone.
 *  Pairings are the bundle's own. */
export const BADGE_ICON: Partial<Record<BadgeTone, IconName>> = {
  success: "check",
  warning: "status-warning",
  danger: "status-danger",
  info: "status-info",
  verified: "check",
  declared: "pencil",
  gap: "circle-dashed",
  todo: "circle-dashed",
  doing: "circle-half",
  done: "status-done",
};

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone;
  size?: "sm" | "md";
  /** Tabular mono figures, for IDs and grades. */
  mono?: boolean;
}

export function Badge({
  tone = "neutral",
  size = "md",
  mono,
  className,
  children,
  ...rest
}: BadgeProps) {
  const icon = BADGE_ICON[tone];
  return (
    <span
      className={cx(
        "badge",
        tone !== "neutral" && `badge--${tone}`,
        size === "sm" && "badge--sm",
        mono && "badge--mono",
        className,
      )}
      {...rest}
    >
      {icon && <Icon name={icon} />}
      {children}
    </span>
  );
}
