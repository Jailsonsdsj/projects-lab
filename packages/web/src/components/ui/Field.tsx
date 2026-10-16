import { type ReactNode, useId } from "react";
import { cx } from "./cx";
import { Icon } from "./Icon";

/** What a Field hands its control so the label, hint and error stay wired to it. */
export interface FieldControl {
  id: string;
  invalid: boolean;
  describedBy: string | undefined;
}

export interface FieldProps {
  label: ReactNode;
  hint?: ReactNode;
  /** Shown under the control and announced through aria-describedby. */
  error?: ReactNode;
  required?: boolean;
  optional?: boolean;
  disabled?: boolean;
  /** The control's id. Without one, a generated id still links the label. */
  id?: string;
  className?: string;
  children: (control: FieldControl) => ReactNode;
}

/**
 * Label, hint and error around one control (`.field`). The control is always the
 * same element in the same place, so a hint or an error appearing after it
 * never remounts it and never steals focus.
 */
export function Field({
  label,
  hint,
  error,
  required,
  optional,
  disabled,
  id,
  className,
  children,
}: FieldProps) {
  const generated = useId();
  const controlId = id ?? generated;
  const hintId = `${controlId}-hint`;
  const errorId = `${controlId}-error`;
  const invalid = Boolean(error);
  const describedBy =
    [hint ? hintId : null, invalid ? errorId : null]
      .filter(Boolean)
      .join(" ") || undefined;

  return (
    <div className={cx("field", disabled && "is-disabled", className)}>
      <label className="field__label" htmlFor={controlId}>
        {label}
        {required && (
          <span className="field__req" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="field__opt">optional</span>}
      </label>
      {children({ id: controlId, invalid, describedBy })}
      {hint && (
        <span className="field__hint" id={hintId}>
          {hint}
        </span>
      )}
      {invalid && (
        <span className="field__error" id={errorId}>
          <Icon name="alert-circle" />
          {error}
        </span>
      )}
    </div>
  );
}
