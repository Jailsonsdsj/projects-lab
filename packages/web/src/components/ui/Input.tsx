import type { InputHTMLAttributes, ReactNode, Ref } from "react";
import { cx } from "./cx";
import { Field } from "./Field";
import { Icon } from "./Icon";
import type { IconName } from "./icons";

export interface InputProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "size"> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Leading icon inside the box, e.g. `search`. */
  icon?: IconName;
  /** The pill-shaped search box (`.input--search`). */
  search?: boolean;
  /** A trailing button inside the box, such as "show passphrase" or "clear". */
  action?: ReactNode;
  /** In React 19 `ref` is a plain prop; only its type needs declaring. */
  ref?: Ref<HTMLInputElement>;
}

export function Input({
  label,
  hint,
  error,
  optional,
  icon,
  search,
  action,
  id,
  required,
  disabled,
  className,
  ...rest
}: InputProps) {
  return (
    <Field
      label={label}
      hint={hint}
      error={error}
      required={required}
      optional={optional}
      disabled={disabled}
      id={id}
      className={className}
    >
      {(control) => (
        <div
          className={cx(
            "input",
            search && "input--search",
            control.invalid && "is-invalid",
            disabled && "is-disabled",
          )}
        >
          {icon && <Icon name={icon} className="input__icon" />}
          <input
            id={control.id}
            required={required}
            disabled={disabled}
            aria-invalid={control.invalid || undefined}
            aria-describedby={control.describedBy}
            {...rest}
          />
          {action}
        </div>
      )}
    </Field>
  );
}
