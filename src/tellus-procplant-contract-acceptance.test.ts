import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import {
  PROCPLANT_GENERATOR_CONTRACT_REVISION,
  PROCPLANT_SUPPORTED_INSTANCE_KINDS,
  buildProcPlantInstancePrototype,
  buildProcPlantInstancedParts,
  compileProcPlantLods,
  defaultPlantEnvironment,
  partitionProcPlantTemplateSurfaces,
  procPlantPresets,
  type ProcPlantTemplate,
} from "procplants/core";
import { describe, expect, it } from "vitest";
import { createProcPlantInstanceGeometry } from "./tellus-procplants";

interface GoldenLod {
  level: number;
  label: string;
  distance: number;
  triangles: number;
  vertices: number;
  bounds: { min: [number, number, number]; max: [number, number, number] };
  sway: { min: number; max: number };
  attributeLengths: Record<"pos" | "nrm" | "uv0" | "col" | "tintable" | "sway" | "idx", number>;
  surfacePartition: {
    contract: string;
    version: number;
    contentHash: string;
    sourceIndexHash: string;
    triangleCount: number;
    indexCount: number;
    groups: { total: number; barkStem: number; organ: number };
    triangles: { barkStem: number; organ: number };
    coverage: { indices: number; triangles: number; complete: boolean };
  };
  geometryHash: string;
}

interface GoldenPreset {
  presetId: keyof typeof procPlantPresets;
  instances: { total: number; supportedKinds: string[]; countsByKind: Record<string, number> };
  lods: GoldenLod[];
}

interface GoldenContractFixture {
  schema: string;
  fixtureVersion: number;
  generatorContractRevision: number;
  seed: number;
  presets: GoldenPreset[];
  hash: string;
}

const coreUrl = new URL(import.meta.resolve("procplants/core"));
const packageRootUrl = new URL("../", coreUrl);
const fixtureUrl = new URL("fixtures/tellus-procplant-contract-v3.golden.json", packageRootUrl);
const fixture = JSON.parse(readFileSync(fixtureUrl, "utf8")) as GoldenContractFixture;

const finiteNumber = (value: number) => {
  const rounded = Number(value.toFixed(6));
  return Object.is(rounded, -0) ? 0 : rounded;
};

const hashTemplate = (template: ProcPlantTemplate) => {
  const hash = createHash("sha256");
  const updateFloatArray = (label: string, values: Float32Array) => {
    hash.update(`${label}:${values.length}:`);
    for (const value of values) hash.update(`${finiteNumber(value).toFixed(6)},`);
  };
  const updateIntegerArray = (label: string, values: Uint8Array | Uint32Array) => {
    hash.update(`${label}:${values.length}:`);
    for (const value of values) hash.update(`${value},`);
  };
  updateFloatArray("pos", template.pos);
  updateFloatArray("nrm", template.nrm);
  updateFloatArray("uv0", template.uv0);
  updateFloatArray("col", template.col);
  updateIntegerArray("tintable", template.tintable);
  updateFloatArray("sway", template.sway);
  updateIntegerArray("idx", template.idx);
  return hash.digest("hex");
};

const attributeLengths = (template: ProcPlantTemplate) => ({
  pos: template.pos.length,
  nrm: template.nrm.length,
  uv0: template.uv0.length,
  col: template.col.length,
  tintable: template.tintable.length,
  sway: template.sway.length,
  idx: template.idx.length,
});

const positionBounds = (positions: Float32Array) => {
  const min = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
  const max = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
  for (let offset = 0; offset < positions.length; offset += 3) {
    for (let axis = 0; axis < 3; axis += 1) {
      min[axis] = Math.min(min[axis]!, positions[offset + axis]!);
      max[axis] = Math.max(max[axis]!, positions[offset + axis]!);
    }
  }
  return {
    min: min.map(finiteNumber) as [number, number, number],
    max: max.map(finiteNumber) as [number, number, number],
  };
};

const range = (values: Float32Array) => {
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const value of values) {
    min = Math.min(min, value);
    max = Math.max(max, value);
  }
  return { min: finiteNumber(min), max: finiteNumber(max) };
};

