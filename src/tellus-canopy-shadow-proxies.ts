import * as THREE from "three";

export type CanopyShadowKind = "broadleaf" | "conifer";

export type CanopyShadowProxy = {
  kind: CanopyShadowKind;
  matrix: THREE.Matrix4;
  trunkMatrix: THREE.Matrix4;
  x: number;
  z: number;
};

export type CanopyShadowProxyPoolDiagnostics = {
  budget: number;
  broadleaf: number;
  conifer: number;
  trunks: number;
  total: number;
  refreshes: number;
};

export type CanopyShadowSelectionOptions = {
  camera?: THREE.Camera | null;
  maxDistance?: number;
  nearDistance?: number;
  ndcMargin?: number;
};

export type CanopyShadowProxySyncResult = {
  changed: boolean;
  bounds: THREE.Box3 | null;
  signature: string;
};

const proxyBounds = new THREE.Box3();
const proxyPosition = new THREE.Vector3();
const proxyRotation = new THREE.Quaternion();
const proxyScale = new THREE.Vector3();
const proxyMinimum = new THREE.Vector3();
const proxyMaximum = new THREE.Vector3();
const proxyWorldMatrix = new THREE.Matrix4();
const proxyViewPosition = new THREE.Vector3();
const proxyProjectedPosition = new THREE.Vector3();
const proxyFrustum = new THREE.Frustum();
const proxyProjectionView = new THREE.Matrix4();
const proxySelectionBounds = new THREE.Box3();
const proxyCanopyLocalBounds = new THREE.Box3(
  new THREE.Vector3(-1, -1, -1),
  new THREE.Vector3(1, 1, 1),
);
const proxyTrunkLocalBounds = new THREE.Box3(
  new THREE.Vector3(-1, 0, -1),
  new THREE.Vector3(1, 1, 1),
);

export function canopyShadowViewTurned(
  previous: THREE.Vector3 | null,
  current: THREE.Vector3,
  thresholdRadians = THREE.MathUtils.degToRad(8),
): boolean {
  if (!previous || previous.lengthSq() < 1e-8 || current.lengthSq() < 1e-8) return true;
  const cosine = previous.dot(current) / Math.sqrt(previous.lengthSq() * current.lengthSq());
  return cosine <= Math.cos(Math.max(0, thresholdRadians));
}

export function canopyShadowProxyBounds(
  proxy: CanopyShadowProxy,
  target = new THREE.Box3(),
): THREE.Box3 {
  target.copy(proxyCanopyLocalBounds).applyMatrix4(proxy.matrix);
  proxySelectionBounds.copy(proxyTrunkLocalBounds).applyMatrix4(proxy.trunkMatrix);
  return target.union(proxySelectionBounds);
}

function proxyFromWorldBounds(
  worldBounds: THREE.Box3,
  kind: CanopyShadowKind,
  treeBase?: THREE.Vector3,
): CanopyShadowProxy | null {
  if (worldBounds.isEmpty()) return null;
  const center = worldBounds.getCenter(new THREE.Vector3());
  const size = worldBounds.getSize(new THREE.Vector3());
  const scale = kind === "conifer"
    ? new THREE.Vector3(
        Math.max(0.45, Math.max(size.x, size.z) * 0.5),
        Math.max(0.6, size.y * 0.5),
        Math.max(0.45, Math.max(size.x, size.z) * 0.5),
      )
    : new THREE.Vector3(
        Math.max(0.45, size.x * 0.5),
        Math.max(0.45, size.y * 0.5),
        Math.max(0.45, size.z * 0.5),
      );
  const base = treeBase ?? new THREE.Vector3(center.x, worldBounds.min.y, center.z);
  const canopyLift = Math.max(0, worldBounds.min.y - base.y);
  const trunkHeight = Math.max(
    0.6,
    canopyLift > size.y * 0.2
      ? canopyLift + size.y * 0.18
      : size.y * 0.62,
  );
  const trunkRadius = THREE.MathUtils.clamp(Math.max(size.x, size.z) * 0.035, 0.12, 0.5);
  return {
    kind,
    matrix: new THREE.Matrix4().compose(center, new THREE.Quaternion(), scale),
    trunkMatrix: new THREE.Matrix4().compose(
      base,
      new THREE.Quaternion(),
      new THREE.Vector3(trunkRadius, trunkHeight, trunkRadius),
    ),
    x: center.x,
    z: center.z,
  };
}

