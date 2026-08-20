import React, { useMemo, useRef, useState } from "react";
import { DoorOpen, MoveHorizontal, Plus, Ruler, X } from "lucide-react";
import {
  createCustomHomePlan,
  type CustomHomePlanShape,
  type CustomInteriorWallOrientation,
} from "./custom-plan";
import type { HomePlan, HomePlanOpening, HomePlanPoint, HomePlanWall } from "./plan-schema";

export interface HomePlanDesignerMaterial {
  id: string;
  label: string;
  wall: string;
  trim: string;
  base: string;
}

export interface HomePlanDesignerDraft {
  shape: CustomHomePlanShape;
  widthFt: number;
  depthFt: number;
  wingWidthFt: number;
  wingDepthFt: number;
  floorHeightFt: number;
  wallThicknessIn: number;
  interiorWalls: InteriorWallDraft[];
  frontDoorWallId: string;
  frontDoorCenterFt: number;
  frontDoorWidthFt: number;
  rearWindowWallId: string;
  rearWindowCenterFt: number;
  rearWindowWidthFt: number;
  materialId: string;
}

export interface InteriorWallDraft {
  id: string;
  orientation: CustomInteriorWallOrientation;
  offsetFt: number;
  openingCenterFt: number;
  openingWidthFt: number;
}

export interface HomePlanDesignerProps {
  open: boolean;
  materials: HomePlanDesignerMaterial[];
  initialMaterialId: string;
  onClose: () => void;
  onPlace: (plan: HomePlan, draft: HomePlanDesignerDraft) => void;
}

const FT_TO_M = 0.3048;
const IN_TO_M = 0.0254;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const hexColorNumber = (value: string): number =>
  Number.parseInt(value.replace("#", ""), 16);

const defaultDraft = (materialId: string): HomePlanDesignerDraft => ({
  shape: "rectangle",
  widthFt: 32,
  depthFt: 24,
  wingWidthFt: 14,
  wingDepthFt: 14,
  floorHeightFt: 10,
  wallThicknessIn: 6,
  interiorWalls: [],
  frontDoorWallId: "exterior-1",
  frontDoorCenterFt: 16,
  frontDoorWidthFt: 3.5,
  rearWindowWallId: "exterior-3",
  rearWindowCenterFt: 16,
  rearWindowWidthFt: 5,
  materialId,
});

const buildPlan = (
  draft: HomePlanDesignerDraft,
  material: HomePlanDesignerMaterial,
): HomePlan =>
  createCustomHomePlan({
    id: "custom-home",
    label: "Custom Home",
    shape: draft.shape,
    widthM: draft.widthFt * FT_TO_M,
    depthM: draft.depthFt * FT_TO_M,
    wingWidthM: draft.wingWidthFt * FT_TO_M,
    wingDepthM: draft.wingDepthFt * FT_TO_M,
    floorHeightM: draft.floorHeightFt * FT_TO_M,
    wallThicknessM: draft.wallThicknessIn * IN_TO_M,
    interiorWalls: draft.interiorWalls.map((wall) => ({
      id: wall.id,
      orientation: wall.orientation,
      offsetM: wall.offsetFt * FT_TO_M,
      openingCenterM: wall.openingCenterFt * FT_TO_M,
      openingWidthM: wall.openingWidthFt * FT_TO_M,
    })),
    frontDoorWallId: draft.frontDoorWallId,
    frontDoorCenterM: draft.frontDoorCenterFt * FT_TO_M,
    frontDoorWidthM: draft.frontDoorWidthFt * FT_TO_M,
    rearWindowWallId: draft.rearWindowWallId,
    rearWindowCenterM: draft.rearWindowCenterFt * FT_TO_M,
    rearWindowWidthM: draft.rearWindowWidthFt * FT_TO_M,
    style: {
      wallColor: hexColorNumber(material.wall),
      floorColor: hexColorNumber(material.base),
      trimColor: hexColorNumber(material.trim),
    },
  });

const wallLength = (wall: HomePlanWall): number =>
  Math.hypot(wall.to.x - wall.from.x, wall.to.z - wall.from.z);

const pointAlongWall = (wall: HomePlanWall, distanceM: number): HomePlanPoint => {
  const length = wallLength(wall);
  const t = length > 0 ? clamp(distanceM / length, 0, 1) : 0;
  return {
    x: wall.from.x + (wall.to.x - wall.from.x) * t,
    z: wall.from.z + (wall.to.z - wall.from.z) * t,
  };
};

