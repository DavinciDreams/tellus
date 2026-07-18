import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Search } from "lucide-react";

export interface CommandItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  hint?: string;
  keywords?: string;
  group?: string;
  onRun: () => void;
}

export interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
  commands: CommandItem[];
  placeholder?: string;
}

interface CommandGroup {
  key: string;
  /** Group heading; empty string means ungrouped (rendered without a label). */
  label: string;
  items: CommandItem[];
}

/**
 * CommandPalette — the ⌘K command surface. Type to filter every action, arrow to
 * choose, Enter to run. A dark glass panel drops in near the top of the viewport
 * over a click-to-close scrim. Self-scoped so tokens resolve from any host.
 */
export function CommandPalette({
  open,
  onClose,
  commands,
  placeholder = "Search actions…",
}: CommandPaletteProps): React.ReactElement | null {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  // Flat, filtered list in render order (used for keyboard navigation).
  const filtered = useMemo<CommandItem[]>(() => {
    const q = query.trim().toLowerCase();
    if (q === "") return commands;
    return commands.filter((cmd) => {
      const haystack = `${cmd.label} ${cmd.keywords ?? ""}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [commands, query]);

  // Grouped for display: ungrouped items first (no label), then named groups
  // in first-seen order. Order within a group follows the filtered order.
  const groups = useMemo<CommandGroup[]>(() => {
    const order: string[] = [];
    const byKey = new Map<string, CommandGroup>();
    for (const item of filtered) {
      const label = item.group ?? "";
      if (!byKey.has(label)) {
        byKey.set(label, { key: label === "" ? "__ungrouped" : label, label, items: [] });
        order.push(label);
      }
      byKey.get(label)!.items.push(item);
    }
    // Ungrouped ("") first, then the rest in first-seen order.
    return order
      .sort((a, b) => (a === "" ? -1 : b === "" ? 1 : 0))
      .map((label) => byKey.get(label)!);
  }, [filtered]);

  // Reset active to 0 whenever the query changes.
  useEffect(() => {
    setActive(0);
  }, [query]);

  // Reset the palette state each time it opens; focus the input.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
    inputRef.current?.focus();
  }, [open]);

  // Clamp the active index when the filtered list shrinks.
  useEffect(() => {
    setActive((prev) => {
      if (filtered.length === 0) return 0;
      return Math.min(prev, filtered.length - 1);
    });
  }, [filtered.length]);

  // Keep the active option scrolled into view.
  useEffect(() => {
    if (!open) return;
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLElement>('[aria-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  const activeItem: CommandItem | undefined = filtered[active];
  const activeId = activeItem
    ? `ds-cmdk-option-${activeItem.id}`
    : undefined;

  const runItem = useCallback(
    (item: CommandItem) => {
      item.onRun();
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
        case "ArrowDown":
          event.preventDefault();
          setActive((prev) =>
            filtered.length === 0 ? 0 : (prev + 1) % filtered.length,
          );
          break;
        case "ArrowUp":
          event.preventDefault();
          setActive((prev) =>
            filtered.length === 0
              ? 0
              : (prev - 1 + filtered.length) % filtered.length,
          );
          break;
        case "Enter":
          event.preventDefault();
          if (activeItem) runItem(activeItem);
          break;
        default:
          break;
      }
    },
    [onClose, filtered.length, activeItem, runItem],
  );

  if (!open) return null;

  const listId = "ds-cmdk-list";
  const hasResults = filtered.length > 0;

  return (
    <div className="ds-scope ds-cmdk">
      <div className="ds-cmdk__scrim" onClick={onClose} aria-hidden="true" />
      <div
        className="ds-cmdk__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        onKeyDown={onKeyDown}
      >
        <div className="ds-cmdk__search">
          <span className="ds-cmdk__item-icon" aria-hidden="true">
            <Search />
          </span>
          <input
            ref={inputRef}
            className="ds-cmdk__input"
            type="text"
            role="combobox"
            aria-expanded={hasResults}
            aria-controls={listId}
            aria-activedescendant={activeId}
            aria-autocomplete="list"
            placeholder={placeholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Actions"
          className="ds-cmdk__list"
        >
          {hasResults ? (
            groups.map((group) => (
              <li key={group.key} className="ds-cmdk__group" role="presentation">
                {group.label !== "" ? (
                  <div className="ds-cmdk__group-label" role="presentation">
                    {group.label}
                  </div>
                ) : null}
                <ul role="presentation">
                  {group.items.map((item) => {
                    const optionId = `ds-cmdk-option-${item.id}`;
                    const isActive = item === activeItem;
                    return (
                      <li
                        key={item.id}
                        id={optionId}
                        role="option"
                        aria-selected={isActive}
                        className={
                          isActive
                            ? "ds-cmdk__item ds-cmdk__item--active"
                            : "ds-cmdk__item"
                        }
                        onClick={() => runItem(item)}
                        onMouseMove={() => {
                          const index = filtered.indexOf(item);
                          if (index !== -1) setActive(index);
                        }}
                      >
                        {item.icon ? (
                          <span className="ds-cmdk__item-icon" aria-hidden="true">
                            {item.icon}
                          </span>
                        ) : null}
                        <span className="ds-cmdk__item-label">{item.label}</span>
                        {item.hint ? (
                          <span className="ds-cmdk__item-hint">{item.hint}</span>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </li>
            ))
          ) : (
            <li className="ds-cmdk__empty" role="presentation">
              No matching actions
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
