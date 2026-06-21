import * as THREE from "three";
import type { GeneratedKind } from "./tellus-types";
import {
  treeTemplateFromSpecies,
  type TreeTemplateOptions,
} from "./tellus-tree-gen";

// ── Procedural archetype library ──────────────────────────────────────────────────────────────────
// The single source of every procedurally generated species in Tellus: the ambient vegetation system
// stamps these templates into its merged chunk/sector buffers, and the SAME archetypes are placeable
// as world objects via `procedural://<id>?seed=N` model URLs (built standalone by
// buildProceduralObject and flowing through the normal GeneratedThing pipeline — sync, clone, throw,
// delete all work because they're just things with a funny modelUrl).
//
// A Template is a small baked vertex soup (pos/normal/color/tintable/sway/index), unit-ish height,
// stamped with yaw + uniform scale + tint. Deterministic everywhere (mulberry32 seeds).

export interface Template {
  pos: Float32Array; // xyz
  nrm: Float32Array;
  col: Float32Array; // rgb
  tintable: Uint8Array; // 1 = multiply by the stamp tint, 0 = keep baked color
  sway: Float32Array; // per-vertex sway weight 0..1
  idx: Uint32Array;
}

export const mulberry32 = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

export const cellSeed = (cx: number, cz: number, salt: number) =>
  (Math.imul(cx + 512, 73856093) ^ Math.imul(cz + 512, 19349663) ^ salt) >>> 0;

// ── Baking ────────────────────────────────────────────────────────────────────────────────────────

interface TemplatePart {
  geom: THREE.BufferGeometry;
  matrix: THREE.Matrix4;
  color: THREE.Color;
  tintable: boolean;
  /** sway weight ramps 0→1 from this (post-matrix) height to the template top */
  swayFrom?: number;
}

export const buildTemplateFromParts = (parts: TemplatePart[]): Template => {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const tintable: number[] = [];
  const sway: number[] = [];
  const idx: number[] = [];
  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const nm = new THREE.Matrix3();
  let maxY = 0.0001;
  const baked = parts.map((part) => {
    const g = part.geom.index ? part.geom.toNonIndexed() : part.geom;
    const p = g.getAttribute("position");
    for (let i = 0; i < p.count; i++) {
      maxY = Math.max(maxY, v.fromBufferAttribute(p, i).applyMatrix4(part.matrix).y);
    }
    return { part, g };
  });
  for (const { part, g } of baked) {
    const p = g.getAttribute("position");
    const gn = g.getAttribute("normal");
    nm.getNormalMatrix(part.matrix);
    const base = pos.length / 3;
    for (let i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).applyMatrix4(part.matrix);
      n.fromBufferAttribute(gn, i).applyMatrix3(nm).normalize();
      pos.push(v.x, v.y, v.z);
      nrm.push(n.x, n.y, n.z);
      col.push(part.color.r, part.color.g, part.color.b);
      tintable.push(part.tintable ? 1 : 0);
      const from = part.swayFrom ?? 0;
      const w = Math.max(0, (v.y - from) / Math.max(0.0001, maxY - from));
      sway.push(w * w);
      idx.push(base + i);
    }
    if (g !== part.geom) g.dispose();
    part.geom.dispose();
  }
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    col: new Float32Array(col),
    tintable: new Uint8Array(tintable),
    sway: new Float32Array(sway),
    idx: new Uint32Array(idx),
  };
};

const at = (x: number, y: number, z: number) => new THREE.Matrix4().makeTranslation(x, y, z);
const xform = (
  x: number,
  y: number,
  z: number,
  sx: number,
  sy: number,
  sz: number,
  rx = 0,
  rz = 0,
  ry = 0,
) =>
  new THREE.Matrix4().compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(sx, sy, sz),
  );

// ── Hand-built blade templates (grass / flower / fern / reed) ────────────────────────────────────

