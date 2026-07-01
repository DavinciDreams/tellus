import * as THREE from "three";
import { clone as skeletonClone } from "three/examples/jsm/utils/SkeletonUtils.js";
import { buildProceduralModel, sanitizeProceduralModelUrl } from "./tellus-procedural-assets";
import { textureErrorSince, textureFailedModelUrls } from "./tellus-generation-client";
import { MeshBasicNodeMaterial } from "three/webgpu";
import {
  color,
  linearDepth,
  mx_worley_noise_float,
  positionWorld,
  screenUV,
  time,
  vec2,
  viewportDepthTexture,
  viewportLinearDepth,
  viewportSharedTexture,
} from "three/tsl";
import type {
  AgentId,
  DistantIslandSpec,
  GeneratedKind,
  GeneratedThing,
  MaterialWithTextureMaps,
  Vec3,
  WaterSettings,
} from "./tellus-types";
import {
  DISTANT_TERRAIN_SEGMENTS,
  DISTANT_TERRAIN_VERTEX_COUNT,
  MOON_SIZE,
  OCEAN_RADIUS,
  POND_CENTER,
  POND_RADIUS,
  SEA_LEVEL,
  SKYBOX_FALLBACK_URLS,
  TERRAIN_SEGMENTS,
  WORLD_RADIUS,
} from "./tellus-constants";
import { clamp, rand } from "./tellus-utils";
import { runtimeConfig } from "./tellus-runtime-config";
import {
  distantIslandGridWorldPoint,
  distantIslandHeight,
  distantIslandSpecs,
  distantIslandWorldPoint,
  distantTerrainPaintAt,
  centralTerrainPaintAt,
  isFreeMovingVehicle,
  pondWaterLevel,
  terrainHeight,
  terrainKind,
  terrainPaintCode,
  terrainVertexColor,
} from "./tellus-terrain";
import { createGltfLoader, gltfObjectCache } from "./tellus-generation-client";
import { proxiedGeneratedModelUrl } from "./tellus-urls-identity";
import { tryLoadVrmObject, VrmObjectRig } from "./tellus-vrm-avatar";
import { createTerrainMaterial, terrainKindCode } from "./tellus-terrain-material";
import { worldThingTargetHeight } from "./tellus-world-object-profile";

const SKYBOX_MODEL_VERTICAL_OFFSETS: Record<string, number> = {
  "/skybox/free_-_skybox_basic_sky.glb": -30,
};

