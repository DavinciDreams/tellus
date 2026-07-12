import React from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

export interface ButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className"> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  loading?: boolean;
  selected?: boolean;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  children: ReactNode;
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  selected = false,
  leadingIcon,
  trailingIcon,
  children,
  type,
  disabled,
  ...rest
}: ButtonProps) {
  const classes = [
    "ds-btn",
    `ds-btn--${variant}`,
    `ds-btn--${size}`,
    loading ? "ds-btn--loading" : null,
    selected ? "ds-btn--selected" : null,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={classes}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      aria-pressed={selected ? true : undefined}
    >
      {leadingIcon ? (
        <span className="ds-btn__icon" aria-hidden="true">
          {leadingIcon}
        </span>
      ) : null}
      <span className="ds-btn__label">{children}</span>
      {trailingIcon ? (
        <span className="ds-btn__icon" aria-hidden="true">
          {trailingIcon}
        </span>
      ) : null}
      {loading ? <span className="ds-btn__spinner" aria-hidden="true" /> : null}
    </button>
  );
}
