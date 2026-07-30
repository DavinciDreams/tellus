# Tellus

Tellus is a shared browser-based 3D world built with Three.js and backed by
Hyades. Players and embodied agents can explore streamed worlds, shape terrain,
create and reuse 3D assets, build, travel through portals, and inhabit the same
persistent world state.

The live app is <https://tellus.garden/>. The Gnostr hostname
<https://tellus.gnostr.cloud/> serves the same deployment.

## Requirements

- Bun
- A browser with WebGL 2 support

WebGL is the production default. WebGPU remains available as an explicit
developer opt-in while its terrain/material paths continue to mature; see
[Terrain Texture Blackout Notes](docs/TERRAIN_TEXTURE_BLACKOUT_NOTES.md).

## Development

```bash
bun install
bun run dev
```

Open <http://localhost:3344/>.

For quick validation before a PR:

```bash
bun run typecheck
bun run test
bun run build
```

CI also measures whole-source test coverage and runs a deterministic vegetation
render budget. Run the same checks locally with `bun run test:coverage` and
`bun run perf:render`; see [Testing and Performance](docs/TESTING_AND_PERFORMANCE.md)
for the current baseline and what each gate protects.

The Vite dev server talks to the live Hyades backend by default through
`public/tellus-config.json`. You can explore worlds locally without logging in,
but passkey sign-in is origin-sensitive: production passkeys are bound to the
Tellus relying-party domain. If a local dev URL reports that the RP ID does not
match the current origin, test auth on the deployed Tellus URL or update the
Hyades/Tellus WebAuthn origin allow-lists together.

## System overview

- **World state:** Hyades grains are authoritative for persistent terrain,
  objects, portals, presence, accounts, and embodied agents. The browser loads a
  snapshot and then applies live patches.
- **Biomes:** `src/tellus-ecology.ts` resolves authored biome cells, explicit
  terrain paint, height, slope, climate, moisture, wind, salinity, light, and
  substrate into one ecology sample. Vegetation communities and building
  material defaults consume that same result.
- **Procedural plants:** deterministic genomes feed procplant graphs,
  connected branch modules, or Weber-Penn species trees. Authored global mixes
  cover all ten ecology biomes, while saved world overrides remain supported.
- **Vegetation performance:** chunk streaming, stable seeded placement, shared
  instanced geometry, cached tree templates, distance/FPS-aware structural LOD,
  deferred refinement, and optional impostors reduce work without changing the
  underlying forest population as LOD changes.
- **Agents:** authenticated makers can create, rename, place, and manage
  multiple server-side agents. Stable ids remain the authority while editable
  friendly names appear in presence, chat, logs, and the roster. Hyades owns
  decisions and world actions; Tellus renders their point of view and latest
  evaluation status.
- **3D generation:** server routes can use Hyades-hosted InstantMesh/Pixal3D,
  direct Gradio backends, Asset Forge, or local procedural fallbacks. Generated
  assets are persisted through the shared asset library.

Start with the [documentation map](docs/README.md), the
[biome/ecology design](docs/BIOME_ECOLOGY_SPEEDTREE_PRD.md), and the
[procplant realism notes](docs/PROCPLANT_REALISM_RESEARCH.md).

## Contributor map

Tellus is intentionally friendly to small, focused contributions:

- UI, HUD, account panel, world drawers: `src/main.tsx`, `src/styles.css`,
  `src/tellus-auth-ui.tsx`.
- Navigation, camera, player movement, collision, and interaction feel:
  `src/main.tsx`, `src/tellus-rapier-physics.ts`, `src/tellus-terrain.ts`.
  Current player controls are click/tap-to-move first, drag-to-look, with
  WASD/arrows as keyboard support.
- Rendering/performance tuning: `src/main.tsx`, `src/tellus-terrain.ts`,
  `src/tellus-scene-builders.ts`, `src/tellus-procplant-vegetation.ts`,
  `src/tellus-asset-impostor.ts`.
- Biome and procedural-plant work: `src/tellus-ecology.ts`,
  `src/tellus-procplants.ts`, `src/tellus-procplant-biomes.ts`,
  `src/tellus-branch-modules.ts`, `src/tellus-biome-mix.ts`.
- Embodied-agent controls and evaluation views: `src/tellus-maker-agents.ts`,
  `src/agent-view.ts`, `src/agent-view-camera.ts`.
- Backend wire clients and Hyades URL handling:
  `src/tellus-world-client.ts`, `src/tellus-auth.ts`,
  `src/tellus-runtime-config.ts`, `src/tellus-urls-identity.ts`.
- Public MCP skill doc for LLMs and automation:
  `public/tellus-mcp-skill.md`.

