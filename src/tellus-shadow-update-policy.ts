import type { DayNightMode } from "./tellus-types";

export type ShadowRefreshReason =
  | "initial"
  | "invalidated"
  | "mode-change"
  | "sun-angle"
  | "reconcile";

export type ShadowUpdateDecision = {
  refresh: boolean;
  reason: ShadowRefreshReason | null;
};

export type ShadowUpdateInput = {
  enabled: boolean;
  mode: DayNightMode;
  phase: number;
  nowMs: number;
};

export type ShadowUpdatePolicyOptions = {
  /** Smallest sun movement worth paying for in a cycling world. Defaults to 0.25 degrees. */
  cycleAngleStepRadians?: number;
  /** Hard ceiling for cycling refresh frequency. */
  cycleMinIntervalMs?: number;
  /** Safety refresh for streamed or otherwise unreported caster changes. */
  reconcileIntervalMs?: number;
};

const TAU = Math.PI * 2;
const DEFAULT_CYCLE_ANGLE_STEP_RADIANS = (Math.PI / 180) * 0.25;
const DEFAULT_CYCLE_MIN_INTERVAL_MS = 100;
const DEFAULT_RECONCILE_INTERVAL_MS = 5_000;
const FIXED_PHASE_EPSILON = 1e-6;

function normalizedPhase(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return ((value % 1) + 1) % 1;
}

function phaseDistance(a: number, b: number): number {
  const direct = Math.abs(normalizedPhase(a) - normalizedPhase(b));
  return Math.min(direct, 1 - direct);
}

export class ShadowUpdatePolicy {
  private readonly cyclePhaseStep: number;
  private readonly cycleMinIntervalMs: number;
  private readonly reconcileIntervalMs: number;
  private invalidated = true;
  private lastMode: DayNightMode | null = null;
  private lastRefreshPhase = 0;
  private lastRefreshAt = 0;
  private refreshes = 0;
  private skips = 0;
  private lastReason: ShadowRefreshReason | null = null;

  constructor(options: ShadowUpdatePolicyOptions = {}) {
    this.cyclePhaseStep =
      Math.max(0, options.cycleAngleStepRadians ?? DEFAULT_CYCLE_ANGLE_STEP_RADIANS) /
      TAU;
    this.cycleMinIntervalMs = Math.max(0, options.cycleMinIntervalMs ?? DEFAULT_CYCLE_MIN_INTERVAL_MS);
    this.reconcileIntervalMs = Math.max(1, options.reconcileIntervalMs ?? DEFAULT_RECONCILE_INTERVAL_MS);
  }

  invalidate(): void {
    this.invalidated = true;
  }

  next(input: ShadowUpdateInput): ShadowUpdateDecision {
    if (!input.enabled) {
      this.skips++;
      return { refresh: false, reason: null };
    }

    const phase = normalizedPhase(input.phase);
    const elapsed = this.refreshes === 0 ? Number.POSITIVE_INFINITY : input.nowMs - this.lastRefreshAt;
    let reason: ShadowRefreshReason | null = null;

    if (this.refreshes === 0) {
      reason = "initial";
    } else if (this.invalidated) {
      reason = "invalidated";
    } else if (input.mode !== this.lastMode) {
      reason = "mode-change";
    } else if (input.mode !== "cycle" && phaseDistance(phase, this.lastRefreshPhase) > FIXED_PHASE_EPSILON) {
      // Pause can keep the same mode while its authored phase changes.
      reason = "mode-change";
    } else if (
      input.mode === "cycle" &&
      elapsed >= this.cycleMinIntervalMs &&
      phaseDistance(phase, this.lastRefreshPhase) >= this.cyclePhaseStep
    ) {
      reason = "sun-angle";
    } else if (elapsed >= this.reconcileIntervalMs) {
      // This is intentionally slow. It catches streamed casters that do not yet report explicit
      // invalidation without turning frozen worlds back into continuously rendered shadow maps.
      reason = "reconcile";
    }

    if (!reason) {
      this.skips++;
      return { refresh: false, reason: null };
    }

    this.invalidated = false;
    this.lastMode = input.mode;
    this.lastRefreshPhase = phase;
    this.lastRefreshAt = input.nowMs;
    this.refreshes++;
    this.lastReason = reason;
    return { refresh: true, reason };
  }

  diagnostics() {
    return {
      refreshes: this.refreshes,
      skips: this.skips,
      lastReason: this.lastReason,
      lastRefreshAt: this.lastRefreshAt,
      lastRefreshPhase: this.lastRefreshPhase,
      mode: this.lastMode,
      invalidated: this.invalidated,
    };
  }
}
