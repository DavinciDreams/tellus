# Forest Canopy LOD Notes

## Direction

Dense Earth-like forests should not stay as individual tree meshes at far distance. A realistic conifer slope can imply tens of thousands of stems in one visible patch, so the far LOD should become a biome canopy representation:

- Near band: individual procedural trees, authored GLBs, or manually planted ornamentals.
- Transition band: low-poly or impostor edge trees, especially along gaps and treelines.
- Far dense band: terrain-like canopy surface with seeded crown peaks, radial shading, and biome tint.
- Ultra-far band: biome color/noise, sprites, or baked canopy/impostor texture.

## Conifer Canopy Surface

For pine, spruce, and fir stands, the target visual is a blanket of overlapping spikes rather than isolated little trees.

- Generate crown centers from biome, soil/substrate, elevation, slope, moisture, and stand density.
- Use forestry metrics such as basal area, DBH, crown diameter, and site quality to derive stems/ha and canopy cover.
- Convert dense stands into a procedural heightfield above terrain.
- Raise vertices into semi-random conical or radial crown peaks.
- Align vertex color or texture shading to the same crown centers so dark troughs and bright tips match the height map.
- Preserve gaps/clearings as lower canopy depressions or holes.
- Spawn a few meshes/impostors at canopy edges, in sparse gaps, and at the treeline.

Treeline conifers should use a separate habit from downslope forest trees: shorter, wind-pruned, asymmetric, knotty, sparse, and clustered.

## Mixed Hardwood And Splat Candidates

Mixed hardwood is less regular than conifer canopy and may be better represented by a soft aggregate:

- Gaussian splats or splat-like impostor clusters.
- Soft lumpy canopy blobs with broader color variation.
- Seasonal palette shifts.
- Edge meshes/impostors where individual trunks/crowns become readable.

Likely hybrid:

- Conifer/taiga/alpine forest: spiky procedural canopy mesh.
- Temperate/tropical broadleaf or mixed hardwood: splat canopy or soft billboard clusters.
- Sparse savanna, coastal, alpine gaps: individual low-poly trees and impostors.

## Tree LOD Distance Lab

The dev page `tree-lod-gallery.html` is useful beyond this experiment. It should either remain as a Tellus diagnostics page or become a standalone proc-plant/canopy modeling app.

Useful future upgrades:

- Drive candidate species from the proc-plant ecology profiles.
- Compare individual meshes, impostors, canopy surfaces, and splats under the same forestry assumptions.
- Model mixed biome canopies and understory layers.
- Add edge/treeline transition controls.
- Export tuned canopy parameters back into Tellus biome ecology defaults.

The key insight from the lab: a real stand target such as `27.6 m2/ha` basal area can imply roughly `220 stems/ha` at `40 cm` DBH. On a large visible mountain patch, that can mean tens of thousands of stems, which should be aggregated into canopy mass instead of rendered as individual far trees.