describe("installed Procplants producer contract acceptance", () => {
  it("loads the exact installed core entry and its reviewed fixture v3", () => {
    expect(coreUrl.pathname).toContain("/node_modules/procplants/dist-lib/core.js");
    expect(fixture).toMatchObject({
      schema: "procplants-tellus-golden-contract",
      fixtureVersion: 3,
      generatorContractRevision: 3,
      hash: "a0e06f99d48e08713d8867260f30de9ee339d3d1f13cc2d97c18d30b90cb6585",
    });
    expect(PROCPLANT_GENERATOR_CONTRACT_REVISION).toBe(fixture.generatorContractRevision);
  });

  it("matches installed runtime geometry, instances, UV0, and surfaces to fixture v3", () => {
    const environment = defaultPlantEnvironment();

    for (const expected of fixture.presets) {
      const genome = procPlantPresets[expected.presetId];
      expect(genome, `missing preset ${expected.presetId}`).toBeDefined();

      const parts = buildProcPlantInstancedParts(genome, fixture.seed, environment);
      const counts = Object.fromEntries(
        [...new Set(parts.instances.map(({ kind }) => kind))]
          .sort()
          .map((kind) => [kind, parts.instances.filter((instance) => instance.kind === kind).length]),
      );
      expect(parts.instances).toHaveLength(expected.instances.total);
      expect(Object.keys(counts)).toEqual(expected.instances.supportedKinds);
      expect(counts).toEqual(expected.instances.countsByKind);

      const lods = compileProcPlantLods(genome, fixture.seed, environment);
      expect(lods).toHaveLength(expected.lods.length);
      lods.forEach((lod, index) => {
        const golden = expected.lods[index]!;
        const partition = partitionProcPlantTemplateSurfaces(lod.template);
        const coveredIndices = Array.from(partition.rangeIndexCounts).reduce((sum, count) => sum + count, 0);
        const barkStemGroups = Array.from(partition.rangeSurfaceIds).filter((surface) => surface === 0).length;
        const organGroups = Array.from(partition.rangeSurfaceIds).filter((surface) => surface === 1).length;

        expect({
          level: lod.level,
          label: lod.label,
          distance: finiteNumber(lod.distance),
          triangles: lod.template.idx.length / 3,
          vertices: lod.template.pos.length / 3,
          bounds: positionBounds(lod.template.pos),
          sway: range(lod.template.sway),
          attributeLengths: attributeLengths(lod.template),
          surfacePartition: {
            contract: partition.contract,
            version: partition.version,
            contentHash: partition.contentHash,
            sourceIndexHash: partition.sourceIndexHash,
            triangleCount: partition.triangleCount,
            indexCount: partition.indexCount,
            groups: { total: partition.rangeCount, barkStem: barkStemGroups, organ: organGroups },
            triangles: { barkStem: partition.barkStemTriangles, organ: partition.organTriangles },
            coverage: {
              indices: coveredIndices,
              triangles: partition.barkStemTriangles + partition.organTriangles,
              complete:
                coveredIndices === partition.indexCount &&
                partition.barkStemTriangles + partition.organTriangles === partition.triangleCount,
            },
          },
          geometryHash: hashTemplate(lod.template),
        }).toEqual(golden);
      });
    }
  });

  it("keeps every v3 instance prototype deterministic with complete UV0", () => {
    const genome = procPlantPresets.phiFern;
    for (const kind of PROCPLANT_SUPPORTED_INSTANCE_KINDS) {
      const first = buildProcPlantInstancePrototype(kind, genome);
      const second = buildProcPlantInstancePrototype(kind, genome);
      expect(first.uv0).toHaveLength((first.pos.length / 3) * 2);
      expect(first.idx.length).toBeGreaterThan(0);
      expect(hashTemplate(first)).toBe(hashTemplate(second));
    }
  });

  it("dispatches every v3 instance kind through the Tellus Three.js adapter", () => {
    const genome = procPlantPresets.phiFern;
    for (const kind of PROCPLANT_SUPPORTED_INSTANCE_KINDS) {
      const geometry = createProcPlantInstanceGeometry(kind, genome);
      const position = geometry.getAttribute("position");
      const uv = geometry.getAttribute("uv");
      expect(position.count).toBeGreaterThan(0);
      expect(uv.count).toBe(position.count);
      expect(geometry.getIndex()?.count).toBeGreaterThan(0);
      geometry.dispose();
    }
  });
});
