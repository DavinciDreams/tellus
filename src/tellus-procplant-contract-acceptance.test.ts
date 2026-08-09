import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * This fixture is an acceptance/provenance gate for a reviewed Procplants
 * producer contract. It does not claim that Tellus's current local generator
 * produces equivalent graphs, instances, surfaces, or geometry. Runtime parity
 * remains pending a versioned `procplants/core` adapter.
 */

interface GoldenSurfacePartition {
  contract: string;
  version: number;
  triangleCount: number;
  indexCount: number;
  groups: { total: number; barkStem: number; organ: number };
  triangles: { barkStem: number; organ: number };
  coverage: { indices: number; triangles: number; complete: boolean };
}

interface GoldenLod {
  level: number;
  label: string;
  distance: number;
  triangles: number;
  vertices: number;
  attributeLengths: {
    pos: number;
    nrm: number;
    uv0: number;
    col: number;
    tintable: number;
    sway: number;
    idx: number;
  };
  surfacePartition: GoldenSurfacePartition;
  geometryHash: string;
}

interface GoldenPreset {
  presetId: string;
  genome: { hash: string };
  attachmentIr: { hash: string };
  instances: {
    total: number;
    supportedKinds: string[];
    countsByKind: Record<string, number>;
  };
  lodSelection: {
    contract: string;
    version: number;
    tiers: Array<{ id: string; level: number; label: string; minDistance: number }>;
  };
  lods: GoldenLod[];
  hash: string;
}

interface GoldenContractFixture {
  schema: string;
  fixtureVersion: number;
  generatorContractRevision: number;
  biomeNormalization: {
    assetLodPreference: {
      valid: { input: string; normalized: string };
      invalid: { input: string; normalized: string };
    };
  };
  presets: GoldenPreset[];
  hash: string;
}

const fixtureUrl = new URL(
  "../fixtures/procplants/tellus-procplant-contract-v2.golden.json",
  import.meta.url,
);
const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8")) as GoldenContractFixture;

const approvedPresets = [
  {
    presetId: "phiFern",
    genomeHash: "1dd77a256e3dd4ea2e35ab742a6a34ed11a064255bb718e001a3da074e253209",
    attachmentHash: "ea313c5ea915b3d0be7932c83aa760de9fd748ecb1b0cda75b4894e02edb121b",
    presetHash: "ea6fcaad450421e08fca91b8ee82cda4b2456178cbc023ece4b1cfd1584aff44",
    triangles: [1872, 624, 4, 2],
    instanceKinds: ["palmFrond"],
    instanceTotal: 36,
    geometryHashes: [
      "96e96ea2665d0810daf8f5b8c9e503e65f188d678598daac7ee1d182c838bf6e",
      "c5228bf140a4f56c04a00a6e8af6eb186d0fff3477e38421ebfe93e1c31db019",
      "a86f9843220445742e2ec30df1b830809cc3ead7e0fe66d0bfa268380756e791",
      "6fa59899f32e8e556984c81550bb10e9fca1a327448703a56eb83dd21a51d6c6",
    ],
  },
  {
    presetId: "blueSpruce",
    genomeHash: "0680c6b547c5563f31ca977ec2bfb2a9772413f45d14da051415193a79b273eb",
    attachmentHash: "23ff5478e63475f58d6c3ded120b771c72dd3e99d8d7beb8ad7ebc8b620c9e6c",
    presetHash: "53f1e74942d2dbaf7e27b7125fc7dc10f71a3d02b241754f17ba783e5e7c124c",
    triangles: [3934, 2494, 4, 2],
    instanceKinds: [],
    instanceTotal: 0,
    geometryHashes: [
      "81ad2dd1444743537087044202e09e32ccae776251c471646d6089e22316a1d2",
      "bef4107b1f5cb7635b70737f61744258cf8939318c8e246726cf332c7a548a32",
      "0ef98dce11e2d8fe31f0cf13496419b47cdc0435c722709d7e14608dce384301",
      "048a875df31a00c56444a6bb843171f01f77894eb1d4aea49a396f53ac607d1f",
    ],
  },
  {
    presetId: "cloverGroundcover",
    genomeHash: "385ac2e0041bb68fc9447b6628a3375f172eb189f55b252d6bd66f5e62b66625",
    attachmentHash: "3db71208a92e96491fdaaa95af3b5cc89c21ee6feeb80741a7f3141817b9b2d4",
    presetHash: "15871a8a57b2bc499aa8695d7cca4126a4d6ca802ac4e68ab5d9618f8d1c47c6",
    triangles: [662, 382, 4, 2],
    instanceKinds: ["flowerCenter", "leaf", "petal"],
    instanceTotal: 43,
    geometryHashes: [
      "b8ca8d5a96e1b212bf5eff8284db7d999c0633c70f6ece730ba75deab4a55e94",
      "72a0d1cdcdc2281a8508b7b6ec5fbfc43e520c7d0c1e713036a06e09b9145e72",
      "334920a8590db0f8b6ba20471acee7d5e0797ca2a5246bb72bf36c34c69895bd",
      "21379186ec223049cb5f33ea1ed0c1f2c88ba9e40c99811c5ec307fd71f4c23c",
    ],
  },
  {
    presetId: "weepingWillow",
    genomeHash: "3f0e1564a65e66b793b9ae528af7154daf4637c91f0a747b55fc291dd0bdc975",
    attachmentHash: "f0f60ad5b600b6e8acb69a1112e5e3d49085eadd64cca114d7496877649b4812",
    presetHash: "c28831c2be45295e3e18b812a7d7ed2026f2b7d71e3e5c48a7f60c4bbf38e821",
    triangles: [1800, 616, 4, 2],
    instanceKinds: [],
    instanceTotal: 0,
    geometryHashes: [
      "14018471e1c2072f7d83bff84d19885897f54331d2d71741dc6629adfecb31d5",
      "1228e2aa0f959331f3dc93e5b7d9fbba671f2d2a612f334610df87710d2d6f52",
      "332a043f1acbfb8b94979523df0a2bab285da7252792855998b6a9e69c446bda",
      "bc970902923bd23d6dfae727b2ef56a60b690634c20b8af0748278863fa00db9",
    ],
  },
] as const;

