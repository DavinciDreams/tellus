import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import {
  ECOLOGY_BIOME_OPTIONS,
  ECOLOGY_TERRAIN_PAINT_MAP,
} from "./tellus-procplant-biomes";
import {
  entryFromProcPlantLabExport,
  genomeForMixEntry,
  labelForProcPlantId,
  makeEcologyBiomeMix,
  normalizeBiomeMixDefinition,
  saveActiveBiomeMixForWorld,
  type TellusBiomeMixDefinition,
  type TellusBiomeMixEntry,
} from "./tellus-biome-mix";
import {
  buildProcPlantObject,
  procPlantPresets,
  procPlantPresetIds,
  type ProcPlantGenome,
} from "./tellus-procplants";
import { SPECIES, type SpeciesId } from "./vendor/proc-tree/index";
import type { EcologyBiomeId } from "./tellus-ecology";
import type { TerrainPaintKind } from "./tellus-types";

const terrainSwatchColors: Record<TerrainPaintKind, [number, number]> = {
  meadow: [0x79a84a, 0x4f7c32],
  grass: [0x5f9638, 0x8dbf52],
  flowers: [0x73a948, 0xf0d0e8],
  "forest-floor": [0x3e5b2d, 0x6b4f2e],
  "jungle-moss": [0x235b35, 0x5da044],
  beach: [0xe6d09a, 0xf4e5bd],
  "desert-sand": [0xd6a15e, 0xf0c578],
  rock: [0x777b79, 0x4f5659],
  gravel: [0x8a8d83, 0xc2bca3],
  snow: [0xe7f2f5, 0xffffff],
  dirt: [0x6b4a28, 0x3f2918],
  stone: [0x8a8f91, 0xd7d2c2],
  brick: [0xb75338, 0x7f2f22],
};

const root = document.getElementById("biome-mixer-root");
if (!root) throw new Error("Missing #biome-mixer-root");

let currentMix = makeEcologyBiomeMix("taiga");
let selectedEntryId = currentMix.entries[0]?.id ?? "";
let selectedPresetId = "blueSpruce";
let selectedWeberPennSpecies = "balsamFir";
let jsonVisible = false;
let statusText = "Ready.";
const weberPennSpeciesIds = Object.keys(SPECIES).sort() as SpeciesId[];

root.innerHTML = `
  <main class="biome-page">
    <header class="biome-header">
      <div>
        <h1>Biome Mixer</h1>
        <p>Compose multi-plant communities from Tellus biomes, terrain paints, and procplants mutation JSON.</p>
      </div>
      <nav>
        <a href="/tree-lod-gallery.html">Tree Lab</a>
        <a href="/">Tellus</a>
      </nav>
    </header>
    <section class="biome-toolbar" aria-label="Biome mixer controls">
      <select id="ecology-select" class="state-select" aria-hidden="true"></select>
      <label>
        Density
        <input id="density-slider" type="range" min="0.05" max="1.8" value="0.72" step="0.01" />
        <output id="density-output">0.72</output>
      </label>
      <label>
        Diversity
        <input id="diversity-slider" type="range" min="0.1" max="1" value="0.82" step="0.01" />
        <output id="diversity-output">0.82</output>
      </label>
      <label>
        Target verts/chunk
        <input id="vertex-target-input" type="number" min="10000" max="5000000" value="250000" step="10000" />
      </label>
      <dl class="budget-stats" aria-label="Biome render budget">
        <div><dt>Rendered</dt><dd id="rendered-output">-</dd></div>
        <div><dt>Target</dt><dd id="vertex-target-output">-</dd></div>
        <div><dt>Current</dt><dd id="vertex-current-output">-</dd></div>
      </dl>
      <div class="button-row">
        <button type="button" id="import-button">Import JSON</button>
        <button type="button" id="apply-world-button">Apply World</button>
        <button type="button" id="export-button">Export Mix</button>
        <button type="button" id="json-toggle-button" aria-pressed="false">Show JSON</button>
        <input id="file-input" type="file" accept="application/json,.json" multiple hidden />
      </div>
    </section>
    <section class="swatch-board" aria-label="Biome presets">
      <h2>Biome</h2>
      <div class="swatch-grid" id="ecology-swatch-grid"></div>
    </section>
    <section class="workspace json-hidden" id="workspace">
      <aside class="entry-panel">
        <div class="panel-title">
          <h2 id="mix-title">Taiga</h2>
          <span id="mix-count">0 plants</span>
        </div>
        <div class="entry-list" id="entry-list"></div>
        <div class="entry-editor" id="entry-editor"></div>
      </aside>
      <section class="stage-panel">
        <canvas id="biome-canvas" aria-label="Biome mix preview"></canvas>
      </section>
      <aside class="json-panel">
        <div class="panel-title">
          <h2>Loader JSON</h2>
          <span id="status-output">Ready.</span>
        </div>
        <textarea id="json-output" spellcheck="false"></textarea>
      </aside>
    </section>
  </main>
`;

