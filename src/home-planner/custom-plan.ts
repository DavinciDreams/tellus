import type { HomePlan, HomePlanOpening, HomePlanPoint, HomePlanWall } from "./plan-schema";

export type CustomHomePlanShape = "rectangle" | "l-shape";
export type CustomInteriorWallOrientation = "vertical" | "horizontal";

export interface CustomInteriorWallInput {
  id: string;
  orientation: CustomInteriorWallOrientation;
  offsetM: number;
  openingCenterM?: number;
  openingWidthM?: number;
}

export interface CustomHomePlanInput {
  id: string;
  label: string;
  shape: CustomHomePlanShape;
  widthM: number;
  depthM: number;
  wingWidthM?: number;
  wingDepthM?: number;
  floorHeightM: number;
  wallThicknessM: number;
  partitionEnabled?: boolean;
  partitionOffsetM?: number;
  interiorWalls?: CustomInteriorWallInput[];
  frontDoorWallId?: string;
  frontDoorCenterM?: number;
  frontDoorWidthM?: number;
  rearWindowWallId?: string;
  rearWindowCenterM?: number;
  rearWindowWidthM?: number;
  style?: HomePlan["style"];
}

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const wall = (
  id: string,
  from: HomePlanPoint,
  to: HomePlanPoint,
  kind: HomePlanWall["kind"] = "exterior",
  thicknessM: number,
): HomePlanWall => ({ id, from, to, kind, thicknessM });

const rectanglePoints = (widthM: number, depthM: number): HomePlanPoint[] => {
  const halfW = widthM / 2;
  const halfD = depthM / 2;
  return [
    { x: -halfW, z: -halfD },
    { x: halfW, z: -halfD },
    { x: halfW, z: halfD },
    { x: -halfW, z: halfD },
  ];
};

const lShapePoints = (
  widthM: number,
  depthM: number,
  wingWidthM: number,
  wingDepthM: number,
): HomePlanPoint[] => {
  const halfW = widthM / 2;
  const halfD = depthM / 2;
  const wingW = clamp(wingWidthM, 1.8, widthM - 1.2);
  const wingD = clamp(wingDepthM, 1.8, depthM - 1.2);
  const notchX = halfW - wingW;
  const notchZ = -halfD + wingD;
  return [
    { x: -halfW, z: -halfD },
    { x: halfW, z: -halfD },
    { x: halfW, z: halfD },
    { x: notchX, z: halfD },
    { x: notchX, z: notchZ },
    { x: -halfW, z: notchZ },
  ];
};

const wallsFromPoints = (
  points: readonly HomePlanPoint[],
  thicknessM: number,
): HomePlanWall[] =>
  points.map((point, index) =>
    wall(`exterior-${index + 1}`, point, points[(index + 1) % points.length], "exterior", thicknessM),
  );

const openingOnWall = (
  id: string,
  wallId: string,
  centerM: number | undefined,
  widthM: number | undefined,
  kind: HomePlanOpening["kind"],
  walls: readonly HomePlanWall[],
  fallbackCenterM: number,
): HomePlanOpening => {
  const host = walls.find((candidate) => candidate.id === wallId) ?? walls[0];
  const length = homeWallLength(host);
  return {
    id,
    wallId: host.id,
    centerM: clamp(centerM ?? fallbackCenterM, 0.6, Math.max(0.65, length - 0.6)),
    widthM: clamp(widthM ?? length * (kind === "door" ? 0.12 : 0.16), 0.7, Math.max(0.8, length - 0.4)),
    kind,
  };
};

const homeWallLength = (candidate: HomePlanWall): number =>
  Math.hypot(candidate.to.x - candidate.from.x, candidate.to.z - candidate.from.z);