/** Fits one stable, low-poly shadow silhouette to a tree's foliage organs. */
export function fitCanopyShadowProxy(
  organMatrices: readonly THREE.Matrix4[],
  kind: CanopyShadowKind,
  treeMatrix?: THREE.Matrix4,
): CanopyShadowProxy | null {
  if (organMatrices.length === 0) return null;
  proxyBounds.makeEmpty();
  for (const organMatrix of organMatrices) {
    proxyWorldMatrix.copy(organMatrix);
    if (treeMatrix) proxyWorldMatrix.premultiply(treeMatrix);
    proxyWorldMatrix.decompose(proxyPosition, proxyRotation, proxyScale);
    const padding = Math.max(
      0.18,
      Math.max(Math.abs(proxyScale.x), Math.abs(proxyScale.y), Math.abs(proxyScale.z)) * 0.7,
    );
    proxyMinimum.copy(proxyPosition).addScalar(-padding);
    proxyMaximum.copy(proxyPosition).addScalar(padding);
    proxyBounds.expandByPoint(proxyMinimum);
    proxyBounds.expandByPoint(proxyMaximum);
  }
  if (proxyBounds.isEmpty()) return null;
  const treeBase = treeMatrix
    ? new THREE.Vector3().setFromMatrixPosition(treeMatrix)
    : undefined;
  return proxyFromWorldBounds(proxyBounds, kind, treeBase);
}

/** Gives cold-loading silhouettes the same shadow contract as their detailed replacements. */
export function fitCanopyShadowProxyFromBounds(
  localBounds: THREE.Box3,
  kind: CanopyShadowKind,
  treeMatrix: THREE.Matrix4,
): CanopyShadowProxy | null {
  const worldBounds = localBounds.clone().applyMatrix4(treeMatrix);
  return proxyFromWorldBounds(
    worldBounds,
    kind,
    new THREE.Vector3().setFromMatrixPosition(treeMatrix),
  );
}

export function nearestCanopyShadowProxies(
  proxies: readonly CanopyShadowProxy[],
  px: number,
  pz: number,
  budget: number,
): CanopyShadowProxy[] {
  const limit = Math.max(0, Math.min(proxies.length, Math.floor(budget)));
  if (limit === 0) return [];
  return [...proxies]
    .sort((a, b) =>
      (a.x - px) ** 2 + (a.z - pz) ** 2 - ((b.x - px) ** 2 + (b.z - pz) ** 2)
    )
    .slice(0, limit);
}

/** Prioritizes the camera cone, retaining only a small near-player reserve behind the camera. */
export function viewPrioritizedCanopyShadowProxies(
  proxies: readonly CanopyShadowProxy[],
  px: number,
  pz: number,
  budget: number,
  options: CanopyShadowSelectionOptions = {},
): CanopyShadowProxy[] {
  const limit = Math.max(0, Math.min(proxies.length, Math.floor(budget)));
  if (limit === 0) return [];
  const camera = options.camera;
  if (!camera) return nearestCanopyShadowProxies(proxies, px, pz, limit);

  const maxDistanceSq = Math.max(1, options.maxDistance ?? 88) ** 2;
  const nearDistanceSq = Math.max(0, options.nearDistance ?? 22) ** 2;
  const margin = Math.max(0, options.ndcMargin ?? 0.18);
  proxyProjectionView.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
  proxyFrustum.setFromProjectionMatrix(proxyProjectionView);
  const candidates = proxies
    .map((proxy) => {
      const distanceSq = (proxy.x - px) ** 2 + (proxy.z - pz) ** 2;
      proxyViewPosition.setFromMatrixPosition(proxy.matrix);
      proxyProjectedPosition.copy(proxyViewPosition).project(camera);
      const visible =
        distanceSq <= maxDistanceSq &&
        (
          proxyFrustum.intersectsBox(canopyShadowProxyBounds(proxy, proxyBounds)) ||
          (
            proxyProjectedPosition.z >= -1 && proxyProjectedPosition.z <= 1 &&
            Math.abs(proxyProjectedPosition.x) <= 1 + margin &&
            Math.abs(proxyProjectedPosition.y) <= 1 + margin
          )
        );
      return { proxy, distanceSq, visible };
    })
    .filter((candidate) => candidate.distanceSq <= maxDistanceSq);
  const visible = candidates
    .filter((candidate) => candidate.visible)
    .sort((a, b) => a.distanceSq - b.distanceSq);
  const nearby = candidates
    .filter((candidate) => !candidate.visible && candidate.distanceSq <= nearDistanceSq)
    .sort((a, b) => a.distanceSq - b.distanceSq);
  return [...visible, ...nearby].slice(0, limit).map((candidate) => candidate.proxy);
}

export function canopyShadowSelectionSignature(
  proxies: readonly CanopyShadowProxy[],
): string {
  if (proxies.length === 0) return "empty";
  return proxies
    .map((proxy) => [
      proxy.kind,
      ...proxy.matrix.elements.map((value) => Math.round(value * 1_000)),
      ...proxy.trunkMatrix.elements.map((value) => Math.round(value * 1_000)),
    ].join(":"))
    .sort()
    .join("|");
}

