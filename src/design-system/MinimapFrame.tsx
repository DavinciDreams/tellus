import React from "react";
import type { ReactNode } from "react";
import { Plus, Minus } from "lucide-react";
import { IconButton } from "./IconButton";

export interface MinimapFrameProps {
  children?: ReactNode;
  title?: ReactNode;
  stageLabel?: string;
  onZoomIn?: () => void;
  onZoomOut?: () => void;
  showHere?: boolean; // default true
  footer?: ReactNode;
  className?: string;
}

export function MinimapFrame({
  children,
  title,
  stageLabel,
  onZoomIn,
  onZoomOut,
  showHere = true,
  footer,
  className,
}: MinimapFrameProps): React.JSX.Element {
  const rootClassName = ["ds-minimap", className].filter(Boolean).join(" ");

  const showZoom = onZoomIn !== undefined || onZoomOut !== undefined;
  const showHead = title !== undefined || showZoom;

  return (
    <div className={rootClassName}>
      {showHead ? (
        <div className="ds-minimap__head">
          {title !== undefined ? (
            <span className="ds-minimap__title">{title}</span>
          ) : null}
          {showZoom ? (
            <div className="ds-minimap__zoom">
              <IconButton
                aria-label="Zoom out"
                variant="ghost"
                size="sm"
                onClick={onZoomOut}
                disabled={onZoomOut === undefined}
                icon={<Minus aria-hidden />}
              />
              <IconButton
                aria-label="Zoom in"
                variant="ghost"
                size="sm"
                onClick={onZoomIn}
                disabled={onZoomIn === undefined}
                icon={<Plus aria-hidden />}
              />
            </div>
          ) : null}
        </div>
      ) : null}

      <div
        className="ds-minimap__stage"
        role="img"
        aria-label={stageLabel ?? "Map"}
      >
        <span className="ds-minimap__tick ds-minimap__tick--tl" aria-hidden="true" />
        <span className="ds-minimap__tick ds-minimap__tick--tr" aria-hidden="true" />
        <span className="ds-minimap__tick ds-minimap__tick--bl" aria-hidden="true" />
        <span className="ds-minimap__tick ds-minimap__tick--br" aria-hidden="true" />
        {children}
        {showHere ? (
          <span className="ds-minimap__here" aria-hidden="true" />
        ) : null}
      </div>

      {footer !== undefined ? (
        <div className="ds-minimap__footer">{footer}</div>
      ) : null}
    </div>
  );
}
