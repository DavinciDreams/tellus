import * as THREE from "three";
import {
  DEFAULT_DAY_NIGHT_CYCLE_MS,
  MIN_DAY_NIGHT_CYCLE_MS,
} from "./tellus-constants";
import { runtimeConfig } from "./tellus-runtime-config";
import type { DayNightMode, LightingMood, WorldTemplateId } from "./tellus-types";
import { boundedNumber } from "./tellus-utils";

export type WorldTemplateOption = {
  id: WorldTemplateId;
  label: string;
};

export const WORLD_TEMPLATE_OPTIONS: WorldTemplateOption[] = [
  { id: "tellus", label: "Tellus" },
  { id: "wide-island", label: "Wide Island" },
  { id: "lowlands", label: "Lowlands" },
  { id: "ridge", label: "Ridge" },
  { id: "fantasy-garden", label: "Fantasy Garden" },
  { id: "realistic-cove", label: "Realistic Cove" },
  { id: "flight-range", label: "Flight Range" },
  { id: "low-poly-meadow", label: "Low Poly Meadow" },
  { id: "cartoon-hills", label: "Cartoon Hills" },
  { id: "interior-studio", label: "Interior Studio" },
  { id: "grand-hall-shell", label: "Grand Hall Shell" },
  { id: "evoflow-coral-canyon", label: "Evoflow Coral Canyon" },
  { id: "evoflow-coral-canyon-child", label: "Evoflow Canyon Child" },
  { id: "evoflow-spires", label: "Evoflow Spires" },
  { id: "evoflow-glass-ridge", label: "Evoflow Glass Ridge" },
  { id: "evoflow-lichen-basin", label: "Evoflow Lichen Basin" },
  { id: "evoflow-copper-terraces", label: "Evoflow Copper Terraces" },
  { id: "evoflow-basalt-teeth", label: "Evoflow Basalt Teeth" },
  { id: "evoflow-coral-fold", label: "Evoflow Coral Fold" },
];

export type WorldCreationTemplate = WorldTemplateOption & {
  tagline: string;
  defaultSkyboxUrl: string;
  defaultLightingMood: LightingMood;
  defaultDayNightMode: DayNightMode;
  defaultChunkSize: number;
  previewUrl?: string;
};

