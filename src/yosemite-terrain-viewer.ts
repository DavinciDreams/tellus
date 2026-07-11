import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

interface TerrainManifest {
  width: number;
  height: number;
  span: number;
  segments: number;
  source?: {
    minElevationMeters?: number;
    maxElevationMeters?: number;
    referenceElevationMeters?: number;
    metersPerWorldUnitY?: number;
    cliffBoost?: number;
    bbox?: number[];
  };
}

interface TerrainChunk {
  cx: number;
  cz: number;
  segments: number;
  sculptOffsets: number[];
  paint?: number[];
}

type ColorMode = "realistic" | "satellite" | "elevation" | "slope" | "paint";

const root = document.querySelector<HTMLDivElement>("#yosemite-terrain-root");
if (!root) throw new Error("Missing #yosemite-terrain-root");

const terrainId = (() => {
  const raw = new URLSearchParams(window.location.search).get("terrain") ?? "yosemite";
  return /^[a-z0-9-]+$/i.test(raw) ? raw.toLowerCase() : "yosemite";
})();
const terrainBasePath = `/terrain/${terrainId}`;
const terrainLabel = terrainId
  .split("-")
  .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
  .join(" ");

const viewerDefaults = terrainId === "grand-canyon"
  ? {
      mode: "satellite" as ColorMode,
      satelliteBlend: 1,
      verticalScale: 0.45,
      rockContrast: 0.8,
      forestTint: 0.25,
      sunAzimuth: -28,
      camera: [420, 420, 1180] as const,
      targetLift: 8,
    }
  : {
      mode: "realistic" as ColorMode,
      satelliteBlend: 0.85,
      verticalScale: 1.8,
      rockContrast: 1.25,
      forestTint: 0.75,
      sunAzimuth: -45,
      camera: [260, 260, 540] as const,
      targetLift: 35,
    };

const style = document.createElement("style");
style.textContent = `
  html, body, #yosemite-terrain-root {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #0b0d10;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .ytv-hud {
    position: fixed;
    inset: 18px auto auto 18px;
    z-index: 3;
    color: #f8fafc;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.55);
    pointer-events: none;
  }

  .ytv-title {
    font-size: 26px;
    font-weight: 800;
    line-height: 1.05;
  }

  .ytv-subtitle {
    margin-top: 4px;
    color: rgba(248, 250, 252, 0.78);
    font-size: 13px;
    font-weight: 600;
  }

  .ytv-panel {
    position: fixed;
    left: 18px;
    bottom: 18px;
    z-index: 4;
    width: min(520px, calc(100vw - 36px));
    display: grid;
    gap: 10px;
    padding: 14px;
    background: rgba(8, 11, 14, 0.78);
    border: 1px solid rgba(255, 255, 255, 0.16);
    border-radius: 8px;
    color: #f8fafc;
    backdrop-filter: blur(12px);
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.35);
  }

  .ytv-row {
    display: grid;
    grid-template-columns: 132px 1fr 54px;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .ytv-row span {
    color: rgba(248, 250, 252, 0.76);
    font-weight: 650;
  }

  .ytv-row output {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: #fef3c7;
    font-weight: 800;
  }

  .ytv-row input[type="range"] {
    width: 100%;
    accent-color: #facc15;
  }

  .ytv-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ytv-buttons button {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    padding: 8px 10px;
    font-weight: 750;
    cursor: pointer;
  }

  .ytv-buttons button.active {
    background: #facc15;
    border-color: #fde047;
    color: #111827;
  }

  .ytv-stats {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 3;
    color: rgba(248, 250, 252, 0.86);
    background: rgba(8, 11, 14, 0.66);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.55;
    font-variant-numeric: tabular-nums;
    backdrop-filter: blur(10px);
  }

  canvas {
    display: block;
  }
`;
document.head.append(style);

