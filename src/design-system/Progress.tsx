import React from "react";
import type { HTMLAttributes, ReactNode, CSSProperties } from "react";

export type ProgressTone = "gold" | "success" | "warn" | "danger" | "info";

export interface ProgressProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "role"> {
  value?: number;
  max?: number;
  tone?: ProgressTone;
  label?: ReactNode;
  showValue?: boolean;
  size?: "sm" | "md";
}

export function Progress(props: ProgressProps) {
  const {
    value,
    max = 100,
    tone = "gold",
    label,
    showValue = false,
    size = "md",
    className,
    ...rest
  } = props;

  const indeterminate = value === undefined;
  const safeMax = max > 0 ? max : 100;
  const clamped = indeterminate
    ? 0
    : Math.min(safeMax, Math.max(0, value as number));
  const pct = indeterminate ? 0 : (clamped / safeMax) * 100;

  const rootClasses = [
    "ds-progress",
    `ds-progress--${tone}`,
    `ds-progress--${size}`,
    indeterminate ? "ds-progress--indeterminate" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const showHeaderRow = label != null || (!indeterminate && showValue);

  const ariaLabel =
    typeof label === "string" ? label : undefined;

  const fillStyle: CSSProperties | undefined = indeterminate
    ? undefined
    : { width: `${pct}%` };

  const valueText = !indeterminate
    ? `${Math.round(clamped)}${safeMax === 100 ? "%" : ` / ${safeMax}`}`
    : "";

  return (
    <div
      {...rest}
      className={rootClasses}
      role="progressbar"
      aria-label={ariaLabel}
      aria-valuemin={0}
      aria-valuemax={safeMax}
      aria-valuenow={indeterminate ? undefined : clamped}
    >
      {showHeaderRow && (
        <div className="ds-progress__header">
          {label != null ? (
            <span className="ds-progress__label">{label}</span>
          ) : (
            <span />
          )}
          {!indeterminate && showValue && (
            <span className="ds-progress__value">{valueText}</span>
          )}
        </div>
      )}
      <div className="ds-progress__track">
        <div className="ds-progress__fill" style={fillStyle} />
      </div>
    </div>
  );
}

export interface SpinnerProps extends HTMLAttributes<HTMLSpanElement> {
  size?: "sm" | "md" | "lg";
  label?: string;
}

export function Spinner(props: SpinnerProps) {
  const { size = "md", label, className, ...rest } = props;

  const classes = [
    "ds-spinner",
    `ds-spinner--${size}`,
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <span
      {...rest}
      className={classes}
      role="status"
      aria-label={label ?? "Loading"}
    />
  );
}
