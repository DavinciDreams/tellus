import type {
  DayNightMode,
  InstantMeshTarget,
  LightingMood,
  RoleGenerationProvider,
  TellusRuntimeConfig,
} from "./tellus-types";
import {
  DEFAULT_DAY_NIGHT_CYCLE_MS,
  DEFAULT_DAY_NIGHT_START,
  MIN_DAY_NIGHT_CYCLE_MS,
} from "./tellus-constants";
import { boundedNumber, isRecord, readJsonResponse } from "./tellus-utils";
import {
  parseLandShapeOverrides,
  parseWorldTemplateId,
} from "./tellus-world-templates";

const DAY_NIGHT_MODES = ["cycle", "day", "night", "golden", "pause"] as const;
const LIGHTING_MOODS = [
  "natural",
  "bright-build",
  "soft-warm",
  "cool-dream",
  "moonlit",
  "dramatic-sunset",
] as const;

function parseDayNightMode(value: unknown, fallback: DayNightMode): DayNightMode {
  return typeof value === "string" &&
    DAY_NIGHT_MODES.includes(value as DayNightMode)
    ? (value as DayNightMode)
    : fallback;
}

function parseLightingMood(value: unknown, fallback: LightingMood): LightingMood {
  return typeof value === "string" &&
    LIGHTING_MOODS.includes(value as LightingMood)
    ? (value as LightingMood)
    : fallback;
}

export const runtimeConfig: TellusRuntimeConfig = {
  apiBase:
    import.meta.env.VITE_TELLUS_API_BASE?.replace(/\/+$/, "") ?? "",
  assetForgeApiBase:
    import.meta.env.VITE_ASSET_FORGE_API_BASE?.replace(/\/+$/, "") ?? "",
  agentModel:
    import.meta.env.VITE_TELLUS_AGENT_MODEL ??
    "GLM-5.1",
  generationProvider:
    (import.meta.env.VITE_TELLUS_GENERATION_PROVIDER as
      | TellusRuntimeConfig["generationProvider"]
      | undefined) ?? "instantmesh-gradio",
  playerGenerationProvider:
    (import.meta.env.VITE_TELLUS_PLAYER_GENERATION_PROVIDER as
      | RoleGenerationProvider
      | undefined) ?? "instantmesh-gradio",
  agentGenerationProvider:
    (import.meta.env.VITE_TELLUS_AGENT_GENERATION_PROVIDER as
      | RoleGenerationProvider
      | undefined) ?? "pixal3d-gradio",
  instantMeshTarget:
    (import.meta.env.VITE_TELLUS_INSTANTMESH_TARGET as InstantMeshTarget | undefined) ??
    "dgx",
  instantMeshTargets: {
    dgx:
      import.meta.env.VITE_TELLUS_INSTANTMESH_DGX_URL?.replace(/\/+$/, "") ??
      "http://192.168.1.177:43839",
    local:
      import.meta.env.VITE_TELLUS_INSTANTMESH_LOCAL_URL?.replace(/\/+$/, "") ??
      "http://127.0.0.1:43839",
  },
  worldApiBase:
    import.meta.env.VITE_TELLUS_WORLD_API_BASE?.replace(/\/+$/, "") ?? "",
  worldId: import.meta.env.VITE_TELLUS_WORLD_ID ?? "main",
  skyboxUrl: import.meta.env.VITE_TELLUS_SKYBOX_URL ?? "",
  worldTemplate: parseWorldTemplateId(import.meta.env.VITE_TELLUS_WORLD_TEMPLATE, "tellus"),
  dayNightCycleMs: boundedNumber(
    import.meta.env.VITE_TELLUS_DAY_NIGHT_CYCLE_MS,
    DEFAULT_DAY_NIGHT_CYCLE_MS,
    MIN_DAY_NIGHT_CYCLE_MS,
    60 * 60 * 1000,
  ),
  dayNightStart: boundedNumber(
    import.meta.env.VITE_TELLUS_DAY_NIGHT_START,
    DEFAULT_DAY_NIGHT_START,
    0,
    1,
  ),
  dayNightMode: parseDayNightMode(
    import.meta.env.VITE_TELLUS_DAY_NIGHT_MODE,
    "cycle",
  ),
  lightingMood: parseLightingMood(
    import.meta.env.VITE_TELLUS_LIGHTING_MOOD,
    "natural",
  ),
  instanceStaticDuplicates:
    import.meta.env.VITE_TELLUS_INSTANCE_STATIC === "true",
};

