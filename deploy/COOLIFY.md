# Deploying Tellus on Coolify (auto-deploy on git push)

> **Optional hosting path.** Production Tellus currently deploys through the
> tag-triggered Gnostr workflow in
> [`docs/GNOSTR_CLOUD_SETUP.md`](../docs/GNOSTR_CLOUD_SETUP.md). Use this guide
> only for an independent Coolify deployment.

Tellus is a plain Dockerfile app (Bun: builds the SPA into `dist/`, serves it + the `/api/*` routes
on port 3000), so Coolify can build and auto-deploy it straight from this repo. The **world** lives in
the Hyades cluster (`worldApiBase` in `public/tellus-config.json` → `https://hyades.gnostr.cloud`), so a
Coolify deployment only serves the SPA plus the server-side generation, generated-asset, TTS, and
Tellus-state routes. Shared world traffic still goes directly to Hyades.

## One-time setup in Coolify

1. **New Resource → Application → Public/Private Repository** → point it at this repo
   (`DavinciDreams/tellus`), branch `master`.
2. **Build Pack: Dockerfile** (the repo's `Dockerfile` is used as-is). **Port: 3000.**
3. **Environment variables** (Settings → Environment Variables):
   - For Hyades-hosted 3D generation, set `TELLUS_3D_BACKEND=hyades` and
     `HYADES_3D_API_KEY` to a bearer with the `generate3d` capability **(mark it
     as secret)**. `HYADES_3D_API_KEY` falls back to `HYADES_API_KEY`.
   - Optional overrides include
     `HYADES_3D_API_BASE=https://hyades.gnostr.cloud`,
     `HYADES_BASE_URL=https://hyades.gnostr.cloud`, and `NODE_ENV=production`.
   - The browser config (`worldApiBase`, providers, day/night, …) ships in `public/tellus-config.json`
     and is baked at build — no env needed. `apiBase` is `""` (same-origin), so the SPA calls this
     deployment's own `/api/*`. To override per-deploy without a rebuild, mount a file over
     `/app/dist/tellus-config.json` (Coolify → Storages → File Mount).
4. **Domain**: set the FQDN (Coolify provisions TLS via its Traefik + Let's Encrypt). The world traffic
   goes browser→Hyades directly, so the domain only needs to reach this container.
5. **Health check**: HTTP `GET /health` on port 3000.
6. **Auto-deploy**: enable **"Automatic Deployment"** and add the GitHub webhook Coolify shows (or connect
   the Coolify GitHub App). Every push to `master` then rebuilds and redeploys.

## Notes

- The Hyades 3D bearer must be `generate3d`-capable; provision it on the Hyades side (`/admin/keys`).
- Build is single-arch for the Coolify host (simpler than the multi-arch k3s image); the Dockerfile is
  identical.
- This is independent of the in-cluster k3s deployment (`deploy/k8s/tellus.yaml`); run either or both.
  Both serve their own `/api/*` and point the world at the same Hyades cluster.
