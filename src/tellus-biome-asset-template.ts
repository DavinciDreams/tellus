import * as THREE from "three";
import { createGltfLoader } from "./tellus-generation-client";
import type {
  TellusBiomeAssetLodPreference,
  TellusBiomeAssetTemplate,
} from "./tellus-biome-mix";
import {
  assetStoreGameOptimizedModelUrl,
  tellusAssetLibraryUrl,
} from "./tellus-urls-identity";

const MAX_TEMPLATE_VERTICES = 20_000;
const templatePromises = new Map<string, Promise<TellusBiomeAssetTemplate | null>>();

const candidatePaths = (assetId: string, preference: TellusBiomeAssetLodPreference): string[] => {
  const order: TellusBiomeAssetLodPreference[] = preference === "lod3"
    ? ["lod3", "lod2", "lod1", "game-optimized"]
    : preference === "lod2"
      ? ["lod2", "lod1", "game-optimized"]
      : preference === "lod1"
        ? ["lod1", "game-optimized"]
        : preference === "lod0"
          ? ["lod0", "game-optimized"]
          : preference === "impostor"
            // The impostor endpoint is a WebP atlas, not glTF. Keep a real mesh
            // as the near/mid fallback while the far tier loads the atlas separately.
            ? ["lod3", "lod2", "game-optimized"]
            : ["game-optimized"];
  return [...new Set(order.map((lod) => {
    if (lod === "game-optimized") return assetStoreGameOptimizedModelUrl(assetId);
    return `/api/assets/model/${encodeURIComponent(assetId)}/lod/${lod.slice(3)}`;
  }))];
};

const normalizedAsset = (model: THREE.Object3D): THREE.Object3D => {
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);
  model.position.set(-center.x, -box.min.y, -center.z);
  const root = new THREE.Group();
  root.add(model);
  root.scale.setScalar(1 / Math.max(size.x, size.y, size.z, 1e-4));
  root.updateMatrixWorld(true);
  root.position.y -= new THREE.Box3().setFromObject(root).min.y;
  root.updateMatrixWorld(true);
  return root;
};

const meshColor = (mesh: THREE.Mesh, triangle: number): THREE.Color => {
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const offset = triangle * 3;
  const group = mesh.geometry.groups.find((item) => offset >= item.start && offset < item.start + item.count);
  const material = materials[group?.materialIndex ?? 0] ?? materials[0];
  const color = material && "color" in material
    ? (material as THREE.Material & { color: THREE.Color }).color
    : undefined;
  return color?.isColor ? color : new THREE.Color(0x6b7f4c);
};

const bakeTemplate = (object: THREE.Object3D): TellusBiomeAssetTemplate => {
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || positions.length / 3 >= MAX_TEMPLATE_VERTICES) return;
    const positionAttr = mesh.geometry.getAttribute("position");
    if (!positionAttr) return;
    const normalAttr = mesh.geometry.getAttribute("normal");
    const colorAttr = mesh.geometry.getAttribute("color");
    const indexAttr = mesh.geometry.getIndex();
    const triangleCount = Math.floor((indexAttr?.count ?? positionAttr.count) / 3);
    const remainingTriangles = Math.max(1, Math.floor((MAX_TEMPLATE_VERTICES - positions.length / 3) / 3));
    const stride = Math.max(1, Math.ceil(triangleCount / remainingTriangles));
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    for (let triangle = 0; triangle < triangleCount && positions.length / 3 + 3 <= MAX_TEMPLATE_VERTICES; triangle += stride) {
      const color = meshColor(mesh, triangle);
      for (let corner = 0; corner < 3; corner++) {
        const sourceIndex = indexAttr ? indexAttr.getX(triangle * 3 + corner) : triangle * 3 + corner;
        position.fromBufferAttribute(positionAttr, sourceIndex).applyMatrix4(mesh.matrixWorld);
        if (normalAttr) normal.fromBufferAttribute(normalAttr, sourceIndex).applyMatrix3(normalMatrix).normalize();
        else normal.set(0, 1, 0);
        positions.push(position.x, position.y, position.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(
          colorAttr?.getX(sourceIndex) ?? color.r,
          colorAttr?.getY(sourceIndex) ?? color.g,
          colorAttr?.getZ(sourceIndex) ?? color.b,
        );
        indices.push(indices.length);
      }
    }
  });
  const vertexCount = positions.length / 3;
  if (vertexCount === 0) throw new Error("Biome asset did not contain mesh geometry");
  return { version: 1, vertexCount, positions, normals, colors, indices };
};

export const loadBiomeAssetTemplate = (
  assetId: string,
  preference: TellusBiomeAssetLodPreference = "lod2",
): Promise<TellusBiomeAssetTemplate | null> => {
  const key = `${assetId}:${preference}`;
  const cached = templatePromises.get(key);
  if (cached) return cached;
  const promise = (async () => {
    let lastError: unknown;
    for (const path of candidatePaths(assetId, preference)) {
      try {
        const gltf = await createGltfLoader().loadAsync(tellusAssetLibraryUrl(path));
        return bakeTemplate(normalizedAsset(gltf.scene));
      } catch (error) {
        lastError = error;
      }
    }
    console.warn("Tellus biome asset hydration failed", assetId, lastError);
    return null;
  })();
  templatePromises.set(key, promise);
  return promise;
};
