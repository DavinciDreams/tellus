import * as THREE from "three";
import { mulberry32 } from "./tellus-veg-archetypes";

export type ProceduralBuildingType =
  | "simple-house"
  | "long-house"
  | "inn"
  | "bank"
  | "store"
  | "smithy"
  | "mansion"
  | "manor"
  | "keep"
  | "fortress"
  | "castle"
  | "church"
  | "cathedral"
  | "chapel"
  | "guild-hall"
  | "town-hall";

export type BuildingMaterialStyle =
  | "auto"
  | "brick"
  | "stone-ashlar"
  | "stone-rubble"
  | "wood-plank"
  | "timber-frame"
  | "plaster"
  | "stucco"
  | "adobe"
  | "log-siding"
  | "cedar-shingle"
  | "weathered-shingle"
  | "blue-shingle"
  | "sage-shingle";

export type BuildingLightingStyle = "none" | "warm" | "lantern" | "moonlit" | "bright";

type FootprintStyle =
  | "default"
  | "foyer"
  | "courtyard"
  | "gallery"
  | "cruciform"
  | "towered"
  | "apse"
  | "winged";

type Range = readonly [number, number];

export interface TellusBuildingRecipe {
  id: ProceduralBuildingType;
  label: string;
  emoji: string;
  widthRange: Range;
  depthRange: Range;
  floorsRange: Range;
  footprintStyle: FootprintStyle;
  defaultMaterial: Exclude<BuildingMaterialStyle, "auto">;
  windowChance: number;
  entranceArchChance: number;
  foundationStepsRange: Range;
}

export interface ProceduralBuildingOptions {
  material?: BuildingMaterialStyle;
  lighting?: BuildingLightingStyle;
  roof?: boolean;
}

export interface ProceduralBuildingDimensions {
  width: number;
  depth: number;
  floors: number;
  floorHeight: number;
  bodyHeight: number;
}

export const PROCEDURAL_BUILDING_PREFIX = "building-";
const SHARED_STONE_ALBEDO_URL = "/terrain-textures/shared-fieldstone-rubble/albedo.png";
const SIMPLE_HOUSE_STONE_SKIRT_HEIGHT = 0.95;
const MEDIEVAL_STUCCO_COLOR = 0xd3c19a;
const MEDIEVAL_TIMBER_COLOR = 0x4f3324;
const SLATE_ROOF_COLOR = 0x66717a;
const ADOBE_WALL_COLOR = 0xb88755;
const ADOBE_ROOF_COLOR = 0xa34c2f;
const ADOBE_STONE_BASE_COLOR = 0xc2a772;
const LOG_WALL_COLOR = 0x7b5637;
const LOG_DETAIL_COLOR = 0x4f3324;
const LOG_ROOF_COLOR = 0x6b4a2f;
const LOG_STONE_BASE_COLOR = 0x81817a;
const PLANK_WALL_COLOR = 0x8c6844;
const PLANK_DETAIL_COLOR = 0x5a3925;
const PLANK_HIGHLIGHT_COLOR = 0xa67b55;
const PLANK_CHINK_COLOR = 0xc7ad79;
const CEDAR_SHINGLE_COLOR = 0x8b6040;
const CEDAR_SHINGLE_DARK_COLOR = 0x5a3827;
const CEDAR_TRIM_COLOR = 0xf2efe4;
const CEDAR_STONE_BASE_COLOR = 0xa7aaa4;
const WEATHERED_SHINGLE_COLOR = 0x8e8a7d;
const WEATHERED_SHINGLE_DARK_COLOR = 0x5d5b54;
const BLUE_SHINGLE_COLOR = 0x6f8791;
const BLUE_SHINGLE_DARK_COLOR = 0x465c65;
const SAGE_SHINGLE_COLOR = 0x7f8a73;
const SAGE_SHINGLE_DARK_COLOR = 0x4f5b48;
const buildingTextureCache = new Map<string, THREE.Texture>();

export const BUILDING_MATERIAL_OPTIONS: Array<{ id: BuildingMaterialStyle; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "brick", label: "Brick" },
  { id: "stone-ashlar", label: "Ashlar" },
  { id: "stone-rubble", label: "Rubble" },
  { id: "wood-plank", label: "Plank" },
  { id: "timber-frame", label: "Timber" },
  { id: "plaster", label: "Plaster" },
  { id: "stucco", label: "Stucco" },
  { id: "adobe", label: "Adobe" },
  { id: "log-siding", label: "Log" },
  { id: "cedar-shingle", label: "Cedar" },
  { id: "weathered-shingle", label: "Weathered" },
  { id: "blue-shingle", label: "Blue Shingle" },
  { id: "sage-shingle", label: "Sage Shingle" },
];

export const BUILDING_LIGHTING_OPTIONS: Array<{ id: BuildingLightingStyle; label: string }> = [
  { id: "warm", label: "Warm" },
  { id: "lantern", label: "Lantern" },
  { id: "bright", label: "Bright" },
  { id: "moonlit", label: "Moonlit" },
  { id: "none", label: "None" },
];

export const PROCEDURAL_BUILDING_CATALOG: TellusBuildingRecipe[] = [
  recipe("simple-house", "Simple House", "🏠", [5, 7], [5, 7], [1, 2], "default", "timber-frame", 0.75, 0.45, [0, 1]),
  recipe("long-house", "Long House", "🏘️", [8, 12], [4, 6], [1, 2], "gallery", "wood-plank", 0.5, 0.15, [0, 1]),
  recipe("inn", "Inn", "🍺", [8, 11], [7, 10], [2, 3], "foyer", "brick", 0.65, 0.35, [1, 2]),
  recipe("bank", "Bank", "🏛️", [7, 10], [6, 9], [2, 3], "foyer", "stone-ashlar", 0.45, 0.6, [2, 3]),
  recipe("store", "Store", "🏪", [6, 9], [5, 8], [1, 2], "default", "timber-frame", 0.7, 0.25, [0, 1]),
  recipe("smithy", "Smithy", "⚒️", [6, 9], [6, 9], [1, 1], "winged", "stone-rubble", 0.35, 0.15, [0, 1]),
  recipe("mansion", "Mansion", "🏡", [11, 15], [9, 13], [2, 3], "winged", "plaster", 0.68, 0.45, [2, 3]),
  recipe("manor", "Manor", "🏰", [10, 14], [10, 14], [2, 3], "courtyard", "stone-ashlar", 0.55, 0.45, [2, 3]),
  recipe("keep", "Keep", "🛡️", [8, 11], [8, 11], [3, 4], "towered", "stone-rubble", 0.28, 0.55, [2, 4]),
  recipe("fortress", "Fortress", "🏯", [12, 17], [12, 17], [2, 3], "courtyard", "stone-rubble", 0.25, 0.6, [2, 4]),
  recipe("castle", "Castle", "🏰", [15, 21], [13, 19], [3, 4], "towered", "stone-ashlar", 0.35, 0.7, [3, 5]),
  recipe("church", "Church", "⛪", [7, 10], [12, 17], [2, 3], "cruciform", "stone-ashlar", 0.6, 0.75, [1, 2]),
  recipe("cathedral", "Cathedral", "⛪", [10, 14], [18, 25], [3, 5], "cruciform", "stone-ashlar", 0.72, 0.85, [2, 4]),
  recipe("chapel", "Chapel", "🕯️", [5, 8], [8, 12], [1, 2], "apse", "stucco", 0.5, 0.55, [1, 2]),
  recipe("guild-hall", "Guild Hall", "⚜️", [10, 14], [8, 12], [2, 3], "gallery", "timber-frame", 0.65, 0.4, [1, 3]),
  recipe("town-hall", "Town Hall", "🏛️", [11, 16], [9, 13], [2, 3], "foyer", "stone-ashlar", 0.62, 0.55, [2, 4]),
];

export const proceduralBuildingRecipe = (id: string): TellusBuildingRecipe | undefined =>
  PROCEDURAL_BUILDING_CATALOG.find((item) => item.id === id);

export const proceduralBuildingArchetype = (archetypeId: string): TellusBuildingRecipe | undefined => {
  if (!archetypeId.startsWith(PROCEDURAL_BUILDING_PREFIX)) return undefined;
  return proceduralBuildingRecipe(archetypeId.slice(PROCEDURAL_BUILDING_PREFIX.length));
};

export const makeProceduralBuildingArchetypeId = (recipeId: ProceduralBuildingType): string =>
  `${PROCEDURAL_BUILDING_PREFIX}${recipeId}`;

export const normalizeBuildingMaterial = (
  value: string | null | undefined,
): BuildingMaterialStyle | undefined =>
  BUILDING_MATERIAL_OPTIONS.some((option) => option.id === value)
    ? (value as BuildingMaterialStyle)
    : undefined;

export const normalizeBuildingLighting = (
  value: string | null | undefined,
): BuildingLightingStyle | undefined =>
  BUILDING_LIGHTING_OPTIONS.some((option) => option.id === value)
    ? (value as BuildingLightingStyle)
    : undefined;

export const proceduralBuildingDimensions = (
  recipeId: ProceduralBuildingType,
  seed: number,
): ProceduralBuildingDimensions | null => {
  const recipe = proceduralBuildingRecipe(recipeId);
  if (!recipe) return null;
  const rng = mulberry32(seed);
  const width = pickRange(recipe.widthRange, rng);
  const depth = pickRange(recipe.depthRange, rng);
  const floors = Math.max(1, Math.round(pickRange(recipe.floorsRange, rng)));
  const floorHeight = 2.65;
  return {
    width,
    depth,
    floors,
    floorHeight,
    bodyHeight: floors * floorHeight,
  };
};

