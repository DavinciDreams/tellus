import type {
  LandShapeConfig,
  LandShapeOverrides,
  WorldTemplateId,
} from "./tellus-types";

const TEMPLATE_IDS = new Set<WorldTemplateId>([
  "tellus",
  "wide-island",
  "lowlands",
  "ridge",
  "evoflow-coral-canyon",
  "evoflow-coral-canyon-child",
  "evoflow-spires",
  "evoflow-glass-ridge",
  "evoflow-lichen-basin",
  "evoflow-copper-terraces",
  "evoflow-basalt-teeth",
  "evoflow-coral-fold",
]);

const TEMPLATE_PRESETS: Record<
  WorldTemplateId,
  { defaultSkyboxUrl: string; landShape: LandShapeConfig }
> = {
  tellus: {
    defaultSkyboxUrl: "/skybox/free_-_skybox_in_the_cloud/scene.gltf",
    landShape: {
      mountain: { height: 21, radius: 20, exponent: 2.2 },
      shoulder: { x: -16, z: 12, radius: 190, height: 4.2 },
      southernRise: { x: 9, z: -24, radius: 160, height: 3.1 },
      ridge: { sinScale: 1.05, cosScale: 0.72, diagonalScale: 0.42 },
      shore: { startRatio: 0.72, widthRatio: 0.28, drop: 5.8 },
      pond: { x: 18, z: -12, radius: 7.4, depth: 2.5, falloff: 65 },
      detail: {
        amplitude: 1.75,
        scale: 0.043,
        warp: 8.5,
        ridgeAmplitude: 1.2,
        terraceAmplitude: 0.28,
        terraceFrequency: 0.72,
      },
      baseOffset: -0.65,
    },
  },
  "wide-island": {
    defaultSkyboxUrl: "/skybox/free_-_skybox_in_the_cloud.glb",
    landShape: {
      mountain: { height: 12, radius: 34, exponent: 1.9 },
      shoulder: { x: -24, z: 12, radius: 330, height: 4.1 },
      southernRise: { x: 25, z: -18, radius: 320, height: 3.3 },
      ridge: { sinScale: 0.62, cosScale: 0.5, diagonalScale: 0.28 },
      shore: { startRatio: 0.8, widthRatio: 0.2, drop: 4.4 },
      pond: { x: 17, z: -5, radius: 12.5, depth: 2.7, falloff: 135 },
      detail: {
        amplitude: 1.45,
        scale: 0.031,
        warp: 13,
        ridgeAmplitude: 0.72,
        terraceAmplitude: 0.18,
        terraceFrequency: 0.58,
      },
      baseOffset: -0.75,
    },
  },
  lowlands: {
    defaultSkyboxUrl: "/skybox/free_-_skybox_basic_sky.glb",
    landShape: {
      mountain: { height: 7.5, radius: 42, exponent: 1.55 },
      shoulder: { x: -24, z: 12, radius: 430, height: 2.4 },
      southernRise: { x: 28, z: -25, radius: 420, height: 2.1 },
      ridge: { sinScale: 0.32, cosScale: 0.28, diagonalScale: 0.14 },
      shore: { startRatio: 0.8, widthRatio: 0.2, drop: 4.1 },
      pond: { x: -10, z: 24, radius: 13.5, depth: 1.95, falloff: 155 },
      detail: {
        amplitude: 0.9,
        scale: 0.024,
        warp: 8,
        ridgeAmplitude: 0.25,
        terraceAmplitude: 0.12,
        terraceFrequency: 0.45,
      },
      baseOffset: -1.05,
    },
  },
  ridge: {
    defaultSkyboxUrl: "/skybox/skybox_skydays_3.glb",
    landShape: {
      mountain: { height: 15, radius: 23, exponent: 2.35 },
      shoulder: { x: -13, z: 10, radius: 175, height: 3.1 },
      southernRise: { x: 6, z: -23, radius: 175, height: 2.4 },
      ridge: { sinScale: 1.45, cosScale: 0.9, diagonalScale: 0.72 },
      shore: { startRatio: 0.74, widthRatio: 0.26, drop: 6.2 },
      pond: { x: -18, z: -16, radius: 8, depth: 2.2, falloff: 78 },
      detail: {
        amplitude: 2.15,
        scale: 0.052,
        warp: 11,
        ridgeAmplitude: 1.85,
        terraceAmplitude: 0.42,
        terraceFrequency: 0.86,
      },
      baseOffset: -0.7,
    },
  },
  "evoflow-coral-canyon": {
    defaultSkyboxUrl: "/skybox/tellus-alien-rings/scene.gltf",
    landShape: {
      mountain: { height: 10, radius: 34, exponent: 1.8 },
      shoulder: { x: -18, z: 16, radius: 320, height: 3.2 },
      southernRise: { x: 18, z: -24, radius: 280, height: 2.6 },
      ridge: { sinScale: 0.7, cosScale: 0.52, diagonalScale: 0.36 },
      shore: { startRatio: 0.78, widthRatio: 0.22, drop: 4.8 },
      pond: { x: 16, z: -10, radius: 8.8, depth: 2, falloff: 95 },
      detail: {
        amplitude: 1.2,
        scale: 0.035,
        warp: 9,
        ridgeAmplitude: 1.15,
        terraceAmplitude: 0.22,
        terraceFrequency: 0.68,
      },
      baseOffset: -0.85,
    },
  },
  "evoflow-coral-canyon-child": {
    defaultSkyboxUrl: "/skybox/tellus-starry-night/scene.gltf",
    landShape: {
      mountain: { height: 11, radius: 32, exponent: 1.95 },
      shoulder: { x: -20, z: 12, radius: 300, height: 3.5 },
      southernRise: { x: 20, z: -22, radius: 260, height: 2.8 },
      ridge: { sinScale: 0.78, cosScale: 0.55, diagonalScale: 0.4 },
      shore: { startRatio: 0.78, widthRatio: 0.22, drop: 4.9 },
      pond: { x: 15, z: -12, radius: 8.4, depth: 2.1, falloff: 90 },
      detail: {
        amplitude: 1.28,
        scale: 0.037,
        warp: 10,
        ridgeAmplitude: 1.25,
        terraceAmplitude: 0.25,
        terraceFrequency: 0.7,
      },
      baseOffset: -0.9,
    },
  },
  "evoflow-spires": {
    defaultSkyboxUrl: "/skybox/tellus-blue-clouds/scene.gltf",
    landShape: {
      mountain: { height: 12, radius: 30, exponent: 2 },
      shoulder: { x: -18, z: 14, radius: 290, height: 3.4 },
      southernRise: { x: 18, z: -24, radius: 250, height: 2.7 },
      ridge: { sinScale: 0.8, cosScale: 0.58, diagonalScale: 0.42 },
      shore: { startRatio: 0.78, widthRatio: 0.22, drop: 5 },
      pond: { x: 15, z: -10, radius: 8.2, depth: 2.1, falloff: 90 },
      detail: { amplitude: 1.25, scale: 0.038, warp: 10, ridgeAmplitude: 1.35, terraceAmplitude: 0.28, terraceFrequency: 0.75 },
      baseOffset: -0.9,
    },
  },
  "evoflow-glass-ridge": {
    defaultSkyboxUrl: "/skybox/tellus-aurora-sky/scene.gltf",
    landShape: {
      mountain: { height: 13, radius: 31, exponent: 2.05 },
      shoulder: { x: -16, z: 12, radius: 280, height: 3.2 },
      southernRise: { x: 20, z: -22, radius: 250, height: 2.8 },
      ridge: { sinScale: 0.9, cosScale: 0.6, diagonalScale: 0.48 },
      shore: { startRatio: 0.78, widthRatio: 0.22, drop: 5.2 },
      pond: { x: 15, z: -12, radius: 8, depth: 2.1, falloff: 88 },
      detail: { amplitude: 1.35, scale: 0.04, warp: 11, ridgeAmplitude: 1.5, terraceAmplitude: 0.3, terraceFrequency: 0.78 },
      baseOffset: -0.95,
    },
  },
  "evoflow-lichen-basin": {
    defaultSkyboxUrl: "/skybox/tellus-aurora-sky/scene.gltf",
    landShape: {
      mountain: { height: 10, radius: 34, exponent: 1.8 },
      shoulder: { x: -18, z: 16, radius: 330, height: 3 },
      southernRise: { x: 18, z: -22, radius: 300, height: 2.5 },
      ridge: { sinScale: 0.64, cosScale: 0.5, diagonalScale: 0.34 },
      shore: { startRatio: 0.79, widthRatio: 0.21, drop: 4.7 },
      pond: { x: 14, z: -11, radius: 9.2, depth: 2, falloff: 98 },
      detail: { amplitude: 1.1, scale: 0.035, warp: 9.5, ridgeAmplitude: 1.1, terraceAmplitude: 0.24, terraceFrequency: 0.68 },
      baseOffset: -0.9,
    },
  },
  "evoflow-copper-terraces": {
    defaultSkyboxUrl: "/skybox/tellus-desert-sunset/scene.gltf",
    landShape: {
      mountain: { height: 9.5, radius: 35, exponent: 1.75 },
      shoulder: { x: -20, z: 14, radius: 330, height: 2.9 },
      southernRise: { x: 20, z: -24, radius: 300, height: 2.4 },
      ridge: { sinScale: 0.62, cosScale: 0.46, diagonalScale: 0.32 },
      shore: { startRatio: 0.8, widthRatio: 0.2, drop: 4.6 },
      pond: { x: 14, z: -10, radius: 9, depth: 1.9, falloff: 96 },
      detail: { amplitude: 1.05, scale: 0.033, warp: 9, ridgeAmplitude: 1, terraceAmplitude: 0.32, terraceFrequency: 0.82 },
      baseOffset: -0.9,
    },
  },
  "evoflow-basalt-teeth": {
    defaultSkyboxUrl: "/skybox/tellus-storm-ocean/scene.gltf",
    landShape: {
      mountain: { height: 12, radius: 31, exponent: 2.05 },
      shoulder: { x: -17, z: 13, radius: 285, height: 3.3 },
      southernRise: { x: 19, z: -23, radius: 260, height: 2.7 },
      ridge: { sinScale: 0.86, cosScale: 0.58, diagonalScale: 0.45 },
      shore: { startRatio: 0.78, widthRatio: 0.22, drop: 5.1 },
      pond: { x: 15, z: -11, radius: 8.4, depth: 2.1, falloff: 90 },
      detail: { amplitude: 1.3, scale: 0.039, warp: 10.5, ridgeAmplitude: 1.45, terraceAmplitude: 0.28, terraceFrequency: 0.74 },
      baseOffset: -0.94,
    },
  },
  "evoflow-coral-fold": {
    defaultSkyboxUrl: "/skybox/tellus-starry-night/scene.gltf",
    landShape: {
      mountain: { height: 10.5, radius: 33, exponent: 1.9 },
      shoulder: { x: -18, z: 15, radius: 315, height: 3.1 },
      southernRise: { x: 18, z: -23, radius: 285, height: 2.6 },
      ridge: { sinScale: 0.7, cosScale: 0.52, diagonalScale: 0.36 },
      shore: { startRatio: 0.79, widthRatio: 0.21, drop: 4.8 },
      pond: { x: 15, z: -10, radius: 8.6, depth: 2, falloff: 92 },
      detail: { amplitude: 1.15, scale: 0.036, warp: 9.5, ridgeAmplitude: 1.18, terraceAmplitude: 0.25, terraceFrequency: 0.7 },
      baseOffset: -0.9,
    },
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function cloneLandShape(shape: LandShapeConfig): LandShapeConfig {
  return {
    mountain: { ...shape.mountain },
    shoulder: { ...shape.shoulder },
    southernRise: { ...shape.southernRise },
    ridge: { ...shape.ridge },
    shore: { ...shape.shore },
    pond: { ...shape.pond },
    detail: { ...shape.detail },
    baseOffset: shape.baseOffset,
  };
}

function normalizePondOverrides(pond: LandShapeOverrides["pond"]): LandShapeOverrides["pond"] {
  if (!pond) return pond;
  const radius = finiteNumber(pond.radius);
  const falloff = finiteNumber(pond.falloff) ?? (radius ? radius * radius * 1.2 : undefined);
  return { ...pond, falloff };
}

export function parseWorldTemplateId(
  value: unknown,
  fallback: WorldTemplateId = "tellus",
): WorldTemplateId {
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  return TEMPLATE_IDS.has(normalized as WorldTemplateId)
    ? (normalized as WorldTemplateId)
    : fallback;
}

export function templateForWorldId(
  worldId: string,
  fallback: WorldTemplateId = "tellus",
): WorldTemplateId {
  const id = worldId.trim().toLowerCase();
  if (id.includes("ridge") || id.includes("mountain")) return "ridge";
  if (id.includes("evoflow") || id.includes("coral") || id.includes("canyon")) {
    return "evoflow-coral-canyon";
  }
  if (id.includes("low") || id.includes("flat") || id.includes("meadow")) return "lowlands";
  if (id.includes("wide") || id.includes("archipelago") || id.includes("isle")) {
    return "wide-island";
  }
  return fallback;
}

export function parseLandShapeOverrides(value: unknown): LandShapeOverrides | undefined {
  if (!isRecord(value)) return undefined;

  const mountain = isRecord(value.mountain)
    ? {
        height: finiteNumber(value.mountain.height),
        radius: finiteNumber(value.mountain.radius),
        exponent: finiteNumber(value.mountain.exponent),
      }
    : undefined;
  const shoulder = isRecord(value.shoulder)
    ? {
        x: finiteNumber(value.shoulder.x),
        z: finiteNumber(value.shoulder.z),
        radius: finiteNumber(value.shoulder.radius),
        height: finiteNumber(value.shoulder.height),
      }
    : undefined;
  const southernRise = isRecord(value.southernRise)
    ? {
        x: finiteNumber(value.southernRise.x),
        z: finiteNumber(value.southernRise.z),
        radius: finiteNumber(value.southernRise.radius),
        height: finiteNumber(value.southernRise.height),
      }
    : undefined;
  const ridge = isRecord(value.ridge)
    ? {
        sinScale: finiteNumber(value.ridge.sinScale),
        cosScale: finiteNumber(value.ridge.cosScale),
        diagonalScale: finiteNumber(value.ridge.diagonalScale),
      }
    : undefined;
  const shore = isRecord(value.shore)
    ? {
        startRatio: finiteNumber(value.shore.startRatio),
        widthRatio: finiteNumber(value.shore.widthRatio),
        drop: finiteNumber(value.shore.drop),
      }
    : undefined;
  const pond = isRecord(value.pond)
    ? normalizePondOverrides({
        x: finiteNumber(value.pond.x),
        z: finiteNumber(value.pond.z),
        radius: finiteNumber(value.pond.radius),
        depth: finiteNumber(value.pond.depth),
        falloff: finiteNumber(value.pond.falloff),
      })
    : undefined;
  const detail = isRecord(value.detail)
    ? {
        amplitude: finiteNumber(value.detail.amplitude),
        scale: finiteNumber(value.detail.scale),
        warp: finiteNumber(value.detail.warp),
        ridgeAmplitude: finiteNumber(value.detail.ridgeAmplitude),
        terraceAmplitude: finiteNumber(value.detail.terraceAmplitude),
        terraceFrequency: finiteNumber(value.detail.terraceFrequency),
      }
    : undefined;
  const baseOffset = finiteNumber(value.baseOffset);

  const hasAny =
    mountain ||
    shoulder ||
    southernRise ||
    ridge ||
    shore ||
    pond ||
    detail ||
    baseOffset !== undefined;
  if (!hasAny) return undefined;

  return {
    mountain,
    shoulder,
    southernRise,
    ridge,
    shore,
    pond,
    detail,
    baseOffset,
  };
}

export function resolveLandShapeConfig(
  template: WorldTemplateId,
  overrides?: LandShapeOverrides,
): LandShapeConfig {
  const preset = cloneLandShape(TEMPLATE_PRESETS[template].landShape);
  if (!overrides) return preset;

  const pond = normalizePondOverrides(overrides.pond);

  return {
    mountain: { ...preset.mountain, ...overrides.mountain },
    shoulder: { ...preset.shoulder, ...overrides.shoulder },
    southernRise: { ...preset.southernRise, ...overrides.southernRise },
    ridge: { ...preset.ridge, ...overrides.ridge },
    shore: { ...preset.shore, ...overrides.shore },
    pond: { ...preset.pond, ...pond },
    detail: { ...preset.detail, ...overrides.detail },
    baseOffset:
      overrides.baseOffset !== undefined ? overrides.baseOffset : preset.baseOffset,
  };
}

export function defaultSkyboxUrlForTemplate(template: WorldTemplateId): string {
  return TEMPLATE_PRESETS[template].defaultSkyboxUrl;
}
