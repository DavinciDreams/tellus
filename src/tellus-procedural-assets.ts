import * as THREE from "three";
import { buildHomePlanModel, homePlanFixtureById, validateHomePlan, type HomePlan } from "./home-planner";
import { procPlantPlaceableById } from "./tellus-procplant-biomes";
import { buildProcPlantObject, procPlantPresets } from "./tellus-procplants";
import { buildProceduralObject, proceduralArchetype } from "./tellus-veg-archetypes";
import {
  buildProceduralBuildingModel,
  normalizeBuildingLighting,
  normalizeBuildingMaterial,
  proceduralBuildingArchetype,
  type BuildingLightingStyle,
  type BuildingMaterialStyle,
  type ProceduralBuildingType,
} from "./tellus-proc-buildings";

// ── procedural:// placeable assets ────────────────────────────────────────────────────────────────
// A GeneratedThing whose modelUrl is `procedural://<archetype>?seed=N` renders a locally built
// procedural mesh instead of fetching a GLB — instant, free, fully deterministic, and it flows
// through the EXISTING world protocol untouched (the server treats modelUrl as an opaque string), so
// placement/sync/clone/throw/delete all just work on every client.

export const PROCEDURAL_URL_PREFIX = "procedural://";
export const HOME_PLAN_ARCHETYPE_PREFIX = "home-plan-";

export const isProceduralModelUrl = (url: string | undefined | null): url is string =>
  typeof url === "string" && url.startsWith(PROCEDURAL_URL_PREFIX);

/** Canonicalize a possibly-mangled procedural URL (URL normalizers elsewhere may have prefixed
 * "/" — e.g. `/procedural://x`); returns the clean `procedural://…` form, or null if not procedural. */
export const sanitizeProceduralModelUrl = (url: string | undefined | null): string | null => {
  if (typeof url !== "string") return null;
  const trimmed = url.replace(/^\/+/, "");
  return trimmed.startsWith(PROCEDURAL_URL_PREFIX) ? trimmed : null;
};

export const makeProceduralModelUrl = (archetypeId: string, seed: number): string =>
  `${PROCEDURAL_URL_PREFIX}${archetypeId}?seed=${seed >>> 0}`;

export const makeProcPlantModelUrl = (presetId: string, seed: number): string =>
  `${PROCEDURAL_URL_PREFIX}procplant-${presetId.toLowerCase()}?seed=${seed >>> 0}`;

export const makeHomePlanModelUrl = (fixtureId: string, seed: number): string =>
  `${PROCEDURAL_URL_PREFIX}${HOME_PLAN_ARCHETYPE_PREFIX}${fixtureId.toLowerCase()}?seed=${seed >>> 0}`;

export const makeCustomHomePlanModelUrl = (plan: HomePlan, seed: number): string => {
  const params = new URLSearchParams({ seed: String(seed >>> 0), plan: JSON.stringify(plan) });
  return `${PROCEDURAL_URL_PREFIX}${HOME_PLAN_ARCHETYPE_PREFIX}custom?${params.toString()}`;
};

export const makeProceduralBuildingModelUrl = (
  archetypeId: string,
  seed: number,
  options: {
    material?: BuildingMaterialStyle;
    lighting?: BuildingLightingStyle;
    roof?: boolean;
  } = {},
): string => {
  const params = new URLSearchParams({ seed: String(seed >>> 0) });
  if (options.material && options.material !== "auto") params.set("material", options.material);
  if (options.lighting && options.lighting !== "warm") params.set("lighting", options.lighting);
  if (options.roof === false) params.set("roof", "0");
  return `${PROCEDURAL_URL_PREFIX}${archetypeId}?${params.toString()}`;
};

export const MIRROR_ARCHETYPE_ID = "mirror";

