import type { Vec3, WildlifePatch, WildlifePatchAnimal } from "./world-protocol";

export interface WildlifePresentationPose extends WildlifePatchAnimal {
  sampleAgeMs: number;
  extrapolated: boolean;
}

export interface WildlifeInterpolationOptions {
  interpolationDelayMs: number;
  maxExtrapolationMs: number;
  teleportDistanceMeters: number;
}

interface TimedSample {
  animal: WildlifePatchAnimal;
  serverTimeMs: number;
}

const DEFAULT_OPTIONS: WildlifeInterpolationOptions = {
  interpolationDelayMs: 120,
  maxExtrapolationMs: 250,
  teleportDistanceMeters: 12,
};

function distance(a: Vec3, b: Vec3): number {
  return Math.hypot(b.x - a.x, b.y - a.y, b.z - a.z);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function lerpPosition(a: Vec3, b: Vec3, t: number): Vec3 {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t), z: lerp(a.z, b.z, t) };
}

function lerpAngle(a: number, b: number, t: number): number {
  const delta = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + delta * t;
}

/**
 * Keeps only two authoritative samples per animal. The render loop reads from this
 * buffer; it never feeds interpolated positions back into simulation or persistence.
 */
export class WildlifeInterpolationBuffer {
  readonly #options: WildlifeInterpolationOptions;
  readonly #samples = new Map<string, [TimedSample?, TimedSample?]>();
  readonly #herdSequences = new Map<string, number>();

  constructor(options: Partial<WildlifeInterpolationOptions> = {}) {
    this.#options = { ...DEFAULT_OPTIONS, ...options };
  }

  applyPatch(patch: WildlifePatch): boolean {
    const previousSequence = this.#herdSequences.get(patch.herdId) ?? -1;
    if (patch.seq <= previousSequence) return false;
    const serverTimeMs = Date.parse(patch.serverTime);
    if (!Number.isFinite(serverTimeMs)) return false;

    for (const animal of patch.animals) {
      const pair = this.#samples.get(animal.id) ?? [];
      const newest = pair[1];
      if (newest && animal.revision <= newest.animal.revision) continue;
      const next: TimedSample = { animal, serverTimeMs };
      this.#samples.set(animal.id, [newest, next]);
    }
    this.#herdSequences.set(patch.herdId, patch.seq);
    return true;
  }

  remove(animalId: string): void {
    this.#samples.delete(animalId);
  }

  clear(): void {
    this.#samples.clear();
    this.#herdSequences.clear();
  }

  sample(animalId: string, nowMs: number): WildlifePresentationPose | null {
    const pair = this.#samples.get(animalId);
    const newest = pair?.[1];
    if (!newest) return null;
    const older = pair?.[0];
    const targetTime = nowMs - this.#options.interpolationDelayMs;
    const age = Math.max(0, nowMs - newest.serverTimeMs);

    if (!older || distance(older.animal.position, newest.animal.position) > this.#options.teleportDistanceMeters) {
      return { ...newest.animal, sampleAgeMs: age, extrapolated: false };
    }

    const span = newest.serverTimeMs - older.serverTimeMs;
    if (span <= 0) {
      return { ...newest.animal, sampleAgeMs: age, extrapolated: false };
    }
    if (targetTime >= newest.serverTimeMs) {
      const extrapolationMs = Math.min(
        Math.max(0, targetTime - newest.serverTimeMs),
        this.#options.maxExtrapolationMs,
      );
      if (extrapolationMs <= 0) {
        return { ...newest.animal, sampleAgeMs: age, extrapolated: false };
      }
      const factor = extrapolationMs / span;
      const velocity = {
        x: newest.animal.position.x - older.animal.position.x,
        y: newest.animal.position.y - older.animal.position.y,
        z: newest.animal.position.z - older.animal.position.z,
      };
      return {
        ...newest.animal,
        position: {
          x: newest.animal.position.x + velocity.x * factor,
          y: newest.animal.position.y + velocity.y * factor,
          z: newest.animal.position.z + velocity.z * factor,
        },
        sampleAgeMs: age,
        extrapolated: true,
      };
    }

    const t = Math.max(0, Math.min(1, (targetTime - older.serverTimeMs) / span));
    return {
      ...newest.animal,
      position: lerpPosition(older.animal.position, newest.animal.position, t),
      rotationY: lerpAngle(older.animal.rotationY, newest.animal.rotationY, t),
      sampleAgeMs: age,
      extrapolated: false,
    };
  }

  sampleAll(nowMs: number): WildlifePresentationPose[] {
    const poses: WildlifePresentationPose[] = [];
    for (const animalId of this.#samples.keys()) {
      const pose = this.sample(animalId, nowMs);
      if (pose) poses.push(pose);
    }
    return poses;
  }
}
