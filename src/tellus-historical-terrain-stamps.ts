export type HistoricalTerrainSiteId = "cahokia" | "chaco";

export type HistoricalTerrainStampMode = "raise" | "lower";

export interface HistoricalTerrainStamp {
  id: string;
  siteId: HistoricalTerrainSiteId;
  label: string;
  mode: HistoricalTerrainStampMode;
  center: { x: number; z: number };
  radius: { x: number; z: number };
  height: number;
  rotationDeg?: number;
  plateau?: number;
}

const DEFAULT_WORLD_SPAN = 64 * 96;

const CAHOKIA_STAMPS: readonly HistoricalTerrainStamp[] = [
  {
    id: "cahokia-monks-mound",
    siteId: "cahokia",
    label: "Monks Mound platform",
    mode: "raise",
    center: { x: 0.5, z: 0.49 },
    radius: { x: 0.075, z: 0.052 },
    height: 18,
    rotationDeg: -7,
    plateau: 0.48,
  },
  {
    id: "cahokia-mound-72",
    siteId: "cahokia",
    label: "Mound 72",
    mode: "raise",
    center: { x: 0.46, z: 0.62 },
    radius: { x: 0.025, z: 0.017 },
    height: 5,
    rotationDeg: 18,
    plateau: 0.32,
  },
  {
    id: "cahokia-woodhenge",
    siteId: "cahokia",
    label: "Woodhenge rise",
    mode: "raise",
    center: { x: 0.39, z: 0.55 },
    radius: { x: 0.035, z: 0.035 },
    height: 3,
    plateau: 0.25,
  },
];

const CHACO_STAMPS: readonly HistoricalTerrainStamp[] = [
  {
    id: "chaco-pueblo-bonito",
    siteId: "chaco",
    label: "Pueblo Bonito inset",
    mode: "lower",
    center: { x: 0.5, z: 0.5 },
    radius: { x: 0.06, z: 0.04 },
    height: 3.5,
    rotationDeg: -12,
    plateau: 0.52,
  },
  {
    id: "chaco-chetro-ketl",
    siteId: "chaco",
    label: "Chetro Ketl inset",
    mode: "lower",
    center: { x: 0.57, z: 0.47 },
    radius: { x: 0.052, z: 0.033 },
    height: 2.6,
    rotationDeg: -8,
    plateau: 0.45,
  },
  {
    id: "chaco-casa-rinconada",
    siteId: "chaco",
    label: "Casa Rinconada kiva bowl",
    mode: "lower",
    center: { x: 0.47, z: 0.6 },
    radius: { x: 0.026, z: 0.026 },
    height: 2,
    plateau: 0.2,
  },
];

export function historicalTerrainSiteForWorldId(worldId: string): HistoricalTerrainSiteId | null {
  const lower = worldId.toLowerCase();
  if (lower.includes("cahokia")) return "cahokia";
  if (lower.includes("chaco")) return "chaco";
  return null;
}

export function historicalTerrainStampsForWorldId(worldId: string): readonly HistoricalTerrainStamp[] {
  const siteId = historicalTerrainSiteForWorldId(worldId);
  if (siteId === "cahokia") return CAHOKIA_STAMPS;
  if (siteId === "chaco") return CHACO_STAMPS;
  return [];
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

function stampOffsetAt(
  stamp: HistoricalTerrainStamp,
  worldX: number,
  worldZ: number,
  worldWidth: number,
  worldDepth: number,
): number {
  const cx = stamp.center.x * worldWidth;
  const cz = stamp.center.z * worldDepth;
  const rx = Math.max(1, stamp.radius.x * worldWidth);
  const rz = Math.max(1, stamp.radius.z * worldDepth);
  const radians = ((stamp.rotationDeg ?? 0) * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const dx = worldX - cx;
  const dz = worldZ - cz;
  const localX = (dx * cos + dz * sin) / rx;
  const localZ = (-dx * sin + dz * cos) / rz;
  const normalizedDistance = Math.sqrt(localX * localX + localZ * localZ);
  if (normalizedDistance >= 1) return 0;

  const plateau = Math.max(0, Math.min(0.95, stamp.plateau ?? 0.35));
  const falloff = 1 - smoothstep(plateau, 1, normalizedDistance);
  const signedHeight = stamp.mode === "lower" ? -stamp.height : stamp.height;
  return signedHeight * falloff;
}

export function historicalTerrainStampOffsetAt(
  worldX: number,
  worldZ: number,
  worldId: string,
  worldWidth = DEFAULT_WORLD_SPAN,
  worldDepth = DEFAULT_WORLD_SPAN,
): number {
  const stamps = historicalTerrainStampsForWorldId(worldId);
  if (!stamps.length) return 0;
  const width = Number.isFinite(worldWidth) && worldWidth > 0 ? worldWidth : DEFAULT_WORLD_SPAN;
  const depth = Number.isFinite(worldDepth) && worldDepth > 0 ? worldDepth : DEFAULT_WORLD_SPAN;
  return stamps.reduce((sum, stamp) => sum + stampOffsetAt(stamp, worldX, worldZ, width, depth), 0);
}
