import { afterEach, describe, expect, it } from "vitest";
import * as THREE from "three";
import {
  buildProceduralModel,
  liveMirrorCount,
  MAX_LIVE_MIRRORS,
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

  it("builds a live Reflector mirror on the WebGL path", () => {
    resetLiveMirrors();
    const model = buildProceduralModel("procedural://mirror", false);
    expect(model).not.toBeNull();
    expect(hasReflector(model!)).toBe(true);
    expect(hasGlass(model!)).toBe(false);
    expect(liveMirrorCount()).toBe(1);
    expect(model!.userData.mirrorReflector).toBeTruthy();
  });

  it("uses static glass on the WebGPU path while live TSL reflectors are disabled", () => {
    resetLiveMirrors();
    const model = buildProceduralModel("procedural://mirror", true);
    expect(model).not.toBeNull();
    expect(hasReflector(model!)).toBe(false);
    expect(hasGlass(model!)).toBe(true);
    expect(liveMirrorCount()).toBe(0);
    expect(model!.userData.mirrorReflector).toBeFalsy();
  });

  it("caps live mirrors and renders extras as glass", () => {
    resetLiveMirrors();
    const models: THREE.Object3D[] = [];
    for (let i = 0; i < MAX_LIVE_MIRRORS + 2; i++) {
      const model = buildProceduralModel("procedural://mirror", false);
      expect(model).not.toBeNull();
      models.push(model!);
    }
    expect(liveMirrorCount()).toBe(MAX_LIVE_MIRRORS);
    const live = models.filter(hasReflector).length;
    const glass = models.filter(hasGlass).length;
    expect(live).toBe(MAX_LIVE_MIRRORS);
    expect(glass).toBe(2);
  });

  it("a removed mirror frees its live slot via disposeMirror", () => {
    resetLiveMirrors();
    const model = buildProceduralModel("procedural://mirror", false)!;
    expect(liveMirrorCount()).toBe(1);
    (model.userData.disposeMirror as () => void)();
    expect(liveMirrorCount()).toBe(0);
  });
});

describe("VRM object clip catalog", () => {
  it("exposes the VRMA catalog clip names a placed VRM thing can loop", () => {
    expect(vrmaObjectClipNames()).toEqual(Object.keys(VRMA_OBJECT_CLIP_IDS));
    expect(vrmaObjectClipNames()).toContain("idle");
  });
});