export const buildProceduralBuildingModel = (
  recipeId: ProceduralBuildingType,
  seed: number,
  options: ProceduralBuildingOptions = {},
): THREE.Group | null => {
  const recipe = proceduralBuildingRecipe(recipeId);
  if (!recipe) return null;
  const dims = proceduralBuildingDimensions(recipeId, seed);
  if (!dims) return null;
  const rng = mulberry32(seed);
  rng();
  rng();
  rng();
  const { width, depth, floors, floorHeight } = dims;
  const height = dims.bodyHeight;
  const materialStyle = options.material && options.material !== "auto" ? options.material : recipe.defaultMaterial;
  const palette = materialPalette(materialStyle);
  const mats = createMaterials(palette, materialStyle, recipe.id);
  const group = new THREE.Group();
  group.name = `tellus-proc-building-${recipe.id}`;
  group.userData.proceduralBuilding = { recipeId, seed, material: materialStyle, lighting: options.lighting ?? "warm" };

  addFoundation(group, width, depth, recipe, mats);
  if (recipe.id === "simple-house") {
    addSimpleHouseBody(group, width, depth, height, mats);
  } else if (floors >= 3 && !rockOnlyBuilding(recipe.id)) {
    addStoneFirstFloorBody(group, width, depth, height, floorHeight, mats);
  } else {
    addBuildingBlock(group, 0, width, depth, height, mats.wall);
  }
  addWallRelief(group, width, depth, height, recipe, mats, materialStyle);
  addDoor(group, width, depth, recipe, mats);
  addWindows(group, width, depth, floors, recipe, mats, rng);
  addFootprintDetails(group, width, depth, height, recipe, mats, rng);
  if (options.roof !== false) addRoof(group, width, depth, height, recipe, mats, rng);
  if (shinglePalette(materialStyle) && !rockOnlyBuilding(recipe.id)) {
    addShinglePorch(group, width, depth, recipe, mats);
  }
  addLighting(group, width, depth, height, options.lighting ?? "warm");
  return group;
};

function recipe(
  id: ProceduralBuildingType,
  label: string,
  emoji: string,
  widthRange: Range,
  depthRange: Range,
  floorsRange: Range,
  footprintStyle: FootprintStyle,
  defaultMaterial: Exclude<BuildingMaterialStyle, "auto">,
  windowChance: number,
  entranceArchChance: number,
  foundationStepsRange: Range,
): TellusBuildingRecipe {
  return {
    id,
    label,
    emoji,
    widthRange,
    depthRange,
    floorsRange,
    footprintStyle,
    defaultMaterial,
    windowChance,
    entranceArchChance,
    foundationStepsRange,
  };
}

function pickRange(range: Range, rng: () => number): number {
  return range[0] + (range[1] - range[0]) * rng();
}

function rockOnlyBuilding(recipeId: ProceduralBuildingType | undefined): boolean {
  return recipeId === "keep" || recipeId === "castle" || recipeId === "fortress";
}

function shinglePalette(style: BuildingMaterialStyle): { base: number; dark: number } | null {
  if (style === "cedar-shingle") return { base: CEDAR_SHINGLE_COLOR, dark: CEDAR_SHINGLE_DARK_COLOR };
  if (style === "weathered-shingle") return { base: WEATHERED_SHINGLE_COLOR, dark: WEATHERED_SHINGLE_DARK_COLOR };
  if (style === "blue-shingle") return { base: BLUE_SHINGLE_COLOR, dark: BLUE_SHINGLE_DARK_COLOR };
  if (style === "sage-shingle") return { base: SAGE_SHINGLE_COLOR, dark: SAGE_SHINGLE_DARK_COLOR };
  return null;
}

function materialPalette(style: Exclude<BuildingMaterialStyle, "auto">) {
  const palettes: Record<Exclude<BuildingMaterialStyle, "auto">, { wall: number; accent: number; roof: number; trim: number; foundation: number }> = {
    brick: { wall: 0x9b4f38, accent: 0x6e3329, roof: 0x5d2e2a, trim: 0xf0d2a2, foundation: 0x6d6558 },
    "stone-ashlar": { wall: 0x9b9a8f, accent: 0x77786f, roof: 0x4d5661, trim: 0xe5dfc8, foundation: 0x696b66 },
    "stone-rubble": { wall: 0x797b69, accent: 0x54594e, roof: 0x39433d, trim: 0xd8d0ad, foundation: 0x55594e },
    "wood-plank": { wall: 0x8b623f, accent: 0x5b3925, roof: 0x3c2a24, trim: 0xe2c797, foundation: 0x5b5548 },
    "timber-frame": { wall: 0xd0b78b, accent: 0x4f3324, roof: 0x56312d, trim: 0xf2e1b3, foundation: 0x665e51 },
    plaster: { wall: 0xd9caa5, accent: 0x8d7758, roof: 0x6b3b36, trim: 0x4d3828, foundation: 0x777165 },
    stucco: { wall: 0xcfc2a0, accent: 0x8a806d, roof: 0x6b4a3a, trim: 0xf0e0bd, foundation: 0x747064 },
    adobe: { wall: ADOBE_WALL_COLOR, accent: MEDIEVAL_TIMBER_COLOR, roof: ADOBE_ROOF_COLOR, trim: MEDIEVAL_TIMBER_COLOR, foundation: ADOBE_STONE_BASE_COLOR },
    "log-siding": { wall: LOG_WALL_COLOR, accent: LOG_DETAIL_COLOR, roof: LOG_ROOF_COLOR, trim: LOG_DETAIL_COLOR, foundation: LOG_STONE_BASE_COLOR },
    "cedar-shingle": { wall: CEDAR_SHINGLE_COLOR, accent: CEDAR_TRIM_COLOR, roof: CEDAR_SHINGLE_COLOR, trim: CEDAR_TRIM_COLOR, foundation: CEDAR_STONE_BASE_COLOR },
    "weathered-shingle": { wall: WEATHERED_SHINGLE_COLOR, accent: CEDAR_TRIM_COLOR, roof: WEATHERED_SHINGLE_COLOR, trim: CEDAR_TRIM_COLOR, foundation: CEDAR_STONE_BASE_COLOR },
    "blue-shingle": { wall: BLUE_SHINGLE_COLOR, accent: CEDAR_TRIM_COLOR, roof: BLUE_SHINGLE_COLOR, trim: CEDAR_TRIM_COLOR, foundation: CEDAR_STONE_BASE_COLOR },
    "sage-shingle": { wall: SAGE_SHINGLE_COLOR, accent: CEDAR_TRIM_COLOR, roof: SAGE_SHINGLE_COLOR, trim: CEDAR_TRIM_COLOR, foundation: CEDAR_STONE_BASE_COLOR },
  };
  return palettes[style];
}

function canLoadBuildingTextures(): boolean {
  return typeof document !== "undefined" && typeof window !== "undefined";
}

function loadSharedBuildingTexture(url: string, repeat: readonly [number, number]): THREE.Texture | undefined {
  if (!canLoadBuildingTextures()) return undefined;
  const key = `${url}|${repeat[0]}x${repeat[1]}`;
  const cached = buildingTextureCache.get(key);
  if (cached) return cached;
  const texture = new THREE.TextureLoader().load(url);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeat[0], repeat[1]);
  texture.colorSpace = THREE.SRGBColorSpace;
  buildingTextureCache.set(key, texture);
  return texture;
}

function applySharedAlbedo(
  material: THREE.MeshStandardMaterial,
  url: string,
  repeat: readonly [number, number],
): THREE.MeshStandardMaterial {
  const texture = loadSharedBuildingTexture(url, repeat);
  if (!texture) return material;
  material.map = texture;
  material.roughness = 0.86;
  material.needsUpdate = true;
  return material;
}