const style = document.createElement("style");
style.textContent = `
  :root {
    color: #07111f;
    background: #eef2f4;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 980px; background: #eef2f4; }
  .biome-page { min-height: 100vh; padding: 22px 28px 28px; }
  .biome-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
  h1, h2 { margin: 0; line-height: 1.08; }
  h1 { font-size: 32px; }
  h2 { font-size: 18px; }
  p { margin: 8px 0 0; color: #4b5563; font-size: 17px; }
  nav, .button-row, .add-row { display: flex; gap: 8px; align-items: end; }
  a, button, select {
    border: 1px solid #c6d0dc;
    border-radius: 8px;
    background: #fff;
    color: #07111f;
    font: inherit;
    font-weight: 800;
  }
  a { padding: 10px 12px; text-decoration: none; }
  button { padding: 10px 12px; cursor: pointer; }
  button.active { background: #17341f; color: #f6edbd; border-color: #8b9657; }
  select { height: 42px; padding: 0 10px; min-width: 150px; }
  label {
    display: grid;
    gap: 7px;
    color: #334155;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  input[type="range"] { width: 100%; accent-color: #335f31; }
  output { color: #07111f; font-size: 15px; text-transform: none; }
  .state-select { display: none; }
  .biome-toolbar {
    display: grid;
    grid-template-columns: minmax(150px, 1fr) minmax(150px, 1fr) 170px minmax(330px, 1.4fr) auto;
    gap: 12px;
    align-items: end;
    margin-bottom: 12px;
    padding: 12px;
    border: 1px solid #d4dbe4;
    border-radius: 8px;
    background: rgba(255,255,255,0.78);
  }
  .swatch-board {
    border: 1px solid #d4dbe4;
    border-radius: 8px;
    background: rgba(255,255,255,0.78);
    padding: 12px;
    margin-bottom: 16px;
  }
  .swatch-board h2 {
    margin-bottom: 10px;
    font-size: 14px;
    text-transform: uppercase;
    color: #334155;
  }
  .swatch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    gap: 8px;
  }
  .swatch-button {
    min-height: 42px;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 8px 10px;
    text-align: center;
  }
  .swatch-button.active { color: #f6edbd; border-color: #8b9657; }
  .swatch-label {
    font-size: 13px;
    line-height: 1.15;
    font-weight: 900;
    white-space: normal;
  }
  .swatch-button.active .swatch-label { text-shadow: 0 1px 2px rgba(0,0,0,0.4); }
  .workspace {
    display: grid;
    grid-template-columns: 330px minmax(520px, 1fr) 360px;
    gap: 16px;
    height: calc(100vh - 354px);
    min-height: 520px;
  }
  .workspace.json-hidden { grid-template-columns: 330px minmax(680px, 1fr); }
  .workspace.json-hidden .json-panel { display: none; }
  .entry-panel, .stage-panel, .json-panel {
    border: 1px solid #d4dbe4;
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
  }
  .entry-panel {
    display: grid;
    grid-template-rows: auto minmax(96px, 28vh) minmax(0, 1fr);
    min-height: 0;
  }
  .panel-title {
    min-height: 58px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 14px 16px;
    border-bottom: 1px solid #e6ebf0;
  }
  .panel-title span { color: #64748b; font-size: 13px; font-weight: 800; }
  .entry-list {
    min-height: 0;
    overflow: auto;
    border-bottom: 1px solid #e6ebf0;
  }
  .entry-card {
    width: 100%;
    display: grid;
    grid-template-columns: 24px 1fr 58px;
    gap: 10px;
    align-items: center;
    padding: 10px 12px;
    border: 0;
    border-bottom: 1px solid #edf1f5;
    border-radius: 0;
    text-align: left;
  }
  .entry-card.active { background: #eef7ed; }
  .entry-card.disabled { opacity: 0.48; }
  .plant-dot { width: 18px; height: 18px; border-radius: 50%; border: 1px solid rgba(0,0,0,0.22); }
  .entry-name { display: block; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .entry-meta { display: block; margin-top: 3px; color: #64748b; font-size: 12px; font-weight: 700; }
  .entry-score { color: #334155; font-size: 12px; font-weight: 900; text-align: right; }
  .add-row { padding: 0 0 12px; border-bottom: 1px solid #e6ebf0; }
  .add-row label { flex: 1; }
  .add-row select { width: 100%; }
  .entry-editor { min-height: 0; padding: 14px; display: grid; gap: 12px; overflow: auto; align-content: start; }
  .entry-editor .inline { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .entry-editor .danger { border-color: #e2b4aa; color: #7f1d1d; }
  .entry-editor input:not([type="range"]) {
    min-height: 38px;
    border: 1px solid #c6d0dc;
    border-radius: 8px;
    padding: 0 10px;
    font: inherit;
    font-weight: 800;
  }
  .weber-editor {
    display: grid;
    gap: 10px;
    padding: 12px;
    border: 1px solid #d7e1d2;
    border-radius: 8px;
    background: #f7fbf3;
  }
  .weber-editor h3 {
    margin: 0;
    font-size: 14px;
    line-height: 1.2;
  }
  details {
    display: grid;
    gap: 10px;
    border-top: 1px solid #dce8d7;
    padding-top: 9px;
  }
  details > summary {
    cursor: pointer;
    color: #334155;
    font-size: 12px;
    font-weight: 900;
    text-transform: uppercase;
  }
  .stage-panel { position: relative; min-height: 0; }
  #biome-canvas { width: 100%; height: 100%; display: block; background: #dfe9ee; }
  .budget-stats {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 0;
    padding: 0;
  }
  .budget-stats div {
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid rgba(21, 38, 25, 0.28);
    border-radius: 8px;
    background: rgba(246, 250, 244, 0.88);
  }
  dl div { min-width: 0; }
  dt { color: #64748b; font-size: 11px; font-weight: 900; text-transform: uppercase; }
  dd { margin: 2px 0 0; color: #07111f; font-weight: 900; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  dd.over-budget { color: #9f1239; }
  .json-panel { display: grid; grid-template-rows: auto 1fr; }
  textarea {
    width: 100%;
    min-height: 100%;
    resize: none;
    border: 0;
    padding: 14px;
    background: #0c1218;
    color: #d9f0dc;
    font: 12px/1.45 ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace;
  }
`;
document.head.appendChild(style);

const ecologySelect = document.querySelector<HTMLSelectElement>("#ecology-select")!;
const densitySlider = document.querySelector<HTMLInputElement>("#density-slider")!;
const diversitySlider = document.querySelector<HTMLInputElement>("#diversity-slider")!;
const vertexTargetInput = document.querySelector<HTMLInputElement>("#vertex-target-input")!;
const densityOutput = document.querySelector<HTMLOutputElement>("#density-output")!;
const diversityOutput = document.querySelector<HTMLOutputElement>("#diversity-output")!;
const entryList = document.querySelector<HTMLDivElement>("#entry-list")!;
const entryEditor = document.querySelector<HTMLDivElement>("#entry-editor")!;
const mixTitle = document.querySelector<HTMLHeadingElement>("#mix-title")!;
const mixCount = document.querySelector<HTMLSpanElement>("#mix-count")!;
const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const applyWorldButton = document.querySelector<HTMLButtonElement>("#apply-world-button")!;
const jsonOutput = document.querySelector<HTMLTextAreaElement>("#json-output")!;
const statusOutput = document.querySelector<HTMLSpanElement>("#status-output")!;
const renderedOutput = document.querySelector<HTMLElement>("#rendered-output")!;
const vertexTargetOutput = document.querySelector<HTMLElement>("#vertex-target-output")!;
const vertexCurrentOutput = document.querySelector<HTMLElement>("#vertex-current-output")!;
const canvas = document.querySelector<HTMLCanvasElement>("#biome-canvas")!;
const workspace = document.querySelector<HTMLElement>("#workspace")!;
const ecologySwatchGrid = document.querySelector<HTMLDivElement>("#ecology-swatch-grid")!;
const jsonToggleButton = document.querySelector<HTMLButtonElement>("#json-toggle-button")!;

