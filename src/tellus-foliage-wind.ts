import * as THREE from "three";

const WIND_ATTRIBUTE = "tellusWindWeight";
const WIND_SHADER_KEY = "tellus-foliage-wind-v2";

export type FoliageWindOptions = {
  /** Apply after instance scaling for thin branch segments, or locally for blades and leaf surfaces. */
  space?: "local" | "post-instance";
};

type FoliageWindState = {
  time: THREE.IUniform<number>;
  strength: THREE.IUniform<number>;
};

type FoliageWindMaterial = THREE.Material & {
  userData: {
    tellusFoliageWind?: FoliageWindState;
    [key: string]: unknown;
  };
};

export function clampedWindWeights(values: ArrayLike<number>): Float32Array {
  const weights = new Float32Array(values.length);
  for (let index = 0; index < values.length; index++) {
    // ProcPlantTemplate.sway is already an authored absolute stiffness weight. Preserve it rather
    // than normalizing each template independently, which would make a 0.5-flex fern bend like a tree.
    weights[index] = THREE.MathUtils.clamp(Math.abs(values[index] ?? 0), 0, 1);
  }
  return weights;
}

export function attachFoliageWindWeights(
  geometry: THREE.BufferGeometry,
  weights: ArrayLike<number>,
): void {
  const vertexCount = geometry.getAttribute("position")?.count ?? 0;
  if (weights.length !== vertexCount) {
    throw new Error(`foliage wind weight count ${weights.length} does not match ${vertexCount} vertices`);
  }
  geometry.setAttribute(WIND_ATTRIBUTE, new THREE.BufferAttribute(new Float32Array(weights), 1));
}

export function heightWindWeights(geometry: THREE.BufferGeometry): Float32Array {
  const positions = geometry.getAttribute("position");
  if (!positions) return new Float32Array();
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;
  for (let index = 0; index < positions.count; index++) {
    const y = positions.getY(index);
    minimum = Math.min(minimum, y);
    maximum = Math.max(maximum, y);
  }
  const height = Math.max(1e-6, maximum - minimum);
  const weights = new Float32Array(positions.count);
  for (let index = 0; index < positions.count; index++) {
    weights[index] = THREE.MathUtils.clamp((positions.getY(index) - minimum) / height, 0, 1);
  }
  return weights;
}

export function enableFoliageWind(
  material: THREE.Material,
  amplitude: number,
  options: FoliageWindOptions = {},
): void {
  const space = options.space ?? "local";
  const windMaterial = material as FoliageWindMaterial;
  const previousOnBeforeCompile = material.onBeforeCompile.bind(material);
  const previousProgramKey = material.customProgramCacheKey.bind(material);
  const state: FoliageWindState = {
    time: { value: 0 },
    strength: { value: 1 },
  };
  windMaterial.userData.tellusFoliageWind = state;
  material.onBeforeCompile = (shader, renderer) => {
    previousOnBeforeCompile(shader, renderer);
    shader.uniforms.tellusWindTime = state.time;
    shader.uniforms.tellusWindStrength = state.strength;
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        `#include <common>
attribute float ${WIND_ATTRIBUTE};
uniform float tellusWindTime;
uniform float tellusWindStrength;`,
      )
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
vec3 tellusWindOrigin = vec3(0.0);
#ifdef USE_INSTANCING
  tellusWindOrigin = instanceMatrix[3].xyz;
#endif
// A low spatial frequency keeps leaves and branch segments in one crown moving as one tree while
// still preventing a whole forest from swaying in lockstep.
float tellusWindPhase = tellusWindOrigin.x * 0.025 + tellusWindOrigin.z * 0.019;
float tellusWindGust = 0.72 + sin(tellusWindTime * 0.63 + tellusWindPhase * 0.37) * 0.28;
float tellusWindWave = sin(tellusWindTime * 1.07 + tellusWindPhase) * tellusWindGust;
float tellusWindBend = ${amplitude.toFixed(4)} * ${WIND_ATTRIBUTE} * tellusWindStrength;
${space === "local" ? `transformed.x += tellusWindWave * tellusWindBend;
transformed.z += cos(tellusWindTime * 0.83 + tellusWindPhase * 1.17) * tellusWindBend * 0.58;` : ""}`,
      );
    if (space === "post-instance") {
      // Branch prototypes are instanced with (radius, length, radius) scale. Displacing them in
      // begin_vertex multiplies lateral movement by the tiny radius and makes the scaffold appear
      // frozen. Move in mesh space after instanceMatrix so authored sway survives that thin scale.
      shader.vertexShader = shader.vertexShader.replace(
        "#include <project_vertex>",
        `vec4 mvPosition = vec4( transformed, 1.0 );
#ifdef USE_BATCHING
  mvPosition = batchingMatrix * mvPosition;
#endif
#ifdef USE_INSTANCING
  mvPosition = instanceMatrix * mvPosition;
#endif
mvPosition.x += tellusWindWave * tellusWindBend;
mvPosition.z += cos(tellusWindTime * 0.83 + tellusWindPhase * 1.17) * tellusWindBend * 0.58;
mvPosition = modelViewMatrix * mvPosition;
gl_Position = projectionMatrix * mvPosition;`,
      );
    }
  };
  material.customProgramCacheKey = () =>
    `${previousProgramKey()}|${WIND_SHADER_KEY}|${space}|${amplitude.toFixed(4)}`;
  material.needsUpdate = true;
}

export function updateFoliageWind(
  material: THREE.Material,
  nowMs: number,
  strength: number,
): void {
  const state = (material as FoliageWindMaterial).userData.tellusFoliageWind;
  if (!state) return;
  state.time.value = nowMs / 1_000;
  state.strength.value = THREE.MathUtils.clamp(strength, 0, 1.5);
}
