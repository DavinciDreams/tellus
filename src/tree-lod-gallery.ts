import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { configureKtx2Support, createGltfLoader } from "./tellus-generation-client";

type CandidateId =
  | "pine-pack-flat"
  | "pine-pack-textured"
  | "quaternius-pine"
  | "retro-cutout"
  | "extreme-cone"
  | "billboard"
  | "canopy-surface";

interface Candidate {
  id: CandidateId;
  label: string;
  note: string;
  url?: string;
  flatColor?: number;
}

interface LoadedCandidate {
  candidate: Candidate;
  prototype: THREE.Object3D;
  vertices: number;
  triangles: number;
  sourceHeight: number;
}

const candidates: Candidate[] = [
  {
    id: "pine-pack-flat",
    label: "Flat LOD2 Pine",
    note: "Current pine-pack geometry with one green material.",
    url: "/vegetation/pine-pack-v1/tall_conical_pine_lod2_ktx2.glb",
    flatColor: 0x4f6f34,
  },
  {
    id: "pine-pack-textured",
    label: "Textured LOD2 Pine",
    note: "Same geometry, original compressed texture.",
    url: "/vegetation/pine-pack-v1/tall_conical_pine_lod2_ktx2.glb",
  },
  {
    id: "quaternius-pine",
    label: "Quaternius Pine",
    note: "Low-poly asset-pack pine, still thousands of verts.",
    url: "/vegetation/quaternius-megakit/pine_5.gltf",
  },
  {
    id: "retro-cutout",
    label: "Retro 78v Cutout",
    note: "True tiny mesh: strong graphic silhouette, very cheap.",
    url: "/vegetation/retro-tree-pack/retro_low_1.glb",
    flatColor: 0x5f7f3e,
  },
  {
    id: "extreme-cone",
    label: "Extreme Cone",
    note: "Purpose-built ultra-far mesh for slope fill.",
    flatColor: 0x4e6f34,
  },
  {
    id: "billboard",
    label: "WebP Billboard Sim",
    note: "Thumbnail-impostor stand-in: flat far-only card.",
    flatColor: 0x526f34,
  },
  {
    id: "canopy-surface",
    label: "Canopy Surface",
    note: "Terrain-like far forest: seeded crown peaks with aligned radial shading.",
    flatColor: 0x526f34,
  },
];

const ftToM = (feet: number) => feet * 0.3048;
const mToFt = (meters: number) => meters / 0.3048;
const formatMeters = (meters: number) =>
  meters >= 1000 ? `${(meters / 1000).toFixed(2)} km` : `${Math.round(meters)} m`;
const formatFeet = (meters: number) =>
  mToFt(meters) >= 5280 ? `${(mToFt(meters) / 5280).toFixed(2)} mi` : `${Math.round(mToFt(meters))} ft`;

const root = document.getElementById("tree-lod-root");
if (!root) throw new Error("Missing #tree-lod-root");

