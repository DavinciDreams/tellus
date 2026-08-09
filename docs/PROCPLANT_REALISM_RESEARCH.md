# Procplant realism research notes

This note records which ideas from the current plant-modeling references fit Tellus's real-time,
deterministic branch-module renderer. It is an implementation guide, not a claim that Tellus ports or
reproduces any paper's full method.

**Status (2026-07): the first realism and loading pass is shipped.** Deciduous
crown spread, junction blending, folded broadleaf surfaces, rounded nearby
trunks, cached Weber-Penn growth data, stable structural LOD, and restored dense
conifer sprays are in the runtime and Biome Mixer where applicable.

## External generator contract acceptance

Tellus accepts Procplants generator contract revision 2, fixture version 2, as
reviewed producer provenance through
`fixtures/procplants/tellus-procplant-contract-v2.golden.json`. The focused
contract-acceptance test pins the approved Phi Fern, Blue Spruce, Clover
Groundcover, and Weeping Willow hashes, UV0 and surface partitions, supported
instance totals, runtime LOD-selection tiers, biome normalization vectors, and
their four decreasing geometry LODs.

This acceptance does not assert that Tellus's current local generator produces
equivalent graphs or geometry. Runtime adoption remains pending a versioned
`procplants/core` package and a thin Tellus adapter; current runtime imports,
default biome mappings, chunk LOD policy, wind, shadows, and asset substitutions
remain unchanged.

The isolated 2026-08 integration also exposes Maidenhair Fern Patch and
Woodland Violet Carpet as explicit procedural placement choices beside the
optimized Clover Groundcover. They are deliberately absent from automatic
paint/ecology patches until field density, shadow, and occupancy behavior is
reviewed. At seed `0x6a09e667`, the three close templates are respectively
2,112, 1,226, and 2,276 triangles with broad 1.72x1.91, 1.23x1.35, and
2.06x1.83 local footprints. Their branch-relative organ frames are finite,
unit-length, orthogonal, and deterministic.

## Current implementation and performance contract

- Authored broadleaf `crownSpread` lengthens primary horizontal scaffolds most
  and lateral forks more gently. It does not stretch the trunk or increase the
  module, branch, or leaf budgets.
- Broadleaf organs share one compact folded surface per geometry key. Per-leaf
  transforms and colors provide variation without adding a mesh, material, or
  draw call for every leaf.
- Conifers stay on their dedicated full-size needle-spray geometry throughout
  the crown and never fall through to folded broadleaf cards.
- Tree placement and scale remain stable as chunks cross LOD rings. Near trees
  retain at least the connected medium crown; farther trees can thin structural
  modules and organs or use supported impostors.
- Weber-Penn growth hierarchies use a bounded eight-entry cache and are reused
  when only bake or foliage options change. Chunk builds also reuse seed-bucketed
  templates, static instance buffers, and cached ecology mixes.
- Moving players receive a quick sparse build. Cold templates and full density
  refine gradually after movement stops under bounded per-update build counts
  and millisecond budgets.
- Phi Fern uses eight branch-relative broad tapered frond cards instead of repeated
  leaflet chains, and Blue Spruce/Alpine Fir use bounded four-sided stems with
  one branch sample while retaining explicit foliage coverage budgets.
- Against the same `origin/master` build, the opt-in contract/cost/groundcover
  pass changes only `tellus-procplant-biomes` materially: 154,248 to 157,662
  raw bytes and 42,042 to 42,760 level-9 gzip bytes (+2.21% raw, +1.71% gzip).
  The main chunk grows by 54 raw bytes and 13 gzip bytes; the shared
  Three.js chunk is byte-identical.

These are quality-preserving reductions in generation and rendering work. They
have build/test/browser coverage, but the July realism pass did not record a
controlled before/after FPS benchmark.

## FloraForge

