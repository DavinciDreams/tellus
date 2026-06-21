import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import { ktx2Loader } from "./tellus-generation-client";
import {
  attribute,
  color,
  float,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
  texture,
  uv,
  vertexColor,
} from "three/tsl";

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
function buildDetailColorNode(
  paintTextures?: { stone: THREE.Texture; brick: THREE.Texture },
  textureRepeat = 34,
) {
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

  // Apply: base vertex color, lifted/darkened by grain, darkened by slope, then cool-tinted up high.
  const base = vertexColor();
  const litColor = base.mul(grain.add(1).sub(slopeDark));
  let detailed = mix(litColor, litColor.add(coolTint), heightT);

  if (paintTextures) {
    const paintCode = float(attribute("tellusPaintCode", "float"));
    const tiledUv = uv().mul(textureRepeat);
    const stoneMask = smoothstep(0.18, 0.72, paintCode.sub(7).abs()).oneMinus();
    const brickMask = smoothstep(0.18, 0.72, paintCode.sub(8).abs()).oneMinus();
    const stoneColor = texture(paintTextures.stone, tiledUv).rgb;
    const brickColor = texture(paintTextures.brick, tiledUv).rgb;
    detailed = mix(detailed, detailed.mul(stoneColor).mul(1.35), stoneMask);
    detailed = mix(detailed, detailed.mul(brickColor).mul(1.25), brickMask);
  }

  return detailed;
}

/** GLSL injected into MeshStandardMaterial for the WebGL fallback — mirrors buildDetailColorNode(). */
const WEBGL_VARYING = "varying vec3 vTellusWorldPos;\nvarying vec3 vTellusWorldNormal;";

const WEBGL_VERTEX_TAIL = `
  vTellusWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;
  vTellusWorldNormal = normalize(mat3(modelMatrix) * objectNormal);
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
    diffuseColor.rgb *= (1.0 + grain - slopeDark);
    diffuseColor.rgb += coolTint * heightT;
  }
  `;
}

export interface TerrainMaterialOptions {
  roughness?: number;
  pbrDetail?: boolean;
  textureRepeat?: number;
  textureUrls?: {
    albedo?: string;
    normal?: string;
    roughness?: string;
  };
  paintTextureUrls?: {
    stone?: string;
    brick?: string;
  };
}

const DEFAULT_TERRAIN_TEXTURE_URLS: Required<NonNullable<TerrainMaterialOptions["textureUrls"]>> = {
  albedo: "/terrain-textures/stylized-grass1/albedo.png",
  normal: "/terrain-textures/stylized-grass1/normal.png",
  roughness: "/terrain-textures/stylized-grass1/roughness.png",
};

const DEFAULT_PAINT_TEXTURE_URLS: Required<NonNullable<TerrainMaterialOptions["paintTextureUrls"]>> = {
  stone: "/terrain-textures/stone-rock064/albedo.png",
  brick: "/terrain-textures/brick-bricks028/albedo.png",
};

const terrainTextureLoader = new THREE.TextureLoader();
const generatedTerrainTextures = new Map<string, THREE.Texture>();

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
      const blade = Math.max(0, 1 - Math.abs(((x * 0.22 + y * 0.045 + n1 * 3) % 8) - 4) / 4);
      const value = 202 + Math.round(n1 * 22 + n2 * 18 + blade * 12);
      const greenLift = Math.round(blade * 10 + n2 * 5);
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
      const blade = Math.max(0, 1 - Math.abs(((x * 0.22 + y * 0.045 + n1 * 3) % 8) - 4) / 4);
      height[y * size + x] = n1 * 0.45 + n2 * 0.25 + blade * 0.65;
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

function makePaintAlbedoTexture(kind: "stone" | "brick"): THREE.Texture {
  const cached = generatedTerrainTextures.get(`paint-${kind}`);
  if (cached) return cached;
  if (typeof document === "undefined") return new THREE.Texture();
  const size = 256;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    const empty = new THREE.CanvasTexture(canvas);
    generatedTerrainTextures.set(`paint-${kind}`, empty);
    return empty;
  }
  const image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = seededNoise(x * 0.18 + (kind === "brick" ? 11 : 3), y * 0.18 - 7);
      const n2 = seededNoise(x * 0.72 - 5, y * 0.72 + 19);
      const mortar = kind === "brick" && (((x + Math.floor(y / 28) * 22) % 64) < 4 || y % 28 < 4);
      const chip = kind === "stone" && n2 > 0.78;
      const i = (y * size + x) * 4;
      if (kind === "brick") {
        image.data[i] = mortar ? 146 : 150 + Math.round(n * 34);
        image.data[i + 1] = mortar ? 132 : 74 + Math.round(n * 18);
        image.data[i + 2] = mortar ? 118 : 58 + Math.round(n * 12);
      } else {
        const base = chip ? 150 : 110 + Math.round(n * 46);
        image.data[i] = base + 6;
        image.data[i + 1] = base + 4;
        image.data[i + 2] = base;
      }
      image.data[i + 3] = 255;
    }
  }
  ctx.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  generatedTerrainTextures.set(`paint-${kind}`, texture);
  return texture;
}

