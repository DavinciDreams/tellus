import * as THREE from "three";
import {
  assertValidHomePlan,
  homePlanWallLength,
  type HomePlan,
  type HomePlanLevel,
  type HomePlanOpening,
  type HomePlanPoint,
  type HomePlanWall,
} from "./plan-schema";

export interface HomePlanBuildOptions {
  includeOpenings?: boolean;
}

export interface HomePlanBuildStats {
  levels: number;
  walls: number;
  openings: number;
  colliders: number;
}

const FLOOR_SLAB_THICKNESS_M = 0.22;
const MIN_WALL_SEGMENT_M = 0.08;

const defaultOpeningBottom = (opening: HomePlanOpening): number =>
  opening.bottomM ?? (opening.kind === "window" ? 1.05 : 0);

const defaultOpeningHeight = (opening: HomePlanOpening): number =>
  opening.heightM ?? (opening.kind === "window" ? 1.15 : opening.kind === "arch" ? 2.35 : 2.15);

const makeMaterial = (color: number, roughness = 0.78): THREE.MeshStandardMaterial =>
  new THREE.MeshStandardMaterial({ color, roughness });

const markCollidable = (mesh: THREE.Mesh): THREE.Mesh => {
  mesh.userData.collide = true;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
};

const wallDirection = (wall: HomePlanWall): { length: number; angle: number; dx: number; dz: number } => {
  const dx = wall.to.x - wall.from.x;
  const dz = wall.to.z - wall.from.z;
  const length = Math.hypot(dx, dz);
  return { length, angle: Math.atan2(dz, dx), dx: dx / length, dz: dz / length };
};

const pointAlongWall = (wall: HomePlanWall, distanceM: number): HomePlanPoint => {
  const { dx, dz } = wallDirection(wall);
  return {
    x: wall.from.x + dx * distanceM,
    z: wall.from.z + dz * distanceM,
  };
};

const addWallBox = (
  group: THREE.Group,
  wall: HomePlanWall,
  startM: number,
  endM: number,
  bottomY: number,
  heightM: number,
  material: THREE.Material,
): THREE.Mesh | null => {
  const length = endM - startM;
  if (length < MIN_WALL_SEGMENT_M || heightM < MIN_WALL_SEGMENT_M) return null;
  const center = pointAlongWall(wall, startM + length / 2);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(length, heightM, wall.thicknessM), material);
  mesh.position.set(center.x, bottomY + heightM / 2, center.z);
  mesh.rotation.y = -wallDirection(wall).angle;
  mesh.name = `home-plan-wall-${wall.id}`;
  mesh.userData.homePlan = { wallId: wall.id, kind: wall.kind };
  group.add(markCollidable(mesh));
  return mesh;
};

const wallOpeningIntervals = (wall: HomePlanWall, openings: readonly HomePlanOpening[]): Array<[number, number, HomePlanOpening]> => {
  const length = homePlanWallLength(wall);
  return openings
    .map((opening): [number, number, HomePlanOpening] => [
      Math.max(0, opening.centerM - opening.widthM / 2),
      Math.min(length, opening.centerM + opening.widthM / 2),
      opening,
    ])
    .filter(([start, end]) => end - start >= MIN_WALL_SEGMENT_M)
    .sort((a, b) => a[0] - b[0]);
};

const addWallWithOpenings = (
  group: THREE.Group,
  level: HomePlanLevel,
  wall: HomePlanWall,
  material: THREE.Material,
  trimMaterial: THREE.Material,
  includeOpenings: boolean,
): number => {
  const length = homePlanWallLength(wall);
  const wallBottom = level.elevationM;
  const wallHeight = level.floorHeightM;
  const openings = includeOpenings
    ? wallOpeningIntervals(wall, level.openings.filter((opening) => opening.wallId === wall.id))
    : [];
  let colliders = 0;
  let cursor = 0;

  for (const [start, end, opening] of openings) {
    if (addWallBox(group, wall, cursor, start, wallBottom, wallHeight, material)) colliders++;
    const bottom = defaultOpeningBottom(opening);
    const height = defaultOpeningHeight(opening);
    if (bottom > MIN_WALL_SEGMENT_M && addWallBox(group, wall, start, end, wallBottom, bottom, material)) colliders++;
    const topStart = bottom + height;
    const topHeight = wallHeight - topStart;
    if (topHeight > MIN_WALL_SEGMENT_M && addWallBox(group, wall, start, end, wallBottom + topStart, topHeight, material)) {
      colliders++;
    }

    const trimHeight = opening.kind === "window" ? 0.08 : 0.1;
    const trimY = wallBottom + Math.min(wallHeight - trimHeight / 2, topStart + trimHeight / 2);
    if (end - start > MIN_WALL_SEGMENT_M) {
      const trim = addWallBox(group, wall, start, end, trimY - trimHeight / 2, trimHeight, trimMaterial);
      if (trim) {
        trim.name = `home-plan-opening-trim-${opening.id}`;
        trim.userData.homePlan = { wallId: wall.id, openingId: opening.id, kind: opening.kind };
        trim.userData.collide = false;
      }
    }
    cursor = end;
  }

  if (addWallBox(group, wall, cursor, length, wallBottom, wallHeight, material)) colliders++;
  return colliders;
};

const buildFloorSlab = (
  level: HomePlanLevel,
  material: THREE.Material,
): THREE.Mesh => {
  const shape = new THREE.Shape();
  const [first, ...rest] = level.exterior.points;
  shape.moveTo(first.x, first.z);
  for (const point of rest) shape.lineTo(point.x, point.z);
  shape.closePath();
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: FLOOR_SLAB_THICKNESS_M,
    bevelEnabled: false,
  });
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, level.elevationM, 0);
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = `home-plan-floor-level-${level.index}`;
  mesh.userData.homePlan = { levelIndex: level.index, kind: "floor" };
  return markCollidable(mesh);
};

export const buildHomePlanModel = (
  plan: HomePlan,
  options: HomePlanBuildOptions = {},
): THREE.Group => {
  assertValidHomePlan(plan);
  const includeOpenings = options.includeOpenings ?? true;
  const wallMaterial = makeMaterial(plan.style?.wallColor ?? 0xd5c5a6, 0.82);
  const floorMaterial = makeMaterial(plan.style?.floorColor ?? 0x8b6742, 0.88);
  const trimMaterial = makeMaterial(plan.style?.trimColor ?? 0x3f3026, 0.72);
  const group = new THREE.Group();
  group.name = `tellus-home-plan-${plan.id}`;
  let colliders = 0;
  let wallCount = 0;
  let openingCount = 0;

  for (const level of plan.levels) {
    group.add(buildFloorSlab(level, floorMaterial));
    colliders++;
    for (const wall of level.walls) {
      wallCount++;
      colliders += addWallWithOpenings(group, level, wall, wallMaterial, trimMaterial, includeOpenings);
    }
    openingCount += level.openings.length;
  }

  const stats: HomePlanBuildStats = {
    levels: plan.levels.length,
    walls: wallCount,
    openings: openingCount,
    colliders,
  };
  group.userData.homePlan = { id: plan.id, label: plan.label, stats };
  return group;
};
