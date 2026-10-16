import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export type BannerTone = "info" | "warning" | "danger" | "offline";

const BANNER_ICON: Record<BannerTone, IconName> = {
  info: "info",
  warning: "warning",
  danger: "alert-circle",
  offline: "wifi-off",
};

export interface BannerProps {
  tone?: BannerTone;
  /** The bold lead, e.g. "Session expired." */
  title?: ReactNode;
  children?: ReactNode;
  /** Edge to edge, without rounded corners or side borders. */
  flush?: boolean;
  /** A trailing button, e.g. Retry. */
  action?: ReactNode;
  className?: string;
}

/** Inline notice (`.banner`). Warning and danger interrupt (`role=alert`);
 *  info and offline wait their turn (`role=status`). */
export function Banner({
  tone = "info",
  title,
  children,
  flush,
  action,
  className,
}: BannerProps) {
  return (
    <div
      className={cx(
        "banner",
        tone !== "info" && `banner--${tone}`,
        flush && "banner--flush",
        className,
      )}
      role={tone === "warning" || tone === "danger" ? "alert" : "status"}
    >
      <Icon name={BANNER_ICON[tone]} />
      <span className="banner__text">
        {title && <strong>{title}</strong>}
        {title && children && " "}
        {children}
      </span>
      {action}
    </div>
  );
}
