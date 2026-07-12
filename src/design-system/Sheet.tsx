import React, { useCallback, useEffect, useId, useRef } from "react";
import type { ReactNode } from "react";
import { X } from "lucide-react";
import { IconButton } from "./IconButton";

export type SheetSide = "right" | "left" | "bottom";

export interface SheetProps {
  open: boolean;
  onClose: () => void;
  side?: SheetSide;
  title?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: number | string;
}

/* Sheet — an edge drawer (side panel / bottom sheet). Slides in from the chosen
   edge over a click-to-dismiss scrim. The whole overlay is wrapped in its own
   `.ds-scope`, so tokens resolve even when the host tree is not itself scoped
   (custom properties inherit down the DOM tree). Escape + scrim click close it;
   the close button is focused on open, and focus best-effort returns to the
   opener on close. */
export function Sheet({
  open,
  onClose,
  side = "right",
  title,
  children,
  footer,
  size,
}: SheetProps): React.JSX.Element | null {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);

  // Escape closes.
  useEffect(() => {
    if (!open) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, onClose]);

  // On open: remember the opener, focus the close button (or first focusable).
  // On close: best-effort return focus to the opener.
  useEffect(() => {
    if (!open) {
      return;
    }
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    // The close button is the first focusable element in the panel; this focuses
    // it, or falls back to the first focusable child.
    const focusTarget =
      panelRef.current?.querySelector<HTMLElement>(
        'button, [href], input, textarea, select, [tabindex]:not([tabindex="-1"])',
      ) ?? null;
    focusTarget?.focus();

    return () => {
      openerRef.current?.focus?.();
    };
  }, [open]);

  const handleScrimClick = useCallback(() => {
    onClose();
  }, [onClose]);

  if (!open) {
    return null;
  }

  const isBottom = side === "bottom";
  const panelStyle =
    size !== undefined
      ? isBottom
        ? { height: typeof size === "number" ? `${size}px` : size }
        : { width: typeof size === "number" ? `${size}px` : size }
      : undefined;

  return (
    <div className="ds-scope ds-sheet ds-sheet--open">
      <div className="ds-sheet__scrim" onClick={handleScrimClick} aria-hidden="true" />
      <div
        ref={panelRef}
        className={`ds-sheet__panel ds-sheet__panel--${side}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title !== undefined ? titleId : undefined}
        style={panelStyle}
      >
        <div className="ds-sheet__header">
          {title !== undefined ? (
            <h2 id={titleId} className="ds-sheet__title">
              {title}
            </h2>
          ) : (
            <span />
          )}
          <IconButton
            aria-label="Close"
            variant="ghost"
            size="sm"
            icon={<X size={16} aria-hidden="true" />}
            onClick={onClose}
          />
        </div>
        <div className="ds-sheet__body">{children}</div>
        {footer !== undefined ? (
          <div className="ds-sheet__footer">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
