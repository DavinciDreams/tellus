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

  // Regression: a non-finite move vector used to be forwarded straight into the kinematic controller +
  // world.step(), which panics the Rapier WASM solver with `unreachable` (the terrain-paint crash).
  // The adapter must now refuse NaN/Inf input and keep the last good position instead of throwing.
  it("does not panic Rapier when fed NaN/Inf positions", async () => {
    const physics = await createTellusRapierPhysics();
    try {
      const good = { x: 3, y: 1, z: -2 };
      expect(() =>
        physics.movePlayer(good, { x: NaN, y: 0, z: 0 }),
      ).not.toThrow();
      const a = physics.movePlayer(good, { x: NaN, y: 0, z: 0 });
      expect(a.position).toEqual(good); // stayed put on bad desired

      expect(() =>
        physics.movePlayer({ x: Infinity, y: 0, z: 0 }, good),
      ).not.toThrow();

      expect(() =>
        physics.movePlayer3D(good, { x: 0, y: NaN, z: 0 }),
      ).not.toThrow();
      const b = physics.movePlayer3D(good, { x: 0, y: NaN, z: 0 });
      expect(b.position).toEqual(good);

      // A normal finite move still works after the rejected ones (controller not poisoned).
      const ok = physics.movePlayer(good, { x: 3.2, y: 1, z: -2 });
      expect(Number.isFinite(ok.position.x)).toBe(true);
      expect(Number.isFinite(ok.position.y)).toBe(true);
      expect(Number.isFinite(ok.position.z)).toBe(true);
    } finally {
      physics.dispose();
    }
  });

  it("keeps movement finite when generated solids are oversized", async () => {
    const physics = await createTellusRapierPhysics();
    try {
      physics.syncSolids([
        {
          id: "huge-generated-object",
          x: 0,
          y: 0,
          z: 0,
          radius: 1_000_000,
          height: 1_000_000,
        },
      ]);

      const moved = physics.movePlayer(
        { x: 30, y: 0, z: 0 },
        { x: 31, y: 0, z: 0 },
      );

      expect(Number.isFinite(moved.position.x)).toBe(true);
      expect(Number.isFinite(moved.position.y)).toBe(true);
      expect(Number.isFinite(moved.position.z)).toBe(true);
      expect(physics.stats()).toMatchObject({ solids: 1, ready: true });
    } finally {
      physics.dispose();
    }
  });
});
