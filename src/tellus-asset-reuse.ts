import type { AssetLibraryModel, GeneratedKind } from "./tellus-types";

export type AssetReuseCandidate = AssetLibraryModel & {
  reuseScore?: number;
  reuseReason?: string;
};

export type AssetSurfaceContext =
  | "person"
  | "fauna"
  | "flora"
  | "interior"
  | "exterior"
  | "surface"
  | "furniture"
  | "environment";

export const ASSET_SURFACE_CONTEXTS: readonly AssetSurfaceContext[] = [
  "person",
  "fauna",
  "flora",
  "interior",
  "exterior",
  "surface",
  "furniture",
  "environment",
];

const ASSET_REUSE_STOPWORDS = new Set([
  "a",
  "an",
  "and",
  "the",
  "with",
  "for",
  "from",
  "into",
  "make",
  "create",
  "generate",
  "little",
  "small",
  "large",
  "big",
  "nice",
  "cool",
  "some",
  "very",
]);

export const assetReuseTerms = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .map((term) => term.trim())
    .filter((term) => term.length > 2 && !ASSET_REUSE_STOPWORDS.has(term));

const assetSurfaceContextTerms: Record<AssetSurfaceContext, readonly string[]> = {
  person: ["person", "people", "avatar", "human", "character", "vrm", "auton"],
  fauna: ["fauna", "animal", "creature", "pet", "bird", "fox", "wolf", "horse", "deer"],
  flora: ["flora", "plant", "flower", "tree", "botany", "garden", "grass", "moss"],
  interior: ["interior", "inside", "indoor", "room", "library", "house", "wall", "floor"],
  exterior: ["exterior", "outside", "outdoor", "garden", "park", "bridge", "bench", "path"],
  surface: ["surface", "shelf", "table", "counter", "floor", "platform", "pedestal"],
  furniture: ["furniture", "chair", "bench", "table", "shelf", "cabinet", "sofa", "desk"],
  environment: ["environment", "building", "bridge", "path", "rock", "lantern", "decor"],
};

export const inferAssetSurfaceContexts = (text: string): AssetSurfaceContext[] => {
  const terms = new Set(assetReuseTerms(text));
  const contexts: AssetSurfaceContext[] = [];
  for (const [context, matches] of Object.entries(assetSurfaceContextTerms) as Array<
    [AssetSurfaceContext, readonly string[]]
  >) {
    if (matches.some((term) => terms.has(term))) contexts.push(context);
  }
  return contexts;
};

const assetSurfaceContextText = (model: AssetLibraryModel): string =>
  [
    model.name,
    model.description ?? "",
    model.file_format ?? "",
    ...(model.tags ?? []),
  ].join(" ");

export const scoreReusableAsset = (
  prompt: string,
  model: AssetLibraryModel,
  kind?: GeneratedKind,
  preferredContexts: readonly AssetSurfaceContext[] = [],
): AssetReuseCandidate | null => {
  const promptTerms = new Set(assetReuseTerms(prompt));
  if (promptTerms.size === 0) return null;
  const modelText = assetSurfaceContextText(model);
  const modelTerms = new Set(assetReuseTerms(modelText));
  let overlap = 0;
  for (const term of promptTerms) {
    if (modelTerms.has(term)) overlap++;
  }
  const kindBoost =
    kind &&
    (model.name.toLowerCase().includes(kind) ||
      model.tags?.some((tag) => tag.toLowerCase().includes(kind)))
      ? 0.25
      : 0;
  const promptContexts = inferAssetSurfaceContexts(prompt);
  const modelContexts = inferAssetSurfaceContexts(modelText);
  const allPreferredContexts = new Set([...promptContexts, ...preferredContexts]);
  const contextMatches = modelContexts.filter((context) => allPreferredContexts.has(context));
  const contextBoost = contextMatches.length > 0 ? Math.min(0.35, contextMatches.length * 0.16) : 0;
  const score = overlap / Math.max(2, promptTerms.size) + kindBoost + contextBoost;
  if (score < 0.34) return null;
  return {
    ...model,
    reuseScore: score,
    reuseReason:
      contextMatches.length > 0
        ? contextMatches.join(", ")
        : overlap > 0
          ? `${overlap} matching term${overlap === 1 ? "" : "s"}`
          : "kind match",
  };
};

export const rankReusableAssets = (
  prompt: string,
  models: readonly AssetLibraryModel[],
  kind?: GeneratedKind,
  limit = 5,
  preferredContexts: readonly AssetSurfaceContext[] = [],
): AssetReuseCandidate[] => {
  const seen = new Set<string>();
  return models
    .map((model) => scoreReusableAsset(prompt, model, kind, preferredContexts))
    .filter((model): model is AssetReuseCandidate => model !== null)
    .filter((model) => {
      const key = model.modelUrl ?? model.id;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => (b.reuseScore ?? 0) - (a.reuseScore ?? 0))
    .slice(0, limit);
};
