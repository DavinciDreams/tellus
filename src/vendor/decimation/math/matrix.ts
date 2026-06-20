/**
 * Matrix math utilities
 */

import type { Matrix, Vec3 } from "../types";
import { EPS, dot, zeros } from "./vector";

/** Create an n x m zero matrix */
export function zeroMatrix(rows: number, cols: number): Matrix {
  return Array.from({ length: rows }, () => zeros(cols));
}

/** Create an n x n identity matrix */
export function identity(n: number): Matrix {
  const m = zeroMatrix(n, n);
  for (let i = 0; i < n; i++) {
    m[i][i] = 1;
  }
  return m;
}

/** Clone a matrix */
export function cloneMatrix(m: Matrix): Matrix {
  return m.map((row) => [...row]);
}

/** Get matrix dimensions [rows, cols] */
export function dims(m: Matrix): [number, number] {
  if (m.length === 0) return [0, 0];
  return [m.length, m[0].length];
}

/** Add two matrices */
export function addMatrix(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((val, j) => val + b[i][j]));
}

/** Subtract two matrices (a - b) */
export function subMatrix(a: Matrix, b: Matrix): Matrix {
  return a.map((row, i) => row.map((val, j) => val - b[i][j]));
}

/** Scale a matrix by a scalar */
export function scaleMatrix(m: Matrix, s: number): Matrix {
  return m.map((row) => row.map((val) => val * s));
}

/** Matrix-vector multiplication (Ax) */
export function matVec(m: Matrix, v: number[]): number[] {
  return m.map((row) => dot(row, v));
}

/** Matrix-matrix multiplication (AB) */
export function matMul(a: Matrix, b: Matrix): Matrix {
  const [rowsA, colsA] = dims(a);
  const [_rowsB, colsB] = dims(b);
  const result = zeroMatrix(rowsA, colsB);
  for (let i = 0; i < rowsA; i++) {
    for (let j = 0; j < colsB; j++) {
      for (let k = 0; k < colsA; k++) {
        result[i][j] += a[i][k] * b[k][j];
      }
    }
  }
  return result;
}

/** Transpose a matrix */
export function transpose(m: Matrix): Matrix {
  const [rows, cols] = dims(m);
  const result = zeroMatrix(cols, rows);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      result[j][i] = m[i][j];
    }
  }
  return result;
}

/** Outer product of two vectors (a * b^T) */
export function outer(a: number[], b: number[]): Matrix {
  return a.map((ai) => b.map((bj) => ai * bj));
}

/** Compute quadratic form v^T * M * v */
export function quadraticForm(v: number[], m: Matrix): number {
  return dot(v, matVec(m, v));
}

/** Get matrix trace (sum of diagonal elements) */
export function trace(m: Matrix): number {
  let sum = 0;
  const n = Math.min(m.length, m[0]?.length ?? 0);
  for (let i = 0; i < n; i++) {
    sum += m[i][i];
  }
  return sum;
}

/** Check if matrix is symmetric (within epsilon) */
export function isSymmetric(m: Matrix, eps: number = EPS): boolean {
  const [rows, cols] = dims(m);
  if (rows !== cols) return false;
  for (let i = 0; i < rows; i++) {
    for (let j = i + 1; j < cols; j++) {
      if (Math.abs(m[i][j] - m[j][i]) > eps) return false;
    }
  }
  return true;
}

/**
 * Extract a block from a matrix
 * @param m Source matrix
 * @param startRow Starting row index
 * @param startCol Starting column index
 * @param numRows Number of rows to extract
 * @param numCols Number of columns to extract
 */
export function block(
  m: Matrix,
  startRow: number,
  startCol: number,
  numRows: number,
  numCols: number,
): Matrix {
  const result = zeroMatrix(numRows, numCols);
  for (let i = 0; i < numRows; i++) {
    for (let j = 0; j < numCols; j++) {
      result[i][j] = m[startRow + i][startCol + j];
    }
  }
  return result;
}

/**
 * Set a block in a matrix
 * @param target Target matrix (modified in place)
 * @param startRow Starting row index
 * @param startCol Starting column index
 * @param source Source block to copy
 */
export function setBlock(
  target: Matrix,
  startRow: number,
  startCol: number,
  source: Matrix,
): void {
  const [rows, cols] = dims(source);
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < cols; j++) {
      target[startRow + i][startCol + j] = source[i][j];
    }
  }
}

