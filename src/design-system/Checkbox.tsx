import React, { useEffect, useRef } from "react";

export interface CheckboxProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, "type" | "size" | "onChange"> {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label?: React.ReactNode;
  indeterminate?: boolean;
}

export function Checkbox(props: CheckboxProps) {
  const {
    checked,
    onChange,
    label,
    indeterminate = false,
    className,
    disabled,
    ...rest
  } = props;

  const inputRef = useRef<HTMLInputElement>(null);

  // `indeterminate` is a DOM property, not an attribute — set it via ref.
  useEffect(() => {
    if (inputRef.current) {
      inputRef.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  const rootClasses = [
    "ds-checkbox",
    checked ? "ds-checkbox--checked" : "",
    indeterminate ? "ds-checkbox--indeterminate" : "",
    disabled ? "ds-checkbox--disabled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={rootClasses}>
      <input
        {...rest}
        ref={inputRef}
        type="checkbox"
        className="ds-checkbox__input"
        checked={checked}
        disabled={disabled}
        aria-checked={indeterminate ? "mixed" : checked}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span className="ds-checkbox__box" aria-hidden="true">
        <svg
          className="ds-checkbox__check"
          viewBox="0 0 16 16"
          width="16"
          height="16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="ds-checkbox__check-mark"
            d="M3.5 8.5L6.5 11.5L12.5 5"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path
            className="ds-checkbox__dash-mark"
            d="M4 8H12"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
          />
        </svg>
      </span>
      {label != null && <span className="ds-checkbox__label">{label}</span>}
    </label>
  );
}
