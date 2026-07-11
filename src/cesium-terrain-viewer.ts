import {
  ArcType,
  Cartesian3,
  Color,
  DistanceDisplayCondition,
  Entity,
  HeightReference,
  HeadingPitchRoll,
  Ion,
  LabelStyle,
  Math as CesiumMath,
  Terrain,
  Transforms,
  VerticalOrigin,
  Viewer,
} from "cesium";
import "cesium/Build/Cesium/Widgets/widgets.css";

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
  }
}

type SiteId =
  | "grand-canyon"
  | "chaco-canyon"
  | "temple-portara"
  | "cahokia"
  | "yosemite"
  | "half-dome"
  | "hohenzollern";

interface SitePreset {
  id: SiteId;
  label: string;
  rectangle: [number, number, number, number];
  destination: [number, number, number];
  heading: number;
  pitch: number;
  roll?: number;
}

const root = document.querySelector<HTMLDivElement>("#cesium-terrain-root");
if (!root) throw new Error("Missing #cesium-terrain-root");

window.CESIUM_BASE_URL = "/cesium";

const token = import.meta.env.VITE_CESIUM_ION_TOKEN as string | undefined;
if (token) Ion.defaultAccessToken = token;

const sites: SitePreset[] = [
  {
    id: "grand-canyon",
    label: "Grand Canyon",
    rectangle: [-112.95, 36.02, -112.05, 36.35],
    destination: [-112.25, 36.12, 14500],
    heading: -82,
    pitch: -34,
  },
  {
    id: "chaco-canyon",
    label: "Chaco Canyon",
    rectangle: [-108.08, 36.0, -107.84, 36.12],
    destination: [-107.959, 36.059, 3200],
    heading: 0,
    pitch: -78,
  },
  {
    id: "temple-portara",
    label: "Temple Portara",
    rectangle: [25.36, 37.1, 25.38, 37.11],
    destination: [25.3724, 37.1057, 900],
    heading: -34,
    pitch: -74,
  },
  {
    id: "cahokia",
    label: "Cahokia",
    rectangle: [-90.09, 38.63, -90.03, 38.68],
    destination: [-90.061, 38.659, 1700],
    heading: 6,
    pitch: -72,
  },
  {
    id: "yosemite",
    label: "Yosemite Valley",
    rectangle: [-119.72, 37.69, -119.48, 37.8],
    destination: [-119.59, 37.735, 8500],
    heading: 62,
    pitch: -34,
  },
  {
    id: "half-dome",
    label: "Half Dome",
    rectangle: [-119.57, 37.71, -119.5, 37.77],
    destination: [-119.535, 37.745, 4200],
    heading: 35,
    pitch: -28,
  },
  {
    id: "hohenzollern",
    label: "Hohenzollern Castle",
    rectangle: [8.94, 48.31, 8.99, 48.34],
    destination: [8.96772, 48.32319, 1800],
    heading: -34,
    pitch: -32,
  },
];

interface HistoricalMarker {
  siteId: SiteId;
  name: string;
  lon: number;
  lat: number;
  kind: "great-house" | "kiva" | "temple" | "mound" | "scan";
  note: string;
}

interface ReconstructionFootprint {
  siteId: SiteId;
  name: string;
  lon: number;
  lat: number;
  widthM: number;
  depthM: number;
  headingDeg: number;
  heightM: number;
  color: Color;
  note: string;
}

interface AlignmentRay {
  siteId: SiteId;
  name: string;
  lon: number;
  lat: number;
  azimuthDeg: number;
  lengthM: number;
  color: Color;
  note: string;
}

interface LandmarkModel {
  siteId: SiteId;
  name: string;
  lon: number;
  lat: number;
  uri: string;
  headingDeg: number;
  scale: number;
  heightOffsetM: number;
  note: string;
}

interface LandmarkTuning {
  scale: number;
  heightOffsetM: number;
  headingDeg: number;
}

