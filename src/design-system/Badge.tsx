import type { HTMLAttributes, ReactNode } from "react";

export type BadgeTone = "neutral" | "gold" | "success" | "warn" | "danger";

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  tone?: BadgeTone; // default "neutral"
  children: ReactNode;
}

export function Badge({
  tone = "neutral",
  children,
  ...rest
}: BadgeProps) {
  return (
    <span className={`ds-badge ds-badge--${tone}`} {...rest}>
      {children}
    </span>
  );
}
