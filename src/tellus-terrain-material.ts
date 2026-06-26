import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ktx2Loader } from "./tellus-generation-client";
import {
  abs,
  attribute,
  color,
  float,
  Fn,
  fract,
  mix,
  mx_cell_noise_float,
  mx_fractal_noise_float,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  step,
  varying,
  vec3,
  vertexColor,
} from "three/tsl";

export type TerrainTextureRuntimeMode =
  | "procedural"
  | "biome-lite-textures"
  | "nine-sampler-textures";

export interface TerrainTextureDiagnostics {
  renderer: "webgpu" | "webgl" | "unknown";
  requestedImageTextures: boolean;
  activeMode: TerrainTextureRuntimeMode;
  maxTextureImageUnits: number | null;
  estimatedNineSamplerUnits: number;
  supportsNineSamplerPaint: boolean;
  reason: string;
}

// Paint codes (terrainPaintCode = terrainPaintKinds.indexOf(kind) + 1). Kept in sync with
// terrainPaintKinds in tellus-constants.ts; only the patterned kinds need an explicit code here.
const PAINT_MEADOW = 1;
const PAINT_BEACH = 2;
const PAINT_DIRT = 3;
const PAINT_ROCK = 4;
const PAINT_SNOW = 5;
const PAINT_FLOWERS = 6;
const PAINT_STONE = 7;
const PAINT_BRICK = 8;
const PAINT_GRASS = 9;

// World-space pattern sizes (metres). Brick courses are wider than tall; stone cells are chunky.
const BRICK_W = 1.6;
const BRICK_H = 0.7;
const STONE_SCALE = 0.9;

// Meadow/grass green variation: broad per-area hue/value drift that de-crayolas the flat base green.
// Meadow drifts warm-yellow-green ↔ cool-olive; grass drifts drier toward straw/khaki.
const GREEN_VAR_SCALE = 0.06; // world-space frequency of the drift field
const GREEN_VAR_STRENGTH = 0.14; // ± value swing
const GRASS_DRY_STRENGTH = 0.1; // extra warm/straw lift for the grass paint

/**
 * Brick-course pattern in world XZ. Returns a multiplier (~0.55 mortar groove .. 1.15 face highlight).
 * Alternate rows are offset by half a brick (running bond). No textures — pure ALU on world position.
 */
const brickPattern = Fn(([px, pz]: [ReturnType<typeof float>, ReturnType<typeof float>]) => {
  const row = pz.div(BRICK_H).floor();
  const offset = row.mod(2).mul(BRICK_W * 0.5); // running bond: every other row shifts half a brick
  const u = fract(px.add(offset).div(BRICK_W));
  const v = fract(pz.div(BRICK_H));
  // Mortar grooves: dark band near each cell edge. e* = normalised distance from cell centre.
  const eu = abs(u.sub(0.5)).mul(2); // 0 centre -> 1 edge
  const ev = abs(v.sub(0.5)).mul(2);
  const mortar = step(0.86, eu).max(step(0.72, ev)); // 1 in the groove band, else 0
  // Per-brick value variation so the field isn't uniform.
  const brickId = px.add(offset).div(BRICK_W).floor().add(row.mul(7.0));
  const vary = mx_noise_float(vec3(brickId.mul(0.13), row.mul(0.31), float(0))).mul(0.12);
  return mix(float(1).add(vary), float(0.55), mortar);
});

/** Stone pattern: irregular cracked cells via cell noise + faint dark hairline cracks. */
const stonePattern = Fn(([px, pz]: [ReturnType<typeof float>, ReturnType<typeof float>]) => {
  const p = vec3(px.mul(STONE_SCALE), pz.mul(STONE_SCALE), float(0));
  const cell = mx_cell_noise_float(p); // ~[0,1], roughly constant within a cell
  const cracks = mx_fractal_noise_float(p.mul(3.1), 2, 2.0, 0.5); // ~[-1,1] fine fracture
  const crackDark = step(0.62, abs(cracks)).mul(0.28); // dark hairline cracks
  const tone = float(0.82).add(cell.mul(0.32)); // per-cell light/dark variation
  return tone.sub(crackDark);
});

/**
 * Green variation grain for meadow/grass — returns a per-channel RGB multiplier (vec3 ~[0.85,1.12])
 * that drifts hue + value across the surface so the flat base green stops reading as uniform crayola.
 * `dry` (0 meadow, 1 grass) biases the drift toward warm straw/khaki highlights.
 */
