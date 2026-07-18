import React, { useId } from "react";
import type { ReactNode } from "react";

export interface NumberStepperProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: ReactNode;
  suffix?: ReactNode;
  disabled?: boolean;
  id?: string;
  className?: string;
}

function clamp(value: number, min?: number, max?: number): number {
  let next = value;
  if (min !== undefined && next < min) next = min;
  if (max !== undefined && next > max) next = max;
  return next;
}

export function NumberStepper({
  value,
  onChange,
  min,
  max,
  step = 1,
  label,
  suffix,
  disabled = false,
  id,
  className,
}: NumberStepperProps): React.JSX.Element {
  const reactId = useId();
  const inputId = id ?? reactId;

  const atMin = min !== undefined && value <= min;
  const atMax = max !== undefined && value >= max;

  const rootClassName = [
    "ds-stepper",
    disabled ? "ds-stepper--disabled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const decrement = (): void => {
    if (disabled) return;
    onChange(clamp(value - step, min, max));
  };

  const increment = (): void => {
    if (disabled) return;
    onChange(clamp(value + step, min, max));
  };

  const handleInput = (event: React.ChangeEvent<HTMLInputElement>): void => {
    const parsed = Number(event.target.value);
    if (Number.isNaN(parsed)) return;
    onChange(clamp(parsed, min, max));
  };

  return (
    <div className={rootClassName}>
      {label !== undefined && label !== null && label !== false ? (
        <label htmlFor={inputId} className="ds-stepper__label">
          {label}
        </label>
      ) : null}
      <div className="ds-stepper__control">
        <button
          type="button"
          className="ds-stepper__btn ds-stepper__btn--minus"
          aria-label="Decrease"
          disabled={disabled || atMin}
          onClick={decrement}
        >
          −
        </button>
        <input
          id={inputId}
          type="number"
          className="ds-stepper__input"
          value={value}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          aria-valuemin={min}
          aria-valuemax={max}
          aria-valuenow={value}
          onChange={handleInput}
        />
        {suffix !== undefined && suffix !== null && suffix !== false ? (
          <span className="ds-stepper__suffix" aria-hidden="true">
            {suffix}
          </span>
        ) : null}
        <button
          type="button"
          className="ds-stepper__btn ds-stepper__btn--plus"
          aria-label="Increase"
          disabled={disabled || atMax}
          onClick={increment}
        >
          +
        </button>
      </div>
    </div>
  );
}