ecologySelect.innerHTML = ECOLOGY_BIOME_OPTIONS.map(
  (id) => `<option value="${id}">${labelForProcPlantId(id)}</option>`,
).join("");
ecologySelect.value = currentMix.ecologyBiome ?? "taiga";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe9ee);
scene.fog = new THREE.Fog(0xdfe9ee, 65, 190);
const camera = new THREE.PerspectiveCamera(48, 1, 0.1, 400);
camera.position.set(34, 28, 42);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 4, 0);
controls.enableDamping = true;
controls.maxDistance = 140;

scene.add(new THREE.HemisphereLight(0xffffff, 0x8a876f, 1.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(28, 48, 22);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(120, 120, 24, 24),
  new THREE.MeshLambertMaterial({ color: 0x8ab36a }),
);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const groundMaterial = ground.material as THREE.MeshLambertMaterial;

const previewGroup = new THREE.Group();
scene.add(previewGroup);

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (mesh.geometry) mesh.geometry.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose?.();
  });
};

const colorForEntry = (entry: TellusBiomeMixEntry): number => {
  const genome = genomeForMixEntry(entry);
  return genome.flower?.color ?? genome.leaf.colorA ?? 0x4f7a39;
};

const updateStatus = (message: string) => {
  statusText = message;
  statusOutput.textContent = message;
};

const formatCount = (value: number): string =>
  value >= 1000000
    ? `${(value / 1000000).toFixed(2)}m`
    : value >= 1000
      ? `${Math.round(value / 1000)}k`
      : String(Math.round(value));

const activeTellusWorldId = (): string => {
  try {
    return window.localStorage.getItem("tellus.activeWorldId")?.trim() || "main";
  } catch {
    return "main";
  }
};

const activeTerrainPaint = (): TerrainPaintKind =>
  currentMix.terrainPaint ?? (currentMix.ecologyBiome ? ECOLOGY_TERRAIN_PAINT_MAP[currentMix.ecologyBiome] : "grass");

const colorCss = (value: number): string => `#${value.toString(16).padStart(6, "0").slice(-6)}`;

const swatchStyle = (biome: EcologyBiomeId): string => {
  const [a, b] = terrainSwatchColors[ECOLOGY_TERRAIN_PAINT_MAP[biome]];
  return `background: linear-gradient(135deg, ${colorCss(a)}, ${colorCss(b)});`;
};

const updatePreviewTerrain = () => {
  const paint = activeTerrainPaint();
  const [a, b] = terrainSwatchColors[paint];
  groundMaterial.color.set(a).lerp(new THREE.Color(b), 0.34);
  groundMaterial.needsUpdate = true;
};

const geometryVertexCount = (object: THREE.Object3D): number => {
  let total = 0;
  object.traverse((child) => {
    const geometry = (child as THREE.Mesh).geometry;
    const position = geometry?.getAttribute("position");
    if (position) total += position.count;
  });
  return total;
};

const selectedEntry = () => currentMix.entries.find((entry) => entry.id === selectedEntryId) ?? currentMix.entries[0];

const renderSwatches = () => {
  ecologySwatchGrid.innerHTML = ECOLOGY_BIOME_OPTIONS.map((id) => {
    return `
      <button type="button" class="swatch-button ${currentMix.ecologyBiome === id ? "active" : ""}" data-ecology="${id}" style="${swatchStyle(id)}">
        <span class="swatch-label">${labelForProcPlantId(id)}</span>
      </button>
    `;
  }).join("");
  ecologySwatchGrid.querySelectorAll<HTMLButtonElement>("[data-ecology]").forEach((button) => {
    button.addEventListener("click", () => loadEcologyBiome(button.dataset.ecology as EcologyBiomeId));
  });
};

const cloneGenome = (genome: ProcPlantGenome): ProcPlantGenome =>
  typeof structuredClone === "function"
    ? structuredClone(genome)
    : JSON.parse(JSON.stringify(genome)) as ProcPlantGenome;

const templatePresetForSpecies = (species: SpeciesId): string => {
  const id = species.toLowerCase();
  if (id.includes("fir") || id.includes("pine")) return "blueSpruce";
  if (id.includes("douglas") || id.includes("larch")) return "redwoodSpire";
  if (id.includes("birch") || id.includes("aspen") || id.includes("poplar")) return "birchGrove";
  if (id.includes("palm")) return "foldedPalm";
  if (id.includes("bamboo")) return "bambooClump";
  if (id.includes("tupelo")) return "mangroveRoots";
  if (id.includes("sassafras")) return "acaciaUmbrella";
  return "oakCanopy";
};

const makeWeberPennGenome = (species: SpeciesId, seed: number): ProcPlantGenome => {
  const base = cloneGenome(procPlantPresets[templatePresetForSpecies(species)] ?? procPlantPresets.oakCanopy);
  const conifer = /fir|pine|douglas|larch/i.test(species);
  const palm = /palm/i.test(species);
  const bamboo = /bamboo/i.test(species);
  base.id = `weberPenn-${species}`;
  base.habit = conifer ? "conifer" : palm ? "palm" : bamboo ? "grass" : "tree";
  base.weberPenn = {
    species,
    maxBranchDepth: base.weberPenn?.maxBranchDepth ?? 3,
    maxStems: base.weberPenn?.maxStems ?? (conifer ? 96 : 80),
    maxLeaves: base.weberPenn?.maxLeaves ?? (conifer ? 220 : 190),
    leafScaleMultiplier: base.weberPenn?.leafScaleMultiplier ?? (conifer ? 4.2 : 3.2),
    radialSegments: base.weberPenn?.radialSegments ?? 4,
    branchSamples: base.weberPenn?.branchSamples ?? 2,
    barkColor: base.weberPenn?.barkColor ?? (palm ? 0x7a5630 : 0x5d4327),
    leafColor: base.weberPenn?.leafColor ?? base.leaf.colorA,
    nativeLeaves: base.weberPenn?.nativeLeaves ?? true,
    crownFill: base.weberPenn?.crownFill ?? false,
    foliageSource: base.weberPenn?.foliageSource ?? "species",
    fillAnchor: base.weberPenn?.fillAnchor ?? "leaf-sites",
  };
  base.foliage = {
    mass: base.foliage?.mass ?? 0,
    clusterDensity: base.foliage?.clusterDensity ?? (conifer ? 1.08 : 1.12),
    whorlDensity: base.foliage?.whorlDensity ?? (conifer ? 0.58 : 0.48),
    tipBias: base.foliage?.tipBias ?? (conifer ? 0.34 : 0.62),
    size: base.foliage?.size ?? (conifer ? 0.32 : 0.54),
  };
  base.treeRealism = {
    crownSpread: base.treeRealism?.crownSpread ?? (conifer ? 0.36 : 0.72),
    crownTaper: base.treeRealism?.crownTaper ?? (conifer ? 0.9 : 0.34),
    trunkFlare: base.treeRealism?.trunkFlare ?? 0.34,
    trunkBend: base.treeRealism?.trunkBend ?? 0.14,
    branchGnarl: base.treeRealism?.branchGnarl ?? 0.22,
    windFlex: base.treeRealism?.windFlex ?? 0.48,
    colorVariance: base.treeRealism?.colorVariance ?? 0.14,
  };
  base.phyllotaxisAngle += (seed % 17) * 0.0003;
  return base;
};