const greenVariation = Fn(
  ([px, pz, dry]: [ReturnType<typeof float>, ReturnType<typeof float>, ReturnType<typeof float>]) => {
    const drift = mx_fractal_noise_float(
      vec3(px.mul(GREEN_VAR_SCALE), pz.mul(GREEN_VAR_SCALE), float(0)),
      3,
      2.0,
      0.5,
    ); // ~[-1,1] broad clumps
    const v = drift.mul(GREEN_VAR_STRENGTH); // shared value swing
    const warm = drift.add(dry.mul(GRASS_DRY_STRENGTH)); // grass biases warm/straw
    // Warm side → push R+G (yellow/straw), drop B; cool side → push B (olive), drop R.
    const r = float(1).add(v).add(warm.mul(0.06));
    const g = float(1).add(v).add(abs(warm).mul(0.02));
    const b = float(1).add(v.mul(0.7)).sub(warm.mul(0.07));
    return vec3(r, g, b);
  },
);

// ── Procedural terrain detail ────────────────────────────────────────────────────────────────────
// The terrain mesh carries a flat per-vertex base color (terrainVertexColor). On its own that reads
// as banded/plasticky because there's no sub-vertex surface detail. This material layers cheap,
// fully-procedural detail on TOP of the vertex color — NO texture uploads, NO image assets, so it
// costs effectively nothing in VRAM and a handful of ALU ops per fragment:
//
//   1. Macro + micro fractal noise breaks up the flat color (mottling, like grass/soil grain).
//   2. Slope darkening: steep faces (cliffs, sculpted walls) read darker + grittier.
//   3. Height tint: a faint cool lift up high, warm settle down low — reads as aerial perspective.
//
// Two implementations share the SAME look:
//   • WebGPU → MeshStandardNodeMaterial with a TSL color node (preferred; matches the rest of the app).
//   • WebGL  → MeshStandardMaterial patched via onBeforeCompile (fallback).
//
// Tuning knobs are centralised so both paths stay in lockstep.
const DETAIL = {
  macroScale: 0.11, // world-space frequency of the broad mottling
  microScale: 1.35, // fine grain frequency
  macroStrength: 0.18, // how much the macro noise darkens/lightens (±)
  microStrength: 0.075,
  slopeStrength: 0.35, // max darkening on vertical faces
  heightLift: 0.05, // cool tint added per unit of height above the lift band
  heightStart: 4.0, // height where the cool lift begins
  heightRange: 12.0, // height over which the lift saturates
} as const;

/** WebGPU path: a TSL node graph that tints the vertex color with procedural detail. */
function buildDetailColorNode() {
  const wp = positionWorld;

  // Fractal mottling — two octaves at different scales summed into a roughly [-1,1] signal.
  const macro = mx_fractal_noise_float(wp.mul(DETAIL.macroScale), 3, 2.0, 0.5).mul(
    DETAIL.macroStrength,
  );
  const micro = mx_noise_float(wp.mul(DETAIL.microScale)).mul(DETAIL.microStrength);
  const grain = macro.add(micro);

  // Slope: world-up dotted with the surface normal. 1 = flat, 0 = vertical. Steep → darker.
  const flatness = normalWorld.y.clamp(0, 1);
  const slopeDark = flatness.oneMinus().mul(DETAIL.slopeStrength);

  // Height tint: faint cool lift as terrain rises (aerial perspective).
  const heightT = smoothstep(
    DETAIL.heightStart,
    DETAIL.heightStart + DETAIL.heightRange,
    wp.y,
  );
  const coolTint = color(0x223044).mul(heightT.mul(DETAIL.heightLift));

  // Per-kind procedural pattern from the per-vertex paint code (terrainPaintCode; 0 = auto/biome).
  // step() bands isolate exact codes without branches. brick(8)/stone(7) multiply a structural
  // pattern; meadow(1)/grass(9) get a green/khaki variation grain that de-crayolas the flat green.
  // Exact-match bands: each is 1 ONLY for its code. step(lo) - step(hi) is the [lo,hi) window, so
  // codes don't leak into higher patterns (previously code 9/grass also triggered the brick band).
  // FLAT interpolation: a triangle straddling two paint codes must not interpolate the code (that
  // would sweep through other bands at the seam → a dark brick/stone ring around painted patches).
  const paintCode = float(varying(attribute("tellusPaintCode", "float")).setInterpolation("flat"));
  const band = (code: number) =>
    step(code - 0.5, paintCode).sub(step(code + 0.5, paintCode));
  const isMeadow = band(PAINT_MEADOW);
  const isStone = band(PAINT_STONE);
  const isBrick = band(PAINT_BRICK);
  const isGrass = band(PAINT_GRASS);

  const structPattern = float(1)
    .mul(isBrick.oneMinus().mul(isStone.oneMinus())) // 1 where neither structural pattern applies
    .add(brickPattern(wp.x, wp.z).mul(isBrick))
    .add(stonePattern(wp.x, wp.z).mul(isStone));

  // Apply: base vertex color, grain, slope, structural pattern, then cool-tinted up high.
  const base = vertexColor();
  const litColor = base.mul(grain.add(1).sub(slopeDark)).mul(structPattern);
  let detailed = mix(litColor, litColor.add(coolTint), heightT);

  // Green/khaki variation for meadow + grass (RGB multiplier). dry = 1 for grass, 0 for meadow.
  const greenMask = isMeadow.max(isGrass);
  const greenMul = greenVariation(wp.x, wp.z, isGrass);
  detailed = mix(detailed, detailed.mul(greenMul), greenMask);

  return detailed;
}

