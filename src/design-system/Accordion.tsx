import React, { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

export interface AccordionItem {
  id: string;
  title: ReactNode;
  content: ReactNode;
  defaultOpen?: boolean;
}

export interface AccordionProps {
  items: AccordionItem[];
  multiple?: boolean;
  className?: string;
}

export function Accordion({
  items,
  multiple = false,
  className,
}: AccordionProps) {
  const prefix = useId();

  const [openIds, setOpenIds] = useState<Set<string>>(
    () => new Set(items.filter((item) => item.defaultOpen).map((item) => item.id)),
  );

  const toggle = (id: string) => {
    setOpenIds((prev) => {
      const isOpen = prev.has(id);
      if (multiple) {
        const next = new Set(prev);
        if (isOpen) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      }
      return isOpen ? new Set() : new Set([id]);
    });
  };

  const classes = ["ds-accordion", className].filter(Boolean).join(" ");

  return (
    <div className={classes}>
      {items.map((item) => {
        const open = openIds.has(item.id);
        const triggerId = `${prefix}-trigger-${item.id}`;
        const panelId = `${prefix}-panel-${item.id}`;
        return (
          <div
            key={item.id}
            className={`ds-accordion__item${open ? " ds-accordion__item--open" : ""}`}
          >
            <h3 className="ds-accordion__header">
              <button
                type="button"
                id={triggerId}
                className="ds-accordion__trigger"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => toggle(item.id)}
              >
                <span className="ds-accordion__title">{item.title}</span>
                <ChevronDown
                  className="ds-accordion__chevron"
                  aria-hidden="true"
                  size={18}
                />
              </button>
            </h3>
            <div
              id={panelId}
              className="ds-accordion__panel"
              role="region"
              aria-labelledby={triggerId}
              hidden={!open}
            >
              {item.content}
            </div>
          </div>
        );
      })}
    </div>
  );
}