const historicalMarkers: readonly HistoricalMarker[] = [
  {
    siteId: "chaco-canyon",
    name: "Pueblo Bonito",
    lon: -107.9619,
    lat: 36.0608,
    kind: "great-house",
    note: "Great house center; first-pass approximate coordinate for overlay prototyping.",
  },
  {
    siteId: "chaco-canyon",
    name: "Chetro Ketl",
    lon: -107.9568,
    lat: 36.062,
    kind: "great-house",
    note: "Second-largest Chacoan great house; reconstruction footprint is approximate.",
  },
  {
    siteId: "chaco-canyon",
    name: "Casa Rinconada",
    lon: -107.96025,
    lat: 36.05478,
    kind: "kiva",
    note: "Great kiva south of Pueblo Bonito; coordinate from published DMS listing, rounded.",
  },
  {
    siteId: "chaco-canyon",
    name: "Pueblo Alto",
    lon: -107.961,
    lat: 36.0685,
    kind: "great-house",
    note: "Mesa-top great house north of downtown Chaco; approximate.",
  },
  {
    siteId: "chaco-canyon",
    name: "Fajada Butte",
    lon: -107.945,
    lat: 36.025,
    kind: "great-house",
    note: "Sun Dagger landscape anchor; approximate point for alignment experiments.",
  },
  {
    siteId: "temple-portara",
    name: "Portara scan source",
    lon: 25.3724,
    lat: 37.1057,
    kind: "scan",
    note: "CyArk/Open Heritage 3D documented the site with laser scanning and photogrammetry.",
  },
  {
    siteId: "cahokia",
    name: "Monks Mound",
    lon: -90.0615,
    lat: 38.6607,
    kind: "mound",
    note: "Major mound at Cahokia; first-pass point for LiDAR/reconstruction experiments.",
  },
  {
    siteId: "cahokia",
    name: "Woodhenge area",
    lon: -90.065,
    lat: 38.655,
    kind: "mound",
    note: "Solar-calendar reconstruction candidate; approximate.",
  },
  {
    siteId: "cahokia",
    name: "Mound 72 area",
    lon: -90.064,
    lat: 38.6535,
    kind: "mound",
    note: "Approximate mound-area marker for future LiDAR overlays.",
  },
] as const;

const reconstructionFootprints: readonly ReconstructionFootprint[] = [
  {
    siteId: "chaco-canyon",
    name: "Pueblo Bonito massing",
    lon: -107.9619,
    lat: 36.0608,
    widthM: 180,
    depthM: 110,
    headingDeg: 2,
    heightM: 18,
    color: Color.GOLD,
    note: "D-shaped great house simplified as a translucent massing block.",
  },
  {
    siteId: "chaco-canyon",
    name: "Chetro Ketl massing",
    lon: -107.9568,
    lat: 36.062,
    widthM: 155,
    depthM: 105,
    headingDeg: 8,
    heightM: 14,
    color: Color.CYAN,
    note: "Approximate elevated-plaza/great-house footprint.",
  },
  {
    siteId: "chaco-canyon",
    name: "Casa Rinconada kiva",
    lon: -107.96025,
    lat: 36.05478,
    widthM: 26,
    depthM: 26,
    headingDeg: 0,
    heightM: 4,
    color: Color.LIME,
    note: "Circular kiva represented as a small footprint marker.",
  },
  {
    siteId: "temple-portara",
    name: "Temple plan",
    lon: 25.3724,
    lat: 37.1057,
    widthM: 16,
    depthM: 38,
    headingDeg: -34,
    heightM: 6,
    color: Color.MAGENTA,
    note: "Unfinished Ionic temple footprint; scan/model import can replace this.",
  },
  {
    siteId: "cahokia",
    name: "Monks Mound massing",
    lon: -90.0615,
    lat: 38.6607,
    widthM: 290,
    depthM: 240,
    headingDeg: 2,
    heightM: 30,
    color: Color.ORANGE,
    note: "Simple mound massing placeholder; LiDAR terrain overlay is the better long-term layer.",
  },
] as const;