const makeWeberPennEntry = (species: SpeciesId): TellusBiomeMixEntry => {
  const seed = currentMix.seed ^ ((currentMix.entries.length + 1) * 0x45d9f3b);
  const genome = makeWeberPennGenome(species, seed);
  return {
    id: `weber-penn-${species}-${Date.now().toString(36)}`,
    label: labelForProcPlantId(species),
    source: "mutation",
    genome,
    weight: 1,
    density: 0.18,
    scale: /fir|pine|douglas|larch/i.test(species) ? 12 : 10,
    environment: currentMix.entries[0]?.environment ?? { light: 0.74, moisture: 0.56, crowding: 0.3, biomeWarmth: 0.52 },
    seed,
    enabled: true,
  };
};

const editableGenomeForEntry = (entry: TellusBiomeMixEntry): ProcPlantGenome => {
  if (!entry.genome) {
    entry.genome = cloneGenome(genomeForMixEntry(entry));
    entry.source = "mutation";
  }
  return entry.genome;
};

const weberFoliageMode = (genome: ProcPlantGenome): "plain" | "procplants" | "conifer" | "mixed" => {
  const nativeLeaves = genome.weberPenn?.nativeLeaves !== false;
  const crownFill = genome.weberPenn?.crownFill === true ||
    (genome.weberPenn?.crownFill === undefined && Boolean(genome.weberPenn?.foliageSource && genome.weberPenn.foliageSource !== "species"));
  const mass = crownFill ? genome.foliage?.mass ?? 0 : 0;
  const source = genome.weberPenn?.foliageSource ?? "species";
  if (nativeLeaves && mass <= 0.001) return "plain";
  if (!nativeLeaves && mass > 0.001 && source === "procplants") return "procplants";
  if (!nativeLeaves && mass > 0.001 && source === "conifer-spray") return "conifer";
  return "mixed";
};

const applyWeberFoliageMode = (
  genome: ProcPlantGenome,
  mode: "plain" | "procplants" | "conifer" | "mixed",
) => {
  genome.weberPenn = genome.weberPenn ?? { species: "balsamFir" as SpeciesId };
  genome.foliage = genome.foliage ?? { mass: 0, clusterDensity: 1.1, whorlDensity: 0.55, tipBias: 0.5, size: 0.4 };
  if (mode === "plain") {
    genome.weberPenn.nativeLeaves = true;
    genome.weberPenn.crownFill = false;
    genome.weberPenn.foliageSource = "species";
    genome.foliage.mass = 0;
    return;
  }
  if (mode === "procplants") {
    genome.weberPenn.nativeLeaves = false;
    genome.weberPenn.crownFill = true;
    genome.weberPenn.foliageSource = "procplants";
    genome.weberPenn.fillAnchor = genome.weberPenn.fillAnchor ?? "leaf-sites";
    genome.foliage.mass = Math.max(0.45, genome.foliage.mass);
    genome.foliage.clusterDensity = Math.min(genome.foliage.clusterDensity, 1.35);
    genome.foliage.size = Math.min(genome.foliage.size ?? 0.5, 0.58);
    return;
  }
  if (mode === "conifer") {
    genome.weberPenn.nativeLeaves = false;
    genome.weberPenn.crownFill = true;
    genome.weberPenn.foliageSource = "conifer-spray";
    genome.weberPenn.fillAnchor = genome.weberPenn.fillAnchor ?? "leaf-sites";
    genome.foliage.mass = Math.max(0.42, genome.foliage.mass);
    genome.foliage.clusterDensity = Math.min(genome.foliage.clusterDensity, 1.25);
    genome.foliage.whorlDensity = Math.min(genome.foliage.whorlDensity, 0.72);
    genome.foliage.size = Math.min(genome.foliage.size ?? 0.34, 0.38);
  }
};

const addPresetEntry = () => {
  const id = selectedPresetId;
  const genome = genomeForMixEntry({
    id,
    label: id,
    source: "preset",
    presetId: id,
    weight: 1,
    density: 0.45,
    scale: 1,
    environment: currentMix.entries[0]?.environment ?? { light: 0.8, moisture: 0.55, crowding: 0.32, biomeWarmth: 0.62 },
    seed: currentMix.seed ^ currentMix.entries.length,
    enabled: true,
  });
  const entry: TellusBiomeMixEntry = {
    id: `${id}-${Date.now().toString(36)}`,
    label: labelForProcPlantId(id),
    source: "preset",
    presetId: id,
    weight: 1,
    density: 0.45,
    scale: genome.habit === "tree" || genome.habit === "conifer" || genome.habit === "palm" ? 8 : 1,
    environment: currentMix.entries[0]?.environment ?? { light: 0.8, moisture: 0.55, crowding: 0.32, biomeWarmth: 0.62 },
    seed: currentMix.seed ^ ((currentMix.entries.length + 1) * 0x9e37),
    enabled: true,
  };
  currentMix.entries.push(entry);
  selectedEntryId = entry.id;
  updateStatus(`Added ${entry.label}.`);
  renderUi();
  rebuildPreview();
};

const addWeberPennEntry = () => {
  const entry = makeWeberPennEntry(selectedWeberPennSpecies as SpeciesId);
  currentMix.entries.push(entry);
  selectedEntryId = entry.id;
  updateStatus(`Added Weber/Penn ${entry.label}.`);
  renderUi();
  rebuildPreview();
};

