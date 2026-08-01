import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildTellusBiomeDefaultCatalog, type TellusBiomeDefaultDefinition } from "./tellus-biome-defaults";
import {
  genomeForMixEntry,
  isAssetMixEntry,
  labelForProcPlantId,
  type TellusBiomeMixEntry,
} from "./tellus-biome-mix";
import { buildProcPlantObject, type ProcPlantGenome } from "./tellus-procplants";
import type { EcologyBiomeId } from "./tellus-ecology";
import type { TerrainPaintKind } from "./tellus-types";

const root = document.getElementById("biome-defaults-root");
if (!root) throw new Error("Missing #biome-defaults-root");

type ScaleMode = "relative" | "specimen";

const terrainColors: Record<TerrainPaintKind, number> = {
  meadow: 0x789947,
  grass: 0x5f8e39,
  flowers: 0x799b55,
  "forest-floor": 0x4b5735,
  "jungle-moss": 0x315e3b,
  beach: 0xd8c28d,
  "desert-sand": 0xc99a5c,
  rock: 0x737876,
  gravel: 0x8e8e82,
  snow: 0xdde8e8,
  dirt: 0x65482c,
  stone: 0x8d9292,
  brick: 0xa7523d,
};

const catalog = buildTellusBiomeDefaultCatalog();
const queryBiome = new URLSearchParams(window.location.search).get("biome") as EcologyBiomeId | null;
let active = catalog.find((item) => item.biome === queryBiome) ?? catalog.find((item) => item.biome === "tundra") ?? catalog[0]!;
let scaleMode: ScaleMode = "relative";
let buildToken = 0;

root.innerHTML = `
  <main class="defaults-page">
    <header class="defaults-header">
      <div>
        <div class="eyebrow">Tellus ecology</div>
        <h1>Biome Defaults</h1>
        <p>Read-only view of the plant communities currently selected by the shared ecology resolver.</p>
      </div>
      <nav aria-label="Biome tools">
        <a href="/biome-mixer.html">Biome Mixer</a>
        <a href="/tree-lod-gallery.html">Tree Lab</a>
        <a href="/">Tellus</a>
      </nav>
    </header>
    <section class="defaults-layout">
      <aside class="biome-rail" aria-label="Biome defaults">
        <div class="rail-heading">
          <h2>Current biomes</h2>
          <span>${catalog.length}</span>
        </div>
        <div id="biome-list" class="biome-list"></div>
      </aside>
      <section class="viewer-panel">
        <div class="viewer-toolbar">
          <div>
            <div class="eyebrow" id="terrain-label"></div>
            <h2 id="biome-title"></h2>
          </div>
          <div class="view-actions" aria-label="Viewer scale">
            <button type="button" id="relative-scale" class="active">Relative scale</button>
            <button type="button" id="specimen-scale">Compare forms</button>
            <button type="button" id="reset-camera">Reset view</button>
          </div>
        </div>
        <div class="stage-wrap" id="stage-wrap">
          <canvas id="defaults-canvas" aria-label="Selected biome default community preview"></canvas>
          <div class="stage-status" id="stage-status" role="status">Preparing defaults…</div>
          <dl class="render-stats" aria-label="Preview rendering statistics">
            <div><dt>Entries</dt><dd id="entry-count">0</dd></div>
            <div><dt>Draws</dt><dd id="draw-count">0</dd></div>
            <div><dt>Triangles</dt><dd id="triangle-count">0</dd></div>
          </dl>
        </div>
        <section class="community-panel" aria-labelledby="community-title">
          <div class="community-heading">
            <div>
              <div class="eyebrow">Resolved community</div>
              <h2 id="community-title">Default entries</h2>
            </div>
            <p>Weights choose the mix; density and scale are the authored world values.</p>
          </div>
          <div id="community-list" class="community-list"></div>
        </section>
      </section>
    </section>
  </main>
`;

