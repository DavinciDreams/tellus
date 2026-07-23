import * as THREE from "three";
import type { WaterSettings } from "./tellus-types";

const SIMULATION_SIZE = 96;
const SIMULATION_INTERVAL_MS = 1000 / 30;
const ACTIVE_TAIL_MS = 5200;
const PULSE_DELAYS_MS = [0, 190, 370] as const;
const PULSE_STRENGTHS = [1, 0.62, 0.36] as const;

const FULLSCREEN_VERTEX = /* glsl */ `
  varying vec2 vUv;

  void main() {
    vUv = uv;
    gl_Position = vec4(position, 1.0);
  }
`;

const DROP_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D previousState;
  uniform vec2 dropCenter;
  uniform float dropRadius;
  uniform float dropStrength;
  varying vec2 vUv;

  void main() {
    vec4 state = texture2D(previousState, vUv);
    float distanceFromDrop = distance(vUv, dropCenter);
    float drop = max(0.0, 1.0 - distanceFromDrop / dropRadius);
    drop = 0.5 - cos(drop * 3.14159265) * 0.5;
    state.r += drop * dropStrength;
    gl_FragColor = state;
  }
`;

const STEP_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D previousState;
  uniform vec2 texelSize;
  varying vec2 vUv;

  void main() {
    vec4 state = texture2D(previousState, vUv);
    float left = texture2D(previousState, vUv - vec2(texelSize.x, 0.0)).r;
    float right = texture2D(previousState, vUv + vec2(texelSize.x, 0.0)).r;
    float down = texture2D(previousState, vUv - vec2(0.0, texelSize.y)).r;
    float up = texture2D(previousState, vUv + vec2(0.0, texelSize.y)).r;
    float neighborAverage = (left + right + down + up) * 0.25;

    float radialDistance = distance(vUv, vec2(0.5));
    float edgeAbsorption = smoothstep(0.42, 0.5, radialDistance);
    float velocity = state.g + (neighborAverage - state.r) * 1.72;
    velocity *= mix(0.992, 0.58, edgeAbsorption);
    float height = state.r + velocity;
    height *= mix(1.0, 0.38, edgeAbsorption);

    // Bleed energy through a wide shoreline band before clipping the circular tank.
    // This keeps an outgoing ring from returning inward as a reflected wave.
    float circularMask = 1.0 - smoothstep(0.49, 0.5, radialDistance);
    gl_FragColor = vec4(height * circularMask, velocity * circularMask, 0.0, 1.0);
  }
`;

const WATER_VERTEX = /* glsl */ `
  precision highp float;

  uniform sampler2D waterState;
  uniform float displacementScale;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    vUv = uv;
    vec3 displaced = position;
    displaced.z += texture2D(waterState, uv).r * displacementScale;
    vec4 worldPosition = modelMatrix * vec4(displaced, 1.0);
    vWorldPosition = worldPosition.xyz;
    gl_Position = projectionMatrix * viewMatrix * worldPosition;
  }
`;

const WATER_FRAGMENT = /* glsl */ `
  precision highp float;

  uniform sampler2D waterState;
  uniform vec2 texelSize;
  uniform vec3 deepColor;
  uniform vec3 shallowColor;
  uniform vec3 foamColor;
  uniform float surfaceOpacity;
  uniform float normalStrength;
  varying vec2 vUv;
  varying vec3 vWorldPosition;

  void main() {
    float radialDistance = distance(vUv, vec2(0.5));
    if (radialDistance > 0.5) discard;

    float centerHeight = texture2D(waterState, vUv).r;
    float left = texture2D(waterState, vUv - vec2(texelSize.x, 0.0)).r;
    float right = texture2D(waterState, vUv + vec2(texelSize.x, 0.0)).r;
    float down = texture2D(waterState, vUv - vec2(0.0, texelSize.y)).r;
    float up = texture2D(waterState, vUv + vec2(0.0, texelSize.y)).r;
    vec3 normal = normalize(vec3((left - right) * normalStrength, 1.0, (up - down) * normalStrength));
    vec3 viewDirection = normalize(cameraPosition - vWorldPosition);
    float fresnel = 0.08 + 0.92 * pow(1.0 - max(dot(viewDirection, normal), 0.0), 4.0);

    vec3 sunDirection = normalize(vec3(-0.35, 0.82, 0.42));
    vec3 reflectedView = reflect(-viewDirection, normal);
    float specular = pow(max(dot(reflectedView, sunDirection), 0.0), 72.0);
    float facingLight = clamp(normal.y * 0.65 + normal.x * 0.2 + normal.z * 0.15, 0.0, 1.0);
    vec3 refracted = mix(deepColor, shallowColor, 0.22 + facingLight * 0.22);
    vec3 reflectedSky = mix(vec3(0.30, 0.43, 0.50), vec3(0.67, 0.80, 0.86), fresnel);
    vec3 color = mix(refracted, reflectedSky, fresnel * 0.72);
    color += foamColor * specular * 0.65;

    float softEdge = 1.0 - smoothstep(0.465, 0.5, radialDistance);
    float slope = length(vec2(left - right, up - down)) * normalStrength;
    float disturbance = clamp(slope * 1.35 + abs(centerHeight) * 8.0, 0.0, 1.0);
    color = mix(color, foamColor, disturbance * 0.52);
    // This is a ripple overlay on the existing pond, not a second opaque circular pond.
    float alpha = surfaceOpacity * mix(0.015, 0.88, disturbance) * softEdge;
    gl_FragColor = vec4(color, alpha);
  }
`;

