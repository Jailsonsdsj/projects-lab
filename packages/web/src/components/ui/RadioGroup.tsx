// One choice among a few (ST-13e2: an exam's MC answers, a statement's True or
// False). A native radio group in a fieldset, so arrows move and the legend
// names it; each option is a --size-touch row. Styles in app-components.css
// (.radio), drawn like Checkbox's box but round.
import type { ReactNode } from "react";
import { cx } from "./cx";

export interface RadioOption<Value extends string> {
  value: Value;
  label: ReactNode;
}

export interface RadioGroupProps<Value extends string> {
  /** The question or statement: the fieldset's legend. */
  label: ReactNode;
  /** Groups the radios; unique on the page. */
  name: string;
  value: Value | null;
  options: readonly RadioOption<Value>[];
  onChange: (value: Value) => void;
  /** Side by side (True · False) instead of one per row. */
  inline?: boolean;
  /** The legend for assistive tech only, when the question is shown above. */
  hideLabel?: boolean;
  disabled?: boolean;
  className?: string;
}

export function RadioGroup<Value extends string>({
  label,
  name,
  value,
  options,
  onChange,
  inline = false,
  hideLabel = false,
  disabled,
  className,
}: RadioGroupProps<Value>) {
  return (
    <fieldset
      className={cx("radio-group", inline && "radio-group--inline", className)}
      disabled={disabled}
    >
      <legend className={hideLabel ? "sr-only" : "radio-group__legend"}>
        {label}
      </legend>
      {options.map((option) => (
        <label
          key={option.value}
          className={cx("radio", disabled && "is-disabled")}
        >
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={value === option.value}
            onChange={() => onChange(option.value)}
          />
          <span className="min-w-0">{option.label}</span>
        </label>
      ))}
    </fieldset>
  );
}
