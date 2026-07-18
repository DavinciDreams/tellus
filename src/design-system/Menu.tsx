import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
} from "react";

export type MenuAlign = "start" | "end";

export interface MenuProps {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: MenuAlign;
  "aria-label"?: string;
  className?: string;
}

export interface MenuItemProps {
  onSelect?: () => void;
  icon?: React.ReactNode;
  danger?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

export interface MenuSeparatorProps {
  className?: string;
}

interface MenuContextValue {
  close: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Menu({
  trigger,
  children,
  align = "start",
  "aria-label": ariaLabel,
  className,
}: MenuProps): React.ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const menuId = useId();

  const close = useCallback((returnFocus = false) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const getItems = useCallback((): HTMLElement[] => {
    const list = listRef.current;
    if (!list) return [];
    return Array.from(
      list.querySelectorAll<HTMLElement>(
        '[role="menuitem"]:not([aria-disabled="true"])',
      ),
    );
  }, []);

  // Focus the first enabled item when the list opens.
  useEffect(() => {
    if (!open) return;
    const items = getItems();
    items[0]?.focus();
  }, [open, getItems]);

  // Close on outside pointer-down while open (ignore clicks inside the menu).
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      const root = rootRef.current;
      if (root && !root.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  const onListKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLUListElement>) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(true);
        return;
      }
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault();
        const items = getItems();
        if (items.length === 0) return;
        const current = document.activeElement as HTMLElement | null;
        const index = current ? items.indexOf(current) : -1;
        const delta = event.key === "ArrowDown" ? 1 : -1;
        const next = (index + delta + items.length) % items.length;
        items[next]?.focus();
        return;
      }
      if (event.key === "Home") {
        event.preventDefault();
        getItems()[0]?.focus();
        return;
      }
      if (event.key === "End") {
        event.preventDefault();
        const items = getItems();
        items[items.length - 1]?.focus();
      }
    },
    [close, getItems],
  );

  return (
    <div ref={rootRef} className={cx("ds-menu", open && "ds-menu--open", className)}>
      <button
        ref={triggerRef}
        type="button"
        className="ds-menu__trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        {trigger}
      </button>
      {open ? (
        <MenuContext.Provider value={{ close: () => close(true) }}>
          <ul
            ref={listRef}
            id={menuId}
            role="menu"
            aria-label={ariaLabel}
            className={cx("ds-menu__list", `ds-menu__list--${align}`)}
            onKeyDown={onListKeyDown}
          >
            {children}
          </ul>
        </MenuContext.Provider>
      ) : null}
    </div>
  );
}

export function MenuItem({
  onSelect,
  icon,
  danger = false,
  disabled = false,
  children,
  className,
}: MenuItemProps): React.ReactElement {
  const ctx = useContext(MenuContext);

  const activate = useCallback(() => {
    if (disabled) return;
    onSelect?.();
    ctx?.close();
  }, [disabled, onSelect, ctx]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLLIElement>) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        activate();
      }
    },
    [activate],
  );

  return (
    <li
      role="menuitem"
      tabIndex={-1}
      aria-disabled={disabled || undefined}
      className={cx(
        "ds-menu__item",
        danger && "ds-menu__item--danger",
        disabled && "ds-menu__item--disabled",
        className,
      )}
      onClick={activate}
      onKeyDown={onKeyDown}
    >
      {icon ? <span className="ds-menu__item-icon" aria-hidden="true">{icon}</span> : null}
      <span className="ds-menu__item-label">{children}</span>
    </li>
  );
}

export function MenuSeparator({ className }: MenuSeparatorProps): React.ReactElement {
  return <li role="separator" className={cx("ds-menu__sep", className)} />;
}
