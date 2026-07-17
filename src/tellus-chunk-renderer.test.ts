import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as THREE from "three";

vi.mock("./tellus-urls-identity", () => ({
  tellusWorldChunkUrl: (cx: number, cz: number) => `https://test/chunk/${cx}/${cz}`,
}));

import {
  createChunkRenderer,
  createChunkTerrainGeometry,
} from "./tellus-chunk-renderer";
import { largeWorldBaseHeight } from "./tellus-large-world-terrain";
import { terrainPaintCode } from "./tellus-terrain";
import {
  CHUNK_LOAD_RADIUS,
  CHUNK_SEGMENTS,
  CHUNK_SPAN,
  CHUNK_VERTEX_COUNT,
  setChunkedWorldChunks,
} from "./tellus-constants";
import { runtimeConfig } from "./tellus-runtime-config";
import type { ChunkData } from "./world-protocol";

function makeChunk(over: Partial<ChunkData> = {}): ChunkData {
  return {
    cx: 0,
    cz: 0,
    revision: 0,
    segments: CHUNK_SEGMENTS,
    sculptOffsets: [],
    paint: [],
    ...over,
  };
}

const skirtVertexCount = (seg: number) => seg * 4;
const terrainVertexCount = (seg: number) => (seg + 1) * (seg + 1) + skirtVertexCount(seg);
const terrainIndexCount = (seg: number) => (seg * seg * 6) + (skirtVertexCount(seg) * 12);

