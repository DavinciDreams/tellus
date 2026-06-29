import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildProceduralModel,
  MIRROR_ARCHETYPE_ID,
  makeProceduralModelUrl,
  parseProceduralModelUrl,
  resetLiveMirrors,
} from "./tellus-procedural-assets";
import { vrmaObjectClipNames, VRMA_OBJECT_CLIP_IDS } from "./tellus-vrm-avatar";

const hasReflector = (model: THREE.Object3D): boolean => {
  let found = false;
  model.traverse((obj) => {
    if ((obj as { isReflector?: boolean }).isReflector || obj.name === "tellus-mirror-reflector") {
      found = true;
    }
  });
  return found;
};

const hasGlass = (model: THREE.Object3D): boolean => {
  let found = false;
  model.traverse((obj) => {
    if (obj.name === "tellus-mirror-glass") found = true;
  });
  return found;
};

afterEach(() => resetLiveMirrors());

describe("mirror procedural asset", () => {
  it("parses procedural://mirror as a valid procedural URL", () => {
    const url = makeProceduralModelUrl(MIRROR_ARCHETYPE_ID, 42);
    const parsed = parseProceduralModelUrl(url);
    expect(parsed?.archetypeId).toBe("mirror");
  });

  it("uses static glass on the WebGL path", () => {
    resetLiveMirrors();
    const model = buildProceduralModel("procedural://mirror", false);
    expect(model).not.toBeNull();
    expect(hasReflector(model!)).toBe(false);
    expect(hasGlass(model!)).toBe(true);
    expect(model!.userData.mirrorReflector).toBeFalsy();
    expect(model!.userData.disposeMirror).toBeFalsy();
  });

  it("uses static glass on the WebGPU path", () => {
    resetLiveMirrors();
    const model = buildProceduralModel("procedural://mirror", true);
    expect(model).not.toBeNull();
    expect(hasReflector(model!)).toBe(false);
    expect(hasGlass(model!)).toBe(true);
    expect(model!.userData.mirrorReflector).toBeFalsy();
    expect(model!.userData.disposeMirror).toBeFalsy();
  });

  it("keeps every mirror static glass", () => {
    resetLiveMirrors();
    const models: THREE.Object3D[] = [];
    for (let i = 0; i < 4; i++) {
      const model = buildProceduralModel("procedural://mirror", false);
      expect(model).not.toBeNull();
      models.push(model!);
    }
    expect(models.filter(hasReflector).length).toBe(0);
    expect(models.filter(hasGlass).length).toBe(4);
    expect(models.every((model) => !model.userData.mirrorReflector && !model.userData.disposeMirror)).toBe(true);
  });
});

describe("VRM object clip catalog", () => {
  it("exposes the VRMA catalog clip names a placed VRM thing can loop", () => {
    expect(vrmaObjectClipNames()).toEqual(Object.keys(VRMA_OBJECT_CLIP_IDS));
    expect(vrmaObjectClipNames()).toContain("idle");
  });
});
