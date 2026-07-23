import type { Vec3 } from "./tellus-types";

export interface AgentMapLocationOptions {
  worldId: string;
  position: Vec3;
  worldScale: number;
  worldRadius: number;
  oceanRadius: number;
  terrainType: string;
  terrainHeight: number;
  pondCenter: Vec3;
  chunkedWorldChunks?: { w: number; h: number } | null;
  chunkSpan: number;
}

export interface AgentMoveTarget {
  position: Vec3;
  target?: { x: number; z: number };
  distanceRemaining?: number;
  reached?: boolean;
}

export interface AgentMoveBlock {
  x: number;
  z: number;
  kind: string;
  reason: string;
}

export interface BlockableAgentMoveTarget extends AgentMoveTarget {
  blocked?: AgentMoveBlock;
}

const finite = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value);

const record = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const rounded = (value: number) => Number(value.toFixed(2));

export function buildAgentMapLocation(options: AgentMapLocationOptions) {
  const {
    worldId,
    position,
    worldScale,
    worldRadius,
    oceanRadius,
    terrainType,
    terrainHeight,
    pondCenter,
    chunkedWorldChunks,
    chunkSpan,
  } = options;
  const chunked = Boolean(chunkedWorldChunks);
  const bounds = chunkedWorldChunks
    ? {
        minX: 0,
        minZ: 0,
        maxX: chunkedWorldChunks.w * chunkSpan,
        maxZ: chunkedWorldChunks.h * chunkSpan,
      }
    : {
        minX: -oceanRadius,
        minZ: -oceanRadius,
        maxX: oceanRadius,
        maxZ: oceanRadius,
      };

  return {
    worldId,
    position: { ...position },
    coordinates: {
      x: rounded(position.x),
      y: rounded(position.y),
      z: rounded(position.z),
      units: "world units",
    },
    mapLocation: {
      x: rounded(position.x),
      z: rounded(position.z),
      origin: chunked ? "northwest corner" : "world center",
      axes: {
        x: "east positive / west negative",
        z: "south positive / north negative",
      },
      bounds,
    },
    world: {
      id: worldId,
      scale: worldScale,
      radius: worldRadius,
      oceanRadius,
      chunked,
      chunks: chunkedWorldChunks ?? undefined,
    },
    terrain: {
      type: terrainType,
      height: terrainHeight,
    },
    landmarks: {
      pond: {
        x: rounded(pondCenter.x),
        z: rounded(pondCenter.z),
      },
      summit: { x: 0, z: 0 },
    },
  };
}

function nestedRecord(args: Record<string, unknown>, keys: string[]): Record<string, unknown> | null {
  for (const key of keys) {
    const value = record(args[key]);
    if (value) return value;
  }
  return null;
}

function absoluteTarget(args: Record<string, unknown>): { x: number; z: number } | null {
  if (finite(args.x) && finite(args.z)) return { x: args.x, z: args.z };
  if (finite(args.targetX) && finite(args.targetZ)) {
    return { x: args.targetX, z: args.targetZ };
  }
  const nested = nestedRecord(args, ["target", "destination", "coordinates", "location"]);
  if (nested && finite(nested.x) && finite(nested.z)) return { x: nested.x, z: nested.z };
  return null;
}

function directionDelta(args: Record<string, unknown>): { dx: number; dz: number } | null {
  let dx = finite(args.dx) ? args.dx : 0;
  let dz = finite(args.dz) ? args.dz : 0;
  if (finite(args.east)) dx += args.east;
  if (finite(args.west)) dx -= args.west;
  if (finite(args.south)) dz += args.south;
  if (finite(args.north)) dz -= args.north;

  const direction =
    typeof args.direction === "string"
      ? args.direction.trim().toLowerCase().replace(/[\s_-]+/g, "")
      : "";
  const distance = finite(args.distance) ? args.distance : 1;
  if (direction) {
    if (direction.includes("east")) dx += distance;
    if (direction.includes("west")) dx -= distance;
    if (direction.includes("south")) dz += distance;
    if (direction.includes("north")) dz -= distance;
  }

  return dx || dz ? { dx, dz } : null;
}

export function resolveAgentMoveTarget(
  args: Record<string, unknown>,
  current: Vec3,
  maxStep: number,
  ground: (x: number, z: number) => Vec3,
): AgentMoveTarget {
  const absolute = absoluteTarget(args);
  if (absolute) {
    const dx = absolute.x - current.x;
    const dz = absolute.z - current.z;
    const distance = Math.hypot(dx, dz);
    if (distance <= maxStep) {
      return {
        position: ground(absolute.x, absolute.z),
        target: absolute,
        distanceRemaining: 0,
        reached: true,
      };
    }
    const scale = maxStep / distance;
    const nextX = current.x + dx * scale;
    const nextZ = current.z + dz * scale;
    return {
      position: ground(nextX, nextZ),
      target: absolute,
      distanceRemaining: rounded(distance - maxStep),
      reached: false,
    };
  }

  const delta = directionDelta(args) ?? { dx: 0, dz: 0 };
  return {
    position: ground(
      current.x + Math.max(-maxStep, Math.min(maxStep, delta.dx)),
      current.z + Math.max(-maxStep, Math.min(maxStep, delta.dz)),
    ),
  };
}

export function resolveBlockableAgentMoveTarget(
  args: Record<string, unknown>,
  current: Vec3,
  maxStep: number,
  ground: (x: number, z: number) => Vec3,
  blockedAt: (x: number, z: number) => AgentMoveBlock | null,
): BlockableAgentMoveTarget {
  let blocked: AgentMoveBlock | undefined;
  const moved = resolveAgentMoveTarget(args, current, maxStep, (x, z) => {
    blocked = blockedAt(x, z) ?? undefined;
    return blocked ? { ...current } : ground(x, z);
  });
  if (!blocked) return moved;

  return {
    ...moved,
    position: { ...current },
    distanceRemaining: moved.target
      ? rounded(Math.hypot(moved.target.x - current.x, moved.target.z - current.z))
      : moved.distanceRemaining,
    reached: false,
    blocked,
  };
}
