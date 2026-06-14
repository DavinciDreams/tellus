import * as THREE from "three";
import {
  CHUNK_KEEP_RADIUS,
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
  terrainPaintKindFromCode,
  terrainVertexColor,
} from "./tellus-terrain";
import {
  tellusWorldChunkUrl,
} from "./tellus-urls-identity";
import type { ChunkData } from "./world-protocol";

const key = (cx: number, cz: number) => `${cx},${cz}`;

// Sample the 65x65 sculpt grid (row-major z*65+x). Empty array => flat (revision 0).
function sculptAt(offsets: number[], xi: number, zi: number): number {
  if (offsets.length === 0) return 0;
  return offsets[zi * CHUNK_VERTEX_COUNT + xi] ?? 0;
}

// Build a per-chunk square BufferGeometry in LOCAL coords [0,SPAN]; the Mesh is positioned
// at world (cx*96, 0, cz*96). `lodSegments` decimates the 64-seg grid for distant chunks
// (e.g. 16 -> stride 4) by subsampling the 65² arrays. Mirrors createTerrainGeometry's
// index winding + computeVertexNormals; drops the single-grid circular edgeScale clamp.
export function createChunkTerrainGeometry(
  chunk: ChunkData,
  lodSegments: number = CHUNK_SEGMENTS,
): THREE.BufferGeometry {
  const seg = Math.min(lodSegments, CHUNK_SEGMENTS);
  const stride = CHUNK_SEGMENTS / seg; // 64/seg; integer for 64,32,16,8
  const worldX0 = chunk.cx * CHUNK_SPAN;
  const worldZ0 = chunk.cz * CHUNK_SPAN;

  const positions: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= seg; j++) {
    const zi = Math.round(j * stride); // sample index into the 65-grid
    const lz = (j / seg) * CHUNK_SPAN; // local z in [0,96]
    for (let i = 0; i <= seg; i++) {
      const xi = Math.round(i * stride);
      const lx = (i / seg) * CHUNK_SPAN; // local x in [0,96]
      const py = sculptAt(chunk.sculptOffsets, xi, zi); // flat base (Phase 2.5 = island base)
      const wx = worldX0 + lx;
      const wz = worldZ0 + lz;
      const paintCode = chunk.paint.length
        ? (chunk.paint[zi * CHUNK_VERTEX_COUNT + xi] ?? 0)
        : 0;
      const kind = paintCode ? terrainPaintKindFromCode(paintCode) : null;
      const resolvedKind = kind ?? terrainKind(wx, wz, py);
      const color = terrainVertexColor(resolvedKind, wx, wz, xi * 1009 + zi * 9176);
      positions.push(lx, py, lz);
      colors.push(color.r, color.g, color.b);
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

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

interface ActiveChunk {
  mesh: THREE.Mesh;
  revision: number;
  lodSegments: number;
  // Raw sculpt offsets (65x65, row-major z*65+x; [] when flat) kept so grounding can sample the
  // actual heightfield where the chunk is loaded. cx/cz live on mesh.position but cached here too.
  cx: number;
  cz: number;
  sculptOffsets: number[];
}

export interface ChunkRenderer {
  /** Per-frame from animate(); re-evaluates the load/evict ring only when the center chunk changes. */
  update(worldX: number, worldZ: number): void;
  /** /live chunk.updated -> mark dirty + refetch that chunk (rebuilt in the next flush). */
  reloadChunk(chunkX: number, chunkZ: number): void;
  /** Rebuild any chunks whose data arrived since last frame — call once/frame next to flushTerrain(). */
  flush(): void;
  /**
   * Bilinearly sample the sculpted chunk height at world (x,z). Returns null when the chunk that
   * owns (x,z) is not currently active (so grounding falls back to the flat base). A loaded chunk
   * with empty sculptOffsets samples 0 (flat base).
   */
  sampleHeight(worldX: number, worldZ: number): number | null;
  stats(): { active: number; pending: number };
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
  let centerCx = NaN;
  let centerCz = NaN;
  let disposed = false;

  // Uniform full-res LOD: per-ring decimation produced T-junction CRACKS at every near/far seam
  // (a 65-edge-vertex chunk next to a 17-edge-vertex chunk leaves gaps). Until edge-skirts/stitching
  // land (Phase-2.5), keep every loaded chunk at full CHUNK_SEGMENTS so matched seams stay crack-free.
  // (CHUNK_LOD_FAR_SEGMENTS / CHUNK_LOD_NEAR_RADIUS retained for the future skirted LOD path.)
  const lodForRing = (_ring: number) => {
    void CHUNK_LOD_NEAR_RADIUS;
    void CHUNK_LOD_FAR_SEGMENTS;
    return CHUNK_SEGMENTS;
  };

  const fetchChunk = (cx: number, cz: number, lodSegments: number) => {
    const k = key(cx, cz);
    inflight.get(k)?.abort();
    const ctrl = new AbortController();
    inflight.set(k, ctrl);
    lodOf.set(k, lodSegments);
    fetch(tellusWorldChunkUrl(cx, cz), { cache: "no-store", signal: ctrl.signal })
      .then((r) => (r.ok ? (r.json() as Promise<ChunkData>) : null))
      .then((data) => {
        if (disposed || ctrl.signal.aborted || !data) return;
        ready.set(k, data); // built in flush()
      })
      .catch(() => undefined)
      .finally(() => {
        if (inflight.get(k) === ctrl) inflight.delete(k);
      });
  };

  const evict = (k: string) => {
    inflight.get(k)?.abort();
    inflight.delete(k);
    ready.delete(k);
    lodOf.delete(k);
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
    if (cx === centerCx && cz === centerCz) return; // only re-evaluate on chunk-cell change
    centerCx = cx;
    centerCz = cz;

    // Ensure chunks within the load radius are fetched (skip already-active at the right LOD).
    const bounds = getChunkedWorldChunks(); // {w,h} in chunks, or null until the manifest loads
    for (let dz = -CHUNK_LOAD_RADIUS; dz <= CHUNK_LOAD_RADIUS; dz++) {
      for (let dx = -CHUNK_LOAD_RADIUS; dx <= CHUNK_LOAD_RADIUS; dx++) {
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
        fetchChunk(tcx, tcz, lod);
      }
    }

    // Evict anything beyond the keep radius (Chebyshev distance). Scan ready.keys() too: a chunk whose
    // fetch already resolved sits in `ready` (not active, not inflight) and would otherwise leak — the next
    // flush() would build it as an orphan mesh outside the keep window.
    for (const k of [...active.keys(), ...inflight.keys(), ...ready.keys()]) {
      const parts = k.split(",");
      const kcx = Number(parts[0]);
      const kcz = Number(parts[1]);
      if (Math.max(Math.abs(kcx - cx), Math.abs(kcz - cz)) > CHUNK_KEEP_RADIUS) evict(k);
    }
  };

  const buildOrUpdate = (k: string, data: ChunkData, lodSegments: number) => {
    const geometry = createChunkTerrainGeometry(data, lodSegments);
    const existing = active.get(k);
    if (existing) {
      existing.mesh.geometry.dispose();
      existing.mesh.geometry = geometry;
      existing.revision = data.revision;
      existing.lodSegments = lodSegments;
      existing.sculptOffsets = data.sculptOffsets;
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
      cx: data.cx,
      cz: data.cz,
      sculptOffsets: data.sculptOffsets,
    });
  };

  const flush = () => {
    if (disposed || ready.size === 0) return;
    for (const [k, data] of ready) {
      // Belt-and-suspenders against the evict race: a fetch that resolved after the owning chunk drifted
      // out of keep-radius must not be built. (evict() also scans ready, but a fetch can resolve between
      // an evict pass and this flush.)
      if (
        Number.isFinite(centerCx) &&
        Math.max(Math.abs(data.cx - centerCx), Math.abs(data.cz - centerCz)) > CHUNK_KEEP_RADIUS
      ) {
        continue;
      }
      const lod = lodOf.get(k) ?? CHUNK_SEGMENTS;
      const existing = active.get(k);
      // Skip rebuild if revision AND lod are unchanged (manifest revision-delta no-op).
      if (existing && existing.revision === data.revision && existing.lodSegments === lod)
        continue;
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

  const sampleHeight = (worldX: number, worldZ: number): number | null => {
    if (disposed) return null;
    const cx = Math.floor(worldX / CHUNK_SPAN);
    const cz = Math.floor(worldZ / CHUNK_SPAN);
    const a = active.get(key(cx, cz));
    if (!a) return null; // chunk not loaded -> grounding falls back to the flat base
    if (a.sculptOffsets.length === 0) return 0; // loaded but flat
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
    return (
      h00 * (1 - tx) * (1 - tz) +
      h10 * tx * (1 - tz) +
      h01 * (1 - tx) * tz +
      h11 * tx * tz
    );
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

  return {
    update,
    reloadChunk,
    flush,
    sampleHeight,
    stats: () => ({ active: active.size, pending: inflight.size + ready.size }),
    dispose,
  };
}
