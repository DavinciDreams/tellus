/**
 * Shared client-rendering pressure policy.
 *
 * Measurement and hysteresis live here. Render systems receive an immutable snapshot and decide only
 * how to apply its generic LOD/work recommendations. Hyades remains authoritative for world state and
 * server workload limits; browser frame pressure never crosses that boundary.
 */
export type RenderPressureLevel =
  | "warming"
  | "headroom"
  | "balanced"
  | "constrained"
  | "critical";

export type RenderQualityRecommendation = "reduce" | "hold" | "increase";

export interface RenderPressureSnapshot {
  level: RenderPressureLevel;
  fps: number;
  frameWorkMs: number;
  stableForMs: number;
  lodBias: 0 | 1 | 2;
  qualityRecommendation: RenderQualityRecommendation;
  qualityStepIntervalMs: number;
  work: {
    maxJobs: number;
    maxMs: number;
    stationaryMaxJobs: number;
    stationaryMaxMs: number;
    movingIntervalMs: number;
  };
  background: {
    allowed: boolean;
    minStableMs: number;
    intervalMs: number;
    blocked: boolean;
  };
}

export type RenderPressureInput = RenderPressureSnapshot | number;

export interface RenderPressureSample {
  fps: number;
  frameWorkMs: number;
  nowMs: number;
  active?: boolean;
}

export interface RenderPressureController {
  observe(sample: RenderPressureSample): RenderPressureSnapshot;
  snapshot(nowMs?: number): RenderPressureSnapshot;
}

interface LevelPolicy {
  lodBias: 0 | 1 | 2;
  maxJobs: number;
  maxMs: number;
  stationaryMaxJobs: number;
  stationaryMaxMs: number;
  movingIntervalMs: number;
  backgroundMinStableMs: number;
  backgroundIntervalMs: number;
}

const LEVEL_POLICIES: Record<RenderPressureLevel, LevelPolicy> = {
  warming: {
    lodBias: 1,
    maxJobs: 1,
    maxMs: 2.5,
    stationaryMaxJobs: 1,
    stationaryMaxMs: 2.5,
    movingIntervalMs: 250,
    backgroundMinStableMs: Number.POSITIVE_INFINITY,
    backgroundIntervalMs: Number.POSITIVE_INFINITY,
  },
  critical: {
    lodBias: 2,
    maxJobs: 1,
    maxMs: 2.5,
    stationaryMaxJobs: 1,
    stationaryMaxMs: 2.5,
    movingIntervalMs: 250,
    backgroundMinStableMs: 15_000,
    backgroundIntervalMs: 15_000,
  },
  constrained: {
    lodBias: 2,
    maxJobs: 1,
    maxMs: 2.5,
    stationaryMaxJobs: 1,
    stationaryMaxMs: 2.5,
    movingIntervalMs: 250,
    backgroundMinStableMs: 10_000,
    backgroundIntervalMs: 10_000,
  },
  balanced: {
    lodBias: 1,
    maxJobs: 2,
    maxMs: 5,
    stationaryMaxJobs: 2,
    stationaryMaxMs: 5,
    movingIntervalMs: 160,
    backgroundMinStableMs: 6_000,
    backgroundIntervalMs: 6_000,
  },
  headroom: {
    lodBias: 0,
    maxJobs: 3,
    maxMs: 8,
    stationaryMaxJobs: 4,
    stationaryMaxMs: 8,
    movingIntervalMs: 100,
    backgroundMinStableMs: 3_000,
    backgroundIntervalMs: 3_000,
  },
};

const LEVEL_ORDER: Exclude<RenderPressureLevel, "warming">[] = [
  "headroom",
  "balanced",
  "constrained",
  "critical",
];

const WARMUP_MS = 1_000;
const PRESSURE_ENTRY_MS = 1_200;
const PRESSURE_RECOVERY_MS = 3_000;
const LONG_FRAME_MS = 45;
const LONG_FRAME_BACKGROUND_COOLDOWN_MS = 3_000;
const QUALITY_REDUCE_STABLE_MS = 1_200;
const QUALITY_INCREASE_STABLE_MS = 3_000;
const QUALITY_STEP_INTERVAL_MS = 2_500;

const desiredLevel = (fps: number, frameWorkMs: number): Exclude<RenderPressureLevel, "warming"> => {
  if (fps < 20 || frameWorkMs >= 26) return "critical";
  if (fps < 28 || frameWorkMs >= 18) return "constrained";
  if (fps < 48 || frameWorkMs >= 11) return "balanced";
  return "headroom";
};

