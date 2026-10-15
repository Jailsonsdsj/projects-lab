import type { ButtonHTMLAttributes, MouseEvent, Ref } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export type ButtonVariant = "solid" | "soft" | "outline" | "ghost";
export type ButtonTone = "accent" | "neutral" | "danger";
export type ButtonSize = "sm" | "md" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** `accent` follows the current lab (`--color-lab-accent`). */
  tone?: ButtonTone;
  size?: ButtonSize;
  /** Full width. */
  block?: boolean;
  /** Leading icon, or the whole content with `iconOnly` (then `aria-label` names it). */
  icon?: IconName;
  iconOnly?: boolean;
  /** Shows a spinner, sets aria-busy and ignores clicks without looking disabled. */
  loading?: boolean;
  ref?: Ref<HTMLButtonElement>;
}

export function Button({
  variant = "solid",
  tone = "accent",
  size = "md",
  block,
  icon,
  iconOnly,
  loading,
  type = "button",
  className,
  children,
  onClick,
  ...rest
}: ButtonProps) {
  const handleClick = (event: MouseEvent<HTMLButtonElement>) => {
    if (loading) {
      event.preventDefault();
      return;
    }
    onClick?.(event);
  };

  return (
    <button
      type={type}
      className={cx(
        "btn",
        variant !== "solid" && `btn--${variant}`,
        tone !== "accent" && `btn--${tone}`,
        size !== "md" && `btn--${size}`,
        block && "btn--block",
        iconOnly && "btn--icon",
        loading && "is-loading",
        className,
      )}
      aria-busy={loading || undefined}
      onClick={handleClick}
      {...rest}
    >
      {loading ? (
        <span className="spinner" aria-hidden="true" />
      ) : (
        icon && <Icon name={icon} />
      )}
      {!iconOnly && children}
    </button>
  );
}
