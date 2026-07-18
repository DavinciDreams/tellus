import React from "react";
import type { HTMLAttributes } from "react";

export type AvatarKind = "human" | "agent";
export type AvatarSize = "sm" | "md" | "lg" | "xl";
export type AvatarStatus = "online" | "idle" | "busy" | "offline";

export interface AvatarProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  name?: string;
  src?: string;
  kind?: AvatarKind; // default "human"
  size?: AvatarSize; // default "md"
  status?: AvatarStatus;
}

const STATUS_LABELS: Record<AvatarStatus, string> = {
  online: "online",
  idle: "idle",
  busy: "busy",
  offline: "offline",
};

// First 1–2 initials of a name (capital letters, not tracked-uppercase).
function initialsOf(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "";
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function Avatar({
  name,
  src,
  kind = "human",
  size = "md",
  status,
  className,
  ...rest
}: AvatarProps) {
  const rootClassName = [
    "ds-avatar",
    `ds-avatar--${size}`,
    `ds-avatar--${kind}`,
    className,
  ]
    .filter(Boolean)
    .join(" ");

  // The span carries the whole accessible name. Fold the status into the label
  // so presence is never conveyed by the dot's color alone (e.g. "Omega, online").
  const person = name && name.trim().length > 0 ? name.trim() : "Avatar";
  const ariaLabel = status ? `${person}, ${STATUS_LABELS[status]}` : person;

  return (
    <span
      className={rootClassName}
      role="img"
      aria-label={ariaLabel}
      {...rest}
    >
      {src ? (
        // alt is empty: the parent span already supplies the accessible name.
        <img className="ds-avatar__img" src={src} alt="" />
      ) : (
        <span className="ds-avatar__initials" aria-hidden="true">
          {kind === "agent" ? "✦" : initialsOf(person)}
        </span>
      )}
      {status ? (
        <span
          className={`ds-avatar__status ds-avatar__status--${status}`}
          aria-hidden="true"
        />
      ) : null}
    </span>
  );
}