export function createFlowerSpriteTexture(petalColor: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.translate(32, 32);
  context.fillStyle = petalColor;
  for (let petal = 0; petal < 5; petal++) {
    context.save();
    context.rotate((petal / 5) * Math.PI * 2);
    context.beginPath();
    context.ellipse(0, -13, 8, 15, 0, 0, Math.PI * 2);
    context.fill();
    context.restore();
  }
  context.fillStyle = "#f4d35e";
  context.beginPath();
  context.arc(0, 0, 7, 0, Math.PI * 2);
  context.fill();
  context.strokeStyle = "rgba(41, 69, 28, 0.32)";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(0, 0, 25, 0, Math.PI * 2);
  context.stroke();
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createFlowerSpriteMaterials(): THREE.SpriteMaterial[] {
  return ["#fff7d6", "#f6adc8", "#d4ddff", "#ffe28a"].map(
    (petalColor) =>
      new THREE.SpriteMaterial({
        map: createFlowerSpriteTexture(petalColor),
        transparent: true,
        depthWrite: false,
        sizeAttenuation: true,
      }),
  );
}

// renderSegments decouples the VISUAL mesh density from the synced 97² sculpt grid: the mesh samples
// terrainHeight()/terrainKind() (base + bilinear sculpt) at any resolution, so a denser mesh means
// smoother slopes and finer paint blending with ZERO protocol/server changes.
export function createTerrainGeometry(renderSegments = TERRAIN_SEGMENTS): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const paintCodes: number[] = [];
  const terrainKindCodes: number[] = [];
  const indices: number[] = [];

  for (let z = 0; z <= renderSegments; z++) {
    const vz = (z / renderSegments - 0.5) * WORLD_RADIUS * 2;
    for (let x = 0; x <= renderSegments; x++) {
      const vx = (x / renderSegments - 0.5) * WORLD_RADIUS * 2;
      const r = Math.hypot(vx, vz);
      const inside = r <= WORLD_RADIUS;
      const edgeScale = inside ? 1 : WORLD_RADIUS / r;
      const px = vx * edgeScale;
      const pz = vz * edgeScale;
      const py = inside ? terrainHeight(px, pz) : -4.5;
      const kind = inside ? terrainKind(px, pz, py) : "rock";
      const color = terrainVertexColor(kind, px, pz, x * 1009 + z * 9176);
      const painted = inside ? centralTerrainPaintAt(px, pz) : null;
      positions.push(px, py, pz);
      colors.push(color.r, color.g, color.b);
      uvs.push(px / (WORLD_RADIUS * 2) + 0.5, pz / (WORLD_RADIUS * 2) + 0.5);
      paintCodes.push(painted ? terrainPaintCode(painted) : 0);
      terrainKindCodes.push(terrainKindCode(kind));
    }
  }

  const row = renderSegments + 1;
  for (let z = 0; z < renderSegments; z++) {
    for (let x = 0; x < renderSegments; x++) {
      const a = z * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("tellusPaintCode", new THREE.Float32BufferAttribute(paintCodes, 1));
  geometry.setAttribute("tellusTerrainKindCode", new THREE.Float32BufferAttribute(terrainKindCodes, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createFloatingRim(): THREE.Mesh {
  const geometry = new THREE.CylinderGeometry(
    WORLD_RADIUS,
    WORLD_RADIUS * 0.82,
    9,
    128,
    1,
    true,
  );
  geometry.translate(0, -6.5, 0);
  const material = new THREE.MeshStandardMaterial({
    color: 0x6a5b48,
    roughness: 0.9,
    metalness: 0,
  });
  return new THREE.Mesh(geometry, material);
}

const DEFAULT_WATER_SETTINGS: WaterSettings = {
  style: "lagoon",
  opacity: 0.72,
  waveStrength: 1,
};

const WATER_STYLE_COLORS: Record<WaterSettings["style"], { deep: number; shallow: number; foam: number }> = {
  clear: { deep: 0x2b8ec4, shallow: 0xa7e7ff, foam: 0xe8fbff },
  lagoon: { deep: 0x0476b7, shallow: 0x7bd7f5, foam: 0xb7f6ff },
  deep: { deep: 0x07356e, shallow: 0x2c83b9, foam: 0x9fdff7 },
  dream: { deep: 0x5b60c8, shallow: 0xf0a7f7, foam: 0xfff1ff },
};

function resolvedWaterSettings(settings?: Partial<WaterSettings>): WaterSettings {
  return {
    style: settings?.style ?? DEFAULT_WATER_SETTINGS.style,
    opacity: clamp(settings?.opacity ?? DEFAULT_WATER_SETTINGS.opacity, 0.25, 0.92),
    waveStrength: clamp(settings?.waveStrength ?? DEFAULT_WATER_SETTINGS.waveStrength, 0, 2),
  };
}

export function createFallbackOceanMaterial(settings?: Partial<WaterSettings>): THREE.ShaderMaterial {
  const water = resolvedWaterSettings(settings);
  const palette = WATER_STYLE_COLORS[water.style];
  const material = new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 },
      uDeepColor: { value: new THREE.Color(palette.deep) },
      uShallowColor: { value: new THREE.Color(palette.shallow) },
      uFoamColor: { value: new THREE.Color(palette.foam) },
      uTintColor: { value: new THREE.Color(palette.deep).lerp(new THREE.Color(palette.shallow), 0.38) },
      uOpacity: { value: water.opacity },
      uWaveStrength: { value: water.waveStrength },
      uIslandRadius: { value: WORLD_RADIUS },
      uShoreCenter: { value: new THREE.Vector2(0, 0) },
    },
    vertexShader: `
      varying vec2 vWorldXZ;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      void main() {
        vec4 worldPosition = modelMatrix * vec4(position, 1.0);
        vWorldXZ = worldPosition.xz;
        vWorldPosition = worldPosition.xyz;
        vWorldNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * worldPosition;
      }
    `,
    fragmentShader: `
      uniform float uTime;
      uniform vec3 uDeepColor;
      uniform vec3 uShallowColor;
      uniform vec3 uFoamColor;
      uniform vec3 uTintColor;
      uniform float uOpacity;
      uniform float uWaveStrength;
      uniform float uIslandRadius;
      uniform vec2 uShoreCenter;
      varying vec2 vWorldXZ;
      varying vec3 vWorldPosition;
      varying vec3 vWorldNormal;

      vec2 hash2(vec2 p) {
        p = vec2(
          dot(p, vec2(127.1, 311.7)),
          dot(p, vec2(269.5, 183.3))
        );
        return fract(sin(p) * 43758.5453123);
      }

      float worley(vec2 p) {
        vec2 i = floor(p);
        vec2 f = fract(p);
        float nearest = 1.0;
        for (int y = -1; y <= 1; y++) {
          for (int x = -1; x <= 1; x++) {
            vec2 cell = vec2(float(x), float(y));
            vec2 point = hash2(i + cell);
            point = 0.5 + 0.5 * sin(uTime * 0.32 + 6.2831 * point);
            vec2 diff = cell + point - f;
            nearest = min(nearest, dot(diff, diff));
          }
        }
        return 1.0 - smoothstep(0.02, 0.86, sqrt(nearest));
      }

      void main() {
        float wave = 0.18 + uWaveStrength * 0.82;
        vec2 waterUV = vWorldXZ;
        float t = uTime * 0.62 * wave;
        vec2 flow = vec2(t, -t * 0.73);
        float waterLayer0 = worley(waterUV * (1.12 + wave * 0.24) + flow);
        float waterLayer1 = worley(waterUV * (0.58 + wave * 0.14) - flow * 0.62);
        float surface = clamp(pow(waterLayer0 * waterLayer1, 0.54) * 1.18, 0.0, 1.0);
        float rippleScale = 0.11 + wave * 0.06;
        float rippleX = pow(
          worley((waterUV + vec2(rippleScale, 0.0)) * (1.12 + wave * 0.24) + flow)
            * worley((waterUV + vec2(rippleScale, 0.0)) * (0.58 + wave * 0.14) - flow * 0.62),
          0.54
        ) * 1.18;
        float rippleZ = pow(
          worley((waterUV + vec2(0.0, rippleScale)) * (1.12 + wave * 0.24) + flow)
            * worley((waterUV + vec2(0.0, rippleScale)) * (0.58 + wave * 0.14) - flow * 0.62),
          0.54
        ) * 1.18;
        vec3 rippleNormal = normalize(vec3(
          (surface - rippleX) * (2.6 + wave),
          0.28,
          (surface - rippleZ) * (2.6 + wave)
        ));
        surface = pow(surface, 0.78);
        vec3 viewDir = normalize(cameraPosition - vWorldPosition);
        float facing = clamp(dot(viewDir, rippleNormal), 0.0, 1.0);
        float fresnel = mix(0.22, 1.0, pow(1.0 - facing, 3.0));
        float horizon = smoothstep(0.16, 0.72, fresnel);
        float glintCells = worley(waterUV * (3.2 + wave * 0.9) + vec2(-t * 0.42, t * 0.33));
        float glint = smoothstep(0.58, 0.96, glintCells * surface + horizon * 0.45);
        float islandDistance = length(waterUV - uShoreCenter);
        float shoreIrregularity = worley((waterUV - uShoreCenter) * 0.052 + vec2(t * 0.04, -t * 0.03));
        float shoreDistance = islandDistance - uIslandRadius + (shoreIrregularity - 0.5) * 5.2;
        float shoreBand = smoothstep(-1.2, 1.2, shoreDistance) * (1.0 - smoothstep(8.0, 18.0, shoreDistance));
        float shoreTravel = fract(shoreDistance * 0.22 - uTime * (0.62 + wave * 0.16));
        float shoreLine = 1.0 - smoothstep(0.0, 0.2, abs(shoreTravel - 0.48));
        float shoreLine2 = 1.0 - smoothstep(0.0, 0.16, abs(fract(shoreDistance * 0.16 - uTime * 0.38) - 0.52));
        float shoreNoise = worley((waterUV - uShoreCenter) * 0.22 + vec2(t * 0.18, -t * 0.12));
        float shoreFoam = shoreBand * max(shoreLine, shoreLine2 * 0.55) * mix(0.68, 1.0, shoreNoise);
        vec3 lagoonBase = mix(uDeepColor, uShallowColor, 0.56);
        vec3 rippleTint = mix(lagoonBase, uFoamColor, 0.42);
        vec3 water = mix(lagoonBase, rippleTint, clamp(0.24 + surface * 0.58 + glint * 0.14, 0.0, 1.0));
        float foam = smoothstep(0.62, 1.0, surface) * (0.1 * wave);
        water = mix(water, uFoamColor, clamp(foam + shoreFoam * 0.95, 0.0, 0.92));
        water = mix(water, vec3(1.0, 1.0, 1.0), clamp(shoreFoam * 0.62, 0.0, 0.72));
        vec3 reflection = mix(vec3(0.48, 0.78, 1.0), uFoamColor, glint * 0.62);
        water = mix(water, reflection, clamp(fresnel * 0.32 + glint * 0.16, 0.0, 0.48));
        water = mix(water, uTintColor, 0.025);
        water = mix(water, uShallowColor, 0.14);
        float horizonHaze = smoothstep(uIslandRadius * 1.25, uIslandRadius * 2.65, islandDistance);
        water = mix(water, mix(uDeepColor, uShallowColor, 0.42), horizonHaze * 0.32);
        float alpha = clamp(
          uOpacity * (0.28 + surface * 0.08) +
            fresnel * 0.12 +
            glint * 0.03 +
            shoreFoam * 0.28 +
            horizonHaze * 0.18,
          0.18,
          min(uOpacity, 0.72)
        );
        gl_FragColor = vec4(water, alpha);
      }
    `,
    transparent: true,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  material.userData.tellusWaterShader = true;
  material.userData.tellusWaterShaderVariant = "webgl-irregular-white-shore-haze";
  return material;
}

export function createOceanSurface(
  useBackdropWater: boolean,
  settings?: Partial<WaterSettings>,
): THREE.Mesh {
  const geometry = new THREE.CircleGeometry(OCEAN_RADIUS, 192);
  const material = useBackdropWater
    ? createBackdropWaterMaterial(settings)
    : createFallbackOceanMaterial(settings);
  const ocean = new THREE.Mesh(geometry, material);
  ocean.name = "tellus-surrounding-ocean";
  ocean.rotation.x = -Math.PI / 2;
  ocean.position.y = SEA_LEVEL;
  ocean.renderOrder = -4;
  return ocean;
}

export function createDistantIslandTerrainGeometry(
  spec: DistantIslandSpec,
): THREE.BufferGeometry {
  const positions: number[] = [];
  const colors: number[] = [];
  const uvs: number[] = [];
  const paintCodes: number[] = [];
  const terrainKindCodes: number[] = [];
  const indices: number[] = [];

  for (let zIndex = 0; zIndex <= DISTANT_TERRAIN_SEGMENTS; zIndex++) {
    for (let xIndex = 0; xIndex <= DISTANT_TERRAIN_SEGMENTS; xIndex++) {
      const point = distantIslandGridWorldPoint(spec, xIndex, zIndex);
      const y = distantIslandHeight(spec, point.x, point.z) - SEA_LEVEL;
      positions.push(point.localX, y, point.localZ);
      uvs.push(point.x / (WORLD_RADIUS * 2) + 0.5, point.z / (WORLD_RADIUS * 2) + 0.5);
      const painted = distantTerrainPaintAt(spec, point.x, point.z);
      paintCodes.push(painted ? terrainPaintCode(painted) : 0);
      terrainKindCodes.push(terrainKindCode(painted ?? "meadow"));
      const color = painted
        ? terrainVertexColor(
            painted,
            point.x,
            point.z,
            spec.seed + xIndex * 41 + zIndex * 83,
          )
        : new THREE.Color(0x5a9735).lerp(
            new THREE.Color(0x7a6a4a),
            clamp(point.localRadius * 0.42, 0, 0.42),
          );
      if (!painted) {
        const noise = 0.9 + rand(spec.seed + xIndex * 41 + zIndex * 83) * 0.14;
        color.multiplyScalar(noise);
      }
      colors.push(color.r, color.g, color.b);
    }
  }

  const row = DISTANT_TERRAIN_VERTEX_COUNT;
  for (let z = 0; z < DISTANT_TERRAIN_SEGMENTS; z++) {
    for (let x = 0; x < DISTANT_TERRAIN_SEGMENTS; x++) {
      const a = z * row + x;
      const b = a + 1;
      const c = a + row;
      const d = c + 1;
      const aPoint = distantIslandGridWorldPoint(spec, x, z);
      const bPoint = distantIslandGridWorldPoint(spec, x + 1, z);
      const cPoint = distantIslandGridWorldPoint(spec, x, z + 1);
      const dPoint = distantIslandGridWorldPoint(spec, x + 1, z + 1);
      if (
        Math.max(
          aPoint.localRadius,
          bPoint.localRadius,
          cPoint.localRadius,
          dPoint.localRadius,
        ) > 1
      ) {
        continue;
      }
      indices.push(a, c, b, b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.Float32BufferAttribute(positions, 3),
  );
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute("tellusPaintCode", new THREE.Float32BufferAttribute(paintCodes, 1));
  geometry.setAttribute("tellusTerrainKindCode", new THREE.Float32BufferAttribute(terrainKindCodes, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

export function createDistantIsland(
  spec: DistantIslandSpec,
  useWebGPU = false,
): THREE.Group {
  const group = new THREE.Group();
  group.name = `tellus-distant-island-${spec.seed}`;
  group.position.set(spec.x, SEA_LEVEL - 0.02, spec.z);

  const islandColor = new THREE.Color(0x4f8b2e).lerp(
    new THREE.Color(0x243d35),
    rand(spec.seed + 4) * 0.45,
  );
  const island = new THREE.Mesh(
    new THREE.CylinderGeometry(
      spec.topRadius,
      spec.bottomRadius,
      spec.height,
      18,
      1,
    ),
    new THREE.MeshStandardMaterial({
      color: islandColor,
      roughness: 0.94,
      metalness: 0,
    }),
  );
  island.position.y = spec.height * 0.42;
  island.scale.z = spec.scaleZ;
  island.rotation.y = spec.rotationY;
  group.add(island);

  const topTerrain = new THREE.Mesh(
    createDistantIslandTerrainGeometry(spec),
    createTerrainMaterial(useWebGPU, { roughness: 0.9 }),
  );
  topTerrain.name = `tellus-distant-terrain-${spec.seed}`;
  topTerrain.rotation.y = spec.rotationY;
  topTerrain.receiveShadow = true;
  group.add(topTerrain);

  const hillCount = 2 + Math.floor(rand(spec.seed + 7) * (spec.size > 1.5 ? 5 : 3));
  const hillMaterial = new THREE.MeshStandardMaterial({
    color: new THREE.Color(0x5d8f42).lerp(
      new THREE.Color(0x7a6a4a),
      rand(spec.seed + 11) * 0.28,
    ),
    roughness: 0.92,
    metalness: 0,
  });
  for (let i = 0; i < hillCount; i++) {
    const localAngle = rand(spec.seed + i * 19) * Math.PI * 2;
    const localRadius = (1.2 + rand(spec.seed + i * 23) * 5.2) * spec.size;
    const localX = Math.cos(localAngle) * localRadius;
    const localZ = Math.sin(localAngle) * localRadius * spec.scaleZ;
    const world = distantIslandWorldPoint(spec, localX, localZ);
    const surfaceY = distantIslandHeight(spec, world.x, world.z) - SEA_LEVEL;
    const hillRadius = (1.9 + rand(spec.seed + i * 13) * 3.6) *
      (0.7 + spec.size * 0.2);
    const hillHeight = (0.55 + rand(spec.seed + i * 17) * 1.5) *
      (0.8 + spec.size * 0.22);
    const hill = new THREE.Mesh(
      new THREE.SphereGeometry(1, 18, 10),
      hillMaterial.clone(),
    );
    hill.position.set(localX, surfaceY + hillHeight * 0.28, localZ);
    hill.scale.set(hillRadius, hillHeight, hillRadius * (0.72 + spec.scaleZ * 0.24));
    hill.rotation.y = rand(spec.seed + i * 29) * Math.PI;
    group.add(hill);
  }
  return group;
}

export function createDistantArchipelago(useWebGPU = false): THREE.Group {
  const group = new THREE.Group();
  group.name = "tellus-distant-archipelago";
  for (const spec of distantIslandSpecs) {
    group.add(createDistantIsland(spec, useWebGPU));
  }
  return group;
}

// A tiny procedural equirect environment map. PBR (MeshStandard) materials from GLB assets look
// muddy/"dirty" without an environment to reflect — metallic surfaces especially render near-black
// under pure analytic lights. This 64x32 sky-horizon-ground gradient gives them believable ambient
// reflections on both renderers (WebGPU PMREMs it internally; WebGL converts equirect on upload).
// Brightness is driven per-frame via scene.environmentIntensity (day/night curve).
export function createEnvironmentTexture(): THREE.DataTexture {
  const width = 64;
  const height = 32;
  const data = new Uint8Array(width * height * 4);
  const zenith = new THREE.Color(0x6d9fe0);
  const sky = new THREE.Color(0x9cc4ee);
  const horizon = new THREE.Color(0xfdeed2);
  const ground = new THREE.Color(0x57663f);
  const soil = new THREE.Color(0x3a4530);
  const c = new THREE.Color();
  for (let y = 0; y < height; y++) {
    const t = y / (height - 1); // 0 = top of the sphere
    if (t < 0.5) {
      const k = t / 0.5;
      c.copy(zenith).lerp(sky, Math.min(1, k * 1.4)).lerp(horizon, k ** 3);
    } else {
      const k = (t - 0.5) / 0.5;
      c.copy(horizon).lerp(ground, Math.min(1, k * 1.8)).lerp(soil, k * k);
    }
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      data[o] = Math.round(c.r * 255);
      data[o + 1] = Math.round(c.g * 255);
      data[o + 2] = Math.round(c.b * 255);
      data[o + 3] = 255;
    }
  }
  const texture = new THREE.DataTexture(data, width, height);
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}

export function createSkyDome(radius = 320): THREE.Mesh {
  const geometry = new THREE.SphereGeometry(radius, 48, 24);
  const material = new THREE.MeshBasicMaterial({
    color: 0xa9c8f2,
    side: THREE.BackSide,
  });
  return new THREE.Mesh(geometry, material);
}

export function createMoonHorizonOccluderTexture(): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext("2d");
  if (!context) return new THREE.CanvasTexture(canvas);
  context.clearRect(0, 0, canvas.width, canvas.height);

  const verticalFade = context.createLinearGradient(0, 0, 0, canvas.height);
  verticalFade.addColorStop(0, "rgba(255, 255, 255, 0)");
  verticalFade.addColorStop(0.2, "rgba(255, 255, 255, 0.28)");
  verticalFade.addColorStop(0.44, "rgba(255, 255, 255, 0.82)");
  verticalFade.addColorStop(1, "rgba(255, 255, 255, 1)");
  context.fillStyle = verticalFade;
  context.fillRect(0, 0, canvas.width, canvas.height);

  const edgeFade = context.createLinearGradient(0, 0, canvas.width, 0);
  edgeFade.addColorStop(0, "rgba(0, 0, 0, 0)");
  edgeFade.addColorStop(0.2, "rgba(0, 0, 0, 1)");
  edgeFade.addColorStop(0.8, "rgba(0, 0, 0, 1)");
  edgeFade.addColorStop(1, "rgba(0, 0, 0, 0)");
  context.globalCompositeOperation = "destination-in";
  context.fillStyle = edgeFade;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = "source-over";

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createMoonCloudVeil(): {
  group: THREE.Group;
  materials: THREE.MeshBasicMaterial[];
} {
  const group = new THREE.Group();
  group.name = "tellus-moon-cloud-veil";
  group.renderOrder = -70;
  group.visible = false;
  const materials: THREE.MeshBasicMaterial[] = [];
  const material = new THREE.MeshBasicMaterial({
    map: createMoonHorizonOccluderTexture(),
    color: 0x3a2376,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    toneMapped: false,
  });
  const cloud = new THREE.Mesh(
    new THREE.PlaneGeometry(MOON_SIZE * 5.2, MOON_SIZE * 1.45),
    material,
  );
  cloud.renderOrder = -70;
  cloud.position.y = -MOON_SIZE * 0.26;
  cloud.position.z = 0.08;
  materials.push(material);
  group.add(cloud);
  return { group, materials };
}

export function createAnimatedWaterMaterial(settings?: Partial<WaterSettings>): MeshBasicNodeMaterial {
  const water = resolvedWaterSettings(settings);
  const palette = WATER_STYLE_COLORS[water.style];
  const wave = 0.18 + water.waveStrength * 0.82;
  const t = time.mul(0.62 * wave);
  const waterUV = positionWorld.xzy;
  const broadFlow = mx_worley_noise_float(waterUV.mul(0.26 + wave * 0.1).add(t.mul(0.52)));
  const waveCells = mx_worley_noise_float(
    waterUV.mul(0.95 + wave * 0.4).add(broadFlow.mul(0.28 + wave * 0.1)).add(t),
  );
  const surfaceIntensity = waveCells.mul(broadFlow).mul(0.86 + wave * 0.32);
  const waterColor = surfaceIntensity.mix(color(palette.deep), color(palette.shallow));
  const illuminatedColor = waterColor.add(
    color(palette.foam).mul(surfaceIntensity.mul(0.12 * wave)),
  );
  const material = new MeshBasicNodeMaterial();
  material.colorNode = illuminatedColor;
  material.transparent = true;
  material.opacity = water.opacity;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  return material;
}

export function createBackdropWaterMaterial(settings?: Partial<WaterSettings>): MeshBasicNodeMaterial {
  const water = resolvedWaterSettings(settings);
  const palette = WATER_STYLE_COLORS[water.style];
  const wave = 0.18 + water.waveStrength * 0.82;
  const t = time.mul(0.62 * wave);
  const waterUV = positionWorld.xzy;
  const broadFlow = mx_worley_noise_float(waterUV.mul(0.26 + wave * 0.1).add(t.mul(0.52)));
  const waveCells = mx_worley_noise_float(
    waterUV.mul(0.95 + wave * 0.4).add(broadFlow.mul(0.28 + wave * 0.1)).add(t),
  );
  const surfaceIntensity = waveCells.mul(broadFlow).mul(0.86 + wave * 0.32);
  const waterColor = surfaceIntensity.mix(color(palette.deep), color(palette.shallow));
  const illuminatedColor = waterColor.add(
    color(palette.foam).mul(surfaceIntensity.mul(0.12 * wave)),
  );

  const depth = linearDepth();
  const depthWater = viewportLinearDepth.sub(depth);
  const depthEffect = depthWater.remapClamp(-0.002, 0.045);
  const refractionUV = screenUV.add(
    vec2(
      broadFlow.sub(0.5).mul(0.0035),
      surfaceIntensity.sub(0.5).mul(0.03 + wave * 0.025),
    ),
  );
  const depthTestForRefraction = linearDepth(
    viewportDepthTexture(refractionUV),
  ).sub(depth);
  const depthRefraction = depthTestForRefraction.remapClamp(0, 0.1);
  const finalUV = depthTestForRefraction.lessThan(0).select(screenUV, refractionUV);
  const viewportTexture = viewportSharedTexture(finalUV);

  const material = new MeshBasicNodeMaterial();
  material.colorNode = illuminatedColor;
  material.backdropNode = depthEffect.mix(
    viewportSharedTexture(),
    viewportTexture.mul(depthRefraction.mix(1, illuminatedColor)),
  );
  material.backdropAlphaNode = depthRefraction.oneMinus().mul(0.86);
  material.transparent = true;
  material.opacity = water.opacity;
  material.depthWrite = false;
  material.side = THREE.DoubleSide;
  return material;
}

export function disposeMaterial(material: THREE.Material | THREE.Material[]): void {
  if (Array.isArray(material)) {
    for (const item of material) item.dispose();
    return;
  }
  material.dispose();
}

export function disposeObject(object: THREE.Object3D): void {
  // A placed VRM thing owns a VRM rig (its own mixer + skinned scene buffers, never shared) — dispose
  // it so the rig stops + frees GPU resources.
  const vrmRig = object.userData?.vrmObjectRig as { dispose?: () => void } | undefined;
  if (vrmRig?.dispose) {
    vrmRig.dispose();
    return;
  }
  // Legacy generated objects may still carry disposal hooks; honor them before walking buffers.
  const disposeMirror = object.userData?.disposeMirror as (() => void) | undefined;
  if (disposeMirror) disposeMirror();
  const hasSharedBuffers = Boolean(object.userData?.sharedGltf || object.userData?.sharedProcedural);
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    if (hasSharedBuffers && (child.userData?.sharedGltf || child.userData?.sharedProcedural)) return;
    child.geometry.dispose();
    disposeMaterial(child.material);
  });
}

// Skinned (animated) glTF models — especially meshopt/gltfpack "game-optimized" store exports —
// carry bind-pose geometry whose raw bounding box says nothing about the rendered size: the real
// dimensions live in the skeleton's node transforms / inverse bind matrices, and quantization
// leaves the raw POSITION box millimeter-tiny. Plain Box3.setFromObject measures that raw box, so
// fitting a store animal scaled it up 10^4-10^7x and then "grounding" sank it hundreds of meters
// (placed Baby Wolf/Fox never rendered). Measure skinning-aware instead: refresh world + bone
// matrices, then use three's precise per-vertex path (SkinnedMesh.getVertexPosition applies bone
// transforms). The per-vertex walk only runs for models that actually contain skinned meshes.
export function measureModelBounds(model: THREE.Object3D): THREE.Box3 {
  model.updateMatrixWorld(true);
  let skinned = false;
  model.traverse((child) => {
    const skinnedMesh = child as THREE.SkinnedMesh;
    if (skinnedMesh.isSkinnedMesh) {
      skinned = true;
      skinnedMesh.skeleton.update(); // boneMatrices are all-zero until the first render
    }
  });
  return new THREE.Box3().setFromObject(model, skinned);
}

export function fitModelToHeight(model: THREE.Object3D, targetHeight: number): THREE.Object3D {
  const bounds = measureModelBounds(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const scale = size.y > 0 ? targetHeight / size.y : 1;
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
  model.traverse((child) => {
    child.frustumCulled = false;
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = true;
    child.receiveShadow = true;
  });
  // Fit just grounded the model's visible body bottom to local y=0 (position.y = -bounds.min.y*scale).
  // Record that so placeObjectAboveGround uses an offset of 0 (origin == foot) for this model instead
  // of re-measuring world bounds, which is unstable for rotated models and floats GLBs that carry
  // stray geometry far below the body (the "asset won't drop to ground" bug).
  model.userData.fitGrounded = true;
  return model;
}

export function placeObjectAboveGround(
  object: THREE.Object3D,
  position: Vec3,
  clearance = 0.04,
): void {
  object.position.set(position.x, position.y, position.z);
  // The vertical offset between the object's ORIGIN and the bottom of its visible body. We cache this
  // once (computed at the first placement) because re-measuring world bounds on every call is both
  // unstable for rotated/animated models AND wrong for store GLBs that carry stray geometry far below
  // the visual base — re-grounding those each call floated them metres into the air (the "asset won't
  // drop to ground" bug). With a CACHED offset, repeated lower/ground/sculpt placements move 1:1 with
  // position.y instead of snapping back to a re-measured float.
  // Place the object's ORIGIN at position.y (+ a tiny clearance). fitModelToHeight already grounds a
  // model's visible body near its local origin, so origin == foot for well-formed assets. We do NOT
  // re-measure bounds and lift by them: store GLBs often carry geometry far below the origin, and
  // bounds-grounding floated those metres into the air AND fought every subsequent move/lower (the
  // mesh jumped back up). Origin-anchored placement is stable and consistent across ground/lower/
  // move/sculpt — a model whose art sits oddly relative to its origin can be nudged with lift/lower.
  void clearance;
  object.position.y = position.y;
}

export async function loadGltfObject(url: string): Promise<THREE.Object3D> {
  const cached =
    gltfObjectCache.get(url) ??
    createGltfLoader().loadAsync(url).then((gltf) => gltf.scene);
  gltfObjectCache.set(url, cached);
  return (await cached).clone(true);
}

// Parse each generated GLB once, then hand out skeleton-safe clones (handles skinned/animated models, which
// THREE's .clone() mishandles). Clones share geometry/materials with the cached original — see disposeObject,
// which skips freeing those for sharedGltf instances. Avoids re-downloading + re-parsing on every re-add /
// reconnect-snapshot replay / recovery.
export const generatedGltfCache = new Map<
  string,
  Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }>
>();

// Initial world loads fire dozens of GLB parses at once; KTX2 worker transcodes under that
// contention intermittently fail (models render untextured). Gate concurrency to keep startup smooth
// and transcodes reliable.
const GLB_LOAD_CONCURRENCY = 5;
let glbLoadsActive = 0;
const glbLoadWaiters: Array<() => void> = [];
const acquireGlbSlot = async (): Promise<void> => {
  if (glbLoadsActive < GLB_LOAD_CONCURRENCY) {
    glbLoadsActive++;
    return;
  }
  await new Promise<void>((resolve) => glbLoadWaiters.push(resolve));
  glbLoadsActive++;
};
const releaseGlbSlot = () => {
  glbLoadsActive--;
  glbLoadWaiters.shift()?.();
};

export async function loadGeneratedGltfObject(
  url: string,
): Promise<{ model: THREE.Object3D; animations: THREE.AnimationClip[] }> {
  let cached = generatedGltfCache.get(url);
  if (!cached) {
    const holder: { promise?: Promise<{ scene: THREE.Object3D; animations: THREE.AnimationClip[] }> } = {};
    const pending = (async () => {
      await acquireGlbSlot();
      const startedAt = Date.now();
      try {
        const gltf = await createGltfLoader().loadAsync(url);
        // A texture failure during this load is non-fatal (model resolves with broken materials) —
        // don't cache it and mark the url so the world retries it shortly.
        if (textureErrorSince(startedAt)) {
          if (generatedGltfCache.get(url) === holder.promise) generatedGltfCache.delete(url);
          textureFailedModelUrls.add(url);
        } else {
          textureFailedModelUrls.delete(url);
        }
        return { scene: gltf.scene, animations: gltf.animations };
      } finally {
        releaseGlbSlot();
      }
    })();
    holder.promise = pending;
    cached = pending;
    // Drop failed loads from the cache so a transient error (network, decoder not ready yet) can be
    // retried instead of pinning a rejected promise for the whole session.
    cached.catch(() => {
      if (generatedGltfCache.get(url) === cached) generatedGltfCache.delete(url);
    });
    generatedGltfCache.set(url, cached);
  }
  const { scene, animations } = await cached;
  return { model: skeletonClone(scene), animations };
}

export function prepareSkyboxModel(
  model: THREE.Object3D,
  sourceUrl?: string,
): THREE.Object3D {
  let rotationSpeed: unknown;
  let horizonOffset: unknown;
  let yawOffset: unknown;
  model.traverse((child) => {
    rotationSpeed ??= child.userData.tellusSkyboxRotationSpeed;
    horizonOffset ??= child.userData.tellusSkyboxHorizonOffset;
    yawOffset ??= child.userData.tellusSkyboxYawOffset;
  });
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z);
  const scale = largestAxis > 0 ? 520 / largestAxis : 1;

  model.name = "tellus-external-skybox";
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  const modelVerticalOffset = sourceUrl ? SKYBOX_MODEL_VERTICAL_OFFSETS[sourceUrl] ?? 0 : 0;
  if (modelVerticalOffset) {
    model.position.y += modelVerticalOffset;
    model.userData.skyboxModelVerticalOffset = modelVerticalOffset;
  }
  model.scale.setScalar(scale);
  model.renderOrder = -100;
  model.userData.skyboxBoundsCenter = center;
  model.userData.skyboxBoundsScale = scale;
  if (typeof rotationSpeed === "number" && Number.isFinite(rotationSpeed)) {
    model.userData.skyboxRotationSpeed = rotationSpeed;
  }
  const skyboxHorizonOffset =
    typeof horizonOffset === "number" && Number.isFinite(horizonOffset)
      ? horizonOffset
      : 0;
  if (skyboxHorizonOffset) {
    model.userData.skyboxHorizonOffset = skyboxHorizonOffset;
  }
  if (typeof yawOffset === "number" && Number.isFinite(yawOffset)) {
    model.rotation.y = yawOffset;
    model.userData.skyboxYawOffset = yawOffset;
  }

  model.traverse((child) => {
    child.frustumCulled = false;
    if (!(child instanceof THREE.Mesh)) return;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const skyMaterials = materials.map((material) => {
      const mappedMaterial = material as MaterialWithTextureMaps;
      const map = mappedMaterial.map ?? mappedMaterial.emissiveMap ?? null;
      if (map && skyboxHorizonOffset) {
        map.offset.y = skyboxHorizonOffset;
        map.needsUpdate = true;
      }
      const skyMaterial = new THREE.MeshBasicMaterial({
        map,
        color: map ? 0xffffff : 0xaac8f2,
        side: THREE.DoubleSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        toneMapped: false,
      });
      material.side = THREE.DoubleSide;
      material.depthWrite = false;
      return skyMaterial;
    });
    child.material = Array.isArray(child.material) ? skyMaterials : skyMaterials[0];
  });

  return model;
}

export function collectSkyboxTintMaterials(
  model: THREE.Object3D,
): THREE.MeshBasicMaterial[] {
  const materials: THREE.MeshBasicMaterial[] = [];
  model.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    const meshMaterials = Array.isArray(child.material)
      ? child.material
      : [child.material];
    for (const material of meshMaterials) {
      if (material instanceof THREE.MeshBasicMaterial) {
        materials.push(material);
      }
    }
  });
  return materials;
}

export function prepareMoonModel(model: THREE.Object3D): {
  model: THREE.Object3D;
  materials: THREE.MeshStandardMaterial[];
} {
  const bounds = new THREE.Box3().setFromObject(model);
  const center = bounds.getCenter(new THREE.Vector3());
  const size = bounds.getSize(new THREE.Vector3());
  const largestAxis = Math.max(size.x, size.y, size.z);
  const scale = largestAxis > 0 ? MOON_SIZE / largestAxis : 1;
  const moonMaterials: THREE.MeshStandardMaterial[] = [];

  model.name = "tellus-moon";
  model.scale.setScalar(scale);
  model.position.set(-center.x * scale, -center.y * scale, -center.z * scale);
  model.renderOrder = -80;

  model.traverse((child) => {
    child.frustumCulled = false;
    if (!(child instanceof THREE.Mesh)) return;
    child.renderOrder = -80;
    child.castShadow = false;
    child.receiveShadow = false;
    const materials = Array.isArray(child.material) ? child.material : [child.material];
    const preparedMaterials = materials.map((material) => {
      const mappedMaterial = material as MaterialWithTextureMaps;
      const moonMaterial = new THREE.MeshStandardMaterial({
        map: mappedMaterial.map ?? null,
        emissiveMap: mappedMaterial.map ?? null,
        color: 0xf4f0e6,
        emissive: 0xffffff,
        emissiveIntensity: 1.8,
        roughness: 0.72,
        metalness: 0,
        transparent: false,
        opacity: 1,
        depthTest: true,
        depthWrite: false,
      });
      moonMaterials.push(moonMaterial);
      return moonMaterial;
    });
    child.material = Array.isArray(child.material)
      ? preparedMaterials
      : preparedMaterials[0];
  });

  return { model, materials: moonMaterials };
}

export async function loadSkyboxModel(primaryUrl = runtimeConfig.skyboxUrl): Promise<
  { model: THREE.Object3D; url: string } | null
> {
  const urls = [
    primaryUrl,
    ...SKYBOX_FALLBACK_URLS,
  ].filter(
    (url, index, all): url is string =>
      typeof url === "string" &&
      url.trim().length > 0 &&
      all.indexOf(url) === index,
  );

  for (const url of urls) {
    try {
      const model = await loadGltfObject(url);
      return { model: prepareSkyboxModel(model, url), url };
    } catch {
      continue;
    }
  }

  return null;
}

export function assetTargetHeight(thing: GeneratedThing): number {
  return worldThingTargetHeight(thing);
}

export async function loadGeneratedModel(
  url: string,
  thing: GeneratedThing,
  rendererIsWebGPU = false,
): Promise<THREE.Object3D> {
  // A raw asset-store URL (e.g. the Hyades 3D backend's https://3d.flobots.xyz/api/view/{id}) has no
  // CORS header, so loading it cross-origin fails silently. Route it through the same-origin /api/assets
  // proxy so generated models render the moment they finish — no manual library re-add. No-op for
  // procedural://, data:, /generated-assets, and already-proxied urls.
  url = proxiedGeneratedModelUrl(url);
  // procedural:// assets build locally (no fetch) and then ride the exact same fit/rotate/place
  // pipeline as a downloaded GLB.
  const proceduralUrl = sanitizeProceduralModelUrl(url);
  if (proceduralUrl) {
    const procedural = buildProceduralModel(proceduralUrl, rendererIsWebGPU);
    if (procedural) {
      procedural.name = `procedural-${thing.id}`;
      const fittedProc = fitModelToHeight(procedural, assetTargetHeight(thing));
      fittedProc.userData = { ...fittedProc.userData, tellusId: thing.id, kind: thing.kind };
      applyThingRotation(fittedProc, thing);
      if (isFreeMovingVehicle(thing)) {
        fittedProc.position.set(thing.position.x, thing.position.y, thing.position.z);
      } else {
        placeObjectAboveGround(fittedProc, thing.position, 0.08);
      }
      return fittedProc;
    }
  }
  // VRM things (auton/Atlantean store models — skin + VRMC_vrm, zero embedded clips) render static
  // through the plain GLTFLoader path; mount them as a real VRM rig instead so a retargeted VRMA idle
  // clip loops by default (or the thing's picked clip). Falls through to the GLB path for plain GLBs
  // (tryLoadVrmObject resolves null) and on any load error.
  try {
    const vrmObject = await tryLoadVrmObject(url, rendererIsWebGPU);
    if (vrmObject) {
      const rig = new VrmObjectRig(vrmObject.vrm, vrmObject.clips);
      const fittedVrm = fitModelToHeight(vrmObject.scene, assetTargetHeight(thing));
      fittedVrm.userData = {
        ...fittedVrm.userData,
        tellusId: thing.id,
        kind: thing.kind,
        vrmObjectRig: rig,
      };
      applyThingRotation(fittedVrm, thing);
      if (isFreeMovingVehicle(thing)) {
        fittedVrm.position.set(thing.position.x, thing.position.y, thing.position.z);
      } else {
        placeObjectAboveGround(fittedVrm, thing.position, 0.08);
      }
      return fittedVrm;
    }
  } catch (error) {
    console.warn("VRM object load failed; falling back to the plain GLB path", error);
  }
  const { model, animations } = await loadGeneratedGltfObject(url);
  model.name = `pixel3d-${thing.id}`;
  const fitted = fitModelToHeight(model, assetTargetHeight(thing));
  fitted.userData = { ...fitted.userData, tellusId: thing.id, kind: thing.kind, sharedGltf: true };
  if (animations.length > 0) {
    fitted.userData.animations = animations;
  }
  applyThingRotation(fitted, thing);
  if (isFreeMovingVehicle(thing)) {
    fitted.position.set(thing.position.x, thing.position.y, thing.position.z);
  } else {
    placeObjectAboveGround(fitted, thing.position, 0.08);
  }
  return fitted;
}

export function createPondWater(options: {
  center?: { x: number; z: number };
  radius?: number;
  waterLevel?: number;
  animated?: boolean;
  waterSettings?: Partial<WaterSettings>;
} = {}): THREE.Group {
  const group = new THREE.Group();
  group.name = "tellus-pond-water";
  group.userData = { waterSurface: true };

  const center = options.center ?? POND_CENTER;
  const radius = options.radius ?? POND_RADIUS;
  const waterLevel = options.waterLevel ?? pondWaterLevel();
  const waterSettings = resolvedWaterSettings(options.waterSettings);
  const palette = WATER_STYLE_COLORS[waterSettings.style];
  const water = new THREE.Mesh(
    new THREE.CircleGeometry(radius, 96),
    options.animated
      ? createBackdropWaterMaterial(waterSettings)
      : new THREE.MeshBasicMaterial({
          color: new THREE.Color(palette.deep).lerp(new THREE.Color(palette.shallow), 0.55),
          transparent: true,
          opacity: Math.min(0.86, waterSettings.opacity * 0.78),
          side: THREE.DoubleSide,
          depthWrite: false,
        }),
  );
  water.name = "tellus-pond-surface";
  water.rotation.x = -Math.PI / 2;
  water.position.set(center.x, waterLevel, center.z);
  water.renderOrder = 2;

  const rippleMaterial = new THREE.MeshBasicMaterial({
    color: palette.foam,
    transparent: true,
    opacity: 0.18 + waterSettings.waveStrength * 0.18,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const rippleGeometry = new THREE.RingGeometry(0.88, 0.93, 96);
  const ripples = new THREE.Group();
  ripples.name = "tellus-pond-ripples";
  ripples.position.set(center.x, waterLevel + 0.035, center.z);
  ripples.rotation.x = -Math.PI / 2;

  for (let i = 0; i < 4; i++) {
    const ripple = new THREE.Mesh(rippleGeometry, rippleMaterial.clone());
    const scale = radius * (0.28 + i * 0.18);
    ripple.scale.setScalar(scale);
    ripple.userData = { rippleIndex: i };
    ripples.add(ripple);
  }

  const shore = new THREE.Mesh(
    new THREE.RingGeometry(radius * 0.96, radius * 1.08, 128),
    new THREE.MeshStandardMaterial({
      color: 0x7b6b48,
      roughness: 0.95,
      metalness: 0,
    }),
  );
  shore.name = "tellus-pond-shore";
  shore.rotation.x = -Math.PI / 2;
  shore.position.set(center.x, waterLevel - 0.035, center.z);

  group.add(shore, water, ripples);
  return group;
}

export function inferGeneratedKind(
  prompt: string,
  agentId: AgentId | "visitor",
): GeneratedKind {
  const lower = prompt.toLowerCase();
  if (
    lower.includes("creature") ||
    lower.includes("companion") ||
    lower.includes("beast") ||
    lower.includes("critter") ||
    lower.includes("animal") ||
    lower.includes("fox") ||
    lower.includes("bird") ||
    lower.includes("eagle") ||
    lower.includes("horse") ||
    lower.includes("unicorn") ||
    lower.includes("dolphin") ||
    lower.includes("orca") ||
    lower.includes("whale") ||
    lower.includes("fish") ||
    lower.includes("reptile")
  )
    return "animal";
  if (
    lower.includes("hut") ||
    lower.includes("house") ||
    lower.includes("workshop") ||
    lower.includes("building") ||
    lower.includes("cottage") ||
    lower.includes("cabin") ||
    lower.includes("tower") ||
    lower.includes("lantern") ||
    lower.includes("bridge") ||
    lower.includes("dock") ||
    lower.includes("boat") ||
    lower.includes("tool") ||
    lower.includes("vehicle") ||
    lower.includes("statue") ||
    lower.includes("object") ||
    lower.includes("prop")
  )
    return "object";
  if (
    lower.includes("tree") ||
    lower.includes("apple") ||
    lower.includes("forest") ||
    lower.includes("sapling")
  )
    return "tree";
  if (
    lower.includes("balloon") ||
    lower.includes("airship") ||
    lower.includes("zeppelin")
  )
    return "balloon";
  if (lower.includes("flower") || lower.includes("moss")) return "flower";
  if (
    lower.includes("stone") ||
    lower.includes("rock") ||
    lower.includes("cairn")
  )
    return "stone";
  if (lower.includes("path") || lower.includes("trail")) return "path";
  if (lower.includes("shrine") || lower.includes("altar")) return "shrine";
  if (lower.includes("seed")) return "seed";
  if (agentId === "sol") return rand(Date.now()) > 0.55 ? "stone" : "shrine";
  if (agentId === "mira") return rand(Date.now()) > 0.5 ? "animal" : "flower";
  return "object";
}

export function promptAccent(prompt: string): number {
  let hash = 0;
  for (let i = 0; i < prompt.length; i++) {
    hash = (hash * 31 + prompt.charCodeAt(i)) >>> 0;
  }
  const hue = hash % 360;
  const color = new THREE.Color().setHSL(hue / 360, 0.55, 0.58);
  return color.getHex();
}

export function kindColor(kind: GeneratedKind, prompt: string): number {
  if (kind === "tree")
    return prompt.toLowerCase().includes("apple") ? 0x68a845 : 0x4f8f3a;
  if (kind === "flower") return 0xe7a0cf;
  if (kind === "stone") return 0x9b9b90;
  if (kind === "animal") return 0xb9824b;
  if (kind === "path") return 0x9a7447;
  if (kind === "shrine") return 0x7d83b5;
  if (kind === "balloon") return 0xf0a65f;
  if (kind === "object") return promptAccent(prompt);
  return 0xd3c17a;
}

export function createGeneratedMesh(thing: GeneratedThing): THREE.Object3D {
  const material = new THREE.MeshStandardMaterial({
    color: thing.color,
    roughness: 0.85,
    metalness: 0,
  });
  const group = new THREE.Group();
  group.name = thing.id;
  group.userData = { tellusId: thing.id, kind: thing.kind };

  if (thing.generationStatus === "failed") {
    group.userData.failedAsset = true;
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.18, 0.9),
      new THREE.MeshStandardMaterial({
        color: 0x4a1616,
        roughness: 0.9,
        metalness: 0,
      }),
    );
    base.position.y = 0.09;
    const markerMaterial = new THREE.MeshStandardMaterial({
      color: 0xff6f4f,
      emissive: 0x4a1008,
      roughness: 0.72,
      metalness: 0,
    });
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.25, 8), markerMaterial);
    post.position.y = 0.82;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.16, 0.16), markerMaterial);
    cap.position.y = 1.52;
    const capCross = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.5), markerMaterial);
    capCross.position.y = 1.52;
    group.add(base, post, cap, capCross);
    placeObjectAboveGround(group, thing.position, 0.04);
    return group;
  }

  if (thing.kind === "tree") {
    const trunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.14, 0.22, 1.6, 8),
      new THREE.MeshStandardMaterial({ color: 0x6d4a2d }),
    );
    trunk.position.y = 0.8 * thing.scale;
    trunk.scale.multiplyScalar(thing.scale);
    const crown = new THREE.Mesh(
      new THREE.SphereGeometry(0.85, 14, 10),
      material,
    );
    crown.position.y = 1.95 * thing.scale;
    crown.scale.setScalar(thing.scale);
    const fruit = new THREE.Mesh(
      new THREE.SphereGeometry(0.09, 8, 6),
      new THREE.MeshStandardMaterial({ color: 0xb9352d }),
    );
    fruit.position.set(
      0.35 * thing.scale,
      2.1 * thing.scale,
      0.32 * thing.scale,
    );
    group.add(trunk, crown, fruit);
  } else if (thing.kind === "flower") {
    const stem = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.035, 0.55, 6),
      new THREE.MeshStandardMaterial({ color: 0x407a35 }),
    );
    stem.position.y = 0.28;
    const bloom = new THREE.Mesh(
      new THREE.SphereGeometry(0.18 * thing.scale, 10, 8),
      material,
    );
    bloom.position.y = 0.62;
    group.add(stem, bloom);
  } else if (thing.kind === "animal") {
    const body = new THREE.Mesh(
      new THREE.SphereGeometry(0.42, 12, 8),
      material,
    );
    body.scale.set(1.5, 0.75, 0.8);
    body.position.y = 0.5;
    const head = new THREE.Mesh(
      new THREE.SphereGeometry(0.26, 10, 8),
      material,
    );
    head.position.set(0.62, 0.58, 0);
    group.add(body, head);
  } else if (thing.kind === "path") {
    const path = new THREE.Mesh(
      new THREE.CylinderGeometry(
        1.2 * thing.scale,
        1.2 * thing.scale,
        0.05,
        18,
      ),
      material,
    );
    path.scale.z = 0.45;
    path.position.y = 0.03;
    group.add(path);
  } else if (thing.kind === "shrine") {
    const base = new THREE.Mesh(
      new THREE.CylinderGeometry(0.75, 0.9, 0.35, 6),
      material,
    );
    base.position.y = 0.18;
    const top = new THREE.Mesh(new THREE.ConeGeometry(0.55, 1.1, 6), material);
    top.position.y = 0.9;
    group.add(base, top);
  } else if (thing.kind === "balloon") {
    const envelope = new THREE.Mesh(
      new THREE.SphereGeometry(0.72 * thing.scale, 24, 16),
      material,
    );
    envelope.scale.set(0.9, 1.18, 0.9);
    envelope.position.y = 2.05 * thing.scale;

    const band = new THREE.Mesh(
      new THREE.TorusGeometry(0.52 * thing.scale, 0.035 * thing.scale, 8, 24),
      new THREE.MeshStandardMaterial({ color: 0xffe2a8, roughness: 0.7 }),
    );
    band.rotation.x = Math.PI / 2;
    band.position.y = 2.02 * thing.scale;

    const basket = new THREE.Mesh(
      new THREE.BoxGeometry(
        0.48 * thing.scale,
        0.34 * thing.scale,
        0.42 * thing.scale,
      ),
      new THREE.MeshStandardMaterial({ color: 0x8b5c35, roughness: 0.9 }),
    );
    basket.position.y = 0.72 * thing.scale;

    const ropeMaterial = new THREE.MeshStandardMaterial({
      color: 0x4c3b2a,
      roughness: 0.8,
    });
    const ropeOffsets = [
      [-0.26, -0.2],
      [0.26, -0.2],
      [-0.26, 0.2],
      [0.26, 0.2],
    ] as const;
    for (const [x, z] of ropeOffsets) {
      const rope = new THREE.Mesh(
        new THREE.CylinderGeometry(
          0.012 * thing.scale,
          0.012 * thing.scale,
          1.08 * thing.scale,
          6,
        ),
        ropeMaterial,
      );
      rope.position.set(x * thing.scale, 1.2 * thing.scale, z * thing.scale);
      group.add(rope);
    }

    group.add(envelope, band, basket);
  } else if (thing.kind === "object") {
    const hash = Array.from(thing.prompt).reduce(
      (sum, char) => sum + char.charCodeAt(0),
      0,
    );
    const accentMaterial = new THREE.MeshStandardMaterial({
      color: promptAccent(`${thing.prompt}:accent`),
      roughness: 0.72,
      metalness: 0.03,
    });
    const base =
      hash % 3 === 0
        ? new THREE.Mesh(
            new THREE.BoxGeometry(
              0.78 * thing.scale,
              0.5 * thing.scale,
              0.78 * thing.scale,
            ),
            material,
          )
        : hash % 3 === 1
          ? new THREE.Mesh(
              new THREE.IcosahedronGeometry(0.48 * thing.scale, 1),
              material,
            )
          : new THREE.Mesh(
              new THREE.CylinderGeometry(
                0.46 * thing.scale,
                0.58 * thing.scale,
                0.62 * thing.scale,
                7,
              ),
              material,
            );
    base.position.y = 0.36 * thing.scale;

    const crown =
      hash % 2 === 0
        ? new THREE.Mesh(
            new THREE.ConeGeometry(0.4 * thing.scale, 0.8 * thing.scale, 7),
            accentMaterial,
          )
        : new THREE.Mesh(
            new THREE.SphereGeometry(0.32 * thing.scale, 12, 8),
            accentMaterial,
          );
    crown.position.y = 0.98 * thing.scale;

    const marker = new THREE.Mesh(
      new THREE.TorusGeometry(0.48 * thing.scale, 0.025 * thing.scale, 8, 28),
      new THREE.MeshStandardMaterial({
        color: 0xf7ead1,
        roughness: 0.55,
        metalness: 0.02,
      }),
    );
    marker.rotation.x = Math.PI / 2;
    marker.position.y = 0.18 * thing.scale;

    group.add(base, crown, marker);
  } else {
    const seed = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.35 * thing.scale, 1),
      material,
    );
    seed.position.y = 0.32;
    group.add(seed);
  }

  if (isFreeMovingVehicle(thing)) {
    group.position.set(thing.position.x, thing.position.y, thing.position.z);
  } else {
    placeObjectAboveGround(group, thing.position, 0.025);
  }
  const targetHeight = assetTargetHeight(thing);
  const bounds = new THREE.Box3().setFromObject(group);
  const size = bounds.getSize(new THREE.Vector3());
  if (size.y > 0) {
    const scale = clamp(targetHeight / size.y, 0.45, 3.6);
    group.scale.multiplyScalar(scale);
    if (isFreeMovingVehicle(thing)) {
      group.position.set(thing.position.x, thing.position.y, thing.position.z);
    } else {
      placeObjectAboveGround(group, thing.position, 0.025);
    }
  }
  applyThingRotation(group, thing);
  return group;
}

