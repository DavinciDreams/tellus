# Testing and performance checks

Tellus runs two automated pull-request checks: correctness/coverage and a
deterministic vegetation render budget. Together they catch functional
regressions, loss of tested surface area, and large rendering-cost regressions.

## Unit tests and coverage

Run the full suite and coverage report with:

```bash
bun run test:coverage
```

Coverage includes every TypeScript and TSX source file, including files a test
never imports. Test files and vendored third-party implementations are excluded.
This makes the overall number intentionally conservative rather than reporting
coverage only for modules that already have tests.

The July 26, 2026 baseline is recorded below. The initial CI floors are rounded
down so the new check protects the existing baseline immediately without
requiring unrelated test work in every pull request.

| Metric | Baseline | CI floor |
| --- | ---: | ---: |
| Statements | 26.86% | 26% |
| Branches | 23.08% | 23% |
| Functions | 22.30% | 22% |
| Lines | 27.60% | 27% |

The report is printed in the job log and uploaded as a `coverage-report`
artifact. New tests should concentrate first on the zero-coverage browser entry
points and UI behavior while maintaining the strong coverage around biome,
procedural-plant, vegetation, terrain, and protocol modules.

## Vegetation render budget

Run the browser check with:

```bash
bun run perf:render
```

The check builds the production bundle and opens the tree LOD gallery in
headless Chromium at a fixed 1280 x 720 viewport. It records the draw calls and
triangles for a generated 96-tree `Extreme Cone` forest, then measures three
four-second frame samples on the procedural canopy surface. Both scenes are
deterministic and require no Hyades connection or downloaded tree asset.

The hosted CI gate currently enforces:

- no more than 550 draw calls and 9,000 rendered triangles.

The report also records median FPS, p95 frame time, and long-frame ratio.
GitHub-hosted machines and SwiftShader are not stable enough to use those
timings as a required check, so draw-call and triangle limits are the enforced
guardrails. They catch accidental geometry or material multiplication that
would directly increase frame cost.

On a stable machine, set `TELLUS_PERF_ENFORCE_TIMING=1` to additionally enforce
the timing thresholds. The defaults are 10 median FPS, 200 ms median p95 frame
time, and no more than 100% long frames; set the other `TELLUS_PERF_*` variables
to a calibrated baseline for that runner.

The complete JSON result is uploaded as the `vegetation-render-performance`
artifact for comparison. Environment variables beginning with `TELLUS_PERF_`
can override thresholds for an investigation without changing the defaults.

## Measuring real-world FPS

For a tighter 30 or 60 FPS product target, run a browser on a fixed physical GPU
with the same resolution, power mode, browser version, and world/camera path.
Use `window.__tellusPerfReset()`, collect a fixed-duration route, and save
`window.__tellusPerf()` plus `window.__tellusPerfReport()`. Those hooks include
CPU phase timing, WebGL GPU timing when supported, draw calls, triangles,
vegetation/procplant work, long tasks, and chunk-streaming pressure.

A stable self-hosted GPU runner can later compare those metrics to a checked-in
baseline with a small tolerance and enable `TELLUS_PERF_ENFORCE_TIMING=1`.
Hosted-runner FPS should remain a coarse measurement rather than the release
definition of smoothness.