async function loadTerrainTexture(url: string, repeat: number, colorSpace?: THREE.ColorSpace): Promise<THREE.Texture> {
  const texture = url.toLowerCase().endsWith(".ktx2")
    ? await ktx2Loader.loadAsync(url)
    : await terrainTextureLoader.loadAsync(url);
  return prepareRepeatTexture(texture, repeat, colorSpace);
}

function loadIntoTerrainTexture(
  target: THREE.Texture,
  url: string | undefined,
  repeat: number,
  colorSpace?: THREE.ColorSpace,
  label = "texture",
): void {
  if (!url) return;
  void loadTerrainTexture(url, repeat, colorSpace)
    .then((texture) => {
      target.copy(texture);
      prepareRepeatTexture(target, repeat, colorSpace);
      target.needsUpdate = true;
      texture.dispose();
    })
    .catch((error) => console.warn(`Tellus terrain ${label} texture failed`, error));
}

function applyTerrainPbrDetail(material: THREE.Material, options: TerrainMaterialOptions): void {
  const repeat = options.textureRepeat ?? 34;
  const withMaps = material as THREE.MeshStandardMaterial & {
    normalScale?: THREE.Vector2;
  };
  const albedo = makeTerrainAlbedoTexture();
  const normal = makeTerrainNormalTexture();
  if (albedo) withMaps.map = prepareRepeatTexture(albedo, repeat, THREE.SRGBColorSpace);
  if (normal) {
    withMaps.normalMap = prepareRepeatTexture(normal, repeat);
    withMaps.normalScale = new THREE.Vector2(0.1, 0.1);
  }
  withMaps.roughness = options.roughness ?? 0.9;
  material.needsUpdate = true;

  const urls = options.textureUrls ?? DEFAULT_TERRAIN_TEXTURE_URLS;
  if (urls.albedo) {
    void loadTerrainTexture(urls.albedo, repeat, THREE.SRGBColorSpace)
      .then((texture) => {
        withMaps.map = texture;
        material.needsUpdate = true;
      })
      .catch((error) => console.warn("Tellus terrain albedo texture failed", error));
  }
  if (urls.normal) {
    void loadTerrainTexture(urls.normal, repeat)
      .then((texture) => {
        withMaps.normalMap = texture;
        withMaps.normalScale = new THREE.Vector2(0.13, 0.13);
        material.needsUpdate = true;
      })
      .catch((error) => console.warn("Tellus terrain normal texture failed", error));
  }
  if (urls.roughness) {
    void loadTerrainTexture(urls.roughness, repeat)
      .then((texture) => {
        withMaps.roughnessMap = texture;
        material.needsUpdate = true;
      })
      .catch((error) => console.warn("Tellus terrain roughness texture failed", error));
  }
}

const WEBGL_MASKED_TERRAIN_MAP_FRAGMENT = `
#ifdef USE_MAP
  vec4 sampledDiffuseColor = texture2D( map, vMapUv );
  #ifdef DECODE_VIDEO_TEXTURE
    sampledDiffuseColor = sRGBTransferEOTF( sampledDiffuseColor );
  #endif
  float tellusGrassMask = 1.0 - smoothstep(0.18, 0.72, abs(vTellusPaintCode - 9.0));
  diffuseColor.rgb *= mix(vec3(1.0), sampledDiffuseColor.rgb, tellusGrassMask);
  diffuseColor.a *= sampledDiffuseColor.a;
#endif
`;

const WEBGL_MASKED_TERRAIN_NORMAL_FRAGMENT_MAPS = `
#ifdef USE_NORMALMAP_OBJECTSPACE
  vec3 objectNormalMap = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  float tellusGrassNormalMask = 1.0 - smoothstep(0.18, 0.72, abs(vTellusPaintCode - 9.0));
  objectNormalMap.xy *= tellusGrassNormalMask;
  normal = objectNormalMap;
  #ifdef FLIP_SIDED
    normal = - normal;
  #endif
  #ifdef DOUBLE_SIDED
    normal = normal * faceDirection;
  #endif
  normal = normalize( normalMatrix * normal );
#elif defined( USE_NORMALMAP_TANGENTSPACE )
  vec3 mapN = texture2D( normalMap, vNormalMapUv ).xyz * 2.0 - 1.0;
  float tellusGrassNormalMask = 1.0 - smoothstep(0.18, 0.72, abs(vTellusPaintCode - 9.0));
  mapN.xy *= normalScale * tellusGrassNormalMask;
  normal = normalize( tbn * mapN );
#elif defined( USE_BUMPMAP )
  normal = perturbNormalArb( - vViewPosition, normal, dHdxy_fwd(), faceDirection );
#endif
`;

