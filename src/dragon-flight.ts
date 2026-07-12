import {
  Axis,
  Cartesian3,
  Cartographic,
  Color,
  ConstantPositionProperty,
  ConstantProperty,
  Entity,
  HeadingPitchRoll,
  HeightReference,
  Ion,
  Math as CesiumMath,
  Model,
  ModelAnimationLoop,
  PolylineGlowMaterialProperty,
  Terrain,
  Transforms,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}

type VehicleId = "dragon" | "bird";

interface VehicleSpec {
  id: VehicleId;
  label: string;
  assetId: string;
  scale: number;
  speedMps: number;
  turnRate: number;
  climbRate: number;
  cameraRange: number;
  cameraHeight: number;
  flapAnimation: string;
  glideAnimation: string;
  forwardAxis: Axis;
}

interface FlightRing {
  id: string;
  label: string;
  lon: number;
  lat: number;
  altitudeM: number;
  azimuthDeg: number;
  radiusM: number;
  color: Color;
  note: string;
}

interface FlightRoute {
  id: string;
  label: string;
  subtitle: string;
  terrainFallbackM: number;
  start: {
    lon: number;
    lat: number;
    altitudeM: number;
    headingDeg: number;
  };
  rings: FlightRing[];
  track?: Array<{ lon: number; lat: number }>;
}

interface FlightLocation {
  id: string;
  label: string;
  aliases: string[];
  lon: number;
  lat: number;
  terrainFallbackM: number;
  altitudeM: number;
  headingDeg: number;
  note: string;
}

interface FlightState {
  lon: number;
  lat: number;
  altitudeM: number;
  altitudeVelocityMps: number;
  headingDeg: number;
  pitchDeg: number;
  rollDeg: number;
  speedMps: number;
  completedRings: Set<string>;
}

const root = document.querySelector<HTMLDivElement>("#dragon-flight-root");
if (!root) throw new Error("Missing #dragon-flight-root");

window.CESIUM_BASE_URL = "/cesium";
const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (token) Ion.defaultAccessToken = token;

const CHACO_TERRAIN_FALLBACK_M = 1900;
const MOSSMAN_TERRAIN_FALLBACK_M = 24;
const EARTH_TERRAIN_FALLBACK_M = 120;
const MIN_FLIGHT_ALTITUDE_M = 8;
const MAX_FLIGHT_ALTITUDE_M = 1100;
const INSPECTION_ALTITUDE_M = 150;
const INSPECTION_CAMERA_RANGE_M = 54;
const INSPECTION_CAMERA_HEIGHT_M = 24;