root.innerHTML = `
  <main class="lod-page">
    <header class="lod-header">
      <div>
        <h1>Tree LOD Distance Lab</h1>
        <p>Preview pine candidates at real scene scale: dwarf, 60 ft stands, giant pines, slope-cover, and mile-ish distances.</p>
      </div>
      <a href="/" class="back-link">Back to Tellus</a>
    </header>
    <section class="toolbar" aria-label="Tree LOD controls">
      <div class="candidate-tabs"></div>
      <label>
        Tree height
        <input id="height-slider" type="range" min="4" max="275" value="90" step="1" />
        <output id="height-output">90 ft</output>
      </label>
      <label>
        Forest density
        <input id="density-slider" type="range" min="24" max="1800" value="420" step="12" />
        <output id="density-output">420</output>
      </label>
      <label>
        Slope lift
        <input id="slope-slider" type="range" min="0" max="420" value="180" step="10" />
        <output id="slope-output">180 m</output>
      </label>
      <label>
        Biome pattern
        <select id="pattern-select">
          <option value="pine-stand">Pine stand</option>
          <option value="mountain-blanket">Mountain blanket</option>
          <option value="open-slope">Open slope</option>
        </select>
      </label>
      <label>
        Camera
        <select id="camera-select">
          <option value="overview">Overview</option>
          <option value="mountain">Mountain slope</option>
          <option value="mile">One mile check</option>
        </select>
      </label>
    </section>
    <section class="height-presets" aria-label="Pine species height presets">
      <button type="button" data-height="20">Mugo 20 ft</button>
      <button type="button" data-height="35">Pinyon 35 ft</button>
      <button type="button" data-height="70">Gray 70 ft</button>
      <button type="button" data-height="90">Loblolly 90 ft</button>
      <button type="button" data-height="150">White/Ponderosa 150 ft</button>
      <button type="button" data-height="255">Sugar 255 ft</button>
    </section>
    <section class="forestry-panel" aria-label="Forestry density calculator">
      <label>
        Basal area
        <input id="basal-area-slider" type="range" min="5" max="60" value="27.6" step="0.1" />
        <output id="basal-area-output">27.6 m2/ha</output>
      </label>
      <label>
        Avg DBH
        <input id="dbh-slider" type="range" min="12" max="90" value="40" step="1" />
        <output id="dbh-output">40 cm</output>
      </label>
      <label>
        Crown diameter
        <input id="crown-slider" type="range" min="2" max="14" value="7" step="0.5" />
        <output id="crown-output">7 m</output>
      </label>
      <dl>
        <div><dt>Stems / ha</dt><dd id="stems-ha-output">-</dd></div>
        <div><dt>Avg spacing</dt><dd id="spacing-output">-</dd></div>
        <div><dt>Canopy cover</dt><dd id="canopy-output">-</dd></div>
        <div><dt>Visible patch</dt><dd id="patch-output">-</dd></div>
      </dl>
    </section>
    <section class="summary">
      <div>
        <h2 id="candidate-title">Loading</h2>
        <p id="candidate-note"></p>
      </div>
      <dl>
        <div><dt>Vertices</dt><dd id="vertices-output">-</dd></div>
        <div><dt>Triangles</dt><dd id="triangles-output">-</dd></div>
        <div><dt>Mode</dt><dd id="mode-output">-</dd></div>
      </dl>
    </section>
    <section class="stage-shell">
      <canvas id="lod-canvas" aria-label="3D tree LOD preview"></canvas>
      <div class="distance-legend" id="distance-legend"></div>
    </section>
  </main>
`;

const style = document.createElement("style");
style.textContent = `
  :root {
    color: #07111f;
    background: #f4f6f8;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }
  * { box-sizing: border-box; }
  body { margin: 0; min-width: 980px; background: #f4f6f8; }
  .lod-page { min-height: 100vh; padding: 24px 30px 30px; }
  .lod-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; margin-bottom: 20px; }
  h1 { margin: 0 0 8px; font-size: 32px; line-height: 1.05; }
  h2 { margin: 0 0 6px; font-size: 24px; }
  p { margin: 0; color: #4b5567; font-size: 18px; line-height: 1.4; }
  .back-link {
    color: #07111f;
    text-decoration: none;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 10px 14px;
    font-weight: 800;
    background: white;
  }
  .toolbar {
    display: grid;
    grid-template-columns: minmax(440px, 1fr) 180px 180px 180px 180px 180px;
    gap: 14px;
    align-items: end;
    margin-bottom: 18px;
  }
  .height-presets {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    margin: -4px 0 18px;
  }
  .height-presets button {
    padding: 8px 10px;
    font-size: 13px;
  }
  .forestry-panel {
    display: grid;
    grid-template-columns: 190px 190px 190px minmax(420px, 1fr);
    gap: 14px;
    align-items: end;
    margin: -4px 0 18px;
    padding: 12px 14px;
    border: 1px solid #d8dee8;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.72);
  }
  .forestry-panel dl {
    display: grid;
    grid-template-columns: repeat(4, minmax(84px, 1fr));
    gap: 10px;
    margin: 0;
  }
  .candidate-tabs { display: flex; flex-wrap: wrap; gap: 10px; }
  button, select {
    appearance: none;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    background: white;
    color: #07111f;
    font: inherit;
    font-weight: 800;
  }
  button { padding: 12px 14px; cursor: pointer; }
  button.active { background: #102414; color: #f7f0c8; border-color: #9ca35d; }
  label {
    display: grid;
    gap: 8px;
    color: #334155;
    font-size: 13px;
    font-weight: 900;
    text-transform: uppercase;
    letter-spacing: 0;
  }
  input[type="range"] { width: 100%; accent-color: #345f2d; }
  output { color: #07111f; font-size: 16px; text-transform: none; }
  select { height: 44px; padding: 0 12px; }
  .summary {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 24px;
    background: white;
    border: 1px solid #d8dee8;
    border-radius: 8px 8px 0 0;
    padding: 18px 22px;
  }
  .summary dl { display: grid; grid-template-columns: repeat(3, 120px); gap: 10px; margin: 0; }
  .summary div { min-width: 0; }
  dt { color: #64748b; font-size: 12px; font-weight: 900; text-transform: uppercase; }
  dd { margin: 4px 0 0; font-size: 18px; font-weight: 900; }
  .stage-shell {
    position: relative;
    height: calc(100vh - 325px);
    min-height: 500px;
    border: 1px solid #d8dee8;
    border-top: 0;
    border-radius: 0 0 8px 8px;
    overflow: hidden;
    background: #dfe7ef;
  }
  #lod-canvas { width: 100%; height: 100%; display: block; }
  .distance-legend {
    position: absolute;
    left: 16px;
    bottom: 16px;
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    max-width: min(960px, calc(100% - 32px));
    pointer-events: none;
  }
  .distance-legend span {
    display: inline-flex;
    gap: 8px;
    align-items: baseline;
    padding: 7px 9px;
    border: 1px solid rgba(15, 23, 42, 0.18);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.84);
    font-weight: 900;
  }
  .distance-legend small { color: #64748b; font-weight: 800; }
`;
document.head.appendChild(style);

