import React from "react";
import type { ReactNode } from "react";
import { PresenceDot } from "./PresenceDot";
import { Badge } from "./Badge";

export type PresenceKind = "human" | "agent";

export type PresenceStatus =
  | "online"
  | "idle"
  | "busy"
  | "offline"
  | "error";

export interface PresenceBeing {
  id: string;
  name: string;
  kind: PresenceKind;
  status: PresenceStatus;
  activity?: string;
}

export interface PresenceRosterProps {
  beings: PresenceBeing[];
  title?: ReactNode;
  onSelect?: (id: string) => void;
  className?: string;
}

export function PresenceRoster({
  beings,
  title = "Here now",
  onSelect,
  className,
}: PresenceRosterProps): React.JSX.Element {
  const rootClassName = className
    ? `ds-roster ${className}`
    : "ds-roster";

  return (
    <section className={rootClassName}>
      <header className="ds-roster__head">
        <span className="ds-roster__title">{title}</span>
        <span className="ds-roster__count">{beings.length}</span>
      </header>
      <ul className="ds-roster__list" role="list">
        {beings.map((being) => {
          const isAgent = being.kind === "agent";
          const avatar = (
            <span
              className={`ds-roster__avatar ds-roster__avatar--${being.kind}`}
              aria-hidden="true"
            >
              {isAgent ? "✦" : being.name.charAt(0).toUpperCase()}
            </span>
          );
          const who = (
            <span className="ds-roster__who">
              <span className="ds-roster__name">{being.name}</span>
              {being.activity ? (
                <span className="ds-roster__activity">{being.activity}</span>
              ) : null}
            </span>
          );
          const badge = isAgent ? <Badge tone="gold">agent</Badge> : null;
          const dot = <PresenceDot status={being.status} />;

          if (onSelect) {
            return (
              <li key={being.id} role="listitem">
                <button
                  type="button"
                  className="ds-roster__row ds-roster__row--button"
                  onClick={() => onSelect(being.id)}
                >
                  {avatar}
                  {who}
                  {badge}
                  {dot}
                </button>
              </li>
            );
          }

          return (
            <li key={being.id} role="listitem">
              <div className="ds-roster__row">
                {avatar}
                {who}
                {badge}
                {dot}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
