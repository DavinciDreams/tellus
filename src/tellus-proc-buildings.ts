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
  | "stucco";

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

export const PROCEDURAL_BUILDING_PREFIX = "building-";

export const BUILDING_MATERIAL_OPTIONS: Array<{ id: BuildingMaterialStyle; label: string }> = [
  { id: "auto", label: "Auto" },
  { id: "brick", label: "Brick" },
  { id: "stone-ashlar", label: "Ashlar" },
  { id: "stone-rubble", label: "Rubble" },
  { id: "wood-plank", label: "Plank" },
  { id: "timber-frame", label: "Timber" },
  { id: "plaster", label: "Plaster" },
  { id: "stucco", label: "Stucco" },
];

export const BUILDING_LIGHTING_OPTIONS: Array<{ id: BuildingLightingStyle; label: string }> = [
  { id: "warm", label: "Warm" },
  { id: "lantern", label: "Lantern" },
  { id: "bright", label: "Bright" },
  { id: "moonlit", label: "Moonlit" },
  { id: "none", label: "None" },
];

export const PROCEDURAL_BUILDING_CATALOG: TellusBuildingRecipe[] = [
  recipe("simple-house", "Simple House", "🏠", [5, 7], [5, 7], [1, 2], "default", "brick", 0.55, 0.2, [0, 1]),
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

export const buildProceduralBuildingModel = (
  recipeId: ProceduralBuildingType,
  seed: number,
  options: ProceduralBuildingOptions = {},
): THREE.Group | null => {
  const recipe = proceduralBuildingRecipe(recipeId);
  if (!recipe) return null;
  const rng = mulberry32(seed);
  const width = pickRange(recipe.widthRange, rng);
  const depth = pickRange(recipe.depthRange, rng);
  const floors = Math.max(1, Math.round(pickRange(recipe.floorsRange, rng)));
  const floorHeight = 2.65;
  const height = floors * floorHeight;
  const materialStyle = options.material && options.material !== "auto" ? options.material : recipe.defaultMaterial;
  const palette = materialPalette(materialStyle);
  const mats = createMaterials(palette);
  const group = new THREE.Group();
  group.name = `tellus-proc-building-${recipe.id}`;
  group.userData.proceduralBuilding = { recipeId, seed, material: materialStyle, lighting: options.lighting ?? "warm" };

  addFoundation(group, width, depth, recipe, mats);
  addBuildingBlock(group, 0, width, depth, height, mats.wall);
  addDoor(group, width, depth, recipe, mats);
  addWindows(group, width, depth, floors, recipe, mats, rng);
  addFootprintDetails(group, width, depth, height, recipe, mats, rng);
  if (options.roof !== false) addRoof(group, width, depth, height, recipe, mats, rng);
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

function materialPalette(style: Exclude<BuildingMaterialStyle, "auto">) {
  const palettes: Record<Exclude<BuildingMaterialStyle, "auto">, { wall: number; accent: number; roof: number; trim: number; foundation: number }> = {
    brick: { wall: 0x9b4f38, accent: 0x6e3329, roof: 0x5d2e2a, trim: 0xf0d2a2, foundation: 0x6d6558 },
    "stone-ashlar": { wall: 0x9b9a8f, accent: 0x77786f, roof: 0x4d5661, trim: 0xe5dfc8, foundation: 0x696b66 },
    "stone-rubble": { wall: 0x797b69, accent: 0x54594e, roof: 0x39433d, trim: 0xd8d0ad, foundation: 0x55594e },
    "wood-plank": { wall: 0x8b623f, accent: 0x5b3925, roof: 0x3c2a24, trim: 0xe2c797, foundation: 0x5b5548 },
    "timber-frame": { wall: 0xd0b78b, accent: 0x4f3324, roof: 0x56312d, trim: 0xf2e1b3, foundation: 0x665e51 },
    plaster: { wall: 0xd9caa5, accent: 0x8d7758, roof: 0x6b3b36, trim: 0x4d3828, foundation: 0x777165 },
    stucco: { wall: 0xcfc2a0, accent: 0x8a806d, roof: 0x6b4a3a, trim: 0xf0e0bd, foundation: 0x747064 },
  };
  return palettes[style];
}

function createMaterials(palette: ReturnType<typeof materialPalette>) {
  const make = (color: number, roughness = 0.72, metalness = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness, side: THREE.DoubleSide });
  return {
    wall: make(palette.wall),
    accent: make(palette.accent),
    roof: make(palette.roof, 0.8),
    trim: make(palette.trim, 0.58),
    foundation: make(palette.foundation, 0.82),
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

function addDoor(
  group: THREE.Group,
  width: number,
  depth: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
) {
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

function addWindows(
  group: THREE.Group,
  width: number,
  depth: number,
  floors: number,
  recipe: TellusBuildingRecipe,
  mats: ReturnType<typeof createMaterials>,
  rng: () => number,
) {
  const rows = Math.max(1, floors);
  const colsFront = Math.max(1, Math.floor(width / 2.4));
  const colsSide = Math.max(1, Math.floor(depth / 2.6));
  for (let floor = 0; floor < rows; floor++) {
    const y = 1.55 + floor * 2.65;
    for (let i = 0; i < colsFront; i++) {
      const x = ((i + 0.5) / colsFront - 0.5) * (width - 1.4);
      if (Math.abs(x) < 0.95 && floor === 0) continue;
      if (rng() <= recipe.windowChance) addWindow(group, x, y, depth / 2 + 0.07, 0, mats);
      if (rng() <= recipe.windowChance * 0.8) addWindow(group, x, y, -depth / 2 - 0.07, Math.PI, mats);
    }
    for (let i = 0; i < colsSide; i++) {
      const z = ((i + 0.5) / colsSide - 0.5) * (depth - 1.5);
      if (rng() <= recipe.windowChance * 0.75) addWindow(group, width / 2 + 0.07, y, z, Math.PI / 2, mats);
      if (rng() <= recipe.windowChance * 0.75) addWindow(group, -width / 2 - 0.07, y, z, -Math.PI / 2, mats);
    }
  }
}

function addWindow(
  group: THREE.Group,
  x: number,
  y: number,
  z: number,
  rotationY: number,
  mats: ReturnType<typeof createMaterials>,
) {
  const frame = new THREE.Group();
  frame.position.set(x, y, z);
  frame.rotation.y = rotationY;
  addBox(frame, [0.82, 0.72, 0.06], [0, 0, 0], mats.glass, false);
  addBox(frame, [0.98, 0.1, 0.08], [0, 0.43, 0.01], mats.trim, false);
  addBox(frame, [0.98, 0.1, 0.08], [0, -0.43, 0.01], mats.trim, false);
  addBox(frame, [0.1, 0.88, 0.08], [-0.49, 0, 0.01], mats.trim, false);
  addBox(frame, [0.1, 0.88, 0.08], [0.49, 0, 0.01], mats.trim, false);
  group.add(frame);
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
  const roofHeight = recipe.footprintStyle === "towered" || recipe.footprintStyle === "cruciform" ? 1.4 : 1.0;
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(width, depth) * 0.72, roofHeight, 4), mats.roof);
  roof.rotation.y = Math.PI / 4;
  roof.position.set(0, 0.28 + height + roofHeight / 2, 0);
  roof.scale.z = depth / width;
  addMesh(group, roof);
  if (rng() > 0.45) {
    addBox(group, [0.45, 0.9, 0.45], [width * 0.24, 0.28 + height + 0.55, depth * -0.14], mats.accent);
    addBox(group, [0.62, 0.18, 0.62], [width * 0.24, 0.28 + height + 1.08, depth * -0.14], mats.foundation);
  }
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
        const cap = new THREE.Mesh(new THREE.ConeGeometry(towerSize * 0.72, 0.9, 6), mats.roof);
        cap.position.set(x, 0.28 + height * 1.22 + 0.45, z);
        addMesh(group, cap);
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
