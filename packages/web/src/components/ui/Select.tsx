import { Field } from "./Field";
import { Icon } from "./Icon";

/**
 * A labelled native <select>: a Field around the bundle's .input with its
 * chevron. The bundle's tablet listbox is drawn as a custom popover; the native
 * control gives the same choice with the platform's own picker (and its
 * accessibility) on iPhone and iPad.
 */
export function Select<V extends string | number>({
  label,
  value,
  options,
  onChange,
  disabled,
  error,
}: {
  label: string;
  value: V;
  options: [V, string][];
  onChange: (value: V) => void;
  disabled?: boolean;
  error?: string;
}) {
  return (
    <Field label={label} disabled={disabled} error={error}>
      {(control) => (
        <div className="input">
          <select
            id={control.id}
            aria-describedby={control.describedBy}
            aria-invalid={control.invalid || undefined}
            value={String(value)}
            disabled={disabled}
            onChange={(event) => {
              const picked = options.find(
                ([option]) => String(option) === event.target.value,
              );
              if (picked) onChange(picked[0]);
            }}
          >
            {options.map(([option, text]) => (
              <option key={String(option)} value={String(option)}>
                {text}
              </option>
            ))}
          </select>
          <Icon name="chevron-down" className="input__chev" />
        </div>
      )}
    </Field>
  );
}
