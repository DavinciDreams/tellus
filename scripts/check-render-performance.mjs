import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import process from "node:process";
import { chromium } from "playwright";
import { preview } from "vite";

const url = process.env.TELLUS_PERF_URL ?? "http://127.0.0.1:4344/tree-lod-gallery.html";
const resultPath = process.env.TELLUS_PERF_RESULT ?? "performance-results/tree-lod-gallery.json";
const sampleDurationMs = Number(process.env.TELLUS_PERF_SAMPLE_MS ?? 4_000);
const enforceTiming = process.env.TELLUS_PERF_ENFORCE_TIMING === "1";
const budgets = {
  minMedianFps: Number(process.env.TELLUS_PERF_MIN_FPS ?? 10),
  maxMedianP95FrameMs: Number(process.env.TELLUS_PERF_MAX_P95_MS ?? 200),
  maxMedianLongFrameRatio: Number(process.env.TELLUS_PERF_MAX_LONG_RATIO ?? 1),
  maxDrawCalls: Number(process.env.TELLUS_PERF_MAX_DRAW_CALLS ?? 550),
  maxTriangles: Number(process.env.TELLUS_PERF_MAX_TRIANGLES ?? 9_000),
};

const percentile = (values, fraction) => {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.floor(sorted.length * fraction));
  return sorted[Math.max(0, index)] ?? 0;
};

const median = (values) => percentile(values, 0.5);

const previewServer = await preview({
  preview: { host: "127.0.0.1", port: 4344, strictPort: true },
});
let browser;
try {
  browser = await chromium.launch({
    headless: true,
    args: [
      "--enable-webgl",
      "--ignore-gpu-blocklist",
      "--enable-unsafe-swiftshader",
      "--use-angle=swiftshader",
    ],
  });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "networkidle" });

  await page.getByRole("button", { name: "Extreme Cone", exact: true }).click();
  await page.locator("#density-slider").evaluate((element) => {
    const slider = /** @type {HTMLInputElement} */ (element);
    slider.value = "96";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForFunction(() => {
    const snapshot = window.__tellusTreeLodPerf?.();
    return snapshot?.ready && snapshot.candidateId === "extreme-cone" && snapshot.density === 96;
  });
  const forestStructure = await page.evaluate(() => window.__tellusTreeLodPerf?.());
  if (!forestStructure) throw new Error("Tree LOD performance hook was unavailable");

  await page.getByRole("button", { name: "Canopy Surface", exact: true }).click();
  await page.waitForFunction(() => {
    const snapshot = window.__tellusTreeLodPerf?.();
    return snapshot?.ready && snapshot.candidateId === "canopy-surface";
  });
  await page.waitForTimeout(1_500);

  const samples = [];
  for (let sample = 0; sample < 3; sample++) {
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
      const sorted = [...deltas].sort((a, b) => a - b);
      const at = (fraction) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * fraction))] ?? 0;
      return {
        frames: deltas.length,
        fps: elapsedMs > 0 ? deltas.length * 1_000 / elapsedMs : 0,
        p50FrameMs: at(0.5),
        p95FrameMs: at(0.95),
        p99FrameMs: at(0.99),
        longFrameRatio: deltas.filter((value) => value > 50).length / Math.max(1, deltas.length),
      };
    }, sampleDurationMs));
  }

  const timedScene = await page.evaluate(() => window.__tellusTreeLodPerf?.());
  if (!timedScene) throw new Error("Timed canopy scene diagnostics were unavailable");
  const summary = {
    fps: median(samples.map((sample) => sample.fps)),
    p95FrameMs: median(samples.map((sample) => sample.p95FrameMs)),
    longFrameRatio: median(samples.map((sample) => sample.longFrameRatio)),
  };
  const timingFailures = [
    summary.fps < budgets.minMedianFps && `median FPS ${summary.fps.toFixed(1)} < ${budgets.minMedianFps}`,
    summary.p95FrameMs > budgets.maxMedianP95FrameMs && `median p95 ${summary.p95FrameMs.toFixed(1)} ms > ${budgets.maxMedianP95FrameMs} ms`,
    summary.longFrameRatio > budgets.maxMedianLongFrameRatio && `long-frame ratio ${(summary.longFrameRatio * 100).toFixed(1)}% > ${budgets.maxMedianLongFrameRatio * 100}%`,
  ].filter(Boolean);
  const structuralFailures = [
    forestStructure.renderer.calls > budgets.maxDrawCalls && `draw calls ${forestStructure.renderer.calls} > ${budgets.maxDrawCalls}`,
    forestStructure.renderer.triangles > budgets.maxTriangles && `triangles ${forestStructure.renderer.triangles} > ${budgets.maxTriangles}`,
  ].filter(Boolean);
  const failures = [...structuralFailures, ...(enforceTiming ? timingFailures : [])];
  const result = {
    scenario: "96-tree structural budget plus procedural canopy timing at 1280x720 with SwiftShader",
    budgets,
    timingEnforced: enforceTiming,
    summary,
    forestStructure,
    timedScene,
    samples,
    passed: failures.length === 0,
    failures,
    timingFailures,
  };
  await mkdir(dirname(resultPath), { recursive: true });
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`);
  console.log(JSON.stringify(result, null, 2));
  if (failures.length > 0) process.exitCode = 1;
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => {
    previewServer.httpServer.closeAllConnections();
    previewServer.httpServer.close((error) => error ? reject(error) : resolve());
  });
}
