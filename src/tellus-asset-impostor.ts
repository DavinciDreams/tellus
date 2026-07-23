import * as THREE from "three";
import type { AssetImpostorBounds, AssetImpostorVariant } from "./tellus-types";
import {
  assetStoreImpostorModelUrl,
  tellusAssetLibraryUrl,
} from "./tellus-urls-identity";

export interface AssetStoreImpostorTemplate {
  assetId: string;
  texture: THREE.Texture;
  gridSizeX: number;
  gridSizeY: number;
  octahedronType: "hemi" | "full";
  normalizedCenterY: number;
  normalizedDiameter: number;
  metadata: AssetImpostorVariant;
}

export interface AssetStoreImpostorInstanceOptions {
  scale?: number;
  yaw?: number;
  tint?: THREE.ColorRepresentation;
}

const templatePromises = new Map<string, Promise<AssetStoreImpostorTemplate | null>>();
const up = new THREE.Vector3(0, 1, 0);

const recordOf = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;

const finiteNumber = (record: Record<string, unknown>, ...keys: string[]): number | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "number" && Number.isFinite(value)) return value;
  }
  return undefined;
};

const stringValue = (record: Record<string, unknown>, ...keys: string[]): string | undefined => {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
};

const vectorArray = (value: unknown): number[] | undefined => {
  if (!Array.isArray(value) || value.length < 3) return undefined;
  const out = value.slice(0, 3);
  return out.every((item) => typeof item === "number" && Number.isFinite(item))
    ? out as number[]
    : undefined;
};

const parseBounds = (value: unknown): AssetImpostorBounds | undefined => {
  const record = recordOf(value);
  if (!record) return undefined;
  const bounds: AssetImpostorBounds = {
    min: vectorArray(record.min),
    max: vectorArray(record.max),
    center: vectorArray(record.center),
    size: vectorArray(record.size),
    max_dimension: finiteNumber(record, "max_dimension", "maxDimension"),
    effective_radius: finiteNumber(record, "effective_radius", "effectiveRadius"),
  };
  return bounds.min || bounds.max || bounds.center || bounds.size || bounds.max_dimension
    ? bounds
    : undefined;
};

/** Normalize the Asset Store's flattened or settings-backed impostor payload. */
export const normalizeAssetImpostorVariant = (value: unknown): AssetImpostorVariant | undefined => {
  const record = recordOf(value);
  if (!record) return undefined;
  const settings = recordOf(record.settings) ?? {};
  const readNumber = (...keys: string[]) => finiteNumber(record, ...keys) ?? finiteNumber(settings, ...keys);
  const readString = (...keys: string[]) => stringValue(record, ...keys) ?? stringValue(settings, ...keys);
  const type = readString("type");
  if (type !== "octahedral_atlas" && type !== "billboard") return undefined;
  const gridSizeX = type === "billboard" ? 1 : readNumber("grid_size_x", "gridSizeX");
  const gridSizeY = type === "billboard" ? 1 : readNumber("grid_size_y", "gridSizeY");
  if (!gridSizeX || !gridSizeY || gridSizeX < 1 || gridSizeY < 1) return undefined;
  const octahedronType = readString("octahedron_type", "octahedronType");
  const bounds = parseBounds(record.bounds) ?? parseBounds(settings.bounds);
  return {
    file_format: readString("file_format", "fileFormat", "format"),
    status: readString("status"),
    type,
    width: readNumber("width"),
    height: readNumber("height"),
    atlas_width: readNumber("atlas_width", "atlasWidth"),
    atlas_height: readNumber("atlas_height", "atlasHeight"),
    grid_size_x: Math.floor(gridSizeX),
    grid_size_y: Math.floor(gridSizeY),
    cell_size: readNumber("cell_size", "cellSize"),
    view_count: readNumber("view_count", "viewCount"),
    octahedron_type: octahedronType === "full" ? "full" : "hemi",
    source: readString("source"),
    role: readString("role"),
    url: readString("url"),
    download_url: readString("download_url", "downloadUrl"),
    bounds,
  };
};

