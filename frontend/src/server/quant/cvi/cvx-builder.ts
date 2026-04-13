/**
 * CVI QP builder using cvxjs (Clarabel solver).
 *
 * Direct port of the Python CVXPY-based builder (qp_builder.py).
 * Uses cvxjs's symbolic variable API instead of assembling P/q/G/h matrices.
 *
 * This gives Clarabel proper problem structure for efficient solving.
 */

import {
  variable,
  constant,
  matmul,
  Problem,
  sum,
  mul,
  sumSquares,
  type Expr,
} from "cvxjs";
// Note: sum() is used for single-argument sum (vector → scalar)
import type { CVIBasis } from "./basis";
import type { MarketSlice, CVIConfig } from "./types";
import { linspace, clip } from "./matrix";
import {
  butterflyG,
  butterflyDgDs,
  butterflyDgDv,
  checkD1D2Condition,
  edgeBoundLinearized,
} from "./butterfly";

/** Per-expiry cvxjs variables. */
interface SliceVars {
  w: ReturnType<typeof variable>;
  sAbove?: ReturnType<typeof variable>;
  sBelow?: ReturnType<typeof variable>;
  uTv: ReturnType<typeof variable>;
}

/** Result from solving the CVI QP. */
export interface CVXResult {
  /** B-spline weights per expiry */
  weights: Map<number, number[]>;
  /** Solver status */
  status: string;
  /** Objective value */
  objectiveValue: number;
}

/**
 * Build and solve the CVI QP using cvxjs (Clarabel).
 *
 * This mirrors the Python CVIQPBuilder class.
 */