function createMaterials(
  palette: ReturnType<typeof materialPalette>,
  materialStyle: Exclude<BuildingMaterialStyle, "auto">,
  recipeId?: ProceduralBuildingType,
) {
  const make = (color: number, roughness = 0.72, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
  const stone = materialStyle === "stone-ashlar" || materialStyle === "stone-rubble";
  const simpleHouse = recipeId === "simple-house";
  const rockOnly = rockOnlyBuilding(recipeId);
  const adobeStyle = materialStyle === "adobe" && !rockOnly;
  const logStyle = materialStyle === "log-siding" && !rockOnly;
  const plankStyle = materialStyle === "wood-plank" && !rockOnly;
  const shingle = !rockOnly ? shinglePalette(materialStyle) : null;
  const shingleStyle = Boolean(shingle);
  const medievalStyle = Boolean(recipeId) && !rockOnly;
  const wall = make(shingle ? shingle.base : plankStyle ? PLANK_WALL_COLOR : logStyle ? LOG_WALL_COLOR : adobeStyle ? ADOBE_WALL_COLOR : medievalStyle ? MEDIEVAL_STUCCO_COLOR : palette.wall);
  const timberDetail = medievalStyle || rockOnly;
  const accentColor = shingleStyle ? CEDAR_TRIM_COLOR : plankStyle ? PLANK_DETAIL_COLOR : logStyle ? LOG_DETAIL_COLOR : timberDetail ? MEDIEVAL_TIMBER_COLOR : palette.accent;
  const baseWallColor = simpleHouse
    ? new THREE.Color(adobeStyle ? ADOBE_STONE_BASE_COLOR : shingleStyle ? CEDAR_STONE_BASE_COLOR : logStyle || plankStyle ? LOG_STONE_BASE_COLOR : 0x8b8d86).lerp(new THREE.Color(0xffffff), adobeStyle || logStyle || plankStyle || shingleStyle ? 0.06 : 0.08)
    : adobeStyle
      ? new THREE.Color(ADOBE_STONE_BASE_COLOR).lerp(new THREE.Color(0xffffff), 0.05)
    : shingleStyle
      ? new THREE.Color(CEDAR_STONE_BASE_COLOR).lerp(new THREE.Color(0xffffff), 0.1)
    : logStyle || plankStyle
      ? new THREE.Color(LOG_STONE_BASE_COLOR).lerp(new THREE.Color(0xffffff), 0.06)
    : new THREE.Color(palette.foundation).lerp(new THREE.Color(0xffffff), 0.32);
  const baseWall = make(baseWallColor.getHex(), 0.84);
  const foundation = make(medievalStyle ? MEDIEVAL_TIMBER_COLOR : palette.foundation, 0.82);
  applySharedAlbedo(baseWall, SHARED_STONE_ALBEDO_URL, simpleHouse ? [1.65, 0.72] : [2.2, 1.6]);
  if (stone && !medievalStyle) {
    applySharedAlbedo(wall, SHARED_STONE_ALBEDO_URL, [2.2, 2.2]);
  }
  if (stone && rockOnly) {
    applySharedAlbedo(foundation, SHARED_STONE_ALBEDO_URL, [2.2, 2.2]);
  }
  const roofTint = new THREE.Color(shingle ? shingle.base : logStyle || plankStyle ? LOG_ROOF_COLOR : adobeStyle ? ADOBE_ROOF_COLOR : SLATE_ROOF_COLOR);
  const roof = make(roofTint.getHex(), 0.9);
  const roofDetailColor = roofTint.clone().lerp(new THREE.Color(shingle ? shingle.dark : logStyle || plankStyle ? 0x322016 : adobeStyle ? 0x5f2418 : 0x252b31), 0.55);
  return {
    wall,
    baseWall,
    accent: make(accentColor),
    roof,
    roofDetail: make(roofDetailColor.getHex(), 0.92),
    trim: make(shingleStyle ? CEDAR_TRIM_COLOR : timberDetail ? MEDIEVAL_TIMBER_COLOR : palette.trim, 0.58),
    foundation,
    logDetail: make(LOG_DETAIL_COLOR, 0.86),
    logHighlight: make(0x9b7250, 0.82),
    plankBoard: make(PLANK_DETAIL_COLOR, 0.84),
    plankHighlight: make(PLANK_HIGHLIGHT_COLOR, 0.8),
    plankChink: make(PLANK_CHINK_COLOR, 0.9),
    cedarShingle: make(shingle?.base ?? CEDAR_SHINGLE_COLOR, 0.84),
    cedarShingleDark: make(shingle?.dark ?? CEDAR_SHINGLE_DARK_COLOR, 0.9),
    glass: new THREE.MeshStandardMaterial({
      color: 0x9fc7d3,
      roughness: 0.18,
      metalness: 0.05,
      transparent: true,
      opacity: 0.68,
      side: THREE.DoubleSide,
    }),
    light: make(0xffdda2, 0.35),
  };
}

function addMesh(group: THREE.Group, mesh: THREE.Mesh, collide = true) {
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.userData.collide = collide;
  group.add(mesh);
}

function addBox(
  group: THREE.Group,
  size: [number, number, number],
  position: [number, number, number],
  material: THREE.Material,
  collide = true,
) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(...position);
  addMesh(group, mesh, collide);
  return mesh;
}

function addFoundation(
  group: THREE.Group,
  width: number,
  depth: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  const steps = Math.round((recipe.foundationStepsRange[0] + recipe.foundationStepsRange[1]) / 2);
  addBox(group, [width + 0.5, 0.28, depth + 0.5], [0, 0.14, 0], mats.foundation);
  for (let i = 0; i < steps; i++) {
    addBox(group, [1.9 + i * 0.35, 0.16, 0.65], [0, 0.08 + i * 0.15, depth / 2 + 0.35 + i * 0.24], mats.foundation);
  }
}

function addBuildingBlock(group: THREE.Group, yBase: number, width: number, depth: number, height: number, material: THREE.Material) {
  addBox(group, [width, height, depth], [0, yBase + 0.28 + height / 2, 0], material);
}

function addSimpleHouseBody(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const lowerHeight = Math.min(SIMPLE_HOUSE_STONE_SKIRT_HEIGHT, height * 0.36);
  addBox(group, [width, lowerHeight, depth], [0, 0.28 + lowerHeight / 2, 0], mats.baseWall);
  const upperHeight = Math.max(0, height - lowerHeight);
  if (upperHeight > 0.05) {
    addBox(group, [width, upperHeight, depth], [0, 0.28 + lowerHeight + upperHeight / 2, 0], mats.wall);
  }
}

function addStoneFirstFloorBody(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  floorHeight: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const lowerHeight = Math.min(floorHeight, height);
  addBox(group, [width, lowerHeight, depth], [0, 0.28 + lowerHeight / 2, 0], mats.baseWall);
  const upperHeight = Math.max(0, height - lowerHeight);
  if (upperHeight > 0.05) {
    addBox(group, [width, upperHeight, depth], [0, 0.28 + lowerHeight + upperHeight / 2, 0], mats.wall);
  }
}

function addWallRelief(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
  materialStyle: Exclude<BuildingMaterialStyle, "auto">,
) {
  const yMid = 0.28 + height / 2;
  const yTop = 0.28 + height;
  const yBand = Math.min(yTop - 0.55, 0.28 + 2.65);
  const postW = 0.18;
  const frontZ = depth / 2 + 0.07;
  const backZ = -depth / 2 - 0.07;
  const leftX = -width / 2 - 0.07;
  const rightX = width / 2 + 0.07;

  for (const x of [-width / 2 + 0.18, width / 2 - 0.18]) {
    addBox(group, [postW, height + 0.1, 0.16], [x, yMid, frontZ], mats.accent, false);
    addBox(group, [postW, height + 0.1, 0.16], [x, yMid, backZ], mats.accent, false);
  }
  for (const z of [-depth / 2 + 0.18, depth / 2 - 0.18]) {
    addBox(group, [0.16, height + 0.1, postW], [leftX, yMid, z], mats.accent, false);
    addBox(group, [0.16, height + 0.1, postW], [rightX, yMid, z], mats.accent, false);
  }

  addBox(group, [width + 0.18, 0.16, 0.16], [0, yTop - 0.18, frontZ], mats.trim, false);
  addBox(group, [width + 0.18, 0.16, 0.16], [0, yTop - 0.18, backZ], mats.trim, false);
  addBox(group, [0.16, 0.16, depth + 0.18], [leftX, yTop - 0.18, 0], mats.trim, false);
  addBox(group, [0.16, 0.16, depth + 0.18], [rightX, yTop - 0.18, 0], mats.trim, false);
  if (height > 3.2) {
    addBox(group, [width + 0.1, 0.13, 0.13], [0, yBand, frontZ], mats.accent, false);
    addBox(group, [width + 0.1, 0.13, 0.13], [0, yBand, backZ], mats.accent, false);
    addBox(group, [0.13, 0.13, depth + 0.1], [leftX, yBand, 0], mats.accent, false);
    addBox(group, [0.13, 0.13, depth + 0.1], [rightX, yBand, 0], mats.accent, false);
  }
  if (materialStyle === "log-siding" && !rockOnlyBuilding(recipe.id)) {
    addLogSiding(group, width, depth, height, recipe, mats);
  } else if (materialStyle === "wood-plank" && !rockOnlyBuilding(recipe.id)) {
    addPlankSiding(group, width, depth, height, recipe, mats);
  } else if (shinglePalette(materialStyle) && !rockOnlyBuilding(recipe.id)) {
    addCedarShingleSiding(group, width, depth, height, recipe, mats);
  }
  if (recipe.id === "simple-house") {
    if (materialStyle === "log-siding") {
      addSimpleHouseLogTrim(group, width, depth, height, mats);
      return;
    }
    if (materialStyle === "wood-plank") {
      addSimpleHouseLogTrim(group, width, depth, height, mats);
      return;
    }
    if (shinglePalette(materialStyle)) {
      addSimpleHouseShingleTrim(group, width, depth, height, mats);
      return;
    }
    addSimpleHouseTimbers(group, width, depth, height, mats);
    return;
  }

  const framed =
    materialStyle === "timber-frame" ||
    materialStyle === "wood-plank" ||
    materialStyle === "plaster" ||
    materialStyle === "stucco" ||
    materialStyle === "log-siding" ||
    Boolean(shinglePalette(materialStyle)) ||
    recipe.id === "inn" ||
    recipe.id === "store" ||
    recipe.id === "guild-hall";
  if (!framed) return;

  const bayCount = Math.min(5, Math.max(2, Math.floor(width / 2.4)));
  const fullHeightPosts = recipe.id === "mansion" || recipe.id === "guild-hall";
  const bayPostHeight = fullHeightPosts ? height + 0.1 : height * 0.72;
  const bayPostY = fullHeightPosts ? yMid : 0.62 + height * 0.36;
  for (let i = 1; i < bayCount; i++) {
    const x = (i / bayCount - 0.5) * (width - 1.05);
    if (Math.abs(x) < 0.8) continue;
    addBox(group, [0.12, bayPostHeight, 0.13], [x, bayPostY, frontZ + 0.02], mats.accent, false);
    addBox(group, [0.12, bayPostHeight, 0.13], [x, bayPostY, backZ - 0.02], mats.accent, false);
  }
  if (fullHeightPosts) {
    const sideBayCount = Math.min(5, Math.max(2, Math.floor(depth / 2.4)));
    for (let i = 1; i < sideBayCount; i++) {
      const z = (i / sideBayCount - 0.5) * (depth - 1.05);
      addBox(group, [0.13, bayPostHeight, 0.12], [leftX - 0.02, bayPostY, z], mats.accent, false);
      addBox(group, [0.13, bayPostHeight, 0.12], [rightX + 0.02, bayPostY, z], mats.accent, false);
    }
  }
  for (let i = 0; i < bayCount; i++) {
    const x = ((i + 0.5) / bayCount - 0.5) * (width - 1.05);
    if (Math.abs(x) > 0.9 && i % 2 === 0) {
      addDiagonalBrace(group, x - 0.24, 0.92, frontZ + 0.035, 0, mats.accent, 0.58);
      addDiagonalBrace(group, x + 0.24, 0.92, backZ - 0.035, Math.PI, mats.accent, 0.58);
    }
  }
}

