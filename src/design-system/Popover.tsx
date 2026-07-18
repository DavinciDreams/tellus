import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";

export type PopoverAlign = "start" | "center" | "end";
export type PopoverPlacement = "top" | "bottom";

export interface PopoverProps {
  trigger: ReactNode;
  children: ReactNode;
  align?: PopoverAlign;
  placement?: PopoverPlacement;
  "aria-label": string;
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Popover({
  trigger,
  children,
  align = "center",
  placement = "bottom",
  "aria-label": ariaLabel,
  className,
}: PopoverProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = useId();

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  // Move focus into the panel when it opens (first focusable, else the panel).
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusable = panel.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    );
    (focusable ?? panel).focus();
  }, [open]);

  // Close on outside pointer-down while open (ignore clicks inside the wrapper).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const onPanelKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
      }
    },
    [close],
  );

  return (
    <div
      ref={rootRef}
      className={cx("ds-popover", open && "ds-popover--open", className)}
    >
      <button
        ref={triggerRef}
        type="button"
        className="ds-popover__trigger"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open ? (
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={ariaLabel}
          tabIndex={-1}
          className={cx(
            "ds-popover__panel",
            `ds-popover__panel--${align}`,
            `ds-popover__panel--${placement}`,
          )}
          onKeyDown={onPanelKeyDown}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
