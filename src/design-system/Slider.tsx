import React, { useId } from "react";

export interface SliderProps
  extends Omit<
    React.InputHTMLAttributes<HTMLInputElement>,
    "type" | "value" | "onChange" | "defaultValue"
  > {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  label?: React.ReactNode;
  showValue?: boolean;
  formatValue?: (v: number) => string;
  disabled?: boolean;
}

export function Slider(props: SliderProps) {
  const {
    value,
    onChange,
    min = 0,
    max = 100,
    step = 1,
    label,
    showValue = false,
    formatValue,
    disabled,
    className,
    id,
    ...rest
  } = props;

  const generatedId = useId();
  const inputId = id ?? generatedId;

  const range = max - min;
  const clamped = Math.min(max, Math.max(min, value));
  const percent = range > 0 ? ((clamped - min) / range) * 100 : 0;

  const rootClasses = [
    "ds-slider",
    disabled ? "ds-slider--disabled" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const display = formatValue ? formatValue(value) : String(value);
  const showHeader = label != null || showValue;

  return (
    <div className={rootClasses}>
      {showHeader && (
        <div className="ds-slider__header">
          {label != null ? (
            <label className="ds-slider__label" htmlFor={inputId}>
              {label}
            </label>
          ) : (
            <span />
          )}
          {showValue && (
            <span className="ds-slider__value">{display}</span>
          )}
        </div>
      )}
      <input
        {...rest}
        id={inputId}
        type="range"
        className="ds-slider__input"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        style={{ ["--ds-pct" as string]: `${percent}%` }}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </div>
  );
}
