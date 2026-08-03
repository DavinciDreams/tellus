import * as THREE from "three";
import { describe, expect, it } from "vitest";
import {
  CanopyShadowProxyPool,
  fitCanopyShadowProxy,
  nearestCanopyShadowProxies,
  type CanopyShadowProxy,
} from "./tellus-canopy-shadow-proxies";

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
  });

  it("keeps only the nearest proxies inside the structural budget", () => {
    const proxy = (x: number): CanopyShadowProxy => ({
      kind: "broadleaf",
      matrix: new THREE.Matrix4().makeTranslation(x, 0, 0),
      x,
      z: 0,
    });

    expect(nearestCanopyShadowProxies([proxy(20), proxy(2), proxy(8)], 0, 0, 2).map((p) => p.x))
      .toEqual([2, 8]);
  });

  it("uses two global meshes regardless of proxy count", () => {
    const scene = new THREE.Scene();
    const pool = new CanopyShadowProxyPool(scene, 8);
    const proxies: CanopyShadowProxy[] = [
      { kind: "broadleaf", matrix: new THREE.Matrix4(), x: 0, z: 0 },
      { kind: "conifer", matrix: new THREE.Matrix4(), x: 1, z: 0 },
      { kind: "broadleaf", matrix: new THREE.Matrix4(), x: 2, z: 0 },
    ];

    pool.sync(proxies, 0, 0, 3);

    expect(pool.diagnostics()).toMatchObject({ total: 3, broadleaf: 2, conifer: 1 });
    expect(scene.getObjectByName("tellus-canopy-shadow-proxies")?.children).toHaveLength(2);
    pool.dispose(scene);
  });
});
