import type { AssetSurfaceContext } from "./tellus-asset-reuse";

export type TellusWorldModuleId =
  | "home-planner"
  | "garden-planner"
  | "chess"
  | "sailing-regatta"
  | "castle-defense"
  | "watch-party";

export type TellusWorldModuleScope = "world" | "interior" | "object" | "portal";

export type TellusWorldModuleCapability =
  | "asset-placement"
  | "agent-opponent"
  | "agent-copilot"
  | "editable-plan"
  | "shared-rules"
  | "shared-media"
  | "vehicle-control"
  | "terrain-editing"
  | "scoring"
  | "timed-session"
  | "portal-target";

export type TellusWorldModuleStateAuthority = "client-local" | "world-state" | "module-service";

export type TellusWorldModuleAssetCategory =
  | AssetSurfaceContext
  | "building"
  | "game-piece"
  | "vehicle"
  | "media"
  | "tool";

export interface TellusWorldModuleAssetPolicy {
  preferredCategories: readonly TellusWorldModuleAssetCategory[];
  generatedByUser?: boolean;
  uploadedByUser?: boolean;
  assetStoreRequired?: boolean;
}

export interface TellusWorldModuleAgentPolicy {
  roles: readonly string[];
  canPlay?: boolean;
  canCoCreate?: boolean;
  canReferee?: boolean;
}

export interface TellusWorldModuleMediaPolicy {
  synchronized?: boolean;
  fullscreenMode?: "host-only" | "participant" | "shared-surface";
  proximityPresence?: boolean;
}

export interface TellusWorldModuleDescriptor {
  id: TellusWorldModuleId;
  label: string;
  summary: string;
  scopes: readonly TellusWorldModuleScope[];
  capabilities: readonly TellusWorldModuleCapability[];
  stateAuthority: TellusWorldModuleStateAuthority;
  assetPolicy: TellusWorldModuleAssetPolicy;
  agentPolicy?: TellusWorldModuleAgentPolicy;
  mediaPolicy?: TellusWorldModuleMediaPolicy;
}

export const TELLUS_WORLD_MODULES: readonly TellusWorldModuleDescriptor[] = [
  {
    id: "home-planner",
    label: "Home Planner",
    summary: "Design a custom house shell, decorate it with asset-store furniture, and export it into a Tellus world.",
    scopes: ["world", "interior", "portal"],
    capabilities: ["asset-placement", "editable-plan", "portal-target"],
    stateAuthority: "world-state",
    assetPolicy: {
      preferredCategories: ["building", "interior", "furniture", "environment"],
      generatedByUser: true,
      uploadedByUser: true,
      assetStoreRequired: true,
    },
    agentPolicy: {
      roles: ["designer", "decorator"],
      canCoCreate: true,
    },
  },
  {
    id: "garden-planner",
    label: "Garden Planner",
    summary: "Lay out paths, beds, terrain edits, plants, water features, and outdoor decor around a home or world patch.",
    scopes: ["world", "object"],
    capabilities: ["asset-placement", "editable-plan", "terrain-editing"],
    stateAuthority: "world-state",
    assetPolicy: {
      preferredCategories: ["flora", "exterior", "environment", "tool"],
      generatedByUser: true,
      uploadedByUser: true,
      assetStoreRequired: true,
    },
    agentPolicy: {
      roles: ["gardener", "landscape-designer"],
      canCoCreate: true,
    },
  },
  {
    id: "chess",
    label: "Chess",
    summary: "Attach a rule-governed chess session to a placed board, with humans and agents taking turns.",
    scopes: ["interior", "object"],
    capabilities: ["asset-placement", "agent-opponent", "shared-rules", "scoring"],
    stateAuthority: "module-service",
    assetPolicy: {
      preferredCategories: ["game-piece", "furniture", "surface"],
      generatedByUser: true,
      uploadedByUser: true,
      assetStoreRequired: true,
    },
    agentPolicy: {
      roles: ["opponent", "coach", "referee"],
      canPlay: true,
      canReferee: true,
    },
  },
  {
    id: "sailing-regatta",
    label: "Sailing Regatta",
    summary: "Turn boats and buoys into a race course with vehicle controls, timers, scoring, and agent copilots.",
    scopes: ["world", "object"],
    capabilities: ["asset-placement", "agent-copilot", "vehicle-control", "scoring", "timed-session"],
    stateAuthority: "world-state",
    assetPolicy: {
      preferredCategories: ["vehicle", "exterior", "environment"],
      generatedByUser: true,
      uploadedByUser: true,
      assetStoreRequired: true,
    },
    agentPolicy: {
      roles: ["copilot", "racer", "race-official"],
      canPlay: true,
      canReferee: true,
    },
  },
  {
    id: "castle-defense",
    label: "Castle Defense",
    summary: "Use placed castles, walls, units, and terrain as a defend-the-base scenario with waves and scoring.",
    scopes: ["world"],
    capabilities: ["asset-placement", "agent-opponent", "shared-rules", "scoring", "timed-session"],
    stateAuthority: "module-service",
    assetPolicy: {
      preferredCategories: ["building", "game-piece", "vehicle", "environment"],
      generatedByUser: true,
      uploadedByUser: true,
      assetStoreRequired: true,
    },
    agentPolicy: {
      roles: ["commander", "opponent", "referee"],
      canPlay: true,
      canReferee: true,
    },
  },
  {
    id: "watch-party",
    label: "Watch Party",
    summary: "Host a synchronized movie or stream on an in-world screen while participants keep spatial presence.",
    scopes: ["interior", "object"],
    capabilities: ["asset-placement", "shared-media"],
    stateAuthority: "module-service",
    assetPolicy: {
      preferredCategories: ["media", "furniture", "interior", "surface"],
      generatedByUser: true,
      uploadedByUser: true,
      assetStoreRequired: true,
    },
    mediaPolicy: {
      synchronized: true,
      fullscreenMode: "participant",
      proximityPresence: true,
    },
    agentPolicy: {
      roles: ["host", "companion"],
      canCoCreate: false,
    },
  },
] as const;

export const tellusWorldModuleById = (id: string): TellusWorldModuleDescriptor | undefined =>
  TELLUS_WORLD_MODULES.find((module) => module.id === id);

export const tellusWorldModulesForScope = (scope: TellusWorldModuleScope): TellusWorldModuleDescriptor[] =>
  TELLUS_WORLD_MODULES.filter((module) => module.scopes.includes(scope));

export const tellusWorldModulesWithCapability = (
  capability: TellusWorldModuleCapability,
): TellusWorldModuleDescriptor[] =>
  TELLUS_WORLD_MODULES.filter((module) => module.capabilities.includes(capability));