const alignmentRays: readonly AlignmentRay[] = [
  {
    siteId: "chaco-canyon",
    name: "Pueblo Bonito north axis",
    lon: -107.9619,
    lat: 36.0608,
    azimuthDeg: 0,
    lengthM: 2300,
    color: Color.WHITE,
    note: "Cardinal north line from Pueblo Bonito center wall tradition.",
  },
  {
    siteId: "chaco-canyon",
    name: "Pueblo Bonito east-west axis",
    lon: -107.9619,
    lat: 36.0608,
    azimuthDeg: 90,
    lengthM: 2300,
    color: Color.YELLOW,
    note: "Cardinal east-west line; useful for comparing house orientation to horizon.",
  },
  {
    siteId: "chaco-canyon",
    name: "Winter solstice sunrise",
    lon: -107.9619,
    lat: 36.0608,
    azimuthDeg: 122,
    lengthM: 2600,
    color: Color.ORANGE,
    note: "Approximate solar azimuth guide, not a measured horizon solution.",
  },
  {
    siteId: "chaco-canyon",
    name: "Summer solstice sunrise",
    lon: -107.9619,
    lat: 36.0608,
    azimuthDeg: 58,
    lengthM: 2600,
    color: Color.SKYBLUE,
    note: "Approximate solar azimuth guide, not a measured horizon solution.",
  },
  {
    siteId: "temple-portara",
    name: "Portara faces Delos",
    lon: 25.3724,
    lat: 37.1057,
    azimuthDeg: 300,
    lengthM: 1800,
    color: Color.MAGENTA,
    note: "Temple orientation guide toward Delos.",
  },
  {
    siteId: "cahokia",
    name: "Woodhenge equinox sunrise",
    lon: -90.065,
    lat: 38.655,
    azimuthDeg: 90,
    lengthM: 1400,
    color: Color.YELLOW,
    note: "Equinox east marker placeholder for future horizon-aware calculations.",
  },
] as const;

const landmarkModels: readonly LandmarkModel[] = [
  {
    siteId: "hohenzollern",
    name: "Hohenzollern Castle GLB",
    lon: 8.96772,
    lat: 48.32319,
    uri: "/models/landmarks/Hohenzollern_Castle.glb",
    headingDeg: 24,
    scale: 2.2,
    heightOffsetM: 45,
    note: "Local GLB placed on Cesium World Terrain near Hohenzollern Castle; scale and heading are first-pass visual alignment values.",
  },
];

const landmarkTuning = new Map<string, LandmarkTuning>();

function landmarkKey(landmark: LandmarkModel): string {
  return `${landmark.siteId}:${landmark.uri}`;
}

function tuningForLandmark(landmark: LandmarkModel): LandmarkTuning {
  const key = landmarkKey(landmark);
  const existing = landmarkTuning.get(key);
  if (existing) return existing;
  const initial = {
    scale: landmark.scale,
    heightOffsetM: landmark.heightOffsetM,
    headingDeg: landmark.headingDeg,
  };
  landmarkTuning.set(key, initial);
  return initial;
}

function activeLandmark(): LandmarkModel | null {
  return landmarkModels.find((landmark) => landmark.siteId === activeSite) ?? null;
}

