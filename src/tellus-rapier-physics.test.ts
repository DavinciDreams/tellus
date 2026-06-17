import { describe, expect, it } from "vitest";
import { createTellusRapierPhysics } from "./tellus-rapier-physics";

describe("Tellus Rapier physics adapter", () => {
  it("slides the player capsule against a synced solid", async () => {
    const physics = await createTellusRapierPhysics();
    try {
      physics.syncSolids([
        {
          id: "wall",
          x: 1.4,
          y: 0,
          z: 0,
          radius: 0.45,
          height: 3,
        },
      ]);

      const moved = physics.movePlayer(
        { x: 0, y: 0, z: 0 },
        { x: 2.5, y: 0, z: 0 },
      );

      expect(moved.position.x).toBeLessThan(1);
      expect(moved.collisions).toBeGreaterThan(0);
      expect(physics.stats()).toMatchObject({ solids: 1, ready: true });
    } finally {
      physics.dispose();
    }
  });
});
