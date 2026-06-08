# Tellus

Tellus is a tiny WebGPU AI terrarium: a floating disc world with a mountain,
terrain, water, an avatar, and an autonomous agent that can `generate` any asset
it wants and `interact` with objects in the scene.

## Requirements

- Bun
- A browser with WebGPU enabled

## Development

```bash
bun install
bun run dev
```

Open <http://localhost:3344/>.

## Cloudflare Realtime World

Tellus can use a Cloudflare Worker Durable Object as the authoritative shared
world. The browser talks to:

```text
GET /api/world/main/state
POST /api/world/main/action
WS  /api/world/main/live
```

The Worker stores one terrain snapshot per world id, broadcasts terrain changes
over WebSockets, and can enqueue future generation work through
`TELLUS_GENERATION_QUEUE`.

Local validation:

```bash
bun run typecheck:worker
bunx wrangler deploy --dry-run --config wrangler.toml
```

Cloudflare deploy:

```bash
wrangler login
bun run deploy:worker
```

If the Worker is mounted under the same hostname as the site, leave
`worldApiBase` empty. If it is deployed on a separate Worker hostname, set one
of these:

```text
VITE_TELLUS_WORLD_API_BASE=https://tellus-world.agentstarter.workers.dev
VITE_TELLUS_WORLD_ID=main
```

or runtime config:

```json
{
  "worldApiBase": "https://tellus-world.agentstarter.workers.dev",
  "worldId": "main"
}
```

For same-origin Cloudflare Pages, add a route or Worker binding that sends
`/api/world/*` to the `tellus-world` Worker.

### Cheaper Durable World Persistence

The Durable Object should be treated as the live coordinator for WebSockets and
short-lived presence, not as the write-heavy database for every terrain/object
edit. Tellus does not use Durable Object storage by default; it only uses
external persistence when `TELLUS_PERSISTENCE_API_BASE` is configured. To persist
world state in the Flask/Postgres asset service, configure the Worker with:

```bash
wrangler secret put TELLUS_PERSISTENCE_API_TOKEN --config wrangler.toml
wrangler deploy --config wrangler.toml --var TELLUS_PERSISTENCE_API_BASE:https://3d.flobots.xyz
```

or add the variable in the Cloudflare dashboard:

```text
TELLUS_PERSISTENCE_API_BASE=https://3d.flobots.xyz
TELLUS_PERSISTENCE_API_TOKEN=...
```

Only set this if you intentionally want to use Cloudflare Durable Object storage
and accept its storage write limits:

```text
TELLUS_DO_STORAGE_MODE=durable
```

The Worker will call:

```text
GET /api/tellus/worlds/:worldId/state
PUT /api/tellus/worlds/:worldId/state
```

Expected JSON shape:

```json
{
  "version": 1,
  "worldId": "main",
  "terrain": {
    "version": 2,
    "revision": 12,
    "terrainSculptOffsets": [],
    "terrainPaint": [],
    "distantIslandSculptOffsets": {},
    "distantIslandPaint": {},
    "savedAt": "2026-06-07T00:00:00.000Z"
  },
  "generated": [],
  "queuedGenerationJobs": [],
  "savedAt": "2026-06-07T00:00:00.000Z"
}
```

`GET` may also return `{ "state": { ... } }` or a Tellus
`world.snapshot` patch. `PUT` should upsert by `worldId`. If the Flask/Postgres
endpoint is unavailable, the Worker falls back to in-memory state so Cloudflare
storage limits are not consumed.

See [docs/tellus-flask-postgres-world-state.md](docs/tellus-flask-postgres-world-state.md)
for a Flask/Postgres route sketch with public/private worlds.

## Coolify

Deploy Tellus as a Dockerfile-based app. The container listens on port `3000`
and serves both the built WebGPU client and the required `/api/*` routes.

Set these Coolify environment variables:

```text
PORT=3000
VITE_TELLUS_GENERATION_PROVIDER=instantmesh-gradio
VITE_TELLUS_PLAYER_GENERATION_PROVIDER=instantmesh-gradio
VITE_TELLUS_AGENT_GENERATION_PROVIDER=pixal3d-gradio
INSTANTMESH_GRADIO_BASE_URL=http://192.168.1.177:43839
INSTANTMESH_SAMPLE_STEPS=30
ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
ZAI_API_KEY=...
ZAI_MODEL=GLM-5.1
```

`INSTANTMESH_GRADIO_BASE_URL` only needs to be reachable from the Coolify
server. A LAN URL is good when Coolify is on the same network as InstantMesh.
Off-network hosts such as Vercel need a public URL, VPN, reverse proxy, or
tunnel.

## 3D Generation

Tellus supports three generation modes:

```text
VITE_TELLUS_GENERATION_PROVIDER=instantmesh-gradio
VITE_TELLUS_GENERATION_PROVIDER=asset-forge
VITE_TELLUS_GENERATION_PROVIDER=local
```

`local` keeps the fast procedural meshes. `asset-forge` calls the Asset Forge
pipeline. `instantmesh-gradio` calls a direct InstantMesh Gradio adapter through
Tellus' own `/api/generate-3d` endpoint.

Tellus can route players and agents through different direct generators. The
default is fast player creation through `VITE_TELLUS_PLAYER_GENERATION_PROVIDER=instantmesh-gradio`
and slower autonomous agent creation through
`VITE_TELLUS_AGENT_GENERATION_PROVIDER=pixal3d-gradio`.

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

For deployed builds, `INSTANTMESH_GRADIO_BASE_URL` must be a URL that the
deployed server can reach. LAN addresses work for same-network hosts such as a
home Coolify server; off-network hosts such as Vercel need a public or tunneled
URL.

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

Tellus can run its agents through an OpenAI-compatible Hyades/Nemotron endpoint
without exposing the bearer key in browser code. Local dev uses the Vite proxy;
Vercel uses the `/api/chat` serverless function.

```text
HYADES_BASE_URL=http://192.168.1.187
HYADES_API_KEY=sk-hy-...
VITE_TELLUS_AGENT_MODEL=GLM-5.1
ZAI_BASE_URL=https://api.z.ai/api/coding/paas/v4
ZAI_API_KEY=...
ZAI_MODEL=GLM-5.1
```

When configured, the enabled agent asks `/api/chat` for its next `generate()`
prompt about once per minute, with reflective `interact()` moments in between.
If the endpoint is unavailable, it falls back to local scripted behavior. By
default only Johnny is enabled, and he is configured as a general world-forger
that can request any visible 3D asset. `/api/tts` is also proxied for the Hyades
TTS endpoint, ready for a later voice pass.

Tellus reads `public/tellus-config.json` at runtime. The committed file is
deploy-safe and intentionally has no local asset paths, so Vercel can build even
when large local files are not in git. For machine-local overrides, create
`public/tellus-config.local.json`; it is ignored by git and loaded after the
committed config:

```json
{
  "assetForgeApiBase": "https://your-asset-forge.example.com",
  "worldApiBase": "https://tellus-world.agentstarter.workers.dev",
  "worldId": "main",
  "skyboxUrl": "https://cdn.example.com/tellus/sky.glb",
  "enabledAgents": ["johnny"],
  "avatars": {
    "johnny": "https://cdn.example.com/tellus/johnny.glb",
    "mira": "https://cdn.example.com/tellus/mira.glb",
    "sol": "https://cdn.example.com/tellus/sol.glb"
  }
}
```

To turn more autonomous agents back on later, set `enabledAgents` to any subset
of `["johnny", "mira", "sol", "atlas"]`.

On Vercel, set `VITE_ASSET_FORGE_API_BASE` and the `VITE_TELLUS_*_AVATAR_URL`
variables when you want the URLs baked into a build, or replace
`public/tellus-config.json` during deployment if your hosting setup supports
runtime config injection.

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
