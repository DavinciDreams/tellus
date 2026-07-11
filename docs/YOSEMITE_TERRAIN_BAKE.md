# Real-Place Terrain Bakes

Tellus can render real-place terrain worlds from public-domain USGS 3DEP elevation data.

## Sources

- Dataset: USGS 3DEP 1/3 arc-second DEM
- Yosemite tile: `n38w120`
  `https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n38w120/USGS_13_n38w120.tif`
- Grand Canyon tile: `n37w113`
  `https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n37w113/USGS_13_n37w113.tif`
- License: USGS 3DEP public domain
- Yosemite bbox:
  `-119.72,37.69,-119.48,37.80`
- Grand Canyon bbox:
  `-112.25,36.02,-111.75,36.35`

The raw GeoTIFF is cached in `external/usgs-dem/`, which is intentionally ignored by git.

## Regenerate

```sh
npm run terrain:yosemite
```

Grand Canyon:

```sh
node scripts/bake-yosemite-dem.mjs --title="Grand Canyon Terrain" --source-url=https://prd-tnm.s3.amazonaws.com/StagedProducts/Elevation/13/TIFF/current/n37w113/USGS_13_n37w113.tif --bbox=-112.25,36.02,-111.75,36.35 --chunks=20 --vertical-meters-per-unit=14 --cliff-boost=0.55 --out=public/terrain/grand-canyon
```

The script writes static chunk data to:

```text
public/terrain/{terrain-id}/manifest.json
public/terrain/{terrain-id}/chunks/{cx}_{cz}.json
```

Each chunk uses the normal 65x65 Tellus chunk grid with `heightMode: "absolute"`, so the chunk heights are real DEM-derived world heights rather than offsets added on top of procedural Tellus hills.

The default bake is 20 chunks wide and applies a small slope-based cliff boost so Yosemite Valley reads more jagged in the Tellus scale. The generated manifest records the exact source bounds, elevation range, vertical scale, and cliff boost used by the bake.

## Try It

Use a shared-location URL so Tellus starts in the static Yosemite world and spawns near the middle of the bake:

```text
http://127.0.0.1:3344/?world=chunked-64-yosemite&x=960&z=576
```

The world id includes `yosemite`, which makes the chunk renderer prefer `/terrain/yosemite` static files before falling back to Hyades chunk endpoints.

Automatic procplant vegetation is disabled for the Yosemite static terrain world so the DEM reads as a terrain study without biome grass or generated trees obscuring the landform.

For a cleaner terrain-realism experiment without Tellus avatars, fog, terrain paint defaults, world state, or vegetation, use the standalone viewer:

```text
http://127.0.0.1:3344/yosemite-terrain-viewer.html
```

Grand Canyon:

```text
http://127.0.0.1:3344/yosemite-terrain-viewer.html?terrain=grand-canyon
```

The standalone viewer builds one DEM mesh from the same static chunks and provides diagnostic color modes plus vertical scale, satellite blend, rock contrast, forest tint, and sun-angle controls. The satellite mode stitches Esri World Imagery web tiles over the bake bbox at runtime for visual comparison. Terrain-specific viewer defaults can tune the opening camera and vertical scale without changing the underlying bake.

## Cesium Comparison Viewer

For a streamed real-Earth baseline, use the Cesium viewer:

```text
http://127.0.0.1:3344/cesium-terrain-viewer.html
```

It uses `VITE_CESIUM_ION_TOKEN` from `.env.local`, Cesium World Terrain, and Cesium ion imagery. This is intentionally separate from Tellus world rendering so terrain quality, imagery alignment, fog, lighting, and vertical exaggeration can be compared without Tellus terrain paint, skybox, vegetation, or world-state defaults.

Current presets:

- Grand Canyon
- Chaco Canyon
- Temple Portara
- Cahokia
- Yosemite Valley
- Half Dome

Historical overlay toggles:

- `Sites`: labels and point markers for ruins, scan anchors, great houses, mounds,
  and other interpretive points.
- `Recon`: translucent massing/footprint placeholders for reconstruction layers.
- `Align`: ground-clamped celestial or planning-alignment rays.

The first Chaco, Portara, and Cahokia overlays are intentionally approximate. They
are there to validate the module shape and visual language before we connect
authoritative GIS, LiDAR, scan, or reconstruction assets. Treat the alignment rays
as interpretive guides until they are replaced with horizon-aware astronomical
calculations for a specific date, location, and terrain horizon.