export const parseProceduralModelUrl = (
  url: string,
): {
  archetypeId: string;
  seed: number;
  building?: {
    recipeId: ProceduralBuildingType;
    material?: BuildingMaterialStyle;
    lighting?: BuildingLightingStyle;
    roof?: boolean;
  };
  procPlant?: {
    presetId: string;
  };
  homePlan?: {
    fixtureId?: string;
    plan?: HomePlan;
  };
} | null => {
  if (!isProceduralModelUrl(url)) return null;
  const rest = url.slice(PROCEDURAL_URL_PREFIX.length);
  const q = rest.indexOf("?");
  const archetypeId = (q >= 0 ? rest.slice(0, q) : rest).toLowerCase();
  const params = q >= 0 ? new URLSearchParams(rest.slice(q + 1)) : null;
  const building = proceduralBuildingArchetype(archetypeId);
  const procPlant = procPlantPlaceableById(archetypeId);
  const homePlanFixtureId = archetypeId.startsWith(HOME_PLAN_ARCHETYPE_PREFIX)
    ? archetypeId.slice(HOME_PLAN_ARCHETYPE_PREFIX.length)
    : null;
  const homePlan = homePlanFixtureId ? homePlanFixtureById(homePlanFixtureId) : undefined;
  const customHomePlan = homePlanFixtureId === "custom" ? parseCustomHomePlan(params?.get("plan")) : undefined;
  // The mirror isn't a vegetation archetype — accept it here
  // so it rides the same procedural:// place/sync/clone pipeline.
  if (
    archetypeId !== MIRROR_ARCHETYPE_ID &&
    !building &&
    !procPlant &&
    !homePlan &&
    !customHomePlan &&
    !proceduralArchetype(archetypeId)
  ) return null;
  let seed = 1;
  let material: BuildingMaterialStyle | undefined;
  let lighting: BuildingLightingStyle | undefined;
  let roof: boolean | undefined;
  if (params) {
    const m = params.get("seed");
    if (m) seed = Number(m) >>> 0;
    material = normalizeBuildingMaterial(params.get("material"));
    lighting = normalizeBuildingLighting(params.get("lighting"));
    const roofParam = params.get("roof");
    if (roofParam === "0" || roofParam === "false") roof = false;
    if (roofParam === "1" || roofParam === "true") roof = true;
  }
  if (building) {
    return {
      archetypeId,
      seed,
      building: {
        recipeId: building.id,
        material,
        lighting,
        roof,
      },
    };
  }
  if (procPlant) {
    return { archetypeId, seed, procPlant: { presetId: procPlant.presetId } };
  }
  if (customHomePlan) {
    return { archetypeId, seed, homePlan: { plan: customHomePlan } };
  }
  if (homePlanFixtureId && homePlan) {
    return { archetypeId, seed, homePlan: { fixtureId: homePlanFixtureId } };
  }
  return { archetypeId, seed };
};

const parseCustomHomePlan = (encoded: string | null | undefined): HomePlan | undefined => {
  if (!encoded) return undefined;
  try {
    const value = JSON.parse(encoded) as HomePlan;
    return validateHomePlan(value).length === 0 ? value : undefined;
  } catch {
    return undefined;
  }
};

// Small build cache — repeated placements of the same url (clones, remote patches) share nothing
// mutable, so hand out a fresh clone of a cached prototype each time.
const prototypeCache = new Map<string, THREE.Group>();

export const buildProceduralModel = (
  url: string,
  rendererIsWebGPU = false,
): THREE.Group | null => {
  const parsed = parseProceduralModelUrl(url);
  if (!parsed) return null;
  // Mirrors are intentionally static glass: live reflectors add hidden full-scene render passes.
  if (parsed.archetypeId === MIRROR_ARCHETYPE_ID) {
    return buildMirrorModel(rendererIsWebGPU);
  }
  let proto = prototypeCache.get(url);
  if (!proto) {
    const built = parsed.building
      ? buildProceduralBuildingModel(parsed.building.recipeId, parsed.seed, parsed.building)
      : parsed.procPlant
        ? buildProcPlantObject(procPlantPresets[parsed.procPlant.presetId], parsed.seed)
      : parsed.homePlan
        ? buildHomePlanModel(parsed.homePlan.plan ?? homePlanFixtureById(parsed.homePlan.fixtureId!)!)
      : buildProceduralObject(parsed.archetypeId, parsed.seed);
    if (!built) return null;
    proto = built;
    prototypeCache.set(url, proto);
    if (prototypeCache.size > 200) {
      const first = prototypeCache.keys().next().value;
      if (first) prototypeCache.delete(first);
    }
  }
  // Clone shares geometry/material (cheap); transforms are per-instance.
  const clone = proto.clone(true);
  clone.userData.sharedProcedural = true;
  clone.traverse((child) => {
    child.userData.sharedProcedural = true;
  });
  return clone;
};

