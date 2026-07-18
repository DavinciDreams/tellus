import React, { createContext, useContext, useId } from "react";

interface RadioContextValue {
  value: string;
  onChange: (value: string) => void;
  name: string;
}

const RadioContext = createContext<RadioContextValue | null>(null);

export interface RadioGroupProps {
  value: string;
  onChange: (value: string) => void;
  name?: string;
  "aria-label": string;
  orientation?: "vertical" | "horizontal";
  children: React.ReactNode;
}

export interface RadioProps {
  value: string;
  label?: React.ReactNode;
  disabled?: boolean;
}

export function RadioGroup(props: RadioGroupProps) {
  const {
    value,
    onChange,
    name,
    orientation = "vertical",
    children,
  } = props;

  const generatedName = useId();
  const groupName = name ?? generatedName;

  const ctx: RadioContextValue = { value, onChange, name: groupName };

  return (
    <RadioContext.Provider value={ctx}>
      <div
        className={`ds-radiogroup ds-radiogroup--${orientation}`}
        role="radiogroup"
        aria-label={props["aria-label"]}
        aria-orientation={orientation}
      >
        {children}
      </div>
    </RadioContext.Provider>
  );
}

export function Radio(props: RadioProps) {
  const { value, label, disabled = false } = props;

  const ctx = useContext(RadioContext);
  if (ctx === null) {
    throw new Error("Radio must be used within a RadioGroup.");
  }

  const inputId = useId();
  const checked = ctx.value === value;

  const rootClasses = ["ds-radio", disabled ? "ds-radio--disabled" : ""]
    .filter(Boolean)
    .join(" ");

  return (
    <label className={rootClasses} htmlFor={inputId}>
      <input
        id={inputId}
        className="ds-radio__input"
        type="radio"
        name={ctx.name}
        value={value}
        checked={checked}
        disabled={disabled}
        onChange={() => ctx.onChange(value)}
      />
      <span className="ds-radio__dot" aria-hidden="true" />
      {label != null && <span className="ds-radio__label">{label}</span>}
    </label>
  );
}
