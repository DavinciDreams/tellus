import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "gold" | "success" | "warn" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone; // default "neutral"
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  className,
  children,
  ...rest
}: BadgeProps) {
  const classes = ["ds-badge", `ds-badge--${tone}`, className]
    .filter(Boolean)
    .join(" ");
  return (
    <span className={classes} {...rest}>
      {children}
    </span>
  );
}
