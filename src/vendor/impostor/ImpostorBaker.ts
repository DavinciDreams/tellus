/**
 * Octahedral Impostor Library - Atlas Baker
 *
 * Handles baking of 3D meshes into octahedral impostor atlases.
 * Supports AAA-quality impostor rendering with:
 * - Per-pixel depth maps for parallax and depth-based blending
 * - PBR material channels (roughness, metallic, AO)
 * - Unlit albedo for proper dynamic lighting
 *
 * Architecture: All public bake methods delegate to a unified bakeCore()
 * multi-pass renderer, eliminating code duplication across bake variants.
 */

import * as THREE from "three/webgpu";
import { MeshBasicNodeMaterial, MeshStandardNodeMaterial } from "three/webgpu";
import type { ImpostorBakeConfig, ImpostorBakeResult } from "./types";
import { OctahedronType, PBRBakeMode } from "./types";
import {
  buildOctahedronMesh,
  lerpOctahedronGeometry,
} from "./OctahedronGeometry";

// TSL functions from three/webgpu for baking materials
const {
  Fn,
  uv,
  positionView,
  uniform,
  texture,
  float,
  vec4,
  sub,
  div,
  mul,
  clamp,
} = THREE.TSL;

// ============================================================================
// SHARED CONSTANTS
// ============================================================================

/** Standard render target options reused across all atlas/cell targets */
const RT_OPTIONS = {
  format: THREE.RGBAFormat,
  type: THREE.UnsignedByteType,
  minFilter: THREE.LinearFilter,
  magFilter: THREE.LinearFilter,
  generateMipmaps: false,
} as const;

// ============================================================================
// TSL BAKING MATERIALS (WebGPU-native)
// ============================================================================

/**
 * TSL depth material type with uniforms for camera planes
 */
type TSLDepthMaterial = MeshBasicNodeMaterial & {
  depthUniforms: {
    cameraNear: { value: number };
    cameraFar: { value: number };
  };
};

/**
 * Create a TSL depth material for baking linear depth to atlas.
 */
export function createTSLDepthMaterial(
  nearPlane: number,
  farPlane: number,
): TSLDepthMaterial {
  const material = new MeshBasicNodeMaterial();

  const uNear = uniform(nearPlane);
  const uFar = uniform(farPlane);

  material.colorNode = Fn(() => {
    const viewZ = mul(positionView.z, float(-1.0));
    const linearDepth = clamp(
      div(sub(viewZ, uNear), sub(uFar, uNear)),
      float(0.0),
      float(1.0),
    );
    return vec4(linearDepth, linearDepth, linearDepth, float(1.0));
  })();

  material.side = THREE.DoubleSide;

  const tslMaterial = material as TSLDepthMaterial;
  tslMaterial.depthUniforms = {
    cameraNear: uNear,
    cameraFar: uFar,
  };

  return tslMaterial;
}

/**
 * TSL PBR material type with uniforms
 */
type TSLPBRMaterial = MeshBasicNodeMaterial & {
  pbrUniforms: {
    roughness: { value: number };
    metalness: { value: number };
    aoMapIntensity: { value: number };
  };
};

/**
 * Create a TSL PBR channel material for baking roughness/metallic/AO to atlas.
 */
export function createTSLPBRMaterial(
  roughnessVal: number,
  metalnessVal: number,
  aoIntensity: number,
  roughnessMap: THREE.Texture | null = null,
  metalnessMap: THREE.Texture | null = null,
  aoMap: THREE.Texture | null = null,
): TSLPBRMaterial {
  const material = new MeshBasicNodeMaterial();

  const uRoughness = uniform(roughnessVal);
  const uMetalness = uniform(metalnessVal);
  const uAOIntensity = uniform(aoIntensity);

  material.colorNode = Fn(() => {
    const uvCoord = uv();

    const r = roughnessMap
      ? mul(texture(roughnessMap, uvCoord).g, uRoughness)
      : uRoughness;

    const g = metalnessMap
      ? mul(texture(metalnessMap, uvCoord).b, uMetalness)
      : uMetalness;

    const b = aoMap ? mul(texture(aoMap, uvCoord).r, uAOIntensity) : float(1.0);

    return vec4(r, g, b, float(1.0));
  })();

  material.side = THREE.FrontSide;

  const tslMaterial = material as TSLPBRMaterial;
  tslMaterial.pbrUniforms = {
    roughness: uRoughness,
    metalness: uMetalness,
    aoMapIntensity: uAOIntensity,
  };

  return tslMaterial;
}

/**
 * Renderer interface that works with WebGPURenderer.
 */
export interface CompatibleRenderer {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getRenderTarget(): any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setRenderTarget(
    target: any,
    activeCubeFace?: number,
    activeMipmapLevel?: number,
  ): void;
  getViewport(target: THREE.Vector4): THREE.Vector4;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setViewport(...args: any[]): void;
  setScissorTest(enable: boolean): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  setScissor(...args: any[]): void;
  setClearColor(color: THREE.ColorRepresentation, alpha?: number): void;
  clear(color?: boolean, depth?: boolean, stencil?: boolean): void;
  render(scene: THREE.Object3D, camera: THREE.Camera): void;
  renderAsync?(scene: THREE.Object3D, camera: THREE.Camera): Promise<void>;
  getPixelRatio(): number;
  setPixelRatio(value: number): void;
  toneMapping?: THREE.ToneMapping;
  toneMappingExposure?: number;
  outputColorSpace?: THREE.ColorSpace | string;
  autoClear?: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRenderTargetPixels?(...args: unknown[]): void;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  readRenderTargetPixelsAsync?(...args: unknown[]): Promise<unknown>;
}

/**
 * Default baking configuration
 */