const bladeTemplate = (
  blades: Array<{ yaw: number; lean: number; height: number; width: number }>,
  rootColor: THREE.Color,
  midColor: THREE.Color,
  tipColor: THREE.Color,
  tipTintable: boolean,
): Template => {
  const pos: number[] = [];
  const col: number[] = [];
  const sway: number[] = [];
  const tintable: number[] = [];
  const idx: number[] = [];
  for (const b of blades) {
    const c = Math.cos(b.yaw);
    const s = Math.sin(b.yaw);
    const base = pos.length / 3;
    const verts: Array<[number, number, THREE.Color, number, boolean]> = [
      [-b.width, 0, rootColor, 0, false],
      [b.width, 0, rootColor, 0, false],
      [-b.width * 0.6, 0.55 * b.height, midColor, 0.32, tipTintable],
      [b.width * 0.6, 0.55 * b.height, midColor, 0.32, tipTintable],
      [0, b.height, tipColor, 1, tipTintable],
    ];
    for (const [x, y, color, w, tint] of verts) {
      const bend = b.lean * (y / Math.max(0.0001, b.height)) ** 2 * b.height;
      pos.push(x * c + bend * s, y, -x * s + bend * c);
      col.push(color.r, color.g, color.b);
      sway.push(w * w);
      tintable.push(tint ? 1 : 0);
    }
    idx.push(base, base + 1, base + 3, base, base + 3, base + 2, base + 2, base + 3, base + 4);
  }
  const count = pos.length / 3;
  const nrm = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) nrm[i * 3 + 1] = 1; // up-normals: blades lit like the ground
  return {
    pos: new Float32Array(pos),
    nrm,
    col: new Float32Array(col),
    tintable: new Uint8Array(tintable),
    sway: new Float32Array(sway),
    idx: new Uint32Array(idx),
  };
};

export const buildGrassTemplate = (): Template =>
  bladeTemplate(
    [
      { yaw: 0, lean: 0.16, height: 1, width: 0.085 },
      { yaw: Math.PI / 3, lean: 0.2, height: 0.92, width: 0.085 },
      { yaw: (2 * Math.PI) / 3, lean: 0.13, height: 1.05, width: 0.085 },
    ],
    new THREE.Color(0x2c4a1c),
    new THREE.Color(0x558030),
    new THREE.Color(0xffffff),
    true,
  );

export const buildHairGrassTemplate = (): Template =>
  bladeTemplate(
    Array.from({ length: 14 }, (_, i) => {
      const ring = i % 7;
      const side = i % 2 === 0 ? 1 : -1;
      return {
        yaw: (i * 2.399963229728653) % (Math.PI * 2),
        lean: side * (0.07 + ring * 0.018),
        height: 0.42 + ring * 0.055 + (i % 3) * 0.018,
        width: 0.014 + (i % 4) * 0.003,
      };
    }),
    new THREE.Color(0x243916),
    new THREE.Color(0x5f8933),
    new THREE.Color(0xc6e884),
    true,
  );

export const buildFernTemplate = (): Template =>
  bladeTemplate(
    Array.from({ length: 6 }, (_, i) => ({
      yaw: (i / 6) * Math.PI * 2,
      lean: 0.55,
      height: 0.55 + (i % 2) * 0.12,
      width: 0.12,
    })),
    new THREE.Color(0x1e3d14),
    new THREE.Color(0x2f6b22),
    new THREE.Color(0x4d9436),
    true,
  );

export const buildReedTemplate = (): Template => {
  const t = bladeTemplate(
    [
      { yaw: 0.3, lean: 0.07, height: 1, width: 0.03 },
      { yaw: 1.7, lean: -0.06, height: 0.85, width: 0.03 },
      { yaw: 3.4, lean: 0.05, height: 0.72, width: 0.03 },
      { yaw: 4.9, lean: -0.04, height: 0.9, width: 0.03 },
    ],
    new THREE.Color(0x3f5a26),
    new THREE.Color(0x5d7c33),
    new THREE.Color(0x8aa14e),
    false,
  );
  // cattail head atop the tallest stem
  const head = buildTemplateFromParts([
    {
      geom: new THREE.CylinderGeometry(0.035, 0.035, 0.16, 5),
      matrix: at(0.07 * Math.sin(0.3), 0.99, 0.07 * Math.cos(0.3)),
      color: new THREE.Color(0x6b4a2b),
      tintable: false,
      swayFrom: 0.5,
    },
  ]);
  return mergeTemplates(t, head);
};

export const buildFlowerTemplate = (): Template => {
  const pos: number[] = [];
  const col: number[] = [];
  const sway: number[] = [];
  const tintable: number[] = [];
  const idx: number[] = [];
  const stem = new THREE.Color(0x3d6526);
  {
    const base = pos.length / 3;
    pos.push(-0.03, 0, 0, 0.03, 0, 0, 0.022, 0.66, 0, -0.022, 0.66, 0);
    for (let i = 0; i < 4; i++) {
      col.push(stem.r, stem.g, stem.b);
      tintable.push(0);
    }
    sway.push(0, 0, 0.36, 0.36);
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }
  const headQuad = (yaw: number) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const base = pos.length / 3;
    for (const [x, y] of [
      [-0.13, -0.13],
      [0.13, -0.13],
      [0.13, 0.13],
      [-0.13, 0.13],
    ]) {
      pos.push(x * c, 0.74 + y, -x * s);
      col.push(1, 1, 1);
      tintable.push(1);
      sway.push(1);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  headQuad(0);
  headQuad(Math.PI / 2);
  const count = pos.length / 3;
  const nrm = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) nrm[i * 3 + 1] = 1;
  return {
    pos: new Float32Array(pos),
    nrm,
    col: new Float32Array(col),
    tintable: new Uint8Array(tintable),
    sway: new Float32Array(sway),
    idx: new Uint32Array(idx),
  };
};