const canvas = document.getElementById("lod-canvas") as HTMLCanvasElement;
const tabs = root.querySelector(".candidate-tabs") as HTMLDivElement;
const titleEl = document.getElementById("candidate-title") as HTMLElement;
const noteEl = document.getElementById("candidate-note") as HTMLElement;
const verticesEl = document.getElementById("vertices-output") as HTMLElement;
const trianglesEl = document.getElementById("triangles-output") as HTMLElement;
const modeEl = document.getElementById("mode-output") as HTMLElement;
const legendEl = document.getElementById("distance-legend") as HTMLElement;
const heightSlider = document.getElementById("height-slider") as HTMLInputElement;
const densitySlider = document.getElementById("density-slider") as HTMLInputElement;
const slopeSlider = document.getElementById("slope-slider") as HTMLInputElement;
const heightOutput = document.getElementById("height-output") as HTMLOutputElement;
const densityOutput = document.getElementById("density-output") as HTMLOutputElement;
const slopeOutput = document.getElementById("slope-output") as HTMLOutputElement;
const cameraSelect = document.getElementById("camera-select") as HTMLSelectElement;
const patternSelect = document.getElementById("pattern-select") as HTMLSelectElement;
const basalAreaSlider = document.getElementById("basal-area-slider") as HTMLInputElement;
const dbhSlider = document.getElementById("dbh-slider") as HTMLInputElement;
const crownSlider = document.getElementById("crown-slider") as HTMLInputElement;
const basalAreaOutput = document.getElementById("basal-area-output") as HTMLOutputElement;
const dbhOutput = document.getElementById("dbh-output") as HTMLOutputElement;
const crownOutput = document.getElementById("crown-output") as HTMLOutputElement;
const stemsHaOutput = document.getElementById("stems-ha-output") as HTMLElement;
const spacingOutput = document.getElementById("spacing-output") as HTMLElement;
const canopyOutput = document.getElementById("canopy-output") as HTMLElement;
const patchOutput = document.getElementById("patch-output") as HTMLElement;

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearColor(0xdfe7ef);
renderer.shadowMap.enabled = true;
configureKtx2Support(renderer);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0xdfe7ef);
scene.fog = new THREE.Fog(0xdfe7ef, 260, 1750);

const camera = new THREE.PerspectiveCamera(56, 1, 0.1, 2600);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.maxDistance = 1900;
controls.minDistance = 18;
controls.target.set(0, 12, -250);

const hemi = new THREE.HemisphereLight(0xf6fbff, 0x506143, 2.4);
scene.add(hemi);
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-80, 180, 70);
sun.castShadow = true;
scene.add(sun);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2400, 1900, 1, 1),
  new THREE.MeshStandardMaterial({ color: 0x8da468, roughness: 0.9 }),
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(0, -0.04, -760);
ground.receiveShadow = true;
scene.add(ground);

const slopeGeometry = new THREE.BufferGeometry();
const slope = new THREE.Mesh(
  slopeGeometry,
  new THREE.MeshStandardMaterial({ color: 0x6f844f, roughness: 1, side: THREE.DoubleSide }),
);
slope.receiveShadow = true;
scene.add(slope);

