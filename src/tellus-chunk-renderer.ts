import * as THREE from "three";
import {
  CHUNK_LOAD_RADIUS,
  CHUNK_LOD_FAR_SEGMENTS,
  CHUNK_LOD_NEAR_RADIUS,
  CHUNK_SEGMENTS,
  CHUNK_SPAN,
  CHUNK_VERTEX_COUNT,
  getChunkedWorldChunks,
} from "./tellus-constants";
import {
  terrainKind,
  terrainPaintCode,
  terrainPaintKindFromCode,
  terrainVertexColor,
} from "./tellus-terrain";
import {
  largeWorldBaseHeight,
  largeWorldTerrainKind,
} from "./tellus-large-world-terrain";
import { runtimeConfig } from "./tellus-runtime-config";
import { parseWorldTemplateId, templateUsesRealisticTerrainSurface } from "./tellus-world-templates";
import {
  tellusWorldChunkUrl,
} from "./tellus-urls-identity";
import { staticTerrainChunkUrl, staticTerrainUsesBakedSurface } from "./tellus-static-terrain";
import { historicalTerrainStampOffsetAt } from "./tellus-historical-terrain-stamps";
import type { ChunkData } from "./world-protocol";
import type { TerrainKind, TerrainPaintKind, WorldTemplateId } from "./tellus-types";
import { terrainKindCode } from "./tellus-terrain-material";

const key = (cx: number, cz: number) => `${cx},${cz}`;
const CHUNK_SKIRT_DEPTH = 8;
const CHUNK_PROVISIONAL_SEGMENTS = 8;
const TERRAIN_KIND_CODE_WATER = terrainKindCode("water");

// Sample the 65x65 sculpt grid (row-major z*65+x). Empty array => flat (revision 0).
function sculptAt(offsets: number[], xi: number, zi: number): number {
  if (offsets.length === 0) return 0;
  return offsets[zi * CHUNK_VERTEX_COUNT + xi] ?? 0;
}

function chunkHeightBase(chunk: ChunkData, wx: number, wz: number): number {
  return chunk.heightMode === "absolute" ? 0 : largeWorldBaseHeight(wx, wz);
}

function chunkedWorldSpan(): { width: number; depth: number } | null {
  const bounds = getChunkedWorldChunks();
  return bounds ? { width: bounds.w * CHUNK_SPAN, depth: bounds.h * CHUNK_SPAN } : null;
}

function historicalTerrainOffset(wx: number, wz: number): number {
  const span = chunkedWorldSpan();
  return historicalTerrainStampOffsetAt(
    wx,
    wz,
    runtimeConfig.worldId,
    span?.width,
    span?.depth,
  );
}

function shouldApplyChunkPaint(_template: WorldTemplateId, kind: TerrainPaintKind | null): kind is TerrainPaintKind {
  // Explicit user paint stored in a chunk wins over the procedural biome. Otherwise strokes like
  // meadow/beach/dirt/rock can appear to do nothing when a non-Tellus template owns the base biome.
  return kind !== null;
}

function realisticTerrainNoise(x: number, z: number, seed: number): number {
  const value = Math.sin(x * 0.071 + z * 0.113 + seed * 0.019) * 43758.5453123;
  return value - Math.floor(value);
}

