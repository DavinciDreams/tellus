/**
 * Types for seam-aware mesh decimation
 */

/** A 3D position (x, y, z) */
export type Vec3 = [number, number, number];

/** A 2D UV coordinate (u, v) */
export type Vec2 = [number, number];

/** A 5D point combining 3D position and 2D UV (x, y, z, u, v) */
export type Vec5 = [number, number, number, number, number];

/** A 6D vector (5D + homogeneous coordinate) */
export type Vec6 = [number, number, number, number, number, number];

/** An 8D vector for seam constraint optimization */
export type Vec8 = [
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];

/** A matrix represented as a 2D array */
export type Matrix = number[][];

/**
 * Vertex bundle containing vertex index and texture coordinate index
 */
export class VertexBundle {
  constructor(
    public vi: number = -1,
    public tci: number = -1,
  ) {}

  equals(other: VertexBundle): boolean {
    return this.vi === other.vi && this.tci === other.tci;
  }

  clone(): VertexBundle {
    return new VertexBundle(this.vi, this.tci);
  }
}

/**
 * Half-edge representation for mesh traversal
 */
export class HalfEdge {
  /** Face index */
  fi: number;
  /** Index opposite to the half edge (0, 1, or 2) */
  ki: number;
  /** Endpoint bundles [start, end] */
  p: [VertexBundle, VertexBundle];

  constructor(fi: number, ki: number) {
    this.fi = fi;
    this.ki = ki;
    this.p = [new VertexBundle(), new VertexBundle()];
  }
}

/** A bundle of half-edges (typically 2 for an edge shared by 2 faces) */
export type Bundle = HalfEdge[];

/**
 * Placement information after edge collapse
 */
export class PlacementInfo5D {
  /** New 3D position */
  p: Vec3 = [0, 0, 0];
  /** New texture coordinates (1 for normal edge, 2 for seam edge) */
  tcs: Vec2[] = [];
  /** Updated metrics */
  metrics: Matrix[] = [];
}

/**
 * Edge map for tracking seam edges
 * Maps vertex index to set of connected vertex indices on seams
 */
export type EdgeMap = Map<number, Set<number>>;

/**
 * Per-vertex 5D metrics map
 * Maps vertex index -> texture coord index -> 6x6 metric matrix
 */
export type MapV5d = Map<number, Map<number, Matrix>>;

/**
 * Priority queue entry for edge collapse
 */
export type PriorityQueueEntry = {
  cost: number;
  edgeIndex: number;
};

/**
 * Input mesh data
 */
export class MeshData {
  /** Vertex positions (#V x 3) */
  V: Vec3[];
  /** Face indices into V (#F x 3) */
  F: [number, number, number][];
  /** Texture coordinates (#TC x 2) */
  TC: Vec2[];
  /** Face indices into TC (#F x 3) */
  FT: [number, number, number][];

  constructor(
    V: Vec3[] = [],
    F: [number, number, number][] = [],
    TC: Vec2[] = [],
    FT: [number, number, number][] = [],
  ) {
    // Validate input arrays
    MeshData.validate(V, F, TC, FT);

    this.V = V;
    this.F = F;
    this.TC = TC;
    this.FT = FT;
  }

  /**
   * Validate mesh data consistency
   * @throws Error if validation fails
   */
  static validate(
    V: Vec3[],
    F: [number, number, number][],
    TC: Vec2[],
    FT: [number, number, number][],
  ): void {
    // F and FT must have the same length
    if (F.length !== FT.length) {
      throw new Error(
        `MeshData validation failed: F.length (${F.length}) !== FT.length (${FT.length})`,
      );
    }

    // All face vertex indices must be valid
    for (let fi = 0; fi < F.length; fi++) {
      const face = F[fi];
      for (let j = 0; j < 3; j++) {
        if (face[j] < 0 || face[j] >= V.length) {
          throw new Error(
            `MeshData validation failed: F[${fi}][${j}] = ${face[j]} is out of range [0, ${V.length - 1}]`,
          );
        }
      }
    }

    // All face texture indices must be valid
    for (let fi = 0; fi < FT.length; fi++) {
      const face = FT[fi];
      for (let j = 0; j < 3; j++) {
        if (face[j] < 0 || face[j] >= TC.length) {
          throw new Error(
            `MeshData validation failed: FT[${fi}][${j}] = ${face[j]} is out of range [0, ${TC.length - 1}]`,
          );
        }
      }
    }

    // Vertex positions must be valid numbers
    for (let vi = 0; vi < V.length; vi++) {
      const v = V[vi];
      if (
        !Number.isFinite(v[0]) ||
        !Number.isFinite(v[1]) ||
        !Number.isFinite(v[2])
      ) {
        throw new Error(
          `MeshData validation failed: V[${vi}] = [${v}] contains non-finite values`,
        );
      }
    }

    // Texture coordinates must be valid numbers
    for (let ti = 0; ti < TC.length; ti++) {
      const t = TC[ti];
      if (!Number.isFinite(t[0]) || !Number.isFinite(t[1])) {
        throw new Error(
          `MeshData validation failed: TC[${ti}] = [${t}] contains non-finite values`,
        );
      }
    }
  }

  /**
   * Create a deep copy of this mesh data
   */
  clone(): MeshData {
    // Deep copy all arrays
    const V: Vec3[] = this.V.map((v) => [v[0], v[1], v[2]] as Vec3);
    const F: [number, number, number][] = this.F.map(
      (f) => [f[0], f[1], f[2]] as [number, number, number],
    );
    const TC: Vec2[] = this.TC.map((t) => [t[0], t[1]] as Vec2);
    const FT: [number, number, number][] = this.FT.map(
      (f) => [f[0], f[1], f[2]] as [number, number, number],
    );

    return new MeshData(V, F, TC, FT);
  }

  /**
   * Get the number of vertices
   */
  get vertexCount(): number {
    return this.V.length;
  }

  /**
   * Get the number of faces
   */
  get faceCount(): number {
    return this.F.length;
  }

  /**
   * Get the number of texture coordinates
   */
  get texCoordCount(): number {
    return this.TC.length;
  }
}

/**
 * Decimation options
 */
export type DecimationOptions = {
  /** Target number of vertices (takes precedence over targetPercent) */
  targetVertices?: number;
  /** Target percentage of vertices to keep (0-100) */
  targetPercent?: number;
  /** Strictness level: 0=no UV shape preservation, 1=UV shape preservation, 2=seam-aware (default) */
  strictness?: 0 | 1 | 2;
};

/**
 * Edge flap data structure for mesh connectivity
 */
export class EdgeFlaps {
  /** Edge endpoints (#E x 2) */
  E: [number, number][];
  /** Maps face corner to unique edge index */
  EMAP: number[];
  /** Edge flaps - faces adjacent to each edge (#E x 2) */
  EF: [number, number][];
  /** Edge flap corners - vertex indices opposite each edge side (#E x 2) */
  EI: [number, number][];

  constructor(_numEdges: number = 0, numFaces: number = 0) {
    this.E = [];
    this.EMAP = new Array(numFaces * 3).fill(-1);
    this.EF = [];
    this.EI = [];
  }
}

/** Null marker for collapsed elements */
export const NULL_INDEX = -1;