const style = document.createElement("style");
style.textContent = `
  :root {
    color: #f5efcf;
    background: #0d1814;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color-scheme: dark;
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 320px; min-height: 100vh; background: radial-gradient(circle at 70% 0%, #254832 0, #111f19 36%, #09110e 100%); }
  button, a { font: inherit; }
  button { color: inherit; }
  .defaults-page { min-height: 100vh; padding: 22px; }
  .defaults-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; max-width: 1680px; margin: 0 auto 18px; }
  .defaults-header h1 { margin: 2px 0 5px; font: 700 clamp(32px, 5vw, 60px)/0.98 Georgia, serif; color: #fff4c0; }
  .defaults-header p { margin: 0; max-width: 720px; color: #b9c8b8; }
  .defaults-header nav { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; }
  .defaults-header a, .view-actions button { border: 1px solid #8b803d; background: rgba(20, 43, 31, 0.88); color: #f7ebaa; padding: 9px 12px; text-decoration: none; border-radius: 3px; font-weight: 750; }
  .defaults-header a:hover, .view-actions button:hover, .view-actions button.active { background: #405f37; border-color: #d7c55f; color: #fff9d6; }
  .eyebrow { color: #d6c65f; font-size: 11px; font-weight: 900; letter-spacing: 0.12em; text-transform: uppercase; }
  .defaults-layout { max-width: 1680px; margin: 0 auto; display: grid; grid-template-columns: minmax(260px, 330px) minmax(0, 1fr); gap: 16px; align-items: start; }
  .biome-rail, .viewer-panel, .community-panel { border: 1px solid #596432; background: rgba(9, 22, 17, 0.9); box-shadow: 0 18px 42px rgba(0, 0, 0, 0.25); }
  .biome-rail { position: sticky; top: 14px; max-height: calc(100vh - 28px); overflow: auto; }
  .rail-heading, .viewer-toolbar, .community-heading { display: flex; align-items: center; justify-content: space-between; gap: 18px; padding: 15px 16px; border-bottom: 1px solid #3d4b2c; }
  .rail-heading h2, .viewer-toolbar h2, .community-heading h2 { margin: 0; color: #fff2b5; font: 700 23px/1.1 Georgia, serif; }
  .rail-heading span { color: #d8ca72; font-weight: 900; }
  .biome-list { display: grid; }
  .biome-card { display: grid; grid-template-columns: 42px 1fr; gap: 11px; width: 100%; padding: 12px 14px; border: 0; border-bottom: 1px solid #273528; background: transparent; text-align: left; cursor: pointer; }
  .biome-card:hover { background: rgba(86, 111, 61, 0.23); }
  .biome-card.active { background: #263f2d; box-shadow: inset 4px 0 #decf68; }
  .terrain-chip { display: block; width: 42px; height: 42px; border: 1px solid #b5a957; border-radius: 50%; box-shadow: inset 0 0 0 4px rgba(0,0,0,.12); }
  .biome-name { display: block; color: #fff3c1; font-weight: 850; }
  .biome-meta, .biome-plants { display: block; color: #9fb09f; font-size: 11px; margin-top: 3px; }
  .biome-plants { color: #d0d9bd; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .viewer-panel { min-width: 0; }
  .viewer-toolbar { min-height: 76px; }
  .view-actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 7px; }
  .view-actions button { padding: 7px 10px; cursor: pointer; }
  .stage-wrap { position: relative; height: min(62vh, 680px); min-height: 430px; background: #92a59b; overflow: hidden; }
  #defaults-canvas { width: 100%; height: 100%; display: block; touch-action: none; }
  .stage-status { position: absolute; left: 15px; top: 14px; max-width: min(500px, calc(100% - 30px)); padding: 8px 11px; border: 1px solid #8c8042; background: rgba(10, 22, 16, .88); color: #f7e99f; font-size: 12px; font-weight: 750; pointer-events: none; }
  .stage-status.ready { opacity: 0; transition: opacity .35s ease 1.2s; }
  .render-stats { position: absolute; right: 14px; bottom: 13px; display: flex; gap: 1px; margin: 0; border: 1px solid #81783f; background: rgba(10, 22, 16, .9); }
  .render-stats div { padding: 7px 10px; min-width: 72px; }
  .render-stats dt { color: #aeb9a4; font-size: 9px; font-weight: 900; text-transform: uppercase; }
  .render-stats dd { margin: 2px 0 0; color: #fff0a6; font-size: 13px; font-weight: 900; }
  .community-panel { border-width: 1px 0 0; box-shadow: none; }
  .community-heading p { margin: 0; max-width: 520px; color: #9eae9d; font-size: 12px; text-align: right; }
  .community-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(225px, 1fr)); }
  .community-card { padding: 14px; border-right: 1px solid #29372a; border-bottom: 1px solid #29372a; min-width: 0; }
  .community-card header { display: flex; justify-content: space-between; gap: 10px; }
  .community-rank { color: #d6c65f; font: 700 20px/1 Georgia, serif; }
  .community-card h3 { margin: 0; color: #fff2b7; font-size: 15px; }
  .community-kind { margin: 4px 0 10px; color: #91a790; font-size: 11px; }
  .trait-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 5px; }
  .trait-grid div { padding: 6px; background: rgba(47, 70, 48, .36); }
  .trait-grid span { display: block; color: #91a28e; font-size: 8px; font-weight: 900; text-transform: uppercase; }
  .trait-grid strong { display: block; margin-top: 2px; color: #edf0cd; font-size: 12px; }
  .backend-note { margin: 9px 0 0; color: #c9d5b5; font-size: 10px; line-height: 1.35; }
  @media (max-width: 900px) {
    .defaults-page { padding: 12px; }
    .defaults-header, .viewer-toolbar, .community-heading { align-items: flex-start; flex-direction: column; }
    .defaults-header nav, .view-actions { justify-content: flex-start; }
    .defaults-layout { grid-template-columns: 1fr; }
    .biome-rail { position: static; max-height: none; }
    .biome-list { grid-template-columns: repeat(2, minmax(0, 1fr)); }
    .stage-wrap { min-height: 390px; height: 56vh; }
    .community-heading p { text-align: left; }
  }
  @media (max-width: 560px) {
    .biome-list { grid-template-columns: 1fr; }
    .render-stats { left: 12px; right: auto; }
    .stage-wrap { min-height: 360px; }
  }
`;
document.head.appendChild(style);

