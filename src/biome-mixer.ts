import * as THREE from "three";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import {
  ECOLOGY_BIOME_OPTIONS,
  ECOLOGY_TERRAIN_PAINT_MAP,
} from "./tellus-procplant-biomes";
import {
  biomeMixTargetTerrainPaint,
  entryFromProcPlantLabExport,
  genomeForMixEntry,
  isAssetMixEntry,
  labelForProcPlantId,
  makeEcologyBiomeMix,
  normalizeBiomeMixDefinition,
  saveActiveBiomeMixForWorld,
  saveActiveBiomeMixRegistryToServer,
  type TellusBiomeAssetLodPreference,
  type TellusBiomeAssetTemplate,
  type TellusBiomeMixDefinition,
  type TellusBiomeMixEntry,
} from "./tellus-biome-mix";
import {
  buildProcPlantObject,
  GOLDEN_ANGLE_RADIANS,
  procPlantPresets,
  procPlantPresetIds,
  type ProcPlantGenome,
} from "./tellus-procplants";
import { SPECIES, type SpeciesId } from "./vendor/proc-tree/index";
import type { EcologyBiomeId } from "./tellus-ecology";
import type { TerrainPaintKind } from "./tellus-types";
import { loadRuntimeConfig } from "./tellus-runtime-config";
import { browseAssetLibrary, type AssetBrowseSort } from "./tellus-generation-client";
import type { AssetLibraryModel } from "./tellus-types";
import { assetStoreGameOptimizedModelUrl, tellusAssetLibraryUrl } from "./tellus-urls-identity";

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
let selectedImportedAssetId = "";
let selectedStoreAssetId = "";
let selectedStoreAssetLod: TellusBiomeAssetLodPreference = "lod2";
let jsonVisible = false;
let statusText = "Ready.";
const weberPennSpeciesIds = Object.keys(SPECIES).sort() as SpeciesId[];
const gltfLoader = new GLTFLoader();
const dracoLoader = new DRACOLoader();
const ktx2Loader = new KTX2Loader();
const importedAssets = new Map<string, THREE.Object3D>();
const importedAssetTemplates = new Map<string, TellusBiomeAssetTemplate>();
const importedAssetOptions: Array<{
  id: string;
  libraryId?: string;
  label: string;
  name: string;
  source: "local" | "store";
  lodPreference?: TellusBiomeAssetLodPreference;
}> = [];
let storeAssetSearch = "";
let storeAssetPage = 1;
let storeAssetHasNext = false;
let storeAssetTotal = 0;
let storeAssetLoading = false;
let storeAssetResults: AssetLibraryModel[] = [];
const MAX_IMPORTED_ASSET_VERTICES = 12000;

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
      <label>
        World
        <input id="world-id-input" type="text" value="main" />
      </label>
      <div class="button-row">
        <button type="button" id="import-button">Import JSON</button>
        <button type="button" id="import-glb-button">Import GLB</button>
        <button type="button" id="apply-world-button">Apply to World</button>
        <button type="button" id="export-button">Export Mix</button>
        <button type="button" id="json-toggle-button" aria-pressed="false">Show JSON</button>
        <input id="file-input" type="file" accept="application/json,.json" multiple hidden />
        <input id="glb-input" type="file" accept=".glb,.gltf,model/gltf-binary,model/gltf+json" multiple hidden />
      </div>
    </section>
    <section class="swatch-board" aria-label="Biome swatches">
      <div>
        <h2>Biome</h2>
        <div class="swatch-grid" id="ecology-swatch-grid"></div>
      </div>
    </section>
    <section class="workspace json-hidden" id="workspace">
      <aside class="entry-panel">
        <div class="panel-title">
          <h2 id="mix-title">Taiga</h2>
          <span id="mix-count">0 plants</span>
        </div>
        <div class="entry-list" id="entry-list"></div>
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
        <div class="add-row">
          <label>
            Add imported GLB
            <select id="imported-asset-select"></select>
          </label>
          <button type="button" id="add-imported-asset-button">Import</button>
        </div>
        <section class="store-picker" aria-label="Tellus asset store GLBs">
          <div class="store-picker-head">
            <h3>Tellus Store GLB</h3>
            <span id="store-asset-count">Ready</span>
          </div>
          <div class="store-search-row">
            <input id="store-asset-search" type="search" placeholder="Search flora or GLB assets" />
            <button type="button" id="store-asset-search-button">Search</button>
          </div>
          <label>
            LOD
            <select id="store-asset-lod">
              <option value="lod2" selected>LOD2 scatter</option>
              <option value="lod3">LOD3 ultra-low</option>
              <option value="lod1">LOD1 near scatter</option>
              <option value="lod0">LOD0 near</option>
              <option value="game-optimized">Game optimized</option>
              <option value="impostor">Impostor</option>
            </select>
          </label>
          <div class="store-result-list" id="store-asset-results"></div>
          <div class="button-row store-actions">
            <button type="button" id="store-asset-load-more">Load More</button>
            <button type="button" id="store-asset-add-button">Add Selected</button>
          </div>
        </section>
        <div class="entry-editor" id="entry-editor"></div>
      </aside>
      <section class="stage-panel">
        <canvas id="biome-canvas" aria-label="Biome mix preview"></canvas>
        <dl class="stats">
          <div><dt>Rendered</dt><dd id="rendered-output">-</dd></div>
          <div><dt>Target</dt><dd id="vertex-target-output">-</dd></div>
          <div><dt>Current</dt><dd id="vertex-current-output">-</dd></div>
        </dl>
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
  body { margin: 0; min-width: 1120px; background: #eef2f4; }
  .biome-page { min-height: 100vh; padding: 22px 28px 28px; }
  .biome-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 20px; margin-bottom: 16px; }
  h1, h2 { margin: 0; line-height: 1.08; }
  h1 { font-size: 32px; }
  h2 { font-size: 18px; }
  p { margin: 8px 0 0; color: #4b5563; font-size: 17px; }
  nav, .button-row, .add-row { display: flex; gap: 8px; align-items: end; }
  a, button, select, input[type="text"] {
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
  input[type="text"] { height: 42px; width: 132px; padding: 0 10px; }
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
    grid-template-columns: 170px 170px 180px 150px minmax(360px, 1fr);
    gap: 14px;
    align-items: end;
    margin-bottom: 16px;
    padding: 12px;
    border: 1px solid #d4dbe4;
    border-radius: 8px;
    background: rgba(255,255,255,0.78);
  }
  .swatch-board {
    margin-bottom: 16px;
  }
  .swatch-board > div {
    border: 1px solid #d4dbe4;
    border-radius: 8px;
    background: rgba(255,255,255,0.78);
    padding: 12px;
  }
  .swatch-board h2 {
    margin-bottom: 10px;
    font-size: 14px;
    text-transform: uppercase;
    color: #334155;
  }
  .swatch-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(104px, 1fr));
    gap: 8px;
  }
  .swatch-button {
    min-height: 76px;
    display: grid;
    grid-template-rows: 26px auto auto;
    gap: 5px;
    padding: 7px;
    text-align: left;
  }
  .swatch-button.active {
    background: #17341f;
    color: #f6edbd;
    border-color: #8b9657;
  }
  .swatch-preview {
    width: 100%;
    height: 26px;
    border-radius: 6px;
    border: 1px solid rgba(0,0,0,0.18);
  }
  .swatch-label {
    font-size: 12px;
    line-height: 1.05;
    font-weight: 900;
    white-space: normal;
  }
  .swatch-sub {
    color: #64748b;
    font-size: 10px;
    font-weight: 800;
    line-height: 1;
    white-space: normal;
  }
  .swatch-button.active .swatch-sub { color: #d7dba4; }
  .workspace {
    display: grid;
    grid-template-columns: 330px minmax(520px, 1fr) 360px;
    gap: 16px;
    min-height: calc(100vh - 170px);
  }
  .workspace.json-hidden { grid-template-columns: 330px minmax(680px, 1fr); }
  .workspace.json-hidden .json-panel { display: none; }
  .entry-panel, .stage-panel, .json-panel {
    border: 1px solid #d4dbe4;
    border-radius: 8px;
    background: #fff;
    overflow: hidden;
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
    max-height: 38vh;
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
  .add-row { padding: 12px; border-bottom: 1px solid #e6ebf0; }
  .add-row label { flex: 1; }
  .add-row select { width: 100%; }
  .store-picker {
    display: grid;
    gap: 10px;
    padding: 12px;
    border-bottom: 1px solid #e6ebf0;
  }
  .store-picker-head, .store-search-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .store-picker h3 {
    margin: 0;
    font-size: 14px;
    line-height: 1.15;
  }
  .store-picker-head span {
    color: #64748b;
    font-size: 12px;
    font-weight: 800;
  }
  .store-search-row input {
    min-width: 0;
    flex: 1;
    height: 38px;
    border: 1px solid #c6d0dc;
    border-radius: 8px;
    padding: 0 10px;
    font: inherit;
    font-weight: 800;
  }
  .store-picker select { width: 100%; }
  .store-result-list {
    display: grid;
    gap: 6px;
    max-height: 178px;
    overflow: auto;
    padding-right: 3px;
  }
  .store-result {
    display: grid;
    grid-template-columns: 48px 1fr auto;
    gap: 8px;
    align-items: center;
    width: 100%;
    padding: 8px;
    border: 1px solid #d6dee8;
    border-radius: 8px;
    background: #fff;
    color: #07111f;
    text-align: left;
  }
  .store-result.active {
    border-color: #335f31;
    background: #e8f2df;
  }
  .store-thumb {
    width: 48px;
    height: 48px;
    border-radius: 7px;
    object-fit: cover;
    background: #e2ead9;
    border: 1px solid rgba(0,0,0,0.12);
  }
  .store-thumb.missing {
    display: grid;
    place-items: center;
    color: #64748b;
    font-size: 10px;
    font-weight: 900;
    text-transform: uppercase;
  }
  .store-result strong, .store-result small {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .store-result strong { font-size: 13px; }
  .store-result small {
    color: #64748b;
    font-size: 11px;
    font-weight: 800;
  }
  .store-result span {
    color: #334155;
    font-size: 11px;
    font-weight: 900;
  }
  .store-actions { align-items: stretch; }
  .store-actions button { flex: 1; }
  .entry-editor { padding: 14px; display: grid; gap: 12px; }
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
  .stage-panel { position: relative; min-height: 620px; }
  #biome-canvas { width: 100%; height: 100%; display: block; background: #dfe9ee; }
  .stats {
    position: absolute;
    left: 14px;
    right: 14px;
    bottom: 14px;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
    margin: 0;
    padding: 10px;
    border: 1px solid rgba(21, 38, 25, 0.28);
    border-radius: 8px;
    background: rgba(255,255,255,0.86);
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
const worldIdInput = document.querySelector<HTMLInputElement>("#world-id-input")!;
const densityOutput = document.querySelector<HTMLOutputElement>("#density-output")!;
const diversityOutput = document.querySelector<HTMLOutputElement>("#diversity-output")!;
const entryList = document.querySelector<HTMLDivElement>("#entry-list")!;
const entryEditor = document.querySelector<HTMLDivElement>("#entry-editor")!;
const mixTitle = document.querySelector<HTMLHeadingElement>("#mix-title")!;
const mixCount = document.querySelector<HTMLSpanElement>("#mix-count")!;
const presetSelect = document.querySelector<HTMLSelectElement>("#preset-select")!;
const weberPennSelect = document.querySelector<HTMLSelectElement>("#weber-penn-select")!;
const fileInput = document.querySelector<HTMLInputElement>("#file-input")!;
const glbInput = document.querySelector<HTMLInputElement>("#glb-input")!;
const importedAssetSelect = document.querySelector<HTMLSelectElement>("#imported-asset-select")!;
const importedAssetButton = document.querySelector<HTMLButtonElement>("#add-imported-asset-button")!;
const storeAssetSearchInput = document.querySelector<HTMLInputElement>("#store-asset-search")!;
const storeAssetSearchButton = document.querySelector<HTMLButtonElement>("#store-asset-search-button")!;
const storeAssetLodSelect = document.querySelector<HTMLSelectElement>("#store-asset-lod")!;
const storeAssetResultsEl = document.querySelector<HTMLDivElement>("#store-asset-results")!;
const storeAssetCountEl = document.querySelector<HTMLSpanElement>("#store-asset-count")!;
const storeAssetLoadMoreButton = document.querySelector<HTMLButtonElement>("#store-asset-load-more")!;
const storeAssetAddButton = document.querySelector<HTMLButtonElement>("#store-asset-add-button")!;
const jsonOutput = document.querySelector<HTMLTextAreaElement>("#json-output")!;
const statusOutput = document.querySelector<HTMLSpanElement>("#status-output")!;
const renderedOutput = document.querySelector<HTMLElement>("#rendered-output")!;
const vertexTargetOutput = document.querySelector<HTMLElement>("#vertex-target-output")!;
const vertexCurrentOutput = document.querySelector<HTMLElement>("#vertex-current-output")!;
const canvas = document.querySelector<HTMLCanvasElement>("#biome-canvas")!;
const workspace = document.querySelector<HTMLElement>("#workspace")!;
const ecologySwatchGrid = document.querySelector<HTMLDivElement>("#ecology-swatch-grid")!;
const jsonToggleButton = document.querySelector<HTMLButtonElement>("#json-toggle-button")!;
const applyWorldButton = document.querySelector<HTMLButtonElement>("#apply-world-button")!;

const currentWorldId = (): string => {
  const queryWorld = new URLSearchParams(window.location.search).get("world")?.trim();
  const storedWorld = window.localStorage.getItem("tellus.activeWorldId")?.trim();
  return queryWorld || storedWorld || "main";
};

worldIdInput.value = currentWorldId();

ecologySelect.innerHTML = ECOLOGY_BIOME_OPTIONS.map(
  (id) => `<option value="${id}">${labelForProcPlantId(id)}</option>`,
).join("");
presetSelect.innerHTML = procPlantPresetIds.map(
  (id) => `<option value="${id}">${labelForProcPlantId(id)}</option>`,
).join("");
presetSelect.value = selectedPresetId;
weberPennSelect.innerHTML = weberPennSpeciesIds.map(
  (id) => `<option value="${id}">${labelForProcPlantId(id)}</option>`,
).join("");
weberPennSelect.value = selectedWeberPennSpecies;
ecologySelect.value = currentMix.ecologyBiome ?? "taiga";

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.shadowMap.enabled = true;
dracoLoader.setDecoderPath("/node_modules/three/examples/jsm/libs/draco/gltf/");
ktx2Loader.setTranscoderPath("/node_modules/three/examples/jsm/libs/basis/");
ktx2Loader.detectSupport(renderer);
gltfLoader.setDRACOLoader(dracoLoader);
gltfLoader.setKTX2Loader(ktx2Loader);
gltfLoader.setMeshoptDecoder(MeshoptDecoder);
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

const disposeImportedAssetInstance = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const material = (child as THREE.Mesh).material;
    if (Array.isArray(material)) {
      material.forEach((item) => {
        if (item.userData.importedAssetMaterial) item.dispose();
      });
    } else if (material?.userData.importedAssetMaterial) {
      material.dispose();
    }
  });
};

const prepareImportedAsset = (object: THREE.Object3D): THREE.Object3D => {
  const model = object.clone(true);
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  box.getSize(size);
  const maxSide = Math.max(size.x, size.y, size.z, 1e-4);
  const center = new THREE.Vector3();
  box.getCenter(center);
  const rootObject = new THREE.Group();
  rootObject.name = object.name || "Imported GLB";
  model.position.set(-center.x, -box.min.y, -center.z);
  rootObject.add(model);
  rootObject.scale.setScalar(1 / maxSide);
  rootObject.updateMatrixWorld(true);
  const groundedBox = new THREE.Box3().setFromObject(rootObject);
  rootObject.position.y -= groundedBox.min.y;
  rootObject.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
  });
  return rootObject;
};

