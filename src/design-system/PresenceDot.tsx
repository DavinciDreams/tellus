import React from "react";
import type { HTMLAttributes } from "react";

export type PresenceStatus = "online" | "idle" | "busy" | "offline" | "error";
export type PresenceSize = "sm" | "md";

export interface PresenceDotProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  status: PresenceStatus;
  size?: PresenceSize; // default "sm"
  label?: string; // accessible name / visible text (default: humanized status)
  showLabel?: boolean; // render the text label beside the dot, default false
}

const STATUS_LABELS: Record<PresenceStatus, string> = {
  online: "Online",
  idle: "Idle",
  busy: "Busy",
  offline: "Offline",
  error: "Error",
};

function humanize(status: PresenceStatus): string {
  return STATUS_LABELS[status];
}

export function PresenceDot({
  status,
  size = "sm",
  label,
  showLabel = false,
  ...rest
}: PresenceDotProps) {
  const accessibleName = label ?? humanize(status);
  const rootClassName = `ds-presence ds-presence--${status} ds-presence--${size}`;

  // When the label is not rendered visibly, the status must still carry an
  // accessible text name (never color-only). role="img" + aria-label supplies it.
  // When the label IS visible, that text is the accessible name and the root
  // needs no role/aria-label.
  const a11yProps = showLabel
    ? {}
    : { role: "img" as const, "aria-label": accessibleName };

  return (
    <span className={rootClassName} {...a11yProps} {...rest}>
      <span className="ds-presence__dot" aria-hidden="true" />
      {showLabel ? (
        <span className="ds-presence__label">{accessibleName}</span>
      ) : null}
    </span>
  );
}