function applyPaintTextureBlend(material: THREE.MeshStandardMaterial, options: TerrainMaterialOptions): void {
  const repeat = options.textureRepeat ?? 34;
  const urls = options.paintTextureUrls ?? DEFAULT_PAINT_TEXTURE_URLS;
  const paintTextures: {
    stone: THREE.Texture | null;
    brick: THREE.Texture | null;
  } = {
    stone: material.map,
    brick: material.map,
  };
  const shaders = new Set<THREE.WebGLProgramParametersWithUniforms>();

  const updateShaderUniforms = () => {
    for (const shader of shaders) {
      shader.uniforms.tellusStoneAlbedoMap.value = paintTextures.stone ?? material.map;
      shader.uniforms.tellusBrickAlbedoMap.value = paintTextures.brick ?? material.map;
    }
  };

  if (urls.stone) {
    void loadTerrainTexture(urls.stone, repeat, THREE.SRGBColorSpace)
      .then((texture) => {
        paintTextures.stone = texture;
        updateShaderUniforms();
      })
      .catch((error) => console.warn("Tellus terrain stone texture failed", error));
  }
  if (urls.brick) {
    void loadTerrainTexture(urls.brick, repeat, THREE.SRGBColorSpace)
      .then((texture) => {
        paintTextures.brick = texture;
        updateShaderUniforms();
      })
      .catch((error) => console.warn("Tellus terrain brick texture failed", error));
  }

  material.onBeforeCompile = (shader) => {
    shaders.add(shader);
    shader.uniforms.tellusStoneAlbedoMap = { value: paintTextures.stone ?? material.map };
    shader.uniforms.tellusBrickAlbedoMap = { value: paintTextures.brick ?? material.map };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nattribute float tellusPaintCode;\nvarying float vTellusPaintCode;",
      )
      .replace(
        "#include <begin_vertex>",
        "#include <begin_vertex>\nvTellusPaintCode = tellusPaintCode;",
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform sampler2D tellusStoneAlbedoMap;\nuniform sampler2D tellusBrickAlbedoMap;\nvarying float vTellusPaintCode;",
      )
      .replace(
        "#include <map_fragment>",
        WEBGL_MASKED_TERRAIN_MAP_FRAGMENT,
      )
      .replace(
        "#include <normal_fragment_maps>",
        WEBGL_MASKED_TERRAIN_NORMAL_FRAGMENT_MAPS,
      )
      .replace(
        "#include <color_fragment>",
        `#include <color_fragment>
  {
    float tellusStoneMask = 1.0 - smoothstep(0.18, 0.72, abs(vTellusPaintCode - 7.0));
    float tellusBrickMask = 1.0 - smoothstep(0.18, 0.72, abs(vTellusPaintCode - 8.0));
    vec3 tellusStoneColor = texture2D(tellusStoneAlbedoMap, vMapUv).rgb;
    vec3 tellusBrickColor = texture2D(tellusBrickAlbedoMap, vMapUv).rgb;
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tellusStoneColor * 1.35, tellusStoneMask);
    diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * tellusBrickColor * 1.25, tellusBrickMask);
  }`,
      );
  };
  material.customProgramCacheKey = () => "tellus-terrain-paint-texture-blend";
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
    const repeat = options.textureRepeat ?? 34;
    const urls = options.paintTextureUrls ?? DEFAULT_PAINT_TEXTURE_URLS;
    const paintTextures = {
      stone: prepareRepeatTexture(makePaintAlbedoTexture("stone"), repeat, THREE.SRGBColorSpace),
      brick: prepareRepeatTexture(makePaintAlbedoTexture("brick"), repeat, THREE.SRGBColorSpace),
    };
    loadIntoTerrainTexture(paintTextures.stone, urls.stone, repeat, THREE.SRGBColorSpace, "stone");
    loadIntoTerrainTexture(paintTextures.brick, urls.brick, repeat, THREE.SRGBColorSpace, "brick");
    const material = new MeshStandardNodeMaterial();
    material.vertexColors = true;
    material.roughness = roughness;
    material.metalness = 0;
    material.colorNode = buildDetailColorNode(paintTextures, repeat);
    return material;
  }

  if (options.pbrDetail !== false) {
    const material = new THREE.MeshStandardMaterial({
      vertexColors: true,
      roughness,
      metalness: 0,
    });
    applyTerrainPbrDetail(material, options);
    applyPaintTextureBlend(material, options);
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
        `#include <common>\n${WEBGL_VARYING}`,
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