function assetStoreCesiumModelUrl(assetId: string): string {
  // Cesium's model path does not use Tellus' Three.js Meshopt/KTX2 loader stack.
  // The store's optimized LODs are tiny, but require EXT_meshopt_compression and
  // KHR_texture_basisu; original downloads are heavier but render reliably here.
  return `/api/assets/download/${encodeURIComponent(assetId)}`;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function lerp(start: number, end: number, t: number): number {
  return start + (end - start) * t;
}

const vehicles: VehicleSpec[] = [
  {
    id: "dragon",
    label: "Dragon",
    assetId: "6a20f42490ef2a93f06a2366",
    scale: 34,
    speedMps: 58,
    turnRate: 42,
    climbRate: 28,
    cameraRange: 230,
    cameraHeight: 82,
    flapAnimation: "Fly Flap",
    glideAnimation: "Fly Glide",
    forwardAxis: Axis.X,
  },
  {
    id: "bird",
    label: "Fantasy Bird",
    assetId: "9e54b0b8-3cce-4b58-b085-54c1e591418b",
    scale: 30,
    speedMps: 48,
    turnRate: 52,
    climbRate: 24,
    cameraRange: 205,
    cameraHeight: 72,
    flapAnimation: "Flap",
    glideAnimation: "Glide",
    forwardAxis: Axis.X,
  },
];

const routes: FlightRoute[] = [
  {
    id: "earth",
    label: "Earth Free Flight",
    subtitle: "Search or choose a place, then fly freely across Cesium's streamed globe.",
    terrainFallbackM: EARTH_TERRAIN_FALLBACK_M,
    start: { lon: 12.4924, lat: 41.8902, altitudeM: 900, headingDeg: 20 },
    rings: [],
  },
  {
    id: "chaco",
    label: "Chaco Alignments",
    subtitle: "Fly the route gates that mark sky-ground alignments over real terrain.",
    terrainFallbackM: CHACO_TERRAIN_FALLBACK_M,
    start: { lon: -107.967, lat: 36.056, altitudeM: 360, headingDeg: 38 },
    rings: [
      {
        id: "pueblo-north",
        label: "Pueblo Bonito North Axis",
        lon: -107.9619,
        lat: 36.0647,
        altitudeM: 220,
        azimuthDeg: 0,
        radiusM: 125,
        color: Color.WHITE,
        note: "Cardinal north guide from Pueblo Bonito.",
      },
      {
        id: "pueblo-east",
        label: "East-West Axis",
        lon: -107.9544,
        lat: 36.0608,
        altitudeM: 245,
        azimuthDeg: 90,
        radiusM: 130,
        color: Color.YELLOW,
        note: "East-west alignment guide.",
      },
      {
        id: "winter-sunrise",
        label: "Winter Solstice Sunrise",
        lon: -107.949,
        lat: 36.053,
        altitudeM: 280,
        azimuthDeg: 122,
        radiusM: 145,
        color: Color.ORANGE,
        note: "Approximate winter sunrise azimuth gate.",
      },
      {
        id: "summer-sunrise",
        label: "Summer Solstice Sunrise",
        lon: -107.946,
        lat: 36.067,
        altitudeM: 305,
        azimuthDeg: 58,
        radiusM: 145,
        color: Color.SKYBLUE,
        note: "Approximate summer sunrise azimuth gate.",
      },
      {
        id: "fajada",
        label: "Fajada Butte Anchor",
        lon: -107.945,
        lat: 36.025,
        altitudeM: 420,
        azimuthDeg: 180,
        radiusM: 170,
        color: Color.MAGENTA,
        note: "Landscape anchor for future Sun Dagger route.",
      },
    ],
  },
  {
    id: "mossman",
    label: "Mossman Cane Train",
    subtitle: "Follow Mossman's 610 mm sugar-cane railway corridor over Queensland satellite terrain.",
    terrainFallbackM: MOSSMAN_TERRAIN_FALLBACK_M,
    start: { lon: 145.3694373, lat: -16.4500031, altitudeM: 180, headingDeg: 196 },
    track: [
      { lon: 145.3694373, lat: -16.4500031 },
      { lon: 145.3689661, lat: -16.4506622 },
      { lon: 145.3685873, lat: -16.4516263 },
      { lon: 145.3663217, lat: -16.4574709 },
      { lon: 145.3661522, lat: -16.4580392 },
      { lon: 145.3662368, lat: -16.458447 },
      { lon: 145.3664443, lat: -16.4587219 },
      { lon: 145.3669349, lat: -16.4590714 },
      { lon: 145.3670968, lat: -16.4591862 },
      { lon: 145.3674054, lat: -16.45939 },
      { lon: 145.3677165, lat: -16.4595668 },
      { lon: 145.3679782, lat: -16.4596663 },
      { lon: 145.3684118, lat: -16.4597145 },
      { lon: 145.3720269, lat: -16.4590012 },
      { lon: 145.3738515, lat: -16.4591026 },
      { lon: 145.3762358, lat: -16.4589441 },
      { lon: 145.3777806, lat: -16.4587487 },
      { lon: 145.37783, lat: -16.4586133 },
    ],
    rings: [
      {
        id: "mossman-north",
        label: "North Mill Street Run",
        lon: 145.3689661,
        lat: -16.4506622,
        altitudeM: 95,
        azimuthDeg: 196,
        radiusM: 70,
        color: Color.LIME,
        note: "Gate over the northern street-running cane-train line.",
      },
      {
        id: "mossman-mid",
        label: "Mill Street Curve",
        lon: 145.3663217,
        lat: -16.4574709,
        altitudeM: 115,
        azimuthDeg: 192,
        radiusM: 76,
        color: Color.CYAN,
        note: "Follow the line south as it bends toward the mill district.",
      },
      {
        id: "mossman-yard",
        label: "Mossman Mill Yard",
        lon: 145.3674054,
        lat: -16.45939,
        altitudeM: 125,
        azimuthDeg: 105,
        radiusM: 82,
        color: Color.YELLOW,
        note: "Gate above the cane railway junction and yard approach.",
      },
      {
        id: "mossman-east",
        label: "East Mill Track",
        lon: 145.3738515,
        lat: -16.4591026,
        altitudeM: 140,
        azimuthDeg: 88,
        radiusM: 90,
        color: Color.ORANGE,
        note: "Cross the eastbound cane-train corridor.",
      },
      {
        id: "mossman-crossing",
        label: "Eastern Crossing",
        lon: 145.37783,
        lat: -16.4586133,
        altitudeM: 155,
        azimuthDeg: 75,
        radiusM: 90,
        color: Color.MAGENTA,
        note: "Final gate near the eastern railway crossing.",
      },
    ],
  },
];

const flightLocations: FlightLocation[] = [
  {
    id: "rome",
    label: "Rome, Italy",
    aliases: ["rome", "colosseum", "roman bath", "italy"],
    lon: 12.4924,
    lat: 41.8902,
    terrainFallbackM: 21,
    altitudeM: 900,
    headingDeg: 20,
    note: "Free flight over central Rome.",
  },
  {
    id: "athens",
    label: "Athens Acropolis",
    aliases: ["athens", "acropolis", "parthenon", "greece"],
    lon: 23.7261,
    lat: 37.9715,
    terrainFallbackM: 150,
    altitudeM: 850,
    headingDeg: 70,
    note: "Free flight over the Acropolis and ancient Athens.",
  },
  {
    id: "nazca",
    label: "Nazca Lines",
    aliases: ["nazca", "nazca lines", "peru"],
    lon: -75.13,
    lat: -14.739,
    terrainFallbackM: 500,
    altitudeM: 1200,
    headingDeg: 140,
    note: "Free flight over the Nazca desert lines region.",
  },
  {
    id: "cahokia",
    label: "Cahokia Mounds",
    aliases: ["cahokia", "monks mound", "mounds"],
    lon: -90.0618,
    lat: 38.6607,
    terrainFallbackM: 127,
    altitudeM: 650,
    headingDeg: 95,
    note: "Free flight over Cahokia and the mound landscape.",
  },
  {
    id: "chaco-free",
    label: "Chaco Canyon",
    aliases: ["chaco", "pueblo bonito", "fajada"],
    lon: -107.9619,
    lat: 36.0647,
    terrainFallbackM: CHACO_TERRAIN_FALLBACK_M,
    altitudeM: 700,
    headingDeg: 38,
    note: "Free flight over Chaco Culture National Historical Park.",
  },
  {
    id: "mossman-free",
    label: "Mossman, Australia",
    aliases: ["mossman", "cane train", "queensland"],
    lon: 145.3694373,
    lat: -16.4500031,
    terrainFallbackM: MOSSMAN_TERRAIN_FALLBACK_M,
    altitudeM: 260,
    headingDeg: 196,
    note: "Free flight over Mossman's cane train corridor.",
  },
  {
    id: "giza",
    label: "Giza Plateau",
    aliases: ["giza", "pyramids", "egypt", "sphinx"],
    lon: 31.1342,
    lat: 29.9792,
    terrainFallbackM: 60,
    altitudeM: 1000,
    headingDeg: 250,
    note: "Free flight over the Giza pyramid complex.",
  },
  {
    id: "stonehenge",
    label: "Stonehenge",
    aliases: ["stonehenge", "salisbury"],
    lon: -1.8262,
    lat: 51.1789,
    terrainFallbackM: 100,
    altitudeM: 650,
    headingDeg: 70,
    note: "Free flight over Stonehenge and surrounding earthworks.",
  },
  {
    id: "angkor",
    label: "Angkor Wat",
    aliases: ["angkor", "angkor wat", "cambodia"],
    lon: 103.8667,
    lat: 13.4125,
    terrainFallbackM: 25,
    altitudeM: 900,
    headingDeg: 270,
    note: "Free flight over Angkor Wat.",
  },
  {
    id: "yosemite",
    label: "Yosemite Valley",
    aliases: ["yosemite", "el capitan", "half dome"],
    lon: -119.59,
    lat: 37.745,
    terrainFallbackM: 1200,
    altitudeM: 1400,
    headingDeg: 82,
    note: "Free flight through Yosemite Valley.",
  },
];

let activeRoute = routes.find((route) => route.id === "chaco") ?? routes[0]!;

const style = document.createElement("style");
style.textContent = `
  html, body, #dragon-flight-root {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #06080d;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .df-hud {
    position: fixed;
    inset: 18px auto auto 18px;
    z-index: 4;
    width: min(320px, calc(100vw - 36px));
    color: #fff7d6;
    pointer-events: none;
    text-shadow: 0 2px 6px rgba(0, 0, 0, 0.7);
  }

  .df-title {
    font-size: 17px;
    line-height: 1.05;
    font-weight: 900;
  }

  .df-subtitle {
    margin-top: 3px;
    color: rgba(255, 247, 214, 0.78);
    font-size: 10px;
    font-weight: 650;
  }

  .df-panel {
    position: fixed;
    left: 18px;
    bottom: 18px;
    z-index: 5;
    width: min(340px, calc(100vw - 36px));
    background: rgba(9, 13, 11, 0.86);
    border: 1px solid rgba(230, 192, 95, 0.24);
    border-radius: 10px;
    color: #fff7d6;
    backdrop-filter: blur(10px);
    box-shadow: 0 12px 34px rgba(0, 0, 0, 0.38), inset 0 1px rgba(255, 255, 255, 0.04);
  }

  .df-telemetry {
    position: fixed;
    right: 18px;
    top: 18px;
    z-index: 5;
    width: min(286px, calc(100vw - 36px));
    padding: 7px;
    color: #fff7d6;
    background: rgba(9, 13, 11, 0.78);
    border: 1px solid rgba(230, 192, 95, 0.22);
    border-radius: 10px;
    backdrop-filter: blur(9px);
    box-shadow: 0 10px 28px rgba(0, 0, 0, 0.3), inset 0 1px rgba(255, 255, 255, 0.04);
    pointer-events: none;
  }

  .df-telemetry .df-grid { gap: 5px; }

  .df-telemetry .df-stat {
    border: 0;
    background: rgba(255, 255, 255, 0.04);
  }

  .df-panel summary {
    min-height: 34px;
    padding: 7px 10px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    color: #e6c05f;
    font-size: 11px;
    font-weight: 850;
    letter-spacing: 0.04em;
    text-transform: uppercase;
    cursor: pointer;
    list-style: none;
  }

  .df-panel summary::-webkit-details-marker { display: none; }
  .df-panel summary::after { content: "+"; font-size: 15px; }
  .df-panel[open] summary::after { content: "−"; }

  .df-panel-body {
    display: grid;
    gap: 7px;
    padding: 0 9px 9px;
    border-top: 1px solid rgba(255, 255, 255, 0.08);
  }

  .df-vehicles {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .df-vehicles button {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff7d6;
    padding: 5px 7px;
    font-size: 10px;
    font-weight: 850;
    cursor: pointer;
  }

  .df-vehicles button.active {
    background: #facc15;
    border-color: #fde047;
    color: #111827;
  }

  .df-search {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 5px;
  }

  .df-search input,
  .df-search button {
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: #fff7d6;
    padding: 6px 8px;
    font-size: 10px;
    font-weight: 800;
  }

  .df-search input::placeholder {
    color: rgba(255, 247, 214, 0.58);
  }

  .df-search button {
    cursor: pointer;
  }

  .df-grid {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 5px;
  }

  .df-stat {
    min-width: 0;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.07);
    padding: 5px;
  }

  .df-stat span {
    display: block;
    color: rgba(255, 247, 214, 0.62);
    font-size: 10px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .df-stat strong {
    display: block;
    margin-top: 3px;
    color: #fff7d6;
    font-size: 11px;
    font-variant-numeric: tabular-nums;
  }

  .df-tip {
    color: rgba(255, 247, 214, 0.72);
    font-size: 9px;
    line-height: 1.35;
    font-weight: 650;
  }

  .df-status {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 5;
    max-width: 270px;
    color: rgba(255, 247, 214, 0.9);
    background: rgba(9, 12, 18, 0.68);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    padding: 7px 9px;
    font-size: 10px;
    line-height: 1.4;
    backdrop-filter: blur(10px);
  }

  .cesium-viewer-bottom,
  .cesium-viewer-toolbar,
  .cesium-viewer-animationContainer,
  .cesium-viewer-timelineContainer {
    display: none !important;
  }
`;
document.head.append(style);

root.innerHTML = `
  <div class="df-hud">
    <div class="df-title" data-route-title>${activeRoute.label}</div>
    <div class="df-subtitle" data-route-subtitle>${activeRoute.subtitle}</div>
  </div>
  <div id="dragon-flight-container" style="width: 100%; height: 100%;"></div>
  <div class="df-telemetry" aria-label="Flight telemetry">
    <div class="df-grid">
      <div class="df-stat"><span>Speed</span><strong data-stat="speed">--</strong></div>
      <div class="df-stat"><span>Altitude</span><strong data-stat="altitude">--</strong></div>
      <div class="df-stat"><span>Rings</span><strong data-stat="rings">0/${activeRoute.rings.length}</strong></div>
      <div class="df-stat"><span>Mode</span><strong data-stat="mode">Glide</strong></div>
    </div>
  </div>
  <details class="df-panel">
    <summary>Flight plan</summary>
    <div class="df-panel-body">
      <div class="df-vehicles">
        ${vehicles.map((vehicle) => `<button type="button" data-vehicle="${vehicle.id}">${vehicle.label}</button>`).join("")}
        <button type="button" data-reset-flight>Reset</button>
      </div>
      <div class="df-vehicles">
        ${routes.map((route) => `<button type="button" data-route="${route.id}">${route.label}</button>`).join("")}
      </div>
      <form class="df-search" data-location-form>
        <input type="search" list="flight-location-options" data-location-search placeholder="Search city or site" autocomplete="off" />
        <button type="submit">Go</button>
        <datalist id="flight-location-options">
          ${flightLocations.map((location) => `<option value="${location.label}"></option>`).join("")}
        </datalist>
      </form>
      <div class="df-tip">Drag to look · scroll to zoom · V view · hold W/S to climb or dive · Space brake</div>
    </div>
  </details>
  <div class="df-status" data-status>${token ? "Loading Cesium terrain and flyer..." : "Missing VITE_CESIUM_ION_TOKEN in .env.local"}</div>
`;

const viewer = new Viewer("dragon-flight-container", {
  animation: false,
  baseLayerPicker: false,
  fullscreenButton: false,
  geocoder: false,
  homeButton: false,
  infoBox: false,
  navigationHelpButton: false,
  sceneModePicker: false,
  selectionIndicator: false,
  timeline: false,
  terrain: Terrain.fromWorldTerrain({
    requestVertexNormals: true,
  }),
});

viewer.scene.globe.enableLighting = false;
viewer.scene.globe.maximumScreenSpaceError = 2.5;
viewer.scene.globe.tileCacheSize = 160;
viewer.scene.fog.enabled = true;
viewer.scene.fog.renderable = true;
viewer.scene.fog.density = 0.00014;
viewer.scene.screenSpaceCameraController.enableInputs = false;
viewer.clock.shouldAnimate = true;

const keys = new Set<string>();
let selectedVehicle = vehicles[0]!;
let flyerMarker: Entity | null = null;
let flyerModel: Model | null = null;
let flyerModelToken = 0;
let activeFlyerAnimation = "";
let visualYawTrimDeg = 180;
let surveyCamera = false;
let cameraOrbitYawDeg = 0;
let cameraElevationDeg = 20;
let cameraZoom = 1;
let pitchHoldSeconds = 0;
let smoothedFlyerTerrainM = activeRoute.terrainFallbackM;
const ringEntities = new Map<string, Entity>();
const state: FlightState = {
  lon: activeRoute.start.lon,
  lat: activeRoute.start.lat,
  altitudeM: activeRoute.start.altitudeM,
  altitudeVelocityMps: 0,
  headingDeg: activeRoute.start.headingDeg,
  pitchDeg: 0,
  rollDeg: 0,
  speedMps: selectedVehicle.speedMps,
  completedRings: new Set(),
};

function setStatus(message: string) {
  const status = document.querySelector<HTMLElement>("[data-status]");
  if (status) status.innerHTML = message;
}

function setStat(name: string, value: string) {
  const node = document.querySelector<HTMLElement>(`[data-stat="${name}"]`);
  if (node) node.textContent = value;
}

function offsetLonLat(lon: number, lat: number, eastM: number, northM: number): [number, number] {
  const latRad = CesiumMath.toRadians(lat);
  const metersPerDegreeLat = 110_574;
  const metersPerDegreeLon = 111_320 * Math.cos(latRad);
  return [lon + eastM / metersPerDegreeLon, lat + northM / metersPerDegreeLat];
}

function cartographicFor(lon: number, lat: number, altitudeM: number): Cartographic {
  return Cartographic.fromDegrees(lon, lat, altitudeM);
}

function terrainHeightAt(lon: number, lat: number): number {
  const height = viewer.scene.globe.getHeight(cartographicFor(lon, lat, 0));
  return Number.isFinite(height) ? height ?? activeRoute.terrainFallbackM : activeRoute.terrainFallbackM;
}

function positionFor(lon: number, lat: number, altitudeM: number): Cartesian3 {
  return Cartesian3.fromDegrees(lon, lat, terrainHeightAt(lon, lat) + altitudeM);
}

function flightPositionFor(lon: number, lat: number, altitudeM: number): Cartesian3 {
  return Cartesian3.fromDegrees(lon, lat, smoothedFlyerTerrainM + altitudeM);
}

function ringPositions(ring: FlightRing): Cartesian3[] {
  const positions: Cartesian3[] = [];
  const heading = CesiumMath.toRadians(ring.azimuthDeg);
  const forwardEast = Math.sin(heading);
  const forwardNorth = Math.cos(heading);
  const rightEast = Math.cos(heading);
  const rightNorth = -Math.sin(heading);
  const ground = terrainHeightAt(ring.lon, ring.lat);
  const centerHeight = ground + ring.altitudeM;
  for (let i = 0; i <= 72; i++) {
    const t = (i / 72) * Math.PI * 2;
    const side = Math.cos(t) * ring.radiusM;
    const up = Math.sin(t) * ring.radiusM;
    const [lon, lat] = offsetLonLat(
      ring.lon,
      ring.lat,
      rightEast * side + forwardEast * 0.1,
      rightNorth * side + forwardNorth * 0.1,
    );
    positions.push(Cartesian3.fromDegrees(lon, lat, centerHeight + up));
  }
  return positions;
}

function drawRings() {
  for (const entity of ringEntities.values()) viewer.entities.remove(entity);
  ringEntities.clear();
  if (activeRoute.track?.length) {
    const track = viewer.entities.add({
      name: `${activeRoute.label} track`,
      polyline: {
        positions: activeRoute.track.map((point) => positionFor(point.lon, point.lat, 12)),
        width: 6,
        material: Color.CYAN.withAlpha(0.72),
      },
    });
    ringEntities.set(`${activeRoute.id}:track`, track);
  }
  for (const ring of activeRoute.rings) {
    const completed = state.completedRings.has(ring.id);
    const entity = viewer.entities.add({
      name: ring.label,
      description: ring.note,
      polyline: {
        positions: ringPositions(ring),
        width: completed ? 4 : 7,
        material: new PolylineGlowMaterialProperty({
          color: new ConstantProperty(completed ? Color.LIME.withAlpha(0.62) : ring.color.withAlpha(0.86)),
          glowPower: new ConstantProperty(completed ? 0.12 : 0.22),
        }),
      },
    });
    ringEntities.set(ring.id, entity);
    const label = viewer.entities.add({
      name: `${ring.label} label`,
      position: positionFor(ring.lon, ring.lat, ring.altitudeM + ring.radiusM + 25),
      label: {
        text: completed ? `Done: ${ring.label}` : ring.label,
        fillColor: completed ? Color.LIME : ring.color,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        pixelOffset: new Cartesian3(0, -24, 0),
      },
    });
    ringEntities.set(`${ring.id}:label`, label);
  }
}

function setActiveVehicleButtons() {
  document.querySelectorAll<HTMLButtonElement>("[data-vehicle]").forEach((button) => {
    button.classList.toggle("active", button.dataset.vehicle === selectedVehicle.id);
  });
}

function setActiveRouteButtons() {
  document.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((button) => {
    button.classList.toggle("active", button.dataset.route === activeRoute.id);
  });
  const title = document.querySelector<HTMLElement>("[data-route-title]");
  const subtitle = document.querySelector<HTMLElement>("[data-route-subtitle]");
  if (title) title.textContent = activeRoute.label;
  if (subtitle) subtitle.textContent = activeRoute.subtitle;
}

function findFlightLocation(query: string): FlightLocation | null {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return null;
  return (
    flightLocations.find((location) => location.label.toLowerCase() === normalized) ??
    flightLocations.find((location) => location.aliases.some((alias) => alias === normalized)) ??
    flightLocations.find(
      (location) =>
        location.label.toLowerCase().includes(normalized) ||
        location.aliases.some((alias) => alias.includes(normalized) || normalized.includes(alias)),
    ) ??
    null
  );
}

function flyerPosition(): Cartesian3 {
  return flightPositionFor(state.lon, state.lat, state.altitudeM);
}

function flyerHeadingPitchRoll(): HeadingPitchRoll {
  return new HeadingPitchRoll(
    CesiumMath.toRadians(state.headingDeg + visualYawTrimDeg),
    CesiumMath.toRadians(state.pitchDeg),
    CesiumMath.toRadians(state.rollDeg),
  );
}

function flyerModeAnimation(mode: "flap" | "glide"): string {
  return mode === "flap" ? selectedVehicle.flapAnimation : selectedVehicle.glideAnimation;
}

function setFlyerAnimation(mode: "flap" | "glide") {
  if (!flyerModel?.ready) return;
  const animationName = flyerModeAnimation(mode);
  if (activeFlyerAnimation === animationName) return;
  flyerModel.activeAnimations.removeAll();
  flyerModel.activeAnimations.add({
    name: animationName,
    loop: ModelAnimationLoop.REPEAT,
    multiplier: mode === "flap" ? 1.15 : 0.85,
  });
  activeFlyerAnimation = animationName;
}

function removeFlyerModel() {
  if (!flyerModel) return;
  viewer.scene.primitives.remove(flyerModel);
  flyerModel = null;
  activeFlyerAnimation = "";
}

async function loadFlyerModel(token: number, position: Cartesian3) {
  try {
    const model = await Model.fromGltfAsync({
      url: assetStoreCesiumModelUrl(selectedVehicle.assetId),
      modelMatrix: Transforms.headingPitchRollToFixedFrame(position, flyerHeadingPitchRoll()),
      scale: selectedVehicle.scale,
      minimumPixelSize: 160,
      maximumScale: 50000,
      heightReference: HeightReference.NONE,
      scene: viewer.scene,
      allowPicking: false,
      upAxis: Axis.Y,
      forwardAxis: selectedVehicle.forwardAxis,
      cull: false,
      clampAnimations: true,
    });
    if (token !== flyerModelToken) {
      model.destroy();
      return;
    }
    removeFlyerModel();
    flyerModel = model;
    viewer.scene.primitives.add(model);
    setFlyerAnimation("glide");
  } catch (error) {
    console.warn("[dragon-flight] flyer model failed to load", error);
    setStatus(`${selectedVehicle.label} marker loaded, but the creature mesh failed to load. The route is still playable.`);
  }
}

function spawnFlyer() {
  if (flyerMarker) viewer.entities.remove(flyerMarker);
  removeFlyerModel();
  const token = ++flyerModelToken;
  const position = flyerPosition();
  flyerMarker = viewer.entities.add({
    name: selectedVehicle.label,
    position,
    orientation: Transforms.headingPitchRollQuaternion(position, flyerHeadingPitchRoll()),
    point: {
      pixelSize: 12,
      color: Color.YELLOW.withAlpha(0.9),
      outlineColor: Color.BLACK,
      outlineWidth: 2,
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
    label: {
      text: selectedVehicle.label,
      fillColor: Color.YELLOW,
      outlineColor: Color.BLACK,
      outlineWidth: 3,
      pixelOffset: new Cartesian3(0, -32, 0),
      disableDepthTestDistance: Number.POSITIVE_INFINITY,
    },
  });
  setActiveVehicleButtons();
  void loadFlyerModel(token, position);
}

function resetFlight() {
  state.lon = activeRoute.start.lon;
  state.lat = activeRoute.start.lat;
  state.altitudeM = activeRoute.start.altitudeM;
  state.altitudeVelocityMps = 0;
  state.headingDeg = activeRoute.start.headingDeg;
  state.pitchDeg = 0;
  state.rollDeg = 0;
  state.speedMps = selectedVehicle.speedMps;
  state.completedRings.clear();
  smoothedFlyerTerrainM = terrainHeightAt(state.lon, state.lat);
  spawnFlyer();
  drawRings();
  updateCamera();
  updateHud("Glide");
  setStatus(
    activeRoute.rings.length
      ? `Route reset. Find the first gate on ${activeRoute.label}.`
      : "Earth Free Flight ready. Search a city or site, or just fly.",
  );
}

function selectVehicle(id: VehicleId) {
  selectedVehicle = vehicles.find((vehicle) => vehicle.id === id) ?? vehicles[0]!;
  state.speedMps = selectedVehicle.speedMps;
  spawnFlyer();
  setStatus(`${selectedVehicle.label} selected. ${state.completedRings.size}/${activeRoute.rings.length} rings complete.`);
}

function selectRoute(id: string) {
  activeRoute = routes.find((route) => route.id === id) ?? routes[0]!;
  state.completedRings.clear();
  setActiveRouteButtons();
  resetFlight();
}

function flyToLocation(location: FlightLocation) {
  activeRoute = routes.find((route) => route.id === "earth") ?? activeRoute;
  state.lon = location.lon;
  state.lat = location.lat;
  state.altitudeM = location.altitudeM;
  state.altitudeVelocityMps = 0;
  state.headingDeg = location.headingDeg;
  state.pitchDeg = 0;
  state.rollDeg = 0;
  state.completedRings.clear();
  smoothedFlyerTerrainM = location.terrainFallbackM;
  setActiveRouteButtons();
  drawRings();
  spawnFlyer();
  updateCamera();
  updateHud("Free");
  setStatus(`${location.label}<br />${location.note}<br />Free flight: no course boundary.`);
}

function updateFlyerTransform() {
  const position = flyerPosition();
  const hpr = flyerHeadingPitchRoll();
  if (flyerMarker) {
    flyerMarker.position = new ConstantPositionProperty(position);
    flyerMarker.orientation = new ConstantProperty(Transforms.headingPitchRollQuaternion(position, hpr));
  }
  if (flyerModel) {
    flyerModel.modelMatrix = Transforms.headingPitchRollToFixedFrame(position, hpr);
  }
}

function updateCamera() {
  const cameraHeadingDeg = state.headingDeg + cameraOrbitYawDeg;
  const heading = CesiumMath.toRadians(cameraHeadingDeg);
  const inspectionBlend = clamp01(1 - state.altitudeM / INSPECTION_ALTITUDE_M);
  const chaseBehind = lerp(selectedVehicle.cameraRange, INSPECTION_CAMERA_RANGE_M, inspectionBlend);
  const behind = Math.max(18, (surveyCamera ? Math.max(54, chaseBehind * 0.38) : chaseBehind) * cameraZoom);
  const elevationDeg = surveyCamera ? 72 : cameraElevationDeg;
  const cameraHeight = Math.tan(CesiumMath.toRadians(elevationDeg)) * behind;
  const [cameraLon, cameraLat] = offsetLonLat(
    state.lon,
    state.lat,
    -Math.sin(heading) * behind,
    -Math.cos(heading) * behind,
  );
  viewer.camera.setView({
    destination: flightPositionFor(cameraLon, cameraLat, state.altitudeM + cameraHeight),
    orientation: {
      heading: CesiumMath.toRadians(cameraHeadingDeg),
      pitch: CesiumMath.toRadians(-elevationDeg - Math.max(0, state.pitchDeg) * 0.08),
      roll: CesiumMath.toRadians(state.rollDeg * 0.28),
    },
  });
}

function updateHud(mode: string) {
  setStat("speed", `${Math.round(state.speedMps)} m/s`);
  setStat("altitude", `${Math.round(state.altitudeM)} m`);
  setStat("rings", activeRoute.rings.length ? `${state.completedRings.size}/${activeRoute.rings.length}` : "Free");
  setStat("mode", mode);
}

function checkRings() {
  if (!activeRoute.rings.length) return;
  let changed = false;
  for (const ring of activeRoute.rings) {
    if (state.completedRings.has(ring.id)) continue;
    const latMeters = (state.lat - ring.lat) * 110_574;
    const lonMeters = (state.lon - ring.lon) * 111_320 * Math.cos(CesiumMath.toRadians(ring.lat));
    const altMeters = state.altitudeM - ring.altitudeM;
    const distance = Math.sqrt(latMeters * latMeters + lonMeters * lonMeters + altMeters * altMeters);
    if (distance <= ring.radiusM * 0.82) {
      state.completedRings.add(ring.id);
      changed = true;
      setStatus(`${ring.label}<br />${ring.note}<br />${state.completedRings.size}/${activeRoute.rings.length} rings complete.`);
    }
  }
  if (changed) drawRings();
  if (changed && state.completedRings.size === activeRoute.rings.length) {
    setStatus(`Route complete. ${activeRoute.label} cleared.`);
  }
}

let lastTick = performance.now();
function tick() {
  const now = performance.now();
  const dt = Math.min(0.05, Math.max(0.001, (now - lastTick) / 1000));
  lastTick = now;

  const shift = keys.has("ShiftLeft") || keys.has("ShiftRight");
  const braking = keys.has("Space");
  const boost = shift && !braking;
  const targetSpeed = selectedVehicle.speedMps * (braking ? 0.12 : boost ? 1.45 : 1);
  state.speedMps += (targetSpeed - state.speedMps) * Math.min(1, dt * (braking ? 5.5 : 2.5));

  const turn = (keys.has("KeyA") ? -1 : 0) + (keys.has("KeyD") ? 1 : 0);
  const pitchInput = (keys.has("KeyW") ? 1 : 0) + (keys.has("KeyS") ? -1 : 0);
  pitchHoldSeconds = pitchInput === 0 ? 0 : Math.min(2.4, pitchHoldSeconds + dt);
  const pitchMagnitude = pitchInput === 0
    ? 0
    : Math.min(48, 7 + (Math.exp(pitchHoldSeconds * 0.9) - 1) * 10);

  state.headingDeg = (state.headingDeg + turn * selectedVehicle.turnRate * dt + 360) % 360;
  state.pitchDeg += ((pitchInput * pitchMagnitude) - state.pitchDeg) * Math.min(1, dt * 3.4);
  state.rollDeg += ((turn * -28) - state.rollDeg) * Math.min(1, dt * 5.5);

  const targetTerrainM = terrainHeightAt(state.lon, state.lat);
  smoothedFlyerTerrainM += (targetTerrainM - smoothedFlyerTerrainM) * Math.min(1, dt * 0.8);

  const pitchLiftMps = Math.sin(CesiumMath.toRadians(state.pitchDeg)) * state.speedMps * 0.9;
  const targetAltitudeVelocityMps = pitchLiftMps;
  state.altitudeVelocityMps += (targetAltitudeVelocityMps - state.altitudeVelocityMps) * Math.min(1, dt * 2.6);
  state.altitudeM += state.altitudeVelocityMps * dt;
  state.altitudeM = Math.max(MIN_FLIGHT_ALTITUDE_M, Math.min(MAX_FLIGHT_ALTITUDE_M, state.altitudeM));
  if (state.altitudeM === MIN_FLIGHT_ALTITUDE_M || state.altitudeM === MAX_FLIGHT_ALTITUDE_M) state.altitudeVelocityMps = 0;

  const heading = CesiumMath.toRadians(state.headingDeg);
  const distance = state.speedMps * dt;
  const [lon, lat] = offsetLonLat(state.lon, state.lat, Math.sin(heading) * distance, Math.cos(heading) * distance);
  state.lon = lon;
  state.lat = lat;

  updateFlyerTransform();
  setFlyerAnimation(boost || pitchInput > 0 ? "flap" : "glide");
  updateCamera();
  checkRings();
  updateHud(surveyCamera ? "Survey" : braking ? "Brake" : boost || pitchInput > 0 ? "Flap" : "Glide");
}

function isTextEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement ||
    (target instanceof HTMLElement && target.isContentEditable);
}

document.addEventListener("keydown", (event) => {
  if (isTextEditingTarget(event.target)) return;
  if ((event.code === "KeyV" || event.code === "KeyC") && !event.repeat) {
    surveyCamera = !surveyCamera;
    updateCamera();
    setStatus(surveyCamera ? "Survey view" : "Chase view");
    event.preventDefault();
    return;
  }
  if (event.code === "KeyJ" || event.code === "KeyL") {
    visualYawTrimDeg += event.code === "KeyJ" ? -15 : 15;
    visualYawTrimDeg = ((visualYawTrimDeg + 180) % 360) - 180;
    updateFlyerTransform();
    setStatus(`Visual yaw trim: ${visualYawTrimDeg} degrees. Flight direction is unchanged.`);
    event.preventDefault();
    return;
  }
  keys.add(event.code);
  if (["KeyW", "KeyA", "KeyS", "KeyD", "KeyV", "KeyC", "KeyJ", "KeyL", "ShiftLeft", "ShiftRight", "Space"].includes(event.code)) {
    event.preventDefault();
  }
});
document.addEventListener("keyup", (event) => keys.delete(event.code));

let cameraDragging = false;
viewer.canvas.addEventListener("pointerdown", (event) => {
  if (event.button !== 0) return;
  cameraDragging = true;
  viewer.canvas.setPointerCapture(event.pointerId);
});
viewer.canvas.addEventListener("pointermove", (event) => {
  if (!cameraDragging) return;
  cameraOrbitYawDeg = ((cameraOrbitYawDeg - event.movementX * 0.24 + 540) % 360) - 180;
  cameraElevationDeg = Math.max(6, Math.min(68, cameraElevationDeg + event.movementY * 0.18));
});
const stopCameraDrag = (event: PointerEvent) => {
  cameraDragging = false;
  if (viewer.canvas.hasPointerCapture(event.pointerId)) viewer.canvas.releasePointerCapture(event.pointerId);
};
viewer.canvas.addEventListener("pointerup", stopCameraDrag);
viewer.canvas.addEventListener("pointercancel", stopCameraDrag);
viewer.canvas.addEventListener("wheel", (event) => {
  cameraZoom = Math.max(0.28, Math.min(2.6, cameraZoom * Math.exp(event.deltaY * 0.0012)));
  event.preventDefault();
}, { passive: false });
viewer.canvas.addEventListener("dblclick", () => {
  cameraOrbitYawDeg = 0;
  cameraElevationDeg = 20;
  cameraZoom = 1;
});
document.querySelectorAll<HTMLButtonElement>("[data-vehicle]").forEach((button) => {
  button.addEventListener("click", () => selectVehicle(button.dataset.vehicle as VehicleId));
});
document.querySelectorAll<HTMLButtonElement>("[data-route]").forEach((button) => {
  button.addEventListener("click", () => selectRoute(button.dataset.route ?? "chaco"));
});
document.querySelector<HTMLFormElement>("[data-location-form]")?.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = document.querySelector<HTMLInputElement>("[data-location-search]");
  const location = findFlightLocation(input?.value ?? "");
  if (!location) {
    setStatus("Location not found yet. Try Rome, Nazca, Cahokia, Chaco, Mossman, Giza, Stonehenge, Angkor, Athens, or Yosemite.");
    return;
  }
  flyToLocation(location);
});
document.querySelector<HTMLButtonElement>("[data-reset-flight]")?.addEventListener("click", resetFlight);

setActiveRouteButtons();
drawRings();
spawnFlyer();
updateCamera();
viewer.clock.onTick.addEventListener(tick);
setStatus(`${activeRoute.label} loaded. Fly through the rings to trace the route.`);
