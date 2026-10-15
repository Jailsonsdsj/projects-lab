import type { ReactNode } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

interface StateBaseProps {
  title: ReactNode;
  children?: ReactNode;
  /** Buttons under the text. */
  actions?: ReactNode;
  className?: string;
}

export interface EmptyStateProps extends StateBaseProps {
  icon: IconName;
}

/** Nothing here yet: a real, successful answer that happens to be empty. */
export function EmptyState({ icon, ...rest }: EmptyStateProps) {
  return <StateBlock variant="empty" icon={icon} {...rest} />;
}

export interface ErrorStateProps extends StateBaseProps {
  /** `offline`: the read never reached the server; `error`: it failed. */
  kind?: "error" | "offline";
  icon?: IconName;
  /** Status and request id, for a bug report, e.g. "503 · req 7f3a-19c2". */
  code?: ReactNode;
}

/** A read that failed. Never rendered as "nothing here yet". */
export function ErrorState({
  kind = "error",
  icon,
  code,
  ...rest
}: ErrorStateProps) {
  return (
    <StateBlock
      variant={kind}
      icon={icon ?? (kind === "offline" ? "wifi-off" : "alert-circle")}
      code={code}
      {...rest}
    />
  );
}

function StateBlock({
  variant,
  icon,
  title,
  children,
  code,
  actions,
  className,
}: StateBaseProps & {
  variant: "empty" | "error" | "offline";
  icon: IconName;
  code?: ReactNode;
}) {
  return (
    <div
      className={cx(
        "empty",
        variant !== "empty" && `empty--${variant}`,
        className,
      )}
    >
      <span className="empty__icon">
        <Icon name={icon} />
      </span>
      <span className="empty__title">{title}</span>
      {children && <p className="empty__text">{children}</p>}
      {code && <span className="empty__code">{code}</span>}
      {actions && <div className="empty__actions">{actions}</div>}
    </div>
  );
}