root.innerHTML = `
  <div class="ytv-hud">
    <div class="ytv-title">${terrainLabel} Terrain Viewer</div>
    <div class="ytv-subtitle">Raw static DEM chunks, no Tellus world defaults</div>
  </div>
  <div class="ytv-panel" aria-label="Terrain viewer controls">
    <div class="ytv-buttons" data-mode-buttons>
      <button type="button" data-mode="realistic" class="${viewerDefaults.mode === "realistic" ? "active" : ""}">Realistic</button>
      <button type="button" data-mode="satellite" class="${viewerDefaults.mode === "satellite" ? "active" : ""}">Satellite</button>
      <button type="button" data-mode="elevation" class="${viewerDefaults.mode === "elevation" ? "active" : ""}">Elevation</button>
      <button type="button" data-mode="slope" class="${viewerDefaults.mode === "slope" ? "active" : ""}">Slope</button>
      <button type="button" data-mode="paint" class="${viewerDefaults.mode === "paint" ? "active" : ""}">Tellus Paint</button>
    </div>
    <label class="ytv-row">
      <span>Satellite blend</span>
      <input data-control="satelliteBlend" type="range" min="0" max="1" step="0.05" value="${viewerDefaults.satelliteBlend}" />
      <output data-output="satelliteBlend">${viewerDefaults.satelliteBlend.toFixed(2)}</output>
    </label>
    <label class="ytv-row">
      <span>Vertical scale</span>
      <input data-control="verticalScale" type="range" min="0.2" max="4" step="0.05" value="${viewerDefaults.verticalScale}" />
      <output data-output="verticalScale">${viewerDefaults.verticalScale.toFixed(2)}x</output>
    </label>
    <label class="ytv-row">
      <span>Granite contrast</span>
      <input data-control="rockContrast" type="range" min="0" max="2" step="0.05" value="${viewerDefaults.rockContrast}" />
      <output data-output="rockContrast">${viewerDefaults.rockContrast.toFixed(2)}</output>
    </label>
    <label class="ytv-row">
      <span>Forest tint</span>
      <input data-control="forestTint" type="range" min="0" max="1.5" step="0.05" value="${viewerDefaults.forestTint}" />
      <output data-output="forestTint">${viewerDefaults.forestTint.toFixed(2)}</output>
    </label>
    <label class="ytv-row">
      <span>Sun angle</span>
      <input data-control="sunAzimuth" type="range" min="-180" max="180" step="1" value="${viewerDefaults.sunAzimuth}" />
      <output data-output="sunAzimuth">${viewerDefaults.sunAzimuth}</output>
    </label>
  </div>
  <div class="ytv-stats" data-stats>Loading terrain...</div>
`;

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
root.append(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0b1020);

const camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 8000);
camera.position.set(340, 330, 720);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.maxPolarAngle = Math.PI * 0.49;
controls.minDistance = 80;
controls.maxDistance = 2600;

const sun = new THREE.DirectionalLight(0xffffff, 2.6);
sun.position.set(-360, 520, 440);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 50;
sun.shadow.camera.far = 2000;
sun.shadow.camera.left = -900;
sun.shadow.camera.right = 900;
sun.shadow.camera.top = 900;
sun.shadow.camera.bottom = -900;
scene.add(sun);
scene.add(new THREE.HemisphereLight(0xdcecff, 0x252014, 0.65));

const fill = new THREE.DirectionalLight(0x9fc3ff, 0.55);
fill.position.set(520, 220, -260);
scene.add(fill);

const material = new THREE.MeshStandardMaterial({
  vertexColors: true,
  roughness: 0.88,
  metalness: 0,
});

let terrainMesh: THREE.Mesh | null = null;
let heights: Float32Array | null = null;
let paints: Uint8Array | null = null;
let slopes: Float32Array | null = null;
let geometryMeta: {
  widthVertices: number;
  heightVertices: number;
  widthWorld: number;
  heightWorld: number;
  minHeight: number;
  maxHeight: number;
  manifest: TerrainManifest;
} | null = null;

let colorMode: ColorMode = viewerDefaults.mode;
let satelliteBlend = viewerDefaults.satelliteBlend;
let verticalScale = viewerDefaults.verticalScale;
let rockContrast = viewerDefaults.rockContrast;
let forestTint = viewerDefaults.forestTint;
let sunAzimuth = viewerDefaults.sunAzimuth;
let satelliteTexture: THREE.CanvasTexture | null = null;
let satelliteSourceCanvas: HTMLCanvasElement | null = null;
let satelliteDisplayCanvas: HTMLCanvasElement | null = null;