const wallDirection = (wall: HomePlanWall): { dx: number; dz: number; length: number } => {
  const length = wallLength(wall);
  return {
    dx: length > 0 ? (wall.to.x - wall.from.x) / length : 1,
    dz: length > 0 ? (wall.to.z - wall.from.z) / length : 0,
    length,
  };
};

const projectPointToWall = (
  point: HomePlanPoint,
  wall: HomePlanWall,
): { distanceM: number; distanceToWallM: number } => {
  const { dx, dz, length } = wallDirection(wall);
  const along = clamp((point.x - wall.from.x) * dx + (point.z - wall.from.z) * dz, 0, length);
  const projected = pointAlongWall(wall, along);
  return {
    distanceM: along,
    distanceToWallM: Math.hypot(point.x - projected.x, point.z - projected.z),
  };
};

const nearestWall = (
  point: HomePlanPoint,
  walls: readonly HomePlanWall[],
): { wall: HomePlanWall; distanceM: number } | null => {
  let best: { wall: HomePlanWall; distanceM: number; distanceToWallM: number } | null = null;
  for (const wall of walls) {
    const projected = projectPointToWall(point, wall);
    if (!best || projected.distanceToWallM < best.distanceToWallM) {
      best = { wall, ...projected };
    }
  }
  return best ? { wall: best.wall, distanceM: best.distanceM } : null;
};

const wallLabel = (wall: HomePlanWall): string => {
  if (wall.id === "exterior-1") return "South wall";
  if (wall.id === "exterior-2") return "East wall";
  if (wall.id === "exterior-3") return "North wall";
  if (wall.id === "exterior-4") return "West wall";
  return wall.kind === "interior" ? `Interior ${wall.id.replace(/^wall-/, "")}` : wall.id;
};

type DragTarget =
  | { kind: "exterior-wall"; wallId: string }
  | { kind: "interior-wall"; wallId: string }
  | { kind: "opening"; openingId: "front-door" | "rear-window" };

function NumberField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}): React.ReactElement {
  return (
    <label className="home-designer-field">
      <span>{label}</span>
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(clamp(Number(event.target.value) || min, min, max))}
      />
    </label>
  );
}

