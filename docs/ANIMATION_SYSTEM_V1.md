# Tellus Animation System v1

Tellus animation control is intent-first: callers ask for a behavior (`dance`, `throw`, `flap`,
`run`) and the runtime resolves that to the best available clip for the actor.

## Actors

- `avatar` / `agent`: VRM avatars use the VRMA catalog. Exact clip names still work, while intents
  resolve through the catalog categories.
- `animal` / `mount` / `vehicle`: placed GLB and VRM objects use their embedded clip names. Movement
  intents prefer realistic aliases such as `walk`, `trot`, `run`, `gallop`, `fly`, and `swim`.
- `object`: non-living placed objects can still loop an exact embedded clip when available.

## Agent Tool Contract

Agents can call `playAnimation` with:

```json
{ "intent": "dance" }
```

to animate their local avatar body, or:

```json
{ "targetId": "world-asset-id", "intent": "graze" }
```

to animate a placed animal, mount, vehicle, or VRM object. `name` and `animation` remain supported
for exact clip names. `text` or `prompt` can be used for conversational inference, such as
`"would you like to dance?"`.

Placed-object animation choices persist by default so all clients converge through
`generated.upsert`. Agents can pass `{ "persist": false }` for a local/transient test.

## Built-In Interaction Hooks

- Mounts continue to switch between idle/walk/run while ridden.
- Air and water mounts translate movement intents to fly/swim clips where those exist.
- Throwing a selected object triggers a best-effort avatar `throw` intent while preserving the
  existing ballistic object physics.

## Boundary For v1

The v1 runtime does not yet autonomously move every animal around the island. Movement authority
needs an ownership rule so multiple clients do not fight over the same deer or mount and publish
conflicting positions. The intent resolver and `playAnimation targetId` path are the foundation for
that next behavior layer.

## Asset Store Enrichment Targets

The asset store should make animation search intent-aware instead of relying on clip names alone.
Keep the raw/original clip names, but enrich each animation with stable metadata Tellus can query.

### Per Animation Clip

Recommended fields:

```json
{
  "id": "immutable-animation-or-clip-id",
  "assetId": "immutable-model-or-vrma-asset-id",
  "name": "Horse_Gallop",
  "aliases": ["gallop", "run", "fast horse movement"],
  "format": "embedded-glb|vrma|fbx|gltf",
  "actorKind": "avatar|agent|animal|mount|vehicle|object",
  "skeletonProfile": "vrm-humanoid|mixamo-humanoid|quadruped|bird|fish|vehicle|unknown",
  "intents": ["run"],
  "category": "locomotion|gesture|dance|action|sport|pose|ambient|transition|other",
  "loop": true,
  "durationSeconds": 1.42,
  "rootMotion": "in-place|root-motion|mixed|unknown",
  "speedMetersPerSecond": 7.5,
  "direction": "forward|backward|left|right|turn-left|turn-right|none|unknown",
  "gait": "walk|trot|canter|gallop|flap|swim|idle|unknown",
  "transition": {
    "from": ["idle"],
    "to": ["run"]
  },
  "quality": {
    "score": 0.0,
    "issues": ["foot-sliding", "jaw-smushed", "bad-loop", "wrong-scale"]
  },
  "searchText": "horse gallop forward fast run mount locomotion"
}
```

The highest-value fields for the first enrichment pass are `actorKind`, `skeletonProfile`,
`intents`, `category`, `loop`, `rootMotion`, `speedMetersPerSecond`, `gait`, `aliases`, and
`quality.issues`.

### Per Animated Model

Recommended fields:

```json
{
  "assetId": "immutable-model-id",
  "actorKind": "animal|mount|vehicle|object|avatar",
  "speciesOrType": "horse",
  "mountable": true,
  "vehicleMode": "ground|water|air|none",
  "canonicalHeightMeters": 1.6,
  "groundContact": "feet|wheels|hull|hover|unknown",
  "movement": {
    "idleIntent": "idle",
    "walkIntent": "walk",
    "runIntent": "run",
    "turnRateDegreesPerSecond": 120
  },
  "anchors": {
    "seat": { "x": 0, "y": 1.35, "z": -0.2 },
    "head": { "x": 0, "y": 1.8, "z": 0.8 }
  },
  "animationClipIds": ["clip-id-1", "clip-id-2"]
}
```

This gives Tellus enough information to:

- choose idle/walk/run/fly/swim clips without fragile name guessing;
- gate mounts to assets with suitable movement clips;
- pick ambient animal loops such as `graze`, `flap`, or `wander`;
- normalize scale relative to the avatar;
- avoid low-quality clips or assets with known visual defects;
- expose animation search to agents without handing them hundreds of raw clip names.

### Search Behavior

Search should support both structured filters and text:

- `intent=dance`, `actorKind=avatar`, `category=dance`
- `intent=run`, `actorKind=mount`, `skeletonProfile=quadruped`
- `intent=flap`, `actorKind=animal`
- `quality.issues` excludes, such as no `bad-loop` or `wrong-scale`

Text search should index `name`, `aliases`, `intents`, `category`, `actorKind`, `speciesOrType`,
`skeletonProfile`, `gait`, and `searchText`.