const bindAddControls = () => {
  const presetSelect = entryEditor.querySelector<HTMLSelectElement>("#preset-select")!;
  const weberPennSelect = entryEditor.querySelector<HTMLSelectElement>("#weber-penn-select")!;
  presetSelect.innerHTML = procPlantPresetIds.map(
    (id) => `<option value="${id}">${labelForProcPlantId(id)}</option>`,
  ).join("");
  presetSelect.value = selectedPresetId;
  weberPennSelect.innerHTML = weberPennSpeciesIds.map(
    (id) => `<option value="${id}">${labelForProcPlantId(id)}</option>`,
  ).join("");
  weberPennSelect.value = selectedWeberPennSpecies;
  presetSelect.addEventListener("change", () => {
    selectedPresetId = presetSelect.value;
  });
  weberPennSelect.addEventListener("change", () => {
    selectedWeberPennSpecies = weberPennSelect.value;
  });
  entryEditor.querySelector<HTMLButtonElement>("#add-preset-button")!.addEventListener("click", addPresetEntry);
  entryEditor.querySelector<HTMLButtonElement>("#add-weber-penn-button")!.addEventListener("click", addWeberPennEntry);
};

const toHexColor = (value: number | undefined, fallback: number): string =>
  `#${(value ?? fallback).toString(16).padStart(6, "0").slice(-6)}`;

const fromHexColor = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizedEnabledEntries = () => {
  const enabled = currentMix.entries
    .filter((entry) => entry.enabled && entry.weight > 0)
    .sort((a, b) => b.weight - a.weight);
  const count = Math.max(1, Math.ceil(enabled.length * currentMix.diversity));
  return enabled.slice(0, count);
};

const renderEntryList = () => {
  const enabled = currentMix.entries.filter((entry) => entry.enabled).length;
  mixTitle.textContent = currentMix.label;
  mixCount.textContent = `${enabled}/${currentMix.entries.length} enabled`;
  entryList.innerHTML = currentMix.entries.map((entry) => `
    <button type="button" class="entry-card ${entry.id === selectedEntryId ? "active" : ""} ${entry.enabled ? "" : "disabled"}" data-entry-id="${entry.id}">
      <span class="plant-dot" style="background:#${colorForEntry(entry).toString(16).padStart(6, "0")}"></span>
      <span>
        <span class="entry-name">${entry.label}</span>
        <span class="entry-meta">${entry.source}${entry.presetId ? ` / ${entry.presetId}` : ""}</span>
      </span>
      <span class="entry-score">w ${entry.weight.toFixed(2)}</span>
    </button>
  `).join("");
  entryList.querySelectorAll<HTMLButtonElement>(".entry-card").forEach((button) => {
    button.addEventListener("click", () => {
      selectedEntryId = button.dataset.entryId ?? selectedEntryId;
      renderUi();
      rebuildPreview();
    });
  });
};