const normalizedDimensions = (metadata: AssetImpostorVariant) => {
  const bounds = metadata.bounds;
  const size = bounds?.size;
  const maxDimension = bounds?.max_dimension ?? (size ? Math.max(...size) : 1);
  const safeMaxDimension = Math.max(maxDimension || 1, 1e-6);
  const centerY = bounds?.center?.[1];
  const minY = bounds?.min?.[1];
  const normalizedCenterY = typeof centerY === "number" && typeof minY === "number"
    ? (centerY - minY) / safeMaxDimension
    : 0.5;
  const normalizedDiameter = bounds?.effective_radius
    ? (bounds.effective_radius * 2) / safeMaxDimension
    : 1.15;
  return {
    normalizedCenterY: THREE.MathUtils.clamp(normalizedCenterY, -2, 3),
    normalizedDiameter: THREE.MathUtils.clamp(normalizedDiameter, 0.5, 3),
  };
};

const impostorTextureUrl = (assetId: string, metadata: AssetImpostorVariant): string => {
  const candidate = metadata.url;
  const path = candidate && /^\/(?:__hyades\/)?api\/assets\//i.test(candidate)
    ? candidate.replace(/^\/__hyades(?=\/api\/)/i, "")
    : assetStoreImpostorModelUrl(assetId);
  return tellusAssetLibraryUrl(path);
};

