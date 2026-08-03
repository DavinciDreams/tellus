import * as THREE from "three";

export type CanopyShadowKind = "broadleaf" | "conifer";

export type CanopyShadowProxy = {
  kind: CanopyShadowKind;
  matrix: THREE.Matrix4;
  x: number;
  z: number;
};

export type CanopyShadowProxyPoolDiagnostics = {
  budget: number;
  broadleaf: number;
  conifer: number;
  total: number;
  refreshes: number;
};

const proxyBounds = new THREE.Box3();
const proxyPosition = new THREE.Vector3();
const proxyRotation = new THREE.Quaternion();
const proxyScale = new THREE.Vector3();
const proxyMinimum = new THREE.Vector3();
const proxyMaximum = new THREE.Vector3();
const proxyWorldMatrix = new THREE.Matrix4();

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

  const center = proxyBounds.getCenter(new THREE.Vector3());
  const size = proxyBounds.getSize(new THREE.Vector3());
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
  return {
    kind,
    matrix: new THREE.Matrix4().compose(center, new THREE.Quaternion(), scale),
    x: center.x,
    z: center.z,
  };
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
  private readonly broadleafMesh: THREE.InstancedMesh;
  private readonly coniferMesh: THREE.InstancedMesh;
  private currentBudget = 0;
  private refreshes = 0;

  constructor(scene: THREE.Scene, private readonly capacity: number) {
    const safeCapacity = Math.max(1, Math.floor(capacity));
    this.root.name = "tellus-canopy-shadow-proxies";
    this.broadleafMesh = this.createMesh(this.broadleafGeometry, safeCapacity, "broadleaf");
    this.coniferMesh = this.createMesh(this.coniferGeometry, safeCapacity, "conifer");
    this.root.add(this.broadleafMesh, this.coniferMesh);
    scene.add(this.root);
  }

  private createMesh(
    geometry: THREE.BufferGeometry,
    capacity: number,
    kind: CanopyShadowKind,
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

  sync(proxies: readonly CanopyShadowProxy[], px: number, pz: number, budget: number): void {
    this.currentBudget = Math.max(0, Math.min(this.capacity, Math.floor(budget)));
    const selected = nearestCanopyShadowProxies(proxies, px, pz, this.currentBudget);
    const broadleaf = selected.filter((proxy) => proxy.kind === "broadleaf");
    const conifer = selected.filter((proxy) => proxy.kind === "conifer");
    this.write(this.broadleafMesh, broadleaf);
    this.write(this.coniferMesh, conifer);
    this.refreshes++;
  }

  private write(mesh: THREE.InstancedMesh, proxies: readonly CanopyShadowProxy[]): void {
    mesh.count = proxies.length;
    proxies.forEach((proxy, index) => mesh.setMatrixAt(index, proxy.matrix));
    mesh.instanceMatrix.needsUpdate = true;
  }

  diagnostics(): CanopyShadowProxyPoolDiagnostics {
    return {
      budget: this.currentBudget,
      broadleaf: this.broadleafMesh.count,
      conifer: this.coniferMesh.count,
      total: this.broadleafMesh.count + this.coniferMesh.count,
      refreshes: this.refreshes,
    };
  }

  dispose(scene: THREE.Scene): void {
    scene.remove(this.root);
    this.root.clear();
    this.broadleafMesh.dispose();
    this.coniferMesh.dispose();
    this.broadleafGeometry.dispose();
    this.coniferGeometry.dispose();
    this.material.dispose();
  }
}
