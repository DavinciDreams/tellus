import React from "react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

export type IconButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type IconButtonSize = "sm" | "md";
export type IconButtonShape = "square" | "round";

export interface IconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, "className" | "aria-label"> {
  "aria-label": string;          // REQUIRED, non-optional (typed)
  icon: ReactNode;
  variant?: IconButtonVariant;   // default "secondary"
  size?: IconButtonSize;         // default "md"
  shape?: IconButtonShape;       // default "square"
  loading?: boolean;
  selected?: boolean;            // aria-pressed
}

export function IconButton({
  icon,
  variant = "secondary",
  size = "md",
  shape = "square",
  loading = false,
  selected = false,
  disabled = false,
  type,
  ...rest
}: IconButtonProps): React.JSX.Element {
  const isDisabled = disabled || loading;

  const className = [
    "ds-iconbtn",
    `ds-iconbtn--${variant}`,
    `ds-iconbtn--${size}`,
    `ds-iconbtn--${shape}`,
    selected ? "ds-iconbtn--selected" : "",
    loading ? "ds-iconbtn--loading" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <button
      {...rest}
      type={type ?? "button"}
      className={className}
      disabled={isDisabled}
      aria-busy={loading || undefined}
      aria-pressed={selected || undefined}
    >
      <span className="ds-iconbtn__icon" aria-hidden="true">
        {icon}
      </span>
    </button>
  );
}
