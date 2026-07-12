import type { HTMLAttributes, ReactNode } from "react";

export type PanelLevel = "canvas" | "panel" | "raised";

export interface PanelProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  level?: PanelLevel; // default "panel"
  glass?: boolean; // default false — backdrop-filter ONLY when true (deliberate)
  title?: ReactNode; // optional heading (rendered as h2)
  header?: ReactNode; // optional custom header slot (overrides title)
  headerActions?: ReactNode; // right-aligned header actions
  padded?: boolean; // default true
  children: ReactNode;
}

export function Panel({
  level = "panel",
  glass = false,
  title,
  header,
  headerActions,
  padded = true,
  children,
  ...rest
}: PanelProps) {
  const classes = [
    "ds-panel",
    `ds-panel--${level}`,
    glass ? "ds-panel--glass" : null,
    !padded ? "ds-panel--flush" : null,
  ]
    .filter(Boolean)
    .join(" ");

  const headerContent: ReactNode = header ?? (
    title !== undefined ? (
      <h2 className="ds-panel__title">{title}</h2>
    ) : null
  );

  const showHeader = headerContent !== null || headerActions !== undefined;

  return (
    <div className={classes} {...rest}>
      {showHeader ? (
        <div className="ds-panel__header">
          {headerContent}
          {headerActions !== undefined ? (
            <div className="ds-panel__actions">{headerActions}</div>
          ) : null}
        </div>
      ) : null}
      <div className="ds-panel__body">{children}</div>
    </div>
  );
}