/** GLSL injected into MeshStandardMaterial for the WebGL fallback — mirrors buildDetailColorNode(). */
// vTellusPaintCode is FLAT (non-interpolated): otherwise a triangle straddling e.g. grass(9) and
// meadow(1) yields fragments whose interpolated code sweeps through 7/8, lighting the stone/brick
// bands → a dark brick/stone ring around painted patches. flat = one integer code per triangle.
const WEBGL_VARYING =
  "varying vec3 vTellusWorldPos;\nvarying vec3 vTellusWorldNormal;\nflat varying float vTellusPaintCode;";

// Declares the per-vertex paint code attribute (geometries without it default the varying to 0).
const WEBGL_VERTEX_HEAD = "attribute float tellusPaintCode;";

const WEBGL_VERTEX_TAIL = `
  vTellusWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vTellusWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
  vTellusPaintCode = tellusPaintCode;
`;

// Hash-based value noise + 3-octave fractal — cheap, no textures. Matches the macro/micro feel of the
// MaterialX noise on the WebGPU path closely enough that the two renderers look consistent.
const WEBGL_NOISE = `
float tellusHash(vec3 p){
  p = fract(p * 0.3183099 + 0.1);
  p *= 17.0;
  return fract(p.x * p.y * p.z * (p.x + p.y + p.z));
}
float tellusNoise(vec3 x){
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(tellusHash(i + vec3(0,0,0)), tellusHash(i + vec3(1,0,0)), f.x),
        mix(tellusHash(i + vec3(0,1,0)), tellusHash(i + vec3(1,1,0)), f.x), f.y),
    mix(mix(tellusHash(i + vec3(0,0,1)), tellusHash(i + vec3(1,0,1)), f.x),
        mix(tellusHash(i + vec3(0,1,1)), tellusHash(i + vec3(1,1,1)), f.x), f.y),
    f.z) * 2.0 - 1.0;
}
float tellusFractal(vec3 x){
  float a = 0.0, amp = 0.5;
  for(int i=0;i<3;i++){ a += tellusNoise(x) * amp; x *= 2.0; amp *= 0.5; }
  return a;
}
// Mirrors brickPattern()/stonePattern()/greenVariation() in the WebGPU node graph. Sizes/strengths
// match the TSL constants so the two renderers stay visually consistent.
float tellusBrick(float px, float pz){
  float BW = ${BRICK_W.toFixed(3)}, BH = ${BRICK_H.toFixed(3)};
  float row = floor(pz / BH);
  float offset = mod(row, 2.0) * BW * 0.5;
  float u = fract((px + offset) / BW);
  float v = fract(pz / BH);
  float eu = abs(u - 0.5) * 2.0;
  float ev = abs(v - 0.5) * 2.0;
  float mortar = max(step(0.86, eu), step(0.72, ev));
  float brickId = floor((px + offset) / BW) + row * 7.0;
  float vary = tellusNoise(vec3(brickId * 0.13, row * 0.31, 0.0)) * 0.12;
  return mix(1.0 + vary, 0.55, mortar);
}
float tellusStone(float px, float pz){
  float S = ${STONE_SCALE.toFixed(3)};
  vec3 p = vec3(px * S, pz * S, 0.0);
  vec3 cellId = floor(p) + vec3(tellusHash(floor(p)), tellusHash(floor(p) + 3.7), 0.0);
  float cell = tellusHash(floor(cellId));
  float cracks = tellusFractal(p * 3.1);
  float crackDark = step(0.62, abs(cracks)) * 0.28;
  return (0.82 + cell * 0.32) - crackDark;
}
// Green/khaki variation grain (RGB multiplier). dry: 0 meadow, 1 grass (drifts toward straw/khaki).
vec3 tellusGreenVar(float px, float pz, float dry){
  float GS = ${GREEN_VAR_SCALE.toFixed(4)}, GV = ${GREEN_VAR_STRENGTH.toFixed(4)}, GD = ${GRASS_DRY_STRENGTH.toFixed(4)};
  float drift = tellusFractal(vec3(px * GS, pz * GS, 0.0));
  float v = drift * GV;
  float warm = drift + dry * GD;
  float r = 1.0 + v + warm * 0.06;
  float g = 1.0 + v + abs(warm) * 0.02;
  float b = 1.0 + v * 0.7 - warm * 0.07;
  return vec3(r, g, b);
}
`;