const renderEntryEditor = () => {
  const entry = selectedEntry();
  if (!entry) {
    entryEditor.innerHTML = "<p>No plants in this mix yet.</p>";
    return;
  }
  const previewGenome = genomeForMixEntry(entry);
  const weberPenn = previewGenome.weberPenn;
  const foliage = previewGenome.foliage;
  const realism = previewGenome.treeRealism;
  const foliageMode = weberFoliageMode(previewGenome);
  const fillMass = foliageMode === "plain" ? 0 : foliage?.mass ?? 0;
  const fillSize = foliage?.size ?? (previewGenome.habit === "conifer" ? 0.34 : 0.54);
  entryEditor.innerHTML = `
    <div class="add-row">
      <label>
        Add preset
        <select id="preset-select"></select>
      </label>
      <button type="button" id="add-preset-button">Add</button>
    </div>
    <div class="add-row">
      <label>
        Add Weber/Penn
        <select id="weber-penn-select"></select>
      </label>
      <button type="button" id="add-weber-penn-button">Add</button>
    </div>
    <label>
      Label
      <input id="entry-label" value="${entry.label.replace(/"/g, "&quot;")}" />
    </label>
    <div class="inline">
      <label>
        Weight
        <input id="entry-weight" type="range" min="0" max="6" value="${entry.weight}" step="0.05" />
        <output>${entry.weight.toFixed(2)}</output>
      </label>
      <label>
        Density
        <input id="entry-density" type="range" min="0.02" max="1.4" value="${entry.density}" step="0.01" />
        <output>${entry.density.toFixed(2)}</output>
      </label>
    </div>
    <div class="inline">
      <label>
        Scale
        <input id="entry-scale" type="range" min="0.2" max="24" value="${entry.scale}" step="0.1" />
        <output>${entry.scale.toFixed(1)}</output>
      </label>
      <label>
        Enabled
        <select id="entry-enabled">
          <option value="true" ${entry.enabled ? "selected" : ""}>Enabled</option>
          <option value="false" ${entry.enabled ? "" : "selected"}>Disabled</option>
        </select>
      </label>
    </div>
    ${weberPenn ? `
      <section class="weber-editor">
        <h3>Weber/Penn Tree Traits</h3>
        <label>
          Species
          <select id="weber-species">
            ${weberPennSpeciesIds.map((id) => `<option value="${id}" ${id === weberPenn.species ? "selected" : ""}>${labelForProcPlantId(id)}</option>`).join("")}
          </select>
        </label>
        <label>
          Foliage mode
          <select id="weber-foliage-mode">
            <option value="plain" ${foliageMode === "plain" ? "selected" : ""}>Plain W/P leaves</option>
            <option value="procplants" ${foliageMode === "procplants" ? "selected" : ""}>Procplants fill only</option>
            <option value="conifer" ${foliageMode === "conifer" ? "selected" : ""}>Conifer fill only</option>
            <option value="mixed" ${foliageMode === "mixed" ? "selected" : ""}>Custom mixed</option>
          </select>
        </label>
        <details open>
          <summary>Structure</summary>
        <div class="inline">
          <label>
            Branch depth
            <input id="weber-depth" type="range" min="1" max="5" value="${weberPenn.maxBranchDepth ?? 3}" step="1" />
            <output>${weberPenn.maxBranchDepth ?? 3}</output>
          </label>
          <label>
            Max stems
            <input id="weber-stems" type="range" min="12" max="180" value="${weberPenn.maxStems ?? 96}" step="1" />
            <output>${weberPenn.maxStems ?? 96}</output>
          </label>
        </div>
        <div class="inline">
          <label>
            Max leaves
            <input id="weber-leaves" type="range" min="0" max="420" value="${weberPenn.maxLeaves ?? 220}" step="1" />
            <output>${weberPenn.maxLeaves ?? 220}</output>
          </label>
          <label>
            Leaf size
            <input id="weber-leaf-scale" type="range" min="0.5" max="8" value="${weberPenn.leafScaleMultiplier ?? 3.2}" step="0.05" />
            <output>${(weberPenn.leafScaleMultiplier ?? 3.2).toFixed(2)}</output>
          </label>
        </div>
        <div class="inline">
          <label>
            Branch samples
            <input id="weber-branch-samples" type="range" min="1" max="5" value="${weberPenn.branchSamples ?? 2}" step="1" />
            <output>${weberPenn.branchSamples ?? 2}</output>
          </label>
          <label>
            Radial segments
            <input id="weber-radial" type="range" min="3" max="8" value="${weberPenn.radialSegments ?? 4}" step="1" />
            <output>${weberPenn.radialSegments ?? 4}</output>
          </label>
        </div>
        </details>
        <details open>
          <summary>Leaves & Crown</summary>
        <div class="inline">
          <label>
            Native leaves
            <select id="weber-native-leaves">
              <option value="true" ${weberPenn.nativeLeaves === false ? "" : "selected"}>On</option>
              <option value="false" ${weberPenn.nativeLeaves === false ? "selected" : ""}>Off</option>
            </select>
          </label>
          <label>
            Crown fill
            <select id="weber-foliage-source">
              <option value="species" ${(weberPenn.foliageSource ?? "species") === "species" ? "selected" : ""}>W/P leaf shape</option>
              <option value="procplants" ${weberPenn.foliageSource === "procplants" ? "selected" : ""}>Procplants leaf</option>
              <option value="conifer-spray" ${weberPenn.foliageSource === "conifer-spray" ? "selected" : ""}>Conifer spray</option>
            </select>
          </label>
        </div>
        <div class="inline">
          <label>
            Fill mass
            <input id="foliage-mass" type="range" min="0" max="2" value="${fillMass}" step="0.01" />
            <output>${fillMass.toFixed(2)}</output>
          </label>
          <label>
            Fill density
            <input id="foliage-clusters" type="range" min="0.2" max="2.4" value="${foliage?.clusterDensity ?? 1.2}" step="0.01" />
            <output>${(foliage?.clusterDensity ?? 1.2).toFixed(2)}</output>
          </label>
        </div>
        <div class="inline">
          <label>
            Foliage spread
            <input id="foliage-spread" type="range" min="0" max="1.6" value="${foliage?.whorlDensity ?? 0.6}" step="0.01" />
            <output>${(foliage?.whorlDensity ?? 0.6).toFixed(2)}</output>
          </label>
          <label>
            Tip bias
            <input id="foliage-tip" type="range" min="0" max="1" value="${foliage?.tipBias ?? 0.5}" step="0.01" />
            <output>${(foliage?.tipBias ?? 0.5).toFixed(2)}</output>
          </label>
        </div>
        <div class="inline">
          <label>
            Fill anchor
            <select id="weber-fill-anchor">
              <option value="leaf-sites" ${(weberPenn.fillAnchor ?? "leaf-sites") === "leaf-sites" ? "selected" : ""}>W/P leaf sites</option>
              <option value="branch-tips" ${weberPenn.fillAnchor === "branch-tips" ? "selected" : ""}>Branch tips</option>
            </select>
          </label>
          <label>
            Fill size
            <input id="foliage-size" type="range" min="0.05" max="1.5" value="${fillSize}" step="0.01" />
            <output>${fillSize.toFixed(2)}</output>
          </label>
        </div>
        </details>
        <details>
          <summary>Realism & Colors</summary>
        <div class="inline">
          <label>
            Crown spread
            <input id="realism-spread" type="range" min="0" max="1.4" value="${realism?.crownSpread ?? 0.6}" step="0.01" />
            <output>${(realism?.crownSpread ?? 0.6).toFixed(2)}</output>
          </label>
          <label>
            Crown taper
            <input id="realism-taper" type="range" min="0" max="1.2" value="${realism?.crownTaper ?? 0.5}" step="0.01" />
            <output>${(realism?.crownTaper ?? 0.5).toFixed(2)}</output>
          </label>
        </div>
        <div class="inline">
          <label>
            Trunk bend
            <input id="realism-bend" type="range" min="0" max="0.8" value="${realism?.trunkBend ?? 0.14}" step="0.01" />
            <output>${(realism?.trunkBend ?? 0.14).toFixed(2)}</output>
          </label>
          <label>
            Branch gnarl
            <input id="realism-gnarl" type="range" min="0" max="0.8" value="${realism?.branchGnarl ?? 0.2}" step="0.01" />
            <output>${(realism?.branchGnarl ?? 0.2).toFixed(2)}</output>
          </label>
        </div>
        <div class="inline">
          <label>
            Bark color
            <input id="weber-bark-color" type="color" value="${toHexColor(weberPenn.barkColor, 0x5d4327)}" />
          </label>
          <label>
            Leaf color
            <input id="weber-leaf-color" type="color" value="${toHexColor(weberPenn.leafColor, previewGenome.leaf.colorA)}" />
          </label>
        </div>
        </details>
      </section>
    ` : ""}
    <button type="button" class="danger" id="remove-entry">Remove Plant</button>
  `;
  bindAddControls();
  const bindNumber = (selector: string, key: "weight" | "density" | "scale") => {
    const input = entryEditor.querySelector<HTMLInputElement>(selector)!;
    const output = input.nextElementSibling as HTMLOutputElement;
    input.addEventListener("input", () => {
      entry[key] = Number(input.value);
      output.textContent = key === "scale" ? entry[key].toFixed(1) : entry[key].toFixed(2);
      renderJson();
      renderEntryList();
      rebuildPreview();
    });
  };
  bindNumber("#entry-weight", "weight");
  bindNumber("#entry-density", "density");
  bindNumber("#entry-scale", "scale");
  entryEditor.querySelector<HTMLInputElement>("#entry-label")!.addEventListener("input", (event) => {
    entry.label = (event.currentTarget as HTMLInputElement).value || entry.label;
    renderJson();
    renderEntryList();
  });
  entryEditor.querySelector<HTMLSelectElement>("#entry-enabled")!.addEventListener("change", (event) => {
    entry.enabled = (event.currentTarget as HTMLSelectElement).value === "true";
    renderJson();
    renderEntryList();
    rebuildPreview();
  });
  entryEditor.querySelector<HTMLButtonElement>("#remove-entry")!.addEventListener("click", () => {
    currentMix.entries = currentMix.entries.filter((item) => item.id !== entry.id);
    selectedEntryId = currentMix.entries[0]?.id ?? "";
    renderUi();
    rebuildPreview();
  });
  if (weberPenn) {
    const updateTree = (fn: (genome: ProcPlantGenome) => void, options: { renderList?: boolean; renderEditor?: boolean } = {}) => {
      const genome = editableGenomeForEntry(entry);
      genome.weberPenn = genome.weberPenn ?? { species: weberPenn.species };
      genome.foliage = genome.foliage ?? { mass: 0, clusterDensity: 1.2, whorlDensity: 0.6, tipBias: 0.5, size: 0.5 };
      genome.treeRealism = genome.treeRealism ?? {
        crownSpread: 0.6,
        crownTaper: 0.5,
        trunkFlare: 0.34,
        trunkBend: 0.14,
        branchGnarl: 0.2,
        windFlex: 0.48,
        colorVariance: 0.14,
      };
      fn(genome);
      renderJson();
      if (options.renderList) renderEntryList();
      if (options.renderEditor) renderEntryEditor();
      rebuildPreview();
    };
    const bindTreeNumber = (
      selector: string,
      format: (value: number) => string,
      update: (genome: ProcPlantGenome, value: number) => void,
    ) => {
      const input = entryEditor.querySelector<HTMLInputElement>(selector)!;
      const output = input.nextElementSibling as HTMLOutputElement;
      input.addEventListener("input", () => {
        const value = Number(input.value);
        output.textContent = format(value);
        updateTree((genome) => update(genome, value));
      });
    };
    entryEditor.querySelector<HTMLSelectElement>("#weber-species")!.addEventListener("change", (event) => {
      const species = (event.currentTarget as HTMLSelectElement).value as SpeciesId;
      updateTree((genome) => {
        const fresh = makeWeberPennGenome(species, entry.seed);
        genome.id = fresh.id;
        genome.habit = fresh.habit;
        genome.weberPenn = { ...fresh.weberPenn, ...genome.weberPenn, species };
        entry.label = labelForProcPlantId(species);
      }, { renderList: true, renderEditor: true });
    });
    bindTreeNumber("#weber-depth", (v) => String(Math.round(v)), (genome, value) => { genome.weberPenn!.maxBranchDepth = Math.round(value); });
    bindTreeNumber("#weber-stems", (v) => String(Math.round(v)), (genome, value) => { genome.weberPenn!.maxStems = Math.round(value); });
    bindTreeNumber("#weber-leaves", (v) => String(Math.round(v)), (genome, value) => { genome.weberPenn!.maxLeaves = Math.round(value); });
    bindTreeNumber("#weber-leaf-scale", (v) => v.toFixed(2), (genome, value) => { genome.weberPenn!.leafScaleMultiplier = value; });
    bindTreeNumber("#weber-branch-samples", (v) => String(Math.round(v)), (genome, value) => { genome.weberPenn!.branchSamples = Math.round(value); });
    bindTreeNumber("#weber-radial", (v) => String(Math.round(v)), (genome, value) => { genome.weberPenn!.radialSegments = Math.round(value); });
    entryEditor.querySelector<HTMLSelectElement>("#weber-foliage-mode")!.addEventListener("change", (event) => {
      updateTree((genome) => {
        applyWeberFoliageMode(
          genome,
          (event.currentTarget as HTMLSelectElement).value as "plain" | "procplants" | "conifer" | "mixed",
        );
      }, { renderEditor: true });
    });
    entryEditor.querySelector<HTMLSelectElement>("#weber-native-leaves")!.addEventListener("change", (event) => {
      updateTree((genome) => { genome.weberPenn!.nativeLeaves = (event.currentTarget as HTMLSelectElement).value === "true"; });
    });
    entryEditor.querySelector<HTMLSelectElement>("#weber-foliage-source")!.addEventListener("change", (event) => {
      updateTree((genome) => {
        const source = (event.currentTarget as HTMLSelectElement).value as "species" | "procplants" | "conifer-spray";
        genome.weberPenn!.foliageSource = source;
        genome.weberPenn!.crownFill = source !== "species";
        genome.weberPenn!.fillAnchor = genome.weberPenn!.fillAnchor ?? "leaf-sites";
        if (source !== "species" && (genome.foliage!.mass ?? 0) <= 0.001) {
          genome.foliage!.mass = source === "conifer-spray" ? 0.55 : 0.35;
        }
      }, { renderEditor: true });
    });
    entryEditor.querySelector<HTMLSelectElement>("#weber-fill-anchor")!.addEventListener("change", (event) => {
      updateTree((genome) => { genome.weberPenn!.fillAnchor = (event.currentTarget as HTMLSelectElement).value as "leaf-sites" | "branch-tips"; });
    });
    bindTreeNumber("#foliage-mass", (v) => v.toFixed(2), (genome, value) => {
      genome.foliage!.mass = value;
      genome.weberPenn!.crownFill = value > 0.001;
      if (value <= 0.001 && genome.weberPenn!.foliageSource !== "species") {
        genome.weberPenn!.foliageSource = "species";
      }
    });
    bindTreeNumber("#foliage-clusters", (v) => v.toFixed(2), (genome, value) => { genome.foliage!.clusterDensity = value; });
    bindTreeNumber("#foliage-spread", (v) => v.toFixed(2), (genome, value) => { genome.foliage!.whorlDensity = value; });
    bindTreeNumber("#foliage-tip", (v) => v.toFixed(2), (genome, value) => { genome.foliage!.tipBias = value; });
    bindTreeNumber("#foliage-size", (v) => v.toFixed(2), (genome, value) => { genome.foliage!.size = value; });
    bindTreeNumber("#realism-spread", (v) => v.toFixed(2), (genome, value) => { genome.treeRealism!.crownSpread = value; });
    bindTreeNumber("#realism-taper", (v) => v.toFixed(2), (genome, value) => { genome.treeRealism!.crownTaper = value; });
    bindTreeNumber("#realism-bend", (v) => v.toFixed(2), (genome, value) => { genome.treeRealism!.trunkBend = value; });
    bindTreeNumber("#realism-gnarl", (v) => v.toFixed(2), (genome, value) => { genome.treeRealism!.branchGnarl = value; });
    entryEditor.querySelector<HTMLInputElement>("#weber-bark-color")!.addEventListener("input", (event) => {
      updateTree((genome) => { genome.weberPenn!.barkColor = fromHexColor((event.currentTarget as HTMLInputElement).value, 0x5d4327); }, { renderList: true });
    });
    entryEditor.querySelector<HTMLInputElement>("#weber-leaf-color")!.addEventListener("input", (event) => {
      updateTree((genome) => {
        const color = fromHexColor((event.currentTarget as HTMLInputElement).value, genome.leaf.colorA);
        genome.weberPenn!.leafColor = color;
        genome.leaf.colorA = color;
      }, { renderList: true });
    });
  }
};

