import * as THREE from "three";
import { MeshStandardNodeMaterial } from "three/webgpu";
import {
  color,
  mix,
  mx_fractal_noise_float,
  mx_noise_float,
  normalWorld,
  positionWorld,
  smoothstep,
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
  macroScale: 0.085, // world-space frequency of the broad mottling
  microScale: 0.95, // fine grain frequency
  macroStrength: 0.14, // how much the macro noise darkens/lightens (±)
  microStrength: 0.06,
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

  // Apply: base vertex color, lifted/darkened by grain, darkened by slope, then cool-tinted up high.
  const base = vertexColor();
  const litColor = base.mul(grain.add(1).sub(slopeDark));
  return mix(litColor, litColor.add(coolTint), heightT);
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