export const loadAssetStoreImpostor = (
  assetId: string,
): Promise<AssetStoreImpostorTemplate | null> => {
  const cached = templatePromises.get(assetId);
  if (cached) return cached;
  const promise: Promise<AssetStoreImpostorTemplate | null> = (async () => {
    try {
      const response = await fetch(
        tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(assetId)}`),
        { cache: "force-cache" },
      );
      if (!response.ok) return null;
      const payload = await response.json() as unknown;
      const root = recordOf(payload);
      const model = recordOf(root?.model) ?? root;
      const metadata = normalizeAssetImpostorVariant(model?.impostor);
      if (!metadata || metadata.status === "failed") return null;
      const texture = await new THREE.TextureLoader().loadAsync(impostorTextureUrl(assetId, metadata));
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.wrapS = THREE.ClampToEdgeWrapping;
      texture.wrapT = THREE.ClampToEdgeWrapping;
      texture.minFilter = THREE.LinearMipmapLinearFilter;
      texture.magFilter = THREE.LinearFilter;
      texture.generateMipmaps = true;
      texture.needsUpdate = true;
      const dimensions = normalizedDimensions(metadata);
      return {
        assetId,
        texture,
        gridSizeX: metadata.grid_size_x ?? 1,
        gridSizeY: metadata.grid_size_y ?? 1,
        octahedronType: metadata.octahedron_type === "full" ? "full" as const : "hemi" as const,
        ...dimensions,
        metadata,
      };
    } catch (error) {
      console.warn("Tellus asset impostor hydration failed", assetId, error);
      return null;
    }
  })();
  templatePromises.set(assetId, promise);
  return promise;
};

export interface ImpostorViewBlend {
  faceIndices: THREE.Vector3;
  faceWeights: THREE.Vector3;
}

/** Exact inverse of the Asset Store's HEMI/FULL octahedral view encoding. */
export const assetImpostorViewBlend = (
  direction: THREE.Vector3,
  gridSizeX: number,
  gridSizeY: number,
  octahedronType: "hemi" | "full",
): ImpostorViewBlend => {
  const normalized = direction.clone().normalize();
  if (octahedronType === "hemi" && normalized.y < 0) normalized.y *= -1;
  const denominator = Math.max(
    Math.abs(normalized.x) + Math.abs(normalized.y) + Math.abs(normalized.z),
    1e-6,
  );
  let px = normalized.x / denominator;
  let pz = normalized.z / denominator;
  if (octahedronType === "full" && normalized.y < 0) {
    const oldX = px;
    const oldZ = pz;
    px = Math.sign(oldX || 1) * (1 - Math.abs(oldZ));
    pz = Math.sign(oldZ || 1) * (1 - Math.abs(oldX));
  }
  const u = octahedronType === "hemi"
    ? THREE.MathUtils.clamp((1 + pz + px) / 2, 0, 1)
    : THREE.MathUtils.clamp(px * 0.5 + 0.5, 0, 1);
  const v = octahedronType === "hemi"
    ? THREE.MathUtils.clamp((1 + pz - px) / 2, 0, 1)
    : THREE.MathUtils.clamp(pz * 0.5 + 0.5, 0, 1);
  const fx = THREE.MathUtils.clamp(u * gridSizeX - 0.5, 0, gridSizeX - 1);
  const fy = THREE.MathUtils.clamp(v * gridSizeY - 0.5, 0, gridSizeY - 1);
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const x1 = Math.min(gridSizeX - 1, x0 + 1);
  const y1 = Math.min(gridSizeY - 1, y0 + 1);
  const wx = fx - x0;
  const wy = fy - y0;
  const weights = new THREE.Vector3(
    (1 - wx) * (1 - wy),
    wx * (1 - wy),
    (1 - wx) * wy,
  );
  weights.multiplyScalar(1 / Math.max(weights.x + weights.y + weights.z, 1e-6));
  return {
    faceIndices: new THREE.Vector3(
      y0 * gridSizeX + x0,
      y0 * gridSizeX + x1,
      y1 * gridSizeX + x0,
    ),
    faceWeights: weights,
  };
};

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D atlas;
  uniform vec2 gridSize;
  uniform vec2 atlasSize;
  uniform vec3 faceIndices;
  uniform vec3 faceWeights;
  uniform vec3 tint;
  varying vec2 vUv;

  vec2 atlasUv(float flatIndex) {
    float row = floor(flatIndex / gridSize.x);
    float col = flatIndex - row * gridSize.x;
    vec2 cellPixels = max(atlasSize / gridSize, vec2(1.0));
    vec2 inset = 0.5 / cellPixels;
    vec2 cellUv = mix(inset, vec2(1.0) - inset, vUv);
    return vec2(
      (col + cellUv.x) / gridSize.x,
      1.0 - (row + 1.0 - cellUv.y) / gridSize.y
    );
  }

  void main() {
    vec4 a = texture2D(atlas, atlasUv(faceIndices.x));
    vec4 b = texture2D(atlas, atlasUv(faceIndices.y));
    vec4 c = texture2D(atlas, atlasUv(faceIndices.z));
    vec3 alphaWeights = faceWeights * vec3(a.a, b.a, c.a);
    float total = alphaWeights.x + alphaWeights.y + alphaWeights.z;
    if (total < 0.08) discard;
    vec3 rgb = (a.rgb * alphaWeights.x + b.rgb * alphaWeights.y + c.rgb * alphaWeights.z) / total;
    gl_FragColor = vec4(rgb * tint, clamp(total, 0.0, 1.0));
  }
`;

export const createAssetStoreImpostorInstance = (
  template: AssetStoreImpostorTemplate,
  options: AssetStoreImpostorInstanceOptions = {},
) => {
  const scale = options.scale ?? 1;
  const yaw = options.yaw ?? 0;
  const geometry = new THREE.PlaneGeometry(
    template.normalizedDiameter * scale,
    template.normalizedDiameter * scale,
  );
  const textureImage = template.texture.image as { width?: number; height?: number } | undefined;
  const atlasWidth = template.metadata.atlas_width ?? template.metadata.width ?? textureImage?.width ?? 1;
  const atlasHeight = template.metadata.atlas_height ?? template.metadata.height ?? textureImage?.height ?? 1;
  const material = new THREE.ShaderMaterial({
    uniforms: {
      atlas: { value: template.texture },
      gridSize: { value: new THREE.Vector2(template.gridSizeX, template.gridSizeY) },
      atlasSize: { value: new THREE.Vector2(atlasWidth, atlasHeight) },
      faceIndices: { value: new THREE.Vector3() },
      faceWeights: { value: new THREE.Vector3(1, 0, 0) },
      tint: { value: new THREE.Color(options.tint ?? 0xffffff) },
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    alphaTest: 0.08,
    depthTest: true,
    depthWrite: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `asset-impostor-${template.assetId}`;
  mesh.castShadow = false;
  mesh.receiveShadow = false;
  const cameraPosition = new THREE.Vector3();
  const meshPosition = new THREE.Vector3();
  const direction = new THREE.Vector3();
  const update = (camera: THREE.Camera) => {
    camera.getWorldPosition(cameraPosition);
    mesh.getWorldPosition(meshPosition);
    direction.subVectors(cameraPosition, meshPosition);
    if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
    direction.applyAxisAngle(up, -yaw);
    const view = assetImpostorViewBlend(
      direction,
      template.gridSizeX,
      template.gridSizeY,
      template.octahedronType,
    );
    material.uniforms.faceIndices!.value.copy(view.faceIndices);
    material.uniforms.faceWeights!.value.copy(view.faceWeights);
    mesh.lookAt(cameraPosition);
  };
  mesh.onBeforeRender = (_renderer, _scene, camera) => update(camera);
  return {
    mesh,
    normalizedCenterY: template.normalizedCenterY,
    update,
    dispose: () => {
      geometry.dispose();
      material.dispose();
    },
  };
};