Good starter areas right now are UI polish, camera/navigation feel, lag
reduction, and clearer MCP/client setup docs. Keep changes scoped and include a
short note about what you manually tested. See `CONTRIBUTING.md` for the short
outside-contributor checklist. Coding agents should start with `AGENTS.md`;
tool-specific entry points such as `CLAUDE.md`, `GEMINI.md`, Copilot
instructions, and Cursor rules point back to that canonical guide.

## Programmatic play (MCP)

The MCP docs are public so contributors can inspect the automation surface
without needing a premium account:

<https://tellus.gnostr.cloud/tellus-mcp-skill.md>

LLM-oriented discovery is also available at `/llms.txt`.

The live endpoint is:

```text
POST https://hyades.gnostr.cloud/api/tellus/mcp/{worldId}
```

Opening that endpoint in a browser with `GET` returns `405 Method Not Allowed`;
that is expected. MCP clients must use JSON-RPC over HTTP `POST`. Premium is
required only for minting a personal bearer token and using the protected MCP
endpoint.

## World backend (Hyades)

The authoritative shared world now lives in **Hyades** (Orleans virtual-actor
grains) — not a Cloudflare Worker / Durable Object. The browser speaks the same
protocol it always has:

```text
GET  /api/world/{worldId}/state    # full snapshot
POST /api/world/{worldId}/action   # one action (sculpt, move, generate, ...)
WS   /api/world/{worldId}/live      # snapshot, then live patches
```

Point the client at the cluster via runtime config (`public/tellus-config.json`)
or the matching `VITE_*` build vars:

```json
{
  "worldApiBase": "https://hyades.gnostr.cloud",
  "worldId": "chunked-64-genesis",
  "apiBase": ""
}
```

- `worldApiBase` — the Hyades world surface (state / action / live). Each
  `worldId` is its own grain; a new id is created on first use.
- `apiBase` — this app's own `/api/*` server routes (chat, generate-3d, vision,
  tellus-state). Empty = same-origin (this deployment serves them itself).

Everything heavy routes through Hyades now: **3D generation** (`/3d/jobs` →
concept image → image-to-3D → asset store), **LLM** chat and **vision**
(`/v1/chat/completions`), and the **asset library** (`/api/assets/*`, proxied
server-side to the 3D Asset Manager store). Deploy assets live under `deploy/`.

## Deployment

Production Tellus is deployed through Gnostr Cloud. GitHub uses `master`, the
Gnostr repository uses `master`, and a fresh immutable `v*` tag triggers the
`build-deploy` job in `.gnostr-cloud-ci.yml`. That job builds the multi-arch
container, pushes it to the internal registry, and rolls the `tellus` k3s
deployment on the `dgx-deploy` runner.

See [Gnostr Cloud setup](docs/GNOSTR_CLOUD_SETUP.md) for the operator workflow,
authentication convention, CI checks, and live-bundle verification. A GitHub or
Gnostr ref update alone is not evidence that production changed; verify the CI
job and the assets served by <https://tellus.garden/>.

[Coolify](deploy/COOLIFY.md) remains an optional self-hosting path. It is not the
current production deployment.

## 3D Generation

Tellus supports these generation providers:

```text
VITE_TELLUS_GENERATION_PROVIDER=local
VITE_TELLUS_GENERATION_PROVIDER=asset-forge
VITE_TELLUS_GENERATION_PROVIDER=instantmesh-gradio
VITE_TELLUS_GENERATION_PROVIDER=pixal3d-gradio
VITE_TELLUS_GENERATION_PROVIDER=anigen-gradio
```

`local` keeps the fast procedural meshes. `asset-forge` calls the Asset Forge
pipeline. `instantmesh-gradio` calls a direct InstantMesh Gradio adapter through
Tellus' own `/api/generate-3d` endpoint; Pixal3D and Anigen use the same
asynchronous job surface for higher-quality or animated outputs.

When the world-level provider is `local` or `asset-forge`, it applies to every
creator. For direct generation, Tellus can route players and agents separately:

```text
VITE_TELLUS_PLAYER_GENERATION_PROVIDER=instantmesh-gradio
VITE_TELLUS_AGENT_GENERATION_PROVIDER=pixal3d-gradio
```

The deployed server can set `TELLUS_3D_BACKEND=hyades` so those browser-visible
provider choices are executed by Hyades `/3d/jobs`; bearer credentials stay on
the server. Direct Gradio URLs are mainly for local testing or a self-hosted
deployment.

For direct InstantMesh:

