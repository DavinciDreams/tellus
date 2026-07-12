import React from "react";
import type { CSSProperties, HTMLAttributes } from "react";

export type SkeletonVariant = "text" | "block" | "circle";

export interface SkeletonProps
  extends Omit<HTMLAttributes<HTMLSpanElement>, "children"> {
  variant?: SkeletonVariant;
  width?: number | string;
  height?: number | string;
  radius?: number | string;
  lines?: number;
}

function toDim(value: number | string | undefined): string | undefined {
  if (value === undefined) return undefined;
  return typeof value === "number" ? `${value}px` : value;
}

export function Skeleton(props: SkeletonProps): React.ReactElement {
  const {
    variant = "text",
    width,
    height,
    radius,
    lines = 1,
    className,
    style,
    ...rest
  } = props;

  const classes = ["ds-skeleton", `ds-skeleton--${variant}`];
  if (className) classes.push(className);

  // Multi-line stacked text bars.
  if (variant === "text" && lines > 1) {
    return (
      <span
        aria-hidden="true"
        className={["ds-skeleton-lines", className]
          .filter(Boolean)
          .join(" ")}
        style={style}
        {...rest}
      >
        {Array.from({ length: lines }).map((_, i) => {
          const isLast = i === lines - 1;
          const barStyle: CSSProperties = {
            width: toDim(width) ?? (isLast ? "60%" : "100%"),
            height: toDim(height),
            borderRadius: toDim(radius),
          };
          return (
            <span
              key={i}
              className="ds-skeleton ds-skeleton--text"
              style={barStyle}
            />
          );
        })}
      </span>
    );
  }

  const composedStyle: CSSProperties = {
    ...style,
    ...(toDim(width) !== undefined ? { width: toDim(width) } : null),
    ...(toDim(height) !== undefined ? { height: toDim(height) } : null),
    ...(toDim(radius) !== undefined ? { borderRadius: toDim(radius) } : null),
  };

  return (
    <span
      aria-hidden="true"
      className={classes.join(" ")}
      style={composedStyle}
      {...rest}
    />
  );
}
