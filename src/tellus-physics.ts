import * as THREE from "three";

// ── Ambient physics ───────────────────────────────────────────────────────────────────────────────
// A deliberately small rigid-body-lite integrator for the stylized world — no wasm, no deps, fully
// deterministic on the simulating client. Bodies are thrown/dropped GeneratedThings approximated by
// a contact sphere (their footprint radius): semi-implicit Euler + terrain contact against the
// sampled heightfield (finite-difference normals → believable bounces off slopes), tangential
// friction, impact-driven tumble, water buoyancy (things splash, bob, then float), and settle
// detection. Only the client that initiated the throw simulates; it streams the flight through the
// normal publish path and the REST POSE is what everyone converges on — same authority model as a
// regular drag-move, so no new protocol.

export interface AmbientPhysicsOptions {
  /** Ground height at (x, z) — central island, distant islands, or seabed/sea floor fallback. */
  groundHeightAt: (x: number, z: number) => number;
  /** Water surface at (x, z), or null when there is no swimmable water column there. */
  waterLevelAt: (x: number, z: number) => number | null;
  /** Hard world bound (radial). Bodies reflect inward at this radius. */
  worldRadius: number;
}

export interface LaunchOptions {
  id: string;
  /** Contact-sphere radius approximating the object's footprint. */
  radius: number;
  position: THREE.Vector3;
  quaternion: THREE.Quaternion;
  velocity: THREE.Vector3;
  /** Tumble axis * rad/s. */
  angularVelocity: THREE.Vector3;
  /** 1 = normal weight. Balloons use ~0.16 for lofty, floaty arcs. */
  gravityScale?: number;
  /** 0..1 bounciness (default 0.42). */
  restitution?: number;
  /** Called once per rendered frame while in flight (drive the mesh + live transform). */
  onFrame: (position: THREE.Vector3, quaternion: THREE.Quaternion) => void;
  /** Called once when the body comes to rest (or floats); publish the final pose here. */
  onSettle: (position: THREE.Vector3, quaternion: THREE.Quaternion) => void;
}

interface Body extends Required<Omit<LaunchOptions, "onFrame" | "onSettle">> {
  onFrame: LaunchOptions["onFrame"];
  onSettle: LaunchOptions["onSettle"];
  calmSteps: number;
  ageMs: number;
  inWater: boolean;
}

export interface AmbientPhysics {
  launch(options: LaunchOptions): void;
  cancel(id: string): void;
  has(id: string): boolean;
  activeCount(): number;
  /** Advance the simulation; call once per frame with the render delta (seconds). */
  step(delta: number): void;
  dispose(): void;
}

const GRAVITY = 22; // gamey-snappy, tuned to the island scale
const FIXED_DT = 1 / 60;
const MAX_SUBSTEPS = 4;
const SETTLE_SPEED = 0.32;
const SETTLE_SPIN = 0.55;
const SETTLE_STEPS = 10;
const MAX_FLIGHT_MS = 12_000;

