export type VegetationViewContext = {
  playerX: number;
  playerZ: number;
  forwardX: number;
  forwardZ: number;
};

const clamp01 = (value: number): number => Math.max(0, Math.min(1, value));

const smoothstep = (minimum: number, maximum: number, value: number): number => {
  const t = clamp01((value - minimum) / Math.max(1e-6, maximum - minimum));
  return t * t * (3 - 2 * t);
};

/**
 * One bounded priority signal for vegetation streaming. The near-player bubble protects sudden turns;
 * outside it, the camera cone receives the detail budget instead of an entire square LOD ring.
 */
export function vegetationViewImportance(
  pointX: number,
  pointZ: number,
  context: VegetationViewContext,
): number {
  const dx = pointX - context.playerX;
  const dz = pointZ - context.playerZ;
  const distance = Math.hypot(dx, dz);
  const nearBubble = (1 - smoothstep(18, 30, distance)) * 0.9;
  const forwardLength = Math.hypot(context.forwardX, context.forwardZ);
  if (distance < 1e-4) return 1;
  if (forwardLength < 1e-4) return nearBubble;
  const alignment = (dx * context.forwardX + dz * context.forwardZ) /
    (distance * forwardLength);
  const coneWeight = smoothstep(
    Math.cos(80 * Math.PI / 180),
    Math.cos(25 * Math.PI / 180),
    alignment,
  );
  const distanceWeight = 1 - smoothstep(48, 112, distance);
  return clamp01(Math.max(nearBubble, coneWeight * distanceWeight));
}

export function vegetationChunkPriority(
  cx: number,
  cz: number,
  chunkSize: number,
  centerCx: number,
  centerCz: number,
  context: VegetationViewContext,
  moveDirectionX = 0,
  moveDirectionZ = 0,
): number {
  const relativeX = cx - centerCx;
  const relativeZ = cz - centerCz;
  const ring = Math.max(Math.abs(relativeX), Math.abs(relativeZ));
  const importance = vegetationViewImportance(
    (cx + 0.5) * chunkSize,
    (cz + 0.5) * chunkSize,
    context,
  );
  const ahead = relativeX * moveDirectionX + relativeZ * moveDirectionZ;
  return ring * 10 - importance * 40 - ahead * 0.75;
}

export type VegetationChunkOffset = { dx: number; dz: number };

/**
 * Extends only the narrow camera cone by two cheap chunk rows. Direction is quantized to eight
 * octants so ordinary look jitter cannot churn the streamed set.
 */
export function vegetationSightlinePrefetchOffsets(
  forwardX: number,
  forwardZ: number,
  baseRing: number,
): VegetationChunkOffset[] {
  const length = Math.hypot(forwardX, forwardZ);
  if (length < 1e-4) return [];
  const octant = Math.round(Math.atan2(forwardZ, forwardX) / (Math.PI / 4));
  const directionX = Math.cos(octant * Math.PI / 4);
  const directionZ = Math.sin(octant * Math.PI / 4);
  const selectRow = (ring: number, minimumAlignment: number, limit: number) => {
    const candidates: Array<VegetationChunkOffset & { alignment: number }> = [];
    for (let dz = -ring; dz <= ring; dz++) {
      for (let dx = -ring; dx <= ring; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== ring) continue;
        const alignment = (dx * directionX + dz * directionZ) / Math.hypot(dx, dz);
        if (alignment < minimumAlignment) continue;
        candidates.push({ dx, dz, alignment });
      }
    }
    return candidates
      .sort((a, b) => b.alignment - a.alignment || a.dx - b.dx || a.dz - b.dz)
      .slice(0, limit)
      .map(({ dx, dz }) => ({ dx, dz }));
  };
  return [
    ...selectRow(baseRing + 1, Math.cos(30 * Math.PI / 180), 5),
    ...selectRow(baseRing + 2, Math.cos(20 * Math.PI / 180), 3),
  ];
}

export function travelGrassLod(
  pointX: number,
  pointZ: number,
  context: VegetationViewContext,
): GrassFieldLod {
  const dx = pointX - context.playerX;
  const dz = pointZ - context.playerZ;
  const distance = Math.hypot(dx, dz);
  const forwardLength = Math.hypot(context.forwardX, context.forwardZ);
  const alignment = distance > 1e-4 && forwardLength > 1e-4
    ? (dx * context.forwardX + dz * context.forwardZ) / (distance * forwardLength)
    : 1;
  const importance = vegetationViewImportance(pointX, pointZ, context);
  if (distance <= 18 || (alignment >= Math.cos(42 * Math.PI / 180) && importance >= 0.62)) return 0;
  return importance >= 0.2 ? 1 : 2;
}

export type GrassFieldLod = 0 | 1 | 2;

/** LOD2 is an exact subset of LOD1, which is an exact subset of LOD0. */
export function grassFieldStrideForLod(lod: GrassFieldLod): 1 | 2 | 4 {
  return lod === 0 ? 1 : lod === 1 ? 2 : 4;
}

export function firstNestedGrassCellIndex(minimumIndex: number, stride: number): number {
  const safeStride = Math.max(1, Math.floor(stride));
  const remainder = ((minimumIndex % safeStride) + safeStride) % safeStride;
  return remainder === 0 ? minimumIndex : minimumIndex + safeStride - remainder;
}