const rectangleRooms = (
  widthM: number,
  depthM: number,
  interiorWalls: readonly CustomInteriorWallInput[],
): HomePlan["levels"][number]["rooms"] => {
  const verticals = interiorWalls.filter((item) => item.orientation === "vertical").sort((a, b) => a.offsetM - b.offsetM);
  const horizontals = interiorWalls.filter((item) => item.orientation === "horizontal").sort((a, b) => a.offsetM - b.offsetM);
  if (verticals.length > 0 && horizontals.length > 0) {
    return [{ id: "main-room", label: "Rooms", polygon: { points: rectanglePoints(widthM, depthM) } }];
  }
  const halfW = widthM / 2;
  const halfD = depthM / 2;
  if (verticals.length > 0) {
    const cuts = [-halfW, ...verticals.map((item) => -halfW + clamp(item.offsetM, 1.2, widthM - 1.2)), halfW];
    return cuts.slice(0, -1).map((left, index) => ({
      id: `room-${index + 1}`,
      label: `Room ${index + 1}`,
      polygon: {
        points: [
          { x: left, z: -halfD },
          { x: cuts[index + 1], z: -halfD },
          { x: cuts[index + 1], z: halfD },
          { x: left, z: halfD },
        ],
      },
    }));
  }
  if (horizontals.length > 0) {
    const cuts = [-halfD, ...horizontals.map((item) => -halfD + clamp(item.offsetM, 1.2, depthM - 1.2)), halfD];
    return cuts.slice(0, -1).map((near, index) => ({
      id: `room-${index + 1}`,
      label: `Room ${index + 1}`,
      polygon: {
        points: [
          { x: -halfW, z: near },
          { x: halfW, z: near },
          { x: halfW, z: cuts[index + 1] },
          { x: -halfW, z: cuts[index + 1] },
        ],
      },
    }));
  }
  return [{ id: "main-room", label: "Main Room", polygon: { points: rectanglePoints(widthM, depthM) } }];
};

export const createCustomHomePlan = (input: CustomHomePlanInput): HomePlan => {
  const widthM = clamp(input.widthM, 2.4, 40);
  const depthM = clamp(input.depthM, 2.4, 40);
  const floorHeightM = clamp(input.floorHeightM, 2, 7);
  const wallThicknessM = clamp(input.wallThicknessM, 0.08, 1.2);
  const exteriorPoints =
    input.shape === "l-shape"
      ? lShapePoints(widthM, depthM, input.wingWidthM ?? widthM * 0.42, input.wingDepthM ?? depthM * 0.55)
      : rectanglePoints(widthM, depthM);
  const walls = wallsFromPoints(exteriorPoints, wallThicknessM);
  const interiorWallInputs = [...(input.interiorWalls ?? [])];
  if (input.partitionEnabled && input.shape === "rectangle") {
    interiorWallInputs.unshift({
      id: "partition-1",
      orientation: "vertical",
      offsetM: input.partitionOffsetM ?? widthM / 2,
    });
  }
  if (input.shape === "rectangle") {
    const halfW = widthM / 2;
    const halfD = depthM / 2;
    for (const item of interiorWallInputs) {
      if (item.orientation === "vertical") {
        const x = -halfW + clamp(item.offsetM, 1.2, widthM - 1.2);
        walls.push(wall(item.id, { x, z: -halfD }, { x, z: halfD }, "interior", Math.min(wallThicknessM, 0.18)));
      } else {
        const z = -halfD + clamp(item.offsetM, 1.2, depthM - 1.2);
        walls.push(wall(item.id, { x: -halfW, z }, { x: halfW, z }, "interior", Math.min(wallThicknessM, 0.18)));
      }
    }
  }
  const openings: HomePlanOpening[] = [
    openingOnWall(
      "front-door",
      input.frontDoorWallId ?? "exterior-1",
      input.frontDoorCenterM,
      input.frontDoorWidthM,
      "door",
      walls,
      widthM / 2,
    ),
    openingOnWall(
      "rear-window",
      input.rearWindowWallId ?? "exterior-3",
      input.rearWindowCenterM,
      input.rearWindowWidthM,
      "window",
      walls,
      input.shape === "l-shape" ? clamp((input.wingWidthM ?? widthM * 0.42) / 2, 0.8, widthM) : widthM / 2,
    ),
  ];

  if (input.shape === "rectangle") {
    for (const item of interiorWallInputs) {
      openings.push({
        id: `${item.id}-arch`,
        wallId: item.id,
        centerM: clamp(item.openingCenterM ?? (item.orientation === "vertical" ? depthM / 2 : widthM / 2), 0.6, item.orientation === "vertical" ? depthM - 0.6 : widthM - 0.6),
        widthM: clamp(item.openingWidthM ?? 1.05, 0.75, item.orientation === "vertical" ? depthM - 0.4 : widthM - 0.4),
        kind: "arch" as const,
        heightM: Math.min(2.4, floorHeightM - 0.2),
      });
    }
  }

  return {
    schemaVersion: 1,
    id: input.id,
    label: input.label,
    units: "m",
    style: input.style,
    levels: [
      {
        index: 0,
        elevationM: 0,
        floorHeightM,
        exterior: { points: exteriorPoints },
        rooms: input.shape === "rectangle" ? rectangleRooms(widthM, depthM, interiorWallInputs) : [
          {
            id: "main-room",
            label: "Main Room",
            polygon: { points: exteriorPoints },
          },
        ],
        walls,
        openings,
      },
    ],
  };
};