const updateSlopeSurface = (width: number, startZ: number, depth: number, lift: number) => {
  const padX = Math.max(80, width * 0.12);
  const nearZ = -startZ;
  const farZ = -(startZ + depth);
  const positions = new Float32Array([
    -width / 2 - padX, 0, nearZ,
    width / 2 + padX, 0, nearZ,
    -width / 2 - padX, lift, farZ,
    width / 2 + padX, lift, farZ,
  ]);
  slopeGeometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  slopeGeometry.setIndex([0, 1, 2, 2, 1, 3]);
  slopeGeometry.computeVertexNormals();
  slopeGeometry.computeBoundingSphere();
  slopeGeometry.computeBoundingBox();
  slope.visible = lift > 1;
};

const markerMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.36 });
const markerGroup = new THREE.Group();
scene.add(markerGroup);

const treeGroup = new THREE.Group();
scene.add(treeGroup);

const loader = createGltfLoader();
const loadedCache = new Map<CandidateId, Promise<LoadedCandidate>>();
let selectedId: CandidateId = "pine-pack-flat";
let activeBuildToken = 0;
let completedBuildToken = 0;
let lastBuildMs = 0;

const distanceMarkers = [
  { label: "near", meters: 35 },
  { label: "mid", meters: 120 },
  { label: "slope", meters: 420 },
  { label: "far ridge", meters: 850 },
  { label: "one mile", meters: 1609 },
];

const random01 = (seed: number) => {
  let x = seed | 0;
  x ^= x << 13;
  x ^= x >>> 17;
  x ^= x << 5;
  return ((x >>> 0) % 10000) / 10000;
};

const updateForestryReadout = (patchWidth: number, patchDepth: number) => {
  const basalArea = Number(basalAreaSlider.value);
  const dbhCm = Number(dbhSlider.value);
  const crownDiameter = Number(crownSlider.value);
  const dbhMeters = dbhCm / 100;
  const basalAreaPerTree = Math.PI * Math.pow(dbhMeters * 0.5, 2);
  const stemsPerHa = basalAreaPerTree > 0 ? basalArea / basalAreaPerTree : 0;
  const spacing = stemsPerHa > 0 ? Math.sqrt(10_000 / stemsPerHa) : 0;
  const crownArea = Math.PI * Math.pow(crownDiameter * 0.5, 2);
  const canopyCover = Math.min(100, (stemsPerHa * crownArea / 10_000) * 100);
  const patchHa = Math.max(0, (patchWidth * patchDepth) / 10_000);
  const patchStems = stemsPerHa * patchHa;

  basalAreaOutput.textContent = `${basalArea.toFixed(1)} m2/ha`;
  dbhOutput.textContent = `${Math.round(dbhCm)} cm`;
  crownOutput.textContent = `${crownDiameter.toFixed(1)} m`;
  stemsHaOutput.textContent = Math.round(stemsPerHa).toLocaleString();
  spacingOutput.textContent = `${spacing.toFixed(1)} m`;
  canopyOutput.textContent = `${Math.round(canopyCover)}%`;
  patchOutput.textContent = `${patchHa.toFixed(1)} ha / ${Math.round(patchStems).toLocaleString()} stems`;
};

const forestryStats = () => {
  const basalArea = Number(basalAreaSlider.value);
  const dbhMeters = Number(dbhSlider.value) / 100;
  const crownDiameter = Number(crownSlider.value);
  const basalAreaPerTree = Math.PI * Math.pow(dbhMeters * 0.5, 2);
  const stemsPerHa = basalAreaPerTree > 0 ? basalArea / basalAreaPerTree : 0;
  return { basalArea, dbhMeters, crownDiameter, stemsPerHa };
};

const makeFlatMaterial = (color: number) =>
  new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide });

const countMeshStats = (rootObj: THREE.Object3D) => {
  let vertices = 0;
  let triangles = 0;
  rootObj.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const position = geometry.getAttribute("position");
    vertices += position?.count ?? 0;
    triangles += geometry.index ? Math.floor(geometry.index.count / 3) : Math.floor((position?.count ?? 0) / 3);
  });
  return { vertices, triangles };
};

