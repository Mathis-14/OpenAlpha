/**
 * CVI calibration solver with iterative butterfly linearization.
 *
 * Uses cvxjs (Clarabel interior-point solver) — the same solver backend
 * as the Python reference implementation via CVXPY.
 *
 * Iteration 0: solve QP without butterfly constraints (C7/C8 trivially satisfied)
 * Iteration k >= 1: linearize butterfly around previous solution, re-solve
 * Stop when weights converge or max_iter reached.
 *
 * Port of: vol-surface-cvi/src/cvi/solver.py
 */

import { CVIBasis } from "./basis";
import { solveCVIQP } from "./cvx-builder";
import { butterflyG } from "./butterfly";
import { linspace } from "./matrix";
import type { MarketSlice, CVIConfig, CVIResult } from "./types";

/**
 * Run CVI calibration with iterative butterfly linearization.
 */
export async function calibrateCVI(
  slices: MarketSlice[],
  config: CVIConfig,
): Promise<CVIResult> {
  const basis = new CVIBasis(config.knots);
  const sorted = [...slices].sort((a, b) => a.T - b.T);

  const result: CVIResult = {
    weights: new Map(),
    cvi_params: new Map(),
    iterations: 0,
    converged: false,
    solver_status: "",
    objective_value: 0,
    butterfly_violations: new Map(),
  };

  let prevWeights: Map<number, number[]> | null = null;
  let currWeights = new Map<number, number[]>();

  for (let iteration = 0; iteration < config.max_iter; iteration++) {
    const qpResult = await solveCVIQP(
      basis,
      sorted,
      config,
      iteration > 0 ? prevWeights ?? undefined : undefined,
    );

    if (qpResult.status !== "optimal" || qpResult.weights.size === 0) {
      result.solver_status = qpResult.status;
      result.converged = false;
      result.iterations = iteration + 1;
      if (prevWeights) result.weights = prevWeights;
      break;
    }

    currWeights = qpResult.weights;

    // Check convergence (from iteration 1 onward)
    if (iteration > 0 && prevWeights) {
      const maxChange = relativeWeightChange(prevWeights, currWeights);
      if (maxChange < config.convergence_tol) {
        result.converged = true;
        result.iterations = iteration + 1;
        result.solver_status = qpResult.status;
        result.objective_value = qpResult.objectiveValue;
        break;
      }
    }

    prevWeights = currWeights;

    if (iteration === config.max_iter - 1) {
      result.iterations = config.max_iter;
      result.solver_status = qpResult.status;
      result.objective_value = qpResult.objectiveValue;
    }
  }

  // Set final weights
  result.weights = currWeights;

  // Convert to CVI parameters
  for (const [T, w] of result.weights) {
    result.cvi_params.set(T, basis.bsplineToCvi(w));
  }

  // Check butterfly violations on fine grid
  result.butterfly_violations = checkButterflyViolations(
    result.weights, basis, sorted, config.n_pdf_check,
  );

  return result;
}

function relativeWeightChange(
  prev: Map<number, number[]>,
  curr: Map<number, number[]>,
): number {
  let maxChange = 0;
  for (const [T, wCurr] of curr) {
    const wPrev = prev.get(T);
    if (!wPrev) continue;
    let normCurr = 0;
    for (const v of wCurr) normCurr = Math.max(normCurr, Math.abs(v));
    if (normCurr < 1e-15) continue;
    let change = 0;
    for (let j = 0; j < wCurr.length; j++) {
      change = Math.max(change, Math.abs(wCurr[j]! - wPrev[j]!));
    }
    maxChange = Math.max(maxChange, change / normCurr);
  }
  return maxChange;
}

/**
 * Check PDF >= 0 on a fine grid per expiry.
 * Returns map T → count of violation points.
 */
function checkButterflyViolations(
  weights: Map<number, number[]>,
  basis: CVIBasis,
  slices: MarketSlice[],
  nGrid: number,
): Map<number, number> {
  const zGrid = linspace(basis.knots[0]!, basis.knots[basis.knots.length - 1]!, nGrid);
  const B0 = basis.designMatrix(zGrid, 0);
  const B1 = basis.designMatrix(zGrid, 1);
  const B2 = basis.designMatrix(zGrid, 2);
  const nb = basis.nBasis;

  const violations = new Map<number, number>();

  for (const sl of slices) {
    const w = weights.get(sl.T);
    if (!w) continue;
    const vStar = sl.sigma_star ** 2;

    const v: number[] = [];
    const s: number[] = [];
    const c: number[] = [];
    const k: number[] = [];

    for (let p = 0; p < nGrid; p++) {
      let vp = 0;
      let sp = 0;
      let cp = 0;
      for (let j = 0; j < nb; j++) {
        vp += B0[p]![j]! * w[j]!;
        sp += B1[p]![j]! * w[j]!;
        cp += B2[p]![j]! * w[j]!;
      }
      v.push(Math.max(vp, 1e-10));
      s.push(sp / vStar);
      c.push(cp / vStar);
      k.push(zGrid[p]! * sl.sigma_star * Math.sqrt(sl.T));
    }

    const g = butterflyG(v, s, k, vStar, sl.T);
    let count = 0;
    for (let p = 0; p < nGrid; p++) {
      if (c[p]! - g[p]! < -1e-6) count++;
    }
    violations.set(sl.T, count);
  }

  return violations;
}
