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
  "fantasy-garden",
  "realistic-cove",
  "flight-range",
  "grassland-field",
  "low-poly-meadow",
  "cartoon-hills",
  "interior-studio",
  "grand-hall-shell",
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
    defaultSkyboxUrl: "/skybox/free_-_skybox_basic_sky.glb",
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
  "fantasy-garden": {
    defaultSkyboxUrl: "/skybox/tellus-aurora-sky/scene.gltf",
    landShape: {
      mountain: { height: 9, radius: 29, exponent: 1.75 },
      shoulder: { x: -18, z: 18, radius: 240, height: 3.8 },
      southernRise: { x: 22, z: -18, radius: 230, height: 3.2 },
      ridge: { sinScale: 0.42, cosScale: 0.34, diagonalScale: 0.22 },
      shore: { startRatio: 0.77, widthRatio: 0.23, drop: 4.7 },
      pond: { x: -6, z: 10, radius: 15.5, depth: 1.45, falloff: 210 },
      detail: {
        amplitude: 0.8,
        scale: 0.026,
        warp: 7.5,
        ridgeAmplitude: 0.36,
        terraceAmplitude: 0.08,
        terraceFrequency: 0.38,
      },
      baseOffset: -0.95,
    },
  },
  "realistic-cove": {
    defaultSkyboxUrl: "/skybox/tellus-blue-clouds/scene.gltf",
    landShape: {
      mountain: { height: 6.8, radius: 46, exponent: 1.42 },
      shoulder: { x: -24, z: 14, radius: 360, height: 2.7 },
      southernRise: { x: 18, z: -26, radius: 340, height: 2.2 },
      ridge: { sinScale: 0.24, cosScale: 0.2, diagonalScale: 0.12 },
      shore: { startRatio: 0.82, widthRatio: 0.18, drop: 3.6 },
      pond: { x: 12, z: -8, radius: 10.8, depth: 1.55, falloff: 145 },
      detail: {
        amplitude: 0.58,
        scale: 0.021,
        warp: 5.2,
        ridgeAmplitude: 0.18,
        terraceAmplitude: 0.04,
        terraceFrequency: 0.32,
      },
      baseOffset: -1.1,
    },
  },
  "flight-range": {
    defaultSkyboxUrl: "/skybox/free_-_skybox_in_the_cloud/scene.gltf",
    landShape: {
      mountain: { height: 10, radius: 66, exponent: 1.18 },
      shoulder: { x: -40, z: 24, radius: 620, height: 3.4 },
      southernRise: { x: 42, z: -30, radius: 600, height: 2.9 },
      ridge: { sinScale: 0.16, cosScale: 0.14, diagonalScale: 0.08 },
      shore: { startRatio: 0.88, widthRatio: 0.12, drop: 3.2 },
      pond: { x: -22, z: 20, radius: 18, depth: 1.25, falloff: 290 },
      detail: {
        amplitude: 0.38,
        scale: 0.016,
        warp: 4.2,
        ridgeAmplitude: 0.12,
        terraceAmplitude: 0.03,
        terraceFrequency: 0.22,
      },
      baseOffset: -1.2,
    },
  },
  "grassland-field": {
    defaultSkyboxUrl: "/skybox/free_-_skybox_basic_sky.glb",
    landShape: {
      mountain: { height: 1.8, radius: 96, exponent: 1.15 },
      shoulder: { x: -30, z: 18, radius: 780, height: 1.3 },
      southernRise: { x: 42, z: -30, radius: 720, height: 1.1 },
      ridge: { sinScale: 0.08, cosScale: 0.06, diagonalScale: 0.04 },
      shore: { startRatio: 1, widthRatio: 0.01, drop: 0 },
      pond: { x: 0, z: 0, radius: 0.1, depth: 0, falloff: 1 },
      detail: {
        amplitude: 0.5,
        scale: 0.015,
        warp: 4,
        ridgeAmplitude: 0.08,
        terraceAmplitude: 0.02,
        terraceFrequency: 0.18,
      },
      baseOffset: 1.2,
    },
  },
  "low-poly-meadow": {
    defaultSkyboxUrl: "/skybox/free_-_skybox_basic_sky.glb",
    landShape: {
      mountain: { height: 8.5, radius: 38, exponent: 1.35 },
      shoulder: { x: -26, z: 8, radius: 310, height: 3.1 },
      southernRise: { x: 20, z: -24, radius: 285, height: 2.6 },
      ridge: { sinScale: 0.28, cosScale: 0.22, diagonalScale: 0.12 },
      shore: { startRatio: 0.78, widthRatio: 0.22, drop: 4.2 },
      pond: { x: -16, z: -12, radius: 9.2, depth: 1.8, falloff: 96 },
      detail: {
        amplitude: 0.32,
        scale: 0.018,
        warp: 2.2,
        ridgeAmplitude: 0.1,
        terraceAmplitude: 0.28,
        terraceFrequency: 1.1,
      },
      baseOffset: -1,
    },
  },
  "cartoon-hills": {
    defaultSkyboxUrl: "/skybox/tellus-blue-clouds/scene.gltf",
    landShape: {
      mountain: { height: 11.5, radius: 36, exponent: 1.25 },
      shoulder: { x: -30, z: 18, radius: 335, height: 4.2 },
      southernRise: { x: 32, z: -18, radius: 320, height: 3.8 },
      ridge: { sinScale: 0.34, cosScale: 0.3, diagonalScale: 0.18 },
      shore: { startRatio: 0.79, widthRatio: 0.21, drop: 4.8 },
      pond: { x: 14, z: 18, radius: 10.5, depth: 1.5, falloff: 130 },
      detail: {
        amplitude: 0.52,
        scale: 0.018,
        warp: 3.4,
        ridgeAmplitude: 0.16,
        terraceAmplitude: 0.06,
        terraceFrequency: 0.3,
      },
      baseOffset: -0.9,
    },
  },
  "interior-studio": {
    defaultSkyboxUrl: "/skybox/free_-_skybox_basic_sky.glb",
    landShape: {
      mountain: { height: 1.8, radius: 90, exponent: 1.1 },
      shoulder: { x: 0, z: 0, radius: 620, height: 1.1 },
      southernRise: { x: 0, z: 0, radius: 620, height: 0.7 },
      ridge: { sinScale: 0.04, cosScale: 0.03, diagonalScale: 0.02 },
      shore: { startRatio: 0.54, widthRatio: 0.46, drop: 8.5 },
      pond: { x: 0, z: 0, radius: 0.1, depth: 0, falloff: 1 },
      detail: {
        amplitude: 0.05,
        scale: 0.01,
        warp: 0.8,
        ridgeAmplitude: 0.02,
        terraceAmplitude: 0,
        terraceFrequency: 0.1,
      },
      baseOffset: 0,
    },
  },
  "grand-hall-shell": {
    defaultSkyboxUrl: "/skybox/tellus-starry-night/scene.gltf",
    landShape: {
      mountain: { height: 2.4, radius: 110, exponent: 1.08 },
      shoulder: { x: 0, z: 0, radius: 720, height: 1.4 },
      southernRise: { x: 0, z: -12, radius: 660, height: 1.1 },
      ridge: { sinScale: 0.05, cosScale: 0.04, diagonalScale: 0.02 },
      shore: { startRatio: 0.58, widthRatio: 0.42, drop: 8 },
      pond: { x: 0, z: 0, radius: 0.1, depth: 0, falloff: 1 },
      detail: {
        amplitude: 0.08,
        scale: 0.012,
        warp: 1,
        ridgeAmplitude: 0.03,
        terraceAmplitude: 0.02,
        terraceFrequency: 0.18,
      },
      baseOffset: -0.05,
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

export function parseOptionalWorldTemplateId(value: unknown): WorldTemplateId | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return TEMPLATE_IDS.has(normalized as WorldTemplateId)
    ? (normalized as WorldTemplateId)
    : undefined;
}

export function templateForWorldId(
  worldId: string,
  fallback: WorldTemplateId = "tellus",
): WorldTemplateId {
  const id = worldId.trim().toLowerCase();
  const chunkedMatch = /^chunked-(\d+)(?:-(.*))?$/.exec(id);
  if (chunkedMatch) {
    const chunkSize = Number(chunkedMatch[1]);
    const suffix = chunkedMatch[2] ?? "";
    if (/\b(main|tellus|island)\b/.test(suffix)) return "tellus";
    const suffixTemplate = templateForWorldId(suffix, fallback);
    if (suffixTemplate !== fallback) return suffixTemplate;
    if (Number.isFinite(chunkSize) && chunkSize >= 64) return "flight-range";
  }
  if (/^\d+$/.test(id) && Number(id) >= 64) return "flight-range";
  if (id.includes("aurora") || id.includes("glass")) return "evoflow-glass-ridge";
  if (id.includes("storm") || id.includes("basalt")) return "evoflow-basalt-teeth";
  if (id.includes("copper") || id.includes("terrace") || id.includes("desert")) return "evoflow-copper-terraces";
  if (id.includes("ridge") || id.includes("mountain")) return "ridge";
  if (id.includes("fantasy") || id.includes("garden")) return "fantasy-garden";
  if (id.includes("realistic") || id.includes("cove")) return "realistic-cove";
  if (id.includes("grassland") || id.includes("prairie") || id.includes("field")) return "grassland-field";
  if (id.includes("flight") || id.includes("simulator") || id.includes("range")) return "flight-range";
  if (id.includes("low-poly") || id.includes("lowpoly")) return "low-poly-meadow";
  if (id.includes("cartoon") || id.includes("toon")) return "cartoon-hills";
  if (id.includes("grand-hall") || id.includes("hall") || id.includes("tavern") || id.includes("inn") || id.includes("pub")) return "grand-hall-shell";
  if (id.includes("interior") || id.includes("studio") || id.includes("room")) return "interior-studio";
  if (id.includes("evoflow") || id.includes("coral") || id.includes("canyon")) {
    return "evoflow-coral-canyon";
  }
  if (id.includes("low") || id.includes("flat") || id.includes("meadow")) return "lowlands";
  if (id.includes("wide") || id.includes("archipelago") || id.includes("isle")) {
    return "wide-island";
  }
  return fallback;
}

export function shouldIgnoreDefaultTellusTemplate(
  template: WorldTemplateId | undefined,
  fallback: WorldTemplateId,
): boolean {
  return template === "tellus" && fallback !== "tellus";
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