/**
 * Cholesky decomposition (LL^T form)
 * Returns lower triangular L such that M = L * L^T
 * @param m Symmetric positive definite matrix
 * @param regularize If true, add small regularization for near-singular matrices (default: true for QEM use)
 * @returns Lower triangular matrix L
 * @throws Error if matrix is not positive definite and regularize=false
 */
export function cholesky(m: Matrix, regularize: boolean = true): Matrix {
  const n = m.length;
  const L = zeroMatrix(n, n);

  // Small regularization constant for numerical stability
  const REG_EPS = 1e-10;

  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) {
        sum += L[i][k] * L[j][k];
      }
      if (i === j) {
        const val = m[i][i] - sum;
        if (val <= 0) {
          if (regularize) {
            // Add small regularization for numerical stability
            // This is expected behavior for QEM where matrices may be near-singular
            L[i][j] = Math.sqrt(REG_EPS);
          } else {
            throw new Error(
              `Cholesky decomposition failed: matrix is not positive definite at index ${i} (diagonal value: ${val})`,
            );
          }
        } else {
          L[i][j] = Math.sqrt(val);
        }
      } else {
        if (Math.abs(L[j][j]) < REG_EPS) {
          L[i][j] = 0;
        } else {
          L[i][j] = (m[i][j] - sum) / L[j][j];
        }
      }
    }
  }
  return L;
}

/**
 * Solve lower triangular system Lx = b (forward substitution)
 */
export function solveLower(L: Matrix, b: number[]): number[] {
  const n = b.length;
  const x = zeros(n);
  for (let i = 0; i < n; i++) {
    let sum = b[i];
    for (let j = 0; j < i; j++) {
      sum -= L[i][j] * x[j];
    }
    x[i] = sum / L[i][i];
  }
  return x;
}

/**
 * Solve upper triangular system Ux = b (backward substitution)
 */
export function solveUpper(U: Matrix, b: number[]): number[] {
  const n = b.length;
  const x = zeros(n);
  for (let i = n - 1; i >= 0; i--) {
    let sum = b[i];
    for (let j = i + 1; j < n; j++) {
      sum -= U[i][j] * x[j];
    }
    x[i] = sum / U[i][i];
  }
  return x;
}

/**
 * Solve symmetric positive definite system using Cholesky decomposition
 * @param m Symmetric positive definite matrix
 * @param b Right-hand side vector
 * @returns Solution x such that Mx = b
 */
export function solveCholesky(m: Matrix, b: number[]): number[] {
  const L = cholesky(m);
  const y = solveLower(L, b);
  return solveUpper(transpose(L), y);
}

/**
 * Compute plane equation coefficients from three points
 * Returns [a, b, c, d] where ax + by + cz + d = 0
 */
export function planeFromThreePoints(
  v1: Vec3,
  v2: Vec3,
  v3: Vec3,
): [number, number, number, number] {
  // Normal = (v2 - v1) x (v3 - v1)
  const e1: Vec3 = [v2[0] - v1[0], v2[1] - v1[1], v2[2] - v1[2]];
  const e2: Vec3 = [v3[0] - v1[0], v3[1] - v1[1], v3[2] - v1[2]];
  const n: Vec3 = [
    e1[1] * e2[2] - e1[2] * e2[1],
    e1[2] * e2[0] - e1[0] * e2[2],
    e1[0] * e2[1] - e1[1] * e2[0],
  ];

  // Normalize
  const len = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
  if (len < EPS) {
    return [0, 0, 0, 0]; // Degenerate triangle
  }
  n[0] /= len;
  n[1] /= len;
  n[2] /= len;

  // d = -n . v1
  const d = -(n[0] * v1[0] + n[1] * v1[1] + n[2] * v1[2]);

  return [n[0], n[1], n[2], d];
}

/**
 * Get right columns of a matrix (columns from index 'start' to end)
 */
export function rightCols(m: Matrix, start: number): Matrix {
  return m.map((row) => row.slice(start));
}

/**
 * Get top-left corner of a matrix
 */
export function topLeftCorner(m: Matrix, rows: number, cols: number): Matrix {
  return block(m, 0, 0, rows, cols);
}
