# Optional Coolify deployment for Tellus

Tellus is currently deployed to Gnostr at <https://tellus.gnostr.cloud/>. See
`docs/GNOSTR_CLOUD_SETUP.md` for the active deploy path. This Coolify note is
for standing up a separate Dockerfile-based copy, not for the current production
deployment.

Tellus is a plain Dockerfile app (Bun: builds the SPA into `dist/`, serves it + the `/api/*` routes
on port 3000), so Coolify can build and auto-deploy it straight from this repo. The **world** lives in
the Hyades cluster (`worldApiBase` in `public/tellus-config.json` → `https://hyades.gnostr.cloud`), so a
Coolify deployment only serves the SPA + the server-side `/api/*` endpoints (chat, generate-3d, world-feedback,
tellus-state) — which proxy to Hyades using the env vars below.

## One-time setup in Coolify

1. **New Resource → Application → Public/Private Repository** → point it at this repo
   (`DavinciDreams/tellus`), branch `main`.
2. **Build Pack: Dockerfile** (the repo's `Dockerfile` is used as-is). **Port: 3000.**
3. **Environment variables** (Settings → Environment Variables):
   - `HYADES_API_KEY` = a Hyades bearer with the `generate3d` capability **(mark as secret)** — the only
     required one; without it `/api/chat`, `/api/generate-3d`, `/api/world-feedback` return 503.
   - `TELLUS_3D_BACKEND=hyades` so `/api/generate-3d` uses Hyades `/3d/jobs` for the durable queue,
     Z Image Turbo concept image, selected 3D provider, and asset-store upload. This is also the
     default whenever `HYADES_API_KEY` is set; use `TELLUS_3D_BACKEND=direct` only for local Gradio
     development.
   - Optional (these already have correct defaults baked into the API handlers, set only to override):
     `HYADES_LLM_BASE=https://hyades.gnostr.cloud/v1`, `HYADES_LLM_MODEL=glm-5.1`,
     `HYADES_VISION_MODEL=holo3.1`, `HYADES_3D_API_BASE=https://hyades.gnostr.cloud`,
     `HYADES_BASE_URL=https://hyades.gnostr.cloud`, `NODE_ENV=production`.
   - The browser config (`worldApiBase`, providers, day/night, …) ships in `public/tellus-config.json`
     and is baked at build — no env needed. `apiBase` is `""` (same-origin), so the SPA calls this
     deployment's own `/api/*`. To override per-deploy without a rebuild, mount a file over
     `/app/dist/tellus-config.json` (Coolify → Storages → File Mount).
4. **Domain**: set the FQDN (Coolify provisions TLS via its Traefik + Let's Encrypt). The world traffic
   goes browser→Hyades directly, so the domain only needs to reach this container.
5. **Health check**: HTTP `GET /health` on port 3000.
6. **Auto-deploy**: enable **"Automatic Deployment"** and add the GitHub webhook Coolify shows (or connect
   the Coolify GitHub App). Every push to `main` then rebuilds + redeploys with zero-downtime.

## Notes

- `HYADES_API_KEY` must be `generate3d`-capable — provision it on the Hyades side (`/admin/keys`).
- `TELLUS_3D_BACKEND=hyades` means `/api/generate-3d` does not need direct
  `PIXAL3D_GRADIO_BASE_URL` or `INSTANTMESH_GRADIO_BASE_URL` access. Hyades
  owns the queue, Z Image Turbo concept image, selected 3D provider, and
  asset-store upload.
- Use `TELLUS_3D_BACKEND=direct` only for local/provider debugging. In direct
  mode the Tellus container must reach the Gradio URL itself.
- The browser-level `generationProvider` is one world-level knob shared by
  player and agent generation. Do not add separate player/agent provider env
  vars to deploy config.
- If generated assets upload but do not render, check Hyades asset proxy routes
  and `assetStoreModelId` preservation before changing provider settings.
- Build is single-arch for the Coolify host (simpler than the multi-arch k3s image); the Dockerfile is
  identical.
- This is independent of the in-cluster k3s deployment (`deploy/k8s/tellus.yaml`); run either or both.
  Both serve their own `/api/*` and point the world at the same Hyades cluster.