export const WORLD_CREATION_TEMPLATES: WorldCreationTemplate[] = [
  {
    id: "tellus",
    label: "Main Island",
    tagline: "Classic Tellus island, ocean, pond, mountain, and room to build.",
    defaultSkyboxUrl: "/skybox/tellus-blue-clouds/scene.gltf",
    defaultLightingMood: "natural",
    defaultDayNightMode: "cycle",
    defaultChunkSize: 64,
  },
  {
    id: "lowlands",
    label: "Meadow Garden",
    tagline: "Soft low hills for gardens, cottages, paths, and small parks.",
    defaultSkyboxUrl: "/skybox/free_-_skybox_basic_sky.glb",
    defaultLightingMood: "bright-build",
    defaultDayNightMode: "day",
    defaultChunkSize: 16,
  },
  {
    id: "wide-island",
    label: "Wide Archipelago",
    tagline: "Open shoreline, broad terrain, and calmer slopes for larger layouts.",
    defaultSkyboxUrl: "/skybox/free_-_skybox_in_the_cloud/scene.gltf",
    defaultLightingMood: "soft-warm",
    defaultDayNightMode: "golden",
    defaultChunkSize: 32,
  },
  {
    id: "ridge",
    label: "Ridge Retreat",
    tagline: "A sculptural island with dramatic height for towers and overlooks.",
    defaultSkyboxUrl: "/skybox/skybox_skydays_3.glb",
    defaultLightingMood: "dramatic-sunset",
    defaultDayNightMode: "golden",
    defaultChunkSize: 24,
  },
  {
    id: "fantasy-garden",
    label: "Fantasy Garden",
    tagline: "A gentle magic-garden island for pavilions, ponds, ruins, and glowing plants.",
    defaultSkyboxUrl: "/skybox/tellus-aurora-sky/scene.gltf",
    defaultLightingMood: "cool-dream",
    defaultDayNightMode: "golden",
    defaultChunkSize: 16,
  },
  {
    id: "realistic-cove",
    label: "Realistic Cove",
    tagline: "Low natural terrain for realistic shore homes, gardens, and close-up detail.",
    defaultSkyboxUrl: "/skybox/tellus-blue-clouds/scene.gltf",
    defaultLightingMood: "natural",
    defaultDayNightMode: "day",
    defaultChunkSize: 16,
  },
  {
    id: "flight-range",
    label: "Flight Range",
    tagline: "Broad open terrain with long sightlines for vehicles, flying, and traversal tests.",
    defaultSkyboxUrl: "/skybox/free_-_skybox_in_the_cloud/scene.gltf",
    defaultLightingMood: "bright-build",
    defaultDayNightMode: "day",
    defaultChunkSize: 64,
  },
  {
    id: "low-poly-meadow",
    label: "Low Poly Meadow",
    tagline: "Chunky readable hills for cute low-poly towns, toy worlds, and simple props.",
    defaultSkyboxUrl: "/skybox/free_-_skybox_basic_sky.glb",
    defaultLightingMood: "bright-build",
    defaultDayNightMode: "day",
    defaultChunkSize: 24,
  },
  {
    id: "cartoon-hills",
    label: "Cartoon Hills",
    tagline: "Soft rounded hills for playful stylized worlds, mascot scenes, and bold color.",
    defaultSkyboxUrl: "/skybox/tellus-blue-clouds/scene.gltf",
    defaultLightingMood: "soft-warm",
    defaultDayNightMode: "cycle",
    defaultChunkSize: 24,
  },
  {
    id: "interior-studio",
    label: "Interior Studio",
    tagline: "Tiny flat starter for room-scale interiors, product sets, and door testing.",
    defaultSkyboxUrl: "/skybox/free_-_skybox_basic_sky.glb",
    defaultLightingMood: "bright-build",
    defaultDayNightMode: "day",
    defaultChunkSize: 8,
  },
  {
    id: "grand-hall-shell",
    label: "Grand Hall Shell",
    tagline: "Small dramatic shell for halls, galleries, salons, and temple interiors.",
    defaultSkyboxUrl: "/skybox/tellus-starry-night/scene.gltf",
    defaultLightingMood: "moonlit",
    defaultDayNightMode: "night",
    defaultChunkSize: 8,
  },
  {
    id: "evoflow-coral-canyon",
    label: "Coral Canyon",
    tagline: "Evoflow terrain with a strange canyon silhouette and fantasy mood.",
    defaultSkyboxUrl: "/skybox/tellus-alien-rings/scene.gltf",
    defaultLightingMood: "cool-dream",
    defaultDayNightMode: "cycle",
    defaultChunkSize: 24,
  },
  {
    id: "evoflow-coral-canyon-child",
    label: "Canyon Child",
    tagline: "A smaller coral-canyon variation for experiments and compact alien builds.",
    defaultSkyboxUrl: "/skybox/tellus-starry-night/scene.gltf",
    defaultLightingMood: "cool-dream",
    defaultDayNightMode: "night",
    defaultChunkSize: 16,
  },
  {
    id: "evoflow-spires",
    label: "Blue Spires",
    tagline: "Sharp procedural ridges under blue clouds for vertical fantasy landmarks.",
    defaultSkyboxUrl: "/skybox/tellus-blue-clouds/scene.gltf",
    defaultLightingMood: "natural",
    defaultDayNightMode: "cycle",
    defaultChunkSize: 24,
  },
  {
    id: "evoflow-glass-ridge",
    label: "Glass Ridge",
    tagline: "A crystalline Evoflow variant for alien gardens and moonlit builds.",
    defaultSkyboxUrl: "/skybox/tellus-aurora-sky/scene.gltf",
    defaultLightingMood: "moonlit",
    defaultDayNightMode: "night",
    defaultChunkSize: 24,
  },
  {
    id: "evoflow-lichen-basin",
    label: "Lichen Basin",
    tagline: "A quieter basin-like Evoflow terrain for mossy surreal outdoor rooms.",
    defaultSkyboxUrl: "/skybox/tellus-aurora-sky/scene.gltf",
    defaultLightingMood: "cool-dream",
    defaultDayNightMode: "cycle",
    defaultChunkSize: 24,
  },
  {
    id: "evoflow-copper-terraces",
    label: "Copper Terraces",
    tagline: "Warm terraced terrain with sunset color for desert, temple, and ruin worlds.",
    defaultSkyboxUrl: "/skybox/tellus-desert-sunset/scene.gltf",
    defaultLightingMood: "dramatic-sunset",
    defaultDayNightMode: "golden",
    defaultChunkSize: 24,
  },
  {
    id: "evoflow-basalt-teeth",
    label: "Basalt Teeth",
    tagline: "Dark rugged Evoflow terrain for stormy cliffs, dungeons, and hostile coasts.",
    defaultSkyboxUrl: "/skybox/tellus-storm-ocean/scene.gltf",
    defaultLightingMood: "moonlit",
    defaultDayNightMode: "cycle",
    defaultChunkSize: 24,
  },
  {
    id: "evoflow-coral-fold",
    label: "Coral Fold",
    tagline: "Folded canyon terrain with starry-night mood for compact alien landscapes.",
    defaultSkyboxUrl: "/skybox/tellus-starry-night/scene.gltf",
    defaultLightingMood: "cool-dream",
    defaultDayNightMode: "night",
    defaultChunkSize: 24,
  },
];