describe("createChunkTerrainGeometry", () => {
  afterEach(() => {
    setChunkedWorldChunks(null);
    runtimeConfig.worldId = "chunked-64-genesis";
    runtimeConfig.worldTemplate = "tellus";
    runtimeConfig.landShape = undefined;
  });

  it("renders empty sculptOffsets as natural large-world terrain", () => {
    const geometry = createChunkTerrainGeometry(makeChunk());
    const pos = geometry.getAttribute("position");
    let minY = Infinity;
    let maxY = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minY = Math.min(minY, pos.getY(i));
      maxY = Math.max(maxY, pos.getY(i));
    }
    expect(maxY - minY).toBeGreaterThan(2);
  });

  it("has full LOD vertices plus a border skirt", () => {
    const geometry = createChunkTerrainGeometry(makeChunk());
    expect(geometry.getAttribute("position").count).toBe(
      terrainVertexCount(CHUNK_SEGMENTS),
    );
    expect(geometry.getAttribute("uv").count).toBe(
      terrainVertexCount(CHUNK_SEGMENTS),
    );
    expect(geometry.getAttribute("tellusPaintCode").count).toBe(
      terrainVertexCount(CHUNK_SEGMENTS),
    );
    const index = geometry.getIndex();
    expect(index?.count).toBe(terrainIndexCount(CHUNK_SEGMENTS));
  });

  it("decimates to (seg+1)² vertices plus a border skirt at lodSegments=16", () => {
    const geometry = createChunkTerrainGeometry(makeChunk(), 16);
    expect(geometry.getAttribute("position").count).toBe(terrainVertexCount(16));
    expect(geometry.getIndex()?.count).toBe(terrainIndexCount(16));
  });

  it("spans local x/z in [0, CHUNK_SPAN] regardless of chunk world coords", () => {
    const geometry = createChunkTerrainGeometry(makeChunk({ cx: 3, cz: 4 }));
    const pos = geometry.getAttribute("position");
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (let i = 0; i < pos.count; i++) {
      minX = Math.min(minX, pos.getX(i));
      maxX = Math.max(maxX, pos.getX(i));
      minZ = Math.min(minZ, pos.getZ(i));
      maxZ = Math.max(maxZ, pos.getZ(i));
    }
    expect(minX).toBe(0);
    expect(maxX).toBe(CHUNK_SPAN);
    expect(minZ).toBe(0);
    expect(maxZ).toBe(CHUNK_SPAN);
  });

  it("surfaces a nonzero sculpt offset at the matching vertex", () => {
    const offsets = new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(0);
    const xi = 10;
    const zi = 20;
    offsets[zi * CHUNK_VERTEX_COUNT + xi] = 7.5;
    const geometry = createChunkTerrainGeometry(
      makeChunk({ revision: 1, sculptOffsets: offsets }),
    );
    const pos = geometry.getAttribute("position");
    // Full LOD: vertex index in the built grid is j*(seg+1)+i with i=xi, j=zi.
    const vtx = zi * CHUNK_VERTEX_COUNT + xi;
    const wx = (xi / CHUNK_SEGMENTS) * CHUNK_SPAN;
    const wz = (zi / CHUNK_SEGMENTS) * CHUNK_SPAN;
    expect(pos.getY(vtx)).toBeCloseTo(largeWorldBaseHeight(wx, wz) + 7.5, 5);
  });

  it("renders template changes into chunk geometry", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    const chunk = makeChunk({ cx: 32, cz: 32 });

    runtimeConfig.worldId = "chunked-64-copper-terraces";
    runtimeConfig.worldTemplate = "evoflow-copper-terraces";
    const copper = createChunkTerrainGeometry(chunk);
    const copperY = (copper.getAttribute("position") as THREE.BufferAttribute).getY(0);

    runtimeConfig.worldId = "chunked-64-basalt-teeth";
    runtimeConfig.worldTemplate = "evoflow-basalt-teeth";
    const basalt = createChunkTerrainGeometry(chunk);
    const basaltY = (basalt.getAttribute("position") as THREE.BufferAttribute).getY(0);

    expect(Math.abs(basaltY - copperY)).toBeGreaterThan(1);
    copper.dispose();
    basalt.dispose();
  });

  it("applies historical terrain stamps to chunk geometry", () => {
    setChunkedWorldChunks({ w: 64, h: 64 });
    const chunk = makeChunk({ cx: 32, cz: 31, heightMode: "absolute" });

    runtimeConfig.worldId = "chunked-64-genesis";
    runtimeConfig.worldTemplate = "tellus";
    const plain = createChunkTerrainGeometry(chunk);

    runtimeConfig.worldId = "chunked-64-cahokia";
    const cahokia = createChunkTerrainGeometry(chunk);

    const plainPos = plain.getAttribute("position") as THREE.BufferAttribute;
    const cahokiaPos = cahokia.getAttribute("position") as THREE.BufferAttribute;
    let maxDelta = -Infinity;
    for (let i = 0; i < Math.min(plainPos.count, cahokiaPos.count); i++) {
      maxDelta = Math.max(maxDelta, cahokiaPos.getY(i) - plainPos.getY(i));
    }

    expect(maxDelta).toBeGreaterThan(12);
    plain.dispose();
    cahokia.dispose();
  });

  it("keeps real terrain chunks out of Tellus procedural paint patterns", () => {
    const paint = new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(terrainPaintCode("rock"));
    runtimeConfig.worldId = "chunked-24-grand-canyon";
    runtimeConfig.worldTemplate = "grand-canyon-terrain";

    const geometry = createChunkTerrainGeometry(makeChunk({ paint, heightMode: "absolute" }), 16);
    const paintCodes = geometry.getAttribute("tellusPaintCode") as THREE.BufferAttribute;
    let maxPaintCode = 0;
    for (let i = 0; i < paintCodes.count; i++) {
      maxPaintCode = Math.max(maxPaintCode, paintCodes.getX(i));
    }

    expect(maxPaintCode).toBe(0);
    geometry.dispose();
  });
});

