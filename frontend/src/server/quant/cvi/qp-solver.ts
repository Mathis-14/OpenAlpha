/**
 * QP solver for CVI calibration using cvxjs (Clarabel interior-point solver).
 *
 * Solves:  min  0.5 x'Px + q'x
 *          s.t. G x <= h
 *               A x  = b
 *
 * Uses the cvxjs library which wraps the Clarabel solver (same solver
 * used by the Python reference implementation via CVXPY).
 */

import {
  variable,
  constant,
  quadForm,
  matmul,
  Problem,
} from "cvxjs";

export interface QPInput {
  /** Positive semidefinite objective matrix (n x n) */
  P: { rows: number; cols: number; get(i: number, j: number): number };
  /** Linear objective vector (n) */
  q: number[];
  /** Inequality constraint matrix (m_ineq x n): G x <= h */
  G: { rows: number; cols: number; get(i: number, j: number): number };
  /** Inequality constraint RHS (m_ineq) */
  h: number[];
  /** Equality constraint matrix (m_eq x n): A x = b */
  A: { rows: number; cols: number; get(i: number, j: number): number };
  /** Equality constraint RHS (m_eq) */
  b: number[];
}

export interface QPResult {
  /** Optimal primal variable */
  x: number[];
  /** Solver status */
  status: "optimal" | "max_iter" | "numerical_error";
  /** Number of iterations */
  iterations: number;
  /** Objective value at solution */
  objectiveValue: number;
  /** Final primal residual */
  primalResidual: number;
  /** Final dual residual */
  dualResidual: number;
}

/** Convert a Matrix-like object to a dense 2D array for cvxjs. */
function toDense(m: { rows: number; cols: number; get(i: number, j: number): number }): number[][] {
  const out: number[][] = [];
  for (let i = 0; i < m.rows; i++) {
    const row: number[] = [];
    for (let j = 0; j < m.cols; j++) {
      row.push(m.get(i, j));
    }
    out.push(row);
  }
  return out;
}

/**
 * Solve a convex QP via cvxjs (Clarabel interior-point method).
 */
export async function solveQP(input: QPInput): Promise<QPResult> {
  const n = input.q.length;
  const mIneq = input.G.rows;
  const mEq = input.A.rows;

  const x = variable(n);

  // Objective: 0.5 x'Px + q'x
  const Pmat = constant(toDense(input.P));
  const qvec = constant(input.q);
  const objective = quadForm(x, Pmat).mul(0.5).add(qvec.dot(x));

  // Build constraints
  const constraints: ReturnType<typeof x.ge>[] = [];

  // Inequality: G x <= h
  if (mIneq > 0) {
    const Gmat = constant(toDense(input.G));
    const hvec = constant(input.h);
    constraints.push(matmul(Gmat, x).le(hvec));
  }

  // Equality: A x = b
  if (mEq > 0) {
    const Amat = constant(toDense(input.A));
    const bvec = constant(input.b);
    constraints.push(matmul(Amat, x).eq(bvec));
  }

  try {
    const solution = await Problem.minimize(objective)
      .subjectTo(constraints)
      .solve();

    if (solution.status === "optimal") {
      // Extract variable values from primal map
      const xValues = new Array<number>(n).fill(0);
      for (const [, vals] of solution.primal ?? []) {
        if (vals.length === n) {
          for (let i = 0; i < n; i++) xValues[i] = vals[i]!;
          break;
        }
      }

      return {
        x: xValues,
        status: "optimal",
        iterations: solution.iterations ?? 0,
        objectiveValue: typeof solution.value === "number" ? solution.value : 0,
        primalResidual: 0,
        dualResidual: 0,
      };
    }

    // Solver didn't find optimal — return what we have
    const xValues = new Array<number>(n).fill(0);
    for (const [, vals] of solution.primal ?? []) {
      if (vals.length === n) {
        for (let i = 0; i < n; i++) xValues[i] = vals[i]!;
        break;
      }
    }

    return {
      x: xValues,
      status: "max_iter",
      iterations: solution.iterations ?? 0,
      objectiveValue: typeof solution.value === "number" ? solution.value : 0,
      primalResidual: 0,
      dualResidual: 0,
    };
  } catch {
    return {
      x: new Array<number>(n).fill(0),
      status: "numerical_error",
      iterations: 0,
      objectiveValue: Infinity,
      primalResidual: Infinity,
      dualResidual: Infinity,
    };
  }
}
