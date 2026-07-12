import React from "react";
import type { HTMLAttributes, ReactNode } from "react";

export interface CardProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  interactive?: boolean;
  media?: ReactNode;
  title?: ReactNode;
  headerActions?: ReactNode;
  footer?: ReactNode;
  padded?: boolean; // default true; false => flush body (padding 0)
  children: ReactNode;
}

export function Card({
  interactive = false,
  media,
  title,
  headerActions,
  footer,
  padded = true,
  className,
  children,
  onClick,
  onKeyDown,
  ...rest
}: CardProps) {
  const classes = [
    "ds-card",
    interactive ? "ds-card--interactive" : null,
    !padded ? "ds-card--flush" : null,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // Keyboard-focusable ONLY when the card is interactive AND actually clickable.
  const clickable = interactive && onClick != null;

  const handleKeyDown = clickable
    ? (event: React.KeyboardEvent<HTMLDivElement>) => {
        onKeyDown?.(event);
        if (event.defaultPrevented) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick?.(
            event as unknown as React.MouseEvent<HTMLDivElement>,
          );
        }
      }
    : onKeyDown;

  const showHeader = title !== undefined || headerActions !== undefined;

  return (
    <div
      className={classes}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      {...(clickable
        ? { role: "button", tabIndex: 0 }
        : null)}
      {...rest}
    >
      {media !== undefined ? (
        <div className="ds-card__media">{media}</div>
      ) : null}

      {showHeader ? (
        <div className="ds-card__header">
          {title !== undefined ? (
            <h3 className="ds-card__title">{title}</h3>
          ) : null}
          {headerActions !== undefined ? (
            <div className="ds-card__header-actions">{headerActions}</div>
          ) : null}
        </div>
      ) : null}

      <div className="ds-card__body">{children}</div>

      {footer !== undefined ? (
        <div className="ds-card__footer">{footer}</div>
      ) : null}
    </div>
  );
}