export const buildFlowerPatchTemplate = (): Template => {
  const pos: number[] = [];
  const nrm: number[] = [];
  const col: number[] = [];
  const tintable: number[] = [];
  const sway: number[] = [];
  const idx: number[] = [];
  const addPetal = (yaw: number, length: number, width: number) => {
    const c = Math.cos(yaw);
    const s = Math.sin(yaw);
    const base = pos.length / 3;
    const verts: Array<[number, number, boolean]> = [
      [-width, length * 0.18, true],
      [width, length * 0.18, true],
      [width * 0.42, length, true],
      [-width * 0.42, length, true],
    ];
    for (const [x, z, tint] of verts) {
      pos.push(x * c + z * s, 0, -x * s + z * c);
      nrm.push(0, 1, 0);
      col.push(1, 1, 1);
      tintable.push(tint ? 1 : 0);
      sway.push(0.08);
    }
    idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < 5; i++) addPetal((i / 5) * Math.PI * 2, 0.16, 0.048);
  const centerBase = pos.length / 3;
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    pos.push(Math.cos(a) * 0.035, 0.002, Math.sin(a) * 0.035);
    nrm.push(0, 1, 0);
    col.push(0.92, 0.72, 0.26);
    tintable.push(0);
    sway.push(0.04);
  }
  idx.push(centerBase, centerBase + 1, centerBase + 2, centerBase, centerBase + 2, centerBase + 3, centerBase, centerBase + 3, centerBase + 4, centerBase, centerBase + 4, centerBase + 5);
  return {
    pos: new Float32Array(pos),
    nrm: new Float32Array(nrm),
    col: new Float32Array(col),
    tintable: new Uint8Array(tintable),
    sway: new Float32Array(sway),
    idx: new Uint32Array(idx),
  };
};

const mergeTemplates = (a: Template, b: Template): Template => {
  const offset = a.pos.length / 3;
  const idx = new Uint32Array(a.idx.length + b.idx.length);
  idx.set(a.idx);
  for (let i = 0; i < b.idx.length; i++) idx[a.idx.length + i] = b.idx[i] + offset;
  const cat = (x: Float32Array, y: Float32Array) => {
    const out = new Float32Array(x.length + y.length);
    out.set(x);
    out.set(y, x.length);
    return out;
  };
  const tintable = new Uint8Array(a.tintable.length + b.tintable.length);
  tintable.set(a.tintable);
  tintable.set(b.tintable, a.tintable.length);
  return {
    pos: cat(a.pos, b.pos),
    nrm: cat(a.nrm, b.nrm),
    col: cat(a.col, b.col),
    tintable,
    sway: cat(a.sway, b.sway),
    idx,
  };
};

// ── Solid templates (rocks / trees / shrooms / crystals) ─────────────────────────────────────────

export const buildRockTemplate = (seed = 47291, squash = 0.7): Template => {
  // detail-1 icosphere + gentle radial jitter + smooth vertex normals = a rounded stone, not a d20.
  const geom = new THREE.IcosahedronGeometry(1, 1);
  const rng = mulberry32(seed);
  const p = geom.getAttribute("position");
  const v = new THREE.Vector3();
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i).multiplyScalar(0.92 + rng() * 0.16);
    p.setXYZ(i, v.x, v.y * squash, v.z);
  }
  geom.computeVertexNormals();
  return buildTemplateFromParts([
    { geom, matrix: new THREE.Matrix4(), color: new THREE.Color(0xffffff), tintable: true },
  ]);
};

export const buildBoulderTemplate = (seed = 90210): Template => buildRockTemplate(seed, 0.9);