function webglColorPatch(): string {
  const d = DETAIL;
  return `
  {
    float macro = tellusFractal(vTellusWorldPos * ${d.macroScale.toFixed(4)}) * ${d.macroStrength.toFixed(4)};
    float micro = tellusNoise(vTellusWorldPos * ${d.microScale.toFixed(4)}) * ${d.microStrength.toFixed(4)};
    float grain = macro + micro;
    float flatness = clamp(vTellusWorldNormal.y, 0.0, 1.0);
    float slopeDark = (1.0 - flatness) * ${d.slopeStrength.toFixed(4)};
    float heightT = smoothstep(${d.heightStart.toFixed(2)}, ${(d.heightStart + d.heightRange).toFixed(2)}, vTellusWorldPos.y);
    vec3 coolTint = vec3(0.133, 0.188, 0.267) * (heightT * ${d.heightLift.toFixed(4)});
    // Exact-match bands (step(lo)-step(hi) = [lo,hi) window) so codes don't leak into higher patterns.
    float isMeadow = step(${(PAINT_MEADOW - 0.5).toFixed(1)}, vTellusPaintCode) - step(${(PAINT_MEADOW + 0.5).toFixed(1)}, vTellusPaintCode);
    float isStone = step(${(PAINT_STONE - 0.5).toFixed(1)}, vTellusPaintCode) - step(${(PAINT_STONE + 0.5).toFixed(1)}, vTellusPaintCode);
    float isBrick = step(${(PAINT_BRICK - 0.5).toFixed(1)}, vTellusPaintCode) - step(${(PAINT_BRICK + 0.5).toFixed(1)}, vTellusPaintCode);
    float isGrass = step(${(PAINT_GRASS - 0.5).toFixed(1)}, vTellusPaintCode) - step(${(PAINT_GRASS + 0.5).toFixed(1)}, vTellusPaintCode);
    float pattern = (1.0 - isBrick) * (1.0 - isStone)
      + tellusBrick(vTellusWorldPos.x, vTellusWorldPos.z) * isBrick
      + tellusStone(vTellusWorldPos.x, vTellusWorldPos.z) * isStone;
    diffuseColor.rgb *= (1.0 + grain - slopeDark) * pattern;
    float greenMask = max(isMeadow, isGrass);
    vec3 greenMul = tellusGreenVar(vTellusWorldPos.x, vTellusWorldPos.z, isGrass);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * greenMul, greenMask);
    diffuseColor.rgb += coolTint * heightT;
  }
  `;
}

export interface TerrainMaterialOptions {
  roughness?: number;
  pbrDetail?: boolean;
  textureRepeat?: number;
  // Optional explicit base albedo/normal/roughness maps. When omitted the base map is the cheap
  // procedural canvas grain (makeTerrainAlbedoTexture/makeTerrainNormalTexture) — no image assets.
  textureUrls?: {
    albedo?: string;
    normal?: string;
    roughness?: string;
  };
}

const terrainTextureLoader = new THREE.TextureLoader();
const generatedTerrainTextures = new Map<string, THREE.Texture>();
const BIOME_LITE_TEXTURE_UNITS = 3; // moss, sand, and gravel albedo samplers; hardscapes are procedural
const ESTIMATED_NINE_SAMPLER_UNITS = 11; // base albedo + normal + 9 paint albedo maps
const BIOME_LITE_TEXTURE_URLS = {
  moss: "/terrain-textures/moss002/albedo.png",
  sand: "/terrain-textures/sand-ground-0024/albedo.jpg",
  rock: "/terrain-textures/gravel041/albedo.png",
} as const;

