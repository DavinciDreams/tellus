// Avatar + TV-head builders and the P2P video screen machinery, extracted from main.tsx.
// Self-contained: depends only on THREE + the TSL/WebGPU node helpers, no app state. Remote AND local
// visitors render as a robot with a TV head whose screen defaults to animated static and swaps to a live
// <video> texture when a peer's WebRTC MediaStream arrives.
import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
import { mx_worley_noise_float, texture, time, uv, vec2, vec3 } from "three/tsl";

// State stashed on a screen mesh (`screen.userData.tvScreen`) so the video can hot-swap without
// rebuilding the avatar.
export interface TvScreenState {
  mode: "static" | "video";
  rendererIsWebGPU: boolean;
  videoEl: HTMLVideoElement | null;
  videoTexture: THREE.VideoTexture | null;
}

// One shared animated-static texture for every default (no-video) screen — repainted ~12fps in
// the render tick (WebGL path only; the WebGPU path generates snow on the GPU with zero upload).
let sharedStaticCanvas: HTMLCanvasElement | null = null;
let sharedStaticTexture: THREE.CanvasTexture | null = null;
let sharedStaticLastPaint = 0;

function paintSharedStatic(): void {
  const canvas = sharedStaticCanvas;
  const tex = sharedStaticTexture;
  if (!canvas || !tex) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  const img = ctx.createImageData(canvas.width, canvas.height);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const v = (Math.random() * 255) | 0;
    d[i] = v;
    d[i + 1] = v;
    d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  tex.needsUpdate = true;
}

function getSharedStaticTexture(): THREE.CanvasTexture {
  if (!sharedStaticTexture) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 96;
    sharedStaticCanvas = canvas;
    sharedStaticTexture = new THREE.CanvasTexture(canvas);
    sharedStaticTexture.colorSpace = THREE.SRGBColorSpace;
    paintSharedStatic();
  }
  return sharedStaticTexture;
}

// Called once per frame from animate(); throttled to ~12fps. No-op until a static screen exists.
export function tickSharedStatic(nowMs: number): void {
  if (!sharedStaticTexture) return;
  if (nowMs - sharedStaticLastPaint < 83) return;
  sharedStaticLastPaint = nowMs;
  paintSharedStatic();
}

// Build a fresh unlit screen material showing animated static. WebGPU: GPU worley-noise node
// (no CPU upload). WebGL: a MeshBasicMaterial mapped to the shared repainted CanvasTexture.
function makeStaticScreenMaterial(rendererIsWebGPU: boolean): THREE.Material {
  if (rendererIsWebGPU) {
    const mat = new MeshBasicNodeMaterial();
    const n = mx_worley_noise_float(uv().mul(vec2(36, 28)).add(time.mul(7)));
    mat.colorNode = vec3(n, n, n);
    return mat;
  }
  return new THREE.MeshBasicMaterial({ map: getSharedStaticTexture() });
}

// Swap a screen mesh to static (releasing any prior video material/texture but never the shared
// static CanvasTexture).
export function applyStaticToScreen(screen: THREE.Mesh, rendererIsWebGPU: boolean): void {
  const state = screen.userData.tvScreen as TvScreenState | undefined;
  // Dispose prior per-screen material (and video texture/element if any).
  const prev = screen.material;
  if (state?.videoTexture) {
    try {
      state.videoTexture.dispose();
    } catch {
      /* ignore */
    }
  }
  if (state?.videoEl) {
    try {
      state.videoEl.pause();
      state.videoEl.srcObject = null;
    } catch {
      /* ignore */
    }
  }
  if (Array.isArray(prev)) {
    for (const m of prev) m.dispose();
  } else if (prev) {
    prev.dispose();
  }
  screen.material = makeStaticScreenMaterial(rendererIsWebGPU);
  screen.userData.tvScreen = {
    mode: "static",
    rendererIsWebGPU,
    videoEl: null,
    videoTexture: null,
  } satisfies TvScreenState;
}

// Swap a screen mesh to a live MediaStream. Fully contained — any failure falls back to static.
export function applyVideoToScreen(screen: THREE.Mesh, stream: MediaStream): void {
  const state = screen.userData.tvScreen as TvScreenState | undefined;
  const rendererIsWebGPU = state?.rendererIsWebGPU ?? false;
  try {
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = stream;
    void video.play().catch(() => undefined);
    const videoTexture = new THREE.VideoTexture(video);
    videoTexture.colorSpace = THREE.SRGBColorSpace;

    // Release the prior material/texture before swapping.
    const prev = screen.material;
    if (state?.videoTexture) {
      try {
        state.videoTexture.dispose();
      } catch {
        /* ignore */
      }
    }
    if (state?.videoEl) {
      try {
        state.videoEl.pause();
        state.videoEl.srcObject = null;
      } catch {
        /* ignore */
      }
    }
    if (Array.isArray(prev)) {
      for (const m of prev) m.dispose();
    } else if (prev) {
      prev.dispose();
    }

    if (rendererIsWebGPU) {
      const mat = new MeshBasicNodeMaterial();
      mat.colorNode = texture(videoTexture);
      screen.material = mat;
    } else {
      screen.material = new THREE.MeshBasicMaterial({ map: videoTexture });
    }
    screen.userData.tvScreen = {
      mode: "video",
      rendererIsWebGPU,
      videoEl: video,
      videoTexture,
    } satisfies TvScreenState;
  } catch {
    // Texture/stream error → degrade this one TV to static; never throws into the render loop.
    applyStaticToScreen(screen, rendererIsWebGPU);
  }
}