const approvedTierIds = [
  "lod0-full",
  "lod1-clustered",
  "lod2-billboard-cross",
  "lod3-impostor",
];

describe("Procplants producer contract acceptance", () => {
  it("accepts reviewed fixture version 2 without asserting Tellus generator parity", () => {
    expect(fixture).toMatchObject({
      schema: "procplants-tellus-golden-contract",
      fixtureVersion: 2,
      generatorContractRevision: 2,
      hash: "28c70baa23fe0bbd5e1e08c0c86b12670f3b70bf4cc62b191bd2a4842deeee95",
    });
    expect(fixture.biomeNormalization.assetLodPreference).toEqual({
      valid: { input: "game-optimized", normalized: "game-optimized" },
      invalid: { input: "unsupported-lod", normalized: "game-optimized" },
    });
    expect(fixture.presets.map(({ presetId }) => presetId)).toEqual(
      approvedPresets.map(({ presetId }) => presetId),
    );

    fixture.presets.forEach((preset, presetIndex) => {
      const approved = approvedPresets[presetIndex]!;
      expect(preset.genome.hash).toBe(approved.genomeHash);
      expect(preset.attachmentIr.hash).toBe(approved.attachmentHash);
      expect(preset.hash).toBe(approved.presetHash);

      expect(preset.instances.supportedKinds).toEqual(approved.instanceKinds);
      expect(preset.instances.total).toBe(approved.instanceTotal);
      expect(Object.keys(preset.instances.countsByKind)).toEqual(preset.instances.supportedKinds);
      expect(Object.values(preset.instances.countsByKind).reduce((sum, count) => sum + count, 0)).toBe(
        preset.instances.total,
      );

      expect(preset.lodSelection).toMatchObject({
        contract: "procplants.runtime-lod-selection",
        version: 1,
      });
      expect(preset.lodSelection.tiers.map(({ id }) => id)).toEqual(approvedTierIds);
      expect(preset.lodSelection.tiers.map(({ level }) => level)).toEqual([0, 1, 2, 3]);
      expect(preset.lodSelection.tiers.map(({ minDistance }) => minDistance)).toEqual(
        preset.lods.map(({ distance }) => distance),
      );

      expect(preset.lods.map(({ level }) => level)).toEqual([0, 1, 2, 3]);
      expect(preset.lods.map(({ label }) => label)).toEqual([
        "full",
        "clustered",
        "billboard-cross",
        "impostor",
      ]);
      expect(preset.lods.map(({ triangles }) => triangles)).toEqual(approved.triangles);
      expect(preset.lods.map(({ geometryHash }) => geometryHash)).toEqual(approved.geometryHashes);

      for (let lodIndex = 0; lodIndex < preset.lods.length; lodIndex += 1) {
        const lod = preset.lods[lodIndex]!;
        const surface = lod.surfacePartition;
        expect(lod.attributeLengths).toMatchObject({
          pos: lod.vertices * 3,
          nrm: lod.vertices * 3,
          uv0: lod.vertices * 2,
          col: lod.vertices * 3,
          tintable: lod.vertices,
          sway: lod.vertices,
          idx: lod.triangles * 3,
        });
        expect(surface).toMatchObject({
          contract: "procplants.surface-partition",
          version: 1,
          triangleCount: lod.triangles,
          indexCount: lod.attributeLengths.idx,
          coverage: {
            indices: lod.attributeLengths.idx,
            triangles: lod.triangles,
            complete: true,
          },
        });
        expect(surface.triangles.barkStem + surface.triangles.organ).toBe(lod.triangles);
        expect(surface.groups.total).toBe(
          Number(surface.groups.barkStem > 0) + Number(surface.groups.organ > 0),
        );

        expect(Number.isInteger(lod.triangles)).toBe(true);
        expect(lod.triangles).toBeGreaterThan(0);
        if (lodIndex === 0) continue;
        expect(lod.distance).toBeGreaterThan(preset.lods[lodIndex - 1]!.distance);
        expect(lod.triangles).toBeLessThan(preset.lods[lodIndex - 1]!.triangles);
      }
    });
  });
});
