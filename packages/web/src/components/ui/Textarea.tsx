import {
  type ReactNode,
  type Ref,
  type TextareaHTMLAttributes,
  useCallback,
  useLayoutEffect,
  useRef,
} from "react";
import { cx } from "./cx";
import { Field } from "./Field";

export interface TextareaProps
  extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label: ReactNode;
  hint?: ReactNode;
  error?: ReactNode;
  optional?: boolean;
  /** Long answers: taller by dragging its corner where the browser offers one,
   *  and it grows to fit what's typed (phones have no handle). Never shrinks
   *  below `rows`, never fights a height the reader dragged it to. */
  resizable?: boolean;
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
  resizable = false,
  ref,
  ...rest
}: TextareaProps) {
  const own = useRef<HTMLTextAreaElement | null>(null);
  const setRef = useCallback(
    (node: HTMLTextAreaElement | null) => {
      own.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  // Grow only: after each render (a keystroke is one), when what's typed
  // overflows, the box takes its full height. One measurement, no deps.
  useLayoutEffect(() => {
    const el = own.current;
    if (!resizable || !el) return;
    if (el.scrollHeight > el.clientHeight)
      el.style.height = `${el.scrollHeight}px`;
  });

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
            resizable && "input--resizable",
            control.invalid && "is-invalid",
            disabled && "is-disabled",
          )}
        >
          <textarea
            ref={setRef}
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
