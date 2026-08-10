import { mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { preview } from "vite";

const url = process.env.TELLUS_WEBGL_PERF_URL ?? "http://127.0.0.1:4344/";
const resultPath = resolve(
  process.env.TELLUS_WEBGL_PERF_RESULT ?? "performance-results/tellus-procplants-webgl.json",
);
const sampleDurationMs = Number(process.env.TELLUS_WEBGL_PERF_SAMPLE_MS ?? 5_000);
const sampleCount = Number(process.env.TELLUS_WEBGL_PERF_SAMPLES ?? 3);
const settleTimeoutMs = Number(process.env.TELLUS_WEBGL_PERF_SETTLE_MS ?? 180_000);
const stableWindowMs = Number(process.env.TELLUS_WEBGL_PERF_STABLE_MS ?? 5_000);
const density = Number(process.env.TELLUS_WEBGL_PERF_DENSITY ?? 1);
const requireHardware = process.env.TELLUS_WEBGL_PERF_REQUIRE_HARDWARE === "1";
const enforceTiming = process.env.TELLUS_WEBGL_PERF_ENFORCE_TIMING === "1";
const executablePath = process.env.TELLUS_WEBGL_PERF_EXECUTABLE_PATH || undefined;
const budgets = {
  minMedianFps: Number(process.env.TELLUS_WEBGL_PERF_MIN_FPS ?? 30),
  maxMedianP95FrameMs: Number(process.env.TELLUS_WEBGL_PERF_MAX_P95_MS ?? 50),
  maxMedianLongFrameRatio: Number(process.env.TELLUS_WEBGL_PERF_MAX_LONG_RATIO ?? 0.05),
  maxSteadyProcplantUpdateMs: Number(process.env.TELLUS_WEBGL_PERF_MAX_UPDATE_MS ?? 16),
  maxSteadyProcplantBuildMs: Number(process.env.TELLUS_WEBGL_PERF_MAX_BUILD_MS ?? 50),
};

if (!Number.isFinite(sampleDurationMs) || sampleDurationMs < 1_000 || sampleDurationMs > 60_000) {
  throw new Error("TELLUS_WEBGL_PERF_SAMPLE_MS must be between 1000 and 60000");
}
if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > 20) {
  throw new Error("TELLUS_WEBGL_PERF_SAMPLES must be an integer between 1 and 20");
}
if (!Number.isFinite(settleTimeoutMs) || settleTimeoutMs < 10_000 || settleTimeoutMs > 600_000) {
  throw new Error("TELLUS_WEBGL_PERF_SETTLE_MS must be between 10000 and 600000");
}
if (!Number.isFinite(stableWindowMs) || stableWindowMs < 1_000 || stableWindowMs > 60_000) {
  throw new Error("TELLUS_WEBGL_PERF_STABLE_MS must be between 1000 and 60000");
}
if (!Number.isFinite(density) || density <= 0 || density > 4) {
  throw new Error("TELLUS_WEBGL_PERF_DENSITY must be greater than 0 and at most 4");
}

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[Math.max(0, index)] ?? 0;
};
const median = (values) => percentile(values, 0.5);
const round = (value, digits = 2) => {
  const scale = 10 ** digits;
  return Math.round(value * scale) / scale;
};

