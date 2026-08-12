import type { Vec3 } from "./tellus-types";

const MAX_INTERIOR_WORLD_ID_LENGTH = 96;

export interface AutomaticBuildingInteriorDoorPlan {
  interiorWorldId: string;
  label: string;
  position: Vec3;
  anchorOffset: Vec3;
  rotationY: number;
}

const safeIdPart = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "") || "space";

const stableIdHash = (value: string): string => {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
};

const boundedInteriorWorldId = (worldId: string, thingId: string): string => {
  const raw = `interior-${safeIdPart(worldId)}-${safeIdPart(thingId)}`;
  if (raw.length <= MAX_INTERIOR_WORLD_ID_LENGTH) return raw;
  const suffix = `-${stableIdHash(`${worldId}\0${thingId}`)}`;
  return `${raw.slice(0, MAX_INTERIOR_WORLD_ID_LENGTH - suffix.length).replace(/-+$/g, "")}${suffix}`;
};

/**
 * Build the deterministic exterior-door pose for a fitted procedural building.
 * Tellus procedural buildings author their entrance on local +Z, so the portal can
 * remain attached through later move/rotate operations via anchorOffset.
 */
export function planAutomaticBuildingInteriorDoor(input: {
  worldId: string;
  thingId: string;
  buildingLabel: string;
  position: Vec3;
  rotationY: number;
  fittedDepth: number;
}): AutomaticBuildingInteriorDoorPlan | null {
  if (!Number.isFinite(input.fittedDepth) || input.fittedDepth <= 0) return null;
  if (![input.position.x, input.position.y, input.position.z, input.rotationY].every(Number.isFinite)) {
    return null;
  }

  const anchorOffset = {
    x: 0,
    y: 0,
    z: Math.max(1.25, input.fittedDepth / 2 + 0.28),
  };
  const sin = Math.sin(input.rotationY);
  const cos = Math.cos(input.rotationY);
  const interiorWorldId = boundedInteriorWorldId(input.worldId, input.thingId);

  return {
    interiorWorldId,
    label: `${input.buildingLabel.trim() || "Building"} door`.slice(0, 48),
    // Match main.tsx's rotateXZ convention (x*cos - z*sin), which is what portalAnchorPosition
    // uses to place the door from anchorOffset. Using +sin here mirrored the door across the
    // building's X axis for any rotated building, landing it in the back wall.
    position: {
      x: input.position.x - anchorOffset.z * sin,
      y: input.position.y,
      z: input.position.z + anchorOffset.z * cos,
    },
    anchorOffset,
    rotationY: 0,
  };
}
