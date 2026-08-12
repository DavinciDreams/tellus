import * as THREE from "three";
import {
  buildProcPlantInstancePrototype,
  buildProcPlantTemplate,
  defaultPlantEnvironment,
  type ProcPlantEnvironment,
  type ProcPlantGenome,
  type ProcPlantSupportedInstanceKind,
  type ProcPlantTemplate,
} from "procplants/core";

/**
 * Tellus consumes the immutable renderer-independent Procplants compiler here.
 * Chunking, LOD selection, wind, shadows, material policy, asset substitution,
 * and biome mappings remain owned by the Tellus vegetation renderer.
 */
export * from "procplants/core";

/** Convert a package template into the Three.js geometry consumed by Tellus. */
export const procPlantTemplateToGeometry = (template: ProcPlantTemplate): THREE.BufferGeometry => {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(template.pos, 3));
  geometry.setAttribute("normal", new THREE.BufferAttribute(template.nrm, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(template.uv0, 2));
  geometry.setAttribute("color", new THREE.BufferAttribute(template.col, 3));
  geometry.setIndex(new THREE.BufferAttribute(template.idx, 1));
  geometry.computeBoundingSphere();
  return geometry;
};

/** Public package-boundary prototype dispatch for every contract-v3 kind. */
export const createProcPlantInstanceGeometry = (
  kind: ProcPlantSupportedInstanceKind,
  genome: ProcPlantGenome,
): THREE.BufferGeometry => procPlantTemplateToGeometry(buildProcPlantInstancePrototype(kind, genome));

/**
 * Convert the authored crown-spread trait into Tellus's live branch-module
 * renderer multiplier. This remains render policy rather than generator data.
 */
export const branchModuleSpreadForGenome = (genome: ProcPlantGenome): number | undefined => {
  if (genome.branchModules?.spread !== undefined) return genome.branchModules.spread;
  if (genome.habit !== "tree" || genome.treeRealism?.crownSpread === undefined) return undefined;
  return THREE.MathUtils.lerp(
    0.78,
    1.48,
    THREE.MathUtils.clamp(genome.treeRealism.crownSpread, 0, 1),
  );
};

/** Three.js preview/placeable wrapper; generation itself comes from procplants/core. */
export const buildProcPlantObject = (
  genome: ProcPlantGenome,
  seed = 1,
  env: ProcPlantEnvironment = defaultPlantEnvironment(),
): THREE.Group => {
  const { template } = buildProcPlantTemplate(genome, seed, env);
  const geometry = procPlantTemplateToGeometry(template);
  const material = new THREE.MeshLambertMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  const group = new THREE.Group();
  group.name = `procplant-${genome.id}`;
  group.userData.procPlant = { genomeId: genome.id, seed };
  group.add(mesh);
  return group;
};
