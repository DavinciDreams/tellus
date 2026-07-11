import { describe, expect, it } from "vitest";
import {
  TELLUS_WORLD_MODULES,
  tellusWorldModuleById,
  tellusWorldModulesForScope,
  tellusWorldModulesWithCapability,
} from "./tellus-world-modules";

describe("Tellus world modules", () => {
  it("keeps module ids unique", () => {
    const ids = TELLUS_WORLD_MODULES.map((module) => module.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("routes interior object play to board/media modules", () => {
    const interiorModules = tellusWorldModulesForScope("interior").map((module) => module.id);
    expect(interiorModules).toContain("home-planner");
    expect(interiorModules).toContain("chess");
    expect(interiorModules).toContain("watch-party");
  });

  it("keeps user-created module assets on the asset-store path", () => {
    for (const module of TELLUS_WORLD_MODULES) {
      expect(module.assetPolicy.assetStoreRequired, module.id).toBe(true);
      expect(
        module.assetPolicy.generatedByUser ||
          module.assetPolicy.uploadedByUser ||
          module.assetPolicy.externalTilesAllowed,
        module.id,
      ).toBe(true);
    }
  });

  it("exposes agent-playable and shared-media capabilities separately", () => {
    expect(tellusWorldModulesWithCapability("agent-opponent").map((module) => module.id)).toEqual([
      "chess",
      "castle-defense",
    ]);
    expect(tellusWorldModulesWithCapability("shared-media").map((module) => module.id)).toEqual(["watch-party"]);
    expect(tellusWorldModuleById("sailing-regatta")?.agentPolicy?.roles).toContain("copilot");
  });

  it("treats historical terrain as a portal-capable geospatial module", () => {
    const historicalTerrain = tellusWorldModuleById("historical-terrain");
    expect(historicalTerrain?.scopes).toContain("world");
    expect(historicalTerrain?.scopes).toContain("portal");
    expect(historicalTerrain?.capabilities).toContain("geospatial-terrain");
    expect(historicalTerrain?.capabilities).toContain("reconstruction-layer");
    expect(historicalTerrain?.timelinePolicy?.allowsPresentDay).toBe(true);
    expect(historicalTerrain?.assetPolicy.externalTilesAllowed).toBe(true);
  });

  it("keeps time-travel site state behind a stronger module authority", () => {
    const timeTravel = tellusWorldModuleById("time-travel-site");
    expect(timeTravel?.stateAuthority).toBe("module-service");
    expect(timeTravel?.capabilities).toContain("timeline-state");
    expect(timeTravel?.timelinePolicy?.eras).toContain("ancient");
    expect(timeTravel?.agentPolicy?.roles).toContain("historian");
  });
});