const biomeList = document.querySelector<HTMLDivElement>("#biome-list")!;
const communityList = document.querySelector<HTMLDivElement>("#community-list")!;
const biomeTitle = document.querySelector<HTMLHeadingElement>("#biome-title")!;
const terrainLabel = document.querySelector<HTMLDivElement>("#terrain-label")!;
const stageWrap = document.querySelector<HTMLDivElement>("#stage-wrap")!;
const stageStatus = document.querySelector<HTMLDivElement>("#stage-status")!;
const entryCount = document.querySelector<HTMLElement>("#entry-count")!;
const drawCount = document.querySelector<HTMLElement>("#draw-count")!;
const triangleCount = document.querySelector<HTMLElement>("#triangle-count")!;
const relativeButton = document.querySelector<HTMLButtonElement>("#relative-scale")!;
const specimenButton = document.querySelector<HTMLButtonElement>("#specimen-scale")!;
const canvas = document.querySelector<HTMLCanvasElement>("#defaults-canvas")!;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(1.5, window.devicePixelRatio || 1));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x9dafaa);
scene.fog = new THREE.Fog(0x9dafaa, 70, 180);
scene.add(new THREE.HemisphereLight(0xf8fbef, 0x34422f, 2.1));
const sun = new THREE.DirectionalLight(0xfff3cf, 2.7);
sun.position.set(30, 42, 24);
scene.add(sun);

const camera = new THREE.PerspectiveCamera(43, 1, 0.1, 500);
camera.position.set(44, 30, 48);
const controls = new OrbitControls(camera, canvas);
controls.target.set(0, 5, 0);
controls.enableDamping = false;
controls.minDistance = 5;
controls.maxDistance = 240;
controls.maxPolarAngle = Math.PI * 0.49;
controls.addEventListener("change", () => requestRender());

const groundMaterial = new THREE.MeshLambertMaterial({ color: terrainColors[active.terrainPaint] });
const ground = new THREE.Mesh(new THREE.CircleGeometry(72, 64), groundMaterial);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.03;
scene.add(ground);

const content = new THREE.Group();
scene.add(content);

let renderPending = false;
const requestRender = () => {
  if (renderPending) return;
  renderPending = true;
  requestAnimationFrame(() => {
    renderPending = false;
    renderer.render(scene, camera);
    drawCount.textContent = String(renderer.info.render.calls);
    triangleCount.textContent = Math.round(renderer.info.render.triangles).toLocaleString();
  });
};

const disposeObject = (object: THREE.Object3D) => {
  object.traverse((child) => {
    const mesh = child as THREE.Mesh;
    mesh.geometry?.dispose();
    const material = mesh.material;
    if (Array.isArray(material)) material.forEach((item) => item.dispose());
    else material?.dispose?.();
  });
};

const clearContent = () => {
  while (content.children.length) {
    const child = content.children[content.children.length - 1];
    if (!child) continue;
    content.remove(child);
    disposeObject(child);
  }
};

const cloneGenome = (genome: ProcPlantGenome): ProcPlantGenome =>
  typeof structuredClone === "function"
    ? structuredClone(genome)
    : JSON.parse(JSON.stringify(genome)) as ProcPlantGenome;

