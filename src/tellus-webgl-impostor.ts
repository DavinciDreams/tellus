import * as THREE from "three";
import { assetImpostorViewBlend } from "./tellus-asset-impostor";
import type { TellusImpostorInstance } from "./tellus-impostor";

export interface WebGlImpostorBakeOptions {
  atlasSize?: number;
  gridSize?: number;
  padding?: number;
}

export interface WebGlImpostorHandle {
  readonly boundingBox: THREE.Box3;
  readonly triangleCount: number;
  createInstance(scale?: number, yaw?: number): TellusImpostorInstance;
  dispose(): void;
}

const vertexShader = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const fragmentShader = `
  uniform sampler2D atlas;
  uniform vec2 gridSize;
  uniform vec3 faceIndices;
  uniform vec3 faceWeights;
  varying vec2 vUv;

  vec2 atlasUv(float flatIndex) {
    float row = floor(flatIndex / gridSize.x);
    float col = flatIndex - row * gridSize.x;
    vec2 inset = vec2(0.75) / (vec2(textureSize(atlas, 0)) / gridSize);
    vec2 cellUv = mix(inset, vec2(1.0) - inset, vUv);
    return vec2(
      (col + cellUv.x) / gridSize.x,
      1.0 - (row + 1.0 - cellUv.y) / gridSize.y
    );
  }

  void main() {
    vec4 a = texture2D(atlas, atlasUv(faceIndices.x));
    vec4 b = texture2D(atlas, atlasUv(faceIndices.y));
    vec4 c = texture2D(atlas, atlasUv(faceIndices.z));
    vec3 weightedAlpha = faceWeights * vec3(a.a, b.a, c.a);
    float alpha = weightedAlpha.x + weightedAlpha.y + weightedAlpha.z;
    if (alpha < 0.12) discard;
    vec3 rgb = (a.rgb * weightedAlpha.x + b.rgb * weightedAlpha.y + c.rgb * weightedAlpha.z) /
      max(alpha, 0.0001);
    gl_FragColor = vec4(rgb, clamp(alpha, 0.0, 1.0));
  }
`;

/** Inverse of the hemi-octahedral direction encoding used by the runtime shader. */
export const hemiOctahedralViewDirection = (u: number, v: number): THREE.Vector3 => {
  const x = u - v;
  const z = -1 + u + v;
  const y = Math.max(0, 1 - Math.abs(x) - Math.abs(z));
  return new THREE.Vector3(x, y, z).normalize();
};

export const isWebGlImpostorBakingSupported = (renderer: unknown): renderer is THREE.WebGLRenderer =>
  Boolean(renderer && typeof renderer === "object" && (renderer as { isWebGLRenderer?: boolean }).isWebGLRenderer);

const sourceTriangleCount = (source: THREE.Object3D): number => {
  let triangles = 0;
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    const geometry = object.geometry;
    const perInstance = geometry.index?.count
      ? geometry.index.count / 3
      : (geometry.getAttribute("position")?.count ?? 0) / 3;
    triangles += perInstance * (object instanceof THREE.InstancedMesh ? object.count : 1);
  });
  return triangles;
};

/**
 * Bake a lit color atlas directly into a WebGL render target. This is intentionally color-only:
 * distant trees keep their authored silhouette and material response while replacing thousands of
 * triangles with one quad. Detailed geometry and dynamic foliage wind remain unchanged near-field.
 */