export type PondPoint = { x: number; z: number };

export function pondPositionToUv(
  center: PondPoint,
  radius: number,
  position: PondPoint,
): THREE.Vector2 | null {
  if (!Number.isFinite(radius) || radius <= 0) return null;
  const dx = position.x - center.x;
  const dz = position.z - center.z;
  if (Math.hypot(dx, dz) > radius) return null;
  // PlaneGeometry is rotated -90 degrees around X, so its local +Y points toward world -Z.
  return new THREE.Vector2(0.5 + dx / (radius * 2), 0.5 - dz / (radius * 2));
}

export interface PondRippleSimulation {
  readonly material: THREE.ShaderMaterial;
  readonly resolution: number;
  readonly pendingDropCount: number;
  readonly center: PondPoint;
  readonly radius: number;
  recenter(position: PondPoint): boolean;
  queueDrop(position: PondPoint, nowMs: number, strength?: number): boolean;
  update(renderer: THREE.WebGLRenderer, nowMs: number): void;
  dispose(): void;
}

function makeTarget(): THREE.WebGLRenderTarget {
  const target = new THREE.WebGLRenderTarget(SIMULATION_SIZE, SIMULATION_SIZE, {
    format: THREE.RGBAFormat,
    type: THREE.HalfFloatType,
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: false,
    stencilBuffer: false,
    generateMipmaps: false,
  });
  target.texture.colorSpace = THREE.NoColorSpace;
  return target;
}