// ── Weber & Penn trees (real species) ─────────────────────────────────────────────────────────────
// The template trees are now generated by the vendored Weber & Penn procedural generator
// (src/vendor/proc-tree) and baked into Tellus's flat vertex-soup via treeTemplateFromSpecies.
//
// Two budget tiers:
//   • AMBIENT_BUDGET — low-poly (capped branch depth + leaf count), baked once per archetype at a
//     fixed seed. Hundreds of these stream into the ambient vegetation buffers each chunk, so vertex
//     count must stay small.
//   • scatterBudget() — higher fidelity for individually placed objects (procedural://… URLs), built
//     per seed so each placed tree varies.
//
// Species map (task spec):
//   conifer → douglasFir | smallPine,  broadleaf → blackOak,  pine → balsamFir,
//   birch → silverBirch,  palm → palm,  deadtree → blackOak with leaves stripped (bare branches).

const AMBIENT_BUDGET: TreeTemplateOptions = {
  radialSegments: 3, // triangular-prism tubes — cheapest closed tube
  branchSamples: 1, // one quad-ring per Bezier segment
  branchCaps: false,
  maxBranchDepth: 2, // trunk + main + secondary branches so the canopy has places to hang leaves
  maxStems: 36, // ambient field streams HUNDREDS of these — keep per-tree cost modest for laptop FPS
  maxLeaves: 180, // fuller canopy again after the debugging cap made trees read as bare/wintery
};

const scatterBudget = (extra?: Partial<TreeTemplateOptions>): TreeTemplateOptions => ({
  radialSegments: 5,
  branchSamples: 2,
  branchCaps: false,
  maxBranchDepth: 3, // deeper twigs → more leaf attachment points → a fuller crown
  maxStems: 520,
  maxLeaves: 3600, // dense canopy for hero/placed trees; keeps procedural trees from looking bare
  ...extra,
});

// Fixed seeds so the baked-once ambient archetypes are deterministic across sessions.
const AMBIENT_SEED = {
  conifer: 0x1111,
  broadleaf: 0x2222,
  pine: 0x3333,
  birch: 0x4444,
  palm: 0x5555,
  deadtree: 0x6666,
} as const;

const CONIFER_COLORS = { barkColor: 0x5d4327, leafColor: 0x2f6b33 };
const BROADLEAF_COLORS = { barkColor: 0x6c4f33, leafColor: 0x4a8c38 };
const PINE_COLORS = { barkColor: 0x5d4329, leafColor: 0x274f2a };
const BIRCH_COLORS = { barkColor: 0xe8e6da, leafColor: 0x86b14e };
const PALM_COLORS = { barkColor: 0x8a6a44, leafColor: 0x3f8f44 };
const DEAD_COLORS = { barkColor: 0x6e6257, leafColor: 0x6e6257 };
const MAPLE_COLORS = { barkColor: 0x745033, leafColor: 0xad5143 };
const APPLE_COLORS = { barkColor: 0x6b4a2f, leafColor: 0x6f9d45 };
const BAMBOO_COLORS = { barkColor: 0x759747, leafColor: 0x62a83f };
const TUPELO_COLORS = { barkColor: 0x65503d, leafColor: 0xa34835 };
const OAK_COLORS = { barkColor: 0x6a4a2e, leafColor: 0x4f7f35 };
const LARCH_COLORS = { barkColor: 0x664629, leafColor: 0xb0a23a };
const CHERRY_COLORS = { barkColor: 0x77503e, leafColor: 0xf1aac3 };
const POPLAR_COLORS = { barkColor: 0x6e5a3d, leafColor: 0x7ca84c };
const ASPEN_COLORS = { barkColor: 0xdcd9c6, leafColor: 0xd3bb41 };
const SASSAFRAS_COLORS = { barkColor: 0x6b4f34, leafColor: 0xd18a37 };
const TOPIARY_COLORS = { barkColor: 0x62452c, leafColor: 0x4b8c3f };
const WILLOW_COLORS = { barkColor: 0x73543a, leafColor: 0x8bbd58 };

export const buildConiferTemplate = (): Template =>
  treeTemplateFromSpecies("douglasFir", AMBIENT_SEED.conifer, {
    ...AMBIENT_BUDGET,
    ...CONIFER_COLORS,
    leafScaleMultiplier: 1.8,
    swayFrom: 0.2,
  });

export const buildBroadleafTemplate = (): Template =>
  treeTemplateFromSpecies("blackOak", AMBIENT_SEED.broadleaf, {
    ...AMBIENT_BUDGET,
    ...BROADLEAF_COLORS,
    leafScaleMultiplier: 1.35,
    swayFrom: 0.3,
  });

