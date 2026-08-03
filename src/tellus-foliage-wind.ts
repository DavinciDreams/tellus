import * as THREE from "three";

const WIND_ATTRIBUTE = "tellusWindWeight";
const WIND_SHADER_KEY = "tellus-foliage-wind-v1";

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

export function enableFoliageWind(material: THREE.Material, amplitude: number): void {
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
float tellusWindPhase = tellusWindOrigin.x * 0.12 + tellusWindOrigin.z * 0.09;
float tellusWindGust = 0.72 + sin(tellusWindTime * 0.63 + tellusWindPhase * 0.37) * 0.28;
float tellusWindWave = sin(tellusWindTime * 1.07 + tellusWindPhase) * tellusWindGust;
float tellusWindBend = ${amplitude.toFixed(4)} * ${WIND_ATTRIBUTE} * tellusWindStrength;
transformed.x += tellusWindWave * tellusWindBend;
transformed.z += cos(tellusWindTime * 0.83 + tellusWindPhase * 1.17) * tellusWindBend * 0.58;`,
      );
  };
  material.customProgramCacheKey = () => `${previousProgramKey()}|${WIND_SHADER_KEY}|${amplitude.toFixed(4)}`;
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
