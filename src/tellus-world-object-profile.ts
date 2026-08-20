import type { GeneratedKind, GeneratedThing, Vec3 } from "./tellus-types";
import type { VehicleMode } from "./tellus-types";
import { airMountTerms, groundMountTerms, waterMountTerms } from "./tellus-constants";
import { assetStoreGameOptimizedModelUrl, assetStoreIdFromModelUrl } from "./tellus-urls-identity";
import { clamp, promptIncludesAny } from "./tellus-utils";

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Tellus world units are meters-ish. This is the canonical ruler for authored/generated scale:
// humanoids fit to this height, and world-object categories are sized as ratios from it.
export const STANDARD_HUMANOID_HEIGHT = 1.8;

const AVATAR_HEIGHT_RATIOS = {
  mirror: 1.39,
  grassTuft: 0.18,
  fern: 0.31,
  reeds: 0.61,
  bush: 0.47,
  mushroom: 0.16,
  proceduralFlower: 0.25,
  airMount: 2.67,
  waterMount: 0.81,
  groundMount: 1.14,
  tree: 2.33,
  building: 2.0,
  tower: 2.89,
  path: 0.23,
  animal: 0.86,
  flower: 0.32,
  stone: 0.56,
  shrine: 1.22,
  object: 0.75,
} as const;

export type WorldThingPlacementMode =
  | "grounded"
  | "elevated"
  | "water"
  | "air"
  | "mounted";

export type WorldThingControllerKind =
  | "static"
  | "quadruped"
  | "ground-vehicle"
  | "water-vehicle"
  | "air-vehicle";

export interface WorldThingAssetIdentity {
  assetStoreModelId?: string;
  modelUrl?: string;
  stableKey: string;
  source: "asset-store" | "procedural" | "url" | "missing";
}

export interface WorldThingDimensions {
  radius: number;
  height: number;
}

export interface WorldThingRuntimeProfile {
  id: string;
  placementMode: WorldThingPlacementMode;
  controllerKind: WorldThingControllerKind;
  asset: WorldThingAssetIdentity;
  targetHeight: number;
  dimensions?: WorldThingDimensions;
  groundOffset?: number;
  hasManualGroundOffset: boolean;
  seatHeight: number;
  collisionRadius: number;
  collisionHeight: number;
}

export function normalizeWorldThingAssetIdentity(
  modelUrl?: string,
  assetStoreModelId?: string,
): WorldThingAssetIdentity {
  const assetId =
    assetStoreModelId?.trim() ||
    (modelUrl ? assetStoreIdFromModelUrl(modelUrl) ?? undefined : undefined);
  if (assetId) {
    return {
      assetStoreModelId: assetId,
      modelUrl: assetStoreGameOptimizedModelUrl(assetId),
      stableKey: `asset-store:${assetId}`,
      source: "asset-store",
    };
  }
  const trimmedModelUrl = modelUrl?.trim();
  if (!trimmedModelUrl) {
    return { stableKey: "missing", source: "missing" };
  }
  return {
    modelUrl: trimmedModelUrl,
    stableKey: trimmedModelUrl.startsWith("procedural://")
      ? `procedural:${trimmedModelUrl}`
      : `url:${trimmedModelUrl}`,
    source: trimmedModelUrl.startsWith("procedural://") ? "procedural" : "url",
  };
}

export function worldThingVehicleMode(thing: Pick<GeneratedThing, "kind" | "prompt">): VehicleMode | null {
  const lower = thing.prompt.toLowerCase();
  const hasVehicleTerm = (terms: readonly string[]): boolean =>
    terms.some((term) => new RegExp(`(^|\\W)${escapeRegex(term)}(\\W|$)`, "i").test(lower));
  if (
    thing.kind === "balloon" ||
    hasVehicleTerm(airMountTerms) ||
    lower.includes("balloon") ||
    lower.includes("airship") ||
    lower.includes("zeppelin") ||
    lower.includes("glider") ||
    lower.includes("flying") ||
    lower.includes("air boat")
  ) {
    return "air";
  }
  if (
    hasVehicleTerm(waterMountTerms) ||
    lower.includes("boat") ||
    lower.includes("ship") ||
    lower.includes("sail") ||
    lower.includes("canoe") ||
    lower.includes("raft") ||
    lower.includes("skiff") ||
    lower.includes("dinghy")
  ) {
    return "water";
  }
  if (
    hasVehicleTerm(groundMountTerms) ||
    lower.includes("vehicle") ||
    lower.includes("cart") ||
    lower.includes("wagon") ||
    lower.includes("carriage") ||
    lower.includes("car ") ||
    lower.includes("truck")
  ) {
    return "ground";
  }
  return null;
}