export const buildPineTemplate = (): Template =>
  treeTemplateFromSpecies("balsamFir", AMBIENT_SEED.pine, {
    ...AMBIENT_BUDGET,
    ...PINE_COLORS,
    leafScaleMultiplier: 2.1,
    swayFrom: 0.4,
  });

export const buildBirchTemplate = (): Template =>
  treeTemplateFromSpecies("silverBirch", AMBIENT_SEED.birch, {
    ...AMBIENT_BUDGET,
    ...BIRCH_COLORS,
    leafScaleMultiplier: 3.0,
    swayFrom: 0.42,
  });

export const buildPalmTemplate = (): Template =>
  treeTemplateFromSpecies("palm", AMBIENT_SEED.palm, {
    ...AMBIENT_BUDGET,
    maxBranchDepth: 1,
    maxLeaves: 48, // fan fronds — big cards, keep count low
    ...PALM_COLORS,
    swayFrom: 0.55,
  });

export const buildDeadTreeTemplate = (): Template =>
  treeTemplateFromSpecies("blackOak", AMBIENT_SEED.deadtree, {
    ...AMBIENT_BUDGET,
    maxBranchDepth: 2, // a little extra branch structure since there's no canopy
    maxStems: 40,
    maxLeaves: 0, // bare branches — no canopy
    ...DEAD_COLORS,
    leafTintable: false,
    swayFrom: 0.4,
  });

export const buildBushTemplate = (): Template =>
  buildTemplateFromParts([
    { geom: new THREE.IcosahedronGeometry(0.46, 0), matrix: xform(0, 0.34, 0, 1, 0.78, 1), color: new THREE.Color(0x3c7a30), tintable: true, swayFrom: 0.12 },
    { geom: new THREE.IcosahedronGeometry(0.34, 0), matrix: xform(0.34, 0.26, 0.12, 1, 0.74, 1), color: new THREE.Color(0x478939), tintable: true, swayFrom: 0.12 },
    { geom: new THREE.IcosahedronGeometry(0.3, 0), matrix: xform(-0.3, 0.24, -0.14, 1, 0.7, 1), color: new THREE.Color(0x356f2b), tintable: true, swayFrom: 0.12 },
  ]);

export const buildMushroomTemplate = (): Template =>
  buildTemplateFromParts([
    { geom: new THREE.CylinderGeometry(0.09, 0.12, 0.42, 6), matrix: at(0, 0.21, 0), color: new THREE.Color(0xe3d9c2), tintable: false },
    { geom: new THREE.IcosahedronGeometry(0.34, 1), matrix: xform(0, 0.48, 0, 1, 0.55, 1), color: new THREE.Color(0xb8452e), tintable: true },
  ]);

export const buildCrystalTemplate = (seed = 777): Template => {
  const rng = mulberry32(seed);
  const parts: TemplatePart[] = [];
  const shards = 4 + Math.floor(rng() * 2);
  for (let i = 0; i < shards; i++) {
    const yaw = rng() * Math.PI * 2;
    const lean = (rng() - 0.5) * 0.7;
    const h = 0.45 + rng() * 0.55;
    const r = 0.07 + rng() * 0.07;
    parts.push({
      geom: new THREE.OctahedronGeometry(1, 0),
      matrix: xform(
        (rng() - 0.5) * 0.34,
        h * 0.42,
        (rng() - 0.5) * 0.34,
        r,
        h * 0.5,
        r,
        lean,
        (rng() - 0.5) * 0.7,
        yaw,
      ),
      color: new THREE.Color(0xbef0ff),
      tintable: true,
    });
  }
  return buildTemplateFromParts(parts);
};

// ── Stamping into shared buffers (used by the ambient vegetation system) ─────────────────────────

export interface StampTarget {
  pos: THREE.BufferAttribute;
  nrm: THREE.BufferAttribute;
  col: THREE.BufferAttribute;
  root: THREE.BufferAttribute; // aVegRoot: (rootX, rootZ, phase, swayWeight)
  index: THREE.BufferAttribute;
}

export interface StampCursor {
  v: number;
  i: number;
}

