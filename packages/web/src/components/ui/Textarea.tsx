import type { ReactNode, Ref, TextareaHTMLAttributes } from "react";
import { cx } from "./cx";
import { Field } from "./Field";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  ref?: Ref<HTMLTextAreaElement>;
}

export function Textarea({
  label,
  hint,
  error,
  optional,
  id,
  required,
  disabled,
  className,
  rows = 4,
  ...rest
}: TextareaProps) {
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
            "input--multiline",
            control.invalid && "is-invalid",
            disabled && "is-disabled",
          )}
        >
          <textarea
            id={control.id}
            rows={rows}
            required={required}
            disabled={disabled}
            aria-invalid={control.invalid || undefined}
            aria-describedby={control.describedBy}
            {...rest}
          />
        </div>
      )}
    </Field>
  );
}
