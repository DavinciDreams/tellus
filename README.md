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

## Coolify

Deploy Tellus as a Dockerfile-based app. The container listens on port `3000`
and serves both the built WebGPU client and the required `/api/*` routes.

Set these Coolify environment variables:

```text
PORT=3000
VITE_TELLUS_GENERATION_PROVIDER=instantmesh-gradio
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

For direct InstantMesh:

```text
INSTANTMESH_GRADIO_BASE_URL=http://192.168.1.177:43839
INSTANTMESH_SAMPLE_STEPS=30
TELLUS_GENERATED_ASSET_DIR=Z:\3d\assets\tellus
TELLUS_TEXT_TO_IMAGE_PROVIDER=gradio
TELLUS_TEXT_TO_IMAGE_BASE_URL=http://192.168.1.173:7862
TELLUS_GRADIO_IMAGE_API_NAME=generate
TELLUS_GENERATION_JOB_TIMEOUT_MS=240000
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

`TELLUS_GENERATION_JOB_TIMEOUT_MS` caps each queued 3D generation lane. Keep it
long enough for Z-Image plus the 3D model step to finish, but short enough that
a wedged upstream Gradio request cannot block later visitors indefinitely.

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
