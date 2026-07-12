import React, { useCallback, useRef } from "react";
import type { KeyboardEvent, ReactNode } from "react";

export interface TabItem {
  id: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface TabsProps {
  items: TabItem[];
  value: string; // controlled selected id
  onChange: (id: string) => void;
  layout?: "auto" | "equal"; // default "auto"; equal = 1fr grid columns
  "aria-label": string; // REQUIRED for the tablist
  children?: (activeId: string) => ReactNode; // optional tabpanel render
}

export function Tabs({
  items,
  value,
  onChange,
  layout = "auto",
  "aria-label": ariaLabel,
  children,
}: TabsProps): React.JSX.Element {
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  const enabledIndexes = items
    .map((item, index) => (item.disabled ? -1 : index))
    .filter((index) => index !== -1);

  const focusAndActivate = useCallback(
    (index: number) => {
      const item = items[index];
      if (!item || item.disabled) {
        return;
      }
      tabRefs.current[index]?.focus();
      onChange(item.id);
    },
    [items, onChange],
  );

  const handleKeyDown = useCallback(
    (event: KeyboardEvent<HTMLButtonElement>, currentIndex: number) => {
      if (enabledIndexes.length === 0) {
        return;
      }
      const position = enabledIndexes.indexOf(currentIndex);

      let nextIndex: number | null = null;
      switch (event.key) {
        case "ArrowRight":
        case "ArrowDown": {
          const next = enabledIndexes[(position + 1) % enabledIndexes.length];
          nextIndex = next;
          break;
        }
        case "ArrowLeft":
        case "ArrowUp": {
          const next =
            enabledIndexes[
              (position - 1 + enabledIndexes.length) % enabledIndexes.length
            ];
          nextIndex = next;
          break;
        }
        case "Home": {
          nextIndex = enabledIndexes[0];
          break;
        }
        case "End": {
          nextIndex = enabledIndexes[enabledIndexes.length - 1];
          break;
        }
        default:
          return;
      }

      if (nextIndex !== null) {
        event.preventDefault();
        focusAndActivate(nextIndex);
      }
    },
    [enabledIndexes, focusAndActivate],
  );

  return (
    <div className={`ds-tabs ds-tabs--${layout}`}>
      <div className="ds-tabs__list" role="tablist" aria-label={ariaLabel}>
        {items.map((item, index) => {
          const selected = item.id === value;
          return (
            <button
              key={item.id}
              ref={(node) => {
                tabRefs.current[index] = node;
              }}
              type="button"
              role="tab"
              id={`ds-tab-${item.id}`}
              aria-controls={`ds-tabpanel-${item.id}`}
              aria-selected={selected}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              className={`ds-tabs__tab${selected ? " ds-tabs__tab--active" : ""}`}
              onClick={() => {
                if (!item.disabled) {
                  onChange(item.id);
                }
              }}
              onKeyDown={(event) => handleKeyDown(event, index)}
            >
              {item.label}
            </button>
          );
        })}
      </div>
      {children ? (
        <div
          className="ds-tabpanel"
          role="tabpanel"
          id={`ds-tabpanel-${value}`}
          aria-labelledby={`ds-tab-${value}`}
          tabIndex={0}
        >
          {children(value)}
        </div>
      ) : null}
    </div>
  );
}