describe("createChunkRenderer lifecycle", () => {
  // A controllable fetch: each chunk URL resolves only when we call its deferred.
  let pending: Map<string, (data: ChunkData) => void>;

  beforeEach(() => {
    pending = new Map();
    vi.stubGlobal("fetch", (url: string) => {
      const m = /\/chunk\/(-?\d+)\/(-?\d+)/.exec(url);
      const cx = Number(m![1]);
      const cz = Number(m![2]);
      return new Promise((resolve) => {
        pending.set(`${cx},${cz}`, (data: ChunkData) =>
          resolve({ ok: true, json: () => Promise.resolve(data) } as Response),
        );
      });
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    setChunkedWorldChunks(null);
    runtimeConfig.worldId = "chunked-64-genesis";
    runtimeConfig.worldTemplate = "tellus";
    runtimeConfig.landShape = undefined;
  });

  const resolveAll = async () => {
    for (const [k, done] of pending) {
      const [cx, cz] = k.split(",").map(Number);
      done(makeChunk({ cx, cz, revision: 1 }));
    }
    pending.clear();
    // Flush the full fetch -> json() -> ready.set microtask chain.
    await new Promise((res) => setTimeout(res, 0));
  };

  it("builds the load ring with skirted near/far LOD", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    r.update(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1); // center chunk (10,10)
    await resolveAll();
    r.flush();
    expect(r.stats().active).toBe(5 * 5); // CHUNK_LOAD_RADIUS=2 -> 5x5
    const group = scene.getObjectByName("tellus-chunk-terrain") as THREE.Group;
    let fullCount = 0;
    let midCount = 0;
    for (const child of group.children) {
      const mesh = child as THREE.Mesh;
      const count = mesh.geometry.getAttribute("position").count;
      if (count === terrainVertexCount(CHUNK_SEGMENTS)) fullCount++;
      if (count === terrainVertexCount(CHUNK_SEGMENTS / 2)) midCount++;
    }
    expect(fullCount).toBe(9);
    expect(midCount).toBe((CHUNK_LOAD_RADIUS * 2 + 1) ** 2 - fullCount);
    r.dispose();
  });

  it("keeps hysteresis-ring terrain cached but hides it outside the visible load ring", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    const group = scene.getObjectByName("tellus-chunk-terrain") as THREE.Group;
    r.update(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1);
    await resolveAll();
    r.flush();

    r.update(CHUNK_SPAN * 11 + 1, CHUNK_SPAN * 10 + 1);
    expect(r.stats().active).toBe(25);
    expect(r.stats().visible).toBe(20);
    expect(group.children.filter((child) => child.visible)).toHaveLength(20);

    await resolveAll();
    r.flush();
    expect(r.stats().active).toBe(30);
    expect(r.stats().visible).toBe(25);
    expect(group.children.filter((child) => child.visible)).toHaveLength(25);
    r.dispose();
  });

  it("does NOT build a fetched chunk that drifted out of keep-radius before flush (evict race)", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    const group = scene.getObjectByName("tellus-chunk-terrain") as THREE.Group;

    // Load + fully fetch the ring around (10,10) so chunks sit in `ready` (fetched, not yet flushed).
    r.update(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1);
    await resolveAll();
    // No flush yet: the 5x5 ring is parked in `ready`. Jump far so ALL of them exit keep-radius.
    r.update(CHUNK_SPAN * 80 + 1, CHUNK_SPAN * 80 + 1);
    r.flush();

    // The pre-fix bug: those ready chunks (not active, not inflight) survived the evict scan and flush()
    // built them as orphan meshes far outside the view. After the fix: zero orphans.
    expect(r.stats().active).toBe(0);
    expect(group.children.length).toBe(0);
    r.dispose();
  });

  it("prefetches ahead without evicting the current center ring", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    r.update(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1);
    await resolveAll();
    r.flush();
    expect(r.sampleHeight(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1)).not.toBeNull();

    r.prefetch(CHUNK_SPAN * 20 + 1, CHUNK_SPAN * 20 + 1, 1);
    expect(r.stats().center).toEqual({ cx: 10, cz: 10 });
    expect(r.sampleHeight(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1)).not.toBeNull();
    r.dispose();
  });

  it("can render a provisional base chunk immediately while authoritative data is still pending", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    const x = CHUNK_SPAN * 12 + 1;
    const z = CHUNK_SPAN * 12 + 1;
    expect(r.sampleHeight(x, z)).toBeNull();
    expect(r.ensureBaseChunk(x, z)).toBe(true);
    expect(r.sampleHeight(x, z)).not.toBeNull();
    expect(r.stats().provisional).toBe(1);

    r.update(x, z);
    await resolveAll();
    r.flush();
    expect(r.stats().provisional).toBe(0);
    expect(r.sampleHeight(x, z)).not.toBeNull();
    r.dispose();
  });

  it("defers LOD-upgrade rebuilds while moving on foot, then replays them once stationary", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    r.update(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1);
    await resolveAll();
    r.flush();

    // Cross one chunk while "moving on foot": several already-active chunks want MORE detail (their
    // ring shrank), which would normally be a synchronous near-ring rebuild (up to 4225 verts). These
    // must be deferred, not admitted into ready/flushed immediately.
    r.update(CHUNK_SPAN * 11 + 1, CHUNK_SPAN * 10 + 1, true);
    await resolveAll(); // only the genuinely new column fetches; deferred upgrades never hit the network
    r.flush();
    const movingStats = r.stats();
    expect(movingStats.deferredLodUpgrades).toBeGreaterThan(0);
    const deferredCount = movingStats.deferredLodUpgrades;

    // Still moving: further update() calls at the same position must not force the deferred upgrades
    // through either.
    r.update(CHUNK_SPAN * 11 + 1, CHUNK_SPAN * 10 + 1, true);
    r.flush();
    expect(r.stats().deferredLodUpgrades).toBe(deferredCount);

    // Player settles: one deferred upgrade is admitted and drained per update()+flush() pair, matching
    // the existing per-frame build budget rather than dumping them all at once.
    r.update(CHUNK_SPAN * 11 + 1, CHUNK_SPAN * 10 + 1, false);
    r.flush(1);
    expect(r.stats().deferredLodUpgrades).toBe(deferredCount - 1);
    r.dispose();
  });

  it("retries failed chunk fetches even when the player remains in the same center chunk", async () => {
    let now = 1_000;
    const nowSpy = vi.spyOn(Date, "now").mockImplementation(() => now);
    const calls = new Map<string, number>();
    vi.stubGlobal("fetch", (url: string) => {
      const m = /\/chunk\/(-?\d+)\/(-?\d+)/.exec(url);
      const cx = Number(m![1]);
      const cz = Number(m![2]);
      const k = `${cx},${cz}`;
      const count = (calls.get(k) ?? 0) + 1;
      calls.set(k, count);
      if (k === "10,10" && count === 1) {
        return Promise.resolve({ ok: false } as Response);
      }
      const data = makeChunk({ cx, cz, revision: count });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
    });

    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    r.update(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1);
    await new Promise((res) => setTimeout(res, 0));
    expect(calls.get("10,10")).toBe(1);
    expect(r.stats().failed).toBe(1);

    r.update(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1);
    expect(calls.get("10,10")).toBe(1);

    now += 2_100;
    r.update(CHUNK_SPAN * 10 + 1, CHUNK_SPAN * 10 + 1);
    await new Promise((res) => setTimeout(res, 0));
    expect(calls.get("10,10")).toBe(2);
    r.dispose();
    nowSpy.mockRestore();
  });
});