const style = document.createElement("style");
style.textContent = `
  html, body, #cesium-terrain-root {
    width: 100%;
    height: 100%;
    margin: 0;
    overflow: hidden;
    background: #05070a;
    font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
  }

  .ctv-hud {
    position: fixed;
    inset: 18px auto auto 18px;
    z-index: 3;
    color: #f8fafc;
    text-shadow: 0 1px 3px rgba(0, 0, 0, 0.68);
    pointer-events: none;
  }

  .ctv-title {
    font-size: 26px;
    font-weight: 850;
    line-height: 1.05;
  }

  .ctv-subtitle {
    margin-top: 5px;
    color: rgba(248, 250, 252, 0.78);
    font-size: 13px;
    font-weight: 650;
  }

  .ctv-panel {
    position: fixed;
    left: 18px;
    bottom: 18px;
    z-index: 4;
    width: min(560px, calc(100vw - 36px));
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

  .ctv-buttons {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .ctv-buttons button {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.08);
    color: #f8fafc;
    padding: 8px 10px;
    font-weight: 750;
    cursor: pointer;
  }

  .ctv-buttons button.active {
    background: #facc15;
    border-color: #fde047;
    color: #111827;
  }

  .ctv-row {
    display: grid;
    grid-template-columns: 150px 1fr 58px;
    align-items: center;
    gap: 10px;
    font-size: 13px;
  }

  .ctv-row span {
    color: rgba(248, 250, 252, 0.76);
    font-weight: 650;
  }

  .ctv-row output {
    text-align: right;
    font-variant-numeric: tabular-nums;
    color: #fef3c7;
    font-weight: 800;
  }

  .ctv-row input[type="range"] {
    width: 100%;
    accent-color: #facc15;
  }

  .ctv-row input:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .ctv-toggles {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 8px;
  }

  .ctv-toggle {
    display: flex;
    align-items: center;
    gap: 7px;
    min-width: 0;
    padding: 8px 9px;
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.07);
    font-size: 12px;
    font-weight: 750;
    color: rgba(248, 250, 252, 0.88);
  }

  .ctv-toggle input {
    accent-color: #facc15;
    flex: 0 0 auto;
  }

  .ctv-section-label {
    display: flex;
    justify-content: space-between;
    gap: 10px;
    color: rgba(248, 250, 252, 0.92);
    font-size: 12px;
    font-weight: 850;
    text-transform: uppercase;
  }

  .ctv-section-label small {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: rgba(248, 250, 252, 0.58);
    text-transform: none;
  }

  .ctv-status {
    position: fixed;
    right: 18px;
    bottom: 18px;
    z-index: 4;
    max-width: 320px;
    color: rgba(248, 250, 252, 0.88);
    background: rgba(8, 11, 14, 0.66);
    border: 1px solid rgba(255, 255, 255, 0.14);
    border-radius: 8px;
    padding: 10px 12px;
    font-size: 12px;
    line-height: 1.55;
    font-variant-numeric: tabular-nums;
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
  <div class="ctv-hud">
    <div class="ctv-title">Cesium Terrain Viewer</div>
    <div class="ctv-subtitle">Cesium World Terrain + ion imagery, isolated from Tellus defaults</div>
  </div>
  <div id="cesium-container" style="width: 100%; height: 100%;"></div>
  <div class="ctv-panel" aria-label="Cesium terrain controls">
    <div class="ctv-buttons" data-site-buttons>
      ${sites.map((site) => `<button type="button" data-site="${site.id}">${site.label}</button>`).join("")}
    </div>
    <div class="ctv-toggles" aria-label="Historical overlay toggles">
      <label class="ctv-toggle"><input data-overlay="markers" type="checkbox" checked /> Sites</label>
      <label class="ctv-toggle"><input data-overlay="reconstruction" type="checkbox" checked /> Recon</label>
      <label class="ctv-toggle"><input data-overlay="alignments" type="checkbox" checked /> Align</label>
      <label class="ctv-toggle"><input data-overlay="landmarks" type="checkbox" checked /> Models</label>
    </div>
    <label class="ctv-row">
      <span>Terrain detail</span>
      <input data-control="screenSpaceError" type="range" min="1" max="8" step="0.25" value="2" />
      <output data-output="screenSpaceError">2.00</output>
    </label>
    <label class="ctv-row">
      <span>Vertical exaggeration</span>
      <input data-control="verticalExaggeration" type="range" min="1" max="3" step="0.05" value="1" />
      <output data-output="verticalExaggeration">1.00x</output>
    </label>
    <label class="ctv-row">
      <span>Fog density</span>
      <input data-control="fogDensity" type="range" min="0" max="0.0015" step="0.00005" value="0.00018" />
      <output data-output="fogDensity">0.00018</output>
    </label>
    <div class="ctv-section-label">Model placement <small data-landmark-label>No model on this site</small></div>
    <label class="ctv-row">
      <span>Model scale</span>
      <input data-control="landmarkScale" type="range" min="0.2" max="8" step="0.05" value="1" disabled />
      <output data-output="landmarkScale">--</output>
    </label>
    <label class="ctv-row">
      <span>Height offset</span>
      <input data-control="landmarkHeight" type="range" min="-80" max="180" step="1" value="0" disabled />
      <output data-output="landmarkHeight">--</output>
    </label>
    <label class="ctv-row">
      <span>Heading</span>
      <input data-control="landmarkHeading" type="range" min="-180" max="180" step="1" value="0" disabled />
      <output data-output="landmarkHeading">--</output>
    </label>
  </div>
  <div class="ctv-status" data-status>${token ? "Loading Cesium terrain..." : "Missing VITE_CESIUM_ION_TOKEN in .env.local"}</div>
`;