function addCedarShingleSiding(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  const lowerBodyHeight = lowerBodyHeightForSiding(recipe, height);
  const yStart = 0.28 + lowerBodyHeight + 0.16;
  const yEnd = 0.28 + height - 0.36;
  const lift = 0.032;
  const tileDepth = 0.034;
  const rowSpacing = 0.3;
  const tileHeight = 0.22;
  const tileWidth = 0.52;
  const frontZ = depth / 2 + lift;
  const backZ = -depth / 2 - lift;
  const leftX = -width / 2 - lift;
  const rightX = width / 2 + lift;
  const rows = Math.max(3, Math.floor((yEnd - yStart) / rowSpacing));
  const addFace = (face: "front" | "back" | "left" | "right", row: number, y: number, offset: number) => {
    const horizontalSpan = face === "front" || face === "back" ? width * 0.94 : depth * 0.94;
    const columns = Math.max(4, Math.ceil(horizontalSpan / tileWidth));
    const step = horizontalSpan / columns;
    for (let col = 0; col < columns; col++) {
      const local = -horizontalSpan / 2 + (col + 0.5) * step + offset;
      if (Math.abs(local) > horizontalSpan / 2 - step * 0.22) continue;
      const mat = mats.cedarShingle;
      if (face === "front") addBox(group, [step * 0.92, tileHeight, tileDepth], [local, y, frontZ], mat, false);
      else if (face === "back") addBox(group, [step * 0.92, tileHeight, tileDepth], [local, y, backZ], mat, false);
      else if (face === "left") addBox(group, [tileDepth, tileHeight, step * 0.92], [leftX, y, local], mat, false);
      else addBox(group, [tileDepth, tileHeight, step * 0.92], [rightX, y, local], mat, false);
    }
  };
  for (let row = 0; row <= rows; row++) {
    const y = yStart + row * rowSpacing;
    const offset = row % 2 === 0 ? 0 : tileWidth * 0.28;
    addFace("front", row, y, offset);
    addFace("back", row, y, -offset);
    addFace("left", row, y, offset);
    addFace("right", row, y, -offset);
    const shadowY = y - tileHeight * 0.54;
    addBox(group, [width * 0.94, 0.03, tileDepth], [0, shadowY, frontZ + 0.002], mats.cedarShingleDark, false);
    addBox(group, [width * 0.94, 0.03, tileDepth], [0, shadowY, backZ - 0.002], mats.cedarShingleDark, false);
    addBox(group, [tileDepth, 0.03, depth * 0.94], [leftX - 0.002, shadowY, 0], mats.cedarShingleDark, false);
    addBox(group, [tileDepth, 0.03, depth * 0.94], [rightX + 0.002, shadowY, 0], mats.cedarShingleDark, false);
  }
}

function addShinglePorch(
  group: THREE.Group,
  width: number,
  depth: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  const smallBuilding = recipe.id === "simple-house" || width < 8.2;
  const porchWidth = Math.min(width + 0.35, Math.max(3.5, width * (smallBuilding ? 0.62 : 0.72)));
  const porchDepth = Math.min(2.25, Math.max(1.45, depth * 0.25));
  const frontWallZ = depth / 2;
  const porchCenterZ = frontWallZ + porchDepth / 2 + 0.16;
  const floorHeight = 0.22;
  const floorY = 0.18;
  addBox(group, [porchWidth, floorHeight, porchDepth], [0, floorY, porchCenterZ], mats.baseWall, false);
  addBox(group, [Math.min(2.5, porchWidth * 0.44), 0.14, 0.55], [0, 0.07, frontWallZ + porchDepth + 0.45], mats.baseWall, false);

  const columnCount = smallBuilding
    ? 2
    : Math.min(6, Math.max(3, Math.round(porchWidth / 2.45) + 1));
  const columnXs = evenPositions(columnCount, porchWidth - 0.52);
  const columnHeight = smallBuilding ? 2.0 : 2.18;
  const columnY = floorHeight + columnHeight / 2;
  const columnZ = frontWallZ + porchDepth - 0.12;
  for (const x of columnXs) {
    addBox(group, [0.18, columnHeight, 0.18], [x, columnY, columnZ], mats.trim, false);
    addBox(group, [0.36, 0.12, 0.36], [x, floorHeight + 0.06, columnZ], mats.trim, false);
    addBox(group, [0.34, 0.12, 0.34], [x, floorHeight + columnHeight + 0.02, columnZ], mats.trim, false);
  }

  const roofWidth = porchWidth + 0.75;
  const roofDepth = porchDepth + 0.68;
  const roofCenter: [number, number, number] = [0, floorHeight + columnHeight + 0.28, frontWallZ + roofDepth / 2 + 0.02];
  const roofRotationX = Math.atan2(0.48, roofDepth);
  const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(roofWidth, 0.16, roofDepth), mats.roof);
  porchRoof.position.set(...roofCenter);
  porchRoof.rotation.x = roofRotationX;
  addMesh(group, porchRoof, false);
  addShedRoofShingles(group, roofCenter, roofWidth, roofDepth, roofRotationX, mats);
  addBox(group, [roofWidth + 0.08, 0.16, 0.14], [0, roofCenter[1] - 0.28, frontWallZ + roofDepth + 0.04], mats.trim, false);
  addBox(group, [roofWidth + 0.1, 0.12, 0.12], [0, roofCenter[1] + 0.22, frontWallZ - 0.12], mats.trim, false);
}

function addShedRoofShingles(
  group: THREE.Group,
  center: [number, number, number],
  roofWidth: number,
  roofDepth: number,
  rotationX: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const rowCount = Math.max(4, Math.floor(roofDepth / 0.34));
  const rowSpacing = roofDepth / (rowCount + 0.5);
  const startZ = -roofDepth / 2 + rowSpacing;
  for (let row = 0; row < rowCount; row++) {
    const localZ = startZ + row * rowSpacing;
    addShedRoofDetailBox(group, [roofWidth + 0.04, 0.045, 0.035], center, 0, 0.105, localZ, rotationX, mats.roofDetail);
  }

  const columns = Math.max(4, Math.floor(roofWidth / 0.9));
  for (let row = 0; row < rowCount - 1; row++) {
    const localZ = startZ + (row + 0.5) * rowSpacing;
    for (let col = 0; col < columns; col++) {
      if ((row + col) % 2 !== 0) continue;
      const x = ((col + 0.5) / columns - 0.5) * (roofWidth - 0.45);
      addShedRoofDetailBox(group, [0.035, 0.04, rowSpacing * 0.52], center, x, 0.115, localZ, rotationX, mats.roofDetail);
    }
  }
}

function addShedRoofDetailBox(
  group: THREE.Group,
  size: [number, number, number],
  center: [number, number, number],
  localX: number,
  localY: number,
  localZ: number,
  rotationX: number,
  material: THREE.Material,
) {
  const offset = new THREE.Vector3(localX, localY, localZ);
  offset.applyEuler(new THREE.Euler(rotationX, 0, 0));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(center[0] + offset.x, center[1] + offset.y, center[2] + offset.z);
  mesh.rotation.x = rotationX;
  addMesh(group, mesh, false);
}

function lowerBodyHeightForSiding(recipe: TellusBuildingRecipe, height: number): number {
  return recipe.id === "simple-house"
    ? Math.min(SIMPLE_HOUSE_STONE_SKIRT_HEIGHT, height * 0.36)
    : height >= 7.2
      ? 2.65
      : Math.min(0.95, height * 0.28);
}

function addLogSiding(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  const lowerBodyHeight = lowerBodyHeightForSiding(recipe, height);
  const yStart = 0.28 + lowerBodyHeight + 0.18;
  const yEnd = 0.28 + height - 0.42;
  const courseLift = 0.034;
  const courseDepth = 0.045;
  const frontZ = depth / 2 + courseLift;
  const backZ = -depth / 2 - courseLift;
  const leftX = -width / 2 - courseLift;
  const rightX = width / 2 + courseLift;
  const spacing = 0.28;
  const courseCount = Math.max(3, Math.floor((yEnd - yStart) / spacing));
  for (let i = 0; i <= courseCount; i++) {
    const y = yStart + i * spacing;
    const mat = i % 2 === 0 ? mats.logDetail : mats.logHighlight;
    addBox(group, [width * 0.96, 0.11, courseDepth], [0, y, frontZ], mat, false);
    addBox(group, [width * 0.96, 0.11, courseDepth], [0, y, backZ], mat, false);
    addBox(group, [courseDepth, 0.11, depth * 0.96], [leftX, y, 0], mat, false);
    addBox(group, [courseDepth, 0.11, depth * 0.96], [rightX, y, 0], mat, false);
  }
  const cornerHeight = Math.max(0.8, yEnd - yStart + 0.42);
  const cornerY = yStart + cornerHeight / 2 - 0.1;
  for (const x of [-width / 2 + 0.18, width / 2 - 0.18]) {
    addBox(group, [0.2, cornerHeight, 0.18], [x, cornerY, frontZ + 0.02], mats.accent, false);
    addBox(group, [0.2, cornerHeight, 0.18], [x, cornerY, backZ - 0.02], mats.accent, false);
  }
  for (const z of [-depth / 2 + 0.18, depth / 2 - 0.18]) {
    addBox(group, [0.18, cornerHeight, 0.2], [leftX - 0.02, cornerY, z], mats.accent, false);
    addBox(group, [0.18, cornerHeight, 0.2], [rightX + 0.02, cornerY, z], mats.accent, false);
  }
}