export function HomePlanDesigner({
  open,
  materials,
  initialMaterialId,
  onClose,
  onPlace,
}: HomePlanDesignerProps): React.ReactElement | null {
  const [draft, setDraft] = useState<HomePlanDesignerDraft>(() => defaultDraft(initialMaterialId));
  const [dragTarget, setDragTarget] = useState<DragTarget | null>(null);
  const svgRef = useRef<SVGSVGElement | null>(null);
  const patchDraft = (patch: Partial<HomePlanDesignerDraft>) => setDraft((current) => ({ ...current, ...patch }));
  const material = materials.find((item) => item.id === draft.materialId) ?? materials[0];
  const plan = useMemo(() => buildPlan(draft, material), [draft, material]);
  const level = plan.levels[0];
  const xs = level.exterior.points.map((point) => point.x);
  const zs = level.exterior.points.map((point) => point.z);
  const minX = Math.min(...xs) - 1;
  const maxX = Math.max(...xs) + 1;
  const minZ = Math.min(...zs) - 1;
  const maxZ = Math.max(...zs) + 1;
  const viewW = maxX - minX;
  const viewH = maxZ - minZ;
  const toSvg = (point: HomePlanPoint): string => `${point.x - minX},${point.z - minZ}`;
  const exteriorPoints = level.exterior.points.map(toSvg).join(" ");
  const exteriorAreaSqFt = Math.round(
    Math.abs(
      level.exterior.points.reduce((sum, point, index, points) => {
        const next = points[(index + 1) % points.length];
        return sum + point.x * next.z - next.x * point.z;
      }, 0) / 2,
    ) / (FT_TO_M * FT_TO_M),
  );
  const availableWalls = level.walls;
  const exteriorWallIds = new Set(["exterior-1", "exterior-2", "exterior-3", "exterior-4"]);
  const pointerToPlanPoint = (event: React.PointerEvent<SVGElement>): HomePlanPoint | null => {
    const svg = svgRef.current;
    if (!svg) return null;
    const point = svg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    const transformed = point.matrixTransform(svg.getScreenCTM()?.inverse());
    return { x: transformed.x + minX, z: transformed.y + minZ };
  };
  const updateInteriorWall = (id: string, patch: Partial<InteriorWallDraft>) => {
    patchDraft({
      interiorWalls: draft.interiorWalls.map((wall) => (wall.id === id ? { ...wall, ...patch } : wall)),
    });
  };
  const removeInteriorWall = (id: string) => {
    patchDraft({
      interiorWalls: draft.interiorWalls.filter((wall) => wall.id !== id),
    });
  };
  const addInteriorWall = (orientation: CustomInteriorWallOrientation) => {
    const index = draft.interiorWalls.length + 1;
    patchDraft({
      shape: "rectangle",
      interiorWalls: [
        ...draft.interiorWalls,
        {
          id: `wall-${Date.now().toString(36)}-${index}`,
          orientation,
          offsetFt: orientation === "vertical" ? draft.widthFt / 2 : draft.depthFt / 2,
          openingCenterFt: orientation === "vertical" ? draft.depthFt / 2 : draft.widthFt / 2,
          openingWidthFt: 3.5,
        },
      ],
    });
  };
  const updateOpeningFromWall = (
    openingId: "front-door" | "rear-window",
    wallId: string,
    centerFt: number,
  ) => {
    if (openingId === "front-door") {
      patchDraft({ frontDoorWallId: wallId, frontDoorCenterFt: centerFt });
    } else {
      patchDraft({ rearWindowWallId: wallId, rearWindowCenterFt: centerFt });
    }
  };
  const handlePlanPointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (!dragTarget) return;
    const point = pointerToPlanPoint(event);
    if (!point) return;
    event.preventDefault();
    if (dragTarget.kind === "exterior-wall" && draft.shape === "rectangle") {
      if (dragTarget.wallId === "exterior-2" || dragTarget.wallId === "exterior-4") {
        patchDraft({ widthFt: clamp(Math.abs(point.x) * 2 / FT_TO_M, 8, 130) });
      } else if (dragTarget.wallId === "exterior-1" || dragTarget.wallId === "exterior-3") {
        patchDraft({ depthFt: clamp(Math.abs(point.z) * 2 / FT_TO_M, 8, 130) });
      }
      return;
    }
    if (dragTarget.kind === "interior-wall") {
      const wall = draft.interiorWalls.find((item) => item.id === dragTarget.wallId);
      if (!wall) return;
      updateInteriorWall(wall.id, {
        offsetFt:
          wall.orientation === "vertical"
            ? clamp((point.x + draft.widthFt * FT_TO_M / 2) / FT_TO_M, 2, draft.widthFt - 2)
            : clamp((point.z + draft.depthFt * FT_TO_M / 2) / FT_TO_M, 2, draft.depthFt - 2),
      });
      return;
    }
    const snapped = nearestWall(point, availableWalls);
    if (dragTarget.kind === "opening" && snapped) {
      updateOpeningFromWall(dragTarget.openingId, snapped.wall.id, snapped.distanceM / FT_TO_M);
    }
  };
  const startDrag = (event: React.PointerEvent<SVGElement>, target: DragTarget) => {
    event.preventDefault();
    event.stopPropagation();
    setDragTarget(target);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  if (!open) return null;

  return (
    <div className="home-designer-overlay" role="dialog" aria-modal="true" aria-label="Custom home designer">
      <section className="home-designer">
        <header className="home-designer-header">
          <div>
            <div className="home-designer-kicker">Home Designer</div>
            <h2>Custom Home</h2>
          </div>
          <button type="button" className="home-designer-icon" aria-label="Close home designer" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="home-designer-body">
          <div className="home-designer-canvas" aria-label="Top-down floor plan preview">
            <svg
              ref={svgRef}
              viewBox={`0 0 ${viewW} ${viewH}`}
              role="img"
              aria-label="Measured top-down home plan"
              onPointerMove={handlePlanPointerMove}
              onPointerUp={() => setDragTarget(null)}
              onPointerLeave={() => setDragTarget(null)}
            >
              <defs>
                <pattern id="home-grid" width="1.524" height="1.524" patternUnits="userSpaceOnUse">
                  <path d="M 1.524 0 L 0 0 0 1.524" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.025" />
                </pattern>
              </defs>
              <rect width={viewW} height={viewH} fill="url(#home-grid)" />
              <polygon points={exteriorPoints} className="home-plan-floor" />
              {level.rooms.map((room) => {
                const cx = room.polygon.points.reduce((sum, point) => sum + point.x, 0) / room.polygon.points.length;
                const cz = room.polygon.points.reduce((sum, point) => sum + point.z, 0) / room.polygon.points.length;
                return (
                  <text key={room.id} x={cx - minX} y={cz - minZ} className="home-plan-room-label">
                    {room.label}
                  </text>
                );
              })}
              {level.walls.map((wall) => {
                const from = wall.from;
                const to = wall.to;
                const draggable = draft.shape === "rectangle" && (wall.kind === "interior" || exteriorWallIds.has(wall.id));
                return (
                  <line
                    key={wall.id}
                    x1={from.x - minX}
                    y1={from.z - minZ}
                    x2={to.x - minX}
                    y2={to.z - minZ}
                    className={`${wall.kind === "interior" ? "home-plan-wall interior" : "home-plan-wall"} ${draggable ? "draggable" : ""}`}
                    strokeWidth={Math.max(0.08, wall.thicknessM)}
                    onPointerDown={
                      draggable
                        ? (event) =>
                            startDrag(event, {
                              kind: wall.kind === "interior" ? "interior-wall" : "exterior-wall",
                              wallId: wall.id,
                            })
                        : undefined
                    }
                  />
                );
              })}
              {level.openings.map((opening: HomePlanOpening) => {
                const wall = level.walls.find((item) => item.id === opening.wallId);
                if (!wall) return null;
                const center = pointAlongWall(wall, opening.centerM);
                const len = wallLength(wall);
                const dx = len > 0 ? (wall.to.x - wall.from.x) / len : 1;
                const dz = len > 0 ? (wall.to.z - wall.from.z) / len : 0;
                const half = opening.widthM / 2;
                const a = { x: center.x - dx * half, z: center.z - dz * half };
                const b = { x: center.x + dx * half, z: center.z + dz * half };
                const draggableOpening =
                  opening.id === "front-door" || opening.id === "rear-window" ? opening.id : null;
                return (
                  <line
                    key={opening.id}
                    x1={a.x - minX}
                    y1={a.z - minZ}
                    x2={b.x - minX}
                    y2={b.z - minZ}
                    className={`home-plan-opening ${opening.kind} ${draggableOpening ? "draggable" : ""}`}
                    strokeWidth={Math.max(0.18, wall.thicknessM * 1.7)}
                    onPointerDown={
                      draggableOpening
                        ? (event) => startDrag(event, { kind: "opening", openingId: draggableOpening })
                        : undefined
                    }
                  />
                );
              })}
            </svg>
            <div className="home-designer-metrics">
              <span><Ruler size={13} /> {Math.round(draft.widthFt)} ft x {Math.round(draft.depthFt)} ft</span>
              <span>{exteriorAreaSqFt} sq ft</span>
            </div>
          </div>
          <div className="home-designer-controls">
            <section>
              <h3>Footprint</h3>
              <div className="home-designer-segmented">
                <button type="button" aria-pressed={draft.shape === "rectangle"} onClick={() => patchDraft({ shape: "rectangle" })}>
                  Rectangle
                </button>
                <button type="button" aria-pressed={draft.shape === "l-shape"} onClick={() => patchDraft({ shape: "l-shape" })}>
                  L-shape
                </button>
              </div>
              <div className="home-designer-grid">
                <NumberField label="Width ft" value={draft.widthFt} min={8} max={130} onChange={(widthFt) => patchDraft({ widthFt })} />
                <NumberField label="Depth ft" value={draft.depthFt} min={8} max={130} onChange={(depthFt) => patchDraft({ depthFt })} />
                {draft.shape === "l-shape" && (
                  <>
                    <NumberField label="Wing width" value={draft.wingWidthFt} min={6} max={120} onChange={(wingWidthFt) => patchDraft({ wingWidthFt })} />
                    <NumberField label="Wing depth" value={draft.wingDepthFt} min={6} max={120} onChange={(wingDepthFt) => patchDraft({ wingDepthFt })} />
                  </>
                )}
                <NumberField label="Wall in" value={draft.wallThicknessIn} min={3} max={24} onChange={(wallThicknessIn) => patchDraft({ wallThicknessIn })} />
                <NumberField label="Height ft" value={draft.floorHeightFt} min={7} max={22} onChange={(floorHeightFt) => patchDraft({ floorHeightFt })} />
              </div>
            </section>
            <section>
              <h3><DoorOpen size={14} /> Openings</h3>
              <div className="home-designer-grid">
                <label className="home-designer-field">
                  <span>Door wall</span>
                  <select
                    value={draft.frontDoorWallId}
                    onChange={(event) => patchDraft({ frontDoorWallId: event.target.value })}
                  >
                    {availableWalls.map((wall) => (
                      <option key={wall.id} value={wall.id}>{wallLabel(wall)}</option>
                    ))}
                  </select>
                </label>
                <NumberField label="Door from left" value={draft.frontDoorCenterFt} min={2} max={draft.widthFt - 2} step={0.5} onChange={(frontDoorCenterFt) => patchDraft({ frontDoorCenterFt })} />
                <NumberField label="Door width" value={draft.frontDoorWidthFt} min={2.5} max={10} step={0.5} onChange={(frontDoorWidthFt) => patchDraft({ frontDoorWidthFt })} />
                <label className="home-designer-field">
                  <span>Window wall</span>
                  <select
                    value={draft.rearWindowWallId}
                    onChange={(event) => patchDraft({ rearWindowWallId: event.target.value })}
                  >
                    {availableWalls.map((wall) => (
                      <option key={wall.id} value={wall.id}>{wallLabel(wall)}</option>
                    ))}
                  </select>
                </label>
                <NumberField label="Window from left" value={draft.rearWindowCenterFt} min={2} max={draft.widthFt - 2} step={0.5} onChange={(rearWindowCenterFt) => patchDraft({ rearWindowCenterFt })} />
                <NumberField label="Window width" value={draft.rearWindowWidthFt} min={2} max={14} step={0.5} onChange={(rearWindowWidthFt) => patchDraft({ rearWindowWidthFt })} />
              </div>
            </section>
            <section>
              <h3><MoveHorizontal size={14} /> Rooms</h3>
              <div className="home-designer-action-row">
                <button type="button" disabled={draft.shape !== "rectangle"} onClick={() => addInteriorWall("vertical")}>
                  <Plus size={13} />
                  <span>Vertical wall</span>
                </button>
                <button type="button" disabled={draft.shape !== "rectangle"} onClick={() => addInteriorWall("horizontal")}>
                  <Plus size={13} />
                  <span>Horizontal wall</span>
                </button>
              </div>
              {draft.interiorWalls.map((wall, index) => (
                <div key={wall.id} className="home-designer-wall-row">
                  <label className="home-designer-field">
                    <span>Wall {index + 1}</span>
                    <select
                      value={wall.orientation}
                      onChange={(event) =>
                        updateInteriorWall(wall.id, {
                          orientation: event.target.value as CustomInteriorWallOrientation,
                          offsetFt:
                            event.target.value === "vertical"
                              ? clamp(wall.offsetFt, 2, draft.widthFt - 2)
                              : clamp(wall.offsetFt, 2, draft.depthFt - 2),
                        })
                      }
                    >
                      <option value="vertical">Vertical</option>
                      <option value="horizontal">Horizontal</option>
                    </select>
                  </label>
                  <NumberField
                    label="Offset ft"
                    value={wall.offsetFt}
                    min={2}
                    max={wall.orientation === "vertical" ? draft.widthFt - 2 : draft.depthFt - 2}
                    step={0.5}
                    onChange={(offsetFt) => updateInteriorWall(wall.id, { offsetFt })}
                  />
                  <NumberField
                    label="Opening ft"
                    value={wall.openingWidthFt}
                    min={2.5}
                    max={10}
                    step={0.5}
                    onChange={(openingWidthFt) => updateInteriorWall(wall.id, { openingWidthFt })}
                  />
                  <button type="button" aria-label={`Remove wall ${index + 1}`} onClick={() => removeInteriorWall(wall.id)}>
                    <X size={14} />
                  </button>
                </div>
              ))}
            </section>
            <section>
              <h3>Wall Material</h3>
              <div className="home-designer-materials">
                {materials.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={draft.materialId === item.id}
                    onClick={() => patchDraft({ materialId: item.id })}
                    style={{ "--home-wall": item.wall, "--home-trim": item.trim, "--home-base": item.base } as React.CSSProperties}
                  >
                    <span aria-hidden="true" />
                    <strong>{item.label}</strong>
                  </button>
                ))}
              </div>
            </section>
          </div>
        </div>
        <footer className="home-designer-footer">
          <button type="button" onClick={onClose}>Cancel</button>
          <button type="button" className="primary" onClick={() => onPlace(plan, draft)}>
            <Plus size={15} />
            <span>Place Home</span>
          </button>
        </footer>
      </section>
    </div>
  );
}