const viewer = new Viewer("cesium-container", {
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
viewer.scene.globe.dynamicAtmosphereLighting = false;
viewer.scene.globe.maximumScreenSpaceError = 2;
viewer.scene.globe.tileCacheSize = 180;
viewer.scene.fog.enabled = true;
viewer.scene.fog.renderable = true;
viewer.scene.fog.density = 0.00018;
viewer.scene.verticalExaggeration = 1;
viewer.scene.screenSpaceCameraController.minimumZoomDistance = 40;

let activeSite: SiteId = "grand-canyon";
let overlayMarkers = true;
let overlayReconstruction = true;
let overlayAlignments = true;
let overlayLandmarks = true;
let overlayEntities: Entity[] = [];

function offsetLonLat(lon: number, lat: number, eastM: number, northM: number): [number, number] {
  const latRad = CesiumMath.toRadians(lat);
  const metersPerDegreeLat = 110_574;
  const metersPerDegreeLon = 111_320 * Math.cos(latRad);
  return [lon + eastM / metersPerDegreeLon, lat + northM / metersPerDegreeLat];
}

function destinationLonLat(lon: number, lat: number, azimuthDeg: number, distanceM: number): [number, number] {
  const azimuth = CesiumMath.toRadians(azimuthDeg);
  return offsetLonLat(lon, lat, Math.sin(azimuth) * distanceM, Math.cos(azimuth) * distanceM);
}

function orientedRectangleDegrees(
  lon: number,
  lat: number,
  widthM: number,
  depthM: number,
  headingDeg: number,
): number[] {
  const heading = CesiumMath.toRadians(headingDeg);
  const cos = Math.cos(heading);
  const sin = Math.sin(heading);
  const halfW = widthM / 2;
  const halfD = depthM / 2;
  const corners: Array<[number, number]> = [
    [-halfW, -halfD],
    [halfW, -halfD],
    [halfW, halfD],
    [-halfW, halfD],
  ];
  return corners.flatMap(([east, north]) => {
    const rotatedEast = east * cos - north * sin;
    const rotatedNorth = east * sin + north * cos;
    return offsetLonLat(lon, lat, rotatedEast, rotatedNorth);
  });
}

function clearHistoricalOverlays() {
  for (const entity of overlayEntities) viewer.entities.remove(entity);
  overlayEntities = [];
}

function addHistoricalMarker(marker: HistoricalMarker) {
  overlayEntities.push(
    viewer.entities.add({
      name: marker.name,
      position: Cartesian3.fromDegrees(marker.lon, marker.lat),
      description: marker.note,
      point: {
        pixelSize: marker.kind === "scan" ? 12 : 9,
        color: marker.kind === "mound" ? Color.ORANGE : marker.kind === "temple" || marker.kind === "scan" ? Color.MAGENTA : Color.CYAN,
        outlineColor: Color.BLACK,
        outlineWidth: 2,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 80_000),
      },
      label: {
        text: marker.name,
        font: "13px sans-serif",
        fillColor: Color.WHITE,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        pixelOffset: new Cartesian3(0, -18, 0),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 45_000),
      },
    }),
  );
}

function addReconstructionFootprint(footprint: ReconstructionFootprint) {
  const color = footprint.color.withAlpha(0.24);
  overlayEntities.push(
    viewer.entities.add({
      name: footprint.name,
      description: footprint.note,
      polygon: {
        hierarchy: Cartesian3.fromDegreesArray(
          orientedRectangleDegrees(
            footprint.lon,
            footprint.lat,
            footprint.widthM,
            footprint.depthM,
            footprint.headingDeg,
          ),
        ),
        heightReference: HeightReference.CLAMP_TO_GROUND,
        extrudedHeight: footprint.heightM,
        material: color,
        outline: true,
        outlineColor: footprint.color.withAlpha(0.8),
        distanceDisplayCondition: new DistanceDisplayCondition(0, 80_000),
      },
    }),
  );
}

function addAlignmentRay(ray: AlignmentRay) {
  const [endLon, endLat] = destinationLonLat(ray.lon, ray.lat, ray.azimuthDeg, ray.lengthM);
  overlayEntities.push(
    viewer.entities.add({
      name: ray.name,
      description: ray.note,
      polyline: {
        positions: Cartesian3.fromDegreesArray([ray.lon, ray.lat, endLon, endLat]),
        clampToGround: true,
        width: 4,
        material: ray.color.withAlpha(0.78),
        arcType: ArcType.GEODESIC,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 100_000),
      },
    }),
  );
  overlayEntities.push(
    viewer.entities.add({
      name: `${ray.name} label`,
      position: Cartesian3.fromDegrees(endLon, endLat),
      label: {
        text: ray.name,
        font: "12px sans-serif",
        fillColor: ray.color,
        outlineColor: Color.BLACK,
        outlineWidth: 3,
        style: LabelStyle.FILL_AND_OUTLINE,
        verticalOrigin: VerticalOrigin.BOTTOM,
        heightReference: HeightReference.CLAMP_TO_GROUND,
        disableDepthTestDistance: Number.POSITIVE_INFINITY,
        distanceDisplayCondition: new DistanceDisplayCondition(0, 55_000),
      },
    }),
  );
}