export function worldApiUrl(path: string): string {
  const normalized = path.startsWith("/") ? path : `/${path}`;
  if (
    import.meta.env.DEV &&
    typeof window !== "undefined" &&
    runtimeConfig.worldApiBase === "https://hyades.gnostr.cloud"
  ) {
    const host = window.location.hostname;
    if (
      host === "localhost" ||
      host === "127.0.0.1" ||
      host.endsWith(".local") ||
      /^10\./.test(host) ||
      /^172\.(1[6-9]|2\d|3[0-1])\./.test(host) ||
      /^192\.168\./.test(host)
    ) {
      return `/__hyades${normalized}`;
    }
  }
  return `${runtimeConfig.worldApiBase}${normalized}`;
}

export function applyRuntimeConfig(config: unknown): void {
  if (!isRecord(config)) return;

  const assetForgeApiBase = config.assetForgeApiBase;
  if (
    !import.meta.env.VITE_ASSET_FORGE_API_BASE?.trim() &&
    typeof assetForgeApiBase === "string" &&
    assetForgeApiBase.trim()
  ) {
    runtimeConfig.assetForgeApiBase = assetForgeApiBase.trim().replace(/\/+$/, "");
  }

  const apiBase = config.apiBase;
  if (
    !import.meta.env.VITE_TELLUS_API_BASE?.trim() &&
    typeof apiBase === "string"
  ) {
    runtimeConfig.apiBase = apiBase.trim().replace(/\/+$/, "");
  }

  const agentModel = config.agentModel;
  if (
    !import.meta.env.VITE_TELLUS_AGENT_MODEL?.trim() &&
    typeof agentModel === "string" &&
    agentModel.trim()
  ) {
    runtimeConfig.agentModel = agentModel.trim();
  }

  const generationProvider = config.generationProvider;
  if (
    !import.meta.env.VITE_TELLUS_GENERATION_PROVIDER?.trim() &&
    (generationProvider === "local" ||
      generationProvider === "asset-forge" ||
      generationProvider === "instantmesh-gradio" ||
      generationProvider === "pixal3d-gradio" ||
      generationProvider === "anigen-gradio")
  ) {
    runtimeConfig.generationProvider = generationProvider;
  }

  const playerGenerationProvider = config.playerGenerationProvider;
  if (
    !import.meta.env.VITE_TELLUS_PLAYER_GENERATION_PROVIDER?.trim() &&
    (playerGenerationProvider === "local" ||
      playerGenerationProvider === "instantmesh-gradio" ||
      playerGenerationProvider === "pixal3d-gradio" ||
      playerGenerationProvider === "anigen-gradio")
  ) {
    runtimeConfig.playerGenerationProvider = playerGenerationProvider;
  }

  const agentGenerationProvider = config.agentGenerationProvider;
  if (
    !import.meta.env.VITE_TELLUS_AGENT_GENERATION_PROVIDER?.trim() &&
    (agentGenerationProvider === "local" ||
      agentGenerationProvider === "instantmesh-gradio" ||
      agentGenerationProvider === "pixal3d-gradio" ||
      agentGenerationProvider === "anigen-gradio")
  ) {
    runtimeConfig.agentGenerationProvider = agentGenerationProvider;
  }

  const instantMeshTarget = config.instantMeshTarget;
  if (
    !import.meta.env.VITE_TELLUS_INSTANTMESH_TARGET?.trim() &&
    (instantMeshTarget === "dgx" || instantMeshTarget === "local")
  ) {
    runtimeConfig.instantMeshTarget = instantMeshTarget;
  }

  const instantMeshTargets = config.instantMeshTargets;
  if (isRecord(instantMeshTargets)) {
    for (const target of ["dgx", "local"] as const) {
      const baseUrl = instantMeshTargets[target];
      if (typeof baseUrl === "string" && baseUrl.trim()) {
        runtimeConfig.instantMeshTargets[target] = baseUrl.trim().replace(/\/+$/, "");
      }
    }
  }

  const skyboxUrl = config.skyboxUrl;
  if (typeof skyboxUrl === "string" && skyboxUrl.trim()) {
    runtimeConfig.skyboxUrl = skyboxUrl.trim();
  }

  const worldTemplate = config.worldTemplate;
  if (typeof worldTemplate === "string" && worldTemplate.trim()) {
    runtimeConfig.worldTemplate = parseWorldTemplateId(worldTemplate, runtimeConfig.worldTemplate);
  }

  const landShape = parseLandShapeOverrides(config.landShape);
  if (landShape) {
    runtimeConfig.landShape = landShape;
  }

  const dayNightCycleMs = config.dayNightCycleMs;
  if (typeof dayNightCycleMs === "number") {
    runtimeConfig.dayNightCycleMs = boundedNumber(
      dayNightCycleMs,
      runtimeConfig.dayNightCycleMs,
      MIN_DAY_NIGHT_CYCLE_MS,
      60 * 60 * 1000,
    );
  }

  const dayNightStart = config.dayNightStart;
  if (typeof dayNightStart === "number") {
    runtimeConfig.dayNightStart = boundedNumber(
      dayNightStart,
      runtimeConfig.dayNightStart,
      0,
      1,
    );
  }

  runtimeConfig.dayNightMode = parseDayNightMode(
    config.dayNightMode ?? config.day_night_mode,
    runtimeConfig.dayNightMode,
  );
  runtimeConfig.lightingMood = parseLightingMood(
    config.lightingMood ?? config.lighting_mood,
    runtimeConfig.lightingMood,
  );

  const worldApiBase = config.worldApiBase;
  if (
    !import.meta.env.VITE_TELLUS_WORLD_API_BASE?.trim() &&
    typeof worldApiBase === "string"
  ) {
    runtimeConfig.worldApiBase = worldApiBase.trim().replace(/\/+$/, "");
  }

  const worldId = config.worldId;
  if (
    !import.meta.env.VITE_TELLUS_WORLD_ID?.trim() &&
    typeof worldId === "string" &&
    worldId.trim()
  ) {
    runtimeConfig.worldId = worldId.trim();
  }

  // Only honour a runtime-config boolean when the VITE build var is unset (mirrors worldApiBase et al.).
  const instanceStaticDuplicates = config.instanceStaticDuplicates;
  if (
    import.meta.env.VITE_TELLUS_INSTANCE_STATIC === undefined &&
    typeof instanceStaticDuplicates === "boolean"
  ) {
    runtimeConfig.instanceStaticDuplicates = instanceStaticDuplicates;
  }
}

export async function loadRuntimeConfigFile(path: string): Promise<void> {
  const response = await fetch(path, { cache: "no-store" });
  if (response.status === 404) return;
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) return;
  applyRuntimeConfig(await readJsonResponse<unknown>(response));
}

// Readiness signal: API-base-dependent modules (tellus-auth) wait on this so a boot-time call never
// fires against the page origin before /tellus-config.json has set worldApiBase (the auth/status-404
// boot race). Resolved no matter how loading ends.
let runtimeConfigReadyResolve: (() => void) | undefined;
export const runtimeConfigReady: Promise<void> = new Promise((resolve) => {
  runtimeConfigReadyResolve = resolve;
});

export async function loadRuntimeConfig(): Promise<void> {
  try {
    await loadRuntimeConfigInner();
  } finally {
    runtimeConfigReadyResolve?.();
  }
}

async function loadRuntimeConfigInner(): Promise<void> {
  await loadRuntimeConfigFile("/tellus-config.json");
  if (
    window.location.hostname === "localhost" ||
    window.location.hostname === "127.0.0.1"
  ) {
    await loadRuntimeConfigFile("/tellus-config.local.json");
  }
}
