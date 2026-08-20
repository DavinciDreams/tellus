export type HomePlanUnits = "m" | "ft";
export type HomePlanWallKind = "exterior" | "interior";
export type HomePlanOpeningKind = "door" | "window" | "arch";

export interface HomePlanPoint {
  x: number;
  z: number;
}

export interface HomePlanPolygon {
  points: HomePlanPoint[];
}

export interface HomePlanStyle {
  wallColor?: number;
  floorColor?: number;
  trimColor?: number;
}

export interface HomePlanWall {
  id: string;
  from: HomePlanPoint;
  to: HomePlanPoint;
  thicknessM: number;
  kind: HomePlanWallKind;
}

export interface HomePlanOpening {
  id: string;
  wallId: string;
  centerM: number;
  widthM: number;
  kind: HomePlanOpeningKind;
  bottomM?: number;
  heightM?: number;
}

export interface HomePlanRoom {
  id: string;
  label: string;
  polygon: HomePlanPolygon;
}

export interface HomePlanLevel {
  index: number;
  elevationM: number;
  floorHeightM: number;
  exterior: HomePlanPolygon;
  rooms: HomePlanRoom[];
  walls: HomePlanWall[];
  openings: HomePlanOpening[];
}

export interface HomePlan {
  schemaVersion: 1;
  id: string;
  label: string;
  units: HomePlanUnits;
  scaleMetersPerPixel?: number;
  levels: HomePlanLevel[];
  style?: HomePlanStyle;
}

export interface HomePlanValidationIssue {
  path: string;
  message: string;
}

const isFiniteNumber = (value: number): boolean => Number.isFinite(value);

export const homePlanWallLength = (wall: HomePlanWall): number =>
  Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z);

export const validateHomePlan = (plan: HomePlan): HomePlanValidationIssue[] => {
  const issues: HomePlanValidationIssue[] = [];
  if (plan.schemaVersion !== 1) {
    issues.push({ path: "schemaVersion", message: "Only HomePlan schemaVersion 1 is supported." });
  }
  if (!plan.id.trim()) issues.push({ path: "id", message: "Plan id is required." });
  if (!plan.label.trim()) issues.push({ path: "label", message: "Plan label is required." });
  if (plan.levels.length === 0) issues.push({ path: "levels", message: "Plan must include at least one level." });

  plan.levels.forEach((level, levelIndex) => {
    const levelPath = `levels.${levelIndex}`;
    if (!Number.isInteger(level.index) || level.index < 0) {
      issues.push({ path: `${levelPath}.index`, message: "Level index must be a non-negative integer." });
    }
    if (!isFiniteNumber(level.elevationM)) {
      issues.push({ path: `${levelPath}.elevationM`, message: "Level elevation must be finite." });
    }
    if (!isFiniteNumber(level.floorHeightM) || level.floorHeightM <= 1.8) {
      issues.push({ path: `${levelPath}.floorHeightM`, message: "Level floor height must be greater than 1.8m." });
    }
    if (level.exterior.points.length < 3) {
      issues.push({ path: `${levelPath}.exterior.points`, message: "Exterior polygon needs at least three points." });
    }

    const wallIds = new Set<string>();
    level.walls.forEach((wall, wallIndex) => {
      const wallPath = `${levelPath}.walls.${wallIndex}`;
      if (!wall.id.trim()) issues.push({ path: `${wallPath}.id`, message: "Wall id is required." });
      if (wallIds.has(wall.id)) issues.push({ path: `${wallPath}.id`, message: `Duplicate wall id "${wall.id}".` });
      wallIds.add(wall.id);
      if (homePlanWallLength(wall) <= 0.05) {
        issues.push({ path: wallPath, message: "Wall must be longer than 5cm." });
      }
      if (!isFiniteNumber(wall.thicknessM) || wall.thicknessM <= 0 || wall.thicknessM > 1.5) {
        issues.push({ path: `${wallPath}.thicknessM`, message: "Wall thickness must be between 0 and 1.5m." });
      }
    });

    level.openings.forEach((opening, openingIndex) => {
      const openingPath = `${levelPath}.openings.${openingIndex}`;
      const wall = level.walls.find((candidate) => candidate.id === opening.wallId);
      if (!wall) {
        issues.push({ path: `${openingPath}.wallId`, message: `Opening references unknown wall "${opening.wallId}".` });
        return;
      }
      const wallLength = homePlanWallLength(wall);
      if (!isFiniteNumber(opening.centerM) || opening.centerM < 0 || opening.centerM > wallLength) {
        issues.push({ path: `${openingPath}.centerM`, message: "Opening center must lie on its wall." });
      }
      if (!isFiniteNumber(opening.widthM) || opening.widthM <= 0.1 || opening.widthM >= wallLength) {
        issues.push({ path: `${openingPath}.widthM`, message: "Opening width must fit within its wall." });
      }
      const bottom = opening.bottomM ?? (opening.kind === "window" ? 1 : 0);
      const height = opening.heightM ?? (opening.kind === "window" ? 1.2 : 2.2);
      if (bottom < 0 || bottom >= level.floorHeightM) {
        issues.push({ path: `${openingPath}.bottomM`, message: "Opening bottom must be inside the level height." });
      }
      if (height <= 0 || bottom + height >= level.floorHeightM) {
        issues.push({ path: `${openingPath}.heightM`, message: "Opening height must fit inside the level height." });
      }
    });
  });

  return issues;
};

export const assertValidHomePlan = (plan: HomePlan): void => {
  const issues = validateHomePlan(plan);
  if (issues.length > 0) {
    throw new Error(`Invalid HomePlan ${plan.id}: ${issues.map((issue) => `${issue.path}: ${issue.message}`).join("; ")}`);
  }
};
