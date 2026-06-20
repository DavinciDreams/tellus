/**
 * Quadratic Programming Solver
 *
 * Implements the Goldfarb-Idnani dual method for solving convex QP problems:
 *
 * min  0.5 * x^T * G * x + g0^T * x
 * s.t. CE^T * x + ce0 = 0
 *      CI^T * x + ci0 >= 0
 *
 * Based on eiquadprog by Luca Di Gaspero, Angelo Furfaro, Benjamin Stephens, and Gael Guennebaud.
 */

import type { Matrix } from "../types";
import { zeroMatrix, identity, transpose, cholesky, matVec } from "./matrix";
import { zeros, dot, giDistance } from "./vector";

const EPS_MACHINE = Number.EPSILON;
const INF = Infinity;

/**
 * Compute d = J^T * np
 */
function computeD(J: Matrix, np: number[]): number[] {
  const JT = transpose(J);
  return matVec(JT, np);
}

/**
 * Update z = J_{right cols from iq} * d_{tail from iq}
 */
function updateZ(J: Matrix, d: number[], iq: number): number[] {
  const n = J.length;
  const z = zeros(n);
  for (let i = 0; i < n; i++) {
    for (let j = iq; j < n; j++) {
      z[i] += J[i][j] * d[j];
    }
  }
  return z;
}

/**
 * Update r by solving triangular system
 * r_{head iq} = R_{topLeftCorner iq x iq}^{-1} * d_{head iq}
 */
function updateR(R: Matrix, d: number[], iq: number): number[] {
  const r = zeros(d.length);
  // Solve upper triangular system R[0:iq, 0:iq] * r[0:iq] = d[0:iq]
  for (let i = iq - 1; i >= 0; i--) {
    let sum = d[i];
    for (let j = i + 1; j < iq; j++) {
      sum -= R[i][j] * r[j];
    }
    r[i] = sum / R[i][i];
  }
  return r;
}

/**
 * Add a constraint to the active set
 * @returns true if constraint was added successfully
 */
function addConstraint(
  R: Matrix,
  J: Matrix,
  d: number[],
  iqRef: { iq: number },
  RNormRef: { val: number },
): boolean {
  const n = J.length;
  let iq = iqRef.iq;

  // Apply Givens rotations to reduce d[j] to zero for j > iq
  for (let j = n - 1; j >= iq + 1; j--) {
    let cc = d[j - 1];
    let ss = d[j];
    const h = giDistance(cc, ss);
    if (h === 0) continue;

    d[j] = 0;
    ss = ss / h;
    cc = cc / h;

    if (cc < 0) {
      cc = -cc;
      ss = -ss;
      d[j - 1] = -h;
    } else {
      d[j - 1] = h;
    }

    const xny = ss / (1.0 + cc);
    for (let k = 0; k < n; k++) {
      const t1 = J[k][j - 1];
      const t2 = J[k][j];
      J[k][j - 1] = t1 * cc + t2 * ss;
      J[k][j] = xny * (t1 + J[k][j - 1]) - t2;
    }
  }

  // Update number of active constraints
  iq++;
  iqRef.iq = iq;

  // Put the iq components of d into column iq-1 of R
  for (let i = 0; i < iq; i++) {
    R[i][iq - 1] = d[i];
  }

  if (Math.abs(d[iq - 1]) <= EPS_MACHINE * RNormRef.val) {
    // Problem degenerate
    return false;
  }
  RNormRef.val = Math.max(RNormRef.val, Math.abs(d[iq - 1]));
  return true;
}

/**
 * Delete a constraint from the active set
 */
function deleteConstraint(
  R: Matrix,
  J: Matrix,
  A: number[],
  u: number[],
  p: number,
  iqRef: { iq: number },
  l: number,
): void {
  const n = R.length;
  let iq = iqRef.iq;

  // Find the index qq for active constraint l to be removed
  let qq = -1;
  for (let i = p; i < iq; i++) {
    if (A[i] === l) {
      qq = i;
      break;
    }
  }
  if (qq < 0) return;

  // Remove the constraint from the active set and duals
  for (let i = qq; i < iq - 1; i++) {
    A[i] = A[i + 1];
    u[i] = u[i + 1];
    for (let j = 0; j < n; j++) {
      R[j][i] = R[j][i + 1];
    }
  }

  A[iq - 1] = A[iq];
  u[iq - 1] = u[iq];
  A[iq] = 0;
  u[iq] = 0;
  for (let j = 0; j < iq; j++) {
    R[j][iq - 1] = 0;
  }

  iq--;
  iqRef.iq = iq;

  if (iq === 0) return;

  // Restore R and J after removal
  for (let j = qq; j < iq; j++) {
    let cc = R[j][j];
    let ss = R[j + 1][j];
    const h = giDistance(cc, ss);
    if (h === 0) continue;

    cc = cc / h;
    ss = ss / h;
    R[j + 1][j] = 0;
    if (cc < 0) {
      R[j][j] = -h;
      cc = -cc;
      ss = -ss;
    } else {
      R[j][j] = h;
    }

    const xny = ss / (1.0 + cc);
    for (let k = j + 1; k < iq; k++) {
      const t1 = R[j][k];
      const t2 = R[j + 1][k];
      R[j][k] = t1 * cc + t2 * ss;
      R[j + 1][k] = xny * (t1 + R[j][k]) - t2;
    }
    for (let k = 0; k < n; k++) {
      const t1 = J[k][j];
      const t2 = J[k][j + 1];
      J[k][j] = t1 * cc + t2 * ss;
      J[k][j + 1] = xny * (J[k][j] + t1) - t2;
    }
  }
}

