import React from "react";
import type { ReactNode } from "react";

export type LogKind = "world" | "agent" | "you" | "system";

export interface LogEntry {
  id: string;
  kind: LogKind;
  text: ReactNode;
  actor?: string;
  time?: string;
}

export interface LogFeedProps {
  entries: LogEntry[];
  title?: ReactNode;
  emptyLabel?: ReactNode;
  className?: string;
}

const MARKERS: Record<LogKind, string> = {
  agent: "✦",
  world: "◍",
  you: "•",
  system: "⚙",
};

export function LogFeed({
  entries,
  title = "Activity",
  emptyLabel = "Nothing has happened yet.",
  className,
}: LogFeedProps): React.JSX.Element {
  const rootClassName = className ? `ds-logfeed ${className}` : "ds-logfeed";

  return (
    <section className={rootClassName}>
      {title ? (
        <header className="ds-logfeed__head">
          <span className="ds-logfeed__title">{title}</span>
        </header>
      ) : null}
      {entries.length > 0 ? (
        <ul className="ds-logfeed__list" role="log" aria-live="polite">
          {entries.map((entry) => (
            <li
              key={entry.id}
              className={`ds-logfeed__entry ds-logfeed__entry--${entry.kind}`}
            >
              <span className="ds-logfeed__marker" aria-hidden="true">
                {MARKERS[entry.kind]}
              </span>
              <span className="ds-logfeed__meta">
                {entry.actor ? (
                  <span className="ds-logfeed__actor">{entry.actor}</span>
                ) : null}
                <span className="ds-logfeed__text">{entry.text}</span>
              </span>
              {entry.time ? (
                <span className="ds-logfeed__time">{entry.time}</span>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="ds-logfeed__empty">{emptyLabel}</p>
      )}
    </section>
  );
}