export function createPondRippleSimulation(options: {
  center: PondPoint;
  radius: number;
  waterSettings: WaterSettings;
  deepColor: THREE.ColorRepresentation;
  shallowColor: THREE.ColorRepresentation;
  foamColor: THREE.ColorRepresentation;
}): PondRippleSimulation {
  const center = { ...options.center };
  const targets = [makeTarget(), makeTarget()] as const;
  const zeroTexture = new THREE.DataTexture(new Float32Array([0, 0, 0, 1]), 1, 1, THREE.RGBAFormat, THREE.FloatType);
  zeroTexture.needsUpdate = true;
  zeroTexture.colorSpace = THREE.NoColorSpace;
  const texelSize = new THREE.Vector2(1 / SIMULATION_SIZE, 1 / SIMULATION_SIZE);
  const surfaceMaterial = new THREE.ShaderMaterial({
    name: "tellus-basalt-pond-water",
    vertexShader: WATER_VERTEX,
    fragmentShader: WATER_FRAGMENT,
    uniforms: {
      waterState: { value: zeroTexture },
      texelSize: { value: texelSize },
      displacementScale: { value: Math.max(0.42, options.radius * 0.055) },
      normalStrength: { value: 72 },
      deepColor: { value: new THREE.Color(options.deepColor) },
      shallowColor: { value: new THREE.Color(options.shallowColor) },
      foamColor: { value: new THREE.Color(options.foamColor) },
      surfaceOpacity: { value: Math.min(0.9, options.waterSettings.opacity * 0.9) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  surfaceMaterial.userData.tellusSimulatedPond = true;

  const dropMaterial = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: DROP_FRAGMENT,
    uniforms: {
      previousState: { value: zeroTexture },
      dropCenter: { value: new THREE.Vector2(0.5, 0.5) },
      dropRadius: { value: 0.035 },
      dropStrength: { value: 0.03 },
    },
    depthTest: false,
    depthWrite: false,
  });
  const stepMaterial = new THREE.ShaderMaterial({
    vertexShader: FULLSCREEN_VERTEX,
    fragmentShader: STEP_FRAGMENT,
    uniforms: {
      previousState: { value: zeroTexture },
      texelSize: { value: texelSize },
    },
    depthTest: false,
    depthWrite: false,
  });
  const passScene = new THREE.Scene();
  const passCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const passQuad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), stepMaterial);
  passScene.add(passQuad);

  const pendingDrops: Array<{ uv: THREE.Vector2; strength: number; atMs: number }> = [];
  let currentIndex = 0;
  let initialized = false;
  let disposed = false;
  let failed = false;
  let failureLogged = false;
  let lastStepAt = Number.NEGATIVE_INFINITY;
  let activeUntil = Number.NEGATIVE_INFINITY;

  const renderPass = (renderer: THREE.WebGLRenderer, material: THREE.ShaderMaterial) => {
    const nextIndex = currentIndex === 0 ? 1 : 0;
    passQuad.material = material;
    renderer.setRenderTarget(targets[nextIndex]);
    renderer.render(passScene, passCamera);
    currentIndex = nextIndex;
    surfaceMaterial.uniforms.waterState.value = targets[currentIndex].texture;
  };

  const initialize = (renderer: THREE.WebGLRenderer) => {
    const previousClearColor = renderer.getClearColor(new THREE.Color()).clone();
    const previousClearAlpha = renderer.getClearAlpha();
    try {
      renderer.setClearColor(0x000000, 0);
      for (const target of targets) {
        renderer.setRenderTarget(target);
        renderer.clear(true, false, false);
      }
    } finally {
      renderer.setClearColor(previousClearColor, previousClearAlpha);
    }
    initialized = true;
    surfaceMaterial.uniforms.waterState.value = targets[currentIndex].texture;
  };

  return {
    material: surfaceMaterial,
    resolution: SIMULATION_SIZE,
    get pendingDropCount() {
      return pendingDrops.length;
    },
    get center() {
      return center;
    },
    radius: options.radius,
    recenter(position) {
      if (Math.hypot(position.x - center.x, position.z - center.z) <= options.radius * 0.58) {
        return false;
      }
      center.x = position.x;
      center.z = position.z;
      pendingDrops.length = 0;
      currentIndex = 0;
      initialized = false;
      lastStepAt = Number.NEGATIVE_INFINITY;
      activeUntil = Number.NEGATIVE_INFINITY;
      surfaceMaterial.uniforms.waterState.value = zeroTexture;
      return true;
    },
    queueDrop(position, nowMs, strength = 1) {
      if (disposed || failed) return false;
      const uv = pondPositionToUv(center, options.radius, position);
      if (!uv) return false;
      const normalizedStrength = THREE.MathUtils.clamp(strength, 0.25, 1.5);
      const hasPendingEchoes = pendingDrops.some((drop) => drop.atMs > nowMs + 40);
      const pulseCount = hasPendingEchoes ? 1 : PULSE_DELAYS_MS.length;
      for (let pulseIndex = 0; pulseIndex < pulseCount; pulseIndex++) {
        pendingDrops.push({
          uv: uv.clone(),
          strength: normalizedStrength * PULSE_STRENGTHS[pulseIndex],
          atMs: nowMs + PULSE_DELAYS_MS[pulseIndex],
        });
      }
      activeUntil = Math.max(activeUntil, nowMs + ACTIVE_TAIL_MS + PULSE_DELAYS_MS[pulseCount - 1]);
      return true;
    },
    update(renderer, nowMs) {
      if (disposed || failed || (pendingDrops.length === 0 && nowMs > activeUntil)) return;
      const previousTarget = renderer.getRenderTarget();
      const previousAutoClear = renderer.autoClear;
      try {
        renderer.autoClear = true;
        if (!initialized) initialize(renderer);

        const dueDrops = pendingDrops.filter((drop) => drop.atMs <= nowMs);
        for (let dropIndex = pendingDrops.length - 1; dropIndex >= 0; dropIndex--) {
          if (pendingDrops[dropIndex].atMs <= nowMs) pendingDrops.splice(dropIndex, 1);
        }
        for (const drop of dueDrops) {
          dropMaterial.uniforms.previousState.value = targets[currentIndex].texture;
          dropMaterial.uniforms.dropCenter.value.copy(drop.uv);
          dropMaterial.uniforms.dropRadius.value = 0.024 + drop.strength * 0.011;
          dropMaterial.uniforms.dropStrength.value = 0.028 + drop.strength * 0.024;
          renderPass(renderer, dropMaterial);
        }

        if (nowMs - lastStepAt >= SIMULATION_INTERVAL_MS) {
          // Two inexpensive 96x96 propagation steps preserve the reference demo's fluid motion
          // while the surrounding Tellus scene remains a single normal render.
          for (let step = 0; step < 2; step++) {
            stepMaterial.uniforms.previousState.value = targets[currentIndex].texture;
            renderPass(renderer, stepMaterial);
          }
          lastStepAt = nowMs;
        }
      } catch (error) {
        failed = true;
        if (!failureLogged) {
          failureLogged = true;
          console.warn("Basalt pond ripple simulation unavailable; keeping the still surface", error);
        }
      } finally {
        renderer.setRenderTarget(previousTarget);
        renderer.autoClear = previousAutoClear;
      }
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pendingDrops.length = 0;
      for (const target of targets) target.dispose();
      zeroTexture.dispose();
      dropMaterial.dispose();
      stepMaterial.dispose();
      passQuad.geometry.dispose();
      surfaceMaterial.dispose();
    },
  };
}