export const DEFAULT_BAKE_CONFIG: ImpostorBakeConfig = {
  atlasWidth: 2048,
  atlasHeight: 2048,
  gridSizeX: 31,
  gridSizeY: 31,
  octType: OctahedronType.HEMI,
  backgroundColor: 0x000000,
  backgroundAlpha: 0,
  pbrMode: PBRBakeMode.STANDARD,
  depthNear: 0.001,
  depthFar: 10,
};

// ============================================================================
// BAKE CORE TYPES
// ============================================================================

/** Definition of a single render pass in the multi-pass bake pipeline */
interface BakePassDef {
  name: string;
  colorSpace: THREE.ColorSpace;
  clearColor: number;
  clearAlpha: number;
  /** Materials for each mesh (parallel to meshes array). */
  materials: (THREE.Material | THREE.Material[])[];
}

/**
 * ImpostorBaker - Bakes 3D meshes into octahedral impostor atlases
 *
 * WebGPU only. Uses a unified multi-pass bakeCore() to eliminate code
 * duplication across bake variants (color-only, normals, full PBR).
 */
export class ImpostorBaker {
  private renderer: CompatibleRenderer;
  private renderScene: THREE.Scene;
  private renderCamera: THREE.OrthographicCamera;
  private ambientLight: THREE.AmbientLight;
  private directionalLight: THREE.DirectionalLight;

  // Reusable temp objects for baking (avoids per-cell allocations)
  private _viewDir = new THREE.Vector3();
  private _boxSize = new THREE.Vector3();