const normalizePrototype = (
  object: THREE.Object3D,
  candidate: Candidate,
): { prototype: THREE.Object3D; sourceHeight: number; vertices: number; triangles: number } => {
  object.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(object);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const sourceHeight = Math.max(size.y, 0.001);
  object.position.sub(new THREE.Vector3(center.x, bounds.min.y, center.z));
  if (candidate.flatColor && candidate.id !== "billboard") {
    const material = makeFlatMaterial(candidate.flatColor);
    object.traverse((child) => {
      if (!(child instanceof THREE.Mesh)) return;
      child.material = material;
      child.castShadow = false;
      child.receiveShadow = true;
    });
  }
  object.traverse((child) => {
    if (!(child instanceof THREE.Mesh)) return;
    child.castShadow = false;
    child.receiveShadow = true;
    child.frustumCulled = true;
  });
  const stats = countMeshStats(object);
  return { prototype: object, sourceHeight, ...stats };
};

const makeExtremeConeTree = (candidate: Candidate) => {
  const group = new THREE.Group();
  const trunk = new THREE.Mesh(
    new THREE.CylinderGeometry(0.055, 0.09, 0.42, 5),
    new THREE.MeshLambertMaterial({ color: 0x5a3a22 }),
  );
  trunk.position.y = 0.21;
  group.add(trunk);
  const mat = makeFlatMaterial(candidate.flatColor ?? 0x4e6f34);
  for (let i = 0; i < 4; i++) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.34 - i * 0.055, 0.38, 7), mat);
    cone.position.y = 0.43 + i * 0.18;
    cone.rotation.y = i * 0.42;
    group.add(cone);
  }
  return group;
};

const makeBillboardTree = (candidate: Candidate) => {
  const group = new THREE.Group();
  const texture = new THREE.CanvasTexture(makeBillboardCanvas(candidate.flatColor ?? 0x526f34));
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    alphaTest: 0.2,
    side: THREE.DoubleSide,
  });
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(0.76, 1), material);
  plane.position.y = 0.5;
  group.add(plane);
  return group;
};

const makeCanopyPlaceholder = () => {
  const group = new THREE.Group();
  group.name = "canopy-surface-placeholder";
  return group;
};

const makeBillboardCanvas = (color: number) => {
  const canvasEl = document.createElement("canvas");
  canvasEl.width = 256;
  canvasEl.height = 384;
  const ctx = canvasEl.getContext("2d");
  if (!ctx) return canvasEl;
  ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
  const c = new THREE.Color(color);
  ctx.fillStyle = `rgb(${Math.round(c.r * 255)}, ${Math.round(c.g * 255)}, ${Math.round(c.b * 255)})`;
  ctx.beginPath();
  ctx.moveTo(128, 14);
  ctx.bezierCurveTo(176, 74, 206, 190, 210, 312);
  ctx.bezierCurveTo(170, 348, 86, 348, 46, 312);
  ctx.bezierCurveTo(50, 190, 80, 74, 128, 14);
  ctx.fill();
  ctx.fillStyle = "rgba(55, 36, 21, 0.9)";
  ctx.fillRect(118, 250, 20, 108);
  ctx.fillStyle = "rgba(255,255,255,0.12)";
  ctx.beginPath();
  ctx.moveTo(142, 48);
  ctx.bezierCurveTo(174, 116, 184, 208, 178, 300);
  ctx.lineTo(156, 300);
  ctx.bezierCurveTo(160, 196, 154, 112, 142, 48);
  ctx.fill();
  return canvasEl;
};

const canopyBaseColor = new THREE.Color(0x486a32);
const canopyTipColor = new THREE.Color(0x86a45d);
const canopyShadeColor = new THREE.Color(0x253d22);

