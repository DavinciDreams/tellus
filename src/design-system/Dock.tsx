import React, { useCallback, useRef } from "react";

export interface DockItem {
  id: string;
  label: string;
  icon: React.ReactNode;
  onSelect: () => void;
  primary?: boolean;
  active?: boolean;
  badge?: React.ReactNode;
}

export interface DockProps {
  items: DockItem[];
  "aria-label": string;
  className?: string;
}

export function Dock(props: DockProps) {
  const { items, "aria-label": ariaLabel, className } = props;

  const buttonRefs = useRef<(HTMLButtonElement | null)[]>([]);
  // The item that currently holds tabindex=0 (roving). First item by default.
  const focusIndexRef = useRef<number>(0);

  const rootClasses = ["ds-dock", className ?? ""].filter(Boolean).join(" ");

  const focusItem = useCallback(
    (index: number) => {
      const count = items.length;
      if (count === 0) return;
      const wrapped = ((index % count) + count) % count;
      focusIndexRef.current = wrapped;
      buttonRefs.current[wrapped]?.focus();
    },
    [items.length]
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
      if (event.key === "ArrowRight") {
        event.preventDefault();
        focusItem(index + 1);
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        focusItem(index - 1);
      }
    },
    [focusItem]
  );

  const primaryItems = items.filter((item) => item.primary === true);
  const groupItems = items.filter((item) => item.primary !== true);

  const renderItem = (item: DockItem, index: number) => {
    const isPrimary = item.primary === true;
    const itemClasses = [
      "ds-dock__item",
      isPrimary ? "ds-dock__item--primary" : "",
      item.active ? "ds-dock__item--active" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return (
      <button
        key={item.id}
        ref={(el) => {
          buttonRefs.current[index] = el;
        }}
        type="button"
        className={itemClasses}
        aria-pressed={item.active === true}
        tabIndex={index === focusIndexRef.current ? 0 : -1}
        onFocus={() => {
          focusIndexRef.current = index;
        }}
        onKeyDown={(event) => handleKeyDown(event, index)}
        onClick={item.onSelect}
      >
        <span className="ds-dock__item-icon" aria-hidden="true">
          {item.icon}
        </span>
        <span className="ds-dock__item-label">{item.label}</span>
        {item.badge != null && (
          <span className="ds-dock__badge">{item.badge}</span>
        )}
      </button>
    );
  };

  // Global index across both slots so roving tabindex + arrow order is stable
  // and matches DOM order (primary slot first, then the group).
  let cursor = -1;
  const nextIndex = () => (cursor += 1);

  return (
    <div className={rootClasses} role="toolbar" aria-label={ariaLabel}>
      {primaryItems.length > 0 && (
        <div className="ds-dock__primary">
          {primaryItems.map((item) => renderItem(item, nextIndex()))}
        </div>
      )}
      {groupItems.length > 0 && (
        <div className="ds-dock__group">
          {groupItems.map((item) => renderItem(item, nextIndex()))}
        </div>
      )}
    </div>
  );
}
