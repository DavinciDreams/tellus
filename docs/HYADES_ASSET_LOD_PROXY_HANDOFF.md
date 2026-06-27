# Hyades Asset LOD Proxy Handoff

**Status:** handoff for Hyades public API work

**Audience:** Hyades gateway / Tellus world-state maintainers

Tellus is ready to consume asset-store LOD artifacts through the Hyades public
asset proxy. The asset store is serving the LOD outputs, but the current Hyades
public surface only exposes `/game-optimized`; Tellus probes the LOD URLs and
falls back to `/game-optimized` until the proxy routes exist.

## Client-Facing Contract

Hyades should expose these routes from the same origin as the world API:

| Method | Tellus / Hyades route | Upstream asset-store route |
| --- | --- | --- |
| `GET`, `HEAD` | `/api/assets/model/{assetId}/game-optimized` | `/api/assets/model/{assetId}/game-optimized` |
| `GET`, `HEAD` | `/api/assets/model/{assetId}/lod/0` | `/api/assets/model/{assetId}/lod/0` |
| `GET`, `HEAD` | `/api/assets/model/{assetId}/lod/1` | `/api/assets/model/{assetId}/lod/1` |
| `GET`, `HEAD` | `/api/assets/model/{assetId}/lod/2` | `/api/assets/model/{assetId}/lod/2` |
| `GET`, `HEAD` | `/api/assets/model/{assetId}/impostor` | `/api/assets/model/{assetId}/impostor` |

The asset-store OpenAPI document is available at
`https://3d.flobots.xyz/api/openapi.json`; as of the 2026-06-27 redeploy it
defines the `AssetLodUrls` shape and the `/api/assets/model/{model_id}/...`
runtime routes above.

Tellus builds these URLs in `src/tellus-urls-identity.ts`:

- `assetStoreGameOptimizedModelUrl(assetId)`
- `assetStoreLodModelUrl(assetId, 0 | 1 | 2)`
- `assetStoreImpostorModelUrl(assetId)`
- `assetStoreOptimizedAssetUrls(assetId)`

The dev helper `window.__tellusAssetLodUrls(assetIdOrUrl)` returns the concrete
URLs Tellus will try for a given asset id or model URL.

## Proxy Behavior

- Preserve the binary response body exactly. GLB responses should keep
  `Content-Type: model/gltf-binary` when upstream provides it.
- Forward `Range` requests and pass through `206 Partial Content`,
  `Content-Range`, `Accept-Ranges`, `Content-Length`, `ETag`, and cache headers.
  Browsers and GLTF tooling can tolerate full `200` responses, but range support
  is useful for large models and diagnostics.
- `HEAD` should return the same status and headers as `GET` without a body. If
  upstream does not support `HEAD`, the gateway may synthesize it from a ranged
  or metadata request.
- Preserve upstream `404` for missing LOD artifacts. Tellus uses 404 as a clean
  signal to fall back to `/game-optimized`.
- Do not rewrite `assetId`; it must be the immutable asset-store model id.
  Continue preserving `assetStoreModelId` through world snapshots, patches, and
  imports. `modelUrl` is only a cached fetch hint.
- Apply the same auth/session policy as `/game-optimized`. Public Tellus-ready
  assets must be readable by world clients; private assets should remain gated
  consistently with the asset store.
- Keep CORS compatible with the current Hyades asset proxy. Tellus normally
  requests same-origin via `worldApiBase`, and local dev routes through
  `/__hyades`, but deployed clients still benefit from correct CORS headers.

## Fallback Semantics

Tellus should be able to probe:

1. `/lod/0`
2. `/lod/1`
3. `/lod/2`
4. `/impostor`
5. `/game-optimized`

The expected server behavior is:

- `200` or `206`: artifact exists and can be loaded.
- `404`: artifact not generated yet or unavailable; client falls back.
- `401` / `403`: authorization problem; client should not silently treat this
  as an ordinary missing LOD.
- `5xx`: transient gateway/upstream failure; client may retry but should keep
  the existing visible mesh if one is already mounted.

## Smoke Tests

Replace `$assetId` with an asset that has passed the asset-store LOD pipeline.

PowerShell:

```powershell
$base = "https://hyades.gnostr.cloud/api/assets/model/$assetId"
foreach ($path in @("game-optimized", "lod/0", "lod/1", "lod/2", "impostor")) {
  $url = "$base/$path"
  try {
    $response = Invoke-WebRequest `
      -Uri $url `
      -Method Get `
      -Headers @{ Range = "bytes=0-0" } `
      -UseBasicParsing
    "$path $($response.StatusCode) $($response.Headers['Content-Type']) $($response.Headers['Content-Range'])"
  } catch {
    $status = $_.Exception.Response.StatusCode.value__
    "$path $status"
  }
}
```

Node:

```bash
node -e "const id=process.argv[1]; const paths=['game-optimized','lod/0','lod/1','lod/2','impostor']; (async()=>{for(const p of paths){const u='https://hyades.gnostr.cloud/api/assets/model/'+encodeURIComponent(id)+'/'+p; const r=await fetch(u,{headers:{Range:'bytes=0-0'}}); console.log(p,r.status,r.headers.get('content-type'),r.headers.get('content-range')); await r.body?.cancel?.();}})()" "$assetId"
```

Expected result for a fully processed asset:

- `game-optimized`: `200` or `206`, GLB content type
- `lod/0`: `200` or `206`, GLB content type
- `lod/1`: `200` or `206`, GLB content type
- `lod/2`: `200` or `206`, GLB content type
- `impostor`: `200` or `206` if the asset store emits a runtime asset at that
  route; otherwise `404 application/json` with `{"error":"No impostor variant"}`
  is the current clean missing-artifact response

## Tellus Follow-Up After Proxy Lands

Once Hyades exposes the routes, Tellus can make a focused rendering PR:

- Probe the LOD routes for asset-store generated models.
- Load available GLBs into a `THREE.LOD` chain.
- Fall back to the existing `/game-optimized` path if any LOD route is missing
  or fails transiently.
- Extend `window.__tellusThingsDebug()` and `window.__tellusPerf().generatedAssets`
  with LOD status, loaded levels, and fallback reason.