function addLandmarkModel(landmark: LandmarkModel) {
  const tuning = tuningForLandmark(landmark);
  const position = Cartesian3.fromDegrees(landmark.lon, landmark.lat, tuning.heightOffsetM);
  overlayEntities.push(
    viewer.entities.add({
      name: landmark.name,
      position,
      orientation: Transforms.headingPitchRollQuaternion(
        position,
        new HeadingPitchRoll(CesiumMath.toRadians(tuning.headingDeg), 0, 0),
      ),
      description: landmark.note,
      model: {
        uri: landmark.uri,
        scale: tuning.scale,
        heightReference: HeightReference.RELATIVE_TO_GROUND,
        shadows: 1,
      },
    }),
  );
}

function syncLandmarkControls() {
  const landmark = activeLandmark();
  const label = document.querySelector<HTMLElement>("[data-landmark-label]");
  const controls = {
    landmarkScale: document.querySelector<HTMLInputElement>('[data-control="landmarkScale"]'),
    landmarkHeight: document.querySelector<HTMLInputElement>('[data-control="landmarkHeight"]'),
    landmarkHeading: document.querySelector<HTMLInputElement>('[data-control="landmarkHeading"]'),
  };
  const outputs = {
    landmarkScale: document.querySelector<HTMLOutputElement>('[data-output="landmarkScale"]'),
    landmarkHeight: document.querySelector<HTMLOutputElement>('[data-output="landmarkHeight"]'),
    landmarkHeading: document.querySelector<HTMLOutputElement>('[data-output="landmarkHeading"]'),
  };

  if (!landmark) {
    if (label) label.textContent = "No model on this site";
    for (const control of Object.values(controls)) {
      if (control) control.disabled = true;
    }
    for (const out of Object.values(outputs)) {
      if (out) out.textContent = "--";
    }
    return;
  }

  const tuning = tuningForLandmark(landmark);
  if (label) label.textContent = landmark.name;
  if (controls.landmarkScale) {
    controls.landmarkScale.disabled = false;
    controls.landmarkScale.value = tuning.scale.toFixed(2);
  }
  if (controls.landmarkHeight) {
    controls.landmarkHeight.disabled = false;
    controls.landmarkHeight.value = tuning.heightOffsetM.toFixed(0);
  }
  if (controls.landmarkHeading) {
    controls.landmarkHeading.disabled = false;
    controls.landmarkHeading.value = tuning.headingDeg.toFixed(0);
  }
  if (outputs.landmarkScale) outputs.landmarkScale.textContent = `${tuning.scale.toFixed(2)}x`;
  if (outputs.landmarkHeight) outputs.landmarkHeight.textContent = `${tuning.heightOffsetM.toFixed(0)}m`;
  if (outputs.landmarkHeading) outputs.landmarkHeading.textContent = `${tuning.headingDeg.toFixed(0)}°`;
}

function updateActiveLandmarkTuning(update: Partial<LandmarkTuning>) {
  const landmark = activeLandmark();
  if (!landmark) return;
  const tuning = tuningForLandmark(landmark);
  Object.assign(tuning, update);
  syncLandmarkControls();
  refreshHistoricalOverlays();
}

function refreshHistoricalOverlays() {
  clearHistoricalOverlays();
  if (overlayMarkers) {
    historicalMarkers.filter((marker) => marker.siteId === activeSite).forEach(addHistoricalMarker);
  }
  if (overlayReconstruction) {
    reconstructionFootprints
      .filter((footprint) => footprint.siteId === activeSite)
      .forEach(addReconstructionFootprint);
  }
  if (overlayAlignments) {
    alignmentRays.filter((ray) => ray.siteId === activeSite).forEach(addAlignmentRay);
  }
  if (overlayLandmarks) {
    landmarkModels.filter((landmark) => landmark.siteId === activeSite).forEach(addLandmarkModel);
  }
  viewer.scene.requestRender();
}

function setStatus(message: string) {
  const status = document.querySelector<HTMLDivElement>("[data-status]");
  if (status) status.innerHTML = message;
}

