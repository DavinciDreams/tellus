import RAPIER, {
  Collider,
  ColliderDesc,
  KinematicCharacterController,
  World,
} from "@dimforge/rapier3d-compat";
import type { Vec3 } from "./tellus-types";

export interface RapierSolid {
  id: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  height: number;
}

export interface RapierPlayerMove {
  position: Vec3;
  grounded: boolean;
  collisions: number;
}

export interface TellusRapierPhysics {
  syncSolids(solids: readonly RapierSolid[]): void;
  movePlayer(fromFeet: Vec3, desiredFeet: Vec3): RapierPlayerMove;
  stats(): { solids: number; ready: boolean };
  dispose(): void;
}

const PLAYER_RADIUS = 0.5;
const PLAYER_HALF_HEIGHT = 0.68;
const PLAYER_CENTER_OFFSET = PLAYER_RADIUS + PLAYER_HALF_HEIGHT;

const solidKey = (solid: RapierSolid): string =>
  [
    solid.x.toFixed(2),
    solid.y.toFixed(2),
    solid.z.toFixed(2),
    solid.radius.toFixed(2),
    solid.height.toFixed(2),
  ].join(":");

const playerCenter = (feet: Vec3): Vec3 => ({
  x: feet.x,
  y: feet.y + PLAYER_CENTER_OFFSET,
  z: feet.z,
});

const playerFeet = (center: Vec3): Vec3 => ({
  x: center.x,
  y: center.y - PLAYER_CENTER_OFFSET,
  z: center.z,
});

export async function createTellusRapierPhysics(): Promise<TellusRapierPhysics> {
  await RAPIER.init();
  const world = new World({ x: 0, y: -22, z: 0 });
  const controller = world.createCharacterController(0.04);
  controller.setSlideEnabled(true);
  controller.enableAutostep(0.45, 0.35, false);
  controller.enableSnapToGround(0.35);
  controller.setMaxSlopeClimbAngle((50 * Math.PI) / 180);
  controller.setMinSlopeSlideAngle((58 * Math.PI) / 180);

  const playerCollider = world.createCollider(
    ColliderDesc.capsule(PLAYER_HALF_HEIGHT, PLAYER_RADIUS)
      .setFriction(0.8)
      .setTranslation(0, PLAYER_CENTER_OFFSET, 0),
  );
  const colliders = new Map<string, { key: string; collider: Collider }>();
  let disposed = false;
  let collisionWorldDirty = true;

  const removeSolid = (id: string) => {
    const entry = colliders.get(id);
    if (!entry) return;
    world.removeCollider(entry.collider, false);
    colliders.delete(id);
    collisionWorldDirty = true;
  };

  const api: TellusRapierPhysics = {
    syncSolids(solids) {
      if (disposed) return;
      const seen = new Set<string>();
      for (const solid of solids) {
        if (
          !solid.id ||
          !Number.isFinite(solid.x) ||
          !Number.isFinite(solid.y) ||
          !Number.isFinite(solid.z) ||
          !Number.isFinite(solid.radius) ||
          !Number.isFinite(solid.height) ||
          solid.radius <= 0 ||
          solid.height <= 0
        ) {
          continue;
        }
        seen.add(solid.id);
        const key = solidKey(solid);
        const existing = colliders.get(solid.id);
        if (existing?.key === key) continue;
        removeSolid(solid.id);
        const hx = Math.max(0.2, solid.radius);
        const hy = Math.max(0.2, solid.height / 2);
        const hz = Math.max(0.2, solid.radius);
        const collider = world.createCollider(
          ColliderDesc.cuboid(hx, hy, hz)
            .setFriction(0.9)
            .setTranslation(solid.x, solid.y + hy, solid.z),
        );
        colliders.set(solid.id, { key, collider });
        collisionWorldDirty = true;
      }
      for (const id of [...colliders.keys()]) {
        if (!seen.has(id)) removeSolid(id);
      }
    },
    movePlayer(fromFeet, desiredFeet) {
      if (disposed) {
        return { position: desiredFeet, grounded: false, collisions: 0 };
      }
      const from = playerCenter(fromFeet);
      const desired = playerCenter(desiredFeet);
      playerCollider.setTranslation(from);
      if (collisionWorldDirty) {
        world.step();
        collisionWorldDirty = false;
      }
      controller.computeColliderMovement(playerCollider, {
        x: desired.x - from.x,
        y: desired.y - from.y,
        z: desired.z - from.z,
      });
      const movement = controller.computedMovement();
      const nextCenter = {
        x: from.x + movement.x,
        y: from.y + movement.y,
        z: from.z + movement.z,
      };
      playerCollider.setTranslation(nextCenter);
      return {
        position: playerFeet(nextCenter),
        grounded: controller.computedGrounded(),
        collisions: controller.numComputedCollisions(),
      };
    },
    stats() {
      return { solids: colliders.size, ready: !disposed };
    },
    dispose() {
      disposed = true;
      controller.free();
      for (const entry of colliders.values()) world.removeCollider(entry.collider, false);
      colliders.clear();
      world.removeCollider(playerCollider, false);
      world.free();
    },
  };

  return api;
}
