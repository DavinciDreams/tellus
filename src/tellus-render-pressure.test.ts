import { describe, expect, it } from "vitest";
import {
  createRenderPressureController,
  renderPressureSnapshotFor,
} from "./tellus-render-pressure";

describe("render pressure", () => {
  it("warms up before publishing a quality decision", () => {
    const controller = createRenderPressureController();

    expect(controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 0 }).level).toBe("warming");
    expect(controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 999 }).level).toBe("warming");
    const ready = controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 1_000 });

    expect(ready.level).toBe("headroom");
    expect(ready.qualityRecommendation).toBe("hold");
    expect(ready.background.allowed).toBe(false);
  });

  it("treats a stable 30 FPS cap with cheap frames as balanced instead of overloaded", () => {
    const controller = createRenderPressureController();
    controller.observe({ fps: 30, frameWorkMs: 6, nowMs: 0 });
    const balanced = controller.observe({ fps: 30, frameWorkMs: 6, nowMs: 1_000 });
    const settled = controller.observe({ fps: 30, frameWorkMs: 6, nowMs: 7_000 });

    expect(balanced.level).toBe("balanced");
    expect(balanced.qualityRecommendation).toBe("hold");
    expect(settled.background.allowed).toBe(true);
    expect(settled.background.intervalMs).toBe(6_000);
    expect(settled.lodBias).toBe(1);
  });

  it("distinguishes an overloaded 30 FPS frame budget from a refresh-rate cap", () => {
    const controller = createRenderPressureController();
    controller.observe({ fps: 30, frameWorkMs: 24, nowMs: 0 });
    controller.observe({ fps: 30, frameWorkMs: 24, nowMs: 1_000 });
    const pressured = controller.observe({ fps: 30, frameWorkMs: 24, nowMs: 2_200 });

    expect(pressured.level).toBe("constrained");
    expect(pressured.qualityRecommendation).toBe("reduce");
    expect(pressured.work.maxJobs).toBe(1);
    expect(pressured.background.allowed).toBe(false);
  });

  it("eventually permits bounded refinement even at a stable low frame rate", () => {
    const controller = createRenderPressureController();
    controller.observe({ fps: 18, frameWorkMs: 8, nowMs: 0 });
    controller.observe({ fps: 18, frameWorkMs: 8, nowMs: 1_000 });
    const settled = controller.observe({ fps: 18, frameWorkMs: 8, nowMs: 16_000 });

    expect(settled.level).toBe("critical");
    expect(settled.background.allowed).toBe(true);
    expect(settled.background.intervalMs).toBe(15_000);
  });

  it("blocks background work after one long frame without immediately collapsing quality", () => {
    const controller = createRenderPressureController();
    controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 0 });
    controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 1_000 });
    const before = controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 4_000 });
    const hitch = controller.observe({ fps: 60, frameWorkMs: 70, nowMs: 4_016 });

    expect(before.level).toBe("headroom");
    expect(before.background.allowed).toBe(true);
    expect(hitch.level).toBe("headroom");
    expect(hitch.background.blocked).toBe(true);
    expect(hitch.qualityRecommendation).toBe("hold");
  });

  it("moves through pressure levels one step at a time and recovers more slowly", () => {
    const controller = createRenderPressureController();
    controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 0 });
    controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 1_000 });
    controller.observe({ fps: 18, frameWorkMs: 30, nowMs: 2_000 });
    const degraded = controller.observe({ fps: 18, frameWorkMs: 30, nowMs: 3_200 });

    expect(degraded.level).toBe("balanced");

    for (let nowMs = 3_300; nowMs <= 5_000; nowMs += 100) {
      controller.observe({ fps: 60, frameWorkMs: 4, nowMs });
    }
    const recovered = controller.observe({ fps: 60, frameWorkMs: 4, nowMs: 8_000 });

    expect(recovered.level).toBe("headroom");
  });

  it("does not interpret a throttled background tab as renderer pressure", () => {
    const controller = createRenderPressureController();
    controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 0 });
    controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 1_000 });
    controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 4_000 });

    const hidden = controller.observe({ fps: 1, frameWorkMs: 1, nowMs: 10_000, active: false });
    const resumed = controller.observe({ fps: 60, frameWorkMs: 6, nowMs: 10_016 });

    expect(hidden.level).toBe("headroom");
    expect(hidden.background.blocked).toBe(true);
    expect(hidden.qualityRecommendation).toBe("hold");
    expect(resumed.level).toBe("headroom");
    expect(resumed.background.allowed).toBe(false);
  });

  it("keeps policy mapping pure for renderer-specific consumers", () => {
    const headroom = renderPressureSnapshotFor("headroom", { stableForMs: 3_000 });
    const constrained = renderPressureSnapshotFor("constrained", { stableForMs: 10_000 });

    expect(headroom.work).toEqual({
      maxJobs: 3,
      maxMs: 8,
      stationaryMaxJobs: 4,
      stationaryMaxMs: 8,
      movingIntervalMs: 100,
    });
    expect(headroom.background.allowed).toBe(true);
    expect(constrained.lodBias).toBe(2);
    expect(constrained.background.allowed).toBe(true);
  });
});
