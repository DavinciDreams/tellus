# Procplant realism research notes

This note records which ideas from the current plant-modeling references fit Tellus's real-time,
deterministic branch-module renderer. It is an implementation guide, not a claim that Tellus ports or
reproduces any paper's full method.

## FloraForge

Reference: [FloraForge](https://github.com/baskargroup/FloraForge) and its published
[open-access paper](https://doi.org/10.1016/j.atech.2026.102316).

Useful ideas:

- Keep geometry controlled by biological or morphological names rather than opaque mesh transforms.
- Make the plant description deterministic, human-readable, and editable.
- Describe curvature along an organ, not only its endpoint angle.
- Preserve one continuous hierarchy from stem to branch, petiole, and leaf attachment.

Tellus already follows the first two ideas through `ProcPlantGenome`. Branch-module `spread`, `vigor`,
`droop`, `tropism`, `gnarliness`, and `junctionBlend` should remain authored traits that deterministically
produce instanced geometry. FloraForge's NURBS surfaces are valuable for close-up crop leaves, but are too
heavy to substitute for every forest leaf or branch in the streamed world renderer.

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

Applied in this branch:

- Broadleaf `spread` lengthens horizontal primary scaffolds most strongly and their lateral forks more
  gently. It does not stretch the trunk or increase the module budget.
- `junctionBlend` makes the first child segments follow the parent tangent before reaching their authored
  direction. This approximates delayed strand separation while retaining the same segment prototypes,
  draw-call structure, LOD contracts, and deterministic seed behavior.

A future close-only LOD may add a merged collar mesh or non-circular strand-inspired cross section. That
should not replace instanced branch prototypes at normal forest distances.

## EcoViz

Reference: [jgain/EcoViz](https://github.com/jgain/EcoViz).

EcoViz is most applicable above the single-tree generator. Its vegetation records carry species, height,
canopy radius, DBH, life status, and cohort counts. Tellus should use the same class of forestry attributes
to constrain generated tree scale, crown diameter, trunk girth, stand density, mortality, and far-canopy
aggregation. EcoViz is not itself a source for detailed branch-junction geometry.

## Recommended sequence

1. Finish the current deciduous pass with measured crown width/height and junction-angle diagnostics.
2. Add an optional low-resolution radial crown guide for asymmetric, lobed broadleaf silhouettes.
3. Connect ecology/stand data to height, crown diameter, DBH, and cohort density.
4. Add richer close-only collars and branch cross sections after profiling their geometry and build cost.
5. Reserve spline leaf surfaces for hero plants or crop-scale inspection LODs.