const previewGenomeForEntry = (entry: TellusBiomeMixEntry): ProcPlantGenome =>
  cloneGenome(genomeForMixEntry(entry));

const assetPlaceholder = (entry: TellusBiomeMixEntry): THREE.Object3D => {
  const group = new THREE.Group();
  const color = entry.asset?.color ?? 0x4d7f4f;
  const material = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });
  const leaf = new THREE.Mesh(new THREE.CircleGeometry(0.6, 6), material);
  leaf.scale.set(0.55, 1.25, 1);
  leaf.position.y = 0.7;
  group.add(leaf);
  const crossed = leaf.clone();
  crossed.rotation.y = Math.PI / 2;
  group.add(crossed);
  return group;
};

const desiredSpecimenHeight = (genome: ProcPlantGenome) =>
  genome.habit === "tree" || genome.habit === "conifer" || genome.habit === "palm"
    ? 9
    : genome.habit === "shrub" || genome.habit === "fern"
      ? 4.2
      : 2.2;

const placePreview = (
  object: THREE.Object3D,
  genome: ProcPlantGenome,
  authoredScale: number,
  index: number,
) => {
  object.updateMatrixWorld(true);
  const unscaled = new THREE.Box3().setFromObject(object);
  const size = unscaled.getSize(new THREE.Vector3());
  const scale = scaleMode === "relative"
    ? authoredScale
    : desiredSpecimenHeight(genome) / Math.max(0.05, size.y);
  object.scale.setScalar(scale);
  object.rotation.y = (index * 2.399963229728653) % (Math.PI * 2);
  object.updateMatrixWorld(true);
  const scaled = new THREE.Box3().setFromObject(object);
  const column = index % 4;
  const row = Math.floor(index / 4);
  object.position.set((column - 1.5) * 18, -scaled.min.y, (row - 0.5) * 20);
  object.userData.authoredScale = authoredScale;
  content.add(object);

  const marker = new THREE.Mesh(
    new THREE.RingGeometry(0.65, 0.88, 28),
    new THREE.MeshBasicMaterial({ color: 0xe4d369, side: THREE.DoubleSide }),
  );
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(object.position.x, 0.025, object.position.z);
  content.add(marker);
};

const fitCamera = () => {
  const objectBounds = new THREE.Box3();
  for (const child of content.children) {
    if (child instanceof THREE.Mesh && child.geometry.type === "RingGeometry") continue;
    objectBounds.expandByObject(child);
  }
  if (objectBounds.isEmpty()) {
    camera.position.set(44, 30, 48);
    controls.target.set(0, 5, 0);
    controls.update();
    return;
  }
  const center = objectBounds.getCenter(new THREE.Vector3());
  const size = objectBounds.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.z, size.y * 1.25, 20);
  const distance = maxDimension / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) * 1.15;
  const direction = new THREE.Vector3(0.85, 0.58, 1).normalize();
  camera.position.copy(center).addScaledVector(direction, distance);
  controls.target.copy(center).setY(Math.max(1.5, center.y * 0.72));
  controls.update();
};

const renderBiomeCards = () => {
  biomeList.innerHTML = catalog.map((item) => {
    const names = item.mix.entries.slice(0, 3).map((entry) => entry.label).join(" · ");
    return `
      <button type="button" class="biome-card ${item.biome === active.biome ? "active" : ""}" data-biome="${item.biome}">
        <span class="terrain-chip" style="background:#${terrainColors[item.terrainPaint].toString(16).padStart(6, "0")}"></span>
        <span>
          <span class="biome-name">${labelForProcPlantId(item.biome)}</span>
          <span class="biome-meta">${labelForProcPlantId(item.terrainPaint)} · ${item.mix.entries.length} entries</span>
          <span class="biome-plants">${names}</span>
        </span>
      </button>
    `;
  }).join("");
  biomeList.querySelectorAll<HTMLButtonElement>("[data-biome]").forEach((button) => {
    button.addEventListener("click", () => selectBiome(button.dataset.biome as EcologyBiomeId));
  });
};

