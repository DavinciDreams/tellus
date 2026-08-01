import { describe, expect, it } from "vitest";
import * as THREE from "three";
import type { GeneratedThing } from "./tellus-types";
import {
  createGeneratedMesh,
  fitModelToHeight,
  fittedModelDimensions,
  generatedModelHasRuntimeAnimations,
  inferGeneratedKind,
  placeObjectAboveGround,
} from "./tellus-scene-builders";

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
      verticalOffset: 0,
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

  it("keeps fitted visual grounding independent from repeated world placement", () => {
    const source = new THREE.Group();
    source.name = "offset-asset";
    source.scale.setScalar(1.5);
    const visual = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 2));
    visual.position.set(8, 12, -5);
    source.add(visual);

    const fitted = fitModelToHeight(source, 2);
    expect(fitted).not.toBe(source);
    expect(source.scale.x).toBeCloseTo(1.5, 6);

    placeObjectAboveGround(fitted, { x: 40, y: 7.25, z: -12 });
    let bounds = new THREE.Box3().setFromObject(fitted);
    let center = bounds.getCenter(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(7.25, 6);
    expect(center.x).toBeCloseTo(40, 6);
    expect(center.z).toBeCloseTo(-12, 6);

    placeObjectAboveGround(fitted, { x: -3, y: 19.5, z: 4 });
    bounds = new THREE.Box3().setFromObject(fitted);
    center = bounds.getCenter(new THREE.Vector3());
    expect(bounds.min.y).toBeCloseTo(19.5, 6);
    expect(center.x).toBeCloseTo(-3, 6);
    expect(center.z).toBeCloseTo(4, 6);
  });

  it("keeps fitted dimensions stable through rotation and proportional through later resizing", () => {
    const source = new THREE.Group();
    source.add(new THREE.Mesh(new THREE.BoxGeometry(2, 4, 6)));
    const fitted = fitModelToHeight(source, 2);

    expect(fittedModelDimensions(fitted)).toEqual({ width: 1, height: 2, depth: 3 });
    fitted.rotation.y = Math.PI / 3;
    fitted.scale.setScalar(1.75);
    expect(fittedModelDimensions(fitted)).toEqual({ width: 1.75, height: 3.5, depth: 5.25 });
  });

  it("reports animation capability from the actually loaded render variant", () => {
    const staticLod = new THREE.Group();
    const animatedVariant = new THREE.Group();
    animatedVariant.userData.animations = [new THREE.AnimationClip("Idle", 1, [])];

    expect(generatedModelHasRuntimeAnimations(staticLod)).toBe(false);
    expect(generatedModelHasRuntimeAnimations(animatedVariant)).toBe(true);
  });
});