const renderJson = () => {
  densityOutput.textContent = currentMix.density.toFixed(2);
  diversityOutput.textContent = currentMix.diversity.toFixed(2);
  densitySlider.value = String(currentMix.density);
  diversitySlider.value = String(currentMix.diversity);
  vertexTargetInput.value = String(currentMix.targetVerticesPerChunk);
  jsonOutput.value = JSON.stringify(currentMix, null, 2);
  statusOutput.textContent = statusText;
  vertexTargetOutput.textContent = formatCount(currentMix.targetVerticesPerChunk);
  workspace.classList.toggle("json-hidden", !jsonVisible);
  jsonToggleButton.textContent = jsonVisible ? "Hide JSON" : "Show JSON";
  jsonToggleButton.setAttribute("aria-pressed", jsonVisible ? "true" : "false");
};

const renderUi = () => {
  updatePreviewTerrain();
  renderSwatches();
  renderEntryList();
  renderEntryEditor();
  renderJson();
};

const hash01 = (value: number) => {
  const x = Math.sin(value * 12.9898) * 43758.5453;
  return x - Math.floor(x);
};

const rebuildPreview = () => {
  while (previewGroup.children.length) {
    const child = previewGroup.children.pop();
    if (child) {
      previewGroup.remove(child);
      disposeObject(child);
    }
  }
  const enabled = normalizedEnabledEntries();
  const weightTotal = enabled.reduce((sum, entry) => sum + Math.max(0.01, entry.weight), 0) || 1;
  let rendered = 0;
  let currentVertices = 0;
  enabled.forEach((entry, entryIndex) => {
    const genome = genomeForMixEntry(entry);
    const prototype = buildProcPlantObject(genome, entry.seed, entry.environment);
    const verticesPerPlant = geometryVertexCount(prototype);
    const share = Math.max(0.01, entry.weight) / weightTotal;
    const habitCap = genome.habit === "tree" || genome.habit === "conifer" || genome.habit === "palm" ? 12 : 36;
    const count = Math.max(1, Math.min(habitCap, Math.round(70 * currentMix.density * entry.density * share)));
    currentVertices += verticesPerPlant * count;
    for (let i = 0; i < count; i++) {
      const instance = i === 0 ? prototype : prototype.clone(true);
      const n = rendered + i + entry.seed + entryIndex * 97;
      const radius = 7 + Math.sqrt(hash01(n)) * 46;
      const angle = hash01(n + 31) * Math.PI * 2;
      const x = Math.sin(angle) * radius;
      const z = Math.cos(angle) * radius;
      const slopeY = Math.max(0, z + 40) * 0.035;
      const jitter = 0.82 + hash01(n + 71) * 0.42;
      instance.position.set(x, slopeY, z);
      instance.rotation.y = hash01(n + 131) * Math.PI * 2;
      instance.scale.setScalar(entry.scale * jitter);
      previewGroup.add(instance);
    }
    rendered += count;
  });
  renderedOutput.textContent = String(rendered);
  vertexCurrentOutput.textContent = `${formatCount(currentVertices)} (${Math.round((currentVertices / Math.max(1, currentMix.targetVerticesPerChunk)) * 100)}%)`;
  vertexCurrentOutput.classList.toggle("over-budget", currentVertices > currentMix.targetVerticesPerChunk);
};