function addPlankSiding(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  const lowerBodyHeight = lowerBodyHeightForSiding(recipe, height);
  const yStart = 0.28 + lowerBodyHeight + 0.2;
  const yEnd = 0.28 + height - 0.38;
  const courseLift = 0.03;
  const boardDepth = 0.032;
  const chinkDepth = 0.036;
  const frontZ = depth / 2 + courseLift;
  const backZ = -depth / 2 - courseLift;
  const leftX = -width / 2 - courseLift;
  const rightX = width / 2 + courseLift;
  const spacing = 0.36;
  const boardHeight = 0.25;
  const courseCount = Math.max(3, Math.floor((yEnd - yStart) / spacing));
  for (let i = 0; i <= courseCount; i++) {
    const y = yStart + i * spacing;
    const boardMat = mats.plankBoard;
    addBox(group, [width * 0.97, boardHeight, boardDepth], [0, y, frontZ], boardMat, false);
    addBox(group, [width * 0.97, boardHeight, boardDepth], [0, y, backZ], boardMat, false);
    addBox(group, [boardDepth, boardHeight, depth * 0.97], [leftX, y, 0], boardMat, false);
    addBox(group, [boardDepth, boardHeight, depth * 0.97], [rightX, y, 0], boardMat, false);
    if (i < courseCount) {
      const gapY = y + spacing * 0.5;
      addBox(group, [width * 0.97, 0.035, chinkDepth], [0, gapY, frontZ + 0.003], mats.plankChink, false);
      addBox(group, [width * 0.97, 0.035, chinkDepth], [0, gapY, backZ - 0.003], mats.plankChink, false);
      addBox(group, [chinkDepth, 0.035, depth * 0.97], [leftX - 0.003, gapY, 0], mats.plankChink, false);
      addBox(group, [chinkDepth, 0.035, depth * 0.97], [rightX + 0.003, gapY, 0], mats.plankChink, false);
    }
  }
  const cornerHeight = Math.max(0.8, yEnd - yStart + 0.42);
  const cornerY = yStart + cornerHeight / 2 - 0.1;
  for (const x of [-width / 2 + 0.18, width / 2 - 0.18]) {
    addBox(group, [0.16, cornerHeight, 0.15], [x, cornerY, frontZ + 0.018], mats.accent, false);
    addBox(group, [0.16, cornerHeight, 0.15], [x, cornerY, backZ - 0.018], mats.accent, false);
  }
  for (const z of [-depth / 2 + 0.18, depth / 2 - 0.18]) {
    addBox(group, [0.15, cornerHeight, 0.16], [leftX - 0.018, cornerY, z], mats.accent, false);
    addBox(group, [0.15, cornerHeight, 0.16], [rightX + 0.018, cornerY, z], mats.accent, false);
  }
}

function addSimpleHouseLogTrim(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const yTop = 0.28 + height;
  const ySkirtTop = 0.28 + Math.min(SIMPLE_HOUSE_STONE_SKIRT_HEIGHT, height * 0.36);
  const yUpperBeam = yTop - 0.56;
  const frontZ = depth / 2 + 0.12;
  const backZ = -depth / 2 - 0.12;
  const leftX = -width / 2 - 0.12;
  const rightX = width / 2 + 0.12;
  const doorBeamGap = 1.65;
  const frontBeamSpan = (width + 0.2 - doorBeamGap) / 2;
  const frontBeamOffset = doorBeamGap / 2 + frontBeamSpan / 2;
  addBox(group, [frontBeamSpan, 0.16, 0.16], [-frontBeamOffset, ySkirtTop, frontZ], mats.accent, false);
  addBox(group, [frontBeamSpan, 0.16, 0.16], [frontBeamOffset, ySkirtTop, frontZ], mats.accent, false);
  addBox(group, [width + 0.2, 0.16, 0.16], [0, ySkirtTop, backZ], mats.accent, false);
  addBox(group, [0.16, 0.16, depth + 0.2], [leftX, ySkirtTop, 0], mats.accent, false);
  addBox(group, [0.16, 0.16, depth + 0.2], [rightX, ySkirtTop, 0], mats.accent, false);
  addBox(group, [width + 0.2, 0.16, 0.16], [0, yUpperBeam, frontZ], mats.accent, false);
  addBox(group, [width + 0.2, 0.16, 0.16], [0, yUpperBeam, backZ], mats.accent, false);
  addBox(group, [0.16, 0.16, depth + 0.2], [leftX, yUpperBeam, 0], mats.accent, false);
  addBox(group, [0.16, 0.16, depth + 0.2], [rightX, yUpperBeam, 0], mats.accent, false);
  addGableSunburst(group, width, yUpperBeam, yTop, frontZ, mats, "up");
  addGableSunburst(group, width, yUpperBeam, yTop, backZ, mats, "down");
}

function addSimpleHouseShingleTrim(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const yTop = 0.28 + height;
  const ySkirtTop = 0.28 + Math.min(SIMPLE_HOUSE_STONE_SKIRT_HEIGHT, height * 0.36);
  const yUpperBeam = yTop - 0.5;
  const frontZ = depth / 2 + 0.095;
  const backZ = -depth / 2 - 0.095;
  const leftX = -width / 2 - 0.095;
  const rightX = width / 2 + 0.095;
  const doorBeamGap = 1.65;
  const frontBeamSpan = (width + 0.12 - doorBeamGap) / 2;
  const frontBeamOffset = doorBeamGap / 2 + frontBeamSpan / 2;
  addBox(group, [frontBeamSpan, 0.11, 0.12], [-frontBeamOffset, ySkirtTop, frontZ], mats.trim, false);
  addBox(group, [frontBeamSpan, 0.11, 0.12], [frontBeamOffset, ySkirtTop, frontZ], mats.trim, false);
  addBox(group, [width + 0.12, 0.11, 0.12], [0, ySkirtTop, backZ], mats.trim, false);
  addBox(group, [0.12, 0.11, depth + 0.12], [leftX, ySkirtTop, 0], mats.trim, false);
  addBox(group, [0.12, 0.11, depth + 0.12], [rightX, ySkirtTop, 0], mats.trim, false);
  addBox(group, [width + 0.12, 0.11, 0.12], [0, yUpperBeam, frontZ], mats.trim, false);
  addBox(group, [width + 0.12, 0.11, 0.12], [0, yUpperBeam, backZ], mats.trim, false);
  addBox(group, [0.11, 0.11, depth + 0.12], [leftX, yUpperBeam, 0], mats.trim, false);
  addBox(group, [0.11, 0.11, depth + 0.12], [rightX, yUpperBeam, 0], mats.trim, false);
}

function addSimpleHouseTimbers(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const yTop = 0.28 + height;
  const ySkirtTop = 0.28 + Math.min(SIMPLE_HOUSE_STONE_SKIRT_HEIGHT, height * 0.36);
  const yUpperBeam = yTop - 0.56;
  const timberHeight = Math.max(1.2, height - 0.64);
  const yMid = 0.28 + timberHeight / 2 + 0.18;
  const frontZ = depth / 2 + 0.105;
  const backZ = -depth / 2 - 0.105;
  const leftX = -width / 2 - 0.105;
  const rightX = width / 2 + 0.105;
  const frontXs = [-width * 0.45, width * 0.45];
  const sideZs = [-depth * 0.45, depth * 0.45];

  for (const x of frontXs) {
    addBox(group, [0.15, timberHeight, 0.14], [x, yMid, frontZ], mats.accent, false);
    addBox(group, [0.15, timberHeight, 0.14], [x, yMid, backZ], mats.accent, false);
  }
  for (const z of sideZs) {
    addBox(group, [0.14, timberHeight, 0.15], [leftX, yMid, z], mats.accent, false);
    addBox(group, [0.14, timberHeight, 0.15], [rightX, yMid, z], mats.accent, false);
  }
  const middlePostHeight = Math.max(0.8, yUpperBeam - ySkirtTop);
  const middlePostY = ySkirtTop + middlePostHeight / 2;
  for (const x of [-width * 0.17, width * 0.17]) {
    addBox(group, [0.15, middlePostHeight, 0.14], [x, middlePostY, backZ], mats.accent, false);
  }
  for (const z of [-depth * 0.17, depth * 0.17]) {
    addBox(group, [0.14, middlePostHeight, 0.15], [leftX, middlePostY, z], mats.accent, false);
    addBox(group, [0.14, middlePostHeight, 0.15], [rightX, middlePostY, z], mats.accent, false);
  }
  const overDoorPostBottom = 2.32;
  const overDoorPostTop = yUpperBeam - 0.06;
  const overDoorPostHeight = Math.max(0.7, overDoorPostTop - overDoorPostBottom);
  const overDoorPostY = overDoorPostBottom + overDoorPostHeight / 2;
  for (const x of [-0.72, 0.72]) {
    addBox(group, [0.14, overDoorPostHeight, 0.14], [x, overDoorPostY, frontZ], mats.accent, false);
  }
  addGableSunburst(group, width, yUpperBeam, yTop, frontZ, mats, "up");
  addGableSunburst(group, width, yUpperBeam, yTop, backZ, mats, "down");
  const doorBeamGap = 1.65;
  const frontBeamSpan = (width + 0.2 - doorBeamGap) / 2;
  const frontBeamOffset = doorBeamGap / 2 + frontBeamSpan / 2;
  addBox(group, [frontBeamSpan, 0.16, 0.16], [-frontBeamOffset, ySkirtTop, frontZ], mats.accent, false);
  addBox(group, [frontBeamSpan, 0.16, 0.16], [frontBeamOffset, ySkirtTop, frontZ], mats.accent, false);
  addBox(group, [width + 0.2, 0.16, 0.16], [0, ySkirtTop, backZ], mats.accent, false);
  addBox(group, [0.16, 0.16, depth + 0.2], [leftX, ySkirtTop, 0], mats.accent, false);
  addBox(group, [0.16, 0.16, depth + 0.2], [rightX, ySkirtTop, 0], mats.accent, false);
  addBox(group, [width + 0.2, 0.16, 0.16], [0, yUpperBeam, frontZ], mats.accent, false);
  addBox(group, [width + 0.2, 0.16, 0.16], [0, yUpperBeam, backZ], mats.accent, false);
  addBox(group, [0.16, 0.16, depth + 0.2], [leftX, yUpperBeam, 0], mats.accent, false);
  addBox(group, [0.16, 0.16, depth + 0.2], [rightX, yUpperBeam, 0], mats.accent, false);
}