function realisticTerrainColor(
  template: WorldTemplateId,
  kind: TerrainKind,
  paintKind: TerrainPaintKind | null,
  y: number,
  wx: number,
  wz: number,
  seed: number,
): THREE.Color {
  const noise = realisticTerrainNoise(wx, wz, seed);
  const fineNoise = realisticTerrainNoise(wx * 2.7 + 13.1, wz * 2.7 - 8.7, seed + 17);
  let color: THREE.Color;

  if (template === "grand-canyon-terrain" || template === "chaco-canyon" || template === "temple-portara") {
    const band = Math.sin(y * 0.22 + noise * 2.4);
    const sand = new THREE.Color(0x9a7048);
    const rust = new THREE.Color(0x6f3f2c);
    const pale = new THREE.Color(0xc1a06e);
    color = sand.lerp(rust, THREE.MathUtils.clamp((band + 1) * 0.38, 0, 1));
    color.lerp(pale, THREE.MathUtils.clamp(fineNoise * 0.35 + (paintKind === "desert-sand" ? 0.2 : 0), 0, 0.45));
    if (kind === "rock" || kind === "gravel" || kind === "stone") color.lerp(new THREE.Color(0x6b6258), 0.25);
  } else if (template === "cahokia-mounds") {
    color = new THREE.Color(0x7f9654);
    color.lerp(new THREE.Color(0x5f6f3b), THREE.MathUtils.clamp(noise * 0.45, 0, 0.45));
    if (kind === "dirt" || kind === "desert-sand") color.lerp(new THREE.Color(0x9b7a4c), 0.35);
  } else {
    const elevation = THREE.MathUtils.clamp((y + 12) / 120, 0, 1);
    color = new THREE.Color(0x7b7f73);
    if (kind === "snow") {
      color = new THREE.Color(0xc9c8bd);
    } else if (kind === "forest-floor" || kind === "grass" || kind === "meadow" || kind === "jungle-moss") {
      color = new THREE.Color(0x5f7046).lerp(new THREE.Color(0x37462f), THREE.MathUtils.clamp(noise * 0.45, 0, 0.45));
    } else if (kind === "dirt" || kind === "beach" || kind === "desert-sand") {
      color = new THREE.Color(0x9a8562);
    }
    color.lerp(new THREE.Color(0xa7a8a0), THREE.MathUtils.clamp(elevation * 0.34, 0, 0.34));
  }

  const shade = 0.82 + noise * 0.18 + fineNoise * 0.08;
  color.multiplyScalar(THREE.MathUtils.clamp(shade, 0.72, 1.08));
  return color;
}