const loadEcologyBiome = (biome: EcologyBiomeId) => {
  currentMix = makeEcologyBiomeMix(biome, currentMix.seed);
  ecologySelect.value = biome;
  selectedEntryId = currentMix.entries[0]?.id ?? "";
  updateStatus(`Loaded ${currentMix.label}.`);
  renderUi();
  rebuildPreview();
};

ecologySelect.addEventListener("change", () => {
  loadEcologyBiome(ecologySelect.value as EcologyBiomeId);
});

densitySlider.addEventListener("input", () => {
  currentMix.density = Number(densitySlider.value);
  renderJson();
  rebuildPreview();
});

diversitySlider.addEventListener("input", () => {
  currentMix.diversity = Number(diversitySlider.value);
  renderJson();
  rebuildPreview();
});

vertexTargetInput.addEventListener("input", () => {
  currentMix.targetVerticesPerChunk = Math.max(1, Number(vertexTargetInput.value) || 250000);
  renderJson();
  rebuildPreview();
});

jsonToggleButton.addEventListener("click", () => {
  jsonVisible = !jsonVisible;
  renderJson();
  resize();
});

document.querySelector<HTMLButtonElement>("#import-button")!.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files ?? []);
  let imported = 0;
  for (const file of files) {
    const raw = JSON.parse(await file.text()) as unknown;
    const mix = normalizeBiomeMixDefinition(raw);
    if (mix) {
      currentMix = mix;
      selectedEntryId = currentMix.entries[0]?.id ?? "";
      imported++;
      continue;
    }
    const entry = entryFromProcPlantLabExport(raw, file.name);
    if (entry) {
      currentMix.entries.push(entry);
      selectedEntryId = entry.id;
      imported++;
    }
  }
  fileInput.value = "";
  updateStatus(imported ? `Imported ${imported} JSON file${imported === 1 ? "" : "s"}.` : "No compatible JSON found.");
  renderUi();
  rebuildPreview();
});

applyWorldButton.addEventListener("click", () => {
  const worldId = activeTellusWorldId();
  const targetTerrainPaint = activeTerrainPaint();
  const appliedMix = { ...currentMix, targetTerrainPaint };
  if (saveActiveBiomeMixForWorld(worldId, appliedMix)) {
    currentMix = appliedMix;
    updateStatus(`Applied ${currentMix.label} to ${targetTerrainPaint} terrain in ${worldId}.`);
  } else {
    updateStatus("Could not save this biome mix for the active world.");
  }
  renderJson();
});

document.querySelector<HTMLButtonElement>("#export-button")!.addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(currentMix, null, 2)], { type: "application/json" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `tellus-biome-mix-${currentMix.id}.json`;
  link.click();
  URL.revokeObjectURL(link.href);
  updateStatus("Biome mix exported.");
});

const resize = () => {
  const rect = canvas.getBoundingClientRect();
  const width = Math.max(1, Math.floor(rect.width));
  const height = Math.max(1, Math.floor(rect.height));
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
};

const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

window.addEventListener("resize", resize);
renderUi();
rebuildPreview();
resize();
animate();
