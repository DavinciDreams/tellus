import { readFile } from "node:fs/promises";
import path from "node:path";

import sharp from "sharp";
import { describe, expect, it } from "vitest";

import { evoflowTerrainSources } from "./tellus-evoflow-terrains";

const publicPath = (url: string): string => path.join(process.cwd(), "public", url.replace(/^\//, ""));

function correlation(a: Uint8Array, b: Uint8Array): number {
  const meanA = a.reduce((sum, value) => sum + value, 0) / a.length;
  const meanB = b.reduce((sum, value) => sum + value, 0) / b.length;
  let covariance = 0;
  let varianceA = 0;
  let varianceB = 0;
  for (let index = 0; index < a.length; index += 1) {
    const centeredA = a[index] - meanA;
    const centeredB = b[index] - meanB;
    covariance += centeredA * centeredB;
    varianceA += centeredA * centeredA;
    varianceB += centeredB * centeredB;
  }
  return covariance / Math.sqrt(varianceA * varianceB);
}

describe("Evoflow terrain sources", () => {
  it("keeps every template on a unique complete raster package", async () => {
    const sources = Object.values(evoflowTerrainSources);
    expect(new Set(sources.map((source) => source.worldId)).size).toBe(sources.length);
    expect(new Set(sources.map((source) => source.heightUrl)).size).toBe(sources.length);

    for (const source of sources) {
      const [height, semantic, preview] = await Promise.all([
        sharp(publicPath(source.heightUrl)).metadata(),
        sharp(publicPath(source.semanticUrl)).metadata(),
        sharp(publicPath(source.previewUrl)).metadata(),
      ]);
      expect([height.width, height.height]).toEqual([256, 256]);
      expect([semantic.width, semantic.height]).toEqual([256, 256]);
      expect([preview.width, preview.height]).toEqual([256, 256]);
    }
  });

  it("uses seven distinct curated topologies plus the canonical coral terrain", async () => {
    const generatedSources = Object.values(evoflowTerrainSources).filter(
      (source) => source.id !== "evoflow-coral-canyon",
    );
    const genomes = await Promise.all(generatedSources.map(async (source) => {
      const genomePath = path.join(path.dirname(path.dirname(publicPath(source.heightUrl))), "genome.json");
      return JSON.parse(await readFile(genomePath, "utf8")) as {
        modules: { terrain: { topology: string } };
      };
    }));

    expect(new Set(genomes.map((genome) => genome.modules.terrain.topology))).toEqual(new Set([
      "river-canyon",
      "alpine-spires",
      "sweeping-ridge",
      "breached-caldera",
      "stepped-mesas",
      "branching-badlands",
      "archipelago",
    ]));
  });

  it("keeps the curated silhouettes measurably different and their spawn centers walkable", async () => {
    const generatedSources = Object.values(evoflowTerrainSources).filter(
      (source) => source.id !== "evoflow-coral-canyon",
    );
    const rasters = await Promise.all(generatedSources.map(async (source) => {
      const { data, info } = await sharp(publicPath(source.heightUrl)).greyscale().raw().toBuffer({
        resolveWithObject: true,
      });
      const center = data[Math.floor(info.height / 2) * info.width + Math.floor(info.width / 2)];
      expect(center).toBeGreaterThanOrEqual(100);
      return { id: source.id, data: new Uint8Array(data) };
    }));

    for (let left = 0; left < rasters.length; left += 1) {
      for (let right = left + 1; right < rasters.length; right += 1) {
        expect(
          Math.abs(correlation(rasters[left].data, rasters[right].data)),
          `${rasters[left].id} and ${rasters[right].id} are too visually similar`,
        ).toBeLessThan(0.75);
      }
    }
  });
});
