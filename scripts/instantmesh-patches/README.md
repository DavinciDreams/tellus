# InstantMesh — Tellus app.py patch and config state

> **Why this exists.** `setup-instantmesh.sh`, `start-instantmesh.sh` and
> `benchmark-instantmesh.mjs` all pass `INSTANTMESH_*` environment variables,
> but upstream `app.py` does not read them. The patch here is what makes those
> variables take effect. It was previously an uncommitted local edit on one
> machine, so a clean rebuild from this repo would have silently ignored every
> tuning setting. Apply it after cloning upstream.

Archived 2026-08-11 before reclaiming the image and checkpoints.

## Upstream pin
Repo:   https://github.com/TencentARC/InstantMesh
Commit: 08822c52fdc399b93ea00e4fa9e596344ed52ccc
Branch: main (unmodified except app.py, see patch)

## Local change
Only `app.py` was modified. See `app.py-tellus-tuning.patch`.
It adds environment-tunable parameters for Tellus live use:

| Env var | Default | Purpose |
|---|---|---|
| INSTANTMESH_SAMPLE_STEPS | 30 (clamped 30-75) | sampling steps |
| INSTANTMESH_SAMPLE_SEED | 42 | seed |
| INSTANTMESH_CLEAN_WHITE_BG | 1 | white-background cleanup |
| INSTANTMESH_WHITE_BG_THRESHOLD | 235 | bg threshold |
| INSTANTMESH_WHITE_BG_CHROMA | 35 | bg chroma tolerance |
| INSTANTMESH_MESH_GRID_RES | 64 | overrides model_config.params.grid_res |
| INSTANTMESH_PREVIEW_RENDER_SIZE | 256 | overrides infer_config.render_resolution |

grid_res and render_resolution are pushed into the loaded config after
OmegaConf.load, so they override the yaml at runtime.

## Docker image (tellus-instantmesh:latest, built 2026-06-06)
CUDA image. torch 2.1.0+cu121, torchvision 0.16.0, torchaudio 2.1.0, triton 2.1.0.
WORKDIR /workspace/instantmesh, CMD python app.py, EXPOSE 43839,
entrypoint /opt/nvidia/nvidia_entrypoint.sh.

## Checkpoints (NOT archived — re-downloadable)
instantmesh-ckpts 8.3G (incl. instant_mesh_large.ckpt, TencentARC/InstantMesh
HF snapshots), instantmesh-hf-cache 328M, instantmesh-u2net 168M (bg removal).

## Rebuild
git clone https://github.com/TencentARC/InstantMesh && git checkout 08822c5
git apply app.py-tellus-tuning.patch
then rebuild the image and re-download checkpoints.