function canopyShadowSelectionBounds(
  proxies: readonly CanopyShadowProxy[],
): THREE.Box3 | null {
  if (proxies.length === 0) return null;
  const bounds = new THREE.Box3();
  for (const proxy of proxies) {
    bounds.union(canopyShadowProxyBounds(proxy, proxyBounds));
  }
  return bounds;
}

/** Two global instance pools keep all procedural-tree canopy shadows to at most two draw calls. */
export class CanopyShadowProxyPool {
  private readonly root = new THREE.Group();
  private readonly material = new THREE.MeshBasicMaterial({
    color: 0x000000,
    colorWrite: false,
    depthWrite: false,
  });
  private readonly broadleafGeometry = new THREE.IcosahedronGeometry(1, 1);
  private readonly coniferGeometry = new THREE.ConeGeometry(1, 2, 8, 1);
  private readonly trunkGeometry = new THREE.CylinderGeometry(1, 1, 1, 6, 1).translate(0, 0.5, 0);
  private readonly broadleafMesh: THREE.InstancedMesh;
  private readonly coniferMesh: THREE.InstancedMesh;
  private readonly trunkMesh: THREE.InstancedMesh;
  private currentBudget = 0;
  private refreshes = 0;
  private selectionSignature = "";
  private selectionBounds: THREE.Box3 | null = null;

  constructor(scene: THREE.Scene, private readonly capacity: number) {
    const safeCapacity = Math.max(1, Math.floor(capacity));
    this.root.name = "tellus-canopy-shadow-proxies";
    this.broadleafMesh = this.createMesh(this.broadleafGeometry, safeCapacity, "broadleaf");
    this.coniferMesh = this.createMesh(this.coniferGeometry, safeCapacity, "conifer");
    this.trunkMesh = this.createMesh(this.trunkGeometry, safeCapacity, "trunk");
    this.root.add(this.broadleafMesh, this.coniferMesh, this.trunkMesh);
    scene.add(this.root);
  }

  private createMesh(
    geometry: THREE.BufferGeometry,
    capacity: number,
    kind: CanopyShadowKind | "trunk",
  ): THREE.InstancedMesh {
    const mesh = new THREE.InstancedMesh(geometry, this.material, capacity);
    mesh.name = `tellus-canopy-shadow-${kind}`;
    mesh.count = 0;
    mesh.castShadow = true;
    mesh.receiveShadow = false;
    mesh.frustumCulled = false;
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    return mesh;
  }

  sync(
    proxies: readonly CanopyShadowProxy[],
    px: number,
    pz: number,
    budget: number,
    options: CanopyShadowSelectionOptions = {},
  ): CanopyShadowProxySyncResult {
    this.currentBudget = Math.max(0, Math.min(this.capacity, Math.floor(budget)));
    const selected = viewPrioritizedCanopyShadowProxies(
      proxies,
      px,
      pz,
      this.currentBudget,
      options,
    );
    const signature = canopyShadowSelectionSignature(selected);
    if (signature === this.selectionSignature) {
      return {
        changed: false,
        bounds: this.selectionBounds?.clone() ?? null,
        signature,
      };
    }
    const broadleaf = selected.filter((proxy) => proxy.kind === "broadleaf");
    const conifer = selected.filter((proxy) => proxy.kind === "conifer");
    this.write(this.broadleafMesh, broadleaf);
    this.write(this.coniferMesh, conifer);
    this.write(this.trunkMesh, selected, (proxy) => proxy.trunkMatrix);
    this.selectionSignature = signature;
    this.selectionBounds = canopyShadowSelectionBounds(selected);
    this.refreshes++;
    return {
      changed: true,
      bounds: this.selectionBounds?.clone() ?? null,
      signature,
    };
  }

  private write(
    mesh: THREE.InstancedMesh,
    proxies: readonly CanopyShadowProxy[],
    matrixFor: (proxy: CanopyShadowProxy) => THREE.Matrix4 = (proxy) => proxy.matrix,
  ): void {
    mesh.count = proxies.length;
    proxies.forEach((proxy, index) => mesh.setMatrixAt(index, matrixFor(proxy)));
    mesh.instanceMatrix.needsUpdate = true;
  }

  diagnostics(): CanopyShadowProxyPoolDiagnostics {
    return {
      budget: this.currentBudget,
      broadleaf: this.broadleafMesh.count,
      conifer: this.coniferMesh.count,
      trunks: this.trunkMesh.count,
      total: this.broadleafMesh.count + this.coniferMesh.count,
      refreshes: this.refreshes,
    };
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.root.clear();
    this.broadleafMesh.dispose();
    this.coniferMesh.dispose();
    this.trunkMesh.dispose();
    this.broadleafGeometry.dispose();
    this.coniferGeometry.dispose();
    this.trunkGeometry.dispose();
    this.material.dispose();
  }
}
