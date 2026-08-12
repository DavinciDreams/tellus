# Procplant WebGL benchmark

Tellus defaults to `WebGLRenderer`. Procplants WebGPU experiments therefore do not validate the renderer used by the application. This harness loads the built Tellus app, forces the documented WebGL/default-density path, waits for a settled centre vegetation chunk, and records both structural and timing evidence.

Run:

```powershell
bun run perf:procplants-webgl
```

The ignored result file is `performance-results/tellus-procplants-webgl.json`. It includes:

- masked and unmasked WebGL vendor/renderer identity;
- whether the renderer looks software-backed;
- cold navigation, perf-hook, world-ready, queue-drain, and settled-world timing;
- three requestAnimationFrame samples at 1280 by 720;
- WebGL draw/triangle/memory/program and GPU-timer diagnostics when available;
- Procplants chunk, LOD, triangle, draw, shadow, queue, update, and build counters;
- browser visibility and console errors.
- received WebSocket frame counts by patch type, so live world traffic can be separated from local
  rebuild churn.

By default, frame timing is reported but not enforced. Structural bounds remain active. To make timing and a non-software renderer hard requirements:

```powershell
$env:TELLUS_WEBGL_PERF_REQUIRE_HARDWARE='1'
$env:TELLUS_WEBGL_PERF_ENFORCE_TIMING='1'
bun run perf:procplants-webgl
```

Useful controls are `TELLUS_WEBGL_PERF_EXECUTABLE_PATH`, `TELLUS_WEBGL_PERF_DENSITY`, `TELLUS_WEBGL_PERF_SETTLE_MS`, `TELLUS_WEBGL_PERF_STABLE_MS`, `TELLUS_WEBGL_PERF_SAMPLE_MS`, `TELLUS_WEBGL_PERF_SAMPLES`, and the `TELLUS_WEBGL_PERF_MIN_FPS` / `MAX_*` budget variables documented in the script. Cold build maxima remain evidence rather than steady-state failures; the timing gate evaluates samples only after chunk and vegetation queues remain drained for a stability window, and reports if they reactivate during sampling.

One passing run is not a capacity claim. Before changing vegetation defaults, repeat the hardware-gated run with AC/battery state, browser version, energy-saver/extensions, viewport, density, world, and DevTools state held constant. Compare the JSON samples, not a single instantaneous FPS number.

## 2026-08-10 controlled evidence

The harness exposed a real startup rebuild loop: each generated building reconciliation called the
global terrain invalidation path, rebuilding all 145 active procplant chunks even though only the
building's exclusion footprint changed. Terrain-stream changes could also arrive in provisional/final
waves. Tellus now batches the latter until the terrain queue is idle and tracks old/current building
footprints so only intersecting procplant chunks rebuild.

On the local Intel Iris Xe / D3D11 WebGL path at 1280 by 720 and density 1, the post-fix run reached a
stable drained field in 16.025 seconds and stayed drained through three five-second samples. It built
172 procplant chunks, versus 3,331 in the preceding non-settling diagnostic run, and reduced recorded
plant-build CPU time from 92,789 ms to 3,782 ms. The sampled median was 56.61 FPS with a 16.7 ms p95,
while GPU timer queries averaged 8.2 ms across 14 samples. The scene reported 236 draw calls and
554,519 triangles. The socket received one `world.snapshot` and presence patches only, confirming the
churn was local invalidation behavior rather than repeated terrain patches.

Those numbers are a controlled diagnostic from one machine, not representative-device capacity or a
reason to change density defaults. The timing gate remains opt-in, and Tellus remains WebGL-first;
Procplants WebGPU experiments do not substitute for this test.