const proceduralBuildingBaseHeights: Record<string, number> = {
  "simple-house": 5.2,
  "long-house": 5.4,
  inn: 8.2,
  bank: 7.6,
  store: 5.4,
  smithy: 4.8,
  mansion: 9.4,
  manor: 9.8,
  keep: 13,
  fortress: 12,
  castle: 17,
  church: 10,
  cathedral: 18,
  chapel: 7,
  "guild-hall": 8.6,
  "town-hall": 9.2,
};

function proceduralBuildingRecipeId(modelUrl?: string): string | null {
  const match = /^procedural:\/\/building-([^?]+)/.exec(modelUrl ?? "");
  return match?.[1] ?? null;
}

function proceduralHomePlanId(modelUrl?: string): string | null {
  const match = /^procedural:\/\/home-plan-([^?]+)/.exec(modelUrl ?? "");
  return match?.[1] ?? null;
}

function avatarHeight(ratio: number): number {
  return STANDARD_HUMANOID_HEIGHT * ratio;
}

function isHumanoidPrompt(lower: string): boolean {
  return (
    lower.includes("humanoid") ||
    lower.includes("human") ||
    lower.includes("person") ||
    lower.includes("people") ||
    lower.includes("npc") ||
    lower.includes("villager") ||
    lower.includes("character") ||
    lower.includes("shopkeeper") ||
    lower.includes("wizard") ||
    lower.includes("knight") ||
    lower.includes("guard") ||
    lower.includes("avatar") ||
    lower.includes("robot")
  );
}

export function worldThingTargetHeight(
  thing: Pick<GeneratedThing, "kind" | "prompt" | "scale" | "modelUrl">,
): number {
  const lower = thing.prompt.toLowerCase();
  const variation = clamp(thing.scale, 0.25, 12);
  if (lower === "mirror") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.mirror) * variation, 1.2, 12);
  const buildingRecipeId = proceduralBuildingRecipeId(thing.modelUrl);
  if (buildingRecipeId) {
    return clamp((proceduralBuildingBaseHeights[buildingRecipeId] ?? 7.2) * variation, 2.4, 64);
  }
  if (proceduralHomePlanId(thing.modelUrl)) {
    return clamp(3.2 * variation, 2.4, 12);
  }

  const proceduralPlantHeights: Record<string, number> = {
    "grass tuft": avatarHeight(AVATAR_HEIGHT_RATIOS.grassTuft),
    fern: avatarHeight(AVATAR_HEIGHT_RATIOS.fern),
    reeds: avatarHeight(AVATAR_HEIGHT_RATIOS.reeds),
    bush: avatarHeight(AVATAR_HEIGHT_RATIOS.bush),
    mushroom: avatarHeight(AVATAR_HEIGHT_RATIOS.mushroom),
    flower: avatarHeight(AVATAR_HEIGHT_RATIOS.proceduralFlower),
  };
  if (proceduralPlantHeights[lower] !== undefined) {
    return clamp(proceduralPlantHeights[lower] * variation, 0.12, 24);
  }

  const mode = worldThingVehicleMode(thing);
  if (mode === "air") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.airMount) * variation, 1.6, 54);
  if (mode === "water") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.waterMount) * variation, 0.45, 18);
  if (mode === "ground") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.groundMount) * variation, 0.65, 24);
  if (isHumanoidPrompt(lower)) return clamp(STANDARD_HUMANOID_HEIGHT * variation, 0.8, 24);
  if (thing.kind === "tree") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.tree) * variation, 0.8, 52);
  if (isBuildingPrompt(lower)) return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.building) * variation, 0.9, 48);
  if (lower.includes("tower")) return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.tower) * variation, 1.2, 64);
  if (isFlatPathPrompt(lower) || thing.kind === "path") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.path) * variation, 0.12, 8);
  if (thing.kind === "animal") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.animal) * variation, 0.45, 24);
  if (thing.kind === "flower") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.flower) * variation, 0.16, 9);
  if (thing.kind === "stone") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.stone) * variation, 0.25, 18);
  if (thing.kind === "shrine") return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.shrine) * variation, 0.55, 32);
  return clamp(avatarHeight(AVATAR_HEIGHT_RATIOS.object) * variation, 0.35, 24);
}