const previewServer = await preview({
  preview: { host: "127.0.0.1", port: 4344, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath,
    args: [
      "--enable-gpu",
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--use-angle=d3d11",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const consoleErrors = [];
  const websocketFrames = { received: 0, parseErrors: 0, types: {} };
  page.on("websocket", (socket) => {
    socket.on("framereceived", ({ payload }) => {
      websocketFrames.received++;
      if (typeof payload !== "string") return;
      try {
        const parsed = JSON.parse(payload);
        const type = typeof parsed?.type === "string" ? parsed.type : "untyped";
        websocketFrames.types[type] = (websocketFrames.types[type] ?? 0) + 1;
      } catch {
        websocketFrames.parseErrors++;
      }
    });
  });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push(error.message));
  await page.addInitScript(({ requestedDensity }) => {
    window.__tellusWebglBenchmark = { startedAt: performance.now(), worldReadyAt: 0, worldReadyReason: "" };
    window.addEventListener("tellus:world-ready", (event) => {
      window.__tellusWebglBenchmark.worldReadyAt = performance.now();
      window.__tellusWebglBenchmark.worldReadyReason = event.detail?.reason ?? "unknown";
    });
    localStorage.setItem("tellus.renderer", "webgl");
    localStorage.setItem("tellus.procplants", "1");
    localStorage.setItem("tellus.procplants.density", String(requestedDensity));
    localStorage.removeItem("tellus.terrainOnly");
    localStorage.removeItem("tellus.lowGpu");
    localStorage.setItem("tellus.renderEvery", "1");
  }, { requestedDensity: density });

  const navigationStartedAt = Date.now();
  await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForFunction(() => typeof window.__tellusPerf === "function", null, { timeout: 60_000 });
  const perfHookReadyAt = Date.now();
  await page.waitForFunction(() => {
    const perf = window.__tellusPerf?.();
    return perf?.renderer?.backend === "webgl" &&
      perf?.procplants?.centerChunkBuilt === true &&
      perf?.procplants?.chunks > 0 &&
      window.__tellusWebglBenchmark?.worldReadyAt > 0;
  }, null, { timeout: 120_000 });
  const visibleWorldReadyAt = Date.now();
  const visibleReadyPerf = await page.evaluate(() => window.__tellusPerf?.());
  const settleStartedAt = Date.now();
  let settled = false;
  let stableSince = 0;
  let settleSnapshot = visibleReadyPerf;
  while (Date.now() - settleStartedAt < settleTimeoutMs) {
    settleSnapshot = await page.evaluate(() => window.__tellusPerf?.());
    const currentlySettled = settleSnapshot?.procplants?.nearChunksBuilt >= settleSnapshot?.procplants?.nearChunks &&
        settleSnapshot?.procplants?.queuedRebuilds === 0 &&
        settleSnapshot?.procplants?.deferredLodChunks === 0 &&
        settleSnapshot?.procplants?.deferredColdChunks === 0 &&
        settleSnapshot?.chunkTerrain?.pending === 0 &&
        settleSnapshot?.chunkTerrain?.queued === 0 &&
        settleSnapshot?.chunkTerrain?.inflight === 0;
    if (currentlySettled) {
      stableSince ||= Date.now();
      if (Date.now() - stableSince >= stableWindowMs) {
        settled = true;
        break;
      }
    } else {
      stableSince = 0;
    }
    await page.waitForTimeout(1_000);
  }
  const worldSettledAt = Date.now();
  await page.waitForTimeout(2_000);

  const rendererIdentity = await page.evaluate(() => {
    const canvas = document.querySelector("canvas");
    const gl = canvas?.getContext("webgl2") ?? canvas?.getContext("webgl");
    if (!gl) return { vendor: "unavailable", renderer: "unavailable", unmaskedVendor: "", unmaskedRenderer: "" };
    const extension = gl.getExtension("WEBGL_debug_renderer_info");
    return {
      vendor: gl.getParameter(gl.VENDOR),
      renderer: gl.getParameter(gl.RENDERER),
      unmaskedVendor: extension ? gl.getParameter(extension.UNMASKED_VENDOR_WEBGL) : "",
      unmaskedRenderer: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : "",
    };
  });
  const identityText = Object.values(rendererIdentity).join(" ").toLowerCase();
  const softwareRenderer = /swiftshader|llvmpipe|software|microsoft basic render/.test(identityText);

  await page.evaluate(() => window.__tellusPerfReset?.());
  const samples = [];
  for (let sampleIndex = 0; sampleIndex < sampleCount; sampleIndex++) {
    samples.push(await page.evaluate(async (durationMs) => {
      const deltas = [];
      const startedAt = performance.now();
      let previous = startedAt;
      await new Promise((resolve) => {
        const tick = (now) => {
          deltas.push(now - previous);
          previous = now;
          if (now - startedAt >= durationMs) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      deltas.shift();
      const elapsedMs = deltas.reduce((sum, value) => sum + value, 0);
      const ordered = [...deltas].sort((a, b) => a - b);
      const at = (fraction) => ordered[Math.min(ordered.length - 1, Math.floor(ordered.length * fraction))] ?? 0;
      return {
        frames: deltas.length,
        elapsedMs,
        fps: elapsedMs > 0 ? deltas.length * 1_000 / elapsedMs : 0,
        p50FrameMs: at(0.5),
        p95FrameMs: at(0.95),
        p99FrameMs: at(0.99),
        longFrameRatio: deltas.filter((value) => value > 50).length / Math.max(1, deltas.length),
        perf: window.__tellusPerf?.(),
      };
    }, sampleDurationMs));
  }

  const finalPerf = await page.evaluate(() => window.__tellusPerf?.());
  const remainedSettled = finalPerf?.procplants?.queuedRebuilds === 0 &&
    finalPerf?.procplants?.deferredLodChunks === 0 &&
    finalPerf?.procplants?.deferredColdChunks === 0 &&
    finalPerf?.chunkTerrain?.pending === 0 &&
    finalPerf?.chunkTerrain?.queued === 0 &&
    finalPerf?.chunkTerrain?.inflight === 0;
  const browserTiming = await page.evaluate(() => {
    const navigation = performance.getEntriesByType("navigation")[0];
    return {
      domContentLoadedMs: navigation?.domContentLoadedEventEnd ?? 0,
      loadMs: navigation?.loadEventEnd ?? 0,
      transferBytes: performance.getEntriesByType("resource").reduce(
        (sum, entry) => sum + (entry.transferSize ?? 0),
        0,
      ),
      worldReadyAt: window.__tellusWebglBenchmark?.worldReadyAt ?? 0,
      worldReadyReason: window.__tellusWebglBenchmark?.worldReadyReason ?? "",
      visibilityState: document.visibilityState,
      hidden: document.hidden,
    };
  });
  const summary = {
    fps: round(median(samples.map((sample) => sample.fps))),
    p95FrameMs: round(median(samples.map((sample) => sample.p95FrameMs))),
    longFrameRatio: round(median(samples.map((sample) => sample.longFrameRatio)), 4),
    maxSampleProcplantUpdateMs: round(Math.max(...samples.map((sample) => sample.perf?.procplants?.lastUpdateMs ?? 0))),
    maxSampleProcplantBuildMs: round(Math.max(...samples.map((sample) => sample.perf?.procplants?.lastBuildMs ?? 0))),
  };
  const structuralFailures = [
    finalPerf?.renderer?.backend !== "webgl" && "renderer backend is not WebGL",
    finalPerf?.procplants?.centerChunkBuilt !== true && "center procplant chunk was not built",
    finalPerf?.procplants?.chunks <= 0 && "no procplant chunks were active",
    !settled && `vegetation/chunk queues did not settle within ${settleTimeoutMs} ms`,
  ].filter(Boolean);
  const timingFailures = [
    summary.fps < budgets.minMedianFps && `median FPS ${summary.fps} < ${budgets.minMedianFps}`,
    summary.p95FrameMs > budgets.maxMedianP95FrameMs &&
      `median p95 ${summary.p95FrameMs} ms > ${budgets.maxMedianP95FrameMs} ms`,
    summary.longFrameRatio > budgets.maxMedianLongFrameRatio &&
      `long-frame ratio ${summary.longFrameRatio} > ${budgets.maxMedianLongFrameRatio}`,
    summary.maxSampleProcplantUpdateMs > budgets.maxSteadyProcplantUpdateMs &&
      `sample procplant update ${summary.maxSampleProcplantUpdateMs} ms > ${budgets.maxSteadyProcplantUpdateMs} ms`,
    summary.maxSampleProcplantBuildMs > budgets.maxSteadyProcplantBuildMs &&
      `sample procplant build ${summary.maxSampleProcplantBuildMs} ms > ${budgets.maxSteadyProcplantBuildMs} ms`,
    !remainedSettled && "vegetation/chunk queues reactivated during the timing samples",
  ].filter(Boolean);
  const environmentFailures = [
    requireHardware && softwareRenderer && `hardware renderer required, got ${rendererIdentity.unmaskedRenderer || rendererIdentity.renderer}`,
    browserTiming.hidden && "benchmark page was hidden",
  ].filter(Boolean);
  const failures = [
    ...structuralFailures,
    ...environmentFailures,
    ...(enforceTiming ? timingFailures : []),
  ];
  const result = {
    scenario: "Tellus default WebGL procplant field at 1280x720, density-controlled, cold-to-settled field",
    renderer: rendererIdentity,
    softwareRenderer,
    requireHardware,
    timingEnforced: enforceTiming,
    requestedDensity: density,
    sampleDurationMs,
    sampleCount,
    settleTimeoutMs,
    stableWindowMs,
    budgets,
    environment: {
      browserVersion: browser.version(),
      executablePath: executablePath ?? "playwright-default",
      platform: os.platform(),
      release: os.release(),
      cpuModel: os.cpus()[0]?.model ?? "unknown",
      logicalCpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      viewport: { width: 1280, height: 720, deviceScaleFactor: 1 },
    },
    websocketFrames,
    startup: {
      navigationToPerfHookMs: perfHookReadyAt - navigationStartedAt,
      navigationToVisibleWorldMs: visibleWorldReadyAt - navigationStartedAt,
      navigationToSettledWorldMs: worldSettledAt - navigationStartedAt,
      settled,
      remainedSettled,
      ...browserTiming,
    },
    cold: {
      visibleReady: visibleReadyPerf,
      settledSnapshot: settleSnapshot,
    },
    summary,
    samples,
    final: finalPerf,
    passed: failures.length === 0,
    failures,
    structuralFailures,
    timingFailures,
    environmentFailures,
    consoleErrors,
    claimBoundary: softwareRenderer
      ? "Software-renderer structural/correctness evidence only; no representative-device FPS claim."
      : enforceTiming && requireHardware
        ? "Hardware-identified controlled run; repeat under documented power/browser conditions before changing defaults."
        : "Hardware identity recorded, but timing is non-gating and is not a default-change claim.",
  };
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolvePromise, rejectPromise) => {
    previewServer.httpServer.closeAllConnections();
    previewServer.httpServer.close((error) => error ? rejectPromise(error) : resolvePromise());
  });
}
