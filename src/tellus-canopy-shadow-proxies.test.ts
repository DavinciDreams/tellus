import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CanopyShadowProxyPool,
  canopyShadowSelectionSignature,
  fitCanopyShadowProxy,
  fitCanopyShadowProxyFromBounds,
  nearestCanopyShadowProxies,
  viewPrioritizedCanopyShadowProxies,
  type CanopyShadowProxy,
} from "./tellus-canopy-shadow-proxies";

const proxyAt = (
  x: number,
  z = 0,
  kind: CanopyShadowProxy["kind"] = "broadleaf",
): CanopyShadowProxy => ({
  kind,
  matrix: new THREE.Matrix4().makeTranslation(x, 4, z),
  trunkMatrix: new THREE.Matrix4().compose(
    new THREE.Vector3(x, 0, z),
    new THREE.Quaternion(),
    new THREE.Vector3(0.2, 4, 0.2),
  ),
  x,
  z,
});

describe("canopy shadow proxies", () => {
  it("fits one broadleaf proxy around foliage transformed into world space", () => {
    const tree = new THREE.Matrix4().makeTranslation(10, 2, -4);
    const organs = [
      new THREE.Matrix4().makeTranslation(-1, 4, 0),
      new THREE.Matrix4().makeTranslation(1, 6, 0),
    ];
    const proxy = fitCanopyShadowProxy(organs, "broadleaf", tree);

    expect(proxy).not.toBeNull();
    expect(proxy?.x).toBeCloseTo(10);
    expect(proxy?.z).toBeCloseTo(-4);
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    proxy?.matrix.decompose(position, rotation, scale);
    expect(position.y).toBeCloseTo(7);
    expect(scale.y).toBeGreaterThan(1);
    expect(proxy?.trunkMatrix).toBeInstanceOf(THREE.Matrix4);
  });

  it("gives a cold fallback tree a canopy and trunk proxy", () => {
    const localBounds = new THREE.Box3(
      new THREE.Vector3(-2, 0, -2),
      new THREE.Vector3(2, 8, 2),
    );
    const proxy = fitCanopyShadowProxyFromBounds(
      localBounds,
      "broadleaf",
      new THREE.Matrix4().makeTranslation(20, 3, -10),
    );

    expect(proxy).not.toBeNull();
    expect(proxy?.x).toBeCloseTo(20);
    expect(proxy?.z).toBeCloseTo(-10);
    const trunkScale = new THREE.Vector3();
    proxy?.trunkMatrix.decompose(new THREE.Vector3(), new THREE.Quaternion(), trunkScale);
    expect(trunkScale.y).toBeGreaterThan(1);
  });

  it("keeps only the nearest proxies inside the structural budget", () => {
    expect(nearestCanopyShadowProxies([proxyAt(20), proxyAt(2), proxyAt(8)], 0, 0, 2).map((p) => p.x))
      .toEqual([2, 8]);
  });

  it("prioritizes visible trees over closer off-screen trees", () => {
    const camera = new THREE.PerspectiveCamera(60, 1, 0.1, 100);
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld();
    const visible = proxyAt(0, -30);
    const nearbyBehind = proxyAt(0, 10);
    const offscreen = proxyAt(40, -20);

    expect(viewPrioritizedCanopyShadowProxies(
      [nearbyBehind, offscreen, visible],
      0,
      0,
      2,
      { camera, maxDistance: 80, nearDistance: 15 },
    )).toEqual([visible, nearbyBehind]);
  });

  it("uses two global meshes regardless of proxy count", () => {
    const scene = new THREE.Scene();
    const pool = new CanopyShadowProxyPool(scene, 8);
    const proxies: CanopyShadowProxy[] = [
      proxyAt(0),
      proxyAt(1, 0, "conifer"),
      proxyAt(2),
    ];

    const first = pool.sync(proxies, 0, 0, 3);
    const second = pool.sync([...proxies].reverse(), 0, 0, 3);

    expect(first.changed).toBe(true);
    expect(first.bounds?.containsPoint(new THREE.Vector3(2, 0, 0))).toBe(true);
    expect(second.changed).toBe(false);
    expect(pool.diagnostics()).toMatchObject({ total: 3, broadleaf: 2, conifer: 1, trunks: 3 });
    expect(pool.diagnostics().refreshes).toBe(1);
    expect(scene.getObjectByName("tellus-canopy-shadow-proxies")?.children).toHaveLength(3);
    pool.dispose(scene);
  });

  it("signs selected identities and matrices independent of instance order", () => {
    const first = proxyAt(2, 4);
    const second = proxyAt(8, 6, "conifer");

    expect(canopyShadowSelectionSignature([first, second]))
      .toBe(canopyShadowSelectionSignature([second, first]));
    expect(canopyShadowSelectionSignature([first]))
      .not.toBe(canopyShadowSelectionSignature([second]));
  });
});
