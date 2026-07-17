# Deer asset intake

The first wildlife slice expects one low-poly, skinned deer GLB with embedded, in-place animation clips. The minimum useful vocabulary is `idle`, `walk` or `trot`, and `run` or `gallop`; a grazing/eating clip is strongly preferred. Geometry, materials, textures, and clip objects are shared by near-field clones. Skinned instances are not sent through ordinary `THREE.InstancedMesh` because each skeleton needs an independent pose.

Run the pack audit before selecting the model:

```powershell
bun run wildlife:audit --input="C:\path\to\Quaternius-pack" --output="wildlife-pack-audit.json"
# Or inspect one candidate without scanning the surrounding directory:
bun run wildlife:audit --file="C:\path\to\Stag.gltf" --output="wildlife-pack-audit.json"
```

The report flags missing skins/clips and accidental transparent materials. The selected vertical-slice asset is the user-supplied `Stag.gltf`, transformed to `public/wildlife/deer/stag.glb` with deduplication, pruning, animation resampling, quantization, and Meshopt compression. Its runtime payload is 404,948 bytes, with 7,438 vertices, 3,670 triangles, one skin, opaque materials, and 13 clips. This is substantially smaller than the 1,352,968-byte game-optimized Baby Reindeer fallback while adding a literal `Eating` clip.

Before a public release, retain the source pack's license/provenance record alongside the asset; the standalone file did not embed that record. An authenticated world owner can opt a placed animal into the deer system from the browser console:

```js
window.tellusAgent.configureWildlife("generated-thing-id", {
  speciesProfileId: "deer",
  herdId: "meadow-deer",
  radiusMeters: 48,
});
```

Or create a bounded six-animal vertical-slice herd using the optimized local Stag asset:

```js
window.tellusAgent.populateDeerHerd({
  count: 6,
  herdId: "meadow-deer",
  radiusMeters: 48,
});
```

Population is capped by the deer profile at 12. Generated placements are persisted first and wildlife configuration frames follow on the same ordered world socket, so other clients converge on the same member ids and the authoritative Hyades herd.

Agents and owners can then issue bounded commands:

```js
window.tellusAgent.commandWildlife({
  herdId: "meadow-deer",
  intent: "travel",
  destination: { x: 20, y: 0, z: 35 },
  durationSeconds: 20,
});
```

Near deer use independent animation mixers. Mid/far deer use a single-draw instanced proxy today; the `wildlifeInstancedAnimation` capability is reserved for a VAT renderer so a future baked Quaternius tier can animate independently without changing simulation or network protocol.