export const renderPressureSnapshotFor = (
  level: RenderPressureLevel,
  metrics: {
    fps?: number;
    frameWorkMs?: number;
    stableForMs?: number;
    backgroundBlocked?: boolean;
  } = {},
): RenderPressureSnapshot => {
  const policy = LEVEL_POLICIES[level];
  const stableForMs = Math.max(0, metrics.stableForMs ?? 0);
  const backgroundBlocked = metrics.backgroundBlocked ?? false;
  const qualityRecommendation: RenderQualityRecommendation = backgroundBlocked
    ? "hold"
    : (level === "critical" || level === "constrained") && stableForMs >= QUALITY_REDUCE_STABLE_MS
      ? "reduce"
      : level === "headroom" && stableForMs >= QUALITY_INCREASE_STABLE_MS
        ? "increase"
        : "hold";

  return {
    level,
    fps: Math.max(0, metrics.fps ?? 0),
    frameWorkMs: Math.max(0, metrics.frameWorkMs ?? 0),
    stableForMs,
    lodBias: policy.lodBias,
    qualityRecommendation,
    qualityStepIntervalMs: QUALITY_STEP_INTERVAL_MS,
    work: {
      maxJobs: policy.maxJobs,
      maxMs: policy.maxMs,
      stationaryMaxJobs: policy.stationaryMaxJobs,
      stationaryMaxMs: policy.stationaryMaxMs,
      movingIntervalMs: policy.movingIntervalMs,
    },
    background: {
      allowed:
        level !== "warming" &&
        !backgroundBlocked &&
        stableForMs >= policy.backgroundMinStableMs,
      minStableMs: policy.backgroundMinStableMs,
      intervalMs: policy.backgroundIntervalMs,
      blocked: backgroundBlocked,
    },
  };
};

/**
 * Compatibility adapter for standalone renderer tests and embedders that still pass a numeric FPS.
 * The application runtime passes a controller snapshot, so raw-FPS classification remains centralized.
 */
export const resolveRenderPressure = (input: RenderPressureInput): RenderPressureSnapshot => {
  if (typeof input !== "number") return input;
  if (!Number.isFinite(input) || input <= 0) return renderPressureSnapshotFor("warming");
  return renderPressureSnapshotFor(desiredLevel(input, 0), {
    fps: input,
    stableForMs: Number.POSITIVE_INFINITY,
  });
};

export const createRenderPressureController = (): RenderPressureController => {
  let level: RenderPressureLevel = "warming";
  let levelSinceMs = 0;
  let candidate: Exclude<RenderPressureLevel, "warming"> | null = null;
  let candidateSinceMs = 0;
  let lastNowMs = 0;
  let lastFps = 0;
  let frameWorkEmaMs = 0;
  let hasFrameWorkSample = false;
  let backgroundBlockedUntilMs = 0;

  const snapshot = (nowMs = lastNowMs): RenderPressureSnapshot =>
    renderPressureSnapshotFor(level, {
      fps: lastFps,
      frameWorkMs: frameWorkEmaMs,
      stableForMs: level === "warming" ? 0 : Math.max(0, nowMs - levelSinceMs),
      backgroundBlocked: nowMs < backgroundBlockedUntilMs,
    });

  const observe = ({ fps, frameWorkMs, nowMs, active = true }: RenderPressureSample): RenderPressureSnapshot => {
    lastNowMs = Math.max(lastNowMs, nowMs);
    if (!active) {
      lastFps = 0;
      candidate = null;
      if (level !== "warming") levelSinceMs = lastNowMs;
      backgroundBlockedUntilMs = Math.max(
        backgroundBlockedUntilMs,
        lastNowMs + LONG_FRAME_BACKGROUND_COOLDOWN_MS,
      );
      return snapshot();
    }
    lastFps = Number.isFinite(fps) && fps > 0 ? fps : 0;
    const boundedWorkMs = Number.isFinite(frameWorkMs) ? Math.max(0, frameWorkMs) : 0;
    if (!hasFrameWorkSample) {
      frameWorkEmaMs = boundedWorkMs;
      hasFrameWorkSample = true;
    } else {
      const alpha = boundedWorkMs > frameWorkEmaMs ? 0.18 : 0.08;
      frameWorkEmaMs += (boundedWorkMs - frameWorkEmaMs) * alpha;
    }
    if (boundedWorkMs >= LONG_FRAME_MS) {
      backgroundBlockedUntilMs = Math.max(
        backgroundBlockedUntilMs,
        lastNowMs + LONG_FRAME_BACKGROUND_COOLDOWN_MS,
      );
    }
    if (lastFps <= 0) return snapshot();

    const desired = desiredLevel(lastFps, frameWorkEmaMs);
    if (level === "warming") {
      if (candidate !== desired) {
        candidate = desired;
        candidateSinceMs = lastNowMs;
      } else if (lastNowMs - candidateSinceMs >= WARMUP_MS) {
        level = desired;
        levelSinceMs = lastNowMs;
        candidate = null;
      }
      return snapshot();
    }

    if (desired === level) {
      candidate = null;
      return snapshot();
    }
    if (candidate !== desired) {
      candidate = desired;
      candidateSinceMs = lastNowMs;
      return snapshot();
    }

    const currentIndex = LEVEL_ORDER.indexOf(level);
    const desiredIndex = LEVEL_ORDER.indexOf(desired);
    const movingTowardPressure = desiredIndex > currentIndex;
    const requiredMs = movingTowardPressure ? PRESSURE_ENTRY_MS : PRESSURE_RECOVERY_MS;
    if (lastNowMs - candidateSinceMs < requiredMs) return snapshot();

    level = LEVEL_ORDER[currentIndex + Math.sign(desiredIndex - currentIndex)]!;
    levelSinceMs = lastNowMs;
    candidate = null;
    return snapshot();
  };

  return { observe, snapshot };
};