const colorA = new THREE.Color();
const colorB = new THREE.Color();
const colorC = new THREE.Color();

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function smootherstep(edge0: number, edge1: number, value: number): number {
  const x = clamp01((value - edge0) / (edge1 - edge0));
  return x * x * x * (x * (x * 6 - 15) + 10);
}

function paintColor(code: number): THREE.Color {
  switch (code) {
    case 1: return colorA.set(0x8fa65f);
    case 4: return colorA.set(0x9c927e);
    case 10: return colorA.set(0xc5c8c3);
    case 11: return colorA.set(0xe6edf2);
    default: return colorA.set(0x8b8064);
  }
}

function lonToTileX(lon: number, zoom: number): number {
  return ((lon + 180) / 360) * 2 ** zoom;
}

function latToTileY(lat: number, zoom: number): number {
  const latRad = THREE.MathUtils.degToRad(lat);
  return ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * 2 ** zoom;
}

function tileUrl(x: number, y: number, zoom: number): string {
  const server = (x + y) % 4;
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${zoom}/${y}/${x}?server=${server}`;
}

async function loadImage(url: string): Promise<HTMLImageElement> {
  const image = new Image();
  image.crossOrigin = "anonymous";
  image.decoding = "async";
  image.src = url;
  await image.decode();
  return image;
}

function rebuildSatelliteTexture() {
  if (!satelliteSourceCanvas) return;
  if (!satelliteDisplayCanvas) {
    satelliteDisplayCanvas = document.createElement("canvas");
    satelliteDisplayCanvas.width = satelliteSourceCanvas.width;
    satelliteDisplayCanvas.height = satelliteSourceCanvas.height;
  }
  const ctx = satelliteDisplayCanvas.getContext("2d");
  if (!ctx) return;
  ctx.globalAlpha = 1;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, satelliteDisplayCanvas.width, satelliteDisplayCanvas.height);
  ctx.globalAlpha = satelliteBlend;
  ctx.drawImage(satelliteSourceCanvas, 0, 0);
  ctx.globalAlpha = 1;
  if (!satelliteTexture) {
    satelliteTexture = new THREE.CanvasTexture(satelliteDisplayCanvas);
    satelliteTexture.colorSpace = THREE.SRGBColorSpace;
    satelliteTexture.anisotropy = renderer.capabilities.getMaxAnisotropy();
    satelliteTexture.wrapS = THREE.ClampToEdgeWrapping;
    satelliteTexture.wrapT = THREE.ClampToEdgeWrapping;
  }
  satelliteTexture.needsUpdate = true;
  material.map = colorMode === "satellite" || satelliteBlend > 0 ? satelliteTexture : null;
  material.needsUpdate = true;
  rebuildColors();
}

async function loadSatelliteTexture(manifest: TerrainManifest): Promise<void> {
  const bbox = manifest.source?.bbox;
  if (!bbox || bbox.length !== 4) return;
  const [minLon, minLat, maxLon, maxLat] = bbox;
  const zoom = 13;
  const minTileX = Math.floor(lonToTileX(minLon, zoom));
  const maxTileX = Math.floor(lonToTileX(maxLon, zoom));
  const minTileY = Math.floor(latToTileY(maxLat, zoom));
  const maxTileY = Math.floor(latToTileY(minLat, zoom));
  const tileSize = 256;
  const tileCols = maxTileX - minTileX + 1;
  const tileRows = maxTileY - minTileY + 1;
  const tileCanvas = document.createElement("canvas");
  tileCanvas.width = tileCols * tileSize;
  tileCanvas.height = tileRows * tileSize;
  const tileCtx = tileCanvas.getContext("2d");
  if (!tileCtx) return;

  await Promise.all(
    Array.from({ length: tileCols * tileRows }, async (_, index) => {
      const tx = minTileX + (index % tileCols);
      const ty = minTileY + Math.floor(index / tileCols);
      try {
        const image = await loadImage(tileUrl(tx, ty, zoom));
        tileCtx.drawImage(image, (tx - minTileX) * tileSize, (ty - minTileY) * tileSize, tileSize, tileSize);
      } catch (error) {
        console.warn("Satellite tile failed", tx, ty, error);
      }
    }),
  );

  const cropLeft = (lonToTileX(minLon, zoom) - minTileX) * tileSize;
  const cropRight = (lonToTileX(maxLon, zoom) - minTileX) * tileSize;
  const cropTop = (latToTileY(maxLat, zoom) - minTileY) * tileSize;
  const cropBottom = (latToTileY(minLat, zoom) - minTileY) * tileSize;
  const canvas = document.createElement("canvas");
  canvas.width = 4096;
  canvas.height = 2048;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.drawImage(
    tileCanvas,
    cropLeft,
    cropTop,
    Math.max(1, cropRight - cropLeft),
    Math.max(1, cropBottom - cropTop),
    0,
    0,
    canvas.width,
    canvas.height,
  );
  satelliteTexture?.dispose();
  satelliteTexture = null;
  satelliteSourceCanvas = canvas;
  satelliteDisplayCanvas = null;
  rebuildSatelliteTexture();
  updateStats();
}

function terrainColor(height: number, slope: number, paint: number, index: number): THREE.Color {
  if (!geometryMeta) return colorA.set(0x888888);
  const t = clamp01((height - geometryMeta.minHeight) / Math.max(1, geometryMeta.maxHeight - geometryMeta.minHeight));
  if (colorMode === "satellite") return colorA.set(0xffffff);
  if (colorMode === "elevation") {
    colorA.set(0x264653).lerp(colorB.set(0xf4a261), t);
    return colorA.lerp(colorC.set(0xf4f1de), smootherstep(0.72, 1, t));
  }
  if (colorMode === "slope") {
    colorA.set(0x1f7a4a).lerp(colorB.set(0xeeeeee), clamp01(slope * 1.85));
    return colorA;
  }
  if (colorMode === "paint") return paintColor(paint);

  const rock = smootherstep(0.18, 0.54, slope) * rockContrast;
  const forest = (1 - smootherstep(0.2, 0.62, slope)) * (1 - smootherstep(0.68, 0.96, t)) * forestTint;
  const snow = smootherstep(0.76, 1, t);
  const meadow = (1 - rock) * (1 - snow) * (0.35 + 0.65 * (1 - forest));
  const noise = Math.sin(index * 12.9898) * 43758.5453;
  const grain = (noise - Math.floor(noise) - 0.5) * 0.075;

  colorA.set(0x7d8763).lerp(colorB.set(0xa7a071), meadow);
  colorA.lerp(colorB.set(0x3f5639), clamp01(forest));
  colorA.lerp(colorB.set(0xb7b4aa), clamp01(rock));
  colorA.lerp(colorB.set(0xf2f0e8), clamp01(snow));
  colorA.offsetHSL(0, 0, grain);
  return colorA;
}

function rebuildColors() {
  if (!terrainMesh || !geometryMeta || !heights || !paints || !slopes) return;
  const colors = terrainMesh.geometry.getAttribute("color") as THREE.BufferAttribute;
  for (let i = 0; i < heights.length; i += 1) {
    const color = terrainColor(heights[i]!, slopes[i]!, paints[i]!, i);
    colors.setXYZ(i, color.r, color.g, color.b);
  }
  colors.needsUpdate = true;
}

function updateVerticalScale() {
  if (!terrainMesh || !heights) return;
  const positions = terrainMesh.geometry.getAttribute("position") as THREE.BufferAttribute;
  for (let i = 0; i < heights.length; i += 1) {
    positions.setY(i, heights[i]! * verticalScale);
  }
  positions.needsUpdate = true;
  terrainMesh.geometry.computeVertexNormals();
  rebuildColors();
}

async function loadTerrain() {
  const manifest = await fetch(`${terrainBasePath}/manifest.json`, { cache: "no-store" }).then((res) => {
    if (!res.ok) throw new Error(`manifest ${res.status}`);
    return res.json() as Promise<TerrainManifest>;
  });
  const chunkSize = manifest.segments + 1;
  const widthVertices = manifest.width * manifest.segments + 1;
  const heightVertices = manifest.height * manifest.segments + 1;
  const widthWorld = manifest.width * manifest.span;
  const heightWorld = manifest.height * manifest.span;
  heights = new Float32Array(widthVertices * heightVertices);
  paints = new Uint8Array(widthVertices * heightVertices);

  const chunks = await Promise.all(
    Array.from({ length: manifest.width * manifest.height }, async (_, i) => {
      const cx = i % manifest.width;
      const cz = Math.floor(i / manifest.width);
      const res = await fetch(`${terrainBasePath}/chunks/${cx}_${cz}.json`, { cache: "no-store" });
      if (!res.ok) throw new Error(`chunk ${cx}_${cz} ${res.status}`);
      return res.json() as Promise<TerrainChunk>;
    }),
  );

  for (const chunk of chunks) {
    for (let z = 0; z < chunkSize; z += 1) {
      for (let x = 0; x < chunkSize; x += 1) {
        const gx = chunk.cx * manifest.segments + x;
        const gz = chunk.cz * manifest.segments + z;
        const globalIndex = gz * widthVertices + gx;
        const localIndex = z * chunkSize + x;
        heights[globalIndex] = chunk.sculptOffsets[localIndex] ?? 0;
        paints[globalIndex] = chunk.paint?.[localIndex] ?? 1;
      }
    }
  }

  let minHeight = Number.POSITIVE_INFINITY;
  let maxHeight = Number.NEGATIVE_INFINITY;
  for (const h of heights) {
    minHeight = Math.min(minHeight, h);
    maxHeight = Math.max(maxHeight, h);
  }

  slopes = new Float32Array(heights.length);
  for (let z = 0; z < heightVertices; z += 1) {
    for (let x = 0; x < widthVertices; x += 1) {
      const left = heights[z * widthVertices + Math.max(0, x - 1)]!;
      const right = heights[z * widthVertices + Math.min(widthVertices - 1, x + 1)]!;
      const down = heights[Math.max(0, z - 1) * widthVertices + x]!;
      const up = heights[Math.min(heightVertices - 1, z + 1) * widthVertices + x]!;
      slopes[z * widthVertices + x] = Math.hypot(right - left, up - down) / 2;
    }
  }

  geometryMeta = { widthVertices, heightVertices, widthWorld, heightWorld, minHeight, maxHeight, manifest };

  const positions = new Float32Array(widthVertices * heightVertices * 3);
  const colors = new Float32Array(widthVertices * heightVertices * 3);
  const uvs = new Float32Array(widthVertices * heightVertices * 2);
  const indices = new Uint32Array((widthVertices - 1) * (heightVertices - 1) * 6);
  let p = 0;
  let uv = 0;
  for (let z = 0; z < heightVertices; z += 1) {
    for (let x = 0; x < widthVertices; x += 1) {
      const i = z * widthVertices + x;
      positions[p] = (x / manifest.segments) * manifest.span - widthWorld / 2;
      positions[p + 1] = heights[i]! * verticalScale;
      positions[p + 2] = (z / manifest.segments) * manifest.span - heightWorld / 2;
      const color = terrainColor(heights[i]!, slopes[i]!, paints[i]!, i);
      colors[p] = color.r;
      colors[p + 1] = color.g;
      colors[p + 2] = color.b;
      p += 3;
      uvs[uv] = x / (widthVertices - 1);
      uvs[uv + 1] = 1 - z / (heightVertices - 1);
      uv += 2;
    }
  }

  let k = 0;
  for (let z = 0; z < heightVertices - 1; z += 1) {
    for (let x = 0; x < widthVertices - 1; x += 1) {
      const a = z * widthVertices + x;
      const b = a + 1;
      const c = a + widthVertices;
      const d = c + 1;
      indices[k++] = a;
      indices[k++] = c;
      indices[k++] = b;
      indices[k++] = b;
      indices[k++] = c;
      indices[k++] = d;
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  geometry.computeBoundingSphere();

  terrainMesh = new THREE.Mesh(geometry, material);
  terrainMesh.receiveShadow = true;
  terrainMesh.castShadow = true;
  scene.add(terrainMesh);

  const centerHeight = heights[Math.floor(heightVertices / 2) * widthVertices + Math.floor(widthVertices / 2)] ?? 0;
  controls.target.set(0, centerHeight * verticalScale + viewerDefaults.targetLift, 0);
  camera.position.set(viewerDefaults.camera[0], viewerDefaults.camera[1], viewerDefaults.camera[2]);
  controls.update();

  updateStats();
  void loadSatelliteTexture(manifest);
}

function updateStats() {
  const stats = document.querySelector<HTMLDivElement>("[data-stats]");
  if (!stats || !geometryMeta || !terrainMesh) return;
  const tris = ((terrainMesh.geometry.getIndex()?.count ?? 0) / 3).toLocaleString();
  const verts = (geometryMeta.widthVertices * geometryMeta.heightVertices).toLocaleString();
  const source = geometryMeta.manifest.source;
  stats.innerHTML = `
    ${geometryMeta.manifest.width}x${geometryMeta.manifest.height} chunks<br />
    ${verts} vertices / ${tris} tris<br />
    height ${geometryMeta.minHeight.toFixed(1)} to ${geometryMeta.maxHeight.toFixed(1)} Tellus units<br />
    source ${Math.round(source?.minElevationMeters ?? 0)}m to ${Math.round(source?.maxElevationMeters ?? 0)}m<br />
    imagery ${satelliteTexture ? "Esri World Imagery" : "loading..."}
  `;
}

function updateSun() {
  const radians = THREE.MathUtils.degToRad(sunAzimuth);
  sun.position.set(Math.sin(radians) * 620, 520, Math.cos(radians) * 620);
}

function bindControls() {
  const output = (name: string) => document.querySelector<HTMLOutputElement>(`[data-output="${name}"]`);
  const control = (name: string) => document.querySelector<HTMLInputElement>(`[data-control="${name}"]`);
  control("satelliteBlend")?.addEventListener("input", (event) => {
    satelliteBlend = Number((event.currentTarget as HTMLInputElement).value);
    const out = output("satelliteBlend");
    if (out) out.textContent = satelliteBlend.toFixed(2);
    rebuildSatelliteTexture();
  });
  control("verticalScale")?.addEventListener("input", (event) => {
    verticalScale = Number((event.currentTarget as HTMLInputElement).value);
    const out = output("verticalScale");
    if (out) out.textContent = `${verticalScale.toFixed(1)}x`;
    updateVerticalScale();
  });
  control("rockContrast")?.addEventListener("input", (event) => {
    rockContrast = Number((event.currentTarget as HTMLInputElement).value);
    const out = output("rockContrast");
    if (out) out.textContent = rockContrast.toFixed(2);
    rebuildColors();
  });
  control("forestTint")?.addEventListener("input", (event) => {
    forestTint = Number((event.currentTarget as HTMLInputElement).value);
    const out = output("forestTint");
    if (out) out.textContent = forestTint.toFixed(2);
    rebuildColors();
  });
  control("sunAzimuth")?.addEventListener("input", (event) => {
    sunAzimuth = Number((event.currentTarget as HTMLInputElement).value);
    const out = output("sunAzimuth");
    if (out) out.textContent = sunAzimuth.toFixed(0);
    updateSun();
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((button) => {
    button.addEventListener("click", () => {
      colorMode = button.dataset.mode as ColorMode;
      document.querySelectorAll<HTMLButtonElement>("[data-mode]").forEach((item) => {
        item.classList.toggle("active", item === button);
      });
      rebuildColors();
    });
  });
}

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

bindControls();
updateSun();
loadTerrain().catch((error) => {
  console.error(error);
  const stats = document.querySelector<HTMLDivElement>("[data-stats]");
  if (stats) stats.textContent = error instanceof Error ? error.message : String(error);
});

function animate() {
  controls.update();
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

animate();