function addGableSunburst(
  group: THREE.Group,
  width: number,
  yBase: number,
  yTop: number,
  z: number,
  mats: ReturnType<typeof createMaterials>,
  direction: "up" | "down",
) {
  const peakY = yTop + 1.95;
  const peakX = 0;
  const baseY = yBase + 0.12;
  const spread = Math.min(width * 0.32, 2.05);
  if (direction === "up") {
    for (const baseX of [-spread, -spread * 0.5, 0, spread * 0.5, spread]) {
      addFrontBeamBetween(group, baseX, baseY, peakX, peakY, z + Math.sign(z) * 0.04, mats.accent);
    }
    return;
  }
  for (const topX of [-spread, -spread * 0.5, 0, spread * 0.5, spread]) {
    addFrontBeamBetween(group, peakX, baseY, topX, peakY, z + Math.sign(z) * 0.04, mats.accent);
  }
}

function addFrontBeamBetween(
  group: THREE.Group,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  z: number,
  material: THREE.Material,
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.hypot(dx, dy);
  const beam = new THREE.Mesh(new THREE.BoxGeometry(0.11, length, 0.12), material);
  beam.position.set((x1 + x2) / 2, (y1 + y2) / 2, z);
  beam.rotation.z = -Math.atan2(dx, dy);
  addMesh(group, beam, false);
}

function addDiagonalBrace(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  material: THREE.Material,
  length: number,
  rotationZ = Math.PI / 4,
) {
  const brace = new THREE.Mesh(new THREE.BoxGeometry(0.11, length, 0.12), material);
  brace.position.set(x, y, z);
  brace.rotation.y = rotationY;
  brace.rotation.z = rotationZ;
  addMesh(group, brace, false);
}

function addDoor(
  group: THREE.Group,
  width: number,
  depth: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  if (recipe.id === "cathedral") {
    addCathedralEntrance(group, width, depth, mats);
    return;
  }
  const arched = recipe.entranceArchChance >= 0.5;
  addBox(group, [1.15, 1.8, 0.12], [0, 1.18, depth / 2 + 0.065], mats.accent, false);
  addBox(group, [1.35, 0.16, 0.2], [0, 2.14, depth / 2 + 0.1], mats.trim, false);
  if (arched) {
    const arch = new THREE.Mesh(new THREE.TorusGeometry(0.67, 0.08, 8, 24, Math.PI), mats.trim);
    arch.rotation.z = Math.PI;
    arch.position.set(0, 2.08, depth / 2 + 0.11);
    addMesh(group, arch, false);
  }
  addBox(group, [0.12, 1.95, 0.22], [-0.72, 1.23, depth / 2 + 0.1], mats.trim, false);
  addBox(group, [0.12, 1.95, 0.22], [0.72, 1.23, depth / 2 + 0.1], mats.trim, false);
}

function addCathedralEntrance(
  group: THREE.Group,
  width: number,
  depth: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const frontZ = depth / 2 + 0.11;
  const stepZ = depth / 2 + 0.58;
  for (let i = 0; i < 4; i++) {
    addBox(group, [Math.min(width * 0.48, 4.8) - i * 0.28, 0.16, 0.56 + i * 0.18], [0, 0.08 + i * 0.14, stepZ + i * 0.12], mats.baseWall, false);
  }
  addBox(group, [2.15, 2.75, 0.18], [0, 1.67, frontZ], mats.accent, false);
  addBox(group, [2.45, 0.18, 0.24], [0, 3.08, frontZ + 0.02], mats.trim, false);
  addBox(group, [0.16, 2.92, 0.26], [-1.22, 1.68, frontZ + 0.02], mats.trim, false);
  addBox(group, [0.16, 2.92, 0.26], [1.22, 1.68, frontZ + 0.02], mats.trim, false);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(1.1, 0.085, 8, 28, Math.PI), mats.trim);
  arch.rotation.z = Math.PI;
  arch.position.set(0, 3.02, frontZ + 0.04);
  addMesh(group, arch, false);
  addRosetteWindow(group, 0, 4.15, frontZ + 0.05, mats);
}

function addRosetteWindow(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const radius = 0.62;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(radius, 32), mats.glass);
  glass.position.set(x, y, z);
  addMesh(group, glass, false);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.055, 8, 32), mats.trim);
  ring.position.set(x, y, z + 0.02);
  addMesh(group, ring, false);
  const hub = new THREE.Mesh(new THREE.CircleGeometry(0.11, 18), mats.trim);
  hub.position.set(x, y, z + 0.03);
  addMesh(group, hub, false);
  for (let i = 0; i < 12; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.035, radius * 1.7, 0.055), mats.trim);
    spoke.position.set(x, y, z + 0.035);
    spoke.rotation.z = (i / 12) * Math.PI;
    addMesh(group, spoke, false);
  }
}

function addWindows(
  group: THREE.Group,
  width: number,
  depth: number,
  floors: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
  rng: () => number,
) {
  if (recipe.id === "simple-house") {
    addSymmetricHouseWindows(group, width, depth, floors, mats);
    return;
  }
  if (recipe.id === "cathedral") {
    addCathedralWindows(group, width, depth, floors, mats);
    return;
  }
  const rows = Math.max(1, floors);
  const sparse = recipe.id === "keep" || recipe.id === "fortress" || recipe.id === "castle" || recipe.id === "smithy";
  const frontCols = Math.max(1, Math.floor(width / (sparse ? 3.1 : 2.6)));
  const sideCols = Math.max(1, Math.floor(depth / (sparse ? 3.2 : 2.7)));
  const frontXs = evenPositions(frontCols, Math.max(1, width - 2.0));
  const sideZs = evenPositions(sideCols, Math.max(1, depth - 2.0));
  for (let floor = 0; floor < rows; floor++) {
    const y = 1.55 + floor * 2.65;
    for (const x of frontXs) {
      if (Math.abs(x) < 0.95 && floor === 0) continue;
      addBuildingGridWindow(group, x, y, depth / 2 + 0.07, 0, recipe, mats);
      addBuildingGridWindow(group, x, y, -depth / 2 - 0.07, Math.PI, recipe, mats);
    }
    for (const z of sideZs) {
      addBuildingGridWindow(group, width / 2 + 0.07, y, z, Math.PI / 2, recipe, mats);
      addBuildingGridWindow(group, -width / 2 - 0.07, y, z, -Math.PI / 2, recipe, mats);
    }
  }
}

function addCathedralWindows(
  group: THREE.Group,
  width: number,
  depth: number,
  floors: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const rows = Math.max(1, floors - 1);
  const yStart = 4.38;
  const yStep = 2.18;
  const frontXs = evenPositions(3, Math.max(1.2, width - 4.4));
  const sideCols = Math.max(4, Math.floor((depth - 5.0) / 3.0));
  const sideZs = evenPositions(sideCols, Math.max(1.6, depth - 5.0));
  for (let row = 0; row < rows; row++) {
    const y = yStart + row * yStep;
    for (const x of frontXs) {
      if (!(row === 0 && Math.abs(x) < 0.2)) {
        addNineLiteWindow(group, x, y, depth / 2 + 0.07, 0, mats, mats.trim, 3, 4, 1.0, 2.1);
      }
      addNineLiteWindow(group, x, y, -depth / 2 - 0.07, Math.PI, mats, mats.trim, 3, 4, 1.0, 2.1);
    }
    for (const z of sideZs) {
      addNineLiteWindow(group, width / 2 + 0.07, y, z, Math.PI / 2, mats, mats.trim, 3, 4, 1.0, 2.1);
      addNineLiteWindow(group, -width / 2 - 0.07, y, z, -Math.PI / 2, mats, mats.trim, 3, 4, 1.0, 2.1);
    }
  }
}

function evenPositions(count: number, span: number): number[] {
  if (count <= 1) return [0];
  return Array.from({ length: count }, (_, i) => (i / (count - 1) - 0.5) * span);
}

function addWindow(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  mats: ReturnType<typeof createMaterials>,
  frameMaterial: THREE.Material = mats.trim,
) {
  const frame = new THREE.Group();
  frame.position.set(x, y, z);
  frame.rotation.y = rotationY;
  addBox(frame, [0.82, 0.72, 0.06], [0, 0, 0], mats.glass, false);
  addBox(frame, [0.98, 0.1, 0.08], [0, 0.43, 0.01], frameMaterial, false);
  addBox(frame, [0.98, 0.1, 0.08], [0, -0.43, 0.01], frameMaterial, false);
  addBox(frame, [0.1, 0.88, 0.08], [-0.49, 0, 0.01], frameMaterial, false);
  addBox(frame, [0.1, 0.88, 0.08], [0.49, 0, 0.01], frameMaterial, false);
  group.add(frame);
}

