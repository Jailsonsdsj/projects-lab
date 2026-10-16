import {
  type InputHTMLAttributes,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useRef,
} from "react";
import { cx } from "./cx";

export interface CheckboxProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, "type"> {
  /** The label; the whole row (--size-touch tall) is the hit area. */
  children: ReactNode;
  /** Neither checked nor unchecked, e.g. "some selected". */
  mixed?: boolean;
  invalid?: boolean;
  ref?: Ref<HTMLInputElement>;
}

export function Checkbox({
  children,
  mixed = false,
  invalid,
  disabled,
  className,
  ref,
  ...rest
}: CheckboxProps) {
  const inner = useRef<HTMLInputElement | null>(null);

  // `indeterminate` exists only as a DOM property, never as an attribute.
  useEffect(() => {
    if (inner.current) inner.current.indeterminate = mixed;
  }, [mixed]);

  const setRef = useCallback(
    (node: HTMLInputElement | null) => {
      inner.current = node;
      if (typeof ref === "function") ref(node);
      else if (ref) ref.current = node;
    },
    [ref],
  );

  return (
    <label
      className={cx(
        "check",
        invalid && "is-invalid",
        disabled && "is-disabled",
        className,
      )}
    >
      <input
        ref={setRef}
        type="checkbox"
        className={mixed ? "is-mixed" : undefined}
        aria-checked={mixed ? "mixed" : undefined}
        aria-invalid={invalid || undefined}
        disabled={disabled}
        {...rest}
      />
      {children}
    </label>
  );
}