const tintMaterial = (material: THREE.Material, color: number | undefined): THREE.Material => {
  const cloned = material.clone();
  cloned.userData.importedAssetMaterial = true;
  if (color !== undefined && "color" in cloned) {
    (cloned as THREE.Material & { color: THREE.Color }).color.set(color);
  }
  return cloned;
};

const cloneImportedAssetInstance = (prototype: THREE.Object3D, color: number | undefined): THREE.Object3D => {
  const instance = prototype.clone(true);
  instance.userData.importedAssetClone = true;
  instance.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.material) return;
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map((material) => tintMaterial(material, color))
      : tintMaterial(mesh.material, color);
  });
  return instance;
};

const loadGlbFile = async (file: File): Promise<THREE.Object3D> => {
  const url = URL.createObjectURL(file);
  try {
    const gltf = await gltfLoader.loadAsync(url);
    return prepareImportedAsset(gltf.scene);
  } finally {
    URL.revokeObjectURL(url);
  }
};

const rounded = (value: number): number => Math.round(value * 10000) / 10000;

const materialColorForMesh = (mesh: THREE.Mesh, triangleIndex: number): THREE.Color => {
  const geometry = mesh.geometry;
  const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  let materialIndex = 0;
  if (geometry.groups.length > 0) {
    const triangleStart = triangleIndex * 3;
    const group = geometry.groups.find((item) => triangleStart >= item.start && triangleStart < item.start + item.count);
    materialIndex = group?.materialIndex ?? 0;
  }
  const material = materials[materialIndex] ?? materials[0];
  const color = material && "color" in material
    ? (material as THREE.Material & { color: THREE.Color }).color
    : undefined;
  return color?.isColor ? color : new THREE.Color(0x6b7f4c);
};

