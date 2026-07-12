import React from "react";
import type { ReactNode } from "react";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  id: string;
  label: ReactNode;
  onClick?: () => void;
}

export interface BreadcrumbProps {
  items: BreadcrumbItem[];
  className?: string;
}

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

export function Breadcrumb({ items, className }: BreadcrumbProps): React.ReactElement {
  const lastIndex = items.length - 1;

  return (
    <nav aria-label="Breadcrumb" className={cx("ds-breadcrumb", className)}>
      <ol className="ds-breadcrumb__list">
        {items.map((item, index) => {
          const isLast = index === lastIndex;

          return (
            <li key={item.id} className="ds-breadcrumb__item">
              {isLast ? (
                <span className="ds-breadcrumb__current" aria-current="page">
                  {item.label}
                </span>
              ) : item.onClick ? (
                <button
                  type="button"
                  className="ds-breadcrumb__link"
                  onClick={item.onClick}
                >
                  {item.label}
                </button>
              ) : (
                <span className="ds-breadcrumb__link">{item.label}</span>
              )}
              {isLast ? null : (
                <ChevronRight
                  className="ds-breadcrumb__sep"
                  aria-hidden="true"
                  size={14}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