export const bakeWebGlImpostor = (
  source: THREE.Object3D,
  renderer: THREE.WebGLRenderer,
  options: WebGlImpostorBakeOptions = {},
): WebGlImpostorHandle => {
  const atlasSize = THREE.MathUtils.clamp(Math.floor(options.atlasSize ?? 512), 128, 2048);
  const gridSize = THREE.MathUtils.clamp(Math.floor(options.gridSize ?? 8), 2, 16);
  const padding = THREE.MathUtils.clamp(options.padding ?? 1.15, 1.02, 1.4);
  const cellSize = Math.floor(atlasSize / gridSize);
  const boundingBox = new THREE.Box3().setFromObject(source);
  if (boundingBox.isEmpty()) throw new Error("Cannot bake an empty impostor source");
  const center = boundingBox.getCenter(new THREE.Vector3());
  const size = boundingBox.getSize(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 1e-4);
  const effectiveDiameter = maxDimension * padding;
  const triangleCount = sourceTriangleCount(source);

  const target = new THREE.WebGLRenderTarget(atlasSize, atlasSize, {
    format: THREE.RGBAFormat,
    type: THREE.UnsignedByteType,
    minFilter: THREE.LinearMipmapLinearFilter,
    magFilter: THREE.LinearFilter,
    depthBuffer: true,
    stencilBuffer: false,
    generateMipmaps: true,
  });
  target.texture.name = "tellus-weber-penn-impostor-atlas";
  target.texture.colorSpace = THREE.SRGBColorSpace;

  const bakeScene = new THREE.Scene();
  const wrapper = new THREE.Group();
  wrapper.add(source);
  source.position.sub(center);
  const normalizedScale = 1 / effectiveDiameter;
  source.scale.multiplyScalar(normalizedScale);
  bakeScene.add(wrapper);
  bakeScene.add(new THREE.HemisphereLight(0xdce9ff, 0x25331f, 1.65));
  const key = new THREE.DirectionalLight(0xfff1d2, 2.2);
  key.position.set(-2.5, 4, 3);
  bakeScene.add(key);
  const camera = new THREE.OrthographicCamera(-0.5, 0.5, 0.5, -0.5, 0.01, 4);

  const oldTarget = renderer.getRenderTarget();
  const oldViewport = renderer.getViewport(new THREE.Vector4());
  const oldScissor = renderer.getScissor(new THREE.Vector4());
  const oldScissorTest = renderer.getScissorTest();
  const oldClearColor = renderer.getClearColor(new THREE.Color());
  const oldClearAlpha = renderer.getClearAlpha();
  const oldToneMapping = renderer.toneMapping;
  const oldExposure = renderer.toneMappingExposure;
  const oldAutoClear = renderer.autoClear;
  try {
    renderer.setRenderTarget(target);
    renderer.setClearColor(0x000000, 0);
    renderer.setViewport(0, 0, atlasSize, atlasSize);
    renderer.setScissor(0, 0, atlasSize, atlasSize);
    renderer.setScissorTest(false);
    renderer.clear(true, true, false);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1;
    renderer.autoClear = false;
    renderer.setScissorTest(true);
    for (let row = 0; row < gridSize; row++) {
      for (let column = 0; column < gridSize; column++) {
        const u = (column + 0.5) / gridSize;
        const v = (row + 0.5) / gridSize;
        const direction = hemiOctahedralViewDirection(u, v);
        camera.position.copy(direction).multiplyScalar(1.4);
        camera.lookAt(0, 0, 0);
        camera.updateMatrixWorld();
        const viewportY = atlasSize - (row + 1) * cellSize;
        renderer.setViewport(column * cellSize, viewportY, cellSize, cellSize);
        renderer.setScissor(column * cellSize, viewportY, cellSize, cellSize);
        renderer.clear(true, true, false);
        renderer.render(bakeScene, camera);
      }
    }
  } finally {
    wrapper.remove(source);
    source.position.add(center);
    source.scale.multiplyScalar(1 / normalizedScale);
    renderer.setRenderTarget(oldTarget);
    renderer.setViewport(oldViewport);
    renderer.setScissor(oldScissor);
    renderer.setScissorTest(oldScissorTest);
    renderer.setClearColor(oldClearColor, oldClearAlpha);
    renderer.toneMapping = oldToneMapping;
    renderer.toneMappingExposure = oldExposure;
    renderer.autoClear = oldAutoClear;
  }

  return {
    boundingBox: boundingBox.clone(),
    triangleCount,
    createInstance(scale = 1, yaw = 0): TellusImpostorInstance {
      const geometry = new THREE.PlaneGeometry(effectiveDiameter * scale, effectiveDiameter * scale);
      const material = new THREE.ShaderMaterial({
        uniforms: {
          atlas: { value: target.texture },
          gridSize: { value: new THREE.Vector2(gridSize, gridSize) },
          faceIndices: { value: new THREE.Vector3() },
          faceWeights: { value: new THREE.Vector3(1, 0, 0) },
        },
        vertexShader,
        fragmentShader,
        transparent: true,
        alphaTest: 0.12,
        depthTest: true,
        depthWrite: true,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = "tellus-weber-penn-impostor";
      const cameraPosition = new THREE.Vector3();
      const meshPosition = new THREE.Vector3();
      const direction = new THREE.Vector3();
      const update = (activeCamera: THREE.Camera) => {
        activeCamera.getWorldPosition(cameraPosition);
        mesh.getWorldPosition(meshPosition);
        direction.subVectors(cameraPosition, meshPosition);
        if (direction.lengthSq() < 1e-8) direction.set(0, 1, 0);
        direction.applyAxisAngle(THREE.Object3D.DEFAULT_UP, -yaw);
        const view = assetImpostorViewBlend(direction, gridSize, gridSize, "hemi");
        material.uniforms.faceIndices!.value.copy(view.faceIndices);
        material.uniforms.faceWeights!.value.copy(view.faceWeights);
        mesh.lookAt(cameraPosition);
      };
      mesh.onBeforeRender = (_renderer, _scene, activeCamera) => update(activeCamera);
      return {
        mesh,
        update,
        dispose: () => {
          geometry.dispose();
          material.dispose();
        },
      };
    },
    dispose: () => target.dispose(),
  };
};
