# Vegetation Building Exclusion Notes

Procedural building recipes expose useful footprint dimensions, but those dimensions are not the final rendered footprint. Buildings are later passed through `fitModelToHeight(assetTargetHeight(thing))`, so avatar/world-object scaling can change the visible width and depth.

For vegetation suppression around buildings:

- Prefer rendered mesh bounds once the model is loaded.
- Use recipe dimensions only as a temporary fallback.
- When using recipe dimensions, scale them by `assetTargetHeight(thing) / dims.bodyHeight`, not directly by `thing.scale`.
- Refresh ambient vegetation and procplants after building placement, load, move, rotate, scale, clone, delete, and remote/saved building reconciliation.

This avoids palm trees or procplants growing through houses while preserving the scaling behavior used by grounding, collisions, and visible object placement.