const CURATED_TEMPLATE_IDS = new Set<WorldTemplateId>(
  WORLD_CREATION_TEMPLATES.map((template) => template.id),
);

export const ADVANCED_WORLD_TEMPLATE_OPTIONS: WorldTemplateOption[] =
  WORLD_TEMPLATE_OPTIONS.filter((option) => !CURATED_TEMPLATE_IDS.has(option.id));

export const SKYBOX_OPTIONS: Array<{ url: string; label: string }> = [
  { url: "/skybox/free_-_skybox_in_the_cloud/scene.gltf", label: "Cloud Dome" },
  { url: "/skybox/free_-_skybox_basic_sky.glb", label: "Basic Sky" },
  { url: "/skybox/skybox_skydays_3.glb", label: "Sky Days" },
  { url: "/skybox/tellus-starry-night/scene.gltf", label: "Starry Night" },
  { url: "/skybox/tellus-blue-clouds/scene.gltf", label: "Blue Clouds" },
  { url: "/skybox/tellus-storm-ocean/scene.gltf", label: "Storm Ocean" },
  { url: "/skybox/tellus-desert-sunset/scene.gltf", label: "Desert Sunset" },
  { url: "/skybox/tellus-alien-rings/scene.gltf", label: "Alien Rings" },
  { url: "/skybox/tellus-aurora-sky/scene.gltf", label: "Aurora Sky" },
];

export const DAY_NIGHT_MODE_OPTIONS: Array<{ id: DayNightMode; label: string }> = [
  { id: "cycle", label: "Cycle" },
  { id: "day", label: "Day Only" },
  { id: "night", label: "Night Only" },
  { id: "golden", label: "Golden Hour" },
  { id: "pause", label: "Pause" },
];

export const LIGHTING_MOOD_OPTIONS: Array<{ id: LightingMood; label: string }> = [
  { id: "natural", label: "Natural" },
  { id: "bright-build", label: "Bright Build" },
  { id: "soft-warm", label: "Soft Warm" },
  { id: "cool-dream", label: "Cool Dream" },
  { id: "moonlit", label: "Moonlit" },
  { id: "dramatic-sunset", label: "Dramatic Sunset" },
];

const DAY_NIGHT_MODES = DAY_NIGHT_MODE_OPTIONS.map((option) => option.id);
const LIGHTING_MOODS = LIGHTING_MOOD_OPTIONS.map((option) => option.id);
const MAX_DAY_NIGHT_CYCLE_MS = 60 * 60 * 1000;

export type LightingMoodProfile = {
  sun: number;
  moon: number;
  hemi: number;
  env: number;
  fogNear: number;
  fogFar: number;
  opacity: number;
  backgroundTint?: THREE.Color;
  backgroundTintStrength?: number;
  skyTint?: THREE.Color;
  skyTintStrength?: number;
  sunTint?: THREE.Color;
  sunTintStrength?: number;
  hemiSkyTint?: THREE.Color;
  hemiGroundTint?: THREE.Color;
  hemiTintStrength?: number;
  oceanTint?: THREE.Color;
  oceanTintStrength?: number;
};