function addNineLiteWindow(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  mats: ReturnType<typeof createMaterials>,
  frameMaterial: THREE.Material = mats.trim,
  liteColumns = 3,
  liteRows = 3,
  paneWidth = 0.58,
  paneHeight = 1.08,
) {
  const frame = new THREE.Group();
  frame.position.set(x, y, z);
  frame.rotation.y = rotationY;
  const frameThickness = 0.1;
  const outerWidth = paneWidth + frameThickness * 2;
  const outerHeight = paneHeight + frameThickness * 2;
  addBox(frame, [paneWidth, paneHeight, 0.055], [0, 0, 0], mats.glass, false);
  addBox(frame, [outerWidth, frameThickness, 0.085], [0, outerHeight / 2 - frameThickness / 2, 0.012], frameMaterial, false);
  addBox(frame, [outerWidth, frameThickness, 0.085], [0, -outerHeight / 2 + frameThickness / 2, 0.012], frameMaterial, false);
  addBox(frame, [frameThickness, outerHeight, 0.085], [-outerWidth / 2 + frameThickness / 2, 0, 0.012], frameMaterial, false);
  addBox(frame, [frameThickness, outerHeight, 0.085], [outerWidth / 2 - frameThickness / 2, 0, 0.012], frameMaterial, false);
  for (let i = 1; i < liteColumns; i++) {
    const xBar = (i / liteColumns - 0.5) * paneWidth;
    addBox(frame, [0.045, paneHeight, 0.075], [xBar, 0, 0.025], frameMaterial, false);
  }
  for (let i = 1; i < liteRows; i++) {
    const yBar = (i / liteRows - 0.5) * paneHeight;
    addBox(frame, [paneWidth, 0.045, 0.075], [0, yBar, 0.025], frameMaterial, false);
  }
  group.add(frame);
}

function addBuildingGridWindow(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  if (recipe.id === "cathedral") {
    addNineLiteWindow(group, x, y + 0.34, z, rotationY, mats, mats.trim, 3, 4, 1.0, 2.1);
    return;
  }
  if (recipe.id === "church") {
    addNineLiteWindow(group, x, y + 0.34, z, rotationY, mats, mats.trim, 3, 4, 0.86, 1.95);
    return;
  }
  if (recipe.id === "chapel") {
    addNineLiteWindow(group, x, y + 0.18, z, rotationY, mats, mats.trim, 3, 4, 0.72, 1.55);
    return;
  }
  addNineLiteWindow(group, x, y, z, rotationY, mats, mats.trim);
}

function addSymmetricHouseWindows(
  group: THREE.Group,
  width: number,
  depth: number,
  floors: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const rows = floors >= 2 ? [1.92, 4.15] : [1.92];
  const frontLowerXs = [-width * 0.28, width * 0.28];
  const backXs = [-width * 0.32, 0, width * 0.32];
  const sideZs = [-depth * 0.32, 0, depth * 0.32];
  rows.forEach((y, rowIndex) => {
    const frontXs = rowIndex === 0 ? frontLowerXs : [-width * 0.28, 0, width * 0.28];
    for (const x of frontXs) {
      addNineLiteWindow(group, x, y, depth / 2 + 0.07, 0, mats, mats.accent);
    }
    for (const x of backXs) {
      addNineLiteWindow(group, x, y, -depth / 2 - 0.07, Math.PI, mats, mats.accent);
    }
    for (const z of sideZs) {
      addNineLiteWindow(group, width / 2 + 0.07, y, z, Math.PI / 2, mats, mats.accent);
      addNineLiteWindow(group, -width / 2 - 0.07, y, z, -Math.PI / 2, mats, mats.accent);
    }
  });
}

function addRoof(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
  rng: () => number,
) {
  const roofHeight = recipe.footprintStyle === "towered" || recipe.footprintStyle === "cruciform" ? 2.55 : 2.2;
  if (recipe.footprintStyle !== "towered" && recipe.id !== "keep" && recipe.id !== "castle" && recipe.id !== "fortress") {
    addGabledRoof(group, width, depth, height, roofHeight, recipe, mats);
    if (rng() > 0.45) {
      addBox(group, [0.45, 0.9, 0.45], [width * 0.24, 0.28 + height + 0.55, depth * -0.14], mats.accent);
      addBox(group, [0.62, 0.18, 0.62], [width * 0.24, 0.28 + height + 1.08, depth * -0.14], mats.foundation);
    }
    if (recipe.id === "inn" || recipe.id === "store" || recipe.id === "guild-hall") {
      addDormer(group, width * -0.22, depth * 0.32, height, roofHeight, mats);
    }
    return;
  }
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, roofHeight, 4), mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 0.28 + height + roofHeight / 2, 0);
  roof.scale.z = depth / width;
  addMesh(group, roof);
  addPyramidRoofCourses(group, width, depth, height, roofHeight, mats);
  if (rng() > 0.45) {
    addBox(group, [0.45, 0.9, 0.45], [width * 0.24, 0.28 + height + 0.55, depth * -0.14], mats.accent);
    addBox(group, [0.62, 0.18, 0.62], [width * 0.24, 0.28 + height + 1.08, depth * -0.14], mats.foundation);
  }
}

function addGabledRoof(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  roofHeight: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  const yBase = 0.28 + height;
  const overhang = 0.95;
  const slope = Math.hypot(width / 2 + overhang, roofHeight);
  const angle = Math.atan2(roofHeight, width / 2 + overhang);
  const left = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.22, depth + overhang * 2), mats.roof);
  left.position.set(-(width / 4 + overhang * 0.24), yBase + roofHeight / 2, 0);
  left.rotation.z = angle;
  addMesh(group, left);
  const right = new THREE.Mesh(new THREE.BoxGeometry(slope, 0.22, depth + overhang * 2), mats.roof);
  right.position.set(width / 4 + overhang * 0.24, yBase + roofHeight / 2, 0);
  right.rotation.z = -angle;
  addMesh(group, right);
  addRoofShingles(group, -(width / 4 + overhang * 0.24), yBase + roofHeight / 2, angle, slope, depth + overhang * 2, -1, mats);
  addRoofShingles(group, width / 4 + overhang * 0.24, yBase + roofHeight / 2, -angle, slope, depth + overhang * 2, 1, mats);
  addBox(group, [0.22, 0.18, depth + overhang * 2.12], [0, yBase + roofHeight + 0.02, 0], mats.trim, false);
  const gableEndBeamY = yBase + (recipe.id === "cathedral" ? 0.55 : 0.06);
  addBox(group, [width + overhang * 2, 0.16, 0.18], [0, gableEndBeamY, depth / 2 + overhang], mats.trim, false);
  addBox(group, [width + overhang * 2, 0.16, 0.18], [0, gableEndBeamY, -depth / 2 - overhang], mats.trim, false);

  for (const z of [-depth / 2 - 0.04, depth / 2 + 0.04]) {
    const gable = new THREE.Mesh(new THREE.BufferGeometry(), mats.wall);
    const vertices = new Float32Array([
      -width / 2, yBase, z,
      width / 2, yBase, z,
      0, yBase + roofHeight * 0.95, z,
    ]);
    gable.geometry.setAttribute("position", new THREE.BufferAttribute(vertices, 3));
    gable.geometry.setIndex([0, 1, 2]);
    gable.geometry.computeVertexNormals();
    addMesh(group, gable);
    addGableEndDetail(group, width, roofHeight, yBase, z, recipe, mats);
  }
}

function fancyGableBuilding(recipe: TellusBuildingRecipe, width: number, roofHeight: number): boolean {
  return (
    width >= 10 ||
    roofHeight >= 2.5 ||
    recipe.id === "inn" ||
    recipe.id === "mansion" ||
    recipe.id === "manor" ||
    recipe.id === "church" ||
    recipe.id === "cathedral" ||
    recipe.id === "guild-hall" ||
    recipe.id === "town-hall"
  );
}

function addGableEndDetail(
  group: THREE.Group,
  width: number,
  roofHeight: number,
  yBase: number,
  z: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
  const detailZ = z + Math.sign(z) * 0.04;
  if (fancyGableBuilding(recipe, width, roofHeight)) {
    const supportHeight = roofHeight * 0.86;
    for (const x of [-width * 0.32, width * 0.32]) {
      addBox(group, [0.14, supportHeight, 0.12], [x, yBase + supportHeight / 2, detailZ], mats.accent, false);
    }
    addHalfCircleGableWindow(group, 0, yBase + roofHeight * 0.48, detailZ, mats);
    return;
  }

  const supportCount = width >= 8 ? 5 : width >= 6 ? 4 : 3;
  const usableWidth = width * 0.64;
  for (let i = 0; i < supportCount; i++) {
    const t = i / (supportCount - 1);
    const x = (t - 0.5) * usableWidth;
    const localRoof = roofHeight * (1 - Math.abs(x) / (width / 2));
    const supportHeight = Math.max(0.55, localRoof * 0.88);
    addBox(group, [0.14, supportHeight, 0.12], [x, yBase + supportHeight / 2, detailZ], mats.accent, false);
  }
}