export const stampTemplate = (
  target: StampTarget,
  cur: StampCursor,
  tpl: Template,
  x: number,
  y: number,
  z: number,
  scale: number,
  yaw: number,
  tint: THREE.Color,
  phase: number,
  swayAmp: number,
): boolean => {
  const count = tpl.pos.length / 3;
  const pa = target.pos.array as Float32Array;
  const ia = target.index.array as Uint32Array;
  if ((cur.v + count) * 3 > pa.length || cur.i + tpl.idx.length > ia.length) return false;
  const c = Math.cos(yaw);
  const s = Math.sin(yaw);
  const na = target.nrm.array as Float32Array;
  const ca = target.col.array as Float32Array;
  const ra = target.root.array as Float32Array;
  for (let i = 0; i < count; i++) {
    const lx = tpl.pos[i * 3] * scale;
    const ly = tpl.pos[i * 3 + 1] * scale;
    const lz = tpl.pos[i * 3 + 2] * scale;
    const o3 = (cur.v + i) * 3;
    pa[o3] = x + lx * c + lz * s;
    pa[o3 + 1] = y + ly;
    pa[o3 + 2] = z - lx * s + lz * c;
    const nx = tpl.nrm[i * 3];
    const nz = tpl.nrm[i * 3 + 2];
    na[o3] = nx * c + nz * s;
    na[o3 + 1] = tpl.nrm[i * 3 + 1];
    na[o3 + 2] = -nx * s + nz * c;
    if (tpl.tintable[i]) {
      ca[o3] = tpl.col[i * 3] * tint.r;
      ca[o3 + 1] = tpl.col[i * 3 + 1] * tint.g;
      ca[o3 + 2] = tpl.col[i * 3 + 2] * tint.b;
    } else {
      ca[o3] = tpl.col[i * 3];
      ca[o3 + 1] = tpl.col[i * 3 + 1];
      ca[o3 + 2] = tpl.col[i * 3 + 2];
    }
    const o4 = (cur.v + i) * 4;
    ra[o4] = x;
    ra[o4 + 1] = z;
    ra[o4 + 2] = phase;
    ra[o4 + 3] = tpl.sway[i] * swayAmp;
  }
  for (let i = 0; i < tpl.idx.length; i++) ia[cur.i + i] = tpl.idx[i] + cur.v;
  cur.v += count;
  cur.i += tpl.idx.length;
  return true;
};

// ── Placeable procedural assets ───────────────────────────────────────────────────────────────────

export interface ProceduralArchetype {
  id: string;
  label: string;
  emoji: string;
  /** GeneratedKind the placed thing reports (drives target height + interactions). */
  kind: GeneratedKind;
  /** Build a fresh template, optionally seed-varied (crystals/rocks rebuild per seed). */
  build: (seed: number) => Template;
  /** Tint palette sampled by seed. */
  palette: number[];
  doubleSide?: boolean;
}

const proceduralTree = (
  id: string,
  label: string,
  species: string,
  colors: Pick<TreeTemplateOptions, "barkColor" | "leafColor">,
  palette: number[],
  extra?: Partial<TreeTemplateOptions>,
): ProceduralArchetype => ({
  id,
  label,
  emoji: "🌳",
  kind: "tree",
  build: (seed) => treeTemplateFromSpecies(species, seed, scatterBudget({ ...colors, swayFrom: 0.34, ...extra })),
  palette,
});

