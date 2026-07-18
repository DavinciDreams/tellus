import React, { useId } from "react";

export interface ToggleProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  size?: "sm" | "md";
  labelPosition?: "before" | "after";
}

export function Toggle(props: ToggleProps) {
  const {
    checked,
    onChange,
    label,
    size = "md",
    labelPosition = "after",
    className,
    disabled,
    id,
    ...rest
  } = props;

  const generatedId = useId();
  const inputId = id ?? generatedId;

  const rootClasses = [
    "ds-toggle",
    `ds-toggle--${size}`,
    disabled ? "ds-toggle--disabled" : "",
    `ds-toggle--label-${labelPosition}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const control = (
    <span className="ds-toggle__control">
      <input
        {...rest}
        id={inputId}
        type="checkbox"
        role="switch"
        className="ds-toggle__input"
        checked={checked}
        disabled={disabled}
        aria-checked={checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ds-toggle__track" aria-hidden="true">
        <span className="ds-toggle__thumb" />
      </span>
    </span>
  );

  if (label == null) {
    return <span className={rootClasses}>{control}</span>;
  }

  return (
    <label className={rootClasses} htmlFor={inputId}>
      {labelPosition === "before" && (
        <span className="ds-toggle__label">{label}</span>
      )}
      {control}
      {labelPosition === "after" && (
        <span className="ds-toggle__label">{label}</span>
      )}
    </label>
  );
}
