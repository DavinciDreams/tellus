import { describe, expect, it } from "vitest";
import { ShadowUpdatePolicy } from "./tellus-shadow-update-policy";

describe("ShadowUpdatePolicy", () => {
  it("renders once and then caches shadows in a fixed world", () => {
    const policy = new ShadowUpdatePolicy({ reconcileIntervalMs: 5_000 });

    expect(policy.next({ enabled: true, mode: "day", phase: 0.25, nowMs: 100 })).toEqual({
      refresh: true,
      reason: "initial",
    });
    expect(policy.next({ enabled: true, mode: "day", phase: 0.25, nowMs: 4_999 })).toEqual({
      refresh: false,
      reason: null,
    });
    expect(policy.next({ enabled: true, mode: "day", phase: 0.25, nowMs: 5_100 })).toEqual({
      refresh: true,
      reason: "reconcile",
    });
  });

  it("refreshes fixed shadows when the authored phase changes", () => {
    const policy = new ShadowUpdatePolicy();
    policy.next({ enabled: true, mode: "pause", phase: 0.2, nowMs: 0 });

    expect(policy.next({ enabled: true, mode: "pause", phase: 0.6, nowMs: 16 })).toEqual({
      refresh: true,
      reason: "mode-change",
    });
  });

  it("uses sun-angle movement rather than frame count for cycling worlds", () => {
    const policy = new ShadowUpdatePolicy({
      cycleAngleStepRadians: Math.PI / 180,
      cycleMinIntervalMs: 100,
      reconcileIntervalMs: 10_000,
    });
    policy.next({ enabled: true, mode: "cycle", phase: 0.99, nowMs: 0 });

    expect(policy.next({ enabled: true, mode: "cycle", phase: 0.991, nowMs: 120 })).toEqual({
      refresh: false,
      reason: null,
    });
    expect(policy.next({ enabled: true, mode: "cycle", phase: 0.995, nowMs: 160 })).toEqual({
      refresh: true,
      reason: "sun-angle",
    });
    expect(policy.next({ enabled: true, mode: "cycle", phase: 0.001, nowMs: 320 })).toEqual({
      refresh: true,
      reason: "sun-angle",
    });
  });

  it("holds invalidation while shadows are disabled", () => {
    const policy = new ShadowUpdatePolicy();
    policy.next({ enabled: true, mode: "day", phase: 0.25, nowMs: 0 });
    policy.invalidate();

    expect(policy.next({ enabled: false, mode: "day", phase: 0.25, nowMs: 100 })).toEqual({
      refresh: false,
      reason: null,
    });
    expect(policy.next({ enabled: true, mode: "day", phase: 0.25, nowMs: 200 })).toEqual({
      refresh: true,
      reason: "invalidated",
    });
  });
});