export const LIGHTING_MOOD_PROFILES: Record<LightingMood, LightingMoodProfile> = {
  natural: { sun: 1, moon: 1, hemi: 1, env: 1, fogNear: 1, fogFar: 1, opacity: 1 },
  "bright-build": {
    sun: 1.16,
    moon: 0.92,
    hemi: 1.22,
    env: 1.18,
    fogNear: 1.08,
    fogFar: 1.18,
    opacity: 0.9,
    backgroundTint: new THREE.Color(0xe8f4ff),
    backgroundTintStrength: 0.1,
    skyTint: new THREE.Color(0xf5fbff),
    skyTintStrength: 0.16,
    hemiSkyTint: new THREE.Color(0xdcecff),
    hemiGroundTint: new THREE.Color(0x6f8353),
    hemiTintStrength: 0.16,
    oceanTint: new THREE.Color(0x8ad4ff),
    oceanTintStrength: 0.08,
  },
  "soft-warm": {
    sun: 1.02,
    moon: 0.82,
    hemi: 1.05,
    env: 1.02,
    fogNear: 0.96,
    fogFar: 1.04,
    opacity: 1,
    backgroundTint: new THREE.Color(0xffe2c2),
    backgroundTintStrength: 0.16,
    skyTint: new THREE.Color(0xffd4aa),
    skyTintStrength: 0.2,
    sunTint: new THREE.Color(0xffc08a),
    sunTintStrength: 0.22,
    hemiSkyTint: new THREE.Color(0xffd7b1),
    hemiGroundTint: new THREE.Color(0x7c6f45),
    hemiTintStrength: 0.18,
    oceanTint: new THREE.Color(0xffc792),
    oceanTintStrength: 0.1,
  },
  "cool-dream": {
    sun: 0.9,
    moon: 1.28,
    hemi: 1.1,
    env: 1.06,
    fogNear: 0.9,
    fogFar: 1.08,
    opacity: 1,
    backgroundTint: new THREE.Color(0x9ed3ff),
    backgroundTintStrength: 0.18,
    skyTint: new THREE.Color(0xaec7ff),
    skyTintStrength: 0.24,
    sunTint: new THREE.Color(0xdce8ff),
    sunTintStrength: 0.14,
    hemiSkyTint: new THREE.Color(0x9dbdff),
    hemiGroundTint: new THREE.Color(0x4c6372),
    hemiTintStrength: 0.2,
    oceanTint: new THREE.Color(0x84c9ff),
    oceanTintStrength: 0.12,
  },
  moonlit: {
    sun: 0.72,
    moon: 1.65,
    hemi: 0.82,
    env: 0.86,
    fogNear: 0.82,
    fogFar: 0.96,
    opacity: 1.08,
    backgroundTint: new THREE.Color(0x172241),
    backgroundTintStrength: 0.28,
    skyTint: new THREE.Color(0x8fa8ff),
    skyTintStrength: 0.25,
    sunTint: new THREE.Color(0xcad7ff),
    sunTintStrength: 0.18,
    hemiSkyTint: new THREE.Color(0x7894ff),
    hemiGroundTint: new THREE.Color(0x28344a),
    hemiTintStrength: 0.28,
    oceanTint: new THREE.Color(0x405d95),
    oceanTintStrength: 0.2,
  },
  "dramatic-sunset": {
    sun: 1.12,
    moon: 0.9,
    hemi: 0.96,
    env: 0.95,
    fogNear: 0.88,
    fogFar: 1,
    opacity: 1,
    backgroundTint: new THREE.Color(0xff9c5f),
    backgroundTintStrength: 0.3,
    skyTint: new THREE.Color(0xff7f6f),
    skyTintStrength: 0.34,
    sunTint: new THREE.Color(0xff8f4f),
    sunTintStrength: 0.32,
    hemiSkyTint: new THREE.Color(0xffb17a),
    hemiGroundTint: new THREE.Color(0x6e4f63),
    hemiTintStrength: 0.24,
    oceanTint: new THREE.Color(0xff8758),
    oceanTintStrength: 0.18,
  },
};

const LEGACY_BASIC_SKY_URL = "/skybox/free_-_skybox_basic_sky/scene.gltf";
const BASIC_SKY_URL = "/skybox/free_-_skybox_basic_sky.glb";
const CLOUD_SKY_GLB_URL = "/skybox/free_-_skybox_in_the_cloud.glb";
const CLOUD_SKY_URL = "/skybox/free_-_skybox_in_the_cloud/scene.gltf";

export function normalizeSkyboxUrl(url: string): string {
  const trimmed = url.trim();
  if (trimmed === LEGACY_BASIC_SKY_URL) return BASIC_SKY_URL;
  if (trimmed === CLOUD_SKY_GLB_URL) return CLOUD_SKY_URL;
  return trimmed;
}

export function parseDayNightMode(value: unknown, fallback: DayNightMode = "cycle"): DayNightMode {
  return typeof value === "string" && DAY_NIGHT_MODES.includes(value as DayNightMode)
    ? (value as DayNightMode)
    : fallback;
}

export function parseLightingMood(value: unknown, fallback: LightingMood = "natural"): LightingMood {
  return typeof value === "string" && LIGHTING_MOODS.includes(value as LightingMood)
    ? (value as LightingMood)
    : fallback;
}

export function normalizeDayNightCycleMs(value: unknown, fallback = DEFAULT_DAY_NIGHT_CYCLE_MS): number {
  return boundedNumber(value as string | number | undefined, fallback, MIN_DAY_NIGHT_CYCLE_MS, MAX_DAY_NIGHT_CYCLE_MS);
}

export function liveDayNightPhase(ignorePause = false): number {
  if (!ignorePause && runtimeConfig.dayNightMode === "pause") {
    return ((runtimeConfig.dayNightStart % 1) + 1) % 1;
  }
  return (
    (runtimeConfig.dayNightStart + Date.now() / runtimeConfig.dayNightCycleMs) %
    1 +
    1
  ) % 1;
}

export function worldTemplateLabel(template: WorldTemplateId): string {
  return (
    WORLD_TEMPLATE_OPTIONS.find((option) => option.id === template)?.label ??
    template
  );
}

export function skyboxLabel(url: string): string {
  const normalized = normalizeSkyboxUrl(url);
  return SKYBOX_OPTIONS.find((option) => option.url === normalized)?.label ?? "Custom Sky";
}