const renderCommunityCards = (definition: TellusBiomeDefaultDefinition) => {
  communityList.innerHTML = definition.mix.entries.map((entry, index) => {
    const genome = genomeForMixEntry(entry);
    const backend = genome.weberPenn;
    const kind = isAssetMixEntry(entry)
      ? `GLB asset · ${(entry.asset.lodPreference ?? "default").toUpperCase()}`
      : backend
        ? `Branch tree · ${labelForProcPlantId(backend.species)}`
        : `Procplant · ${labelForProcPlantId(genome.habit ?? "plant")}`;
    const backendNote = backend
      ? `Depth ${backend.maxBranchDepth ?? "default"} · stems ${backend.maxStems ?? "default"} · leaves ${backend.maxLeaves ?? "default"}`
      : isAssetMixEntry(entry)
          ? `Asset ${entry.asset.libraryId ?? entry.asset.name}`
          : `Preset ${entry.presetId ?? entry.id}`;
    return `
      <article class="community-card">
        <header><div><h3>${entry.label}</h3><div class="community-kind">${kind}</div></div><span class="community-rank">${index + 1}</span></header>
        <div class="trait-grid">
          <div><span>Weight</span><strong>${entry.weight.toFixed(2)}</strong></div>
          <div><span>Density</span><strong>${entry.density.toFixed(3)}</strong></div>
          <div><span>Scale</span><strong>${entry.scale.toFixed(2)}</strong></div>
        </div>
        <p class="backend-note">${backendNote}</p>
      </article>
    `;
  }).join("");
};

const rebuildPreview = async () => {
  const token = ++buildToken;
  clearContent();
  stageStatus.classList.remove("ready");
  stageStatus.textContent = `Building ${labelForProcPlantId(active.biome)} defaults…`;
  entryCount.textContent = String(active.mix.entries.length);
  requestRender();

  for (let index = 0; index < active.mix.entries.length; index++) {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    if (token !== buildToken) return;
    const entry = active.mix.entries[index]!;
    stageStatus.textContent = `Building ${entry.label} · ${index + 1}/${active.mix.entries.length}`;
    const genome = previewGenomeForEntry(entry);
    const object = isAssetMixEntry(entry)
      ? assetPlaceholder(entry)
      : buildProcPlantObject(genome, entry.seed, entry.environment);
    placePreview(object, genome, entry.scale, index);
    requestRender();
  }

  if (token !== buildToken) return;
  fitCamera();
  stageStatus.textContent = `${labelForProcPlantId(active.biome)} defaults ready`;
  stageStatus.classList.add("ready");
  requestRender();
};

const updateScaleButtons = () => {
  relativeButton.classList.toggle("active", scaleMode === "relative");
  specimenButton.classList.toggle("active", scaleMode === "specimen");
};

const selectBiome = (biome: EcologyBiomeId) => {
  const next = catalog.find((item) => item.biome === biome);
  if (!next || next === active) return;
  active = next;
  const url = new URL(window.location.href);
  url.searchParams.set("biome", biome);
  history.replaceState(null, "", url);
  renderSelection();
};

const renderSelection = () => {
  biomeTitle.textContent = labelForProcPlantId(active.biome);
  terrainLabel.textContent = `${labelForProcPlantId(active.terrainPaint)} terrain · ecology default`;
  groundMaterial.color.setHex(terrainColors[active.terrainPaint]);
  const sky = new THREE.Color(terrainColors[active.terrainPaint]).lerp(new THREE.Color(0xaec4c7), 0.68);
  scene.background = sky;
  if (scene.fog instanceof THREE.Fog) scene.fog.color.copy(sky);
  renderBiomeCards();
  renderCommunityCards(active);
  void rebuildPreview();
};

relativeButton.addEventListener("click", () => {
  if (scaleMode === "relative") return;
  scaleMode = "relative";
  updateScaleButtons();
  void rebuildPreview();
});
specimenButton.addEventListener("click", () => {
  if (scaleMode === "specimen") return;
  scaleMode = "specimen";
  updateScaleButtons();
  void rebuildPreview();
});
document.querySelector<HTMLButtonElement>("#reset-camera")!.addEventListener("click", () => {
  fitCamera();
  requestRender();
});

const resize = () => {
  const width = Math.max(1, stageWrap.clientWidth);
  const height = Math.max(1, stageWrap.clientHeight);
  renderer.setSize(width, height, false);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  requestRender();
};
new ResizeObserver(resize).observe(stageWrap);
window.addEventListener("keydown", (event) => {
  if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
  const index = catalog.indexOf(active);
  const offset = event.key === "ArrowRight" ? 1 : -1;
  selectBiome(catalog[(index + offset + catalog.length) % catalog.length]!.biome);
});

updateScaleButtons();
renderSelection();
resize();