// Build a per-chunk square BufferGeometry in LOCAL coords [0,SPAN]; the Mesh is positioned
// at world (cx*96, 0, cz*96). `lodSegments` decimates the 64-seg grid for distant chunks
// (e.g. 16 -> stride 4) by subsampling the 65² arrays. Mirrors createTerrainGeometry's
// index winding + computeVertexNormals; drops the single-grid circular edgeScale clamp.
export function createChunkTerrainGeometry(
  chunk: ChunkData,
  lodSegments: number = CHUNK_SEGMENTS,
): THREE.BufferGeometry {
  const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
  const useRealisticSurface =
    staticTerrainUsesBakedSurface(runtimeConfig.worldId) ||
    templateUsesRealisticTerrainSurface(template);
  const historicalSpan = chunkedWorldSpan();
  const seg = Math.max(1, Math.min(lodSegments, CHUNK_SEGMENTS));
  const stride = CHUNK_SEGMENTS / seg; // 64/seg; integer for 64,32,16,8
  const worldX0 = chunk.cx * CHUNK_SPAN;
  const worldZ0 = chunk.cz * CHUNK_SPAN;

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const paintCodes: number[] = [];
  const terrainKindCodes: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= seg; j++) {
    const zi = Math.round(j * stride); // sample index into the 65-grid
    const lz = (j / seg) * CHUNK_SPAN; // local z in [0,96]
    for (let i = 0; i <= seg; i++) {
      const xi = Math.round(i * stride);
      const lx = (i / seg) * CHUNK_SPAN; // local x in [0,96]
      const wx = worldX0 + lx;
      const wz = worldZ0 + lz;
      const py =
        chunkHeightBase(chunk, wx, wz) +
        sculptAt(chunk.sculptOffsets, xi, zi) +
        historicalTerrainStampOffsetAt(
          wx,
          wz,
          runtimeConfig.worldId,
          historicalSpan?.width,
          historicalSpan?.depth,
        );
      const paintCode = chunk.paint.length
        ? (chunk.paint[zi * CHUNK_VERTEX_COUNT + xi] ?? 0)
        : 0;
      const paintKind = paintCode ? terrainPaintKindFromCode(paintCode) : null;
      const kind = shouldApplyChunkPaint(template, paintKind) ? paintKind : null;
      const resolvedKind = kind ?? largeWorldTerrainKind(wx, wz, py) ?? terrainKind(wx, wz, py);
      const colorSeed = xi * 1009 + zi * 9176;
      const color = useRealisticSurface
        ? realisticTerrainColor(template, resolvedKind, paintKind, py, wx, wz, colorSeed)
        : terrainVertexColor(resolvedKind, wx, wz, colorSeed);
      positions.push(lx, py, lz);
      colors.push(color.r, color.g, color.b);
      uvs.push(wx / CHUNK_SPAN, wz / CHUNK_SPAN);
      // Carry the code of the APPLIED paint (0 when the biome owns the vertex), so the material's
      // per-kind pattern matches the vertex color and biome terrain stays pattern-free.
      paintCodes.push(useRealisticSurface ? 0 : kind ? terrainPaintCode(kind) : 0);
      terrainKindCodes.push(terrainKindCode(resolvedKind));
    }
  }

  const row = seg + 1;
  for (let z = 0; z < seg; z++) {
    for (let x = 0; x < seg; x++) {
      const a = z * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const addSkirtVertex = (surfaceIndex: number) => {
    const offset = surfaceIndex * 3;
    const uvOffset = surfaceIndex * 2;
    const skirtIndex = positions.length / 3;
    positions.push(
      positions[offset],
      positions[offset + 1] - CHUNK_SKIRT_DEPTH,
      positions[offset + 2],
    );
    colors.push(
      colors[offset] * 0.7,
      colors[offset + 1] * 0.7,
      colors[offset + 2] * 0.7,
    );
    uvs.push(uvs[uvOffset] ?? 0, uvs[uvOffset + 1] ?? 0);
    paintCodes.push(paintCodes[surfaceIndex] ?? 0);
    terrainKindCodes.push(terrainKindCodes[surfaceIndex] ?? 0);
    return skirtIndex;
  };

  const ring: number[] = [];
  for (let x = 0; x < seg; x++) ring.push(x);
  for (let z = 0; z < seg; z++) ring.push(z * row + seg);
  for (let x = seg; x > 0; x--) ring.push(seg * row + x);
  for (let z = seg; z > 0; z--) ring.push(z * row);

  const skirtRing = new Map<number, number>();
  const skirtVertexFor = (surfaceIndex: number) => {
    const existing = skirtRing.get(surfaceIndex);
    if (existing !== undefined) return existing;
    const next = addSkirtVertex(surfaceIndex);
    skirtRing.set(surfaceIndex, next);
    return next;
  };
  for (let i = 0; i < ring.length; i++) {
    const next = (i + 1) % ring.length;
    const a = ring[i];
    const b = ring[next];
    if (
      (terrainKindCodes[a] ?? 0) === TERRAIN_KIND_CODE_WATER &&
      (terrainKindCodes[b] ?? 0) === TERRAIN_KIND_CODE_WATER
    ) {
      continue;
    }
    const a2 = skirtVertexFor(a);
    const b2 = skirtVertexFor(b);
    // Include both windings so the skirt masks seams from above and below with front-face materials.
    indices.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("tellusPaintCode", new THREE.Float32BufferAttribute(paintCodes, 1));
  geometry.setAttribute("tellusTerrainKindCode", new THREE.Float32BufferAttribute(terrainKindCodes, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  return geometry;
}

interface ActiveChunk {
  mesh: THREE.Mesh;
  revision: number;
  lodSegments: number;
  template: WorldTemplateId;
  // Raw sculpt offsets (65x65, row-major z*65+x; [] when flat) kept so grounding can sample the
  // actual heightfield where the chunk is loaded. cx/cz live on mesh.position but cached here too.
  cx: number;
  cz: number;
  sculptOffsets: number[];
  paint: number[];
  heightMode: ChunkData["heightMode"];
}

export interface ChunkRenderer {
  /** Per-frame from animate(); re-evaluates the load/evict ring only when the center chunk changes. */
  update(worldX: number, worldZ: number): void;
  /** Fetch a small ring ahead of movement without changing the eviction/active center. */
  prefetch(worldX: number, worldZ: number, radius?: number): void;
  /** Render a temporary procedural-base chunk immediately so movement never waits on chunk fetch. */
  ensureBaseChunk(worldX: number, worldZ: number): boolean;
  /** Set how many chunk-rings load around the player (radius in chunks; (2r+1)² chunks). Forces a re-eval. */
  setLoadRadius(radius: number): void;
  /** /live chunk.updated -> mark dirty + refetch that chunk (rebuilt in the next flush). */
  reloadChunk(chunkX: number, chunkZ: number): void;
  /** Rebuild already-loaded chunks when the active terrain template/land-shape changes. */
  rebuildTerrain(): void;
  /** Optimistic local paint for immediate feedback while the authoritative chunk patch round-trips. */
  applyLocalPaint(kind: TerrainPaintKind, worldX: number, worldZ: number, radius: number): void;
  /** Rebuild chunks whose data arrived since last frame — call once/frame next to flushTerrain(). */
  flush(maxBuilds?: number, maxMs?: number, maxFetchStarts?: number): void;
  /** Limit how many queued chunk fetches update()/prefetch() may start synchronously. */
  setFetchStartBudget(maxStarts: number): void;
  /**
   * Bilinearly sample the sculpted chunk height at world (x,z). Returns null when the chunk that
   * owns (x,z) is not currently active (so grounding falls back to the flat base). A loaded chunk
   * with empty sculptOffsets samples 0 (flat base).
   */
  sampleHeight(worldX: number, worldZ: number): number | null;
  samplePaint(worldX: number, worldZ: number): TerrainPaintKind | null;
  stats(): {
    active: number;
    pending: number;
    queued: number;
    inflight: number;
    ready: number;
    failed: number;
    loadRadius: number;
    center: { cx: number; cz: number } | null;
    lastFlushBuilt: number;
    lastFlushMs: number;
    maxFlushMs: number;
    provisional: number;
    currentProvisional: boolean;
  };
  dispose(): void;
}

export function createChunkRenderer(
  scene: THREE.Scene,
  // Optional shared terrain material (the procedural-detail material from createTerrainMaterial, so
  // chunked worlds get the same fractal mottling/slope-darkening as the central terrain). Tests omit
  // it and fall back to a plain vertex-color material — jsdom can't build the WebGPU node material.
  terrainMaterial?: THREE.Material,
): ChunkRenderer {
  const group = new THREE.Group();
  group.name = "tellus-chunk-terrain";
  scene.add(group);

  // ONE shared material across all chunk meshes (never disposed per-evict; only on dispose()).
  const material =
    terrainMaterial ??
    new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness: 0.88,
      metalness: 0,
    });

  const active = new Map<string, ActiveChunk>();
  const inflight = new Map<string, AbortController>();
  const queuedFetches = new Map<string, { cx: number; cz: number; lodSegments: number; priority: number; force: boolean }>();
  const ready = new Map<string, ChunkData>(); // fetched data awaiting build/rebuild in flush()
  const lodOf = new Map<string, number>(); // intended lod for a pending fetch
  const retryAt = new Map<string, number>(); // failed fetches; retried while the chunk remains wanted
  const localPaintOverrides = new Map<string, Map<number, number>>();
  let centerCx = NaN;
  let centerCz = NaN;
  let disposed = false;
  let failedFetches = 0;
  let lastFlushBuilt = 0;
  let lastFlushMs = 0;
  let maxFlushMs = 0;
  let fetchStartBudget = Number.POSITIVE_INFINITY;
  // Runtime-tunable load ring (the chunk slider). loadRadius = chunks fetched around the centre ((2r+1)²);
  // keepRadius = loadRadius + 1 for the same evict hysteresis the CHUNK_LOAD/KEEP constants had (2 → 3).
  let loadRadius = CHUNK_LOAD_RADIUS;
  const keepRadius = () => loadRadius + 1;

  const lodForRing = (ring: number) => {
    if (ring <= CHUNK_LOD_NEAR_RADIUS) return CHUNK_SEGMENTS;
    if (ring === CHUNK_LOD_NEAR_RADIUS + 1) return CHUNK_SEGMENTS / 2;
    return CHUNK_LOD_FAR_SEGMENTS;
  };

  const scheduleRetry = (k: string) => {
    retryAt.set(k, Date.now() + 2_000);
  };

  const startFetchChunk = (cx: number, cz: number, lodSegments: number) => {
    const k = key(cx, cz);
    queuedFetches.delete(k);
    retryAt.delete(k);
    inflight.get(k)?.abort();
    const ctrl = new AbortController();
    inflight.set(k, ctrl);
    lodOf.set(k, lodSegments);
    const chunkUrl = staticTerrainChunkUrl(cx, cz) ?? tellusWorldChunkUrl(cx, cz);
    fetch(chunkUrl, { cache: "no-store", signal: ctrl.signal })
      .then((r) => {
        if (r.ok) return r.json() as Promise<ChunkData>;
        failedFetches++;
        scheduleRetry(k);
        return null;
      })
      .then((data) => {
        if (disposed || ctrl.signal.aborted || !data) return;
        ready.set(k, data); // built in flush()
      })
      .catch((error) => {
        if (!ctrl.signal.aborted) {
          failedFetches++;
          scheduleRetry(k);
          console.warn(`Tellus chunk fetch failed ${cx},${cz}`, error);
        }
      })
      .finally(() => {
        if (inflight.get(k) === ctrl) inflight.delete(k);
      });
  };

  const queueChunkFetch = (cx: number, cz: number, lodSegments: number, priority: number, force = false) => {
    const k = key(cx, cz);
    const existing = queuedFetches.get(k);
    if (
      existing &&
      existing.lodSegments === lodSegments &&
      existing.priority <= priority &&
      (existing.force || !force)
    ) {
      return;
    }
    queuedFetches.set(k, { cx, cz, lodSegments, priority, force });
    lodOf.set(k, lodSegments);
  };

  const pumpQueuedFetches = (maxStarts = Number.POSITIVE_INFINITY) => {
    if (disposed || queuedFetches.size === 0 || maxStarts <= 0) return 0;
    let started = 0;
    const sorted = [...queuedFetches]
      .sort(([, a], [, b]) => a.priority - b.priority);
    for (const [k, request] of sorted) {
      if (started >= maxStarts) break;
      if (inflight.has(k) || ready.has(k)) {
        queuedFetches.delete(k);
        continue;
      }
      const activeChunk = active.get(k);
      if (!request.force && activeChunk && activeChunk.lodSegments === request.lodSegments) {
        queuedFetches.delete(k);
        continue;
      }
      startFetchChunk(request.cx, request.cz, request.lodSegments);
      started++;
    }
    return started;
  };

  const evict = (k: string) => {
    inflight.get(k)?.abort();
    inflight.delete(k);
    queuedFetches.delete(k);
    ready.delete(k);
    lodOf.delete(k);
    retryAt.delete(k);
    const a = active.get(k);
    if (a) {
      group.remove(a.mesh);
      a.mesh.geometry.dispose(); // shared material left intact
      active.delete(k);
    }
  };

  const scheduleAround = (cx: number, cz: number, radius: number, now: number) => {
    const bounds = getChunkedWorldChunks(); // {w,h} in chunks, or null until the manifest loads
    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const tcx = cx + dx;
        const tcz = cz + dz;
        if (tcx < 0 || tcz < 0) continue; // world coords are [0, N*SPAN)
        if (bounds && (tcx >= bounds.w || tcz >= bounds.h)) continue; // past the world's far edge
        const ring = Math.max(Math.abs(dx), Math.abs(dz));
        const lod = lodForRing(ring);
        const k = key(tcx, tcz);
        const a = active.get(k);
        if (a && a.lodSegments === lod) continue; // already at right detail
        if (inflight.has(k) && lodOf.get(k) === lod) continue;
        if (ready.has(k) && lodOf.get(k) === lod) continue;
        if (queuedFetches.has(k) && lodOf.get(k) === lod) continue;
        const retry = retryAt.get(k);
        if (retry !== undefined && retry > now) continue;
        queueChunkFetch(tcx, tcz, lod, ring);
      }
    }
  };

  const update = (worldX: number, worldZ: number) => {
    if (disposed) return;
    const cx = Math.floor(worldX / CHUNK_SPAN);
    const cz = Math.floor(worldZ / CHUNK_SPAN);
    const now = Date.now();
    const hasDueRetry = [...retryAt].some(([k, at]) => {
      if (at > now) return false;
      const parts = k.split(",");
      const kcx = Number(parts[0]);
      const kcz = Number(parts[1]);
      return Math.max(Math.abs(kcx - cx), Math.abs(kcz - cz)) <= loadRadius;
    });
    if (cx === centerCx && cz === centerCz && !hasDueRetry) return; // re-evaluate on cell change or due retry
    centerCx = cx;
    centerCz = cz;

    // Ensure chunks within the load radius are fetched (skip already-active at the right LOD).
    scheduleAround(cx, cz, loadRadius, now);
    pumpQueuedFetches(fetchStartBudget);

    // Evict anything beyond the keep radius (Chebyshev distance). Scan ready.keys() too: a chunk whose
    // fetch already resolved sits in `ready` (not active, not inflight) and would otherwise leak — the next
    // flush() would build it as an orphan mesh outside the keep window.
    for (const k of [...active.keys(), ...inflight.keys(), ...ready.keys(), ...retryAt.keys()]) {
      const parts = k.split(",");
      const kcx = Number(parts[0]);
      const kcz = Number(parts[1]);
      if (Math.max(Math.abs(kcx - cx), Math.abs(kcz - cz)) > keepRadius()) evict(k);
    }
  };

  const prefetch = (worldX: number, worldZ: number, radius = 1) => {
    if (disposed) return;
    const cx = Math.floor(worldX / CHUNK_SPAN);
    const cz = Math.floor(worldZ / CHUNK_SPAN);
    scheduleAround(cx, cz, Math.max(0, Math.min(2, Math.round(radius))), Date.now());
    pumpQueuedFetches(fetchStartBudget);
  };

  const ensureBaseChunk = (worldX: number, worldZ: number): boolean => {
    if (disposed) return false;
    const cx = Math.floor(worldX / CHUNK_SPAN);
    const cz = Math.floor(worldZ / CHUNK_SPAN);
    const bounds = getChunkedWorldChunks();
    if (cx < 0 || cz < 0) return false;
    if (bounds && (cx >= bounds.w || cz >= bounds.h)) return false;
    const k = key(cx, cz);
    if (active.has(k)) return false;
    buildOrUpdate(
      k,
      {
        cx,
        cz,
        revision: -1,
        segments: CHUNK_SEGMENTS,
        sculptOffsets: [],
        paint: [],
        heightMode: "offset",
      },
      CHUNK_PROVISIONAL_SEGMENTS,
    );
    return true;
  };

  const chunkDataWithLocalPaint = (k: string, data: ChunkData): ChunkData => {
    const overrides = localPaintOverrides.get(k);
    const existing = active.get(k);
    if (!overrides?.size && !existing?.paint.length) return data;
    const paint = new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(0);
    if (existing?.paint.length) {
      for (let index = 0; index < Math.min(existing.paint.length, paint.length); index++) {
        const code = existing.paint[index] ?? 0;
        if (code) paint[index] = code;
      }
    }
    if (data.paint.length) {
      for (let index = 0; index < Math.min(data.paint.length, paint.length); index++) {
        const code = data.paint[index] ?? 0;
        if (code) paint[index] = code;
      }
    }
    if (overrides?.size) {
      for (const [index, code] of overrides) {
        if (index >= 0 && index < paint.length) paint[index] = code;
      }
    }
    return { ...data, paint };
  };

  const buildOrUpdate = (k: string, data: ChunkData, lodSegments: number) => {
    const mergedData = chunkDataWithLocalPaint(k, data);
    const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
    const geometry = createChunkTerrainGeometry(mergedData, lodSegments);
    const existing = active.get(k);
    if (existing) {
      existing.mesh.geometry.dispose();
      existing.mesh.geometry = geometry;
      existing.revision = mergedData.revision;
      existing.lodSegments = lodSegments;
      existing.template = template;
      existing.sculptOffsets = mergedData.sculptOffsets;
      existing.paint = mergedData.paint;
      existing.heightMode = mergedData.heightMode;
      return;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(mergedData.cx * CHUNK_SPAN, 0, mergedData.cz * CHUNK_SPAN);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
    active.set(k, {
      mesh,
      revision: mergedData.revision,
      lodSegments,
      template,
      cx: mergedData.cx,
      cz: mergedData.cz,
      sculptOffsets: mergedData.sculptOffsets,
      paint: mergedData.paint,
      heightMode: mergedData.heightMode,
    });
  };

  const rebuildTerrain = () => {
    if (disposed) return;
    for (const [k, a] of active) {
      buildOrUpdate(
        k,
        {
          cx: a.cx,
          cz: a.cz,
          revision: a.revision,
          segments: CHUNK_SEGMENTS,
          sculptOffsets: a.sculptOffsets,
          paint: a.paint,
          heightMode: a.heightMode,
        },
        a.lodSegments,
      );
    }
  };

  const flush = (
    maxBuilds = Number.POSITIVE_INFINITY,
    maxMs = Number.POSITIVE_INFINITY,
    maxFetchStarts = Number.POSITIVE_INFINITY,
  ) => {
    lastFlushBuilt = 0;
    lastFlushMs = 0;
    const startedAt = performance.now();
    pumpQueuedFetches(maxFetchStarts);
    if (disposed || ready.size === 0) {
      lastFlushMs = performance.now() - startedAt;
      maxFlushMs = Math.max(maxFlushMs, lastFlushMs);
      return;
    }
    const sorted = [...ready].sort(([, a], [, b]) => {
      const aRing = Number.isFinite(centerCx)
        ? Math.max(Math.abs(a.cx - centerCx), Math.abs(a.cz - centerCz))
        : 0;
      const bRing = Number.isFinite(centerCx)
        ? Math.max(Math.abs(b.cx - centerCx), Math.abs(b.cz - centerCz))
        : 0;
      return aRing - bRing;
    });
    for (const [k, data] of sorted) {
      if (lastFlushBuilt >= maxBuilds) break;
      if (lastFlushBuilt > 0 && performance.now() - startedAt >= maxMs) break;
      // Belt-and-suspenders against the evict race: a fetch that resolved after the owning chunk drifted
      // out of keep-radius must not be built. (evict() also scans ready, but a fetch can resolve between
      // an evict pass and this flush.)
      if (
        Number.isFinite(centerCx) &&
        Math.max(Math.abs(data.cx - centerCx), Math.abs(data.cz - centerCz)) > keepRadius()
      ) {
        ready.delete(k);
        continue;
      }
      const lod = lodOf.get(k) ?? CHUNK_SEGMENTS;
      const existing = active.get(k);
      const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
      // Skip rebuild if revision, LOD, and terrain template are unchanged (manifest revision-delta no-op).
      if (
        existing &&
        existing.revision === data.revision &&
        existing.lodSegments === lod &&
        existing.template === template
      ) {
        ready.delete(k);
        continue;
      }
      buildOrUpdate(k, data, lod);
      ready.delete(k);
      lastFlushBuilt++;
    }
    lastFlushMs = performance.now() - startedAt;
    maxFlushMs = Math.max(maxFlushMs, lastFlushMs);
  };

  const reloadChunk = (chunkX: number, chunkZ: number) => {
    const k = key(chunkX, chunkZ);
    const a = active.get(k);
    // Only reload chunks we have on screen, in flight, or already fetched-and-waiting (ready); a patch
    // that lands in the ready window must still refetch so the newer revision wins.
    if (!a && !inflight.has(k) && !ready.has(k)) return;
    queueChunkFetch(chunkX, chunkZ, a?.lodSegments ?? CHUNK_SEGMENTS, -1, true);
  };

  const applyLocalPaint = (kind: TerrainPaintKind, worldX: number, worldZ: number, radius: number) => {
    if (disposed) return;
    const paintCode = terrainPaintCode(kind);
    const radiusSq = radius * radius;
    for (const [k, a] of active) {
      const chunkX0 = a.cx * CHUNK_SPAN;
      const chunkZ0 = a.cz * CHUNK_SPAN;
      const nearestX = Math.max(chunkX0, Math.min(chunkX0 + CHUNK_SPAN, worldX));
      const nearestZ = Math.max(chunkZ0, Math.min(chunkZ0 + CHUNK_SPAN, worldZ));
      if ((nearestX - worldX) ** 2 + (nearestZ - worldZ) ** 2 > radiusSq) continue;
      const paint =
        a.paint.length === CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT
          ? [...a.paint]
          : new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(0);
      let changed = false;
      let overrides = localPaintOverrides.get(k);
      if (!overrides) {
        overrides = new Map();
        localPaintOverrides.set(k, overrides);
      }
      for (let index = 0; index < paint.length; index++) {
        const existingCode = paint[index] ?? 0;
        if (existingCode) overrides.set(index, existingCode);
      }
      for (let zi = 0; zi < CHUNK_VERTEX_COUNT; zi++) {
        const z = chunkZ0 + (zi / CHUNK_SEGMENTS) * CHUNK_SPAN;
        for (let xi = 0; xi < CHUNK_VERTEX_COUNT; xi++) {
          const x = chunkX0 + (xi / CHUNK_SEGMENTS) * CHUNK_SPAN;
          const distanceSq = (x - worldX) ** 2 + (z - worldZ) ** 2;
          if (distanceSq > radiusSq) continue;
          const falloff =
            (1 + Math.cos((Math.sqrt(distanceSq) / radius) * Math.PI)) * 0.5;
          if (falloff < 0.18) continue;
          const index = zi * CHUNK_VERTEX_COUNT + xi;
          if (paint[index] === paintCode) continue;
          paint[index] = paintCode;
          overrides.set(index, paintCode);
          changed = true;
        }
      }
      if (!changed) continue;
      buildOrUpdate(
        k,
        {
          cx: a.cx,
          cz: a.cz,
          revision: a.revision,
          segments: CHUNK_SEGMENTS,
          sculptOffsets: a.sculptOffsets,
          paint,
          heightMode: a.heightMode,
        },
        a.lodSegments,
      );
    }
  };

  const sampleHeight = (worldX: number, worldZ: number): number | null => {
    if (disposed) return null;
    const cx = Math.floor(worldX / CHUNK_SPAN);
    const cz = Math.floor(worldZ / CHUNK_SPAN);
    const a = active.get(key(cx, cz));
    if (!a) return null; // chunk not loaded -> grounding falls back to the flat base
    const moduleOffset = historicalTerrainOffset(worldX, worldZ);
    if (a.sculptOffsets.length === 0) {
      return (a.heightMode === "absolute" ? 0 : largeWorldBaseHeight(worldX, worldZ)) + moduleOffset;
    }
    // Local coords within the chunk, in [0, CHUNK_SPAN]; convert to the 65-grid index space.
    const lx = worldX - cx * CHUNK_SPAN;
    const lz = worldZ - cz * CHUNK_SPAN;
    const gx = (lx / CHUNK_SPAN) * CHUNK_SEGMENTS;
    const gz = (lz / CHUNK_SPAN) * CHUNK_SEGMENTS;
    const x0 = Math.max(0, Math.min(CHUNK_SEGMENTS, Math.floor(gx)));
    const z0 = Math.max(0, Math.min(CHUNK_SEGMENTS, Math.floor(gz)));
    const x1 = Math.min(CHUNK_SEGMENTS, x0 + 1);
    const z1 = Math.min(CHUNK_SEGMENTS, z0 + 1);
    const tx = gx - x0;
    const tz = gz - z0;
    const h00 = sculptAt(a.sculptOffsets, x0, z0);
    const h10 = sculptAt(a.sculptOffsets, x1, z0);
    const h01 = sculptAt(a.sculptOffsets, x0, z1);
    const h11 = sculptAt(a.sculptOffsets, x1, z1);
    const sculptOffset = (
      h00 * (1 - tx) * (1 - tz) +
      h10 * tx * (1 - tz) +
      h01 * (1 - tx) * tz +
      h11 * tx * tz
    );
    return (a.heightMode === "absolute" ? 0 : largeWorldBaseHeight(worldX, worldZ)) + sculptOffset + moduleOffset;
  };

  const samplePaint = (worldX: number, worldZ: number): TerrainPaintKind | null => {
    if (disposed) return null;
    const cx = Math.floor(worldX / CHUNK_SPAN);
    const cz = Math.floor(worldZ / CHUNK_SPAN);
    const a = active.get(key(cx, cz));
    if (!a || a.paint.length === 0) return null;
    const lx = worldX - cx * CHUNK_SPAN;
    const lz = worldZ - cz * CHUNK_SPAN;
    const gx = Math.max(0, Math.min(CHUNK_SEGMENTS, Math.round((lx / CHUNK_SPAN) * CHUNK_SEGMENTS)));
    const gz = Math.max(0, Math.min(CHUNK_SEGMENTS, Math.round((lz / CHUNK_SPAN) * CHUNK_SEGMENTS)));
    const code = a.paint[gz * CHUNK_VERTEX_COUNT + gx] ?? 0;
    const kind = code ? terrainPaintKindFromCode(code) : null;
    return shouldApplyChunkPaint(a.template, kind) ? kind : null;
  };

  const dispose = () => {
    disposed = true;
    for (const ctrl of inflight.values()) ctrl.abort();
    inflight.clear();
    queuedFetches.clear();
    ready.clear();
    lodOf.clear();
    for (const a of active.values()) {
      group.remove(a.mesh);
      a.mesh.geometry.dispose();
    }
    active.clear();
    material.dispose();
    scene.remove(group);
  };

  const setLoadRadius = (radius: number) => {
    const r = Math.max(1, Math.min(12, Math.round(radius)));
    if (r === loadRadius) return;
    loadRadius = r;
    // Force the next update() to re-evaluate the ring (load new chunks / evict shrunk-out ones) even though
    // the centre chunk hasn't moved — the early-out compares against centerCx/centerCz.
    centerCx = NaN;
    centerCz = NaN;
  };

  const setFetchStartBudget = (maxStarts: number) => {
    fetchStartBudget = Math.max(0, Math.floor(maxStarts));
  };

  return {
    update,
    prefetch,
    ensureBaseChunk,
    setLoadRadius,
    setFetchStartBudget,
    reloadChunk,
    rebuildTerrain,
    applyLocalPaint,
    flush,
    sampleHeight,
    samplePaint,
    stats: () => ({
      active: active.size,
      pending: queuedFetches.size + inflight.size + ready.size,
      queued: queuedFetches.size,
      inflight: inflight.size,
      ready: ready.size,
      failed: failedFetches,
      loadRadius,
      center: Number.isFinite(centerCx) ? { cx: centerCx, cz: centerCz } : null,
      lastFlushBuilt,
      lastFlushMs: Math.round(lastFlushMs * 10) / 10,
      maxFlushMs: Math.round(maxFlushMs * 10) / 10,
      provisional: [...active.values()].filter((chunk) => chunk.revision < 0).length,
      currentProvisional:
        Number.isFinite(centerCx) &&
        (active.get(key(centerCx, centerCz))?.revision ?? 0) < 0,
    }),
    dispose,
  };
}
