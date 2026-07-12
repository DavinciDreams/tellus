import React, { useCallback, useEffect, useRef } from "react";
import type { HTMLAttributes, ReactNode } from "react";

export type ToolbarOrientation = "horizontal" | "vertical";
export type ToolbarAlign = "start" | "center" | "end" | "between";

export interface ToolbarProps extends Omit<HTMLAttributes<HTMLDivElement>, "className"> {
  "aria-label": string; // REQUIRED (role=toolbar)
  orientation?: ToolbarOrientation; // default "horizontal"
  align?: ToolbarAlign; // default "start"
  primary?: ReactNode; // one emphasized primary slot
  overflow?: ReactNode; // overflow-menu affordance (e.g. IconButton "More")
  children?: ReactNode; // secondary action group
}

export interface ActionGroupProps extends HTMLAttributes<HTMLDivElement> {
  align?: ToolbarAlign; // default "start"
  gap?: "sm" | "md"; // default "md"
}

/* Candidate interactive elements for roving tabindex. Matches by tag/role, NOT by
   current tabindex value, so roving-managed items (tabindex="-1") stay in the set. */
const FOCUSABLE_SELECTOR = [
  "button",
  "a[href]",
  "input",
  "select",
  "textarea",
  '[role="button"]',
  "[tabindex]",
].join(", ");

export function Toolbar({
  orientation = "horizontal",
  align = "start",
  primary,
  overflow,
  children,
  "aria-label": ariaLabel,
  onKeyDown: onKeyDownProp,
  ...rest
}: ToolbarProps) {
  const rootRef = useRef<HTMLDivElement>(null);

  const getItems = useCallback((): HTMLElement[] => {
    const root = rootRef.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
      (el) =>
        !el.hasAttribute("disabled") &&
        el.getAttribute("aria-disabled") !== "true" &&
        el.offsetParent !== null,
    );
  }, []);

  // Maintain the WAI-ARIA roving tabindex invariant: exactly one focusable child is
  // in the tab order (tabIndex 0), all others are -1. Preserves the current active
  // item across re-renders / dynamic children when one already holds tabIndex 0.
  useEffect(() => {
    const items = getItems();
    if (items.length === 0) return;
    let seenActive = false;
    items.forEach((el) => {
      if (el.tabIndex === 0 && !seenActive) {
        seenActive = true;
      } else {
        el.tabIndex = -1;
      }
    });
    if (!seenActive) items[0].tabIndex = 0;
  });

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      onKeyDownProp?.(event);
      if (event.defaultPrevented) return;

      const items = getItems();
      if (items.length === 0) return;

      const nextKey = orientation === "vertical" ? "ArrowDown" : "ArrowRight";
      const prevKey = orientation === "vertical" ? "ArrowUp" : "ArrowLeft";
      const currentIndex = items.indexOf(document.activeElement as HTMLElement);

      let nextIndex = -1;
      if (event.key === nextKey) {
        nextIndex = currentIndex < 0 ? 0 : (currentIndex + 1) % items.length;
      } else if (event.key === prevKey) {
        nextIndex = currentIndex < 0 ? items.length - 1 : (currentIndex - 1 + items.length) % items.length;
      } else if (event.key === "Home") {
        nextIndex = 0;
      } else if (event.key === "End") {
        nextIndex = items.length - 1;
      } else {
        return;
      }

      event.preventDefault();
      const target = items[nextIndex];
      items.forEach((el) => {
        el.tabIndex = el === target ? 0 : -1;
      });
      target.focus();
    },
    [getItems, orientation, onKeyDownProp],
  );

  const rootClass = [
    "ds-toolbar",
    `ds-toolbar--${orientation}`,
    `ds-toolbar--align-${align}`,
  ].join(" ");

  return (
    <div
      {...rest}
      ref={rootRef}
      role="toolbar"
      aria-label={ariaLabel}
      aria-orientation={orientation}
      className={rootClass}
      onKeyDown={handleKeyDown}
    >
      {primary != null ? <div className="ds-toolbar__primary">{primary}</div> : null}
      {children != null ? <div className="ds-toolbar__group">{children}</div> : null}
      {overflow != null ? <div className="ds-toolbar__overflow">{overflow}</div> : null}
    </div>
  );
}

export function ActionGroup({
  align = "start",
  gap = "md",
  className,
  children,
  ...rest
}: ActionGroupProps) {
  const cls = [
    "ds-actiongroup",
    `ds-actiongroup--align-${align}`,
    `ds-actiongroup--gap-${gap}`,
  ];
  if (className) cls.push(className);

  return (
    <div {...rest} className={cls.join(" ")}>
      {children}
    </div>
  );
}
