import RAPIER, {
  Collider,
  ColliderDesc,
  KinematicCharacterController,
  RigidBody,
  RigidBodyDesc,
  World,
} from "@dimforge/rapier3d-compat";
import * as THREE from "three";
import type { Vec3 } from "./tellus-types";

// Interior solid-surface flag (mirrors COLLIDE_FLAG in tellus-building.ts). A mesh with
// userData.collide === true is baked into the static interior trimesh; everything else is visual.
const COLLIDE_FLAG = "collide";

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
  // Full-3D move: the desired Y (already gravity-integrated by the caller) is passed THROUGH the
  // kinematic controller so the player walks floors/stairs and is blocked vertically by ceilings.
  // Used inside interiors where the trimesh statics provide real vertical surfaces.
  movePlayer3D(fromFeet: Vec3, desiredFeet: Vec3): RapierPlayerMove;
  // Bake every Mesh in `object` flagged userData.collide === true into a world-space Rapier static
  // trimesh, attached to one shared fixed body, keyed by `id` (re-adding the same id replaces it).
  addStaticTrimesh(id: string, object: THREE.Object3D): void;
  // Remove all interior trimesh statics (call on portal exit / world switch).
  clearStatics(): void;
  // True while any interior trimesh static exists (caller steps the world each frame then).
  hasStatics(): boolean;
  stats(): { solids: number; ready: boolean; statics: number };
  dispose(): void;
}

const PLAYER_RADIUS = 0.5;
const PLAYER_HALF_HEIGHT = 0.68;
const PLAYER_CENTER_OFFSET = PLAYER_RADIUS + PLAYER_HALF_HEIGHT;
const MAX_SOLID_HALF_EXTENT = 18;
const MAX_SOLID_HALF_HEIGHT = 40;

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

// A single non-finite component fed into controller.computeColliderMovement poisons the kinematic
// controller; the next world.step() then hits an `unreachable` panic deep in the Rapier WASM solver
// (the crash seen while painting terrain). Guard the boundary: any NaN/Inf in a move vector is a bug
// upstream, but here we refuse to forward it to Rapier and keep the player put instead of crashing.
const isFiniteVec = (v: Vec3): boolean =>
  Number.isFinite(v.x) && Number.isFinite(v.y) && Number.isFinite(v.z);

const initRapier = async () => {
  const originalWarn = console.warn;
  console.warn = (...args: unknown[]) => {
    if (
      typeof args[0] === "string" &&
      args[0].includes("using deprecated parameters for the initialization function")
    ) {
      return;
    }
    originalWarn(...args);
  };
  try {
    await RAPIER.init();
  } finally {
    console.warn = originalWarn;
  }
};

