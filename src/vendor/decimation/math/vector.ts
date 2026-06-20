/**
 * Vector math utilities
 */

import type { Vec2, Vec3, Vec5, Vec6 } from "../types";

/** Epsilon for floating point comparisons */
export const EPS = 1e-8;

/** Positive infinity */
export const INF = Infinity;

/** Create a zero vector of given size */
export function zeros(n: number): number[] {
  return new Array(n).fill(0);
}

/** Create a vector filled with ones of given size */
export function ones(n: number): number[] {
  return new Array(n).fill(1);
}

/** Clone a vector */
export function clone<T extends number[]>(v: T): T {
  return [...v] as T;
}

/** Add two vectors */
export function add<T extends number[]>(a: T, b: T): T {
  return a.map((val, i) => val + b[i]) as T;
}

/** Subtract two vectors (a - b) */
export function sub<T extends number[]>(a: T, b: T): T {
  return a.map((val, i) => val - b[i]) as T;
}

/** Multiply vector by scalar */
export function scale<T extends number[]>(v: T, s: number): T {
  return v.map((val) => val * s) as T;
}

/** Dot product of two vectors */
export function dot(a: number[], b: number[]): number {
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/** Squared norm (length squared) */
export function normSq(v: number[]): number {
  return dot(v, v);
}

/** Euclidean norm (length) */
export function norm(v: number[]): number {
  return Math.sqrt(normSq(v));
}

/** Normalize a vector (return unit vector) */
export function normalize<T extends number[]>(v: T): T {
  const n = norm(v);
  if (n < EPS) return v;
  return scale(v, 1 / n);
}

/** Cross product of two 3D vectors */
export function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

/** Distance between two points */
export function distance(a: number[], b: number[]): number {
  return norm(sub(a, b));
}

/** Minimum component */
export function minCoeff(v: number[]): number {
  return Math.min(...v);
}

/** Maximum component */
export function maxCoeff(v: number[]): number {
  return Math.max(...v);
}

/** Check if all components are finite */
export function isFinite(v: number[]): boolean {
  return v.every((x) => Number.isFinite(x));
}

/** Check if vectors are equal (within epsilon) */
export function equals(a: number[], b: number[], eps: number = EPS): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i] - b[i]) > eps) return false;
  }
  return true;
}

/** Convert Vec3 to homogeneous coordinates (Vec4) */
export function homogeneous3(v: Vec3): [number, number, number, number] {
  return [v[0], v[1], v[2], 1];
}

/** Convert Vec5 to homogeneous coordinates (Vec6) */
export function homogeneous5(v: Vec5): Vec6 {
  return [v[0], v[1], v[2], v[3], v[4], 1];
}

/** Create Vec5 from Vec3 position and Vec2 UV */
export function makeVec5(pos: Vec3, uv: Vec2): Vec5 {
  return [pos[0], pos[1], pos[2], uv[0], uv[1]];
}

/** Extract position from Vec5 */
export function getPosition(v: Vec5): Vec3 {
  return [v[0], v[1], v[2]];
}

/** Extract UV from Vec5 */
export function getUV(v: Vec5): Vec2 {
  return [v[3], v[4]];
}

/** Compute the Euclidean distance used in Goldfarb-Idnani algorithm */
export function giDistance(a: number, b: number): number {
  const a1 = Math.abs(a);
  const b1 = Math.abs(b);
  if (a1 > b1) {
    const t = b1 / a1;
    return a1 * Math.sqrt(1.0 + t * t);
  } else if (b1 > a1) {
    const t = a1 / b1;
    return b1 * Math.sqrt(1.0 + t * t);
  }
  return a1 * Math.sqrt(2.0);
}

/** Midpoint between two vectors */
export function midpoint<T extends number[]>(a: T, b: T): T {
  return scale(add(a, b), 0.5) as T;
}

/** Linear interpolation between two vectors */
export function lerp<T extends number[]>(a: T, b: T, t: number): T {
  return add(scale(a, 1 - t), scale(b, t)) as T;
}
