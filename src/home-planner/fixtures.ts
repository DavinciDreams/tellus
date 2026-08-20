import type { HomePlan, HomePlanPoint, HomePlanWall } from "./plan-schema";

const wall = (
  id: string,
  from: HomePlanPoint,
  to: HomePlanPoint,
  kind: HomePlanWall["kind"] = "exterior",
  thicknessM = 0.24,
): HomePlanWall => ({ id, from, to, kind, thicknessM });

export const rectangularHomePlanFixture: HomePlan = {
  schemaVersion: 1,
  id: "fixture-rectangular-cabin",
  label: "Rectangular Cabin",
  units: "m",
  style: {
    wallColor: 0xd8c7a4,
    floorColor: 0x8b6842,
    trimColor: 0x4b3223,
  },
  levels: [
    {
      index: 0,
      elevationM: 0,
      floorHeightM: 3.1,
      exterior: {
        points: [
          { x: -4, z: -3 },
          { x: 4, z: -3 },
          { x: 4, z: 3 },
          { x: -4, z: 3 },
        ],
      },
      rooms: [
        {
          id: "great-room",
          label: "Great Room",
          polygon: {
            points: [
              { x: -4, z: -3 },
              { x: 4, z: -3 },
              { x: 4, z: 3 },
              { x: -4, z: 3 },
            ],
          },
        },
      ],
      walls: [
        wall("south", { x: -4, z: -3 }, { x: 4, z: -3 }),
        wall("east", { x: 4, z: -3 }, { x: 4, z: 3 }),
        wall("north", { x: 4, z: 3 }, { x: -4, z: 3 }),
        wall("west", { x: -4, z: 3 }, { x: -4, z: -3 }),
      ],
      openings: [
        { id: "front-door", wallId: "south", centerM: 4, widthM: 1.2, kind: "door" },
        { id: "north-window", wallId: "north", centerM: 4, widthM: 1.6, kind: "window" },
      ],
    },
  ],
};

export const lShapedHomePlanFixture: HomePlan = {
  schemaVersion: 1,
  id: "fixture-l-shaped-house",
  label: "L-Shaped House",
  units: "m",
  style: {
    wallColor: 0xc9d0c1,
    floorColor: 0x806447,
    trimColor: 0x3d4b36,
  },
  levels: [
    {
      index: 0,
      elevationM: 0,
      floorHeightM: 3.2,
      exterior: {
        points: [
          { x: -5, z: -4 },
          { x: 3, z: -4 },
          { x: 3, z: -1 },
          { x: 6, z: -1 },
          { x: 6, z: 4 },
          { x: -5, z: 4 },
        ],
      },
      rooms: [
        {
          id: "living-room",
          label: "Living Room",
          polygon: {
            points: [
              { x: -5, z: -4 },
              { x: 3, z: -4 },
              { x: 3, z: 4 },
              { x: -5, z: 4 },
            ],
          },
        },
        {
          id: "sunroom",
          label: "Sunroom",
          polygon: {
            points: [
              { x: 3, z: -1 },
              { x: 6, z: -1 },
              { x: 6, z: 4 },
              { x: 3, z: 4 },
            ],
          },
        },
      ],
      walls: [
        wall("south-main", { x: -5, z: -4 }, { x: 3, z: -4 }),
        wall("east-notch", { x: 3, z: -4 }, { x: 3, z: -1 }),
        wall("south-wing", { x: 3, z: -1 }, { x: 6, z: -1 }),
        wall("east-wing", { x: 6, z: -1 }, { x: 6, z: 4 }),
        wall("north", { x: 6, z: 4 }, { x: -5, z: 4 }),
        wall("west", { x: -5, z: 4 }, { x: -5, z: -4 }),
        wall("partition", { x: 3, z: -1 }, { x: 3, z: 4 }, "interior", 0.18),
      ],
      openings: [
        { id: "front-door", wallId: "south-main", centerM: 4, widthM: 1.1, kind: "door" },
        { id: "sunroom-door", wallId: "partition", centerM: 1.25, widthM: 1, kind: "arch", heightM: 2.4 },
        { id: "bay-window", wallId: "east-wing", centerM: 2.5, widthM: 1.8, kind: "window" },
      ],
    },
  ],
};

export const HOME_PLAN_FIXTURES = [rectangularHomePlanFixture, lShapedHomePlanFixture] as const;

export const HOME_PLAN_FIXTURE_CATALOG = [
  {
    id: "rectangular-cabin",
    label: "Rectangular Cabin",
    plan: rectangularHomePlanFixture,
  },
  {
    id: "l-shaped-house",
    label: "L-Shaped House",
    plan: lShapedHomePlanFixture,
  },
] as const;

export type HomePlanFixtureId = (typeof HOME_PLAN_FIXTURE_CATALOG)[number]["id"];

export const homePlanFixtureById = (id: string): HomePlan | undefined =>
  HOME_PLAN_FIXTURE_CATALOG.find((fixture) => fixture.id === id)?.plan;
