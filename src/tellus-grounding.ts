export const MAX_GROUND_RELATIVE_OFFSET = 40;
export const GROUND_RELATIVE_OFFSET_EPSILON = 0.001;

export type GroundRelativePosition = { x: number; y: number; z: number };

const clampGroundRelativeOffset = (value: number): number =>
  Math.max(-MAX_GROUND_RELATIVE_OFFSET, Math.min(MAX_GROUND_RELATIVE_OFFSET, value));

/**
 * Ground-relative placement is the authoritative vertical-position contract for world things.
 * Missing values are legacy grounded placements, never evidence of an authored floating height.
 */
export function groundRelativeOffset(value: number | undefined): number {
  return typeof value === "number" && Number.isFinite(value)
    ? clampGroundRelativeOffset(value)
    : 0;
}

export function hasAuthoredGroundRelativeOffset(value: number | undefined): boolean {
  return Math.abs(groundRelativeOffset(value)) > GROUND_RELATIVE_OFFSET_EPSILON;
}

export function positionAtGroundRelativeOffset<T extends GroundRelativePosition>(
  position: T,
  surfaceY: number,
  verticalOffset: number | undefined,
): T {
  if (!Number.isFinite(surfaceY)) return { ...position };
  return {
    ...position,
    y: surfaceY + groundRelativeOffset(verticalOffset),
  };
}

export function groundRelativeOffsetFromSurface(positionY: number, surfaceY: number): number {
  if (!Number.isFinite(positionY) || !Number.isFinite(surfaceY)) return 0;
  return groundRelativeOffset(positionY - surfaceY);
}