const buildCanopySurface = (
  width: number,
  startZ: number,
  depth: number,
  slopeLift: number,
  treeHeightMeters: number,
): { mesh: THREE.Mesh; vertices: number; triangles: number; crownSeeds: number } => {
  const { crownDiameter, stemsPerHa } = forestryStats();
  const segX = 120;
  const segZ = 120;
  const vertexCount = (segX + 1) * (segZ + 1);
  const positions = new Float32Array(vertexCount * 3);
  const colors = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  const patchHa = Math.max(0.01, (width * depth) / 10_000);
  const impliedStems = stemsPerHa * patchHa;
  const crownSeedCount = Math.max(24, Math.min(900, Math.round(impliedStems / 18)));
  const radiusBase = Math.max(2.5, crownDiameter * 0.55);
  const canopyFloor = treeHeightMeters * 0.42;
  const peakHeight = Math.max(3.5, Math.min(treeHeightMeters * 0.42, crownDiameter * 1.8));
  const crowns: Array<{ x: number; z: number; r: number; h: number; tint: number }> = [];
  const columns = Math.max(1, Math.ceil(Math.sqrt(crownSeedCount * (width / depth))));
  const rows = Math.max(1, Math.ceil(crownSeedCount / columns));
  for (let i = 0; i < crownSeedCount; i++) {
    const col = i % columns;
    const row = Math.floor(i / columns);
    const rx = random01(i * 4099 + 13);
    const rz = random01(i * 7727 + 29);
    const rv = random01(i * 9137 + 47);
    crowns.push({
      x: -width / 2 + ((col + 0.5 + (rx - 0.5) * 0.9) / columns) * width,
      z: startZ + ((row + 0.5 + (rz - 0.5) * 0.9) / rows) * depth,
      r: radiusBase * THREE.MathUtils.lerp(0.65, 1.45, rv),
      h: peakHeight * THREE.MathUtils.lerp(0.65, 1.35, random01(i * 1871 + 101)),
      tint: random01(i * 6421 + 5),
    });
  }

  const color = new THREE.Color();
  let ptr = 0;
  let cptr = 0;
  for (let iz = 0; iz <= segZ; iz++) {
    const zT = iz / segZ;
    const z = startZ + zT * depth;
    const groundY = zT * slopeLift;
    for (let ix = 0; ix <= segX; ix++) {
      const xT = ix / segX;
      const x = -width / 2 + xT * width;
      let crownY = 0;
      let tint = 0.5;
      let cover = 0;
      for (const crown of crowns) {
        const dx = x - crown.x;
        const dz = z - crown.z;
        const d = Math.hypot(dx, dz);
        if (d > crown.r) continue;
        const t = 1 - d / crown.r;
        const peak = Math.pow(t, 1.55) * crown.h;
        if (peak > crownY) {
          crownY = peak;
          tint = crown.tint;
        }
        cover = Math.max(cover, t);
      }
      const noise = (random01(Math.round(x * 7) * 1933 + Math.round(z * 5) * 2791) - 0.5) * 0.18;
      const y = groundY + canopyFloor + crownY;
      positions[ptr++] = x;
      positions[ptr++] = y;
      positions[ptr++] = -z;
      color.copy(canopyShadeColor).lerp(canopyBaseColor, Math.max(0.15, cover)).lerp(canopyTipColor, Math.min(1, crownY / peakHeight) * 0.45);
      color.offsetHSL((tint - 0.5) * 0.035, (tint - 0.5) * 0.12, noise);
      colors[cptr++] = color.r;
      colors[cptr++] = color.g;
      colors[cptr++] = color.b;
    }
  }
  for (let iz = 0; iz < segZ; iz++) {
    for (let ix = 0; ix < segX; ix++) {
      const a = iz * (segX + 1) + ix;
      const b = a + 1;
      const c = a + segX + 1;
      const d = c + 1;
      indices.push(a, b, c, c, b, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();
  geometry.computeBoundingBox();
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: true,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.receiveShadow = true;
  return {
    mesh,
    vertices: vertexCount,
    triangles: indices.length / 3,
    crownSeeds: crownSeedCount,
  };
};

const loadCandidate = (candidate: Candidate): Promise<LoadedCandidate> => {
  const cached = loadedCache.get(candidate.id);
  if (cached) return cached;
  const promise = (async () => {
    if (candidate.id === "extreme-cone") {
      const normalized = normalizePrototype(makeExtremeConeTree(candidate), candidate);
      return { candidate, ...normalized };
    }
    if (candidate.id === "billboard") {
      const normalized = normalizePrototype(makeBillboardTree(candidate), candidate);
      return { candidate, ...normalized };
    }
    if (candidate.id === "canopy-surface") {
      const normalized = normalizePrototype(makeCanopyPlaceholder(), candidate);
      return { candidate, ...normalized };
    }
    if (!candidate.url) throw new Error(`Missing URL for ${candidate.label}`);
    const gltf = await loader.loadAsync(candidate.url);
    const normalized = normalizePrototype(gltf.scene, candidate);
    return { candidate, ...normalized };
  })();
  loadedCache.set(candidate.id, promise);
  return promise;
};

const clearObject = (object: THREE.Object3D) => {
  while (object.children.length) object.remove(object.children[0]!);
};

const clonePrototype = (loaded: LoadedCandidate, heightMeters: number) => {
  const clone = loaded.prototype.clone(true);
  clone.scale.setScalar(heightMeters / loaded.sourceHeight);
  clone.updateMatrixWorld(true);
  return clone;
};

const placeTree = (
  loaded: LoadedCandidate,
  heightMeters: number,
  x: number,
  z: number,
  yaw: number,
  scaleJitter = 1,
) => {
  const tree = clonePrototype(loaded, heightMeters * scaleJitter);
  tree.position.set(x, 0, -z);
  tree.rotation.y = yaw;
  if (loaded.candidate.id === "billboard") {
    tree.lookAt(camera.position.x, tree.position.y, camera.position.z);
  }
  treeGroup.add(tree);
};

const projectedPixelHeight = (heightMeters: number, distanceMeters: number) => {
  const verticalFov = THREE.MathUtils.degToRad(camera.fov);
  const px = renderer.domElement.clientHeight || 1;
  return (heightMeters / (2 * distanceMeters * Math.tan(verticalFov / 2))) * px;
};

const makeMarker = (distance: number) => {
  const marker = new THREE.Mesh(new THREE.PlaneGeometry(180, 0.45), markerMaterial);
  marker.rotation.x = -Math.PI / 2;
  marker.position.set(0, 0.012, -distance);
  markerGroup.add(marker);
};

const rebuildMarkers = () => {
  clearObject(markerGroup);
  for (const marker of distanceMarkers) makeMarker(marker.meters);
};

const rebuildScene = async () => {
  const buildStartedAt = performance.now();
  const token = ++activeBuildToken;
  clearObject(treeGroup);
  const candidate = candidates.find((item) => item.id === selectedId) ?? candidates[0]!;
  titleEl.textContent = candidate.label;
  noteEl.textContent = candidate.note;
  modeEl.textContent = "Loading";
  const loaded = await loadCandidate(candidate);
  if (token !== activeBuildToken) return;

  const heightFeet = Number(heightSlider.value);
  const heightMeters = ftToM(heightFeet);
  heightOutput.textContent = `${heightFeet} ft / ${heightMeters.toFixed(1)} m`;
  densityOutput.textContent = densitySlider.value;
  slopeOutput.textContent = `${slopeSlider.value} m`;

  verticesEl.textContent = loaded.vertices.toLocaleString();
  trianglesEl.textContent = loaded.triangles.toLocaleString();
  modeEl.textContent = candidate.id === "canopy-surface" ? "canopy mesh" : candidate.id === "billboard" ? "billboard" : candidate.flatColor ? "flat material" : "textured";

  const count = Number(densitySlider.value);
  const pattern = patternSelect.value;
  const slopeLiftMax = Number(slopeSlider.value);
  const spread =
    pattern === "pine-stand"
      ? { width: 560, depth: 520, startZ: 70, slope: 0, nearBias: 1.55, jitter: 0.72 }
      : pattern === "mountain-blanket"
        ? { width: 1080, depth: 1180, startZ: 360, slope: slopeLiftMax, nearBias: 0.9, jitter: 0.92 }
        : { width: 720, depth: 900, startZ: 520, slope: slopeLiftMax * 0.72, nearBias: 1, jitter: 0.82 };
  updateSlopeSurface(spread.width, spread.startZ, spread.depth, spread.slope);
  updateForestryReadout(spread.width, spread.depth);

  if (candidate.id === "canopy-surface") {
    const canopy = buildCanopySurface(spread.width, spread.startZ, spread.depth, spread.slope, heightMeters);
    canopy.mesh.name = "tellus-canopy-surface-preview";
    treeGroup.add(canopy.mesh);
    verticesEl.textContent = canopy.vertices.toLocaleString();
    trianglesEl.textContent = canopy.triangles.toLocaleString();
    modeEl.textContent = `${canopy.crownSeeds.toLocaleString()} crown peaks`;
  } else {
    for (let i = 0; i < distanceMarkers.length; i++) {
      const marker = distanceMarkers[i]!;
      placeTree(loaded, heightMeters, -74 + i * 37, marker.meters, i * 0.45, 1);
    }
  }

  const columns = Math.max(1, Math.ceil(Math.sqrt(count * (spread.width / spread.depth))));
  const rows = Math.max(1, Math.ceil(count / columns));
  const cellW = spread.width / columns;
  const cellD = spread.depth / rows;
  for (let i = 0; candidate.id !== "canopy-surface" && i < count; i++) {
    const r1 = random01(i * 7349 + 17);
    const r2 = random01(i * 9151 + 31);
    const r3 = random01(i * 4919 + 79);
    const col = i % columns;
    const row = Math.floor(i / columns);
    const rowT = rows <= 1 ? 0 : row / (rows - 1);
    const zT = Math.pow(rowT, spread.nearBias);
    const x = -spread.width / 2 + (col + 0.5 + (r1 - 0.5) * spread.jitter) * cellW;
    const z = spread.startZ + (zT * spread.depth) + (r2 - 0.5) * cellD * spread.jitter;
    const slopeLift = Math.max(0, (z - spread.startZ) / spread.depth) * spread.slope;
    const scale = pattern === "pine-stand" ? 0.82 + r3 * 0.42 : 0.62 + r3 * 0.76;
    placeTree(loaded, heightMeters, x, z, r2 * Math.PI * 2, scale);
    const tree = treeGroup.children[treeGroup.children.length - 1];
    if (tree) tree.position.y = slopeLift;
  }

  legendEl.innerHTML = distanceMarkers
    .map((marker) => {
      const px = projectedPixelHeight(heightMeters, marker.meters);
      return `<span>${marker.label}<small>${formatFeet(marker.meters)} / ${Math.max(1, Math.round(px))} px</small></span>`;
    })
    .join("");
  completedBuildToken = token;
  lastBuildMs = performance.now() - buildStartedAt;
};

const setCameraMode = () => {
  const mode = cameraSelect.value;
  if (mode === "mountain") {
    camera.position.set(0, 78, 260);
    controls.target.set(0, 74, -940);
  } else if (mode === "mile") {
    camera.position.set(0, 28, 20);
    controls.target.set(0, 12, -1609);
  } else {
    if (patternSelect.value === "pine-stand") {
      camera.position.set(48, 18, 58);
      controls.target.set(0, 16, -190);
    } else {
      camera.position.set(120, 56, 120);
      controls.target.set(0, 28, -470);
    }
  }
  controls.update();
};

for (const candidate of candidates) {
  const button = document.createElement("button");
  button.type = "button";
  button.textContent = candidate.label;
  button.addEventListener("click", () => {
    selectedId = candidate.id;
    for (const child of tabs.querySelectorAll("button")) child.classList.toggle("active", child === button);
    void rebuildScene();
  });
  if (candidate.id === selectedId) button.classList.add("active");
  tabs.appendChild(button);
}

heightSlider.addEventListener("input", () => void rebuildScene());
densitySlider.addEventListener("input", () => void rebuildScene());
slopeSlider.addEventListener("input", () => void rebuildScene());
for (const slider of [basalAreaSlider, dbhSlider, crownSlider]) {
  slider.addEventListener("input", () => void rebuildScene());
}
patternSelect.addEventListener("change", () => {
  setCameraMode();
  void rebuildScene();
});
for (const button of root.querySelectorAll<HTMLButtonElement>("[data-height]")) {
  button.addEventListener("click", () => {
    const height = Number(button.dataset.height);
    if (!Number.isFinite(height)) return;
    heightSlider.value = String(height);
    void rebuildScene();
  });
}
cameraSelect.addEventListener("change", () => {
  setCameraMode();
  void rebuildScene();
});

const resize = () => {
  const rect = canvas.getBoundingClientRect();
  renderer.setSize(Math.max(1, rect.width), Math.max(1, rect.height), false);
  camera.aspect = Math.max(1, rect.width) / Math.max(1, rect.height);
  camera.updateProjectionMatrix();
};

const animate = () => {
  resize();
  controls.update();
  for (const child of treeGroup.children) {
    if (selectedId === "billboard") child.lookAt(camera.position.x, child.position.y, camera.position.z);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
};

window.__tellusTreeLodPerf = () => ({
  ready: completedBuildToken === activeBuildToken && completedBuildToken > 0,
  candidateId: selectedId,
  density: Number(densitySlider.value),
  treeObjects: treeGroup.children.length,
  buildMs: Math.round(lastBuildMs * 10) / 10,
  renderer: {
    calls: renderer.info.render.calls,
    triangles: renderer.info.render.triangles,
    geometries: renderer.info.memory.geometries,
    textures: renderer.info.memory.textures,
  },
});

rebuildMarkers();
setCameraMode();
void rebuildScene();
animate();
