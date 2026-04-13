/**
 * Cubic B-spline evaluation via Cox-de Boor recursion.
 *
 * Provides clamped knot vector construction and design matrix evaluation
 * for spline values and derivatives (order 0, 1, 2).
 */

import { clip } from "./matrix";

/**
 * Build a clamped cubic knot vector from interior knots.
 * Repeats first and last knot 4 times (degree + 1).
 *
 * Input:  [z_0, z_1, ..., z_{n-1}]  (n interior knots)
 * Output: [z_0, z_0, z_0, z_0, z_1, ..., z_{n-2}, z_{n-1}, z_{n-1}, z_{n-1}, z_{n-1}]
 * Length: n + 6
 */
export function clampedKnotVector(interiorKnots: number[]): number[] {
  const z0 = interiorKnots[0]!;
  const zn = interiorKnots[interiorKnots.length - 1]!;
  return [
    z0, z0, z0, z0,
    ...interiorKnots.slice(1, -1),
    zn, zn, zn, zn,
  ];
}

/**
 * Cox-de Boor recursion for B-spline basis function N_{i,k}(z).
 *
 * Convention: 0/0 = 0.
 */
function basisFunction(
  z: number,
  knotVector: number[],
  i: number,
  degree: number,
): number {
  if (degree === 0) {
    const ti = knotVector[i]!;
    const ti1 = knotVector[i + 1]!;
    // Handle the right endpoint: include it in the last interval
    if (ti === ti1) return 0;
    if (z >= ti && z < ti1) return 1;
    if (z === ti1 && ti1 === knotVector[knotVector.length - 1]) return 1;
    return 0;
  }

  const ti = knotVector[i]!;
  const tik = knotVector[i + degree]!;
  const ti1 = knotVector[i + 1]!;
  const tik1 = knotVector[i + degree + 1]!;

  let left = 0;
  if (tik - ti > 1e-14) {
    left = ((z - ti) / (tik - ti)) * basisFunction(z, knotVector, i, degree - 1);
  }

  let right = 0;
  if (tik1 - ti1 > 1e-14) {
    right = ((tik1 - z) / (tik1 - ti1)) * basisFunction(z, knotVector, i + 1, degree - 1);
  }

  return left + right;
}

/**
 * First derivative of B-spline basis function N'_{i,k}(z).
 *
 * Uses the standard identity:
 * N'_{i,k}(z) = k * (N_{i,k-1}(z) / (t_{i+k} - t_i) - N_{i+1,k-1}(z) / (t_{i+k+1} - t_{i+1}))
 */
function basisFunctionDeriv1(
  z: number,
  knotVector: number[],
  i: number,
  degree: number,
): number {
  const ti = knotVector[i]!;
  const tik = knotVector[i + degree]!;
  const ti1 = knotVector[i + 1]!;
  const tik1 = knotVector[i + degree + 1]!;

  let left = 0;
  if (tik - ti > 1e-14) {
    left = basisFunction(z, knotVector, i, degree - 1) / (tik - ti);
  }

  let right = 0;
  if (tik1 - ti1 > 1e-14) {
    right = basisFunction(z, knotVector, i + 1, degree - 1) / (tik1 - ti1);
  }

  return degree * (left - right);
}

/**
 * Second derivative of B-spline basis function N''_{i,k}(z).
 *
 * Apply the derivative formula recursively:
 * N''_{i,k}(z) = k * (N'_{i,k-1}(z) / (t_{i+k} - t_i) - N'_{i+1,k-1}(z) / (t_{i+k+1} - t_{i+1}))
 */
function basisFunctionDeriv2(
  z: number,
  knotVector: number[],
  i: number,
  degree: number,
): number {
  const ti = knotVector[i]!;
  const tik = knotVector[i + degree]!;
  const ti1 = knotVector[i + 1]!;
  const tik1 = knotVector[i + degree + 1]!;

  let left = 0;
  if (tik - ti > 1e-14) {
    left = basisFunctionDeriv1(z, knotVector, i, degree - 1) / (tik - ti);
  }

  let right = 0;
  if (tik1 - ti1 > 1e-14) {
    right = basisFunctionDeriv1(z, knotVector, i + 1, degree - 1) / (tik1 - ti1);
  }

  return degree * (left - right);
}

type BasisEvalFn = (
  z: number,
  knotVector: number[],
  i: number,
  degree: number,
) => number;

/**
 * Compute the design matrix B[j][i] where B[j][i] = N_i^{(deriv)}(z_j).
 *
 * @param zEval - Evaluation points (will be clamped to knot domain)
 * @param knotVector - The clamped knot vector
 * @param degree - Spline degree (3 for cubic)
 * @param deriv - Derivative order (0, 1, or 2)
 * @returns 2D array of shape [zEval.length][nBasis]
 */
export function designMatrix(
  zEval: number[],
  knotVector: number[],
  degree: number,
  deriv: number,
): number[][] {
  const nBasis = knotVector.length - degree - 1;
  const zMin = knotVector[0]!;
  const zMax = knotVector[knotVector.length - 1]!;

  let evalFn: BasisEvalFn;
  if (deriv === 0) evalFn = basisFunction;
  else if (deriv === 1) evalFn = basisFunctionDeriv1;
  else evalFn = basisFunctionDeriv2;

  const result: number[][] = [];
  for (const z of zEval) {
    const zClamped = clip(z, zMin, zMax);
    const row: number[] = [];
    for (let i = 0; i < nBasis; i++) {
      row.push(evalFn(zClamped, knotVector, i, degree));
    }
    result.push(row);
  }
  return result;
}

/**
 * Evaluate a B-spline: v(z) = sum_i w_i * N_i(z).
 *
 * @param zEval - Evaluation points
 * @param knotVector - Clamped knot vector
 * @param weights - B-spline coefficients
 * @param degree - Spline degree
 * @param deriv - Derivative order
 * @returns Array of values at evaluation points
 */
export function evaluateSpline(
  zEval: number[],
  knotVector: number[],
  weights: number[],
  degree: number,
  deriv: number,
): number[] {
  const B = designMatrix(zEval, knotVector, degree, deriv);
  return B.map((row) => {
    let sum = 0;
    for (let i = 0; i < weights.length; i++) {
      sum += row[i]! * weights[i]!;
    }
    return sum;
  });
}