export async function createTellusRapierPhysics(): Promise<TellusRapierPhysics> {
  await initRapier();
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
  let failed = false;
  let collisionWorldDirty = true;

  // ── Interior static trimeshes ──────────────────────────────────────────────────────────────
  // All interior solids (floors/walls/stairs/ceiling) live on ONE shared fixed rigid body; each
  // addStaticTrimesh(id, ...) attaches that id's colliders to it and remembers them so a re-add or
  // clearStatics can remove exactly those. The body itself is lazily created on first use.
  let staticBody: RigidBody | null = null;
  const staticColliders = new Map<string, Collider[]>();

  const safeRemoveCollider = (collider: Collider): void => {
    try {
      world.removeCollider(collider, false);
    } catch (error) {
      // Rapier can throw "recursive use of an object" during teardown if a collider has already been
      // detached by a body/world free path. Treat removal as best-effort; stale JS handles are dropped.
      console.warn("Tellus Rapier collider removal skipped", error);
    }
  };

  const safeRemoveRigidBody = (body: RigidBody): void => {
    try {
      world.removeRigidBody(body);
    } catch (error) {
      console.warn("Tellus Rapier static body removal skipped", error);
    }
  };

  const ensureStaticBody = (): RigidBody => {
    if (!staticBody) {
      staticBody = world.createRigidBody(RigidBodyDesc.fixed());
    }
    return staticBody;
  };

  const removeStaticId = (id: string) => {
    const list = staticColliders.get(id);
    if (!list) return;
    staticColliders.delete(id);
    for (const collider of list) safeRemoveCollider(collider);
    collisionWorldDirty = true;
  };

  // Bake one Mesh's geometry into WORLD-space verts + indices. Returns null when the geometry has no
  // usable position attribute (the mesh is skipped). Non-indexed geometry gets synthesized indices.
  const bakeMeshTrimesh = (
    mesh: THREE.Mesh,
  ): { vertices: Float32Array; indices: Uint32Array } | null => {
    const geometry = mesh.geometry;
    const position = geometry?.getAttribute("position") as
      | THREE.BufferAttribute
      | THREE.InterleavedBufferAttribute
      | undefined;
    if (!position || position.count < 3) return null;
    const matrix = mesh.matrixWorld;
    const vertexCount = position.count;
    const vertices = new Float32Array(vertexCount * 3);
    const v = new THREE.Vector3();
    for (let i = 0; i < vertexCount; i++) {
      v.set(position.getX(i), position.getY(i), position.getZ(i)).applyMatrix4(matrix);
      vertices[i * 3] = v.x;
      vertices[i * 3 + 1] = v.y;
      vertices[i * 3 + 2] = v.z;
    }
    let indices: Uint32Array;
    const indexAttr = geometry.getIndex();
    if (indexAttr) {
      indices = new Uint32Array(indexAttr.count);
      for (let i = 0; i < indexAttr.count; i++) indices[i] = indexAttr.getX(i);
    } else {
      // Non-indexed: every 3 consecutive vertices form a triangle.
      const triCount = Math.floor(vertexCount / 3) * 3;
      indices = new Uint32Array(triCount);
      for (let i = 0; i < triCount; i++) indices[i] = i;
    }
    return { vertices, indices };
  };

  const removeSolid = (id: string) => {
    const entry = colliders.get(id);
    if (!entry) return;
    colliders.delete(id);
    safeRemoveCollider(entry.collider);
    collisionWorldDirty = true;
  };

  const failRapier = (error: unknown, context: string): void => {
    failed = true;
    collisionWorldDirty = false;
    const message = error instanceof Error ? error.message : String(error);
    console.warn("Tellus Rapier physics disabled after movement failure", {
      context,
      error: error instanceof Error ? error.name : typeof error,
      message,
      solids: colliders.size,
      statics: staticColliders.size,
    });
  };

  const api: TellusRapierPhysics = {
    syncSolids(solids) {
      if (disposed || failed) return;
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
        const hx = Math.min(MAX_SOLID_HALF_EXTENT, Math.max(0.2, solid.radius));
        const hy = Math.min(MAX_SOLID_HALF_HEIGHT, Math.max(0.2, solid.height / 2));
        const hz = Math.min(MAX_SOLID_HALF_EXTENT, Math.max(0.2, solid.radius));
        try {
          const collider = world.createCollider(
            ColliderDesc.cuboid(hx, hy, hz)
              .setFriction(0.9)
              .setTranslation(solid.x, solid.y + hy, solid.z),
          );
          colliders.set(solid.id, { key, collider });
          collisionWorldDirty = true;
        } catch (error) {
          console.warn("Tellus Rapier generated solid skipped", error);
        }
      }
      for (const id of [...colliders.keys()]) {
        if (!seen.has(id)) removeSolid(id);
      }
    },
    movePlayer(fromFeet, desiredFeet) {
      if (disposed || failed) {
        return { position: desiredFeet, grounded: false, collisions: 0 };
      }
      // Refuse non-finite input — forwarding NaN/Inf to Rapier panics the WASM solver. Keep the
      // last good feet position (fromFeet) rather than crashing the whole frame loop.
      if (!isFiniteVec(fromFeet) || !isFiniteVec(desiredFeet)) {
        return {
          position: isFiniteVec(fromFeet) ? fromFeet : { x: 0, y: 0, z: 0 },
          grounded: false,
          collisions: 0,
        };
      }
      const from = playerCenter(fromFeet);
      const desired = playerCenter(desiredFeet);
      try {
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
      } catch (error) {
        failRapier(error, "movePlayer");
        return { position: fromFeet, grounded: false, collisions: 0 };
      }
    },
    movePlayer3D(fromFeet, desiredFeet) {
      if (disposed || failed) {
        return { position: desiredFeet, grounded: false, collisions: 0 };
      }
      // Same NaN/Inf backstop as movePlayer — a non-finite delta into the controller + world.step()
      // is the terrain-paint `unreachable` crash.
      if (!isFiniteVec(fromFeet) || !isFiniteVec(desiredFeet)) {
        return {
          position: isFiniteVec(fromFeet) ? fromFeet : { x: 0, y: 0, z: 0 },
          grounded: false,
          collisions: 0,
        };
      }
      const from = playerCenter(fromFeet);
      const desired = playerCenter(desiredFeet);
      try {
        playerCollider.setTranslation(from);
      // Step every frame in interiors so trimesh statics + autostep/snap-to-ground resolve. (Dirty
      // also forces a step right after geometry changes; the unconditional step covers the rest.)
      world.step();
      collisionWorldDirty = false;
      // Pass the FULL desired delta — including the caller's gravity-integrated Y — through the
      // controller so it does vertical floor/stair contact (autostep 0.45/0.35, snapToGround 0.35).
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
      } catch (error) {
        failRapier(error, "movePlayer3D");
        return { position: fromFeet, grounded: false, collisions: 0 };
      }
    },
    addStaticTrimesh(id, object) {
      if (disposed || failed) return;
      // World matrices must be current before we read positions into world space.
      object.updateMatrixWorld(true);
      removeStaticId(id);
      const body = ensureStaticBody();
      const created: Collider[] = [];
      object.traverse((child) => {
        const mesh = child as THREE.Mesh;
        if (!mesh.isMesh || mesh.userData?.[COLLIDE_FLAG] !== true) return;
        const baked = bakeMeshTrimesh(mesh);
        if (!baked) return;
        try {
          const collider = world.createCollider(
            ColliderDesc.trimesh(baked.vertices, baked.indices).setFriction(0.9),
            body,
          );
          created.push(collider);
        } catch (error) {
          // A degenerate mesh (zero-area tris) can throw inside Rapier — skip it, keep the rest.
          console.warn("Tellus interior trimesh skipped", error);
        }
      });
      if (created.length > 0) {
        staticColliders.set(id, created);
        collisionWorldDirty = true;
      }
    },
    clearStatics() {
      if (disposed || failed) return;
      for (const id of [...staticColliders.keys()]) removeStaticId(id);
      if (staticBody) {
        safeRemoveRigidBody(staticBody);
        staticBody = null;
      }
      collisionWorldDirty = true;
    },
    hasStatics() {
      return !failed && staticColliders.size > 0;
    },
    stats() {
      return { solids: colliders.size, ready: !disposed && !failed, statics: staticColliders.size };
    },
    dispose() {
      disposed = true;
      colliders.clear();
      staticColliders.clear();
      staticBody = null;
      try {
        controller.free();
      } catch (error) {
        console.warn("Tellus Rapier controller disposal skipped", error);
      }
      try {
        world.free();
      } catch (error) {
        console.warn("Tellus Rapier world disposal skipped", error);
      }
    },
  };

  return api;
}
