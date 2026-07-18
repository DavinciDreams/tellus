import React from "react";
import type { HTMLAttributes, ReactNode } from "react";

export interface EmptyStateProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
  compact = false,
  className,
  ...rest
}: EmptyStateProps) {
  const classes = [
    "ds-empty",
    compact ? "ds-empty--compact" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classes} {...rest}>
      {icon !== undefined ? (
        <div className="ds-empty__icon" aria-hidden="true">
          {icon}
        </div>
      ) : null}

      <h3 className="ds-empty__title">{title}</h3>

      {description !== undefined ? (
        <p className="ds-empty__desc">{description}</p>
      ) : null}

      {action !== undefined ? (
        <div className="ds-empty__actions">{action}</div>
      ) : null}
    </div>
  );
}
