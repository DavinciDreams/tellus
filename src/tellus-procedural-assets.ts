import * as THREE from "three";
import { Reflector } from "three/examples/jsm/objects/Reflector.js";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { reflector } from "three/tsl";
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
} | null => {
  if (!isProceduralModelUrl(url)) return null;
  const rest = url.slice(PROCEDURAL_URL_PREFIX.length);
  const q = rest.indexOf("?");
  const archetypeId = (q >= 0 ? rest.slice(0, q) : rest).toLowerCase();
  const building = proceduralBuildingArchetype(archetypeId);
  // The mirror isn't a vegetation archetype (it builds a Reflector, not a template) — accept it here
  // so it rides the same procedural:// place/sync/clone pipeline.
  if (archetypeId !== MIRROR_ARCHETYPE_ID && !building && !proceduralArchetype(archetypeId)) return null;
  let seed = 1;
  let material: BuildingMaterialStyle | undefined;
  let lighting: BuildingLightingStyle | undefined;
  let roof: boolean | undefined;
  if (q >= 0) {
    const params = new URLSearchParams(rest.slice(q + 1));
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
  return { archetypeId, seed };
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
  // A mirror is special — it owns a live Reflector render target, so it is NEVER cloned from a
  // prototype (each placement is its own reflective surface). Build a fresh one every time.
  if (parsed.archetypeId === MIRROR_ARCHETYPE_ID) {
    return buildMirrorModel(rendererIsWebGPU);
  }
  let proto = prototypeCache.get(url);
  if (!proto) {
    const built = parsed.building
      ? buildProceduralBuildingModel(parsed.building.recipeId, parsed.seed, parsed.building)
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
  return proto.clone(true);
};

// ── Mirror (procedural://mirror) ─────────────────────────────────────────────────────────────────
// A framed standing mirror ~2.5m tall. The reflective surface uses three's Reflector — a WebGL
// render-to-texture pass. To keep the cost sane only a few mirrors render live; extras (and the
// WebGPU path, where Reflector can't compile) fall back to a static env-mapped tinted-glass plane.

// Mirror geometry, in metres before fitModelToHeight rescales to assetTargetHeight.
const MIRROR_GLASS_W = 1.1;
const MIRROR_GLASS_H = 2.0;
const MIRROR_FRAME_T = 0.09;
const MIRROR_FRAME_D = 0.12;

// Cap on simultaneously-LIVE reflective mirrors. Each one is an extra full-scene render pass per
// frame, so beyond this the next mirrors render as plain tinted glass (no reflection, no extra pass).
export const MAX_LIVE_MIRRORS = 3;
// A live-mirror slot is backend-agnostic: it wraps either a WebGL Reflector or a WebGPU TSL reflector
// node, exposing a uniform dispose() so the cap accounting + teardown work the same on both paths.
interface MirrorSlot {
  dispose(): void;
}
const liveReflectors = new Set<MirrorSlot>();

/** How many live (reflecting) mirrors exist right now — for diagnostics / the cap note. */
export const liveMirrorCount = (): number => liveReflectors.size;

/** Drop all tracked live-mirror slots (call on world teardown so a remount starts the cap fresh).
 * Render-target disposal is owned by each mirror's disposeMirror via disposeObject. */
export const resetLiveMirrors = (): void => {
  liveReflectors.clear();
};

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

/** A static (non-reflecting) glass pane: env-mapped tinted glass. Used on WebGPU, on a Reflector
 * failure, and once the live-mirror cap is reached. */
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

/** A static (non-reflecting) framed glass mirror — env-mapped tinted glass. The fallback once the
 *  live-mirror cap is reached, or if a live reflector can't be built on this backend. */
function buildStaticMirror(): THREE.Group {
  const group = new THREE.Group();
  group.name = "tellus-mirror";
  group.add(buildMirrorFrame());
  const glass = buildGlassPlane();
  group.add(glass);
  group.userData.mirrorGlass = true;
  return group;
}

/** WebGL path: three's classic {@link Reflector} — a render-to-texture planar mirror. */
function buildWebGLReflectorMirror(): THREE.Group | null {
  try {
    const reflectorMesh = new Reflector(new THREE.PlaneGeometry(MIRROR_GLASS_W, MIRROR_GLASS_H), {
      clipBias: 0.003,
      textureWidth: 512, // modest render-target resolution keeps the extra pass cheap
      textureHeight: 1024,
      color: 0x889098,
    });
    reflectorMesh.name = "tellus-mirror-reflector";
    const group = new THREE.Group();
    group.name = "tellus-mirror";
    group.add(buildMirrorFrame());
    group.add(reflectorMesh);
    const slot: MirrorSlot = { dispose: () => reflectorMesh.dispose?.() };
    liveReflectors.add(slot);
    group.userData.mirrorReflector = reflectorMesh;
    group.userData.disposeMirror = () => {
      liveReflectors.delete(slot);
      slot.dispose();
    };
    return group;
  } catch (error) {
    console.warn("Mirror Reflector (WebGL) unavailable — using static glass", error);
    return null;
  }
}

/** WebGPU path: a TSL <c>reflector()</c> node planar mirror (the classic Reflector is WebGL-only, so
 *  on WebGPU the old code silently fell back to non-reflecting glass — that was "mirrors don't mirror").
 *  The reflector's target plane reflects across its local +Z; we coincide it with the glass (group
 *  origin, facing +Z) and PARENT it to the group so the reflection tracks the mirror as the user moves
 *  or rotates it. The reflection is sampled unlit (MeshBasicNodeMaterial) so it reads as a true mirror. */
function buildWebGPUReflectorMirror(): THREE.Group | null {
  try {
    // resolutionScale 0.5 = half-res reflection target (cheap); bounces:false avoids mirror-in-mirror
    // recursion and keeps it to one extra pass per frame.
    const reflection = reflector({ resolutionScale: 0.5, bounces: false });
    const material = new MeshBasicNodeMaterial();
    material.colorNode = reflection;
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(MIRROR_GLASS_W, MIRROR_GLASS_H), material);
    glass.name = "tellus-mirror-reflector";
    const group = new THREE.Group();
    group.name = "tellus-mirror";
    group.add(buildMirrorFrame());
    group.add(glass);
    reflection.target.position.set(0, 0, 0);
    group.add(reflection.target);
    const slot: MirrorSlot = { dispose: () => reflection.dispose?.() };
    liveReflectors.add(slot);
    group.userData.mirrorReflector = reflection;
    group.userData.disposeMirror = () => {
      liveReflectors.delete(slot);
      slot.dispose();
    };
    return group;
  } catch (error) {
    console.warn("Mirror reflector (WebGPU) unavailable — using static glass", error);
    return null;
  }
}

function buildMirrorModel(rendererIsWebGPU: boolean): THREE.Group {
  // Within the cap, build a LIVE reflecting mirror for this backend; over the cap (or on a build
  // failure) fall back to static tinted glass — one extra full-scene pass per live mirror.
  if (liveReflectors.size < MAX_LIVE_MIRRORS) {
    // Three r183's WebGPU TSL reflector can bind its half-res texture as both sampled input and
    // render attachment in one pass, invalidating the frame command buffer. Keep WebGPU stable with
    // static glass until that path is upgraded; WebGL's Reflector remains live.
    const live = rendererIsWebGPU ? null : buildWebGLReflectorMirror();
    if (live) return live;
  }
  return buildStaticMirror();
}
