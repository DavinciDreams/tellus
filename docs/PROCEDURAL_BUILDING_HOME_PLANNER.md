# Procedural Building Home Planner

Tellus already has procedural building recipes that produce deterministic, placeable,
collidable world objects through `procedural://building-*` URLs. The home planner
should grow from that surface instead of becoming a second asset system: a user can
design or import a custom house in a standalone planner, then publish that design as
a compact procedural building payload that Tellus can place, sync, clone, collide
with, and decorate like any other world object.

## Goals

- Let users create a custom home shape from a plan drawing, manual sketch, or recipe.
- Preserve clean collision by generating wall/floor/roof primitives from structured
  dimensions instead of relying on opaque meshes.
- Support decoration with Tellus asset-store furniture, user-created assets, and
  image-uploaded furniture/decor without baking those choices into the building
  shell.
- Keep the planner modular enough to run as a standalone tool, while exporting a
  Tellus-compatible object that works inside worlds.
- Make imported drawings explainable and editable: every detected wall, room, door,
  window, and scale marker should become data the user can correct.

## Non-Goals For The First Pass

- Full CAD/BIM compatibility.
- Fully automatic architectural inference from arbitrary perspective house photos.
- Structural engineering validation, code compliance, or cost estimation.
- Replacing the existing procedural building catalog.

## Existing Anchors

- `src/tellus-proc-buildings.ts` owns recipe IDs, dimensions, material options, and
  local mesh generation.
- `src/tellus-procedural-assets.ts` parses `procedural://` URLs and dispatches to
  procedural builders.
- `src/tellus-world-object-profile.ts` derives target height and collision footprint
  for world objects.
- `docs/VEGETATION_BUILDING_EXCLUSION_NOTES.md` records the current building
  footprint/scaling gotcha: rendered bounds are authoritative after fit-to-height,
  while recipe dimensions are only a fallback.

The planner should respect those boundaries. The procedural building generator can
gain a structured-plan input, but Tellus world placement should still see one
placeable building shell plus optional child decorations.

## Proposed Module Boundary

Create a planner module that is independent of the main Tellus scene loop:

```text
src/home-planner/
  plan-schema.ts          // stable, renderer-independent building plan types
  plan-import.ts          // image/vector/manual input normalization
  plan-solver.ts          // wall loops, room polygons, scale, openings
  plan-to-building.ts     // converts a plan into procedural building primitives
  furniture-catalog.ts    // asset-store furniture/decor query helpers
  export-tellus.ts        // emits procedural URL/payload + GeneratedThing helpers
```

The procedural building renderer should accept a normalized plan, not raw images.
That keeps OCR/computer-vision churn out of collision, world sync, and rendering.

## Plan Schema Sketch

The central artifact should be a versioned, serializable `HomePlan`:

```ts
export interface HomePlan {
  schemaVersion: 1;
  id: string;
  label: string;
  units: "m" | "ft";
  scaleMetersPerPixel?: number;
  levels: HomePlanLevel[];
  style?: HomePlanStyle;
}

export interface HomePlanLevel {
  index: number;
  elevationM: number;
  floorHeightM: number;
  exterior: PlanPolygon;
  rooms: PlanRoom[];
  walls: PlanWall[];
  openings: PlanOpening[];
}

export interface PlanWall {
  id: string;
  from: PlanPoint;
  to: PlanPoint;
  thicknessM: number;
  kind: "exterior" | "interior";
}

export interface PlanOpening {
  id: string;
  wallId: string;
  centerM: number;
  widthM: number;
  kind: "door" | "window" | "arch";
}
```

This schema is intentionally close to collision geometry: thick wall segments,
room polygons, openings, floor height, and exterior footprint. Visual features like
bays, turrets, porches, and roof segments can be derived or stored as optional style
annotations after the clean shell exists.

## Import Pipeline

1. Normalize the source image.
   Deskew, crop, boost contrast, and isolate dark wall strokes.

2. Establish scale.
   Prefer explicit dimension labels such as `12'-6"` or metric labels like
   `3,81x5,30`; otherwise ask the user to drag a known-length ruler.

3. Extract wall candidates.
   Detect thick black line segments, merge collinear fragments, snap near-right
   angles, and build closed exterior/interior loops.

4. Detect openings.
   Identify door swing arcs, gaps in wall strokes, and window tick marks. Keep
   confidence scores so the editor can flag uncertain openings.

5. Infer rooms and levels.
   Build room polygons from wall loops. Multi-level drawings become stacked
   `HomePlanLevel` records with aligned stair cores when possible.

6. Let the user correct.
   The importer should always land in an editor where walls, dimensions, openings,
   and level alignment can be fixed before export.

7. Generate the shell.
   Convert `HomePlan` into procedural wall/floor/roof meshes with collider-friendly
   primitives. Decorative facade details are layered on top.

## Tellus Integration

The cleanest integration is a plugin-style asset source:

- Standalone planner stores `HomePlan` JSON and preview thumbnails.
- Export creates either:
  - a compact `procedural://home-plan/<planId>?seed=...` URL that resolves against a
    local/synced plan registry, or
  - an expanded `procedural://building-custom?...` URL for small plans.
- Tellus places the exported home as a normal `GeneratedThing`.
- Furniture and decorations are separate asset-store-backed child placements
  associated with the home ID, so users can move/remove the shell without losing
  object provenance.
- The create/upload surface should keep using Tellus context: outdoor creation can
  favor buildings/environment, while interiors favor furniture/decor.
- Collision comes from generated wall/floor primitives, not from decorative meshes.

For persistence, prefer a plan asset record over embedding large JSON in `modelUrl`.
The `modelUrl` can remain an opaque handle while Hyades/Tellus syncs the associated
plan document through the world state layer.

## Fancier Reference Mode

The attached reference suggests a house-design workflow with a facade image plus
floor plans. Treat those as complementary inputs:

- Floor plans define dimensions, room layout, collision, stairs, doors, and windows.
- Facade/reference images suggest materials, roof color, bay windows, porches,
  turrets, trim colors, and garden-facing decoration.
- The planner should show these suggestions as editable style choices, not hidden
  facts. A user should be able to accept "green shingle roof", reject "tower", or
  move a detected bay window.

## First Milestones

1. Add `HomePlan` schema and fixtures for a simple rectangular house and an L-shaped
   house.
2. Build `plan-to-building` to emit the same kind of collidable Three.js group the
   current recipe builder emits.
3. Add a custom-home procedural URL parser behind the existing procedural asset
   dispatcher.
4. Create a small editor/import sandbox outside `main.tsx`.
5. Add image import for high-contrast floor plans: wall thresholding, scale marker,
   editable wall loops.
6. Add Tellus placement/export: one custom home shell plus optional asset-store
   furniture child objects.
7. Use asset-store IDs for generated/uploaded furniture and decor so planner assets
   can be reused outside the custom home.

## Open Questions

- Should custom plans be stored in Hyades world state, asset-store metadata, or a
  separate planner registry?
- Do interiors need navigable room-level collision immediately, or is exterior shell
  collision enough for the first Tellus export?
- Should uploaded furniture photos become billboards, generated low-poly proxies, or
  prompts into the existing asset-store generation path?
- How should a house behave when cloned into another world: copy the plan document,
  reference the original, or snapshot it into the destination world?