export async function solveCVIQP(
  basis: CVIBasis,
  slices: MarketSlice[],
  config: CVIConfig,
  prevWeights?: Map<number, number[]>,
): Promise<CVXResult> {
  const sorted = [...slices].sort((a, b) => a.T - b.T);
  const nb = basis.nBasis;
  const z0 = basis.knots[0]!;
  const zn = basis.knots[basis.knots.length - 1]!;

  // Decision variables per expiry
  const vars = new Map<number, SliceVars>();
  for (const sl of sorted) {
    vars.set(sl.T, {
      w: variable(nb),
      uTv: variable(basis.n - 1),
    });
  }

  // Objective terms and constraints
  const terms: Expr[] = [];
  const constraints: ReturnType<typeof variable.prototype.ge>[] = [];

  // ── Objective + slack constraints per expiry ──
  for (const sl of sorted) {
    const T = sl.T;
    const vStar = sl.sigma_star ** 2;
    const sv = vars.get(T)!;
    const wVar = sv.w;

    // Identify option groups
    const hasBothIdx: number[] = [];
    const askOnlyIdx: number[] = [];
    const bidOnlyIdx: number[] = [];
    for (let i = 0; i < sl.has_bid.length; i++) {
      if (sl.has_bid[i] && sl.has_ask[i]) hasBothIdx.push(i);
      else if (sl.has_ask[i] && !sl.has_bid[i]) askOnlyIdx.push(i);
      else if (sl.has_bid[i] && !sl.has_ask[i]) bidOnlyIdx.push(i);
    }

    let qT = 1.0;

    // Term 1: Least-squares fit to mid
    if (hasBothIdx.length > 0) {
      const zMid = hasBothIdx.map((i) => sl.z[i]!);
      const vMid = hasBothIdx.map((i) => sl.v_mid[i]!);
      const spreads = hasBothIdx.map((i) =>
        Math.max(sl.v_ask[i]! - sl.v_bid[i]!, 1e-10),
      );
      const penWeights = spreads.map((s) => 1 / (s * s));
      const nMid = hasBothIdx.length;

      const BMid = basis.designMatrix(zMid, 0);
      const BMatConst = constant(BMid);
      const residual = matmul(BMatConst, wVar).sub(constant(vMid));

      // Weighted sum of squares: (1/N) * sum(pen * residual^2)
      const sqPenWeights = penWeights.map((p) => Math.sqrt(p / nMid));
      const weightedResidual = mul(constant(sqPenWeights), residual);
      terms.push(sumSquares(weightedResidual));

      qT = penWeights.reduce((s, v) => s + v, 0);
    }

    // Term 2: Above-ask penalty
    if (askOnlyIdx.length > 0) {
      const zAsk = askOnlyIdx.map((i) => sl.z[i]!);
      const vAskVals = askOnlyIdx.map((i) => sl.v_ask[i]!);
      const vegaAskVals = askOnlyIdx.map((i) => sl.vega_ask[i]!);
      const vegaSum = vegaAskVals.reduce((s, v) => s + v, 0) + 1e-20;
      const askWeights = vegaAskVals.map((v) => (qT * v) / vegaSum);
      const nAsk = askOnlyIdx.length;

      const sAbove = variable(nAsk);
      sv.sAbove = sAbove;

      const BAsk = basis.designMatrix(zAsk, 0);
      constraints.push(sAbove.ge(0));
      constraints.push(
        sAbove.ge(matmul(constant(BAsk), wVar).sub(constant(vAskVals))),
      );

      const sqAskWeights = askWeights.map((w) => Math.sqrt(w / nAsk));
      terms.push(sumSquares(mul(constant(sqAskWeights), sAbove)));
    }

    // Term 3: Below-bid penalty
    if (bidOnlyIdx.length > 0) {
      const zBid = bidOnlyIdx.map((i) => sl.z[i]!);
      const vBidVals = bidOnlyIdx.map((i) => sl.v_bid[i]!);
      const vegaBidVals = bidOnlyIdx.map((i) => sl.vega_bid[i]!);
      const vegaSum = vegaBidVals.reduce((s, v) => s + v, 0) + 1e-20;
      const bidWeights = vegaBidVals.map((v) => (qT * v) / vegaSum);
      const nBid = bidOnlyIdx.length;

      const sBelow = variable(nBid);
      sv.sBelow = sBelow;

      const BBid = basis.designMatrix(zBid, 0);
      constraints.push(sBelow.ge(0));
      constraints.push(
        sBelow.ge(constant(vBidVals).sub(matmul(constant(BBid), wVar))),
      );

      const sqBidWeights = bidWeights.map((w) => Math.sqrt(w / nBid));
      terms.push(sumSquares(mul(constant(sqBidWeights), sBelow)));
    }

    // Term 4: TV regularization
    const uTv = sv.uTv;
    const B2Knots = basis.designMatrix(basis.knots, 2);
    const nTv = basis.n - 1;

    // diff_B2[i] = (B2[i+1] - B2[i]) / vStar
    const diffB2: number[][] = [];
    for (let i = 0; i < nTv; i++) {
      const row: number[] = [];
      for (let j = 0; j < nb; j++) {
        row.push((B2Knots[i + 1]![j]! - B2Knots[i]![j]!) / vStar);
      }
      diffB2.push(row);
    }

    const diffC = matmul(constant(diffB2), wVar);
    constraints.push(uTv.ge(diffC));
    constraints.push(uTv.ge(diffC.mul(-1)));
    constraints.push(uTv.ge(0));

    terms.push(sum(uTv).mul(config.lambda_reg));
  }

  // ── Structural constraints C1-C6 ──
  for (let si = 0; si < sorted.length; si++) {
    const sl = sorted[si]!;
    const wVar = vars.get(sl.T)!.w;
    const vStar = sl.sigma_star ** 2;

    // C1: Linear extrapolation (c(z0) = c(zn) = 0)
    const B2Left = basis.designMatrix([z0], 2);
    const B2Right = basis.designMatrix([zn], 2);
    constraints.push(matmul(constant(B2Left), wVar).eq(0));
    constraints.push(matmul(constant(B2Right), wVar).eq(0));

    // C2: Variance positivity (first expiry only, same as Python)
    if (si === 0) {
      const zGrid = linspace(z0, zn, 100);
      const BGrid = basis.designMatrix(zGrid, 0);
      constraints.push(matmul(constant(BGrid), wVar).ge(0));
    }

    // C3: Positive tails
    const B1Left = basis.designMatrix([z0], 1);
    const B1Right = basis.designMatrix([zn], 1);
    constraints.push(matmul(constant(B1Left), wVar).le(0));
    constraints.push(matmul(constant(B1Right), wVar).ge(0));

    // C6: Lee's tail slope bounds
    const leeBound = 0.999 * 2.0 * Math.sqrt(vStar / sl.T);
    constraints.push(matmul(constant(B1Right), wVar).le(leeBound));
    constraints.push(matmul(constant(B1Left), wVar).ge(-leeBound));
  }

  // ── C4: Calendar spread constraints ──
  const r = config.n_calendar_strikes;
  for (let idx = 0; idx < sorted.length - 1; idx++) {
    const slJ = sorted[idx]!;
    const slNext = sorted[idx + 1]!;
    const wJ = vars.get(slJ.T)!.w;
    const wNext = vars.get(slNext.T)!.w;

    const zCal = linspace(z0, zn, r);
    const kCal = zCal.map((z) => z * slJ.sigma_star * Math.sqrt(slJ.T));
    const logFRatio = Math.log(slJ.F / slNext.F);
    const kAdj = kCal.map((k) => k + logFRatio);
    const zAdj = kAdj.map((k) =>
      clip(k / (slNext.sigma_star * Math.sqrt(slNext.T)), z0, zn),
    );

    const BJ = basis.designMatrix(zCal, 0);
    const BNext = basis.designMatrix(zAdj, 0);

    // T_j * B_j @ w_j <= T_{j+1} * B_next @ w_next
    const lhs = matmul(constant(BJ.map((row) => row.map((v) => v * slJ.T))), wJ);
    const rhs = matmul(
      constant(BNext.map((row) => row.map((v) => v * slNext.T))),
      wNext,
    );
    constraints.push(lhs.le(rhs));
  }

  // ── C5: Tail calendar constraints ──
  const B1LeftAll = basis.designMatrix([z0], 1);
  const B1RightAll = basis.designMatrix([zn], 1);
  for (let idx = 0; idx < sorted.length - 1; idx++) {
    const slJ = sorted[idx]!;
    const slNext = sorted[idx + 1]!;
    const wJ = vars.get(slJ.T)!.w;
    const wNext = vars.get(slNext.T)!.w;

    const alphaJ = Math.sqrt(slJ.T / (slJ.sigma_star ** 2));
    const alphaNext = Math.sqrt(slNext.T / (slNext.sigma_star ** 2));

    // Left: alpha_j * B1_left @ w_j >= alpha_next * B1_left @ w_next
    constraints.push(
      matmul(constant(B1LeftAll.map((r) => r.map((v) => v * alphaJ))), wJ).ge(
        matmul(constant(B1LeftAll.map((r) => r.map((v) => v * alphaNext))), wNext),
      ),
    );

    // Right: alpha_j * B1_right @ w_j <= alpha_next * B1_right @ w_next
    constraints.push(
      matmul(constant(B1RightAll.map((r) => r.map((v) => v * alphaJ))), wJ).le(
        matmul(constant(B1RightAll.map((r) => r.map((v) => v * alphaNext))), wNext),
      ),
    );
  }

  // ── C7/C8: Butterfly constraints (linearized, from iteration 1+) ──
  if (prevWeights) {
    buildButterflyConstraints(
      basis, sorted, config, vars, constraints, prevWeights,
    );
  }

  // ── Solve ──
  let objective: Expr = constant(0);
  for (const term of terms) {
    objective = objective.add(term);
  }
  const solvePromise = Problem.minimize(objective)
    .subjectTo(constraints)
    .solve();
  let timerId: ReturnType<typeof setTimeout>;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = setTimeout(() => reject(new Error("CVI solver timeout (45s)")), 45_000);
  });
  let solution: Awaited<typeof solvePromise>;
  try {
    solution = await Promise.race([solvePromise, timeoutPromise]);
  } finally {
    clearTimeout(timerId!);
  }

  // Extract weights from primal map
  // Weight variables have length nb and are created first (in sorted order)
  const weights = new Map<number, number[]>();
  if (solution.status === "optimal" && solution.primal) {
    const allVals: Float64Array[] = [];
    for (const [, vals] of solution.primal) {
      allVals.push(vals);
    }
    // Weight variables have length nb; collect them in order
    let wIdx = 0;
    for (const sl of sorted) {
      while (wIdx < allVals.length && allVals[wIdx]!.length !== nb) {
        wIdx++;
      }
      if (wIdx < allVals.length) {
        weights.set(sl.T, Array.from(allVals[wIdx]!));
        wIdx++;
      }
    }
  }

  return {
    weights,
    status: solution.status,
    objectiveValue: typeof solution.value === "number" ? solution.value : 0,
  };
}