// ── Mirror (procedural://mirror) ─────────────────────────────────────────────────────────────────
// A framed standing mirror ~2.5m tall. It is permanently static tinted glass: live planar
// reflection is reserved for the classic Tellus ocean, where the visual payoff is much higher.

// Mirror geometry, in metres before fitModelToHeight rescales to assetTargetHeight.
const MIRROR_GLASS_W = 1.1;
const MIRROR_GLASS_H = 2.0;
const MIRROR_FRAME_T = 0.09;
const MIRROR_FRAME_D = 0.12;

export const resetLiveMirrors = (): void => undefined;

function buildMirrorFrame(): THREE.Group {
  const group = new THREE.Group();
  const frameMaterial = new THREE.MeshStandardMaterial({
    color: 0x6b4a2c,
    roughness: 0.55,
    metalness: 0.15,
  });
  const halfW = MIRROR_GLASS_W / 2 + MIRROR_FRAME_T / 2;
  const halfH = MIRROR_GLASS_H / 2 + MIRROR_FRAME_T / 2;
  const vBar = new THREE.BoxGeometry(MIRROR_FRAME_T, MIRROR_GLASS_H + MIRROR_FRAME_T * 2, MIRROR_FRAME_D);
  const hBar = new THREE.BoxGeometry(MIRROR_GLASS_W + MIRROR_FRAME_T * 2, MIRROR_FRAME_T, MIRROR_FRAME_D);
  for (const [geom, x, y] of [
    [vBar, -halfW, 0],
    [vBar, halfW, 0],
    [hBar, 0, halfH],
    [hBar, 0, -halfH],
  ] as const) {
    const bar = new THREE.Mesh(geom, frameMaterial);
    bar.position.set(x, y, 0);
    bar.castShadow = true;
    bar.receiveShadow = true;
    group.add(bar);
  }
  // A little base so it reads as a standing mirror rather than a floating pane.
  const foot = new THREE.Mesh(
    new THREE.BoxGeometry(MIRROR_GLASS_W * 0.9, MIRROR_FRAME_T * 1.4, MIRROR_FRAME_D * 2.4),
    frameMaterial,
  );
  foot.position.set(0, -MIRROR_GLASS_H / 2 - MIRROR_FRAME_T, 0);
  foot.castShadow = true;
  group.add(foot);
  return group;
}

/** A static (non-reflecting) glass pane: env-mapped tinted glass. */
function buildGlassPlane(): THREE.Mesh {
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(MIRROR_GLASS_W, MIRROR_GLASS_H),
    new THREE.MeshStandardMaterial({
      color: 0xaec6d6,
      roughness: 0.08,
      metalness: 0.9,
      envMapIntensity: 1.4,
      transparent: true,
      opacity: 0.82,
      side: THREE.DoubleSide,
    }),
  );
  glass.name = "tellus-mirror-glass";
  return glass;
}

/** A static (non-reflecting) framed glass mirror. */
function buildStaticMirror(): THREE.Group {
  const group = new THREE.Group();
  group.name = "tellus-mirror";
  group.add(buildMirrorFrame());
  const glass = buildGlassPlane();
  group.add(glass);
  group.userData.mirrorGlass = true;
  return group;
}

function buildMirrorModel(_rendererIsWebGPU: boolean): THREE.Group {
  return buildStaticMirror();
}