export function defaultScaleForRealisticKind(kind: GeneratedKind, prompt: string): number {
  const lower = prompt.toLowerCase();
  if (kind === "tree") {
    if (lower.includes("oak") || lower.includes("broadleaf")) return 1.45;
    return 1;
  }
  if (kind === "animal") return 1;
  if (kind === "flower") return lower.includes("pot") || lower.includes("planter") ? 1.2 : 0.85;
  if (kind === "path") return 1;
  if (isBuildingPrompt(lower)) return 1.8;
  if (isFlatPathPrompt(lower)) return 1;
  return 1;
}

export function buildWorldThingRuntimeProfile(
  thing: GeneratedThing,
  options: {
    dimensions?: WorldThingDimensions;
    groundY?: number | null;
    mounted?: boolean;
  } = {},
): WorldThingRuntimeProfile {
  const mode = worldThingVehicleMode(thing);
  const groundOffset =
    options.groundY !== null && options.groundY !== undefined && Number.isFinite(options.groundY)
      ? thing.position.y - options.groundY
      : undefined;
  const hasManualGroundOffset = groundOffset !== undefined && Math.abs(groundOffset) > 0.35;
  const placementMode: WorldThingPlacementMode = options.mounted
    ? "mounted"
    : mode === "air"
      ? "air"
      : mode === "water"
        ? "water"
        : hasManualGroundOffset
          ? "elevated"
          : "grounded";
  const controllerKind: WorldThingControllerKind =
    mode === "air"
      ? "air-vehicle"
      : mode === "water"
        ? "water-vehicle"
        : mode === "ground"
          ? thing.kind === "animal"
            ? "quadruped"
            : "ground-vehicle"
          : "static";
  const targetHeight = worldThingTargetHeight(thing);
  const height = options.dimensions?.height ?? targetHeight;
  const buildingRecipeId = proceduralBuildingRecipeId(thing.modelUrl);
  const buildingLike = Boolean(buildingRecipeId || proceduralHomePlanId(thing.modelUrl));
  const radius =
    options.dimensions?.radius ??
    Math.max(0.2, targetHeight * (buildingLike ? 0.42 : 0.28));
  return {
    id: thing.id,
    placementMode,
    controllerKind,
    asset: normalizeWorldThingAssetIdentity(thing.modelUrl, thing.assetStoreModelId),
    targetHeight,
    dimensions: options.dimensions,
    groundOffset,
    hasManualGroundOffset,
    seatHeight: seatHeightForThing(thing, height),
    collisionRadius: buildingLike
      ? clamp(radius * 0.82, 1.2, 14)
      : clamp(radius * 0.72, 0.45, 4.2),
    collisionHeight: buildingLike ? clamp(height, 1.8, 36) : clamp(height, 0.8, 18),
  };
}

export function seatPositionForWorldThing(
  thing: GeneratedThing,
  profile: WorldThingRuntimeProfile,
  visualCenterOffset?: Vec3,
): Vec3 {
  return {
    x: thing.position.x + (visualCenterOffset?.x ?? 0),
    y: thing.position.y + profile.seatHeight,
    z: thing.position.z + (visualCenterOffset?.z ?? 0),
  };
}

function seatHeightForThing(thing: GeneratedThing, height: number): number {
  const mode = worldThingVehicleMode(thing);
  // Visitor mesh origins are at the avatar's feet. For rideable animals, the mount "seat" is therefore
  // the rider-origin height that visually drops the hips toward the saddle, not the saddle-top height.
  if (mode === "ground" && thing.kind === "animal") return clamp(height * 0.38, 0.35, 1.45);
  if (mode === "ground") return clamp(height * 0.62, 0.45, 2.8);
  if (mode === "water") return clamp(height * 0.7, 0.45, 3.6);
  if (mode === "air") return clamp(height * 0.55, 1.0, 5.5);
  return Math.max(0.4, height) + 0.08;
}

function isBuildingPrompt(lower: string): boolean {
  return (
    lower.includes("hut") ||
    lower.includes("house") ||
    lower.includes("cottage") ||
    lower.includes("cabin") ||
    lower.includes("workshop") ||
    lower.includes("building")
  );
}

function isFlatPathPrompt(lower: string): boolean {
  return (
    lower.includes("bridge") ||
    lower.includes("dock") ||
    lower.includes("pier") ||
    lower.includes("path") ||
    lower.includes("road")
  );
}
