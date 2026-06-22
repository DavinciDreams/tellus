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
