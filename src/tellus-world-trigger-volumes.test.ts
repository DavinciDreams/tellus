import { describe, expect, it } from "vitest";
import { createWorldTriggerVolumeGroup, disposeWorldTriggerVolumeGroup } from "./tellus-world-trigger-volumes";

describe("world trigger volume previews", () => {
  it("builds static sphere and yawed box previews from shared resources", () => {
    const group = createWorldTriggerVolumeGroup([
      {
        triggerId: "sphere",
        enabled: true,
        shape: {
          kind: "sphere",
          center: { x: 1, y: 2, z: 3 },
          radius: 4,
          halfExtents: { x: 1, y: 1, z: 1 },
          yawDegrees: 0,
        },
      },
      {
        triggerId: "box",
        enabled: false,
        shape: {
          kind: "box",
          center: { x: -1, y: 0, z: 2 },
          radius: 0,
          halfExtents: { x: 2, y: 3, z: 4 },
          yawDegrees: 90,
        },
      },
    ]);

    expect(group.children).toHaveLength(2);
    expect(group.children[0]?.position.toArray()).toEqual([1, 2, 3]);
    expect(group.children[0]?.scale.toArray()).toEqual([4, 4, 4]);
    expect(group.children[1]?.scale.toArray()).toEqual([4, 6, 8]);
    expect(group.children[1]?.rotation.y).toBeCloseTo(Math.PI / 2);

    disposeWorldTriggerVolumeGroup(group);
    expect(group.children).toHaveLength(0);
  });
});