/**
 * Solve a convex quadratic programming problem using Goldfarb-Idnani dual method.
 *
 * @param G Positive definite matrix (n x n) - NOTE: will be modified!
 * @param g0 Linear term (n)
 * @param CE Equality constraint matrix (n x p)
 * @param ce0 Equality constraint constants (p)
 * @param CI Inequality constraint matrix (n x m)
 * @param ci0 Inequality constraint constants (m)
 * @returns Solution vector x and cost, or {x: [], cost: INF} if infeasible
 */
export function solveQuadprog(
  G: Matrix,
  g0: number[],
  CE: Matrix,
  ce0: number[],
  CI: Matrix,
  ci0: number[],
): { x: number[]; cost: number } {
  const n = g0.length;
  const p = CE.length > 0 ? (CE[0]?.length ?? 0) : 0; // Number of equality constraints
  const m = CI.length > 0 ? (CI[0]?.length ?? 0) : 0; // Number of inequality constraints

  // Initialize working matrices
  const R = zeroMatrix(n, n);
  const J = identity(n);

  const s = zeros(m + p);
  let z = zeros(n);
  let r = zeros(m + p);
  let d = zeros(n);
  const np = zeros(n);
  const u = zeros(m + p);
  const xOld = zeros(n);
  const uOld = zeros(m + p);

  const RNorm = 1.0;
  const iqRef = { iq: 0 };
  const RNormRef = { val: RNorm };

  // Compute trace of original G
  let c1 = 0;
  for (let i = 0; i < n; i++) c1 += G[i][i];

  // Compute Cholesky decomposition G = L * L^T
  const L = cholesky(G);

  // Compute J = L^{-T}
  for (let i = 0; i < n; i++) {
    J[i][i] = 1.0 / L[i][i];
    for (let j = i + 1; j < n; j++) {
      let sum = 0;
      for (let k = i; k < j; k++) {
        sum += L[j][k] * J[k][i];
      }
      J[j][i] = -sum / L[j][j];
    }
  }
  // Transpose J
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const tmp = J[i][j];
      J[i][j] = J[j][i];
      J[j][i] = tmp;
    }
  }

  // c2 = trace(J)
  let c2 = 0;
  for (let i = 0; i < n; i++) c2 += J[i][i];

  // Find unconstrained minimizer: x = -G^{-1} * g0
  // Using Cholesky: x = -L^{-T} * L^{-1} * g0
  const x = zeros(n);
  {
    // Forward substitution: y = L^{-1} * g0
    const y = zeros(n);
    for (let i = 0; i < n; i++) {
      let sum = g0[i];
      for (let j = 0; j < i; j++) {
        sum -= L[i][j] * y[j];
      }
      y[i] = sum / L[i][i];
    }
    // Backward substitution: x = -L^{-T} * y
    for (let i = n - 1; i >= 0; i--) {
      let sum = y[i];
      for (let j = i + 1; j < n; j++) {
        sum -= L[j][i] * x[j];
      }
      x[i] = -sum / L[i][i];
    }
  }

  // Compute initial cost
  let fValue = 0.5 * dot(g0, x);

  // Add equality constraints to working set
  for (let i = 0; i < p; i++) {
    // np = CE column i
    for (let k = 0; k < n; k++) np[k] = CE[k][i];

    d = computeD(J, np);
    z = updateZ(J, d, iqRef.iq);
    r = updateR(R, d, iqRef.iq);

    // Compute full step length
    let t2 = 0;
    const zDotZ = dot(z, z);
    if (Math.abs(zDotZ) > EPS_MACHINE) {
      t2 = (-dot(np, x) - ce0[i]) / dot(z, np);
    }

    // Take step
    for (let k = 0; k < n; k++) x[k] += t2 * z[k];

    // Update u
    u[iqRef.iq] = t2;
    for (let k = 0; k < iqRef.iq; k++) u[k] -= t2 * r[k];

    // Update cost
    fValue += 0.5 * t2 * t2 * dot(z, np);

    // Add constraint to active set
    const A = new Array(m + p).fill(0);
    A[i] = -i - 1;
    if (!addConstraint(R, J, d, iqRef, RNormRef)) {
      // Equality constraints linearly dependent
      return { x, cost: fValue };
    }
  }

  // Active set
  const A = new Array(m + p).fill(0);
  const AOld = new Array(m + p).fill(0);
  const iai = new Array(m + p).fill(0);
  const iaexcl = new Array(m + p).fill(1);

  // Set iai = K \ A
  for (let i = 0; i < m; i++) iai[i] = i;

  // Main loop
  let iter = 0;
  const maxIter = 1000;

  while (iter++ < maxIter) {
    // Step 1: Choose a violated constraint
    for (let i = p; i < iqRef.iq; i++) {
      const ip = A[i];
      iai[ip] = -1;
    }

    // Compute s(x) = CI^T * x + ci0
    let ss = 0;
    let psi = 0;
    let ip = 0;
    for (let i = 0; i < m; i++) {
      iaexcl[i] = 1;
      let sum = ci0[i];
      for (let k = 0; k < n; k++) sum += CI[k][i] * x[k];
      s[i] = sum;
      psi += Math.min(0, sum);
    }

    if (Math.abs(psi) <= m * EPS_MACHINE * c1 * c2 * 100) {
      // No more infeasibilities
      return { x, cost: fValue };
    }

    // Save old values
    for (let i = 0; i < iqRef.iq; i++) {
      uOld[i] = u[i];
      AOld[i] = A[i];
    }
    for (let i = 0; i < n; i++) xOld[i] = x[i];

    // Step 2: Check feasibility and determine new S-pair
    let foundConstraint = false;
    for (let i = 0; i < m; i++) {
      if (s[i] < ss && iai[i] !== -1 && iaexcl[i]) {
        ss = s[i];
        ip = i;
        foundConstraint = true;
      }
    }

    if (!foundConstraint || ss >= 0) {
      return { x, cost: fValue };
    }

    // Set np = CI column ip
    for (let k = 0; k < n; k++) np[k] = CI[k][ip];

    u[iqRef.iq] = 0;
    A[iqRef.iq] = ip;

    // Step 2a: Determine step direction
    let loopCount = 0;
    while (loopCount++ < maxIter) {
      d = computeD(J, np);
      z = updateZ(J, d, iqRef.iq);
      r = updateR(R, d, iqRef.iq);

      // Step 2b: Compute step length
      let l = 0;
      let t1 = INF;

      for (let k = p; k < iqRef.iq; k++) {
        if (r[k] > 0) {
          const tmp = u[k] / r[k];
          if (tmp < t1) {
            t1 = tmp;
            l = A[k];
          }
        }
      }

      let t2 = INF;
      const zDotZ = dot(z, z);
      if (Math.abs(zDotZ) > EPS_MACHINE) {
        t2 = -s[ip] / dot(z, np);
      }

      const t = Math.min(t1, t2);

      // Step 2c: Determine new S-pair and take step
      if (t >= INF) {
        // QPP is infeasible
        return { x: [], cost: INF };
      }

      if (t2 >= INF) {
        // Step in dual space only
        for (let k = 0; k < iqRef.iq; k++) u[k] -= t * r[k];
        u[iqRef.iq] += t;
        iai[l] = l;
        deleteConstraint(R, J, A, u, p, iqRef, l);
        continue;
      }

      // Step in primal and dual space
      for (let k = 0; k < n; k++) x[k] += t * z[k];
      fValue += t * dot(z, np) * (0.5 * t + u[iqRef.iq]);
      for (let k = 0; k < iqRef.iq; k++) u[k] -= t * r[k];
      u[iqRef.iq] += t;

      if (t === t2) {
        // Full step taken
        if (!addConstraint(R, J, d, iqRef, RNormRef)) {
          iaexcl[ip] = 0;
          deleteConstraint(R, J, A, u, p, iqRef, ip);
          for (let i = 0; i < m; i++) iai[i] = i;
          for (let i = 0; i < iqRef.iq; i++) {
            A[i] = AOld[i];
            iai[A[i]] = -1;
            u[i] = uOld[i];
          }
          for (let i = 0; i < n; i++) x[i] = xOld[i];
          // Continue outer loop (step 2)
          break;
        } else {
          iai[ip] = -1;
          break; // Go to step 1
        }
      }

      // Partial step - drop constraint l
      iai[l] = l;
      deleteConstraint(R, J, A, u, p, iqRef, l);

      // Update s[ip]
      s[ip] = ci0[ip];
      for (let k = 0; k < n; k++) s[ip] += CI[k][ip] * x[k];
    }
  }

  return { x, cost: fValue };
}