function terrainImageTexturesRequested(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem("tellus.terrainImageTextures") === "1";
  } catch {
    return false;
  }
}

export function terrainTextureDiagnostics(
  renderer: THREE.WebGLRenderer | unknown,
  useWebGPU: boolean,
): TerrainTextureDiagnostics {
  const requestedImageTextures = terrainImageTexturesRequested();
  if (useWebGPU) {
    return {
      renderer: "webgpu",
      requestedImageTextures,
      activeMode: "procedural",
      maxTextureImageUnits: null,
      estimatedNineSamplerUnits: ESTIMATED_NINE_SAMPLER_UNITS,
      supportsNineSamplerPaint: false,
      reason: requestedImageTextures
        ? "WebGPU terrain image textures are disabled because prior TSL texture-node attempts blanked the world."
        : "Procedural terrain detail is active.",
    };
  }

  const webgl = renderer instanceof THREE.WebGLRenderer ? renderer : null;
  const maxTextureImageUnits =
    webgl?.capabilities?.maxTextures ??
    webgl?.getContext().getParameter(webgl.getContext().MAX_TEXTURE_IMAGE_UNITS) ??
    null;
  const supportsBiomeLitePaint =
    typeof maxTextureImageUnits === "number" &&
    maxTextureImageUnits >= BIOME_LITE_TEXTURE_UNITS;
  const supportsNineSamplerPaint =
    typeof maxTextureImageUnits === "number" &&
    maxTextureImageUnits >= ESTIMATED_NINE_SAMPLER_UNITS;
  const activeMode = requestedImageTextures
    ? supportsBiomeLitePaint
      ? "biome-lite-textures"
      : "procedural"
    : "procedural";
  const reason = !requestedImageTextures
    ? "Procedural terrain detail is active."
    : supportsBiomeLitePaint
      ? "Biome-lite terrain textures are active: moss, sand, and gravel albedos stay below the WebGL sampler cap; brick and cobblestone are procedural."
      : "This WebGL renderer does not report enough fragment texture units for the biome-lite texture path.";

  return {
    renderer: webgl ? "webgl" : "unknown",
    requestedImageTextures,
    activeMode,
    maxTextureImageUnits,
    estimatedNineSamplerUnits: ESTIMATED_NINE_SAMPLER_UNITS,
    supportsNineSamplerPaint,
    reason,
  };
}

export function shouldUseTerrainImageTextures(
  renderer: THREE.WebGLRenderer | unknown,
  useWebGPU: boolean,
): boolean {
  return terrainTextureDiagnostics(renderer, useWebGPU).activeMode !== "procedural";
}

function prepareRepeatTexture(
  texture: THREE.Texture,
  repeat: number,
  colorSpace?: THREE.ColorSpace,
): THREE.Texture {
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat, repeat);
  texture.anisotropy = 4;
  if (colorSpace) texture.colorSpace = colorSpace;
  texture.needsUpdate = true;
  return texture;
}

function seededNoise(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function makeTerrainAlbedoTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const cached = generatedTerrainTextures.get("albedo");
  if (cached) return cached;
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = seededNoise(x * 0.08, y * 0.08);
      const n2 = seededNoise(x * 0.31 + 17, y * 0.31 - 9);
      const n3 = seededNoise(x * 0.73 - 29, y * 0.67 + 31);
      const value = 204 + Math.round(n1 * 18 + n2 * 14 + n3 * 8);
      const greenLift = Math.round(n2 * 6 + n3 * 3);
      const i = (y * size + x) * 4;
      image.data[i] = Math.max(165, Math.min(245, value - 4));
      image.data[i + 1] = Math.max(170, Math.min(255, value + greenLift));
      image.data[i + 2] = Math.max(155, Math.min(240, value - 8));
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  generatedTerrainTextures.set("albedo", texture);
  return texture;
}

