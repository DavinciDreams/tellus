# Terrain Texture Blackout Notes

Date: 2026-06-25

## What bit us

The prior realistic terrain texture experiment had two blackout risks:

- WebGPU terrain image textures used TSL texture nodes. That path could blank the
  world while leaving HUD/minimap UI alive, so the current terrain path keeps
  WebGPU on procedural detail only.
- The WebGL paint overlay sampled one albedo texture per paint kind. With base
  terrain albedo and normal maps, that estimates to 11 fragment texture units.
  WebGL only guarantees 8, and some integrated/mobile GPUs will compile or run
  that material as black.

The staged terrain images were 1K, so raw texture dimension is less suspicious
than shader/runtime capability. Normal map file sizes looked large because PNG
normal maps compress poorly.

## Current guardrail

`window.__tellusPerf().terrainTextures` reports the active renderer, whether
image terrain textures were requested, the WebGL texture-unit cap when known,
and whether the old nine-sampler paint approach is safe on that renderer.

Image terrain textures are considered opt-in via:

```js
localStorage.setItem("tellus.terrainImageTextures", "1")
```

WebGPU still reports procedural-only because that was the known blackout path.
To force the safer WebGL trial path in a browser that normally boots WebGPU:

```js
localStorage.setItem("tellus.renderer", "webgl")
localStorage.setItem("tellus.terrainImageTextures", "1")
location.reload()
```

The current trial path uses four albedo samplers and disables the old shared
procedural base albedo/normal maps while active. That avoids the all-terrain
striped/tiling pattern that looked like sand dunes under every paint kind.

- moss for meadow, flowers, and grass, with per-paint tinting to keep the
  labels visually distinct without adding more samplers
- sand for beach and dirt, with dirt using an earthy tint
- gravel tinted cool grey for rock/pebbles
- cracked flagstone for stone and brick-style hardscape paths, patios, and
  stone circles

Snow, stone, and brick stay on the existing procedural/color path for now.
WebGL renderers that do not have enough texture units should use an atlas or
other single-sampler paint texture path rather than separate samplers for every
paint kind.

## Next implementation shape

The safer realistic texture path should pack paint albedos into a single atlas
and sample one texture in the terrain shader. Normal/roughness detail should be
added only after the albedo atlas is visually stable.
