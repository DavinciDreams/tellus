import React from "react";
import type { HTMLAttributes } from "react";

export interface CompassProps
  extends Omit<HTMLAttributes<HTMLDivElement>, "children"> {
  /** Heading in degrees clockwise from north, 0–360. */
  heading: number;
  /** Diameter in px. Default 72. */
  size?: number;
  /** Show the humanized cardinal + degree readout. Default true. */
  showReadout?: boolean;
}

/** The 8-point compass rose, from due north clockwise. */
const POINTS = [
  { short: "N", label: "north" },
  { short: "NE", label: "north-east" },
  { short: "E", label: "east" },
  { short: "SE", label: "south-east" },
  { short: "S", label: "south" },
  { short: "SW", label: "south-west" },
  { short: "W", label: "west" },
  { short: "NW", label: "north-west" },
] as const;

// Fold any heading into [0, 360).
function normalizeHeading(heading: number): number {
  return ((heading % 360) + 360) % 360;
}

// Nearest of the 8 cardinal/intercardinal points.
function pointOf(heading: number): (typeof POINTS)[number] {
  const index = Math.round(normalizeHeading(heading) / 45) % 8;
  return POINTS[index];
}

/**
 * Compass — a world-heading indicator. A circular rose carries the cardinal
 * letters (N in gold) and rotates by -heading under a fixed top needle, so the
 * needle always reads the current facing. The heading is also stated in text
 * (never color-only) and the rose graphic is hidden from assistive tech; the
 * root exposes a humanized aria-label ("Facing north-east").
 */
export function Compass({
  heading,
  size = 72,
  showReadout = true,
  className,
  style,
  ...rest
}: CompassProps) {
  const rootClassName = ["ds-compass", className].filter(Boolean).join(" ");

  const degrees = Math.round(normalizeHeading(heading));
  const point = pointOf(heading);

  return (
    <div
      className={rootClassName}
      role="img"
      aria-label={`Facing ${point.label}`}
      style={{ width: size, height: size, ...style }}
      {...rest}
    >
      <div className="ds-compass__ring" aria-hidden="true" />
      <div
        className="ds-compass__rose"
        aria-hidden="true"
        style={{ transform: `rotate(${-heading}deg)` }}
      >
        <span className="ds-compass__cardinal ds-compass__cardinal--n">N</span>
        <span className="ds-compass__cardinal ds-compass__cardinal--e">E</span>
        <span className="ds-compass__cardinal ds-compass__cardinal--s">S</span>
        <span className="ds-compass__cardinal ds-compass__cardinal--w">W</span>
      </div>
      <div className="ds-compass__needle" aria-hidden="true" />
      {showReadout ? (
        <div className="ds-compass__readout">
          {point.short} · {degrees}°
        </div>
      ) : null}
    </div>
  );
}