export const PROCEDURAL_CATALOG: ProceduralArchetype[] = [
  { id: "conifer", label: "Conifer tree", emoji: "🌲", kind: "tree", build: (seed) => treeTemplateFromSpecies("douglasFir", seed, scatterBudget({ ...CONIFER_COLORS, leafScaleMultiplier: 1.9, swayFrom: 0.2 })), palette: [0xffffff, 0xeaffe0, 0xd8f0c8, 0xfff2cf] },
  { id: "broadleaf", label: "Broadleaf tree", emoji: "🌳", kind: "tree", build: (seed) => treeTemplateFromSpecies("blackOak", seed, scatterBudget({ ...BROADLEAF_COLORS, leafScaleMultiplier: 1.45, swayFrom: 0.3 })), palette: [0xffffff, 0xf2ffd9, 0xdfffcb, 0xffe9b8] },
  { id: "pine", label: "Tall pine", emoji: "🌲", kind: "tree", build: (seed) => treeTemplateFromSpecies("balsamFir", seed, scatterBudget({ ...PINE_COLORS, leafScaleMultiplier: 2.25, swayFrom: 0.4 })), palette: [0xffffff, 0xe2f2dc, 0xcfe8d2] },
  { id: "birch", label: "Birch", emoji: "🌳", kind: "tree", build: (seed) => treeTemplateFromSpecies("silverBirch", seed, scatterBudget({ ...BIRCH_COLORS, leafScaleMultiplier: 3.2, swayFrom: 0.42 })), palette: [0xffffff, 0xf4ffd8, 0xffeec2] },
  { id: "palm", label: "Palm", emoji: "🌴", kind: "tree", build: (seed) => treeTemplateFromSpecies("palm", seed, scatterBudget({ maxBranchDepth: 1, maxLeaves: 280, ...PALM_COLORS, swayFrom: 0.55 })), palette: [0xffffff, 0xeaffd4, 0xd9f7c0] },
  { id: "deadtree", label: "Dead tree", emoji: "🪾", kind: "tree", build: (seed) => treeTemplateFromSpecies("blackOak", seed, scatterBudget({ maxLeaves: 0, ...DEAD_COLORS, leafTintable: false, swayFrom: 0.4 })), palette: [0xffffff, 0xe8e0d4, 0xd9cfc4] },
  proceduralTree("acer", "Japanese maple", "acer", MAPLE_COLORS, [0xffffff, 0xffd5c4, 0xffc0aa, 0xf2e6a7], { maxLeaves: 4200, swayFrom: 0.28 }),
  proceduralTree("apple", "Apple tree", "apple", APPLE_COLORS, [0xffffff, 0xf2ffd6, 0xffd6e1, 0xfff0c4], { maxLeaves: 4200, leafScaleMultiplier: 2.0, blossomScaleMultiplier: 2.2, swayFrom: 0.28 }),
  proceduralTree("bamboo", "Bamboo grove", "bamboo", BAMBOO_COLORS, [0xffffff, 0xe7ffd2, 0xd7f6ae], { maxBranchDepth: 2, maxLeaves: 1200, maxStems: 220, swayFrom: 0.18 }),
  proceduralTree("blacktupelo", "Black tupelo", "blackTupelo", TUPELO_COLORS, [0xffffff, 0xffd3b4, 0xffb09a, 0xf2e8ac], { maxBranchDepth: 4, maxLeaves: 4200, leafScaleMultiplier: 2.2, swayFrom: 0.36 }),
  proceduralTree("cambridgeoak", "English oak", "cambridgeOak", OAK_COLORS, [0xffffff, 0xe8ffd1, 0xd9ebb8, 0xffe7b5], { maxBranchDepth: 4, maxLeaves: 4200, leafScaleMultiplier: 1.9, swayFrom: 0.34 }),
  proceduralTree("douglasfir", "Douglas fir", "douglasFir", CONIFER_COLORS, [0xffffff, 0xeaffe0, 0xd8f0c8], { maxLeaves: 4200, leafScaleMultiplier: 1.9, swayFrom: 0.22 }),
  proceduralTree("europeanlarch", "European larch", "europeanLarch", LARCH_COLORS, [0xffffff, 0xfff5bc, 0xeee8a4, 0xe3ffd0], { maxLeaves: 4200, leafScaleMultiplier: 2.6, swayFrom: 0.26 }),
  proceduralTree("fanpalm", "Fan palm", "fanPalm", PALM_COLORS, [0xffffff, 0xeaffd4, 0xd9f7c0], { maxBranchDepth: 2, maxLeaves: 320, leafScaleMultiplier: 1.2, swayFrom: 0.55 }),
  proceduralTree("hillcherry", "Hill cherry", "hillCherry", CHERRY_COLORS, [0xffffff, 0xffc9db, 0xffdde8, 0xffefc4], { maxLeaves: 4200, leafScaleMultiplier: 2.0, blossomScaleMultiplier: 2.2, swayFrom: 0.28 }),
  proceduralTree("lombardypoplar", "Lombardy poplar", "lombardyPoplar", POPLAR_COLORS, [0xffffff, 0xf3ffd3, 0xdaf0b4], { maxLeaves: 3200, swayFrom: 0.32 }),
  proceduralTree("quakingaspen", "Quaking aspen", "quakingAspen", ASPEN_COLORS, [0xffffff, 0xfff1ad, 0xf3ffd0], { maxLeaves: 4200, leafScaleMultiplier: 2.9, swayFrom: 0.32 }),
  proceduralTree("sassafras", "Sassafras", "sassafras", SASSAFRAS_COLORS, [0xffffff, 0xffd0a1, 0xffefb4, 0xe6ffd0], { maxBranchDepth: 4, maxLeaves: 4200, leafScaleMultiplier: 2.2, swayFrom: 0.34 }),
  proceduralTree("smallpine", "Small pine", "smallPine", PINE_COLORS, [0xffffff, 0xe2f2dc, 0xcfe8d2], { maxBranchDepth: 2, maxLeaves: 2400, leafScaleMultiplier: 2.35, swayFrom: 0.38 }),
  proceduralTree("spheretree", "Sphere topiary", "sphereTree", TOPIARY_COLORS, [0xffffff, 0xe4ffd0, 0xd0f0b8], { maxLeaves: 4200, leafScaleMultiplier: 1.6, swayFrom: 0.3 }),
  proceduralTree("weepingwillow", "Weeping willow", "weepingWillow", WILLOW_COLORS, [0xffffff, 0xf0ffd0, 0xdcefae], { maxBranchDepth: 4, maxLeaves: 4200, leafScaleMultiplier: 2.4, swayFrom: 0.28 }),
  { id: "bush", label: "Bush", emoji: "🌿", kind: "object", build: () => buildBushTemplate(), palette: [0xffffff, 0xe9ffd9, 0xd2f2bc, 0xffe3b3] },
  { id: "fern", label: "Fern", emoji: "🌿", kind: "object", build: () => buildFernTemplate(), palette: [0xffffff, 0xddf6cc, 0xc6ecb5], doubleSide: true },
  { id: "reed", label: "Reeds", emoji: "🎋", kind: "object", build: () => buildReedTemplate(), palette: [0xffffff, 0xf0f6d8], doubleSide: true },
  { id: "mushroom", label: "Mushroom", emoji: "🍄", kind: "object", build: () => buildMushroomTemplate(), palette: [0xffffff, 0xffd9c9, 0xe8c9ff, 0xfff3c4] },
  { id: "grasstuft", label: "Grass tuft", emoji: "🌱", kind: "object", build: () => buildGrassTemplate(), palette: [0x77ab40, 0x86b148, 0x9a9a52], doubleSide: true },
  { id: "flower", label: "Flower", emoji: "🌸", kind: "flower", build: () => buildFlowerTemplate(), palette: [0xffffff, 0xffd7e8, 0xffe9a8, 0xc9b8ff, 0xffb0a0, 0x9fd8ff], doubleSide: true },
  { id: "rock", label: "Rock", emoji: "🪨", kind: "stone", build: (seed) => buildRockTemplate(47291 ^ seed), palette: [0xffffff, 0xe3e0da, 0xcfd4dc, 0xd8cfc2] },
  { id: "boulder", label: "Boulder", emoji: "🪨", kind: "stone", build: (seed) => buildBoulderTemplate(90210 ^ seed), palette: [0xffffff, 0xdcd9d2, 0xc8cdd6] },
  { id: "crystal", label: "Crystal cluster", emoji: "💎", kind: "object", build: (seed) => buildCrystalTemplate(777 ^ seed), palette: [0xbef0ff, 0xffc9f0, 0xfff3b8, 0xc9ffd6, 0xd6c9ff] },
];