const bakeImportedAssetTemplate = (object: THREE.Object3D, tintColor?: number): TellusBiomeAssetTemplate => {
  object.updateMatrixWorld(true);
  const positions: number[] = [];
  const normals: number[] = [];
  const colors: number[] = [];
  const indices: number[] = [];
  const position = new THREE.Vector3();
  const normal = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3();
  const tint = tintColor === undefined ? null : new THREE.Color(tintColor);
  let sampledDown = false;
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.geometry) return;
    if (positions.length / 3 >= MAX_IMPORTED_ASSET_VERTICES) return;
    const geometry = mesh.geometry;
    const positionAttr = geometry.getAttribute("position");
    if (!positionAttr) return;
    const normalAttr = geometry.getAttribute("normal");
    const colorAttr = geometry.getAttribute("color");
    const indexAttr = geometry.getIndex();
    normalMatrix.getNormalMatrix(mesh.matrixWorld);
    const triangleCount = indexAttr ? Math.floor(indexAttr.count / 3) : Math.floor(positionAttr.count / 3);
    const remainingTriangles = Math.max(1, Math.floor((MAX_IMPORTED_ASSET_VERTICES - positions.length / 3) / 3));
    const stride = Math.max(1, Math.ceil(triangleCount / remainingTriangles));
    if (stride > 1) sampledDown = true;
    for (let triangle = 0; triangle < triangleCount; triangle += stride) {
      if (positions.length / 3 + 3 > MAX_IMPORTED_ASSET_VERTICES) {
        sampledDown = true;
        break;
      }
      const materialColor = tint ?? materialColorForMesh(mesh, triangle);
      for (let corner = 0; corner < 3; corner++) {
        const sourceIndex = indexAttr ? indexAttr.getX(triangle * 3 + corner) : triangle * 3 + corner;
        position.fromBufferAttribute(positionAttr, sourceIndex).applyMatrix4(mesh.matrixWorld);
        if (normalAttr) normal.fromBufferAttribute(normalAttr, sourceIndex).applyMatrix3(normalMatrix).normalize();
        else normal.set(0, 1, 0);
        const vertexIndex = positions.length / 3;
        positions.push(rounded(position.x), rounded(position.y), rounded(position.z));
        normals.push(rounded(normal.x), rounded(normal.y), rounded(normal.z));
        if (colorAttr && !tint) {
          colors.push(
            rounded(colorAttr.getX(sourceIndex)),
            rounded(colorAttr.getY(sourceIndex)),
            rounded(colorAttr.getZ(sourceIndex)),
          );
        } else {
          colors.push(rounded(materialColor.r), rounded(materialColor.g), rounded(materialColor.b));
        }
        indices.push(vertexIndex);
      }
    }
  });
  const vertexCount = positions.length / 3;
  if (vertexCount === 0) throw new Error("Imported GLB did not contain mesh geometry.");
  if (sampledDown) {
    console.warn(`[biome-mixer] sampled GLB scatter template down to ${vertexCount.toLocaleString()} vertices`);
  }
  return { version: 1, vertexCount, positions, normals, colors, indices };
};

const objectFromAssetTemplate = (
  template: TellusBiomeAssetTemplate,
  tintColor?: number,
): THREE.Object3D => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(template.positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(template.normals, 3));
  const colors = [...template.colors];
  if (tintColor !== undefined) {
    const tint = new THREE.Color(tintColor);
    for (let i = 0; i < colors.length; i += 3) {
      colors[i] = (colors[i] ?? 1) * tint.r;
      colors[i + 1] = (colors[i + 1] ?? 1) * tint.g;
      colors[i + 2] = (colors[i + 2] ?? 1) * tint.b;
    }
  }
  geometry.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(template.indices);
  geometry.computeBoundingSphere();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = "Biome asset template";
  group.add(mesh);
  return group;
};

const assetPreviewObjectForEntry = (entry: TellusBiomeMixEntry): THREE.Object3D | null => {
  if (!isAssetMixEntry(entry)) return null;
  if (entry.asset.template) return objectFromAssetTemplate(entry.asset.template, entry.asset.color);
  const assetKey = assetCacheKeyForEntry(entry);
  const prototype = importedAssets.get(assetKey);
  return prototype ? cloneImportedAssetInstance(prototype, entry.asset.color) : null;
};

const cacheAssetEntryTemplatePrototype = (entry: TellusBiomeMixEntry): boolean => {
  if (!isAssetMixEntry(entry) || !entry.asset.template) return false;
  const cacheKey = assetCacheKeyForEntry(entry);
  importedAssetTemplates.set(cacheKey, entry.asset.template);
  if (!importedAssets.has(cacheKey)) {
    importedAssets.set(cacheKey, objectFromAssetTemplate(entry.asset.template, entry.asset.color));
  }
  if (!importedAssetOptions.some((option) => option.id === cacheKey)) {
    importedAssetOptions.push({
      id: cacheKey,
      libraryId: entry.asset.libraryId,
      label: `${entry.label}${entry.asset.lodPreference ? ` (${entry.asset.lodPreference})` : ""}`,
      name: entry.asset.name,
      source: entry.asset.runtimeOnly ? "local" : "store",
      lodPreference: entry.asset.lodPreference,
    });
  }
  return true;
};

