import React, { useCallback, useEffect, useRef } from "react";

export interface RadialMenuItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}

export interface RadialMenuProps {
  items: RadialMenuItem[];
  open: boolean;
  onClose: () => void;
  centerIcon?: React.ReactNode;
  "aria-label": string;
}

/** Radius (px) of the ring on which item tiles are placed. */
const RING_RADIUS = 92;

/**
 * RadialMenu — the "Field Kit". A radial command surface that blooms open in the
 * centre of the viewport instead of a wall of buttons. Items are spread evenly
 * around a dashed glass ring; keyboard arrows walk the ring, Enter/Space select,
 * Escape closes.
 */
export function RadialMenu({
  items,
  open,
  onClose,
  centerIcon,
  "aria-label": ariaLabel,
}: RadialMenuProps): React.ReactElement | null {
  const ringRef = useRef<HTMLDivElement>(null);

  // Collect the currently-focusable (enabled) item buttons, in DOM order.
  const getEnabledItems = useCallback((): HTMLButtonElement[] => {
    const ring = ringRef.current;
    if (!ring) return [];
    return Array.from(
      ring.querySelectorAll<HTMLButtonElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ),
    );
  }, []);

  // Focus the first enabled item whenever the surface opens.
  useEffect(() => {
    if (!open) return;
    const enabled = getEnabledItems();
    enabled[0]?.focus();
  }, [open, getEnabledItems]);

  const moveFocus = useCallback(
    (delta: 1 | -1) => {
      const enabled = getEnabledItems();
      if (enabled.length === 0) return;
      const current = document.activeElement as HTMLElement | null;
      const index = current
        ? enabled.indexOf(current as HTMLButtonElement)
        : -1;
      const next = (index + delta + enabled.length) % enabled.length;
      enabled[next]?.focus();
    },
    [getEnabledItems],
  );

  const activate = useCallback(
    (item: RadialMenuItem) => {
      if (item.disabled) return;
      item.onSelect();
      onClose();
    },
    [onClose],
  );

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "ArrowRight":
        case "ArrowDown":
          event.preventDefault();
          moveFocus(1);
          break;
        case "ArrowLeft":
        case "ArrowUp":
          event.preventDefault();
          moveFocus(-1);
          break;
        default:
          break;
      }
    },
    [onClose, moveFocus],
  );

  if (!open) return null;

  const count = items.length;

  return (
    <div className="ds-scope ds-radial ds-radial--open">
      <div
        className="ds-radial__scrim"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        ref={ringRef}
        role="menu"
        aria-label={ariaLabel}
        className="ds-radial__ring"
        onKeyDown={onKeyDown}
      >
        <div className="ds-radial__hub" aria-hidden="true">
          {centerIcon}
        </div>
        {items.map((item, i) => {
          const angleDeg = -90 + i * (360 / Math.max(count, 1));
          const angleRad = (angleDeg * Math.PI) / 180;
          const x = RING_RADIUS * Math.cos(angleRad);
          const y = RING_RADIUS * Math.sin(angleRad);
          return (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              tabIndex={-1}
              aria-disabled={item.disabled || undefined}
              disabled={item.disabled}
              className="ds-radial__item"
              style={{ transform: `translate(${x}px, ${y}px)` }}
              onClick={() => activate(item)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  activate(item);
                }
              }}
            >
              <span className="ds-radial__item-icon" aria-hidden="true">
                {item.icon}
              </span>
              <span className="ds-radial__item-label">{item.label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