function makeTerrainNormalTexture(): THREE.Texture | null {
  if (typeof document === "undefined") return null;
  const cached = generatedTerrainTextures.get("normal");
  if (cached) return cached;
  const size = 256;
  const height = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n1 = seededNoise(x * 0.08, y * 0.08);
      const n2 = seededNoise(x * 0.32 + 41, y * 0.32 + 13);
      const n3 = seededNoise(x * 0.72 - 19, y * 0.68 + 37);
      height[y * size + x] = n1 * 0.36 + n2 * 0.24 + n3 * 0.14;
    }
  }
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  const image = ctx.createImageData(size, size);
  const at = (x: number, y: number) =>
    height[((y + size) % size) * size + ((x + size) % size)] ?? 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = at(x + 1, y) - at(x - 1, y);
      const dy = at(x, y + 1) - at(x, y - 1);
      const nx = -dx * 1.8;
      const ny = -dy * 1.8;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz) || 1;
      const i = (y * size + x) * 4;
      image.data[i] = Math.round((nx / len * 0.5 + 0.5) * 255);
      image.data[i + 1] = Math.round((ny / len * 0.5 + 0.5) * 255);
      image.data[i + 2] = Math.round((nz / len * 0.5 + 0.5) * 255);
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  generatedTerrainTextures.set("normal", texture);
  return texture;
}
async function loadTerrainTexture(url: string, repeat: number, colorSpace?: THREE.ColorSpace): Promise<THREE.Texture> {
  const texture = url.toLowerCase().endsWith(".ktx2")
    ? await ktx2Loader.loadAsync(url)
    : await terrainTextureLoader.loadAsync(url);
  return prepareRepeatTexture(texture, repeat, colorSpace);
}

function whiteTerrainTexture(): THREE.Texture {
  const cached = generatedTerrainTextures.get("white");
  if (cached) return cached;
  const texture = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat);
  texture.needsUpdate = true;
  generatedTerrainTextures.set("white", texture);
  return texture;
}