Reference: [FloraForge](https://github.com/baskargroup/FloraForge) and its published
[open-access paper](https://doi.org/10.1016/j.atech.2026.102316).

Useful ideas:

- Keep geometry controlled by biological or morphological names rather than opaque mesh transforms.
- Make the plant description deterministic, human-readable, and editable.
- Describe curvature along an organ, not only its endpoint angle.
- Preserve one continuous hierarchy from stem to branch, petiole, and leaf attachment.
- Shape leaf blades with an explicit width profile, midrib curve, transverse camber/V-fold, twist, and
  a continuous graft from petiole to blade.

Tellus already follows the first two ideas through `ProcPlantGenome`. Branch-module `spread`, `vigor`,
`droop`, `tropism`, `gnarliness`, and `junctionBlend` should remain authored traits that deterministically
produce instanced geometry. FloraForge's NURBS surfaces are valuable for close-up crop leaves, but are too
heavy to substitute for every forest leaf or branch in the streamed world renderer. The practical
translation is a coarsely tessellated version of the same morphological surface, shared by every leaf
instance of an authored genome.

## LeafFit

Reference: [LeafFit: Plant Assets Creation from 3D Gaussian
Splatting](https://arxiv.org/abs/2602.11577) and its [source
repository](https://github.com/netbeifeng/leaf_fit).

Useful ideas:

- Reuse one thin leaf template across the plant instead of storing a unique mesh for every leaf.
- Preserve per-leaf shape and orientation variation through compact deformation parameters.
- Keep the result editable and game-ready rather than rendering the source reconstruction directly.

Tellus already batches a shared leaf geometry with per-instance transforms and colors. Importing LeafFit's
3D Gaussian segmentation and differentiable MLS fitting would not help procedural trees, but its runtime
representation validates the existing shared-template direction. The leaf pass therefore upgrades that
template and keeps per-instance proportion/orientation variation in instance matrices; it does not add a
mesh, material, or draw call per leaf.

## DeepTreeSketch

Reference: [DeepTreeSketch: Neural Graph Prediction for Faithful 3D Tree Modeling from
Sketches](https://doi.org/10.1145/3613904.3642125).

Useful ideas:

- Treat the tree as a connected hierarchical graph and construct it progressively from the root.
- Separate precise control of structural branches from coarse control of foliage/crown mass.
- Propagate twigs and foliage only after the main skeleton establishes the silhouette.
- Preserve parent context when selecting a child branch's 3D direction.

Tellus branch modules already use parent/child module IDs, breadth-first structural growth, local-frame
fork directions, and terminal-branch foliage. The next appropriate extension is an optional coarse crown
guide (for example radial height/azimuth envelopes), not a runtime neural network. Such a guide could
direct branch endpoints while the existing deterministic graph supplies botanical detail.

## Interactive Invigoration

Reference: [Interactive Invigoration: Volumetric Modeling of Trees with
Strands](https://doi.org/10.1145/3658206) and the authors' [project
page](https://storage.googleapis.com/pirk.io/projects/invigoration/index.html).

Useful ideas:

- Distinguish primary extension from lateral development instead of scaling the whole tree uniformly.
- Let local vigor alter branch length and development.
- Delay branch separation at a fork to create the grown-together junctions seen in mature oak and elm.
- Use strand/profile detail selectively; it improves close branch surfaces but is much more expensive
  than shared tapered segment instances.

Implemented in Tellus:

- Broadleaf `spread` lengthens horizontal primary scaffolds most strongly and their lateral forks more
  gently. It does not stretch the trunk or increase the module budget.
- `junctionBlend` makes the first child segments follow the parent tangent before reaching their authored
  direction. This approximates delayed strand separation while retaining the same segment prototypes,
  draw-call structure, LOD contracts, and deterministic seed behavior.
- Broadleaf cards are now continuous three-column surfaces with a narrow petiole, species width profile,
  subtle asymmetry and twist, genome-driven longitudinal curl, and a venation-driven midrib fold. The
  shared template remains deterministic and instanced, and its triangle ceiling is fixed rather than
  scaling with leaf count.

A future close-only LOD may add a merged collar mesh or non-circular strand-inspired cross section. That
should not replace instanced branch prototypes at normal forest distances.

## EcoViz

Reference: [jgain/EcoViz](https://github.com/jgain/EcoViz).

EcoViz is most applicable above the single-tree generator. Its vegetation records carry species, height,
canopy radius, DBH, life status, and cohort counts. Tellus should use the same class of forestry attributes
to constrain generated tree scale, crown diameter, trunk girth, stand density, mortality, and far-canopy
aggregation. EcoViz is not itself a source for detailed branch-junction geometry.

## Recommended sequence

1. Continue validating the shipped folded leaf template across broadleaf species and preserve its silhouette in impostor bakes.
2. Add an optional low-resolution radial crown guide for asymmetric, lobed broadleaf silhouettes.
3. Connect ecology/stand data to height, crown diameter, DBH, and cohort density.
4. Add richer close-only collars and branch cross sections after profiling their geometry and build cost.
5. Reserve denser spline or MLS-deformed leaf surfaces for hero plants or crop-scale inspection LODs.