describe("createChunkRenderer sampleHeight (walk the sculpted chunk height)", () => {
  // Deterministic fetch: each chunk resolves immediately with the per-chunk override (if any).
  let overrides: Map<string, Partial<ChunkData>>;

  beforeEach(() => {
    overrides = new Map();
    vi.stubGlobal("fetch", (url: string) => {
      const m = /\/chunk\/(-?\d+)\/(-?\d+)/.exec(url);
      const cx = Number(m![1]);
      const cz = Number(m![2]);
      const data = makeChunk({ cx, cz, revision: 1, ...overrides.get(`${cx},${cz}`) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve(data) } as Response);
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // Load the 5x5 ring around a center chunk and build it.
  const loadRing = async (centerCx: number, centerCz: number, r: ReturnType<typeof createChunkRenderer>) => {
    r.update(centerCx * CHUNK_SPAN + 1, centerCz * CHUNK_SPAN + 1);
    await new Promise((res) => setTimeout(res, 0)); // drain fetch -> json -> ready
    r.flush();
  };

  it("returns the sculpted offset at a known grid vertex of a loaded chunk (bilinear-exact)", async () => {
    const offsets = new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(0);
    const xi = 10;
    const zi = 20;
    offsets[zi * CHUNK_VERTEX_COUNT + xi] = 7.5;
    overrides.set("0,0", { sculptOffsets: offsets });

    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    await loadRing(0, 0, r);

    // Grid vertex (xi,zi) maps to local world (xi/64*96, zi/64*96) in chunk (0,0).
    const wx = (xi / CHUNK_SEGMENTS) * CHUNK_SPAN;
    const wz = (zi / CHUNK_SEGMENTS) * CHUNK_SPAN;
    expect(r.sampleHeight(wx, wz)).toBeCloseTo(largeWorldBaseHeight(wx, wz) + 7.5, 5);
    // A neighbouring grid vertex (still 0) stays 0 — confirms it's not a blanket constant.
    const wx2 = ((xi + 1) / CHUNK_SEGMENTS) * CHUNK_SPAN;
    expect(r.sampleHeight(wx2, wz)).toBeCloseTo(largeWorldBaseHeight(wx2, wz), 5);
    r.dispose();
  });

  it("returns null for an unloaded chunk", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    await loadRing(0, 0, r);
    // Chunk (50,50) is far outside the 5x5 ring around (0,0) -> not active.
    expect(r.sampleHeight(50 * CHUNK_SPAN + 1, 50 * CHUNK_SPAN + 1)).toBeNull();
    r.dispose();
  });

  it("returns natural base height for an empty-offsets loaded chunk", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    await loadRing(0, 0, r); // default makeChunk has sculptOffsets: []
    expect(r.sampleHeight(CHUNK_SPAN * 0.5, CHUNK_SPAN * 0.5)).toBeCloseTo(
      largeWorldBaseHeight(CHUNK_SPAN * 0.5, CHUNK_SPAN * 0.5),
      5,
    );
    r.dispose();
  });

  it("applies local paint immediately for optimistic chunked brush feedback", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    await loadRing(0, 0, r);
    const x = CHUNK_SPAN * 0.5;
    const z = CHUNK_SPAN * 0.5;
    expect(r.samplePaint(x, z)).toBeNull();
    r.applyLocalPaint("stone", x, z, 8);
    expect(r.samplePaint(x, z)).toBe("stone");
    r.dispose();
  });

  it("keeps prior local paint when a later chunk reload only contains the new stroke", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    await loadRing(0, 0, r);
    const gravelX = CHUNK_SPAN * 0.25;
    const gravelZ = CHUNK_SPAN * 0.25;
    const dirtX = CHUNK_SPAN * 0.72;
    const dirtZ = CHUNK_SPAN * 0.72;
    r.applyLocalPaint("gravel", gravelX, gravelZ, 6);
    expect(r.samplePaint(gravelX, gravelZ)).toBe("gravel");

    const dirtPaint = new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(0);
    const dirtXi = Math.round((dirtX / CHUNK_SPAN) * CHUNK_SEGMENTS);
    const dirtZi = Math.round((dirtZ / CHUNK_SPAN) * CHUNK_SEGMENTS);
    dirtPaint[dirtZi * CHUNK_VERTEX_COUNT + dirtXi] = terrainPaintCode("dirt");
    overrides.set("0,0", { revision: 2, paint: dirtPaint });
    r.reloadChunk(0, 0);
    r.flush();
    await new Promise((res) => setTimeout(res, 0));
    r.flush();

    expect(r.samplePaint(gravelX, gravelZ)).toBe("gravel");
    expect(r.samplePaint(dirtX, dirtZ)).toBe("dirt");
    r.dispose();
  });

  it("keeps already-loaded paint when a new local stroke reloads as a partial server grid", async () => {
    const gravelPaint = new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(0);
    const gravelX = CHUNK_SPAN * 0.25;
    const gravelZ = CHUNK_SPAN * 0.25;
    const gravelXi = Math.round((gravelX / CHUNK_SPAN) * CHUNK_SEGMENTS);
    const gravelZi = Math.round((gravelZ / CHUNK_SPAN) * CHUNK_SEGMENTS);
    gravelPaint[gravelZi * CHUNK_VERTEX_COUNT + gravelXi] = terrainPaintCode("gravel");
    overrides.set("0,0", { revision: 1, paint: gravelPaint });

    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    await loadRing(0, 0, r);
    expect(r.samplePaint(gravelX, gravelZ)).toBe("gravel");

    const dirtX = CHUNK_SPAN * 0.72;
    const dirtZ = CHUNK_SPAN * 0.72;
    r.applyLocalPaint("dirt", dirtX, dirtZ, 6);
    const dirtPaint = new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(0);
    const dirtXi = Math.round((dirtX / CHUNK_SPAN) * CHUNK_SEGMENTS);
    const dirtZi = Math.round((dirtZ / CHUNK_SPAN) * CHUNK_SEGMENTS);
    dirtPaint[dirtZi * CHUNK_VERTEX_COUNT + dirtXi] = terrainPaintCode("dirt");
    overrides.set("0,0", { revision: 2, paint: dirtPaint });
    r.reloadChunk(0, 0);
    r.flush();
    await new Promise((res) => setTimeout(res, 0));
    r.flush();

    expect(r.samplePaint(gravelX, gravelZ)).toBe("gravel");
    expect(r.samplePaint(dirtX, dirtZ)).toBe("dirt");
    r.dispose();
  });

  it("does not let a later snow reload zero out older gravel while preserving dirt", async () => {
    const scene = new THREE.Scene();
    const r = createChunkRenderer(scene);
    await loadRing(0, 0, r);
    const gravelX = CHUNK_SPAN * 0.22;
    const gravelZ = CHUNK_SPAN * 0.22;
    const dirtX = CHUNK_SPAN * 0.48;
    const dirtZ = CHUNK_SPAN * 0.48;
    const snowX = CHUNK_SPAN * 0.74;
    const snowZ = CHUNK_SPAN * 0.74;
    r.applyLocalPaint("gravel", gravelX, gravelZ, 4);
    r.applyLocalPaint("dirt", dirtX, dirtZ, 4);
    expect(r.samplePaint(gravelX, gravelZ)).toBe("gravel");
    expect(r.samplePaint(dirtX, dirtZ)).toBe("dirt");

    const snowPaint = new Array(CHUNK_VERTEX_COUNT * CHUNK_VERTEX_COUNT).fill(0);
    const snowXi = Math.round((snowX / CHUNK_SPAN) * CHUNK_SEGMENTS);
    const snowZi = Math.round((snowZ / CHUNK_SPAN) * CHUNK_SEGMENTS);
    snowPaint[snowZi * CHUNK_VERTEX_COUNT + snowXi] = terrainPaintCode("snow");
    overrides.set("0,0", { revision: 2, paint: snowPaint });
    r.reloadChunk(0, 0);
    r.flush();
    await new Promise((res) => setTimeout(res, 0));
    r.flush();

    expect(r.samplePaint(gravelX, gravelZ)).toBe("gravel");
    expect(r.samplePaint(dirtX, dirtZ)).toBe("dirt");
    expect(r.samplePaint(snowX, snowZ)).toBe("snow");
    r.dispose();
  });
});
