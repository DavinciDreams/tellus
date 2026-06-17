import { describe, expect, it } from "vitest";
import type { GeneratedThing } from "./tellus-types";
import { createGeneratedMesh, inferGeneratedKind } from "./tellus-scene-builders";

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
});
