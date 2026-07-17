import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { GeneratedThing } from "./tellus-types";
import { createGeneratedMesh, fitModelToHeight, inferGeneratedKind } from "./tellus-scene-builders";

describe("Tellus generated scene helpers", () => {
  it("classifies unicorn assets as animals", () => {
    expect(inferGeneratedKind("Stylized Fantasy Unicorn", "visitor")).toBe("animal");
  });

  it("renders failed assets as an explicit broken-asset marker", () => {
    const thing: GeneratedThing = {
      id: "asset-unicorn",
      kind: "animal",
      prompt: "Stylized Fantasy Unicorn",
      creatorId: "visitor",
      position: { x: 0, y: 0, z: 0 },
      rotationY: 0,
      scale: 1,
      color: 0xb9824b,
      generationStatus: "failed",
    };

    const mesh = createGeneratedMesh(thing);

    expect(mesh.userData.failedAsset).toBe(true);
    expect(mesh.children.length).toBeGreaterThanOrEqual(4);
  });

  it("frustum-culls fitted static meshes but keeps skinned meshes conservative", () => {
    const model = new THREE.Group();
    const staticMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial(),
    );
    const skinnedGeometry = new THREE.BoxGeometry(1, 1, 1);
    const skinnedVertexCount = skinnedGeometry.getAttribute("position").count;
    const skinIndices = new Uint16Array(skinnedVertexCount * 4);
    const skinWeights = new Float32Array(skinnedVertexCount * 4);
    for (let i = 0; i < skinnedVertexCount; i++) skinWeights[i * 4] = 1;
    skinnedGeometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(skinIndices, 4));
    skinnedGeometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(skinWeights, 4));
    const skinnedMesh = new THREE.SkinnedMesh(skinnedGeometry, new THREE.MeshBasicMaterial());
    const bone = new THREE.Bone();
    skinnedMesh.add(bone);
    skinnedMesh.bind(new THREE.Skeleton([bone]));
    model.add(staticMesh, skinnedMesh);

    fitModelToHeight(model, 2);

    expect(staticMesh.frustumCulled).toBe(true);
    expect(skinnedMesh.frustumCulled).toBe(false);
  });
});