```text
INSTANTMESH_GRADIO_BASE_URL=http://192.168.1.177:43839
INSTANTMESH_SAMPLE_STEPS=30
TELLUS_GENERATED_ASSET_DIR=Z:\3d\assets\tellus
TELLUS_TEXT_TO_IMAGE_PROVIDER=gradio
TELLUS_TEXT_TO_IMAGE_BASE_URL=http://192.168.1.173:7862
TELLUS_GRADIO_IMAGE_API_NAME=generate
TELLUS_GRADIO_IMAGE_PRESET=Square asset
PIXAL3D_TIMEOUT_MS=1200000
TELLUS_GENERATION_JOB_TIMEOUT_MS=2700000
TELLUS_GENERATION_QUEUED_TTL_MS=5400000
TELLUS_GENERATION_RUNNING_TTL_MS=5400000
TELLUS_ASSET_STORE_API_BASE=https://3d.flobots.xyz
TELLUS_ASSET_STORE_SESSION_COOKIE=session=...
TELLUS_REQUIRE_ASSET_STORE_UPLOAD=true
TELLUS_ASSET_STORE_PUBLIC=true
TELLUS_OPTIMIZE_GLB=true
TELLUS_OPTIMIZE_QUANTIZE=true
TELLUS_OPTIMIZE_TEXTURES=true
TELLUS_OPTIMIZE_TEXTURE_MAX_SIZE=1024
TELLUS_OPTIMIZE_TEXTURE_QUALITY=82
TELLUS_OPTIMIZE_SIMPLIFY_ERROR=0.0001
```

For direct-mode deployments, `INSTANTMESH_GRADIO_BASE_URL` must be reachable by
the Tellus server. A LAN URL works only when the server shares that network;
otherwise use Hyades or a private/public routed endpoint.

InstantMesh is image-to-3D, while Tellus agents speak in text prompts. Tellus
therefore runs a middle step:

```text
text prompt -> concept image -> InstantMesh -> persisted GLB
```

Set `TELLUS_TEXT_TO_IMAGE_PROVIDER=gradio` with
`TELLUS_TEXT_TO_IMAGE_BASE_URL=http://192.168.1.173:7862` to use the Mac-side
Z-Image-Turbo MLX Gradio service. Tellus calls the named Gradio API
`/gradio_api/api/generate` with prompt, seed, steps, width, height, guidance,
and negative-prompt inputs.

`TELLUS_GENERATION_JOB_TIMEOUT_MS` caps each queued 3D generation lane. Pixal3D
and Anigen can run much longer than InstantMesh, so keep this well above the
upstream Gradio timeout. `TELLUS_GENERATION_QUEUED_TTL_MS` should also be long
enough for jobs waiting behind the currently loaded model, otherwise queued
visitor requests can expire before they ever start.

Generated GLBs are uploaded into the 3D asset store after the staging copy is
written to `TELLUS_GENERATED_ASSET_DIR`. Set `TELLUS_ASSET_STORE_SESSION_COOKIE`
to a valid server-side asset-store session cookie, or use
`TELLUS_ASSET_STORE_UPLOAD_TOKEN` when the asset store supports bearer-token
uploads. `TELLUS_REQUIRE_ASSET_STORE_UPLOAD=true` makes generation fail loudly
if the object cannot be persisted into the asset store.

