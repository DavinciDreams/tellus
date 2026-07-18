import React from "react";
import type { ReactNode } from "react";
import { PresenceDot } from "./PresenceDot";
import { Badge } from "./Badge";

export type AgentCardStatus =
  | "online"
  | "idle"
  | "busy"
  | "offline"
  | "error";

export interface AgentCardProps {
  name: string;
  status: AgentCardStatus;
  activity?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}

export function AgentCard({
  name,
  status,
  activity,
  description,
  actions,
  className,
}: AgentCardProps) {
  const rootClassName = ["ds-agentcard", className].filter(Boolean).join(" ");
  const isBusy = status === "busy";

  return (
    <article className={rootClassName}>
      <header className="ds-agentcard__head">
        <span className="ds-agentcard__avatar" aria-hidden="true">
          ✦
        </span>
        <span className="ds-agentcard__id">
          <span className="ds-agentcard__name">{name}</span>
          <Badge tone="gold">agent</Badge>
        </span>
        <PresenceDot status={status} showLabel />
      </header>

      {activity != null ? (
        <p className="ds-agentcard__activity">
          {isBusy ? (
            <span className="ds-agentcard__pulse" aria-hidden="true" />
          ) : null}
          <span className="ds-agentcard__activity-text">{activity}</span>
        </p>
      ) : null}

      {description != null ? (
        <div className="ds-agentcard__body">{description}</div>
      ) : null}

      {actions != null ? (
        <div className="ds-agentcard__actions">{actions}</div>
      ) : null}
    </article>
  );
}