export function createRemoteVisitorMesh(
  rendererIsWebGPU: boolean,
  markerColor = 0xf5f0b8,
): THREE.Group {
  const group = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x9aa6b8,
    roughness: 0.55,
    metalness: 0.45,
  });
  const jointMaterial = new THREE.MeshStandardMaterial({
    color: 0x5b6470,
    roughness: 0.6,
    metalness: 0.4,
  });
  const markerMaterial = new THREE.MeshStandardMaterial({
    color: markerColor,
    emissive: 0x334466,
    emissiveIntensity: 0.35,
    roughness: 0.55,
  });

  // Procedural body parts are collected so the async VRM upgrade (tellus-vrm-avatar.ts) can hide
  // them in place — the TV screen, TV box and marker ring stay live (P2P video rides the screen).
  const bodyParts: THREE.Object3D[] = [];
  // Legs.
  for (const x of [-0.22, 0.22]) {
    const leg = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.15, 0.9, 12),
      jointMaterial,
    );
    leg.position.set(x, 0.45, 0);
    group.add(leg);
    bodyParts.push(leg);
  }
  // Hips + torso.
  const hips = new THREE.Mesh(
    new THREE.BoxGeometry(0.62, 0.3, 0.42),
    bodyMaterial,
  );
  hips.position.y = 1.02;
  const torso = new THREE.Mesh(
    new THREE.BoxGeometry(0.72, 0.82, 0.46),
    bodyMaterial,
  );
  torso.position.y = 1.6;
  group.add(hips, torso);
  bodyParts.push(hips, torso);
  // Arms.
  for (const x of [-0.52, 0.52]) {
    const arm = new THREE.Mesh(
      new THREE.CylinderGeometry(0.1, 0.1, 0.82, 12),
      jointMaterial,
    );
    arm.position.set(x, 1.58, 0);
    group.add(arm);
    bodyParts.push(arm);
  }
  // Neck.
  const neck = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.12, 0.18, 10),
    jointMaterial,
  );
  neck.position.y = 2.12;
  group.add(neck);
  bodyParts.push(neck);
  // Default (no-video) head — a compact box shown INSTEAD of the TV head whenever the visitor isn't
  // transmitting, so a non-streaming robot isn't headless. A body part, so the VRM upgrade hides it too.
  const defaultHead = new THREE.Mesh(
    new THREE.BoxGeometry(0.46, 0.42, 0.42),
    bodyMaterial,
  );
  defaultHead.position.y = 2.46;
  group.add(defaultHead);
  bodyParts.push(defaultHead);
  // TV head (box) + front-face screen plane.
  const tv = new THREE.Mesh(
    new THREE.BoxGeometry(0.86, 0.68, 0.7),
    bodyMaterial,
  );
  tv.position.y = 2.5;
  group.add(tv);
  const screen = new THREE.Mesh(
    new THREE.PlaneGeometry(0.7, 0.52),
    makeStaticScreenMaterial(rendererIsWebGPU),
  );
  screen.position.set(0, 2.5, 0.351); // flush on the +Z front face of the TV box
  screen.userData.tvScreen = {
    mode: "static",
    rendererIsWebGPU,
    videoEl: null,
    videoTexture: null,
  } satisfies TvScreenState;
  group.add(screen);
  // Presence ring above the head.
  const marker = new THREE.Mesh(
    new THREE.TorusGeometry(0.52, 0.035, 8, 28),
    markerMaterial,
  );
  marker.position.y = 3.0;
  marker.rotation.x = Math.PI / 2;
  group.add(marker);

  group.userData.tvScreenRef = screen;
  group.userData.robotBodyParts = bodyParts;
  group.userData.tvBoxRef = tv;
  group.userData.defaultHeadRef = defaultHead;
  group.userData.markerRef = marker;
  // Start NOT transmitting: TV head hidden, default head shown.
  setTvHeadActive(group, false);
  return group;
}

/// Show the TV head (box + video screen) only while a visitor is transmitting video/audio; otherwise hide
/// it and (for a non-upgraded robot) show the compact default head instead. For a VRM-upgraded avatar the
/// procedural body — incl. the default head — is already hidden, so only the TV toggles (it floats over the
/// VRM while streaming, vanishes when not). Called on every TX on/off transition.
export function setTvHeadActive(group: THREE.Group, active: boolean): void {
  const tvBox = group.userData.tvBoxRef as THREE.Object3D | undefined;
  const screen = group.userData.tvScreenRef as THREE.Object3D | undefined;
  const defaultHead = group.userData.defaultHeadRef as THREE.Object3D | undefined;
  const vrmUpgraded = Boolean(group.userData.avatarMountedModel);
  if (tvBox) tvBox.visible = active;
  if (screen) screen.visible = active;
  if (defaultHead) defaultHead.visible = !active && !vrmUpgraded;
}

// The LOCAL player's avatar — same robot + TV-head as remotes (so self-video renders on it), with a
// green presence ring to distinguish "you".
export function createVisitorMesh(rendererIsWebGPU: boolean): THREE.Group {
  return createRemoteVisitorMesh(rendererIsWebGPU, 0x7ec850);
}