Tellus persists the asset store's immutable model id as `assetStoreModelId` on
placed generated objects. Hyades / gnostr proxy deployments must preserve that
field unchanged and serve `/api/assets/model/{id}/game-optimized` for it
(proxied to the 3D Asset Manager's `/api/model/{id}/game-optimized`). `modelUrl`
is treated as a cached serving hint and may be rewritten from `assetStoreModelId`
when titles, metadata, optimization state, or proxy route shapes change. The
3D Asset Manager must resolve superseded ids on consumer load endpoints
(`/api/model`, `/api/view`, `/api/download`, thumbnails/previews, VRM variants)
via its alias table; Tellus treats 404/410 responses for asset-store-backed
models as transient and keeps retrying instead of erasing the saved id.

The GLB optimizer registers glTF extensions, removes duplicate/unused data,
welds geometry, quantizes attributes, and can resize/recompress textures.
Optional simplification is controlled with `TELLUS_OPTIMIZE_SIMPLIFY_RATIO`
between 0 and 1; leave it unset for conservative geometry preservation. When
simplification is enabled, `TELLUS_OPTIMIZE_SIMPLIFY_ERROR` controls the error
tolerance.

Tellus can also use `TELLUS_TEXT_TO_IMAGE_PROVIDER=comfyui` with a ComfyUI
workflow, `TELLUS_TEXT_TO_IMAGE_PROVIDER=automatic1111`, or
`TELLUS_TEXT_TO_IMAGE_PROVIDER=openai` with `OPENAI_API_KEY`. If no text-to-image
service is configured, Tellus falls back to a simple procedural BMP sketch. The
source concept image, returned GLB, and `manifest.json` are written to
`TELLUS_GENERATED_ASSET_DIR`, or `/root/tellus-generated-assets` when that env
var is unset.

Point `TELLUS_GENERATED_ASSET_DIR` at `Z:\3d\assets\tellus` on a Windows host,
or mount that drive as `/mnt/z/3d/assets/tellus` on a Linux host or container.
Tellus also translates Windows drive syntax such as `Z:\3d\assets\tellus` to
`/mnt/z/3d/assets/tellus` when it is running on Linux.

## Local InstantMesh Benchmark

Tellus can run the official TencentARC/InstantMesh Gradio app locally and
benchmark either the raw Gradio API or the full Tellus `/api/generate-3d` path.
The setup script clones InstantMesh into ignored `external/InstantMesh` and
builds a Docker image when Docker is available:

```bash
bun run instantmesh:setup
bun run instantmesh:start
```

The InstantMesh Gradio service listens at <http://127.0.0.1:43839>. In another
terminal, start Tellus' API server with matching environment:

```bash
INSTANTMESH_GRADIO_BASE_URL=http://127.0.0.1:43839 \
INSTANTMESH_SAMPLE_STEPS=30 \
TELLUS_GENERATED_ASSET_DIR=/root/tellus-generated-assets \
bun run start
```

Then benchmark the full app path:

```bash
bun run bench:instantmesh -- --target=tellus --runs=3 --warmup=1 --steps=30
```

Or benchmark the Gradio `/run/predict` API directly:

```bash
bun run bench:instantmesh -- --target=gradio --runs=3 --warmup=1 --steps=30
```

Benchmark reports are written to `benchmarks/instantmesh-*.json` and include
latency summary, per-run timings, GPU snapshots from `nvidia-smi`, generated
model URLs or file paths, and output sizes when Tellus persists the GLB.

For Asset Forge / Pixel3D, configure the browser-visible API base URL:

```bash
cp .env.example .env.local
```

```text
VITE_ASSET_FORGE_API_BASE=https://your-asset-forge.example.com
```

When set, generated objects are queued through:

```text
POST /api/generation/pipeline
GET /api/generation/pipeline/:pipelineId
```

Asset Forge should be configured server-side with its Pixel3D env vars, such as
`GENERATION_3D_PROVIDER=pixel3d-gradio` and `PIXEL3D_GRADIO_BASE_URL`.

If the API is unset or fails, Tellus keeps using its local procedural meshes.

## Live Agents

Embodied agents run in Hyades, not in the browser. An authenticated maker can
use the Agent panel to create multiple named agents with optional personas,
rename them without changing their identity or memory, start or stop them,
bring them to the current world, and delete them. The directory reports each
agent's friendly name, world, and lifecycle state, identifies the default
companion, and shows its latest evaluation status, decision, and summary.
Friendly names are presentation only: immutable agent and visitor ids still
drive authorization, addressing, presence reconciliation, and deduplication.

The default companion retains the richer chat, persona, memory, viewport, and
capture controls. Evaluation captures use deterministic bounded camera poses;
Hyades can push an authoritative snapshot immediately before capture, and the
observed agent is hidden from its own evidence image. Older Hyades deployments
remain compatible: plural controls are hidden when `/api/tellus/agents` is
unavailable, missing evaluation fields are treated as mixed-version data, and
rename errors remain local to the roster operation.

Tellus reads `public/tellus-config.json` at runtime. For machine-local
overrides, create `public/tellus-config.local.json`; it is ignored by git and
loaded after the committed config:

```json
{
  "assetForgeApiBase": "https://your-asset-forge.example.com",
  "worldApiBase": "https://hyades.gnostr.cloud",
  "worldId": "your-world-id",
  "generationProvider": "pixal3d-gradio",
  "playerGenerationProvider": "instantmesh-gradio",
  "agentGenerationProvider": "pixal3d-gradio",
  "skyboxUrl": "https://cdn.example.com/tellus/sky.glb",
  "worldTemplate": "tellus"
}
```

See [Embodied Agents](docs/EMBODIED_AGENTS_PLAN.md) for the current ownership
model and remaining work.

### Agent roadmap

The deployed baseline is Tellus `v0.8.201` with Hyades release notes through
`0.5.315`: maker-owned plural agents, portal relocation, nearby-actor perception,
evaluation evidence, editable friendly names, progressive capabilities,
delegated creation approvals, typed agent social principals, and cross-world
DM contracts have shipped behind their coordinated rollout flags. The next work is
explicitly status-labelled rather than implied to be shipped:

- **Implementation rollout:** merged [Hyades PR #43](https://github.com/MonumentalSystems/hyades/pull/43)
  supplies reusable world triggers, durable/coalesced inbox delivery, and
  `makerPresent` / `eventDriven` / `resident` runtime policies. Tellus exposes
  owner controls, an entrance-concierge preset, diagnostics, and optional volume
  previews only when the guarded Hyades routes are available.
- **Agent collaboration rollout:** [Hyades issue #39](https://github.com/MonumentalSystems/hyades/issues/39)
  tracks the implemented progressive capability, delegated creation, typed
  social, and shared-workspace slices. Collaboration remains guarded until the
  Phase 3B grain contract rolls across Hyades; procedural/Blender asset workshops
  remain the later phases.
- **Proposed deterministic activities:**
  [World modules and minigames](docs/WORLD_MODULES_MINIGAMES_PRD.md) keeps rules,
  race timing, checkpoints, and results in an authoritative module service while
  agents act as guides, teammates, or stewards.

These links describe direction and review boundaries, not release commitments.

## Worlds and Templates

The default creation slate contains Main plus seven deterministic EvoFlow
terrain families: River Canyon, Alpine Spires, Glass Ridge, Lichen Caldera,
Copper Mesas, Basalt Badlands, and Coral Archipelago. Each terrain package
commits a height map, semantic map, preview, and genome. Semantic water remains
water through chunk classification, so channels and archipelagos use the shared
water surface instead of becoming painted ground. Older and interior templates
remain available under Advanced.

Tellus is designed to be copied as a world template. For each deployed copy,
change at least:

```json
{
  "worldId": "garden-moon",
  "skyboxUrl": "https://cdn.example.com/tellus/garden-moon-sky.glb",
  "worldTemplate": "lowlands"
}
```

`worldId` is the identity for shared terrain, generated objects, presence, and
local browser saves. Use a new `worldId` for each new world so it starts clean.
`skyboxUrl` changes the enclosing world art. `worldTemplate` changes the
starting land shape before any player or agent sculpts it.

Built-in land presets:

```text
tellus
wide-island
lowlands
ridge
```

You can also override individual shape knobs with `landShape`:

```json
{
  "worldId": "red-ridge",
  "skyboxUrl": "/skybox/red-ridge.glb",
  "worldTemplate": "ridge",
  "landShape": {
    "mountain": { "height": 16, "radius": 24, "exponent": 2.6 },
    "ridge": { "sinScale": 1.4, "cosScale": 0.8, "diagonalScale": 0.7 },
    "pond": { "x": -18, "z": -16, "radius": 8, "depth": 2.2 },
    "shore": { "startRatio": 0.74, "drop": 6.2 },
    "baseOffset": -0.7
  }
}
```

Supported `landShape` groups are `mountain`, `shoulder`, `southernRise`,
`ridge`, `shore`, `pond`, and `baseOffset`. Runtime JSON is loaded before the
3D scene is created, so deploying a copy can be as simple as replacing
`public/tellus-config.json` with a new `worldId`, `skyboxUrl`, and template.

## Agent Avatars

Set avatar URLs with:

```text
VITE_TELLUS_JOHNNY_AVATAR_URL=/avatars/johnny.glb
VITE_TELLUS_MIRA_AVATAR_URL=/avatars/mira.glb
VITE_TELLUS_SOL_AVATAR_URL=/avatars/sol.glb
```

Files can live in `public/avatars/`, or the values can be remote HTTPS URLs.
Large `.glb`, `.gltf`, and `.vrm` files in `public/avatars/` are ignored by git.
For production, prefer hosting them from object storage, a CDN, or a mounted
volume served by your web server.

## Skybox

To use the external skybox locally, place the extracted folder in
`public/skybox/` and point `public/tellus-config.local.json` at it:

```text
free_-_skybox_in_the_cloud/scene.gltf
```

If needed, Tellus will also try `/skybox/free_-_skybox_in_the_cloud.glb`,
`/skybox/skybox_skydays_3.glb`, and the bundled basic skybox as fallbacks.
Tellus will load it automatically and fall back to the procedural sky if it is
not present.

Attribution: `FREE - SkyBox In The Cloud` (https://skfb.ly/oIINq) by Paul is
licensed under Creative Commons Attribution
(http://creativecommons.org/licenses/by/4.0/).

Large skybox files in `public/skybox/` are ignored by git.

## Build

```bash
bun run build
```
