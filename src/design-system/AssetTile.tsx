import React from "react";
import type { ReactNode } from "react";
import { Check } from "lucide-react";

export interface AssetTileProps {
  name: string;
  thumbnail?: ReactNode;
  meta?: ReactNode;
  selected?: boolean;
  onClick?: () => void;
  actions?: ReactNode;
  className?: string;
}

export function AssetTile({
  name,
  thumbnail,
  meta,
  selected = false,
  onClick,
  actions,
  className,
}: AssetTileProps): React.ReactElement {
  const rootClassName = [
    "ds-assettile",
    selected ? "ds-assettile--selected" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");

  const inner: ReactNode = (
    <>
      <div className="ds-assettile__thumb">
        {thumbnail}
        {selected ? (
          <span className="ds-assettile__check" aria-hidden="true">
            <Check size={14} strokeWidth={3} />
          </span>
        ) : null}
        {actions ? (
          <div className="ds-assettile__actions">{actions}</div>
        ) : null}
      </div>
      <div className="ds-assettile__body">
        <span className="ds-assettile__name" title={name}>
          {name}
        </span>
        {meta ? <span className="ds-assettile__meta">{meta}</span> : null}
      </div>
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        className={rootClassName}
        aria-pressed={selected}
        onClick={onClick}
      >
        {inner}
      </button>
    );
  }

  return <div className={rootClassName}>{inner}</div>;
}