const cacheAssetEntryTemplates = (mix: TellusBiomeMixDefinition): number => {
  let cached = 0;
  for (const entry of mix.entries) {
    if (cacheAssetEntryTemplatePrototype(entry)) cached++;
  }
  return cached;
};

const colorForEntry = (entry: TellusBiomeMixEntry): number => {
  if (isAssetMixEntry(entry)) return entry.asset.color ?? 0x6b7f4c;
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

const colorCss = (value: number): string => `#${value.toString(16).padStart(6, "0").slice(-6)}`;

const activeTerrainPaint = (): TerrainPaintKind =>
  biomeMixTargetTerrainPaint(currentMix) ?? "grass";

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

const createBiomeGrassTuftGeometry = (seed: number, bladeCount = 12): THREE.BufferGeometry => {
  const positions: number[] = [];
  const normals: number[] = [];
  const indices: number[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  for (let i = 0; i < bladeCount; i++) {
    const yaw = i * GOLDEN_ANGLE_RADIANS + (hash01(seed + i * 17) - 0.5) * 1.15;
    const radial = new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
    const side = new THREE.Vector3(-radial.z, 0, radial.x);
    const height = 0.34 + hash01(seed + i * 31) * 0.5;
    const width = 0.012 + hash01(seed + i * 43) * 0.014;
    const baseSpread = Math.sqrt(hash01(seed + i * 59)) * 0.11;
    const base = radial.clone().multiplyScalar(baseSpread);
    const bend = radial.clone().multiplyScalar((0.08 + hash01(seed + i * 71) * 0.28) * height);
    const mid = base.clone().add(up.clone().multiplyScalar(height * 0.55)).add(bend.clone().multiplyScalar(0.42));
    const tip = base.clone().add(up.clone().multiplyScalar(height)).add(bend);
    const normal = new THREE.Vector3().crossVectors(side, tip.clone().sub(base)).normalize();
    const start = positions.length / 3;
    const points = [
      base.clone().add(side.clone().multiplyScalar(-width)),
      base.clone().add(side.clone().multiplyScalar(width)),
      mid.clone().add(side.clone().multiplyScalar(width * 0.58)),
      mid.clone().add(side.clone().multiplyScalar(-width * 0.58)),
      tip,
    ];
    for (const point of points) {
      positions.push(point.x, point.y, point.z);
      normals.push(normal.x, normal.y, normal.z);
    }
    indices.push(start, start + 1, start + 2, start, start + 2, start + 3, start + 3, start + 2, start + 4);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  geometry.setIndex(indices);
  geometry.computeBoundingSphere();
  return geometry;
};

const buildGrassWorldObject = (
  entry: TellusBiomeMixEntry,
  genome: ProcPlantGenome,
  count: number,
): THREE.Object3D => {
  const bladeCount = Math.round(THREE.MathUtils.clamp(8 + (genome.foliage?.mass ?? 0.8) * 5, 7, 16));
  const geometry = createBiomeGrassTuftGeometry(entry.seed ^ 0x61a55, bladeCount);
  const material = new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const mesh = new THREE.InstancedMesh(geometry, material, count);
  mesh.name = `grass-world-${entry.id}`;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  const baseColor = new THREE.Color(genome.leaf.colorA);
  const tipColor = new THREE.Color(genome.leaf.colorB);
  const matrix = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const n = entry.seed + i * 97;
    const radius = 2 + Math.sqrt(hash01(n)) * 39;
    const angle = i * GOLDEN_ANGLE_RADIANS + hash01(n + 31) * 0.45;
    const x = Math.sin(angle) * radius;
    const z = Math.cos(angle) * radius;
    const y = Math.max(0, z + 40) * 0.035 + 0.012;
    const moistureLift = THREE.MathUtils.lerp(0.74, 1.18, entry.environment.moisture);
    const shadeStretch = THREE.MathUtils.lerp(0.86, 1.22, 1 - entry.environment.light);
    const grassHeight = entry.grassHeight ?? entry.scale;
    const grassSpread = entry.grassSpread ?? 1;
    const grassLean = entry.grassLean ?? 0.42;
    const widthScale = Math.max(0.55, grassSpread) * (0.17 + hash01(n + 71) * 0.19) * moistureLift;
    const heightScale = grassHeight * (0.17 + hash01(n + 71) * 0.19) * moistureLift * shadeStretch;
    const yaw = hash01(n + 131) * Math.PI * 2;
    const leanDirection = yaw + (hash01(n + 101) - 0.5) * Math.PI;
    const leanAngle = grassLean * THREE.MathUtils.lerp(0.2, 1, hash01(n + 151));
    quat.setFromEuler(new THREE.Euler(
      Math.cos(leanDirection) * leanAngle,
      yaw,
      Math.sin(leanDirection) * leanAngle,
    ));
    scale.set(widthScale, heightScale * (0.9 + (genome.foliage?.mass ?? 0.8) * 0.16), widthScale);
    matrix.compose(new THREE.Vector3(x, y, z), quat, scale);
    mesh.setMatrixAt(i, matrix);
    color.copy(baseColor).lerp(tipColor, 0.25 + hash01(n + 191) * 0.62);
    if (hash01(n + 211) < 0.2) color.lerp(new THREE.Color(0xd8cc76), 0.12 + hash01(n + 223) * 0.2);
    mesh.setColorAt(i, color);
  }
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  mesh.instanceMatrix.needsUpdate = true;
  const group = new THREE.Group();
  group.name = `grass-world-${entry.label}`;
  group.userData.grassWorld = { count, bladeCount };
  group.add(mesh);
  return group;
};

const selectedEntry = () => currentMix.entries.find((entry) => entry.id === selectedEntryId) ?? currentMix.entries[0];

const swatchStyle = (paint: TerrainPaintKind): string => {
  const [a, b] = terrainSwatchColors[paint];
  if (paint === "flowers") {
    return `background:
      radial-gradient(circle at 24% 42%, ${colorCss(b)} 0 2px, transparent 3px),
      radial-gradient(circle at 68% 52%, #ffffff 0 2px, transparent 3px),
      linear-gradient(135deg, ${colorCss(a)}, ${colorCss(terrainSwatchColors.grass[1])});`;
  }
  if (paint === "gravel" || paint === "rock" || paint === "stone") {
    return `background:
      radial-gradient(circle at 24% 35%, rgba(255,255,255,0.45) 0 2px, transparent 3px),
      radial-gradient(circle at 68% 62%, rgba(0,0,0,0.22) 0 2px, transparent 3px),
      linear-gradient(135deg, ${colorCss(a)}, ${colorCss(b)});`;
  }
  return `background: linear-gradient(135deg, ${colorCss(a)}, ${colorCss(b)});`;
};

const renderSwatches = () => {
  ecologySwatchGrid.innerHTML = ECOLOGY_BIOME_OPTIONS.map((id) => {
    const paint = ECOLOGY_TERRAIN_PAINT_MAP[id];
    return `
      <button type="button" class="swatch-button ${currentMix.ecologyBiome === id ? "active" : ""}" data-ecology="${id}">
        <span class="swatch-preview" style="${swatchStyle(paint)}"></span>
        <span class="swatch-label">${labelForProcPlantId(id)}</span>
        <span class="swatch-sub">${labelForProcPlantId(paint)}</span>
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
    nativeLeaves: true,
    crownFill: false,
    foliageSource: "species",
    fillAnchor: "leaf-sites",
    maxBranchDepth: base.weberPenn?.maxBranchDepth ?? 3,
    maxStems: base.weberPenn?.maxStems ?? (conifer ? 96 : 80),
    maxLeaves: base.weberPenn?.maxLeaves ?? (conifer ? 220 : 190),
    leafScaleMultiplier: base.weberPenn?.leafScaleMultiplier ?? (conifer ? 4.2 : 3.2),
    radialSegments: base.weberPenn?.radialSegments ?? 4,
    branchSamples: base.weberPenn?.branchSamples ?? 2,
    barkColor: base.weberPenn?.barkColor ?? (palm ? 0x7a5630 : 0x5d4327),
    leafColor: base.weberPenn?.leafColor ?? base.leaf.colorA,
  };
  base.foliage = {
    mass: 0,
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
    entry.presetId = undefined;
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

const toHexColor = (value: number | undefined, fallback: number): string =>
  `#${(value ?? fallback).toString(16).padStart(6, "0").slice(-6)}`;

const fromHexColor = (value: string, fallback: number): number => {
  const parsed = Number.parseInt(value.replace("#", ""), 16);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const slug = (value: string): string =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "asset";

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#39;",
  }[char] ?? char));

const importErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  if (/No DRACOLoader|draco/i.test(message)) return "Draco-compressed GLB could not be decoded.";
  if (/Meshopt|meshopt/i.test(message)) return "Meshopt-compressed GLB could not be decoded.";
  if (/KTX2|ktx2|Basis/i.test(message)) return "KTX2 texture-compressed GLB could not be decoded.";
  return message || "unknown import error";
};

const renderImportedAssetOptions = () => {
  importedAssetSelect.innerHTML = importedAssetOptions.length
    ? importedAssetOptions.map((asset) => `<option value="${asset.id}">${escapeHtml(asset.label)}</option>`).join("")
    : `<option value="">Import GLB first</option>`;
  if (!importedAssetOptions.some((asset) => asset.id === selectedImportedAssetId)) {
    selectedImportedAssetId = importedAssetOptions[0]?.id ?? "";
  }
  importedAssetSelect.value = selectedImportedAssetId;
  importedAssetSelect.disabled = importedAssetOptions.length === 0;
  importedAssetButton.textContent = importedAssetOptions.length ? "Add" : "Import";
};

const makeImportedAssetEntry = (assetId: string): TellusBiomeMixEntry | null => {
  const option = importedAssetOptions.find((item) => item.id === assetId);
  const template = importedAssetTemplates.get(assetId);
  if (!option || !importedAssets.has(assetId) || !template) return null;
  return {
    id: `${assetId}-entry-${Date.now().toString(36)}-${currentMix.entries.length}`,
    label: option.label,
    source: "asset",
    asset: {
      kind: "glb",
      name: option.name,
      libraryId: option.libraryId ?? assetId,
      lodPreference: option.lodPreference,
      runtimeOnly: option.source === "local",
      template,
    },
    weight: 1,
    density: 0.22,
    scale: 10,
    environment: currentMix.entries[0]?.environment ?? { light: 0.8, moisture: 0.55, crowding: 0.32, biomeWarmth: 0.62 },
    seed: currentMix.seed ^ ((currentMix.entries.length + 1) * 0x51ed),
    enabled: true,
  };
};

const assetCacheKey = (assetId: string, lodPreference?: TellusBiomeAssetLodPreference): string =>
  `${assetId}:${lodPreference ?? "game-optimized"}`;

const assetCacheKeyForEntry = (entry: TellusBiomeMixEntry): string =>
  isAssetMixEntry(entry)
    ? assetCacheKey(entry.asset.libraryId ?? entry.id, entry.asset.lodPreference)
    : entry.id;

const assetModelPathForLod = (assetId: string, lodPreference: TellusBiomeAssetLodPreference): string => {
  if (lodPreference === "game-optimized") return assetStoreGameOptimizedModelUrl(assetId);
  if (lodPreference === "impostor") return `/api/assets/model/${encodeURIComponent(assetId)}/impostor`;
  return `/api/assets/model/${encodeURIComponent(assetId)}/lod/${lodPreference.slice(3)}`;
};

const assetModelCandidatePaths = (
  assetId: string,
  lodPreference: TellusBiomeAssetLodPreference,
): string[] => {
  const order: TellusBiomeAssetLodPreference[] =
    lodPreference === "lod3"
      ? ["lod3", "lod2", "lod1", "game-optimized"]
      : lodPreference === "lod2"
        ? ["lod2", "lod1", "game-optimized"]
        : lodPreference === "lod1"
          ? ["lod1", "game-optimized"]
          : lodPreference === "lod0"
            ? ["lod0", "game-optimized"]
            : lodPreference === "impostor"
              ? ["impostor", "lod3", "lod2", "game-optimized"]
              : ["game-optimized"];
  return [...new Set(order.map((candidate) => assetModelPathForLod(assetId, candidate)))];
};

const loadGlbUrl = async (url: string): Promise<THREE.Object3D> => {
  const gltf = await gltfLoader.loadAsync(url);
  return prepareImportedAsset(gltf.scene);
};

const loadStoreAssetObject = async (
  assetId: string,
  lodPreference: TellusBiomeAssetLodPreference,
): Promise<{ object: THREE.Object3D; path: string }> => {
  let lastError: unknown = null;
  for (const path of assetModelCandidatePaths(assetId, lodPreference)) {
    try {
      const object = await loadGlbUrl(tellusAssetLibraryUrl(path));
      return { object, path };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error(`Could not load asset ${assetId}`);
};

const biomeMixEntryRenderReport = (mix: TellusBiomeMixDefinition) => {
  let renderable = 0;
  let missingGlbTemplates = 0;
  let disabled = 0;
  for (const entry of mix.entries) {
    if (entry.enabled === false || entry.weight <= 0 || entry.density <= 0) {
      disabled++;
      continue;
    }
    if (isAssetMixEntry(entry) && !entry.asset.template) {
      missingGlbTemplates++;
      continue;
    }
    renderable++;
  }
  return { renderable, missingGlbTemplates, disabled, total: mix.entries.length };
};

const biomeMixReportText = (mix: TellusBiomeMixDefinition): string => {
  const report = biomeMixEntryRenderReport(mix);
  const notes = [`${report.renderable}/${report.total} renderable`];
  if (report.missingGlbTemplates) notes.push(`${report.missingGlbTemplates} GLB need store hydrate/re-import`);
  if (report.disabled) notes.push(`${report.disabled} disabled/zero`);
  return notes.join("; ");
};

const formatStoreAssetMeta = (asset: AssetLibraryModel): string => {
  const vertices = asset.effectiveMeshStats?.vertices;
  const sizeMb = asset.effective_file_size !== undefined
    ? asset.effective_file_size / (1024 * 1024)
    : asset.file_size !== undefined
      ? asset.file_size / (1024 * 1024)
      : undefined;
  const bits = [
    asset.file_format?.toUpperCase() ?? "GLB",
    vertices !== undefined ? `${vertices.toLocaleString()}v` : "",
    sizeMb !== undefined ? `${sizeMb.toFixed(sizeMb < 1 ? 2 : 1)} MB` : "",
    asset.lodReady ? "LOD" : "",
  ].filter(Boolean);
  return bits.join(" · ");
};

const storeAssetStableId = (asset: AssetLibraryModel): string =>
  asset.assetStoreModelId?.trim() || asset.id.replace(/^generated:/, "");

const storeAssetThumbnailUrl = (assetId: string): string =>
  tellusAssetLibraryUrl(`/api/assets/model/${encodeURIComponent(assetId)}/thumbnail`);

const renderStoreAssetResults = () => {
  storeAssetCountEl.textContent = storeAssetLoading
    ? "Loading..."
    : storeAssetResults.length
      ? `${storeAssetResults.length}/${storeAssetTotal || storeAssetResults.length}`
      : "No assets";
  storeAssetResultsEl.innerHTML = storeAssetResults.length
    ? storeAssetResults.map((asset) => {
      const stableId = storeAssetStableId(asset);
      return `
      <button type="button" class="store-result ${stableId === selectedStoreAssetId ? "active" : ""}" data-store-asset-id="${escapeHtml(stableId)}">
        ${asset.hasThumbnail !== false
          ? `<img class="store-thumb" src="${escapeHtml(storeAssetThumbnailUrl(stableId))}" alt="" loading="lazy" />`
          : `<span class="store-thumb missing">No img</span>`}
        <span>
          <strong>${escapeHtml(asset.name)}</strong>
          <small>${escapeHtml(formatStoreAssetMeta(asset))}</small>
        </span>
        <span>${escapeHtml(stableId.slice(0, 8))}</span>
      </button>
    `;
    }).join("")
    : `<p>${storeAssetLoading ? "Loading store assets..." : "Search flora or GLB assets."}</p>`;
  storeAssetResultsEl.querySelectorAll<HTMLButtonElement>(".store-result").forEach((button) => {
    button.addEventListener("click", () => {
      selectedStoreAssetId = button.dataset.storeAssetId ?? "";
      renderStoreAssetResults();
    });
  });
  storeAssetResultsEl.querySelectorAll<HTMLImageElement>(".store-thumb").forEach((image) => {
    image.addEventListener("error", () => {
      const fallback = document.createElement("span");
      fallback.className = "store-thumb missing";
      fallback.textContent = "No img";
      image.replaceWith(fallback);
    }, { once: true });
  });
  storeAssetLoadMoreButton.disabled = storeAssetLoading || !storeAssetHasNext;
  storeAssetAddButton.disabled = storeAssetLoading || !selectedStoreAssetId;
};

const browseStoreAssets = async (options: { append?: boolean } = {}) => {
  storeAssetLoading = true;
  renderStoreAssetResults();
  try {
    const result = await browseAssetLibrary(
      storeAssetSearch,
      storeAssetPage,
      "newest" satisfies AssetBrowseSort,
      18,
      storeAssetSearch.trim() ? "" : "flora",
    );
    const glbModels = result.models.filter((model) => {
      const format = model.file_format?.toLowerCase();
      return !format || format === "glb" || format === "gltf";
    });
    const merged = options.append ? [...storeAssetResults, ...glbModels] : glbModels;
    const seen = new Set<string>();
    storeAssetResults = merged.filter((model) => {
      if (seen.has(model.id)) return false;
      seen.add(model.id);
      return true;
    });
    storeAssetTotal = result.total;
    storeAssetHasNext = result.hasNext;
    if (!storeAssetResults.some((asset) => storeAssetStableId(asset) === selectedStoreAssetId)) {
      selectedStoreAssetId = storeAssetResults[0] ? storeAssetStableId(storeAssetResults[0]) : "";
    }
  } catch (error) {
    console.error(error);
    updateStatus(`Could not browse Tellus store: ${importErrorMessage(error)}`);
  } finally {
    storeAssetLoading = false;
    renderStoreAssetResults();
  }
};

const ensureStoreAssetImported = async (
  asset: AssetLibraryModel,
  lodPreference: TellusBiomeAssetLodPreference,
): Promise<string> => {
  const stableId = storeAssetStableId(asset);
  const cacheKey = assetCacheKey(stableId, lodPreference);
  if (importedAssets.has(cacheKey) && importedAssetTemplates.has(cacheKey)) return cacheKey;
  const { object, path } = await loadStoreAssetObject(stableId, lodPreference);
  importedAssets.set(cacheKey, object);
  importedAssetTemplates.set(cacheKey, bakeImportedAssetTemplate(object));
  if (!importedAssetOptions.some((option) => option.id === cacheKey)) {
    importedAssetOptions.push({
      id: cacheKey,
      libraryId: stableId,
      label: `${asset.name} (${lodPreference})`,
      name: asset.name,
      source: "store",
      lodPreference,
    });
  }
  selectedImportedAssetId = cacheKey;
  updateStatus(`Loaded ${asset.name} from ${path}.`);
  return cacheKey;
};

const addStoreAssetEntry = async () => {
  const asset = storeAssetResults.find((item) => storeAssetStableId(item) === selectedStoreAssetId);
  if (!asset) {
    updateStatus("Choose a Tellus store GLB first.");
    return;
  }
  storeAssetAddButton.disabled = true;
  updateStatus(`Loading ${asset.name} as ${selectedStoreAssetLod}...`);
  try {
    const cacheKey = await ensureStoreAssetImported(asset, selectedStoreAssetLod);
    const entry = makeImportedAssetEntry(cacheKey);
    if (!entry) {
      updateStatus(`Loaded ${asset.name}, but could not make a biome entry.`);
      return;
    }
    currentMix.entries.push(entry);
    selectedEntryId = entry.id;
    updateStatus(`Added ${asset.name} as ${selectedStoreAssetLod}; ${biomeMixReportText(currentMix)}.`);
    renderUi();
    rebuildPreview();
  } catch (error) {
    console.error(error);
    updateStatus(`Could not add ${asset.name}: ${importErrorMessage(error)}`);
  } finally {
    storeAssetAddButton.disabled = false;
  }
};

const hydrateStoreBackedAssetEntries = async (mix: TellusBiomeMixDefinition): Promise<number> => {
  let hydrated = 0;
  for (const entry of mix.entries) {
    if (!isAssetMixEntry(entry)) continue;
    if (entry.asset.template || !entry.asset.libraryId || entry.asset.runtimeOnly === true) continue;
    const lodPreference = entry.asset.lodPreference ?? "lod2";
    try {
      const cacheKey = await ensureStoreAssetImported(
        {
          id: entry.asset.libraryId,
          name: entry.asset.name,
          file_format: "glb",
          source: "asset-library",
        },
        lodPreference,
      );
      entry.asset.template = importedAssetTemplates.get(cacheKey);
      entry.asset.lodPreference = lodPreference;
      entry.asset.runtimeOnly = false;
      cacheAssetEntryTemplatePrototype(entry);
      hydrated++;
    } catch (error) {
      console.warn("Could not hydrate store biome asset", entry.asset.libraryId, error);
    }
  }
  return hydrated;
};

const addImportedAssetEntry = () => {
  const entry = makeImportedAssetEntry(selectedImportedAssetId);
  if (!entry) {
    updateStatus("Import a GLB before adding one from the picker.");
    return;
  }
  currentMix.entries.push(entry);
  selectedEntryId = entry.id;
  updateStatus(`Added GLB ${entry.label}.`);
  renderUi();
  rebuildPreview();
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
        <span class="entry-meta">${isAssetMixEntry(entry) ? "GLB asset" : `${entry.source}${entry.presetId ? ` / ${entry.presetId}` : ""}`}</span>
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
  const isAssetEntry = isAssetMixEntry(entry);
  const previewGenome = isAssetEntry ? null : genomeForMixEntry(entry);
  const weberPenn = previewGenome?.weberPenn;
  const foliage = previewGenome?.foliage;
  const realism = previewGenome?.treeRealism;
  const foliageMode = previewGenome ? weberFoliageMode(previewGenome) : "plain";
  const fillMass = foliageMode === "plain" ? 0 : foliage?.mass ?? 0;
  const fillSize = foliage?.size ?? (previewGenome?.habit === "conifer" ? 0.34 : 0.54);
  const isGrassEntry = previewGenome?.habit === "grass";
  const grassHeight = entry.grassHeight ?? entry.scale;
  const grassSpread = entry.grassSpread ?? 1;
  const grassLean = entry.grassLean ?? 0.42;
  entryEditor.innerHTML = `
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
    ${isGrassEntry ? `
      <section class="weber-editor">
        <h3>Grass Carpet</h3>
        <div class="inline">
          <label>
            Height
            <input id="grass-height" type="range" min="0.12" max="3.2" value="${grassHeight}" step="0.02" />
            <output>${grassHeight.toFixed(2)}</output>
          </label>
          <label>
            Spread
            <input id="grass-spread" type="range" min="0.55" max="2.4" value="${grassSpread}" step="0.02" />
            <output>${grassSpread.toFixed(2)}</output>
          </label>
        </div>
        <label>
          Lean
          <input id="grass-lean" type="range" min="0" max="1.1" value="${grassLean}" step="0.02" />
          <output>${grassLean.toFixed(2)}</output>
        </label>
      </section>
    ` : ""}
    ${isAssetEntry ? `
      <section class="weber-editor">
        <h3>Imported GLB</h3>
        <div class="inline">
          <label>
            Asset color
            <input id="asset-color" type="color" value="${toHexColor(entry.asset.color, 0x6b7f4c)}" />
          </label>
          <label>
            Source
            <input value="${entry.asset.name.replace(/"/g, "&quot;")}" disabled />
          </label>
        </div>
      </section>
    ` : ""}
    ${weberPenn ? `
      <section class="weber-editor">
        <h3>Weber/Penn Tree Traits</h3>
        <label>
          Species
          <select id="weber-species">
            ${weberPennSpeciesIds.map((id) => `<option value="${id}" ${id === weberPenn.species ? "selected" : ""}>${labelForProcPlantId(id)}</option>`).join("")}
          </select>
        </label>
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
        <div class="inline">
          <label>
            Foliage mode
            <select id="weber-foliage-mode">
              <option value="plain" ${foliageMode === "plain" ? "selected" : ""}>Plain W/P leaves</option>
              <option value="procplants" ${foliageMode === "procplants" ? "selected" : ""}>Procplants fill only</option>
              <option value="conifer" ${foliageMode === "conifer" ? "selected" : ""}>Conifer fill only</option>
              <option value="mixed" ${foliageMode === "mixed" ? "selected" : ""}>Custom mixed</option>
            </select>
          </label>
          <label>
            Native leaves
            <select id="weber-native-leaves">
              <option value="true" ${weberPenn.nativeLeaves === false ? "" : "selected"}>On</option>
              <option value="false" ${weberPenn.nativeLeaves === false ? "selected" : ""}>Off</option>
            </select>
          </label>
        </div>
        <div class="inline">
          <label>
            Crown fill
            <select id="weber-foliage-source">
              <option value="species" ${(weberPenn.foliageSource ?? "species") === "species" ? "selected" : ""}>W/P leaf shape</option>
              <option value="procplants" ${weberPenn.foliageSource === "procplants" ? "selected" : ""}>Procplants leaf</option>
              <option value="conifer-spray" ${weberPenn.foliageSource === "conifer-spray" ? "selected" : ""}>Conifer spray</option>
            </select>
          </label>
          <label>
            Fill anchors
            <select id="weber-fill-anchor">
              <option value="leaf-sites" ${(weberPenn.fillAnchor ?? "leaf-sites") === "leaf-sites" ? "selected" : ""}>W/P leaf sites</option>
              <option value="branch-tips" ${weberPenn.fillAnchor === "branch-tips" ? "selected" : ""}>Branch tips</option>
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
            Fill size
            <input id="foliage-size" type="range" min="0.05" max="1.5" value="${fillSize}" step="0.01" />
            <output>${fillSize.toFixed(2)}</output>
          </label>
          <label>
            Foliage spread
            <input id="foliage-spread" type="range" min="0" max="1.6" value="${foliage?.whorlDensity ?? 0.6}" step="0.01" />
            <output>${(foliage?.whorlDensity ?? 0.6).toFixed(2)}</output>
          </label>
        </div>
        <div class="inline">
          <label>
            Tip bias
            <input id="foliage-tip" type="range" min="0" max="1" value="${foliage?.tipBias ?? 0.5}" step="0.01" />
            <output>${(foliage?.tipBias ?? 0.5).toFixed(2)}</output>
          </label>
        </div>
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
      </section>
    ` : ""}
    <button type="button" class="danger" id="remove-entry">Remove Plant</button>
  `;
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
  const bindOptionalNumber = (
    selector: string,
    key: "grassHeight" | "grassSpread" | "grassLean",
    format: (value: number) => string,
  ) => {
    const input = entryEditor.querySelector<HTMLInputElement>(selector);
    if (!input) return;
    const output = input.nextElementSibling as HTMLOutputElement;
    input.addEventListener("input", () => {
      entry[key] = Number(input.value);
      output.textContent = format(entry[key] ?? 0);
      renderJson();
      renderEntryList();
      rebuildPreview();
    });
  };
  bindOptionalNumber("#grass-height", "grassHeight", (value) => value.toFixed(2));
  bindOptionalNumber("#grass-spread", "grassSpread", (value) => value.toFixed(2));
  bindOptionalNumber("#grass-lean", "grassLean", (value) => value.toFixed(2));
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
  entryEditor.querySelector<HTMLInputElement>("#asset-color")?.addEventListener("input", (event) => {
    if (!isAssetMixEntry(entry)) return;
    entry.asset.color = fromHexColor((event.currentTarget as HTMLInputElement).value, entry.asset.color ?? 0x6b7f4c);
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
      genome.foliage = genome.foliage ?? { mass: 0, clusterDensity: 1.1, whorlDensity: 0.55, tipBias: 0.5, size: 0.4 };
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
      const mode = (event.currentTarget as HTMLSelectElement).value as "plain" | "procplants" | "conifer" | "mixed";
      if (mode === "mixed") return;
      updateTree((genome) => applyWeberFoliageMode(genome, mode), { renderEditor: true });
    });
    entryEditor.querySelector<HTMLSelectElement>("#weber-native-leaves")!.addEventListener("change", (event) => {
      updateTree((genome) => {
        genome.weberPenn!.nativeLeaves = (event.currentTarget as HTMLSelectElement).value === "true";
      }, { renderEditor: true });
    });
    entryEditor.querySelector<HTMLSelectElement>("#weber-foliage-source")!.addEventListener("change", (event) => {
      updateTree((genome) => {
        genome.weberPenn!.crownFill = true;
        genome.weberPenn!.foliageSource = (event.currentTarget as HTMLSelectElement).value as "species" | "procplants" | "conifer-spray";
      }, { renderEditor: true });
    });
    entryEditor.querySelector<HTMLSelectElement>("#weber-fill-anchor")!.addEventListener("change", (event) => {
      updateTree((genome) => {
        genome.weberPenn!.fillAnchor = (event.currentTarget as HTMLSelectElement).value as "leaf-sites" | "branch-tips";
      }, { renderEditor: true });
    });
    bindTreeNumber("#foliage-mass", (v) => v.toFixed(2), (genome, value) => {
      genome.weberPenn!.crownFill = value > 0.001;
      genome.foliage!.mass = value;
    });
    bindTreeNumber("#foliage-clusters", (v) => v.toFixed(2), (genome, value) => { genome.foliage!.clusterDensity = value; });
    bindTreeNumber("#foliage-size", (v) => v.toFixed(2), (genome, value) => { genome.foliage!.size = value; });
    bindTreeNumber("#foliage-spread", (v) => v.toFixed(2), (genome, value) => { genome.foliage!.whorlDensity = value; });
    bindTreeNumber("#foliage-tip", (v) => v.toFixed(2), (genome, value) => { genome.foliage!.tipBias = value; });
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
  renderImportedAssetOptions();
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
      if (child.userData.importedAssetClone) disposeImportedAssetInstance(child);
      else disposeObject(child);
    }
  }
  const enabled = normalizedEnabledEntries();
  const weightTotal = enabled.reduce((sum, entry) => sum + Math.max(0.01, entry.weight), 0) || 1;
  let rendered = 0;
  let currentVertices = 0;
  enabled.forEach((entry, entryIndex) => {
    const genome = isAssetMixEntry(entry) ? null : genomeForMixEntry(entry);
    const share = Math.max(0.01, entry.weight) / weightTotal;
    if (genome?.habit === "grass") {
      const grassCount = Math.max(
        80,
        Math.min(2400, Math.round(720 * currentMix.density * entry.density * (0.6 + share * 1.6))),
      );
      const grassWorld = buildGrassWorldObject(entry, genome, grassCount);
      const verticesPerTuft = geometryVertexCount(grassWorld);
      currentVertices += verticesPerTuft * grassCount;
      previewGroup.add(grassWorld);
      rendered += grassCount;
      return;
    }
    const prototype = isAssetMixEntry(entry)
      ? assetPreviewObjectForEntry(entry)
      : buildProcPlantObject(genome!, entry.seed, entry.environment);
    if (!prototype) return;
    const verticesPerPlant = geometryVertexCount(prototype);
    const habitCap = isAssetMixEntry(entry) || genome?.habit === "tree" || genome?.habit === "conifer" || genome?.habit === "palm" ? 12 : 36;
    const count = Math.max(1, Math.min(habitCap, Math.round(70 * currentMix.density * entry.density * share)));
    currentVertices += verticesPerPlant * count;
    for (let i = 0; i < count; i++) {
      const instance = isAssetMixEntry(entry)
        ? i === 0 ? prototype : prototype.clone(true)
        : i === 0 ? prototype : prototype.clone(true);
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

presetSelect.addEventListener("change", () => {
  selectedPresetId = presetSelect.value;
});

weberPennSelect.addEventListener("change", () => {
  selectedWeberPennSpecies = weberPennSelect.value;
});

importedAssetSelect.addEventListener("change", () => {
  selectedImportedAssetId = importedAssetSelect.value;
});

storeAssetSearchButton.addEventListener("click", () => {
  storeAssetSearch = storeAssetSearchInput.value.trim();
  storeAssetPage = 1;
  void browseStoreAssets();
});

storeAssetSearchInput.addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  storeAssetSearch = storeAssetSearchInput.value.trim();
  storeAssetPage = 1;
  void browseStoreAssets();
});

storeAssetLodSelect.addEventListener("change", () => {
  selectedStoreAssetLod = storeAssetLodSelect.value as TellusBiomeAssetLodPreference;
});

storeAssetLoadMoreButton.addEventListener("click", () => {
  if (!storeAssetHasNext || storeAssetLoading) return;
  storeAssetPage++;
  void browseStoreAssets({ append: true });
});

storeAssetAddButton.addEventListener("click", () => {
  void addStoreAssetEntry();
});

document.querySelector<HTMLButtonElement>("#add-preset-button")!.addEventListener("click", () => {
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
});

document.querySelector<HTMLButtonElement>("#add-weber-penn-button")!.addEventListener("click", () => {
  const entry = makeWeberPennEntry(selectedWeberPennSpecies as SpeciesId);
  currentMix.entries.push(entry);
  selectedEntryId = entry.id;
  updateStatus(`Added Weber/Penn ${entry.label}.`);
  renderUi();
  rebuildPreview();
});

importedAssetButton.addEventListener("click", () => {
  if (importedAssetOptions.length === 0) {
    glbInput.click();
    return;
  }
  addImportedAssetEntry();
});

document.querySelector<HTMLButtonElement>("#import-button")!.addEventListener("click", () => fileInput.click());
document.querySelector<HTMLButtonElement>("#import-glb-button")!.addEventListener("click", () => glbInput.click());

fileInput.addEventListener("change", async () => {
  const files = Array.from(fileInput.files ?? []);
  let imported = 0;
  let cachedTemplates = 0;
  let hydratedStoreAssets = 0;
  for (const file of files) {
    const raw = JSON.parse(await file.text()) as unknown;
    const mix = normalizeBiomeMixDefinition(raw);
    if (mix) {
      currentMix = mix;
      cachedTemplates += cacheAssetEntryTemplates(currentMix);
      hydratedStoreAssets += await hydrateStoreBackedAssetEntries(currentMix);
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
  updateStatus(imported
    ? `Imported ${imported} JSON file${imported === 1 ? "" : "s"}; ${biomeMixReportText(currentMix)}${hydratedStoreAssets ? `; hydrated ${hydratedStoreAssets} store GLB${hydratedStoreAssets === 1 ? "" : "s"}` : ""}${cachedTemplates ? `; cached ${cachedTemplates} baked template${cachedTemplates === 1 ? "" : "s"}` : ""}.`
    : "No compatible JSON found.");
  renderUi();
  rebuildPreview();
});

glbInput.addEventListener("change", async () => {
  const files = Array.from(glbInput.files ?? []);
  let imported = 0;
  const failures: string[] = [];
  if (files.length > 0) updateStatus(`Importing ${files.length} GLB file${files.length === 1 ? "" : "s"}...`);
  for (const file of files) {
    try {
      const object = await loadGlbFile(file);
      const label = file.name.replace(/\.(glb|gltf)$/i, "");
      const assetId = `asset-${slug(label)}-${Date.now().toString(36)}-${imported}`;
      importedAssets.set(assetId, object);
      importedAssetTemplates.set(assetId, bakeImportedAssetTemplate(object));
      importedAssetOptions.push({ id: assetId, label, name: file.name, source: "local" });
      selectedImportedAssetId = assetId;
      const entry = makeImportedAssetEntry(assetId);
      if (entry) {
        currentMix.entries.push(entry);
        selectedEntryId = entry.id;
        imported++;
      }
    } catch (error) {
      console.error(error);
      failures.push(`${file.name}: ${importErrorMessage(error)}`);
    }
  }
  glbInput.value = "";
  if (imported) {
    updateStatus(`Imported ${imported} GLB asset${imported === 1 ? "" : "s"} for this session${failures.length ? `; ${failures.length} failed.` : "."}`);
  } else if (failures.length) {
    updateStatus(`Could not import ${failures[0]}`);
  } else {
    updateStatus("No GLB file selected.");
  }
  renderUi();
  rebuildPreview();
});

applyWorldButton.addEventListener("click", () => {
  const worldId = worldIdInput.value.trim() || currentWorldId();
  worldIdInput.value = worldId;
  const targetPaint = biomeMixTargetTerrainPaint(currentMix);
  if (!targetPaint) {
    updateStatus("Choose a biome or terrain target before applying.");
    return;
  }
  const registry = saveActiveBiomeMixForWorld(worldId, currentMix);
  if (!registry) {
    updateStatus("Could not save biome mix for this world.");
    return;
  }
  updateStatus(`Applied ${currentMix.label} to ${labelForProcPlantId(targetPaint)} in ${registry.worldId}; ${biomeMixReportText(currentMix)}.`);
  void saveActiveBiomeMixRegistryToServer(registry).then((saved) => {
    updateStatus(saved
      ? `Applied ${currentMix.label} to ${labelForProcPlantId(targetPaint)} in ${registry.worldId} and saved to Hyades; ${biomeMixReportText(currentMix)}.`
      : `Applied ${currentMix.label} locally; Hyades save is unavailable; ${biomeMixReportText(currentMix)}.`);
  });
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
void loadRuntimeConfig().finally(() => {
  storeAssetLodSelect.value = selectedStoreAssetLod;
  renderUi();
  void browseStoreAssets();
  rebuildPreview();
  resize();
});
animate();
