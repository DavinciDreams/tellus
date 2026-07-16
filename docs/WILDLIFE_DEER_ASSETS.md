# Deer asset intake

The first wildlife slice expects one low-poly, skinned deer GLB with embedded, in-place animation clips. The minimum useful vocabulary is `idle`, `walk` or `trot`, and `run` or `gallop`; a grazing/eating clip is strongly preferred. Geometry, materials, textures, and clip objects are shared by near-field clones. Skinned instances are not sent through ordinary `THREE.InstancedMesh` because each skeleton needs an independent pose.

Run the pack audit before selecting the model:

```powershell
bun run wildlife:audit --input="C:\path\to\Quaternius-pack" --output="wildlife-pack-audit.json"
```

The report flags missing skins/clips and accidental transparent materials. After selection, upload the game-optimized GLB through the normal asset store and place its generated thing in Tellus. An authenticated world owner can opt it into the deer system from the browser console:

```js
window.tellusAgent.configureWildlife("generated-thing-id", {
  speciesProfileId: "deer",
  herdId: "meadow-deer",
  radiusMeters: 48,
});
```

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