function applyBiomeLiteTerrainOverlay(
  material: THREE.MeshStandardMaterial,
  options: TerrainMaterialOptions,
): void {
  if (!terrainImageTexturesRequested()) return;
  const repeat = options.textureRepeat ?? 34;
  const textureScale = 0.16;
  const fallback = whiteTerrainTexture();
  const paintTextures: Record<keyof typeof BIOME_LITE_TEXTURE_URLS, THREE.Texture> = {
    moss: fallback,
    sand: fallback,
    rock: fallback,
  };
  const shaders = new Set<Parameters<NonNullable<THREE.MeshStandardMaterial["onBeforeCompile"]>>[0]>();

  const updateShaderUniforms = () => {
    for (const shader of shaders) {
      shader.uniforms.tellusMossAlbedoMap.value = paintTextures.moss;
      shader.uniforms.tellusSandAlbedoMap.value = paintTextures.sand;
      shader.uniforms.tellusRockAlbedoMap.value = paintTextures.rock;
    }
  };

  for (const key of Object.keys(BIOME_LITE_TEXTURE_URLS) as Array<keyof typeof BIOME_LITE_TEXTURE_URLS>) {
    void loadTerrainTexture(BIOME_LITE_TEXTURE_URLS[key], repeat, THREE.SRGBColorSpace)
      .then((texture) => {
        paintTextures[key] = texture;
        updateShaderUniforms();
      })
      .catch((error) => console.warn(`Tellus terrain ${key} texture failed`, error));
  }

  material.onBeforeCompile = (shader) => {
    shaders.add(shader);
    shader.uniforms.tellusBiomeTextureScale = { value: textureScale };
    shader.uniforms.tellusMossAlbedoMap = { value: paintTextures.moss };
    shader.uniforms.tellusSandAlbedoMap = { value: paintTextures.sand };
    shader.uniforms.tellusRockAlbedoMap = { value: paintTextures.rock };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\n${WEBGL_VARYING}\n${WEBGL_VERTEX_HEAD}`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>\n${WEBGL_VERTEX_TAIL}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>
${WEBGL_VARYING}
uniform float tellusBiomeTextureScale;
uniform sampler2D tellusMossAlbedoMap;
uniform sampler2D tellusSandAlbedoMap;
uniform sampler2D tellusRockAlbedoMap;
float tellusPaintBand(float code){
  return step(code - 0.5, vTellusPaintCode) - step(code + 0.5, vTellusPaintCode);
}
float tellusBrickMortar(vec2 f){
  vec2 edge = min(f, 1.0 - f);
  return 1.0 - step(0.075, min(edge.x, edge.y));
}
float tellusHash2(vec2 p){
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
}
vec3 tellusRunningBondBrick(vec2 worldPos){
  vec2 brickUv = vec2(worldPos.x / 1.08, worldPos.y / 0.42);
  brickUv.x += floor(brickUv.y) * 0.5;
  vec2 f = fract(brickUv);
  float mortar = tellusBrickMortar(f);
  float worn = fract(sin(dot(floor(brickUv), vec2(17.13, 41.77))) * 43758.5453);
  vec3 brick = mix(vec3(0.38, 0.08, 0.055), vec3(0.68, 0.18, 0.10), worn);
  return mix(brick, vec3(0.54, 0.48, 0.42), mortar);
}
vec3 tellusStoneSlabs(vec2 worldPos){
  float rowH = 0.72;
  float row = floor(worldPos.y / rowH);
  float rowRand = fract(sin(row * 31.71) * 43758.5453);
  float tileW = mix(0.78, 1.48, rowRand);
  float offset = fract(sin(row * 11.13) * 9173.31) * tileW;
  vec2 slabUv = vec2((worldPos.x + offset) / tileW, worldPos.y / rowH);
  vec2 cell = floor(slabUv);
  vec2 f = fract(slabUv);
  vec2 edge = min(f, 1.0 - f);
  float mortar = 1.0 - step(0.07, min(edge.x, edge.y));
  float chip = fract(sin(dot(cell, vec2(23.17, 31.91))) * 43758.5453);
  vec3 slab = mix(vec3(0.42, 0.43, 0.42), vec3(0.72, 0.74, 0.70), chip);
  return mix(slab, vec3(0.30, 0.31, 0.30), mortar);
}
vec3 tellusRockSurface(vec2 worldPos, vec3 base){
  vec2 cell = floor(worldPos * 0.82);
  vec2 fineCell = floor(worldPos * 3.7);
  float slab = tellusHash2(cell);
  float grain = tellusHash2(fineCell);
  float seam = step(0.86, abs(sin(worldPos.x * 1.7 + slab * 4.0))) *
    step(0.76, abs(sin(worldPos.y * 1.3 + slab * 5.0)));
  vec3 rock = base * mix(0.72, 1.18, slab) * mix(0.92, 1.08, grain);
  return mix(rock, rock * 0.48, seam * 0.42);
}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    vec2 tellusPaintUv = vTellusWorldPos.xz * tellusBiomeTextureScale;
    float meadowMask = tellusPaintBand(${PAINT_MEADOW.toFixed(1)});
    float flowersMask = tellusPaintBand(${PAINT_FLOWERS.toFixed(1)});
    float grassMask = tellusPaintBand(${PAINT_GRASS.toFixed(1)});
    float mossMask = meadowMask + flowersMask + grassMask;
    float sandMask = tellusPaintBand(${PAINT_BEACH.toFixed(1)});
    float dirtMask = tellusPaintBand(${PAINT_DIRT.toFixed(1)});
    float rockMask = tellusPaintBand(${PAINT_ROCK.toFixed(1)});
    float snowMask = tellusPaintBand(${PAINT_SNOW.toFixed(1)});
    float stoneMask = tellusPaintBand(${PAINT_STONE.toFixed(1)});
    float brickMask = tellusPaintBand(${PAINT_BRICK.toFixed(1)});
    float paintMask = clamp(mossMask + sandMask + dirtMask + rockMask + snowMask + stoneMask + brickMask, 0.0, 1.0);
    vec3 mossSample = texture2D(tellusMossAlbedoMap, tellusPaintUv).rgb;
    vec3 sandSample = texture2D(tellusSandAlbedoMap, tellusPaintUv).rgb;
    vec3 rockSample = texture2D(tellusRockAlbedoMap, tellusPaintUv).rgb;
    vec3 meadowAlbedo = mossSample * vec3(0.96, 1.03, 0.96);
    vec3 flowersAlbedo = mossSample * vec3(1.04, 1.08, 1.08);
    vec3 grassAlbedo = mossSample * vec3(1.08, 1.12, 0.82);
    vec3 sandAlbedo = sandSample * vec3(1.04, 0.98, 0.86);
    vec3 dirtAlbedo = sandSample * vec3(0.70, 0.50, 0.36);
    vec3 pebbleAlbedo = rockSample * vec3(0.82, 0.86, 0.82);
    float mountainRock = smoothstep(0.22, 0.58, 1.0 - clamp(vTellusWorldNormal.y, 0.0, 1.0));
    vec3 rockAlbedo = mix(pebbleAlbedo, tellusRockSurface(vTellusWorldPos.xz, pebbleAlbedo), mountainRock);
    float snowGrain = mix(0.88, 1.08, tellusHash2(floor(vTellusWorldPos.xz * 2.6)));
    vec3 snowAlbedo = vec3(0.82, 0.91, 0.94) * snowGrain;
    vec3 cobblestoneAlbedo = tellusStoneSlabs(vTellusWorldPos.xz);
    vec3 brickAlbedo = tellusRunningBondBrick(vTellusWorldPos.xz);
    vec3 biomeAlbedo =
      meadowAlbedo * meadowMask +
      flowersAlbedo * flowersMask +
      grassAlbedo * grassMask +
      sandAlbedo * sandMask +
      dirtAlbedo * dirtMask +
      rockAlbedo * rockMask +
      snowAlbedo * snowMask +
      cobblestoneAlbedo * stoneMask +
      brickAlbedo * brickMask +
      vec3(1.0) * (1.0 - paintMask);
    diffuseColor.rgb = mix(diffuseColor.rgb, mix(diffuseColor.rgb, biomeAlbedo, 0.68), paintMask);
  }`,
      );
  };
  material.customProgramCacheKey = () => "tellus-terrain-biome-lite-textures";
}

