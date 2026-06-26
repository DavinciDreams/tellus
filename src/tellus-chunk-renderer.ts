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
import { parseWorldTemplateId } from "./tellus-world-templates";
import {
  tellusWorldChunkUrl,
} from "./tellus-urls-identity";
import type { ChunkData } from "./world-protocol";
import type { TerrainPaintKind, WorldTemplateId } from "./tellus-types";

const key = (cx: number, cz: number) => `${cx},${cz}`;
const CHUNK_SKIRT_DEPTH = 8;

// Sample the 65x65 sculpt grid (row-major z*65+x). Empty array => flat (revision 0).
function sculptAt(offsets: number[], xi: number, zi: number): number {
  if (offsets.length === 0) return 0;
  return offsets[zi * CHUNK_VERTEX_COUNT + xi] ?? 0;
}

function shouldApplyChunkPaint(_template: WorldTemplateId, kind: TerrainPaintKind | null): kind is TerrainPaintKind {
  // Explicit user paint stored in a chunk wins over the procedural biome. Otherwise strokes like
  // meadow/beach/dirt/rock can appear to do nothing when a non-Tellus template owns the base biome.
  return kind !== null;
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
  const seg = Math.max(1, Math.min(lodSegments, CHUNK_SEGMENTS));
  const stride = CHUNK_SEGMENTS / seg; // 64/seg; integer for 64,32,16,8
  const worldX0 = chunk.cx * CHUNK_SPAN;
  const worldZ0 = chunk.cz * CHUNK_SPAN;

  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const paintCodes: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= seg; j++) {
    const zi = Math.round(j * stride); // sample index into the 65-grid
    const lz = (j / seg) * CHUNK_SPAN; // local z in [0,96]
    for (let i = 0; i <= seg; i++) {
      const xi = Math.round(i * stride);
      const lx = (i / seg) * CHUNK_SPAN; // local x in [0,96]
      const wx = worldX0 + lx;
      const wz = worldZ0 + lz;
      const py = largeWorldBaseHeight(wx, wz) + sculptAt(chunk.sculptOffsets, xi, zi);
      const paintCode = chunk.paint.length
        ? (chunk.paint[zi * CHUNK_VERTEX_COUNT + xi] ?? 0)
        : 0;
      const paintKind = paintCode ? terrainPaintKindFromCode(paintCode) : null;
      const kind = shouldApplyChunkPaint(template, paintKind) ? paintKind : null;
      const resolvedKind = kind ?? largeWorldTerrainKind(wx, wz, py) ?? terrainKind(wx, wz, py);
      const color = terrainVertexColor(resolvedKind, wx, wz, xi * 1009 + zi * 9176);
      positions.push(lx, py, lz);
      colors.push(color.r, color.g, color.b);
      uvs.push(wx / CHUNK_SPAN, wz / CHUNK_SPAN);
      // Carry the code of the APPLIED paint (0 when the biome owns the vertex), so the material's
      // per-kind pattern matches the vertex color and biome terrain stays pattern-free.
      paintCodes.push(kind ? terrainPaintCode(kind) : 0);
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
    return skirtIndex;
  };

  const ring: number[] = [];
  for (let x = 0; x < seg; x++) ring.push(x);
  for (let z = 0; z < seg; z++) ring.push(z * row + seg);
  for (let x = seg; x > 0; x--) ring.push(seg * row + x);
  for (let z = seg; z > 0; z--) ring.push(z * row);

  const skirtRing = ring.map(addSkirtVertex);
  for (let i = 0; i < ring.length; i++) {
    const next = (i + 1) % ring.length;
    const a = ring[i];
    const b = ring[next];
    const a2 = skirtRing[i];
    const b2 = skirtRing[next];
    // Include both windings so the skirt masks seams from above and below with front-face materials.
    indices.push(a, a2, b, b, a2, b2, a, b, a2, b, b2, a2);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("tellusPaintCode", new THREE.Float32BufferAttribute(paintCodes, 1));
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
}

export interface ChunkRenderer {
  /** Per-frame from animate(); re-evaluates the load/evict ring only when the center chunk changes. */
  update(worldX: number, worldZ: number): void;
  /** Set how many chunk-rings load around the player (radius in chunks; (2r+1)² chunks). Forces a re-eval. */
  setLoadRadius(radius: number): void;
  /** /live chunk.updated -> mark dirty + refetch that chunk (rebuilt in the next flush). */
  reloadChunk(chunkX: number, chunkZ: number): void;
  /** Rebuild already-loaded chunks when the active terrain template/land-shape changes. */
  rebuildTerrain(): void;
  /** Optimistic local paint for immediate feedback while the authoritative chunk patch round-trips. */
  applyLocalPaint(kind: TerrainPaintKind, worldX: number, worldZ: number, radius: number): void;
  /** Rebuild any chunks whose data arrived since last frame — call once/frame next to flushTerrain(). */
  flush(): void;
  /**
   * Bilinearly sample the sculpted chunk height at world (x,z). Returns null when the chunk that
   * owns (x,z) is not currently active (so grounding falls back to the flat base). A loaded chunk
   * with empty sculptOffsets samples 0 (flat base).
   */
  sampleHeight(worldX: number, worldZ: number): number | null;
  samplePaint(worldX: number, worldZ: number): TerrainPaintKind | null;
  stats(): { active: number; pending: number; failed: number };
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
  const ready = new Map<string, ChunkData>(); // fetched data awaiting build/rebuild in flush()
  const lodOf = new Map<string, number>(); // intended lod for a pending fetch
  const retryAt = new Map<string, number>(); // failed fetches; retried while the chunk remains wanted
  let centerCx = NaN;
  let centerCz = NaN;
  let disposed = false;
  let failedFetches = 0;
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

  const fetchChunk = (cx: number, cz: number, lodSegments: number) => {
    const k = key(cx, cz);
    retryAt.delete(k);
    inflight.get(k)?.abort();
    const ctrl = new AbortController();
    inflight.set(k, ctrl);
    lodOf.set(k, lodSegments);
    fetch(tellusWorldChunkUrl(cx, cz), { cache: "no-store", signal: ctrl.signal })
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

  const evict = (k: string) => {
    inflight.get(k)?.abort();
    inflight.delete(k);
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
    const bounds = getChunkedWorldChunks(); // {w,h} in chunks, or null until the manifest loads
    for (let dz = -loadRadius; dz <= loadRadius; dz++) {
      for (let dx = -loadRadius; dx <= loadRadius; dx++) {
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
        const retry = retryAt.get(k);
        if (retry !== undefined && retry > now) continue;
        fetchChunk(tcx, tcz, lod);
      }
    }

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

  const buildOrUpdate = (k: string, data: ChunkData, lodSegments: number) => {
    const template = parseWorldTemplateId(runtimeConfig.worldTemplate, "tellus");
    const geometry = createChunkTerrainGeometry(data, lodSegments);
    const existing = active.get(k);
    if (existing) {
      existing.mesh.geometry.dispose();
      existing.mesh.geometry = geometry;
      existing.revision = data.revision;
      existing.lodSegments = lodSegments;
      existing.template = template;
      existing.sculptOffsets = data.sculptOffsets;
      existing.paint = data.paint;
      return;
    }
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(data.cx * CHUNK_SPAN, 0, data.cz * CHUNK_SPAN);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    group.add(mesh);
    active.set(k, {
      mesh,
      revision: data.revision,
      lodSegments,
      template,
      cx: data.cx,
      cz: data.cz,
      sculptOffsets: data.sculptOffsets,
      paint: data.paint,
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
        },
        a.lodSegments,
      );
    }
  };

  const flush = () => {
    if (disposed || ready.size === 0) return;
    for (const [k, data] of ready) {
      // Belt-and-suspenders against the evict race: a fetch that resolved after the owning chunk drifted
      // out of keep-radius must not be built. (evict() also scans ready, but a fetch can resolve between
      // an evict pass and this flush.)
      if (
        Number.isFinite(centerCx) &&
        Math.max(Math.abs(data.cx - centerCx), Math.abs(data.cz - centerCz)) > keepRadius()
      ) {
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
        continue;
      }
      buildOrUpdate(k, data, lod);
    }
    ready.clear();
  };

  const reloadChunk = (chunkX: number, chunkZ: number) => {
    const k = key(chunkX, chunkZ);
    const a = active.get(k);
    // Only reload chunks we have on screen, in flight, or already fetched-and-waiting (ready); a patch
    // that lands in the ready window must still refetch so the newer revision wins.
    if (!a && !inflight.has(k) && !ready.has(k)) return;
    fetchChunk(chunkX, chunkZ, a?.lodSegments ?? CHUNK_SEGMENTS);
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
    if (a.sculptOffsets.length === 0) return largeWorldBaseHeight(worldX, worldZ);
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
    return largeWorldBaseHeight(worldX, worldZ) + sculptOffset;
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

  return {
    update,
    setLoadRadius,
    reloadChunk,
    rebuildTerrain,
    applyLocalPaint,
    flush,
    sampleHeight,
    samplePaint,
    stats: () => ({ active: active.size, pending: inflight.size + ready.size, failed: failedFetches }),
    dispose,
  };
}