function buildButterflyConstraints(
  basis: CVIBasis,
  slices: MarketSlice[],
  config: CVIConfig,
  vars: Map<number, SliceVars>,
  constraints: ReturnType<typeof variable.prototype.ge>[],
  prevWeights: Map<number, number[]>,
): void {
  const z0 = basis.knots[0]!;
  const zn = basis.knots[basis.knots.length - 1]!;
  const nb = basis.nBasis;
  const nBf = config.n_butterfly_points;

  const zBf = linspace(z0, zn, nBf + 2).slice(1, -1);
  const B0Bf = basis.designMatrix(zBf, 0);
  const B1Bf = basis.designMatrix(zBf, 1);
  const B2Bf = basis.designMatrix(zBf, 2);

  const B0Left = basis.designMatrix([z0], 0)[0]!;
  const B1Left = basis.designMatrix([z0], 1)[0]!;
  const B0Right = basis.designMatrix([zn], 0)[0]!;
  const B1Right = basis.designMatrix([zn], 1)[0]!;

  for (const sl of slices) {
    const T = sl.T;
    const vStar = sl.sigma_star ** 2;
    const wVar = vars.get(T)!.w;
    const wPrev = prevWeights.get(T);
    if (!wPrev) continue;

    // Reference values at butterfly grid
    const vRef: number[] = [];
    const sRef: number[] = [];
    const kBf: number[] = [];
    for (let p = 0; p < nBf; p++) {
      let v = 0;
      let s = 0;
      for (let j = 0; j < nb; j++) {
        v += B0Bf[p]![j]! * wPrev[j]!;
        s += B1Bf[p]![j]! * wPrev[j]!;
      }
      vRef.push(Math.max(v, 1e-10));
      sRef.push(s / vStar);
      kBf.push(zBf[p]! * sl.sigma_star * Math.sqrt(T));
    }

    const beta0 = butterflyG(vRef, sRef, kBf, vStar, T);
    const beta1 = butterflyDgDs(vRef, sRef, kBf, vStar, T);
    const beta2 = butterflyDgDv(vRef, sRef, kBf, vStar, T);

    // C7: A_bf @ w >= b_bf (interior butterfly)
    const ABf: number[][] = [];
    const bBf: number[] = [];
    for (let p = 0; p < nBf; p++) {
      const row: number[] = [];
      for (let j = 0; j < nb; j++) {
        row.push(
          (1 / vStar) * B2Bf[p]![j]! -
          (beta1[p]! / vStar) * B1Bf[p]![j]! -
          beta2[p]! * B0Bf[p]![j]!,
        );
      }
      ABf.push(row);
      bBf.push(beta0[p]! - beta1[p]! * sRef[p]! - beta2[p]! * vRef[p]!);
    }

    // Filter out rows with NaN
    const validRows: number[][] = [];
    const validRhs: number[] = [];
    for (let p = 0; p < nBf; p++) {
      if (ABf[p]!.every((v) => isFinite(v)) && isFinite(bBf[p]!)) {
        validRows.push(ABf[p]!);
        validRhs.push(bBf[p]!);
      }
    }

    if (validRows.length > 0) {
      constraints.push(
        matmul(constant(validRows), wVar).ge(constant(validRhs)),
      );
    }

    // C8: Edge constraints
    // Right edge: s <= s_lower(v)
    const kRight = zn * sl.sigma_star * Math.sqrt(T);
    let vRefRight = 0;
    for (let j = 0; j < nb; j++) vRefRight += B0Right[j]! * wPrev[j]!;
    vRefRight = Math.max(vRefRight, 1e-10);

    if (checkD1D2Condition(vRefRight, kRight, T)) {
      const { boundRef, dsDv } = edgeBoundLinearized(vRefRight, kRight, vStar, T, "lower");
      if (isFinite(boundRef) && isFinite(dsDv)) {
        const aEdge = B1Right.map((v, j) => (1 / vStar) * v - dsDv * B0Right[j]!);
        const bEdge = boundRef - dsDv * vRefRight;
        if (aEdge.every(isFinite) && isFinite(bEdge)) {
          constraints.push(
            matmul(constant([aEdge]), wVar).le(bEdge),
          );
        }
      }
    }

    // Left edge: s >= s_upper(v)
    const kLeft = z0 * sl.sigma_star * Math.sqrt(T);
    let vRefLeft = 0;
    for (let j = 0; j < nb; j++) vRefLeft += B0Left[j]! * wPrev[j]!;
    vRefLeft = Math.max(vRefLeft, 1e-10);

    if (checkD1D2Condition(vRefLeft, kLeft, T)) {
      const { boundRef, dsDv } = edgeBoundLinearized(vRefLeft, kLeft, vStar, T, "upper");
      if (isFinite(boundRef) && isFinite(dsDv)) {
        const aEdge = B1Left.map((v, j) => (1 / vStar) * v - dsDv * B0Left[j]!);
        const bEdge = boundRef - dsDv * vRefLeft;
        if (aEdge.every(isFinite) && isFinite(bEdge)) {
          constraints.push(
            matmul(constant([aEdge]), wVar).ge(bEdge),
          );
        }
      }
    }
  }
}