function applyTerrainPbrDetail(material: THREE.Material, options: TerrainMaterialOptions): void {
  const repeat = options.textureRepeat ?? 34;
  const useBiomeLiteTextures = terrainImageTexturesRequested();
  const withMaps = material as THREE.MeshStandardMaterial & {
    normalScale?: THREE.Vector2;
  };
  if (!useBiomeLiteTextures) {
    const albedo = makeTerrainAlbedoTexture();
    const normal = makeTerrainNormalTexture();
    if (albedo) withMaps.map = prepareRepeatTexture(albedo, repeat, THREE.SRGBColorSpace);
    if (normal) {
      withMaps.normalMap = prepareRepeatTexture(normal, repeat);
      withMaps.normalScale = new THREE.Vector2(0.1, 0.1);
    }
  }
  withMaps.roughness = options.roughness ?? 0.9;
  material.needsUpdate = true;

  // Only load image maps if a caller explicitly supplies them; default keeps the procedural canvas
  // base (previously this defaulted to a stylized-grass image that smeared over all terrain).
  const urls = useBiomeLiteTextures ? undefined : options.textureUrls;
  if (urls?.albedo) {
    void loadTerrainTexture(urls.albedo, repeat, THREE.SRGBColorSpace)
      .then((texture) => {
        withMaps.map = texture;
        material.needsUpdate = true;
      })
      .catch((error) => console.warn("Tellus terrain albedo texture failed", error));
  }
  if (urls?.normal) {
    void loadTerrainTexture(urls.normal, repeat)
      .then((texture) => {
        withMaps.normalMap = texture;
        withMaps.normalScale = new THREE.Vector2(0.13, 0.13);
        material.needsUpdate = true;
      })
      .catch((error) => console.warn("Tellus terrain normal texture failed", error));
  }
  if (urls?.roughness) {
    void loadTerrainTexture(urls.roughness, repeat)
      .then((texture) => {
        withMaps.roughnessMap = texture;
        material.needsUpdate = true;
      })
      .catch((error) => console.warn("Tellus terrain roughness texture failed", error));
  }

  if (material instanceof THREE.MeshStandardMaterial) {
    applyBiomeLiteTerrainOverlay(material, options);
  }
}

/**
 * Build the terrain surface material. WebGPU gets a node material with TSL procedural detail; WebGL
 * gets a standard material patched at compile time with the equivalent GLSL. Both consume the mesh's
 * per-vertex base color and add detail on top — no textures, so this is GPU/VRAM-cheap regardless of
 * world size.
 */
export function createTerrainMaterial(
  useWebGPU: boolean,
  options: TerrainMaterialOptions = {},
): THREE.Material {
  const roughness = options.roughness ?? 0.9;

  if (useWebGPU) {
    const material = new MeshStandardNodeMaterial();
    material.vertexColors = true;
    material.roughness = roughness;
    material.metalness = 0;
    material.colorNode = buildDetailColorNode();
    return material;
  }

  if (options.pbrDetail !== false) {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness,
      metalness: 0,
    });
    applyTerrainPbrDetail(material, options);
    return material;
  }

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness,
    metalness: 0,
  });
  material.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>\n${WEBGL_VARYING}\n${WEBGL_VERTEX_HEAD}`,
      )
      .replace(
        "#include <project_vertex>",
        `#include <project_vertex>\n${WEBGL_VERTEX_TAIL}`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        `#include <common>\n${WEBGL_VARYING}\n${WEBGL_NOISE}`,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>\n${webglColorPatch()}`,
      );
  };
  // Distinct cache key so this patched program isn't shared with un-patched standard materials.
  material.customProgramCacheKey = () => "tellus-terrain-detail";
  return material;
}