export const proceduralArchetype = (id: string): ProceduralArchetype | undefined =>
  PROCEDURAL_CATALOG.find((a) => a.id === id);

/** Convert a template into a standalone renderable group (vertex-colored Lambert, shadow-casting). */
export const templateToObject = (
  tpl: Template,
  tint: THREE.Color,
  doubleSide: boolean,
): THREE.Group => {
  const geometry = new THREE.BufferGeometry();
  const count = tpl.pos.length / 3;
  geometry.setAttribute("position", new THREE.BufferAttribute(tpl.pos.slice(), 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(tpl.nrm.slice(), 3));
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    const o = i * 3;
    if (tpl.tintable[i]) {
      colors[o] = tpl.col[o] * tint.r;
      colors[o + 1] = tpl.col[o + 1] * tint.g;
      colors[o + 2] = tpl.col[o + 2] * tint.b;
    } else {
      colors[o] = tpl.col[o];
      colors[o + 1] = tpl.col[o + 1];
      colors[o + 2] = tpl.col[o + 2];
    }
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(new THREE.BufferAttribute(tpl.idx.slice(), 1));
  geometry.computeBoundingSphere();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: doubleSide ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.add(mesh);
  return group;
};

/** Build the standalone model for a `procedural://<archetype>?seed=N` URL (null if unknown). */
export const buildProceduralObject = (archetypeId: string, seed: number): THREE.Group | null => {
  const arch = proceduralArchetype(archetypeId);
  if (!arch) return null;
  const rng = mulberry32((seed ^ 0xa5a5) >>> 0);
  const tpl = arch.build(seed);
  const tint = new THREE.Color(arch.palette[Math.floor(rng() * arch.palette.length) % arch.palette.length]);
  tint.offsetHSL((rng() - 0.5) * 0.04, (rng() - 0.5) * 0.08, (rng() - 0.5) * 0.06);
  return templateToObject(tpl, tint, arch.doubleSide ?? false);
};