function addHalfCircleGableWindow(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const shape = new THREE.Shape();
  const radius = 0.36;
  const baseY = -0.18;
  shape.moveTo(-radius, baseY);
  shape.lineTo(-radius, 0);
  shape.absarc(0, 0, radius, Math.PI, 0, true);
  shape.lineTo(radius, baseY);
  shape.lineTo(-radius, baseY);
  const glass = new THREE.Mesh(new THREE.ShapeGeometry(shape), mats.glass);
  glass.position.set(x, y, z);
  addMesh(group, glass, false);
  addBox(group, [radius * 2 + 0.16, 0.08, 0.08], [x, y + baseY - 0.02, z + Math.sign(z) * 0.015], mats.trim, false);
  addBox(group, [0.08, 0.36, 0.08], [x - radius - 0.04, y + baseY + 0.16, z + Math.sign(z) * 0.015], mats.trim, false);
  addBox(group, [0.08, 0.36, 0.08], [x + radius + 0.04, y + baseY + 0.16, z + Math.sign(z) * 0.015], mats.trim, false);
  const arch = new THREE.Mesh(new THREE.TorusGeometry(radius, 0.045, 8, 24, Math.PI), mats.trim);
  arch.position.set(x, y, z + Math.sign(z) * 0.02);
  addMesh(group, arch, false);
}

function addRoofShingles(
  group: THREE.Group,
  centerX: number,
  centerY: number,
  rotationZ: number,
  slope: number,
  depth: number,
  side: -1 | 1,
  mats: ReturnType<typeof createMaterials>,
) {
  const rowCount = Math.max(5, Math.floor(slope / 0.38));
  const rowSpacing = slope / (rowCount + 0.8);
  const start = side < 0 ? -slope / 2 + rowSpacing : slope / 2 - rowSpacing;
  for (let i = 0; i < rowCount; i++) {
    const localX = start - side * i * rowSpacing;
    addRoofDetailBox(group, [0.035, 0.055, depth + 0.04], [centerX, centerY, 0], localX, 0.145, 0, rotationZ, mats.roofDetail);
  }

  const columns = Math.max(3, Math.floor(depth / 1.15));
  const usableDepth = depth - 0.7;
  for (let row = 0; row < rowCount - 1; row++) {
    const localX = start - side * (row + 0.5) * rowSpacing;
    for (let col = 0; col < columns; col++) {
      if ((row + col) % 2 !== 0) continue;
      const z = ((col + 0.5) / columns - 0.5) * usableDepth;
      addRoofDetailBox(group, [rowSpacing * 0.55, 0.04, 0.035], [centerX, centerY, 0], localX, 0.155, z, rotationZ, mats.roofDetail);
    }
  }
}

function addRoofDetailBox(
  group: THREE.Group,
  size: [number, number, number],
  center: [number, number, number],
  localX: number,
  localY: number,
  localZ: number,
  rotationZ: number,
  material: THREE.Material,
) {
  const offset = new THREE.Vector3(localX, localY, localZ);
  offset.applyEuler(new THREE.Euler(0, 0, rotationZ));
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material);
  mesh.position.set(center[0] + offset.x, center[1] + offset.y, center[2] + offset.z);
  mesh.rotation.z = rotationZ;
  addMesh(group, mesh, false);
}

function addPyramidRoofCourses(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  roofHeight: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const yBase = 0.28 + height;
  const levels = Math.max(8, Math.floor(roofHeight / 0.22));
  const detailY = 0.1;
  const detailW = 0.12;
  for (let i = 0; i <= levels; i++) {
    const t = (i + 0.04) / (levels + 1.08);
    const y = yBase + t * roofHeight + 0.13;
    const sx = Math.max(0.55, width * 1.02 * (1 - t));
    const sz = Math.max(0.55, depth * 1.02 * (1 - t));
    addBox(group, [sx, detailY, detailW], [0, y, sz / 2], mats.roofDetail, false);
    addBox(group, [sx, detailY, detailW], [0, y, -sz / 2], mats.roofDetail, false);
    addBox(group, [detailW, detailY, sz], [sx / 2, y, 0], mats.roofDetail, false);
    addBox(group, [detailW, detailY, sz], [-sx / 2, y, 0], mats.roofDetail, false);
  }
  addPyramidRoofSeam(group, width, depth, yBase, roofHeight, 1, mats);
  addPyramidRoofSeam(group, width, depth, yBase, roofHeight, -1, mats);
}

function addPyramidRoofSeam(
  group: THREE.Group,
  width: number,
  depth: number,
  yBase: number,
  roofHeight: number,
  direction: 1 | -1,
  mats: ReturnType<typeof createMaterials>,
) {
  const length = Math.hypot(width * 0.47, depth * 0.47);
  const seam = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, length), mats.roofDetail);
  seam.position.set(0, yBase + roofHeight * 0.48 + 0.14, 0);
  seam.rotation.y = direction * Math.atan2(width, depth);
  addMesh(group, seam, false);
}

function addTowerCapCourses(
  group: THREE.Group,
  x: number,
  z: number,
  towerSize: number,
  yBase: number,
  capHeight: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const levels = 5;
  for (let i = 0; i <= levels; i++) {
    const t = (i + 0.08) / (levels + 1.08);
    const y = yBase + t * capHeight + 0.06;
    const size = Math.max(0.2, towerSize * 0.86 * (1 - t));
    addBox(group, [size, 0.06, 0.07], [x, y, z + size / 2], mats.roofDetail, false);
    addBox(group, [size, 0.06, 0.07], [x, y, z - size / 2], mats.roofDetail, false);
    addBox(group, [0.07, 0.06, size], [x + size / 2, y, z], mats.roofDetail, false);
    addBox(group, [0.07, 0.06, size], [x - size / 2, y, z], mats.roofDetail, false);
  }
  const seamLength = Math.max(0.3, towerSize * 0.48);
  addBox(group, [0.06, 0.07, seamLength], [x, yBase + capHeight * 0.52, z], mats.roofDetail, false);
  addBox(group, [seamLength, 0.07, 0.06], [x, yBase + capHeight * 0.52, z], mats.roofDetail, false);
}

function addDormer(
  group: THREE.Group,
  x: number,
  z: number,
  height: number,
  roofHeight: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const y = 0.28 + height + roofHeight * 0.42;
  addBox(group, [0.92, 0.62, 0.16], [x, y, z + 0.56], mats.wall, false);
  addBox(group, [0.54, 0.42, 0.08], [x, y - 0.02, z + 0.65], mats.glass, false);
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.72, 0.44, 4), mats.roof);
  cap.rotation.y = Math.PI / 4;
  cap.scale.z = 0.75;
  cap.position.set(x, y + 0.52, z + 0.56);
  addMesh(group, cap, false);
}

function addFootprintDetails(
  group: THREE.Group,
  width: number,
  depth: number,
  height: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
  rng: () => number,
) {
  if (recipe.footprintStyle === "towered") {
    const towerSize = Math.min(width, depth) * 0.28;
    for (const x of [-width / 2 + towerSize / 2, width / 2 - towerSize / 2]) {
      for (const z of [-depth / 2 + towerSize / 2, depth / 2 - towerSize / 2]) {
        addBox(group, [towerSize, height * 1.22, towerSize], [x, 0.28 + (height * 1.22) / 2, z], mats.wall);
        const capHeight = 1.45;
        const cap = new THREE.Mesh(new THREE.ConeGeometry(towerSize * 0.78, capHeight, 6), mats.roof);
        cap.position.set(x, 0.28 + height * 1.22 + capHeight / 2, z);
        addMesh(group, cap);
        addTowerCapCourses(group, x, z, towerSize, 0.28 + height * 1.22, capHeight, mats);
      }
    }
  } else if (recipe.footprintStyle === "winged" || recipe.footprintStyle === "cruciform") {
    addBuildingBlock(group, 0, width * 0.48, depth * 0.42, Math.max(2.2, height * 0.72), mats.wall);
    const wing = group.children[group.children.length - 1];
    wing.rotation.y = Math.PI / 2;
  } else if (recipe.footprintStyle === "gallery") {
    for (let i = 0; i < Math.max(3, Math.floor(width / 2)); i++) {
      const x = ((i + 0.5) / Math.max(3, Math.floor(width / 2)) - 0.5) * (width - 0.8);
      addBox(group, [0.12, 1.4, 0.12], [x, 0.98, depth / 2 + 0.58], mats.trim, false);
    }
  } else if (recipe.footprintStyle === "apse") {
    const apse = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.32, width * 0.32, 1.2, 18), mats.wall);
    apse.rotation.x = Math.PI / 2;
    apse.position.set(0, 1.1, -depth / 2 - 0.18);
    addMesh(group, apse);
  }
  if (recipe.id === "smithy" || (recipe.id === "inn" && rng() > 0.4)) {
    addBox(group, [2.0, 1.0, 1.0], [width / 2 + 0.75, 0.78, -depth * 0.18], mats.foundation);
    addBox(group, [1.4, 0.12, 0.8], [width / 2 + 0.75, 1.36, -depth * 0.18], mats.light, false);
  }
}

function addLighting(group: THREE.Group, width: number, depth: number, height: number, style: BuildingLightingStyle) {
  if (style === "none") return;
  const colors: Record<Exclude<BuildingLightingStyle, "none">, number> = {
    warm: 0xffc47a,
    lantern: 0xff9f4a,
    moonlit: 0xaec8ff,
    bright: 0xfff2c8,
  };
  const intensities: Record<Exclude<BuildingLightingStyle, "none">, number> = {
    warm: 0.8,
    lantern: 1.05,
    moonlit: 0.42,
    bright: 1.45,
  };
  const key = style as Exclude<BuildingLightingStyle, "none">;
  const light = new THREE.PointLight(colors[key], intensities[key], Math.max(width, depth) * 2.2);
  light.position.set(0, Math.min(height, 4.5), depth * 0.12);
  group.add(light);
  const porch = new THREE.PointLight(colors[key], intensities[key] * 0.6, 6);
  porch.position.set(0, 1.95, depth / 2 + 0.6);
  group.add(porch);
}
