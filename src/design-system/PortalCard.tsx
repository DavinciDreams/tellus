import React from "react";
import type { ReactNode } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import "./PortalCard.css";

export interface PortalCardProps {
  label: string;
  targetWorld: string;
  coords?: string;
  thumbnail?: ReactNode;
  onTravel?: () => void;
  onDelete?: () => void;
  className?: string;
}

export function PortalCard({
  label,
  targetWorld,
  coords,
  thumbnail,
  onTravel,
  onDelete,
  className,
}: PortalCardProps) {
  const rootClassName = ["ds-portalcard", className]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={rootClassName}>
      <div className="ds-portalcard__ring" aria-hidden={thumbnail ? undefined : true}>
        {thumbnail ?? (
          <span className="ds-portalcard__ring-graphic">
            <span className="ds-portalcard__ring-outer" />
            <span className="ds-portalcard__ring-inner" />
          </span>
        )}
      </div>

      <div className="ds-portalcard__body">
        <span className="ds-portalcard__label">{label}</span>
        <span className="ds-portalcard__target">to {targetWorld}</span>
        {coords ? (
          <span className="ds-portalcard__coords">{coords}</span>
        ) : null}
      </div>

      <div className="ds-portalcard__actions">
        <Button size="sm" onClick={onTravel}>
          Travel
        </Button>
        {onDelete ? (
          <IconButton
            aria-label="Delete portal"
            variant="ghost"
            onClick={onDelete}
            icon={<Trash2 aria-hidden />}
          />
        ) : null}
      </div>
    </div>
  );
}
