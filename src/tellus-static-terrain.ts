import { runtimeConfig } from "./tellus-runtime-config";
import type { ChunkData, ChunksManifest } from "./world-protocol";

interface StaticTerrainWorldConfig {
  root: string;
  autoVegetation?: boolean;
}

const STATIC_TERRAIN_WORLDS: Record<string, StaticTerrainWorldConfig> = {
  yosemite: {
    root: "/terrain/yosemite",
    autoVegetation: false,
  },
  "grand-canyon": {
    root: "/terrain/grand-canyon",
    autoVegetation: false,
  },
  grandcanyon: {
    root: "/terrain/grand-canyon",
    autoVegetation: false,
  },
};

function staticTerrainConfigForWorld(worldId = runtimeConfig.worldId): StaticTerrainWorldConfig | null {
  const id = worldId.trim().toLowerCase();
  for (const [needle, config] of Object.entries(STATIC_TERRAIN_WORLDS)) {
    if (id.includes(needle)) return config;
  }
  return null;
}

export function isStaticTerrainWorld(worldId = runtimeConfig.worldId): boolean {
  return staticTerrainConfigForWorld(worldId) !== null;
}

export function staticTerrainUsesBakedSurface(worldId = runtimeConfig.worldId): boolean {
  return isStaticTerrainWorld(worldId);
}

export function staticTerrainManifestUrl(worldId = runtimeConfig.worldId): string | null {
  const config = staticTerrainConfigForWorld(worldId);
  return config ? `${config.root}/manifest.json` : null;
}

export function staticTerrainChunkUrl(cx: number, cz: number, worldId = runtimeConfig.worldId): string | null {
  const config = staticTerrainConfigForWorld(worldId);
  return config ? `${config.root}/chunks/${cx}_${cz}.json` : null;
}

export function staticTerrainAutoVegetationEnabled(worldId = runtimeConfig.worldId): boolean {
  const config = staticTerrainConfigForWorld(worldId);
  return config?.autoVegetation ?? true;
}

export async function loadStaticTerrainManifest(worldId = runtimeConfig.worldId): Promise<ChunksManifest | null> {
  const url = staticTerrainManifestUrl(worldId);
  if (!url) return null;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json() as Promise<ChunksManifest>;
}

export async function loadStaticTerrainChunk(cx: number, cz: number): Promise<ChunkData | null> {
  const url = staticTerrainChunkUrl(cx, cz);
  if (!url) return null;
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) return null;
  return response.json() as Promise<ChunkData>;
}