export function createAmbientPhysics(options: AmbientPhysicsOptions): AmbientPhysics {
  const { groundHeightAt, waterLevelAt, worldRadius } = options;
  const bodies = new Map<string, Body>();
  let accumulator = 0;

  const normal = new THREE.Vector3();
  const tangent = new THREE.Vector3();
  const spinAxis = new THREE.Vector3();
  const dq = new THREE.Quaternion();

  const terrainNormal = (x: number, z: number, out: THREE.Vector3) => {
    const e = 0.6;
    const dhdx = (groundHeightAt(x + e, z) - groundHeightAt(x - e, z)) / (2 * e);
    const dhdz = (groundHeightAt(x, z + e) - groundHeightAt(x, z - e)) / (2 * e);
    return out.set(-dhdx, 1, -dhdz).normalize();
  };

  const integrate = (body: Body) => {
    const p = body.position;
    const v = body.velocity;

    v.y -= GRAVITY * body.gravityScale * FIXED_DT;
    if (body.gravityScale < 0.5) {
      // floaty bodies (balloons) feel air drag
      v.multiplyScalar(Math.max(0, 1 - 1.1 * FIXED_DT));
    }
    p.addScaledVector(v, FIXED_DT);

    // spin
    const spin = body.angularVelocity.length();
    if (spin > 0.0001) {
      spinAxis.copy(body.angularVelocity).divideScalar(spin);
      dq.setFromAxisAngle(spinAxis, spin * FIXED_DT);
      body.quaternion.premultiply(dq).normalize();
    }

    // radial world bound: reflect inward
    const radial = Math.hypot(p.x, p.z);
    if (radial > worldRadius) {
      const nx = p.x / radial;
      const nz = p.z / radial;
      const vn = v.x * nx + v.z * nz;
      if (vn > 0) {
        v.x -= 2 * vn * nx;
        v.z -= 2 * vn * nz;
        v.multiplyScalar(0.6);
      }
      p.x = nx * worldRadius;
      p.z = nz * worldRadius;
    }

    const ground = groundHeightAt(p.x, p.z);
    const water = waterLevelAt(p.x, p.z);
    const inWaterColumn = water !== null && ground < water - 0.2;

    if (inWaterColumn && p.y - body.radius * 0.3 < water!) {
      // buoyancy: spring toward a floating pose + heavy damping; bodies bob then settle afloat
      body.inWater = true;
      const target = water! - body.radius * 0.1 + body.radius * 0.35;
      v.y += (target - p.y) * 9 * FIXED_DT * (1 / Math.max(0.4, body.gravityScale));
      v.multiplyScalar(Math.max(0, 1 - 2.6 * FIXED_DT));
      body.angularVelocity.multiplyScalar(Math.max(0, 1 - 2.8 * FIXED_DT));
      if (v.length() < 0.16 && Math.abs(target - p.y) < 0.08) {
        body.calmSteps++;
      } else {
        body.calmSteps = 0;
      }
      return;
    }

    // terrain contact
    if (p.y - body.radius < ground) {
      p.y = ground + body.radius;
      terrainNormal(p.x, p.z, normal);
      const vn = v.dot(normal);
      if (vn < 0) {
        // reflect + restitution (kill tiny rebounds so things stop hopping)
        const bounce = -vn > 1.4 ? body.restitution : 0;
        v.addScaledVector(normal, -(1 + bounce) * vn);
        // tangential friction
        const tn = v.dot(normal);
        tangent.copy(v).addScaledVector(normal, -tn);
        tangent.multiplyScalar(0.82);
        v.copy(tangent).addScaledVector(normal, tn);
        // impact tumble: spin around (normal × travel), scaled by tangential speed
        const tSpeed = tangent.length();
        if (tSpeed > 0.25) {
          spinAxis.crossVectors(normal, tangent).normalize();
          const targetSpin = Math.min(tSpeed / Math.max(0.2, body.radius), 9);
          body.angularVelocity.lerp(spinAxis.multiplyScalar(targetSpin), 0.6);
        }
      }
      // grounded damping — rolling resistance
      v.x *= Math.max(0, 1 - 2.2 * FIXED_DT);
      v.z *= Math.max(0, 1 - 2.2 * FIXED_DT);
      body.angularVelocity.multiplyScalar(Math.max(0, 1 - 3.2 * FIXED_DT));
      if (v.length() < SETTLE_SPEED && body.angularVelocity.length() < SETTLE_SPIN) {
        body.calmSteps++;
      } else {
        body.calmSteps = 0;
      }
    } else {
      body.calmSteps = 0;
    }
  };

  const step = (delta: number) => {
    if (bodies.size === 0) {
      accumulator = 0;
      return;
    }
    accumulator = Math.min(accumulator + delta, FIXED_DT * MAX_SUBSTEPS);
    let stepped = false;
    while (accumulator >= FIXED_DT) {
      accumulator -= FIXED_DT;
      stepped = true;
      for (const body of bodies.values()) {
        body.ageMs += FIXED_DT * 1000;
        integrate(body);
      }
    }
    if (!stepped) return;
    for (const [id, body] of bodies) {
      if (body.calmSteps >= SETTLE_STEPS || body.ageMs > MAX_FLIGHT_MS) {
        bodies.delete(id);
        body.onSettle(body.position, body.quaternion);
      } else {
        body.onFrame(body.position, body.quaternion);
      }
    }
  };

  return {
    launch: (opts) => {
      bodies.set(opts.id, {
        id: opts.id,
        radius: opts.radius,
        position: opts.position.clone(),
        quaternion: opts.quaternion.clone(),
        velocity: opts.velocity.clone(),
        angularVelocity: opts.angularVelocity.clone(),
        gravityScale: opts.gravityScale ?? 1,
        restitution: opts.restitution ?? 0.42,
        onFrame: opts.onFrame,
        onSettle: opts.onSettle,
        calmSteps: 0,
        ageMs: 0,
        inWater: false,
      });
    },
    cancel: (id) => {
      bodies.delete(id);
    },
    has: (id) => bodies.has(id),
    activeCount: () => bodies.size,
    step,
    dispose: () => {
      bodies.clear();
    },
  };
}

// ── Player ↔ obstacle pushout ─────────────────────────────────────────────────────────────────────
// Cheap, robust circle-vs-circle resolution in the ground plane: trees and large placed objects
// become walkable-around obstacles instead of holograms. Two relaxation passes handle corners.

export interface ObstacleCircle {
  x: number;
  z: number;
  r: number;
}

export interface ObstacleRect {
  x: number;
  z: number;
  hx: number;
  hz: number;
  yaw: number;
  ownerId?: string;
}

export function resolveObstacles(
  x: number,
  z: number,
  radius: number,
  obstacles: readonly ObstacleCircle[],
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      const dx = px - o.x;
      const dz = pz - o.z;
      const minDist = o.r + radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minDist * minDist || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (minDist - d) / d;
      px += dx * push;
      pz += dz * push;
    }
  }
  return { x: px, z: pz };
}

export function resolveRectObstacles(
  x: number,
  z: number,
  radius: number,
  obstacles: readonly ObstacleRect[],
): { x: number; z: number } {
  let px = x;
  let pz = z;
  for (let pass = 0; pass < 2; pass++) {
    for (const o of obstacles) {
      const cos = Math.cos(o.yaw);
      const sin = Math.sin(o.yaw);
      const dx = px - o.x;
      const dz = pz - o.z;
      const lx = dx * cos + dz * sin;
      const lz = -dx * sin + dz * cos;
      const cx = Math.max(-o.hx, Math.min(o.hx, lx));
      const cz = Math.max(-o.hz, Math.min(o.hz, lz));
      const ddx = lx - cx;
      const ddz = lz - cz;
      const d2 = ddx * ddx + ddz * ddz;
      if (d2 >= radius * radius) continue;
      let pushX = 0;
      let pushZ = 0;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        const push = (radius - d) / d;
        pushX = ddx * push;
        pushZ = ddz * push;
      } else {
        const toXEdge = o.hx - Math.abs(lx);
        const toZEdge = o.hz - Math.abs(lz);
        if (toXEdge < toZEdge) {
          pushX = (lx >= 0 ? 1 : -1) * (toXEdge + radius);
        } else {
          pushZ = (lz >= 0 ? 1 : -1) * (toZEdge + radius);
        }
      }
      px += pushX * cos - pushZ * sin;
      pz += pushX * sin + pushZ * cos;
    }
  }
  return { x: px, z: pz };
}