export function createGenerationSwirl(thing: GeneratedThing): THREE.Object3D {
  const group = new THREE.Group();
  group.name = thing.id;
  group.userData = { tellusId: thing.id, kind: thing.kind, generatingSwirl: true };

  const primary = new THREE.Color(thing.color);
  const light = primary.clone().lerp(new THREE.Color(0xffffff), 0.58);
  const material = new THREE.MeshBasicMaterial({
    color: light,
    transparent: true,
    opacity: 0.78,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });

  const ringGeometry = new THREE.TorusGeometry(0.52, 0.018, 8, 56);
  for (let i = 0; i < 3; i++) {
    const ring = new THREE.Mesh(ringGeometry, material.clone());
    ring.userData = { swirlRing: i };
    ring.rotation.x = Math.PI / 2 + i * 0.62;
    ring.rotation.y = i * 0.48;
    ring.position.y = 0.55 + i * 0.22;
    ring.scale.setScalar(0.72 + i * 0.18);
    group.add(ring);
  }

  const sparkMaterial = new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.86,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const sparkGeometry = new THREE.SphereGeometry(0.045, 8, 6);
  for (let i = 0; i < 7; i++) {
    const spark = new THREE.Mesh(sparkGeometry, sparkMaterial.clone());
    const angle = (i / 7) * Math.PI * 2;
    spark.userData = { swirlSpark: i, baseAngle: angle };
    spark.position.set(Math.cos(angle) * 0.56, 0.72 + i * 0.09, Math.sin(angle) * 0.56);
    group.add(spark);
  }

  group.position.set(thing.position.x, thing.position.y + 0.08, thing.position.z);
  group.userData.baseY = group.position.y;
  return group;
}

export function shouldShowGenerationSwirl(thing: GeneratedThing): boolean {
  if (thing.generationStatus === "queued" || thing.generationStatus === "generating") {
    return true;
  }
  return false;
}

export function applyThingRotation(object: THREE.Object3D, thing: GeneratedThing): void {
  object.rotation.set(thing.rotationX ?? 0, thing.rotationY, thing.rotationZ ?? 0);
}
