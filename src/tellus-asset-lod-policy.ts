import type { GeneratedKind, WorldTemplateId } from "./tellus-types";

export type AssetRenderLodLevel = 0 | 1 | 2;

export interface AssetRenderLodInput {
  kind: GeneratedKind;
  prompt: string;
  distance: number;
  worldTemplate?: WorldTemplateId;
  isChunkedWorld?: boolean;
  selected?: boolean;
  viewerFacing?: number;
}

const LANDMARK_TERMS = [
  "building",
  "cabin",
  "castle",
  "cathedral",
  "church",
  "cottage",
  "fortress",
  "gazebo",
  "hall",
  "house",
  "inn",
  "landmark",
  "manor",
  "pavilion",
  "shrine",
  "store",
  "tower",
];

export function isLandmarkAssetForLod(kind: GeneratedKind, prompt: string): boolean {
  if (kind === "shrine") return true;
  const lower = prompt.toLowerCase();
  return LANDMARK_TERMS.some((term) => lower.includes(term));
}

export function assetRenderLodLevel(input: AssetRenderLodInput): AssetRenderLodLevel {
  if (input.selected) return 0;
  const distance = Math.max(0, input.distance);
  const facing = Math.max(-1, Math.min(1, input.viewerFacing ?? 1));
  const landmark = isLandmarkAssetForLod(input.kind, input.prompt);

  if (landmark) {
    const lod1 = input.worldTemplate === "tellus" ? 260 : input.isChunkedWorld ? 190 : 150;
    const lod2 = input.worldTemplate === "tellus" ? 520 : input.isChunkedWorld ? 420 : 320;
    const facingBonus = facing > -0.15 ? 1.35 : 0.75;
    if (distance < lod1 * facingBonus) return 0;
    if (distance < lod2 * facingBonus) return 1;
    return 2;
  }

  const lod1 = input.isChunkedWorld ? 90 : 70;
  const lod2 = input.isChunkedWorld ? 210 : 160;
  const facingBonus = facing > -0.15 ? 1.2 : 0.65;
  if (distance < lod1 * facingBonus) return 0;
  if (distance < lod2 * facingBonus) return 1;
  return 2;
}