function setActiveButton(siteId: SiteId) {
  document.querySelectorAll<HTMLButtonElement>("[data-site]").forEach((button) => {
    button.classList.toggle("active", button.dataset.site === siteId);
  });
}

function flyToSite(siteId: SiteId, duration = 0.8) {
  const site = sites.find((item) => item.id === siteId) ?? sites[0]!;
  activeSite = site.id;
  setActiveButton(site.id);
  syncLandmarkControls();
  refreshHistoricalOverlays();
  const [west, south, east, north] = site.rectangle;
  viewer.camera.flyTo({
    destination: Cartesian3.fromDegrees(site.destination[0], site.destination[1], site.destination[2]),
    orientation: {
      heading: CesiumMath.toRadians(site.heading),
      pitch: CesiumMath.toRadians(site.pitch),
      roll: CesiumMath.toRadians(site.roll ?? 0),
    },
    duration,
  });
  setStatus(`
    ${site.label}<br />
    terrain Cesium World Terrain<br />
    imagery Cesium ion default imagery<br />
    overlays ${overlayMarkers ? "sites" : ""}${overlayReconstruction ? " recon" : ""}${overlayAlignments ? " align" : ""}${overlayLandmarks ? " models" : ""}<br />
    bbox ${west.toFixed(2)}, ${south.toFixed(2)} to ${east.toFixed(2)}, ${north.toFixed(2)}
  `);
}

function bindControls() {
  const output = (name: string) => document.querySelector<HTMLOutputElement>(`[data-output="${name}"]`);
  const control = (name: string) => document.querySelector<HTMLInputElement>(`[data-control="${name}"]`);
  control("screenSpaceError")?.addEventListener("input", (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    viewer.scene.globe.maximumScreenSpaceError = value;
    const out = output("screenSpaceError");
    if (out) out.textContent = value.toFixed(2);
    viewer.scene.requestRender();
  });
  control("verticalExaggeration")?.addEventListener("input", (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    viewer.scene.verticalExaggeration = value;
    const out = output("verticalExaggeration");
    if (out) out.textContent = `${value.toFixed(2)}x`;
    viewer.scene.requestRender();
  });
  control("fogDensity")?.addEventListener("input", (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    viewer.scene.fog.density = value;
    const out = output("fogDensity");
    if (out) out.textContent = value.toFixed(5);
    viewer.scene.requestRender();
  });
  control("landmarkScale")?.addEventListener("input", (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value)) updateActiveLandmarkTuning({ scale: value });
  });
  control("landmarkHeight")?.addEventListener("input", (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value)) updateActiveLandmarkTuning({ heightOffsetM: value });
  });
  control("landmarkHeading")?.addEventListener("input", (event) => {
    const value = Number((event.currentTarget as HTMLInputElement).value);
    if (Number.isFinite(value)) updateActiveLandmarkTuning({ headingDeg: value });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-site]").forEach((button) => {
    button.addEventListener("click", () => flyToSite(button.dataset.site as SiteId));
  });
  document.querySelectorAll<HTMLInputElement>("[data-overlay]").forEach((toggle) => {
    toggle.addEventListener("change", () => {
      const kind = toggle.dataset.overlay;
      if (kind === "markers") overlayMarkers = toggle.checked;
      if (kind === "reconstruction") overlayReconstruction = toggle.checked;
      if (kind === "alignments") overlayAlignments = toggle.checked;
      if (kind === "landmarks") overlayLandmarks = toggle.checked;
      refreshHistoricalOverlays();
    });
  });
}

viewer.scene.globe.tileLoadProgressEvent.addEventListener((remaining) => {
  const site = sites.find((item) => item.id === activeSite) ?? sites[0]!;
  setStatus(`
    ${site.label}<br />
    terrain Cesium World Terrain<br />
    imagery Cesium ion default imagery<br />
    overlays ${overlayMarkers ? "sites" : ""}${overlayReconstruction ? " recon" : ""}${overlayAlignments ? " align" : ""}${overlayLandmarks ? " models" : ""}<br />
    pending tiles ${remaining}
  `);
});

viewer.scene.globe.terrainProviderChanged.addEventListener((provider) => {
  console.info("Cesium terrain provider", provider.constructor.name);
});

bindControls();
flyToSite("grand-canyon", 0);