  constructor(renderer: CompatibleRenderer) {
    this.renderer = renderer;

    this.renderScene = new THREE.Scene();

    const orthoSize = 0.5;
    this.renderCamera = new THREE.OrthographicCamera(
      -orthoSize,
      orthoSize,
      orthoSize,
      -orthoSize,
      0.001,
      10,
    );

    this.ambientLight = new THREE.AmbientLight(0xffffff, 2.6);
    this.directionalLight = new THREE.DirectionalLight(0xffffff, 3.8);
    this.directionalLight.position.set(5, 10, 7.5);

    this.renderScene.add(this.ambientLight);
    this.renderScene.add(this.directionalLight);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  /** Create a render target with standard configuration */
  private createRT(
    width: number,
    height: number,
    colorSpace: THREE.ColorSpace,
  ): THREE.RenderTarget {
    const rt = new THREE.RenderTarget(width, height, RT_OPTIONS);
    rt.texture.colorSpace = colorSpace;
    rt.texture.minFilter = THREE.LinearFilter;
    rt.texture.magFilter = THREE.LinearFilter;
    rt.texture.wrapS = THREE.ClampToEdgeWrapping;
    rt.texture.wrapT = THREE.ClampToEdgeWrapping;
    rt.texture.generateMipmaps = false;
    rt.texture.flipY = false;
    return rt;
  }

  /** Create a blit material for copying a cell render target to an atlas */
  private createBlitMaterial(
    cellTexture: THREE.Texture,
  ): MeshBasicNodeMaterial {
    const mat = new MeshBasicNodeMaterial();
    mat.colorNode = THREE.TSL.texture(cellTexture);
    mat.opacityNode = THREE.TSL.texture(cellTexture).a;
    mat.transparent = true;
    mat.depthTest = false;
    mat.depthWrite = false;
    return mat;
  }

  /** Collect all Mesh nodes into a flat array for fast iteration (no traverse per cell) */
  private collectMeshes(root: THREE.Object3D): THREE.Mesh[] {
    const meshes: THREE.Mesh[] = [];
    root.traverse((node: THREE.Object3D) => {
      if (node instanceof THREE.Mesh) {
        meshes.push(node);
      }
    });
    return meshes;
  }

  /** Create an unlit material from an existing material (for albedo pass) */
  private createUnlitFromMaterial(mat: THREE.Material): MeshBasicNodeMaterial {
    const color = this.extractColorFromMaterial(mat, new THREE.Color(0x888888));
    const isStdMat =
      mat instanceof THREE.MeshStandardMaterial ||
      mat instanceof MeshStandardNodeMaterial;
    const hasMap = isStdMat && (mat as THREE.MeshStandardMaterial).map;

    const unlitMat = new MeshBasicNodeMaterial();
    unlitMat.color = new THREE.Color(hasMap ? 0xffffff : color);
    if (hasMap) unlitMat.map = (mat as THREE.MeshStandardMaterial).map;
    unlitMat.side = mat.side ?? THREE.FrontSide;
    unlitMat.transparent = mat.transparent;
    unlitMat.alphaTest = mat.alphaTest;
    unlitMat.opacity = mat.opacity;
    return unlitMat;
  }

  /** Create unlit materials for all meshes (handles material arrays) */
  private createUnlitMaterials(
    meshes: THREE.Mesh[],
  ): (THREE.Material | THREE.Material[])[] {
    return meshes.map((mesh) => {
      const mat = mesh.material;
      if (Array.isArray(mat)) {
        return mat.map((m) => this.createUnlitFromMaterial(m));
      }
      return this.createUnlitFromMaterial(mat);
    });
  }

  /** Dispose a material or material array */
  private disposeMaterials(mats: (THREE.Material | THREE.Material[])[]): void {
    for (const matOrArray of mats) {
      if (Array.isArray(matOrArray)) {
        for (const m of matOrArray) m.dispose();
      } else {
        matOrArray.dispose();
      }
    }
  }

  private computeBoundingBox(source: THREE.Object3D): THREE.Box3 {
    const box = new THREE.Box3();
    const tempBox = new THREE.Box3();
    const tempMatrix = new THREE.Matrix4();
    const combinedMatrix = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempScale = new THREE.Vector3();
    const tempQuat = new THREE.Quaternion();
    const rotQuat = new THREE.Quaternion();
    const rotMatrix = new THREE.Matrix4();
    const scaleMatrix = new THREE.Matrix4();
    const translateMatrix = new THREE.Matrix4();

    source.updateWorldMatrix(true, true);

    source.traverse((node: THREE.Object3D) => {
      const isInstancedMesh =
        (node as THREE.Object3D & { isInstancedMesh?: boolean })
          .isInstancedMesh === true;
      if (isInstancedMesh) {
        const instancedNode = node as THREE.InstancedMesh;
        const geometry = instancedNode.geometry;
        geometry.computeBoundingBox();
        const baseBox = geometry.boundingBox!;
        const orientationAttr = geometry.attributes.instanceOrientation as
          | THREE.BufferAttribute
          | undefined;

        for (let i = 0; i < instancedNode.count; i++) {
          instancedNode.getMatrixAt(i, tempMatrix);
          tempMatrix.decompose(tempPos, tempQuat, tempScale);

          if (orientationAttr) {
            rotQuat.set(
              orientationAttr.getX(i),
              orientationAttr.getY(i),
              orientationAttr.getZ(i),
              orientationAttr.getW(i),
            );
          } else {
            rotQuat.copy(tempQuat);
          }

          rotMatrix.makeRotationFromQuaternion(rotQuat);
          scaleMatrix.makeScale(tempScale.x, tempScale.y, tempScale.z);
          translateMatrix.makeTranslation(tempPos.x, tempPos.y, tempPos.z);

          combinedMatrix
            .copy(instancedNode.matrixWorld)
            .multiply(translateMatrix)
            .multiply(scaleMatrix)
            .multiply(rotMatrix);
          tempBox.copy(baseBox).applyMatrix4(combinedMatrix);
          box.union(tempBox);
        }
      }
      const isMesh =
        (node as THREE.Object3D & { isMesh?: boolean }).isMesh === true;
      const meshNode = node as THREE.Mesh;
      if (!isInstancedMesh && isMesh && meshNode.geometry) {
        meshNode.geometry.computeBoundingBox();
        if (meshNode.geometry.boundingBox) {
          tempBox.copy(meshNode.geometry.boundingBox);
          tempBox.applyMatrix4(meshNode.matrixWorld);
          box.union(tempBox);
        }
      }
    });

    return box;
  }

  /**
   * Extract color from a material (handles single materials)
   */
  private extractColorFromMaterial(
    mat: THREE.Material,
    defaultColor: THREE.Color,
  ): THREE.Color {
    // Check for TSL leaf materials with leafUniforms first
    const matWithLeafUniforms = mat as MeshBasicNodeMaterial & {
      leafUniforms?: { color?: { value?: THREE.Color } };
    };
    if (matWithLeafUniforms.leafUniforms?.color?.value) {
      return matWithLeafUniforms.leafUniforms.color.value.clone();
    }

    // WebGPU node materials
    if (
      mat instanceof MeshBasicNodeMaterial ||
      mat instanceof MeshStandardNodeMaterial
    ) {
      return mat.color.clone();
    }
    // WebGL materials
    if (
      mat instanceof THREE.MeshStandardMaterial ||
      mat instanceof THREE.MeshBasicMaterial
    ) {
      return mat.color.clone();
    }
    // ShaderMaterial with color uniforms
    if (mat instanceof THREE.ShaderMaterial) {
      if (mat.uniforms?.leafColor) {
        return mat.uniforms.leafColor.value;
      }
      if (mat.uniforms?.uColor) {
        return mat.uniforms.uColor.value;
      }
    }
    return defaultColor.clone();
  }

  /**
   * Clone a material for baking, preserving its type for proper rendering.
   */
  private cloneMaterialForBaking(mat: THREE.Material): THREE.Material {
    const matAsNode = mat as MeshBasicNodeMaterial & {
      colorNode?: unknown;
      leafUniforms?: { color?: { value?: THREE.Color } };
      isMeshBasicNodeMaterial?: boolean;
      isMeshStandardNodeMaterial?: boolean;
    };

    const hasColorNode = matAsNode.colorNode !== undefined;
    const isNodeMaterial =
      matAsNode.isMeshBasicNodeMaterial === true ||
      matAsNode.isMeshStandardNodeMaterial === true ||
      mat.type === "MeshBasicNodeMaterial" ||
      mat.type === "MeshStandardNodeMaterial" ||
      hasColorNode;

    // TSL leaf materials with leafUniforms (from procgen package)
    if (isNodeMaterial && matAsNode.leafUniforms?.color?.value) {
      const leafColor = matAsNode.leafUniforms.color.value;
      const newMat = new MeshBasicNodeMaterial();
      newMat.color = leafColor.clone();
      newMat.side = mat.side;
      newMat.transparent = false;
      newMat.opacity = 1.0;
      return newMat;
    }

    // Materials with colorNode (e.g., vertex colors)
    if (hasColorNode) {
      const newMat = new MeshBasicNodeMaterial();
      newMat.color = matAsNode.color?.clone() ?? new THREE.Color(0xffffff);
      newMat.side = mat.side;
      newMat.transparent = mat.transparent;
      newMat.opacity = mat.opacity;
      newMat.alphaTest = mat.alphaTest;
      newMat.colorNode = matAsNode.colorNode;
      return newMat;
    }

    if (mat instanceof MeshBasicNodeMaterial) {
      const newMat = new MeshBasicNodeMaterial();
      newMat.color = mat.color.clone();
      newMat.side = mat.side;
      newMat.transparent = mat.transparent;
      newMat.opacity = mat.opacity;
      newMat.alphaTest = mat.alphaTest;
      newMat.map = mat.map ?? null;
      if (mat.colorNode) newMat.colorNode = mat.colorNode;
      return newMat;
    }

    if (mat instanceof MeshStandardNodeMaterial) {
      const newMat = new MeshStandardNodeMaterial();
      newMat.color = mat.color.clone();
      newMat.side = mat.side;
      newMat.roughness = mat.roughness;
      newMat.metalness = mat.metalness;
      newMat.transparent = mat.transparent;
      newMat.opacity = mat.opacity;
      newMat.alphaTest = mat.alphaTest;
      newMat.map = mat.map ?? null;
      newMat.roughnessMap = mat.roughnessMap ?? null;
      newMat.metalnessMap = mat.metalnessMap ?? null;
      newMat.aoMap = mat.aoMap ?? null;
      newMat.aoMapIntensity = mat.aoMapIntensity;
      return newMat;
    }

    if (mat instanceof THREE.MeshBasicMaterial) {
      const newMat = new MeshBasicNodeMaterial();
      newMat.color = mat.color.clone();
      newMat.side = mat.side;
      newMat.transparent = mat.transparent;
      newMat.opacity = mat.opacity;
      newMat.alphaTest = mat.alphaTest;
      newMat.map = mat.map ?? null;
      return newMat;
    }

    if (mat instanceof THREE.MeshStandardMaterial) {
      const newMat = new MeshStandardNodeMaterial();
      newMat.color = mat.color.clone();
      newMat.side = mat.side;
      newMat.roughness = mat.roughness;
      newMat.metalness = mat.metalness;
      newMat.transparent = mat.transparent;
      newMat.opacity = mat.opacity;
      newMat.alphaTest = mat.alphaTest;
      newMat.map = mat.map ?? null;
      newMat.roughnessMap = mat.roughnessMap ?? null;
      newMat.metalnessMap = mat.metalnessMap ?? null;
      newMat.aoMap = mat.aoMap ?? null;
      newMat.aoMapIntensity = mat.aoMapIntensity;
      return newMat;
    }

    if (mat instanceof THREE.ShaderMaterial) {
      const color = this.extractColorFromMaterial(
        mat,
        new THREE.Color(0x888888),
      );
      const newMat = new MeshStandardNodeMaterial();
      newMat.color = color;
      newMat.side = mat.side;
      newMat.roughness = 0.8;
      return newMat;
    }

    // Default fallback
    const defaultMat = new MeshStandardNodeMaterial();
    defaultMat.color = new THREE.Color(0x888888);
    defaultMat.side = mat.side ?? THREE.FrontSide;
    defaultMat.roughness = 0.8;
    return defaultMat;
  }

  /**
   * Deep clone an object, properly handling InstancedMesh.
   */
  private cloneForRendering(source: THREE.Object3D): THREE.Group {
    const result = new THREE.Group();

    source.updateWorldMatrix(true, true);

    // Pre-allocate temp objects outside traversal loop
    const tempMatrix = new THREE.Matrix4();
    const tempPos = new THREE.Vector3();
    const tempNorm = new THREE.Vector3();
    const normalMatrix = new THREE.Matrix3();
    const instancePos = new THREE.Vector3();
    const instanceScale = new THREE.Vector3();
    const instanceQuat = new THREE.Quaternion();
    const rotQuat = new THREE.Quaternion();
    const rotMatrix = new THREE.Matrix4();
    const scaleMatrix = new THREE.Matrix4();
    const translateMatrix = new THREE.Matrix4();
    const finalMatrix = new THREE.Matrix4();

    source.traverse((node: THREE.Object3D) => {
      const isInstancedMesh =
        (node as THREE.Object3D & { isInstancedMesh?: boolean })
          .isInstancedMesh === true;
      if (isInstancedMesh) {
        const instancedNode = node as THREE.InstancedMesh;
        const baseGeo = instancedNode.geometry;
        const instanceCount = instancedNode.count;

        const posAttr = baseGeo.attributes.position;
        const normAttr = baseGeo.attributes.normal;
        const indexAttr = baseGeo.index;

        if (!posAttr) return;

        const mergedPositions: number[] = [];
        const mergedNormals: number[] = [];
        const mergedIndices: number[] = [];

        const orientationAttr = baseGeo.attributes.instanceOrientation as
          | THREE.BufferAttribute
          | undefined;

        for (let i = 0; i < instanceCount; i++) {
          instancedNode.getMatrixAt(i, tempMatrix);
          tempMatrix.decompose(instancePos, instanceQuat, instanceScale);

          if (orientationAttr) {
            rotQuat.set(
              orientationAttr.getX(i),
              orientationAttr.getY(i),
              orientationAttr.getZ(i),
              orientationAttr.getW(i),
            );
          } else {
            rotQuat.copy(instanceQuat);
          }

          rotMatrix.makeRotationFromQuaternion(rotQuat);
          scaleMatrix.makeScale(
            instanceScale.x,
            instanceScale.y,
            instanceScale.z,
          );
          translateMatrix.makeTranslation(
            instancePos.x,
            instancePos.y,
            instancePos.z,
          );
          finalMatrix
            .copy(instancedNode.matrixWorld)
            .multiply(translateMatrix)
            .multiply(scaleMatrix)
            .multiply(rotMatrix);

          normalMatrix.getNormalMatrix(finalMatrix);

          const vertexOffset = mergedPositions.length / 3;

          for (let v = 0; v < posAttr.count; v++) {
            tempPos.fromBufferAttribute(posAttr, v);
            tempPos.applyMatrix4(finalMatrix);
            mergedPositions.push(tempPos.x, tempPos.y, tempPos.z);

            if (normAttr) {
              tempNorm.fromBufferAttribute(normAttr, v);
              tempNorm.applyMatrix3(normalMatrix).normalize();
              mergedNormals.push(tempNorm.x, tempNorm.y, tempNorm.z);
            }
          }

          if (indexAttr) {
            for (let idx = 0; idx < indexAttr.count; idx++) {
              mergedIndices.push(indexAttr.getX(idx) + vertexOffset);
            }
          }
        }

        const mergedGeo = new THREE.BufferGeometry();
        mergedGeo.setAttribute(
          "position",
          new THREE.Float32BufferAttribute(mergedPositions, 3),
        );
        if (mergedNormals.length > 0) {
          mergedGeo.setAttribute(
            "normal",
            new THREE.Float32BufferAttribute(mergedNormals, 3),
          );
        }
        if (mergedIndices.length > 0) {
          mergedGeo.setIndex(mergedIndices);
        }

        const mat = instancedNode.material;
        const singleMat = Array.isArray(mat) ? mat[0] : mat;
        const color = this.extractColorFromMaterial(
          singleMat,
          new THREE.Color(0x228b22),
        );

        const bakeMaterial = new MeshStandardNodeMaterial();
        bakeMaterial.color = color;
        bakeMaterial.side = THREE.DoubleSide;
        bakeMaterial.roughness = 0.8;

        result.add(new THREE.Mesh(mergedGeo, bakeMaterial));
      }
      const isMesh =
        (node as THREE.Object3D & { isMesh?: boolean }).isMesh === true;
      const meshNode = node as THREE.Mesh;
      if (!isInstancedMesh && isMesh && meshNode.geometry) {
        const clonedGeo = meshNode.geometry.clone();
        meshNode.updateWorldMatrix(true, false);
        clonedGeo.applyMatrix4(meshNode.matrixWorld);

        const mat = meshNode.material;
        const clonedMaterial = Array.isArray(mat)
          ? mat.map((m) => this.cloneMaterialForBaking(m))
          : this.cloneMaterialForBaking(mat);

        result.add(new THREE.Mesh(clonedGeo, clonedMaterial));
      }
    });

    return result;
  }

  /**
   * Create a flattened baking source for debugging/export.
   */
  createBakingSource(source: THREE.Object3D): THREE.Group {
    return this.cloneForRendering(source);
  }

  // ==========================================================================
  // UNIFIED BAKE CORE
  // ==========================================================================

  /**
   * Core multi-pass bake with a factory for creating materials after cloning.
   * This solves the chicken-and-egg problem: materials depend on meshes,
   * which are only available after cloning.
   */
  private async bakeCoreWithFactory(
    source: THREE.Object3D,
    config: ImpostorBakeConfig,
    options: {
      removeSceneLights: boolean;
      cameraNear?: number;
      cameraFar?: number;
      passFactory: (meshes: THREE.Mesh[]) => BakePassDef[];
      cleanup?: () => void;
    },
  ): Promise<ImpostorBakeResult> {
    const {
      atlasWidth,
      atlasHeight,
      gridSizeX,
      octType,
      verticalPacking = 1,
    } = config;

    const effectiveGridSizeY = Math.max(
      1,
      Math.round(gridSizeX * verticalPacking),
    );
    const numCellsX = gridSizeX;
    const numCellsY = effectiveGridSizeY;

    // --- Save renderer state ---
    const originalPixelRatio = this.renderer.getPixelRatio();
    const originalRenderTarget = this.renderer.getRenderTarget();
    const renderer = this.renderer as CompatibleRenderer;
    const originalToneMapping = renderer.toneMapping;
    const originalToneMappingExposure = renderer.toneMappingExposure;
    this.renderer.setPixelRatio(1);
    if (renderer.toneMapping !== undefined)
      renderer.toneMapping = THREE.NoToneMapping;
    if (renderer.toneMappingExposure !== undefined)
      renderer.toneMappingExposure = 1.0;

    // --- Compute bounds ---
    const boundingBox = this.computeBoundingBox(source);
    const boundingSphere = new THREE.Sphere();
    boundingBox.getBoundingSphere(boundingSphere);

    // --- Build octahedron mesh ---
    const octMeshData = buildOctahedronMesh(
      octType,
      gridSizeX,
      numCellsY,
      [0, 0, 0],
      false,
    );
    const viewPoints = octMeshData.octPoints;
    lerpOctahedronGeometry(octMeshData, 1.0);
    octMeshData.filledMesh.geometry.computeBoundingSphere();
    octMeshData.filledMesh.geometry.computeBoundingBox();
    octMeshData.wireframeMesh.geometry.computeBoundingSphere();
    octMeshData.wireframeMesh.geometry.computeBoundingBox();

    // --- Clone and prepare source ---
    const sourceCopy = this.cloneForRendering(source);
    this.renderScene.add(sourceCopy);

    const center = boundingSphere.center.clone();
    sourceCopy.position.set(-center.x, -center.y, -center.z);
    boundingBox.getSize(this._boxSize);
    const maxDimension = Math.max(
      this._boxSize.x,
      this._boxSize.y,
      this._boxSize.z,
    );
    const effectiveRadius = (maxDimension / 2) * 1.15;
    const scaleFactor = 0.5 / effectiveRadius;
    sourceCopy.scale.setScalar(scaleFactor);
    sourceCopy.position.multiplyScalar(scaleFactor);

    // --- Collect meshes + ensure normals ---
    const meshes = this.collectMeshes(sourceCopy);
    for (const m of meshes) {
      m.frustumCulled = false;
      if (!m.geometry.hasAttribute("normal")) {
        m.geometry.computeVertexNormals();
      }
    }

    // --- Create pass definitions using factory (materials depend on meshes) ---
    const passDefs = options.passFactory(meshes);

    // --- Override camera if needed ---
    if (options.cameraNear !== undefined)
      this.renderCamera.near = options.cameraNear;
    if (options.cameraFar !== undefined)
      this.renderCamera.far = options.cameraFar;
    if (options.cameraNear !== undefined || options.cameraFar !== undefined) {
      this.renderCamera.updateProjectionMatrix();
    }

    // --- Create render targets and blit resources per pass ---
    const cellSizeX = Math.floor(atlasWidth / numCellsX);
    const cellSizeY = Math.floor(atlasHeight / numCellsY);
    const cellSize = Math.min(cellSizeX, cellSizeY);
    const blitGeo = new THREE.PlaneGeometry(2, 2);
    const blitCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

    const passData = passDefs.map((def, i) => {
      const atlas = this.createRT(atlasWidth, atlasHeight, def.colorSpace);
      const cell = this.createRT(cellSize, cellSize, def.colorSpace);
      const blitMat = this.createBlitMaterial(cell.texture);
      const blitMesh = new THREE.Mesh(
        i === 0 ? blitGeo : blitGeo.clone(),
        blitMat,
      );
      const blitScene = new THREE.Scene();
      blitScene.add(blitMesh);
      return { ...def, atlas, cell, blitMat, blitMesh, blitScene };
    });

    const webgpuRenderer = this.renderer as THREE.WebGPURenderer;

    // --- Clear all atlas targets ---
    for (const pass of passData) {
      webgpuRenderer.setRenderTarget(pass.atlas);
      webgpuRenderer.setClearColor(pass.clearColor, pass.clearAlpha);
      webgpuRenderer.clear();
    }

    // --- Optionally remove scene lights ---
    if (options.removeSceneLights) {
      this.renderScene.remove(this.ambientLight);
      this.renderScene.remove(this.directionalLight);
    }

    const originalAutoClear = webgpuRenderer.autoClear;
    webgpuRenderer.autoClear = false;

    // --- Cell rendering loop ---
    for (let rowIdx = 0; rowIdx <= numCellsY; rowIdx++) {
      for (let colIdx = 0; colIdx <= numCellsX; colIdx++) {
        const flatIdx = rowIdx * numCellsX + colIdx;
        if (flatIdx * 3 + 2 >= viewPoints.length) continue;

        this._viewDir
          .set(
            viewPoints[flatIdx * 3],
            viewPoints[flatIdx * 3 + 1],
            viewPoints[flatIdx * 3 + 2],
          )
          .normalize();
        this.renderCamera.position.copy(this._viewDir).multiplyScalar(1.1);
        this.renderCamera.lookAt(0, 0, 0);

        const cellW = 2 / numCellsX;
        const cellH = 2 / numCellsY;
        const ndcX = -1 + (colIdx + 0.5) * cellW;
        const ndcY = 1 - (rowIdx + 0.5) * cellH;

        for (const pass of passData) {
          for (let m = 0; m < meshes.length; m++) {
            meshes[m].material = pass.materials[m];
          }

          webgpuRenderer.setRenderTarget(pass.cell);
          webgpuRenderer.setClearColor(pass.clearColor, pass.clearAlpha);
          webgpuRenderer.clear();
          webgpuRenderer.render(this.renderScene, this.renderCamera);

          pass.blitMesh.position.set(ndcX, ndcY, 0);
          pass.blitMesh.scale.set(cellW / 2, cellH / 2, 1);
          webgpuRenderer.setRenderTarget(pass.atlas);
          webgpuRenderer.render(pass.blitScene, blitCam);
        }
      }
    }

    // --- Restore ---
    webgpuRenderer.autoClear = originalAutoClear;
    if (options.removeSceneLights) {
      this.renderScene.add(this.ambientLight);
      this.renderScene.add(this.directionalLight);
    }
    if (originalToneMapping !== undefined)
      renderer.toneMapping = originalToneMapping;
    if (originalToneMappingExposure !== undefined)
      renderer.toneMappingExposure = originalToneMappingExposure;
    this.renderer.setRenderTarget(originalRenderTarget);
    this.renderer.setPixelRatio(originalPixelRatio);

    // --- Cleanup ---
    this.renderScene.remove(sourceCopy);
    for (const m of meshes) m.geometry?.dispose();
    blitGeo.dispose();
    for (const pass of passData) {
      pass.cell.dispose();
      pass.blitMat.dispose();
    }
    // Dispose pass-specific materials
    for (const def of passDefs) {
      this.disposeMaterials(def.materials);
    }
    options.cleanup?.();

    // Ensure GPU operations complete
    this.renderer.setRenderTarget(null);
    if (this.renderer.renderAsync) {
      await this.renderer.renderAsync(new THREE.Scene(), this.renderCamera);
    }

    // --- Build result (handle missing passes gracefully for partial bakes) ---
    const colorPass = passData.find((p) => p.name === "color");
    const normalPass = passData.find((p) => p.name === "normal");
    const depthPass = passData.find((p) => p.name === "depth");
    const pbrPass = passData.find((p) => p.name === "pbr");

    // Use first pass as fallback if no dedicated color pass (e.g., normal-only bake)
    const primaryPass = colorPass ?? passData[0];

    return {
      atlasTexture: primaryPass.atlas.texture,
      renderTarget: primaryPass.atlas as unknown as THREE.RenderTarget,
      normalAtlasTexture: normalPass?.atlas.texture,
      normalRenderTarget: normalPass?.atlas as unknown as
        | THREE.RenderTarget
        | undefined,
      depthAtlasTexture: depthPass?.atlas.texture,
      depthRenderTarget: depthPass?.atlas as unknown as
        | THREE.RenderTarget
        | undefined,
      pbrAtlasTexture: pbrPass?.atlas.texture,
      pbrRenderTarget: pbrPass?.atlas as unknown as
        | THREE.RenderTarget
        | undefined,
      gridSizeX,
      gridSizeY: numCellsY,
      octType,
      boundingSphere,
      boundingBox,
      octMeshData,
      depthNear: options.cameraNear,
      depthFar: options.cameraFar,
    };
  }

  // ==========================================================================
  // PUBLIC BAKE METHODS
  // ==========================================================================

  /**
   * Bake a mesh into an octahedral impostor atlas (color only, lit)
   */
  async bake(
    source: THREE.Object3D,
    config: Partial<ImpostorBakeConfig> = {},
  ): Promise<ImpostorBakeResult> {
    const finalConfig: ImpostorBakeConfig = {
      ...DEFAULT_BAKE_CONFIG,
      ...config,
    };

    return this.bakeCoreWithFactory(source, finalConfig, {
      removeSceneLights: false,
      passFactory: (meshes) => [
        {
          name: "color",
          colorSpace: THREE.SRGBColorSpace,
          clearColor: finalConfig.backgroundColor ?? 0x000000,
          clearAlpha: finalConfig.backgroundAlpha ?? 0,
          // Keep the cloned materials (lit baking with scene lights)
          materials: meshes.map((m) => m.material),
        },
      ],
    });
  }

  /**
   * Bake both color and normal atlases for dynamic lighting.
   */
  async bakeWithNormals(
    source: THREE.Object3D,
    config: Partial<ImpostorBakeConfig> = {},
  ): Promise<ImpostorBakeResult> {
    const finalConfig: ImpostorBakeConfig = {
      ...DEFAULT_BAKE_CONFIG,
      ...config,
    };
    const normalMaterial = new THREE.MeshNormalMaterial({
      side: THREE.DoubleSide,
      flatShading: false,
    });

    return this.bakeCoreWithFactory(source, finalConfig, {
      removeSceneLights: true,
      passFactory: (meshes) => [
        {
          name: "color",
          colorSpace: THREE.SRGBColorSpace,
          clearColor: finalConfig.backgroundColor ?? 0x000000,
          clearAlpha: finalConfig.backgroundAlpha ?? 0,
          materials: this.createUnlitMaterials(meshes),
        },
        {
          name: "normal",
          colorSpace: THREE.LinearSRGBColorSpace,
          clearColor: 0x8080ff,
          clearAlpha: 1,
          materials: meshes.map(() => normalMaterial as THREE.Material),
        },
      ],
      cleanup: () => normalMaterial.dispose(),
    });
  }

  /**
   * Bake with custom lighting setup
   */
  async bakeWithLighting(
    source: THREE.Object3D,
    config: Partial<ImpostorBakeConfig> = {},
    lightingSetup: {
      ambient?: { color: number; intensity: number };
      directional?: {
        color: number;
        intensity: number;
        position: THREE.Vector3;
      };
    } = {},
  ): Promise<ImpostorBakeResult> {
    // Apply custom lighting
    if (lightingSetup.ambient) {
      this.ambientLight.color.setHex(lightingSetup.ambient.color);
      this.ambientLight.intensity = lightingSetup.ambient.intensity;
    }
    if (lightingSetup.directional) {
      this.directionalLight.color.setHex(lightingSetup.directional.color);
      this.directionalLight.intensity = lightingSetup.directional.intensity;
      this.directionalLight.position.copy(lightingSetup.directional.position);
    }

    const result = await this.bake(source, config);

    // Restore default lighting
    this.ambientLight.color.setHex(0xffffff);
    this.ambientLight.intensity = 2.6;
    this.directionalLight.color.setHex(0xffffff);
    this.directionalLight.intensity = 3.8;
    this.directionalLight.position.set(5, 10, 7.5);

    return result;
  }

  /**
   * Hybrid bake: uses standard bake() for colors, separate pass for normals.
   */
  async bakeHybrid(
    source: THREE.Object3D,
    config: Partial<ImpostorBakeConfig> = {},
    options: {
      backgroundColor?: number;
      backgroundAlpha?: number;
      alphaTest?: number;
    } = {},
  ): Promise<
    ImpostorBakeResult & {
      normalAtlasTexture: THREE.Texture;
      normalRenderTarget: THREE.RenderTarget;
    }
  > {
    const { backgroundColor, backgroundAlpha } = options;

    // Step 1: Use regular bake() for color atlas
    const bakeConfig = { ...config, backgroundColor, backgroundAlpha };
    const colorResult = await this.bake(source, bakeConfig);

    // Step 2: Bake normals separately using same grid settings
    const normalMaterial = new THREE.MeshNormalMaterial({
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const normalConfig: ImpostorBakeConfig = {
      ...DEFAULT_BAKE_CONFIG,
      ...config,
      backgroundColor: 0x8080ff,
      backgroundAlpha: 1,
    };

    const normalResult = await this.bakeCoreWithFactory(source, normalConfig, {
      removeSceneLights: true,
      passFactory: (meshes) => [
        {
          name: "normal",
          colorSpace: THREE.LinearSRGBColorSpace,
          clearColor: 0x8080ff,
          clearAlpha: 1,
          materials: meshes.map(() => normalMaterial as THREE.Material),
        },
      ],
      cleanup: () => normalMaterial.dispose(),
    });

    return {
      ...colorResult,
      normalAtlasTexture: normalResult.normalAtlasTexture!,
      normalRenderTarget: normalResult.normalRenderTarget!,
    };
  }

  /**
   * AAA-quality full bake: albedo + normals + depth + optional PBR channels.
   */
  async bakeFull(
    source: THREE.Object3D,
    config: Partial<ImpostorBakeConfig> = {},
  ): Promise<ImpostorBakeResult> {
    const finalConfig: ImpostorBakeConfig = {
      ...DEFAULT_BAKE_CONFIG,
      ...config,
    };
    const nearPlane = finalConfig.depthNear ?? 0.001;
    const farPlane = finalConfig.depthFar ?? 10;

    const normalMaterial = new THREE.MeshNormalMaterial({
      side: THREE.DoubleSide,
      flatShading: false,
    });
    const depthMaterial = createTSLDepthMaterial(nearPlane, farPlane);

    return this.bakeCoreWithFactory(source, finalConfig, {
      removeSceneLights: true,
      cameraNear: nearPlane,
      cameraFar: farPlane,
      passFactory: (meshes) => {
        const passes: BakePassDef[] = [
          {
            name: "color",
            colorSpace: THREE.SRGBColorSpace,
            clearColor: finalConfig.backgroundColor ?? 0x000000,
            clearAlpha: finalConfig.backgroundAlpha ?? 0,
            materials: this.createUnlitMaterials(meshes),
          },
          {
            name: "normal",
            colorSpace: THREE.LinearSRGBColorSpace,
            clearColor: 0x8080ff,
            clearAlpha: 1,
            materials: meshes.map(() => normalMaterial as THREE.Material),
          },
          {
            name: "depth",
            colorSpace: THREE.LinearSRGBColorSpace,
            clearColor: 0xffffff,
            clearAlpha: 0,
            materials: meshes.map(() => depthMaterial as THREE.Material),
          },
        ];

        if (finalConfig.pbrMode === PBRBakeMode.COMPLETE) {
          const pbrMats = meshes.map((mesh) => {
            const originalMat = mesh.material;
            const singleMat = Array.isArray(originalMat)
              ? originalMat[0]
              : originalMat;
            let roughness = 0.8,
              metalness = 0.0,
              aoMapIntensity = 1.0;
            let roughnessMap: THREE.Texture | null = null,
              metalnessMap: THREE.Texture | null = null,
              aoMap: THREE.Texture | null = null;
            if (singleMat instanceof THREE.MeshStandardMaterial) {
              roughness = singleMat.roughness;
              metalness = singleMat.metalness;
              aoMapIntensity = singleMat.aoMapIntensity;
              roughnessMap = singleMat.roughnessMap;
              metalnessMap = singleMat.metalnessMap;
              aoMap = singleMat.aoMap;
            }
            const pbrMaterial = createTSLPBRMaterial(
              roughness,
              metalness,
              aoMapIntensity,
              roughnessMap,
              metalnessMap,
              aoMap,
            );
            pbrMaterial.side = singleMat.side ?? THREE.FrontSide;
            return pbrMaterial as THREE.Material;
          });
          passes.push({
            name: "pbr",
            colorSpace: THREE.LinearSRGBColorSpace,
            clearColor: 0xcc00ff,
            clearAlpha: 0,
            materials: pbrMats,
          });
        }

        return passes;
      },
      cleanup: () => {
        normalMaterial.dispose();
        depthMaterial.dispose();
      },
    });
  }

  // ==========================================================================
  // EXPORT METHODS
  // ==========================================================================

  /**
   * Export atlas as data URL (sync version, WebGL only)
   */
  exportAtlasAsDataURL(
    result: ImpostorBakeResult,
    format: "png" | "jpeg" = "png",
  ): string {
    if (!this.renderer.readRenderTargetPixels) {
      console.warn(
        "[ImpostorBaker] Sync export not supported: use exportAtlasAsDataURLAsync for WebGPU",
      );
      return "";
    }

    const { renderTarget } = result;
    const { width, height } = renderTarget;

    const pixels = new Uint8Array(width * height * 4);
    this.renderer.readRenderTargetPixels(
      renderTarget,
      0,
      0,
      width,
      height,
      pixels,
    );

    return this.pixelsToDataURL(pixels, width, height, format);
  }

  /**
   * Export atlas as data URL (async version, works with both WebGL and WebGPU)
   */
  async exportAtlasAsDataURLAsync(
    result: ImpostorBakeResult,
    format: "png" | "jpeg" = "png",
  ): Promise<string> {
    const { renderTarget } = result;
    const { width, height } = renderTarget;
    let pixels: Uint8Array | null = null;

    if (this.renderer.readRenderTargetPixelsAsync) {
      try {
        const pixelResult = await this.renderer.readRenderTargetPixelsAsync(
          renderTarget,
          0,
          0,
          width,
          height,
        );
        if (pixelResult instanceof Uint8Array) {
          pixels = pixelResult;
        } else if (pixelResult instanceof Float32Array) {
          pixels = new Uint8Array(pixelResult.length);
          for (let i = 0; i < pixelResult.length; i++) {
            pixels[i] = Math.min(
              255,
              Math.max(0, Math.round(pixelResult[i] * 255)),
            );
          }
        }
      } catch (err) {
        console.warn("[ImpostorBaker] Async pixel read failed:", err);
      }
    }

    if (!pixels && this.renderer.readRenderTargetPixels) {
      pixels = new Uint8Array(width * height * 4);
      this.renderer.readRenderTargetPixels(
        renderTarget,
        0,
        0,
        width,
        height,
        pixels,
      );
    }

    if (!pixels) {
      console.warn(
        "[ImpostorBaker] Export not supported: no pixel read method available",
      );
      return "";
    }

    return this.pixelsToDataURL(pixels, width, height, format);
  }

  private pixelsToDataURL(
    pixels: Uint8Array,
    width: number,
    height: number,
    format: "png" | "jpeg",
  ): string {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d")!;
    const imageData = ctx.createImageData(width, height);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const srcIdx = ((height - y - 1) * width + x) * 4;
        const dstIdx = (y * width + x) * 4;
        imageData.data[dstIdx] = pixels[srcIdx];
        imageData.data[dstIdx + 1] = pixels[srcIdx + 1];
        imageData.data[dstIdx + 2] = pixels[srcIdx + 2];
        imageData.data[dstIdx + 3] = pixels[srcIdx + 3];
      }
    }

    ctx.putImageData(imageData, 0, 0);
    return canvas.toDataURL(`image/${format}`);
  }

  async exportAtlasAsBlob(
    result: ImpostorBakeResult,
    format: "png" | "jpeg" = "png",
  ): Promise<Blob> {
    const dataUrl = await this.exportAtlasAsDataURLAsync(result, format);
    if (!dataUrl) {
      throw new Error("Failed to export atlas: pixel reading not supported");
    }
    const response = await fetch(dataUrl);
    return response.blob();
  }

  /**
   * Dispose of baker resources
   */
  dispose(): void {
    this.ambientLight.dispose();
    this.directionalLight.dispose();
  }
}
