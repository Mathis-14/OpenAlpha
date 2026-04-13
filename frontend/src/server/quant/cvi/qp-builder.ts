/**
 * QP matrix assembly for CVI calibration.
 *
 * Assembles P, q, G, h, A, b from the B-spline basis, market slices, and config.
 * Unlike the Python version (which uses CVXPY symbolic variables), this builds
 * explicit dense matrices suitable for the ADMM solver.
 *
 * Port of: vol-surface-cvi/src/cvi/qp_builder.py
 */

import { Matrix, linspace, clip } from "./matrix";
import type { CVIBasis } from "./basis";
import type { MarketSlice, CVIConfig } from "./types";
import type { QPInput } from "./qp-solver";
import {
  butterflyG,
  butterflyDgDs,
  butterflyDgDv,
  checkD1D2Condition,
  edgeBoundLinearized,
} from "./butterfly";

/** Map from expiry T to the variable offset and count in the QP decision vector. */
export interface VariableMap {
  /** Total number of QP variables */
  totalVars: number;
  /** For each expiry T: { offset, count } of its B-spline weight block */
  weights: Map<number, { offset: number; count: number }>;
  /** For each expiry T: offset + count of s_above slack vars (may be 0) */
  sAbove: Map<number, { offset: number; count: number }>;
  /** For each expiry T: offset + count of s_below slack vars (may be 0) */
  sBelow: Map<number, { offset: number; count: number }>;
  /** For each expiry T: offset + count of u_tv auxiliary vars */
  uTv: Map<number, { offset: number; count: number }>;
}

/**
 * Build the full QP for CVI calibration.
 *
 * @param basis B-spline basis
 * @param slices Market data per expiry (sorted by T)
 * @param config Calibration config
 * @param butterflyParams Optional butterfly parameters from previous iteration
 * @returns { qp, varMap } suitable for the ADMM solver
 */
export function buildCVIQP(
  basis: CVIBasis,
  slices: MarketSlice[],
  config: CVIConfig,
  butterflyParams?: ButterflyParams,
): { qp: QPInput; varMap: VariableMap } {
  const sorted = [...slices].sort((a, b) => a.T - b.T);

  // 1. Compute variable layout
  const varMap = computeVariableMap(basis, sorted);
  const n = varMap.totalVars;

  // 2. Build objective (P, q)
  const P = Matrix.zeros(n, n);
  const q = new Array<number>(n).fill(0);

  // 3. Collect inequality constraints as rows: G x <= h
  const gRows: { row: number[]; rhs: number }[] = [];

  // 4. Collect equality constraints as rows: A x = b
  const aRows: { row: number[]; rhs: number }[] = [];

  // Build objective and constraints per expiry
  for (let si = 0; si < sorted.length; si++) {
    const sl = sorted[si]!;

    buildObjectiveForExpiry(basis, sl, config, varMap, P, q, gRows);
    buildStructuralConstraints(basis, sl, si, sorted, config, varMap, gRows, aRows);
    buildButterflyConstraints(
      basis, sl, config, varMap, gRows,
      butterflyParams,
    );
  }

  // Build calendar constraints (C4, C5)
  buildCalendarConstraints(basis, sorted, config, varMap, gRows);
  buildTailCalendarConstraints(basis, sorted, varMap, gRows);

  // Assemble G, h, A, b matrices
  const G = Matrix.zeros(gRows.length, n);
  const h = new Array<number>(gRows.length);
  for (let i = 0; i < gRows.length; i++) {
    const row = gRows[i]!;
    for (let j = 0; j < n; j++) {
      G.set(i, j, row.row[j]!);
    }
    h[i] = row.rhs;
  }

  const mEq = aRows.length;
  const A = Matrix.zeros(mEq, n);
  const b = new Array<number>(mEq);
  for (let i = 0; i < mEq; i++) {
    const row = aRows[i]!;
    for (let j = 0; j < n; j++) {
      A.set(i, j, row.row[j]!);
    }
    b[i] = row.rhs;
  }

  return { qp: { P, q, G, h, A, b }, varMap };
}

function computeVariableMap(
  basis: CVIBasis,
  slices: MarketSlice[],
): VariableMap {
  let offset = 0;
  const weights = new Map<number, { offset: number; count: number }>();
  const sAbove = new Map<number, { offset: number; count: number }>();
  const sBelow = new Map<number, { offset: number; count: number }>();
  const uTv = new Map<number, { offset: number; count: number }>();

  // B-spline weights for each expiry
  for (const sl of slices) {
    weights.set(sl.T, { offset, count: basis.nBasis });
    offset += basis.nBasis;
  }

  // Slack variables
  for (const sl of slices) {
    const nAskOnly = sl.has_ask.reduce((c, v, i) => c + (v && !sl.has_bid[i]! ? 1 : 0), 0);
    sAbove.set(sl.T, { offset, count: nAskOnly });
    offset += nAskOnly;

    const nBidOnly = sl.has_bid.reduce((c, v, i) => c + (v && !sl.has_ask[i]! ? 1 : 0), 0);
    sBelow.set(sl.T, { offset, count: nBidOnly });
    offset += nBidOnly;

    const nTv = basis.n - 1;
    uTv.set(sl.T, { offset, count: nTv });
    offset += nTv;
  }

  return { totalVars: offset, weights, sAbove, sBelow, uTv };
}

/**
 * Build objective terms for a single expiry.
 * Modifies P, q in place and adds slack constraints to gRows.
 */
function buildObjectiveForExpiry(
  basis: CVIBasis,
  sl: MarketSlice,
  config: CVIConfig,
  varMap: VariableMap,
  P: Matrix,
  q: number[],
  gRows: { row: number[]; rhs: number }[],
): void {
  const T = sl.T;
  const n = varMap.totalVars;
  const vStar = sl.sigma_star ** 2;
  const wOff = varMap.weights.get(T)!.offset;
  const nb = basis.nBasis;

  // Identify option groups
  const hasBoth: number[] = [];
  const askOnly: number[] = [];
  const bidOnly: number[] = [];
  for (let i = 0; i < sl.has_bid.length; i++) {
    if (sl.has_bid[i] && sl.has_ask[i]) hasBoth.push(i);
    else if (sl.has_ask[i] && !sl.has_bid[i]) askOnly.push(i);
    else if (sl.has_bid[i] && !sl.has_ask[i]) bidOnly.push(i);
  }

  let qT = 1.0; // penalty weight scaling factor

  // Term 1: Least-squares fit to mid
  if (hasBoth.length > 0) {
    const zMid = hasBoth.map((i) => sl.z[i]!);
    const vMid = hasBoth.map((i) => sl.v_mid[i]!);
    const spreads = hasBoth.map((i) => Math.max(sl.v_ask[i]! - sl.v_bid[i]!, 1e-10));
    const penWeights = spreads.map((s) => 1 / (s * s));
    const nMid = hasBoth.length;

    const BMid = basis.designMatrix(zMid, 0); // nMid x nb

    // P += (1/N_mid) * B' diag(penWeights) B  (in the w_T block)
    // q += (1/N_mid) * (-2) * B' diag(penWeights) v_mid  (only the linear part)
    for (let p = 0; p < nMid; p++) {
      const pw = penWeights[p]! / nMid;
      for (let i = 0; i < nb; i++) {
        // Linear term: -2 * pw * B[p,i] * v_mid[p] -> but we use 0.5*x'Px + q'x form
        // The quadratic form is pw * (B@w - v)^2 = pw * w'B'Bw - 2*pw*v*B'w + pw*v^2
        // P contribution: 2 * pw * B[p,i] * B[p,j]  (factor of 2 because P is in 0.5*x'Px)
        q[wOff + i] += -2 * pw * BMid[p]![i]! * vMid[p]!;
        for (let j = 0; j < nb; j++) {
          P.set(
            wOff + i, wOff + j,
            P.get(wOff + i, wOff + j) + 2 * pw * BMid[p]![i]! * BMid[p]![j]!,
          );
        }
      }
    }

    qT = penWeights.reduce((s, v) => s + v, 0);
  }

  // Term 2: Above-ask penalty
  if (askOnly.length > 0) {
    const sAbInfo = varMap.sAbove.get(T)!;
    const zAsk = askOnly.map((i) => sl.z[i]!);
    const vAskVals = askOnly.map((i) => sl.v_ask[i]!);
    const vegaAskVals = askOnly.map((i) => sl.vega_ask[i]!);
    const vegaSum = vegaAskVals.reduce((s, v) => s + v, 0) + 1e-20;
    const askWeights = vegaAskVals.map((v) => (qT * v) / vegaSum);
    const nAsk = askOnly.length;

    const BAsk = basis.designMatrix(zAsk, 0);

    // P contribution for s_above: (1/N_ask) * askWeights[i] * s_above_i^2
    for (let p = 0; p < nAsk; p++) {
      const pw = askWeights[p]! / nAsk;
      const sIdx = sAbInfo.offset + p;
      P.set(sIdx, sIdx, P.get(sIdx, sIdx) + 2 * pw);
    }

    // Constraint: s_above >= B @ w - v_ask  →  B @ w - s_above <= v_ask
    for (let p = 0; p < nAsk; p++) {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = BAsk[p]![j]!;
      }
      row[sAbInfo.offset + p] = -1; // -s_above_i
      gRows.push({ row, rhs: vAskVals[p]! });
    }

    // Non-negativity: -s_above <= 0
    for (let p = 0; p < nAsk; p++) {
      const row = new Array<number>(n).fill(0);
      row[sAbInfo.offset + p] = -1;
      gRows.push({ row, rhs: 0 });
    }
  }

  // Term 3: Below-bid penalty
  if (bidOnly.length > 0) {
    const sBlInfo = varMap.sBelow.get(T)!;
    const zBid = bidOnly.map((i) => sl.z[i]!);
    const vBidVals = bidOnly.map((i) => sl.v_bid[i]!);
    const vegaBidVals = bidOnly.map((i) => sl.vega_bid[i]!);
    const vegaSum = vegaBidVals.reduce((s, v) => s + v, 0) + 1e-20;
    const bidWeights = vegaBidVals.map((v) => (qT * v) / vegaSum);
    const nBid = bidOnly.length;

    const BBid = basis.designMatrix(zBid, 0);

    for (let p = 0; p < nBid; p++) {
      const pw = bidWeights[p]! / nBid;
      const sIdx = sBlInfo.offset + p;
      P.set(sIdx, sIdx, P.get(sIdx, sIdx) + 2 * pw);
    }

    // Constraint: s_below >= v_bid - B @ w  →  -B @ w - s_below <= -v_bid
    for (let p = 0; p < nBid; p++) {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = -BBid[p]![j]!;
      }
      row[sBlInfo.offset + p] = -1;
      gRows.push({ row, rhs: -vBidVals[p]! });
    }

    // Non-negativity: -s_below <= 0
    for (let p = 0; p < nBid; p++) {
      const row = new Array<number>(n).fill(0);
      row[sBlInfo.offset + p] = -1;
      gRows.push({ row, rhs: 0 });
    }
  }

  // Term 4: TV regularization on normalized convexities
  const uInfo = varMap.uTv.get(T)!;
  const B2Knots = basis.designMatrix(basis.knots, 2); // n x nb
  const nTv = basis.n - 1;

  // diff_B2[i] = (B2[i+1] - B2[i]) / v_star
  // Constraints: u_i >= diff_c_i  and  u_i >= -diff_c_i  (where diff_c = diff_B2 @ w)
  // In <= form: diff_B2 @ w - u <= 0  and  -diff_B2 @ w - u <= 0
  for (let i = 0; i < nTv; i++) {
    // u_i >= (B2[i+1] - B2[i]) / v_star @ w  →  (B2[i+1]-B2[i])/v_star @ w - u_i <= 0
    const rowPos = new Array<number>(n).fill(0);
    const rowNeg = new Array<number>(n).fill(0);
    for (let j = 0; j < nb; j++) {
      const diff = (B2Knots[i + 1]![j]! - B2Knots[i]![j]!) / vStar;
      rowPos[wOff + j] = diff;
      rowNeg[wOff + j] = -diff;
    }
    rowPos[uInfo.offset + i] = -1;
    rowNeg[uInfo.offset + i] = -1;
    gRows.push({ row: rowPos, rhs: 0 });
    gRows.push({ row: rowNeg, rhs: 0 });
  }

  // Non-negativity: -u_i <= 0
  for (let i = 0; i < nTv; i++) {
    const row = new Array<number>(n).fill(0);
    row[uInfo.offset + i] = -1;
    gRows.push({ row, rhs: 0 });
  }

  // Linear objective: lambda * sum(u)
  for (let i = 0; i < nTv; i++) {
    q[uInfo.offset + i] += config.lambda_reg;
  }
}

function buildStructuralConstraints(
  basis: CVIBasis,
  sl: MarketSlice,
  sliceIndex: number,
  allSlices: MarketSlice[],
  config: CVIConfig,
  varMap: VariableMap,
  gRows: { row: number[]; rhs: number }[],
  aRows: { row: number[]; rhs: number }[],
): void {
  const T = sl.T;
  const n = varMap.totalVars;
  const vStar = sl.sigma_star ** 2;
  const wOff = varMap.weights.get(T)!.offset;
  const nb = basis.nBasis;
  const z0 = basis.knots[0]!;
  const zn = basis.knots[basis.knots.length - 1]!;

  // C1: Linear extrapolation (equality)
  // B''(z_0) @ w = 0,  B''(z_n) @ w = 0
  const B2Left = basis.designMatrix([z0], 2)[0]!;
  const B2Right = basis.designMatrix([zn], 2)[0]!;
  {
    const rowLeft = new Array<number>(n).fill(0);
    const rowRight = new Array<number>(n).fill(0);
    for (let j = 0; j < nb; j++) {
      rowLeft[wOff + j] = B2Left[j]!;
      rowRight[wOff + j] = B2Right[j]!;
    }
    aRows.push({ row: rowLeft, rhs: 0 });
    aRows.push({ row: rowRight, rhs: 0 });
  }

  // C2: Variance positivity (first expiry only)
  // B(z_grid) @ w >= 0  →  -B(z_grid) @ w <= 0
  if (sliceIndex === 0) {
    const zGrid = linspace(z0, zn, 100);
    const BGrid = basis.designMatrix(zGrid, 0);
    for (let p = 0; p < zGrid.length; p++) {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = -BGrid[p]![j]!;
      }
      gRows.push({ row, rhs: 0 });
    }
  }

  // C3: Positive tails
  // B'(z_0) @ w <= 0,  -B'(z_n) @ w <= 0
  const B1Left = basis.designMatrix([z0], 1)[0]!;
  const B1Right = basis.designMatrix([zn], 1)[0]!;
  {
    const rowLeftLe = new Array<number>(n).fill(0);
    const rowRightGe = new Array<number>(n).fill(0);
    for (let j = 0; j < nb; j++) {
      rowLeftLe[wOff + j] = B1Left[j]!;
      rowRightGe[wOff + j] = -B1Right[j]!;
    }
    gRows.push({ row: rowLeftLe, rhs: 0 });
    gRows.push({ row: rowRightGe, rhs: 0 });
  }

  // C6: Lee's tail slope bounds
  // B'(z_n) @ w <= lee_bound,  -B'(z_0) @ w <= lee_bound
  const leeBound = 0.999 * 2.0 * Math.sqrt(vStar / T);
  {
    const rowRight = new Array<number>(n).fill(0);
    const rowLeft = new Array<number>(n).fill(0);
    for (let j = 0; j < nb; j++) {
      rowRight[wOff + j] = B1Right[j]!;
      rowLeft[wOff + j] = -B1Left[j]!;
    }
    gRows.push({ row: rowRight, rhs: leeBound });
    gRows.push({ row: rowLeft, rhs: leeBound });
  }
}

function buildCalendarConstraints(
  basis: CVIBasis,
  slices: MarketSlice[],
  config: CVIConfig,
  varMap: VariableMap,
  gRows: { row: number[]; rhs: number }[],
): void {
  const n = varMap.totalVars;
  const r = config.n_calendar_strikes;
  const z0 = basis.knots[0]!;
  const zn = basis.knots[basis.knots.length - 1]!;
  const nb = basis.nBasis;

  for (let idx = 0; idx < slices.length - 1; idx++) {
    const slJ = slices[idx]!;
    const slNext = slices[idx + 1]!;
    const wJOff = varMap.weights.get(slJ.T)!.offset;
    const wNextOff = varMap.weights.get(slNext.T)!.offset;

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
    // → T_j * B_j @ w_j - T_{j+1} * B_next @ w_next <= 0
    for (let p = 0; p < r; p++) {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wJOff + j] += slJ.T * BJ[p]![j]!;
        row[wNextOff + j] -= slNext.T * BNext[p]![j]!;
      }
      gRows.push({ row, rhs: 0 });
    }
  }
}

function buildTailCalendarConstraints(
  basis: CVIBasis,
  slices: MarketSlice[],
  varMap: VariableMap,
  gRows: { row: number[]; rhs: number }[],
): void {
  const n = varMap.totalVars;
  const z0 = basis.knots[0]!;
  const zn = basis.knots[basis.knots.length - 1]!;
  const nb = basis.nBasis;
  const B1Left = basis.designMatrix([z0], 1)[0]!;
  const B1Right = basis.designMatrix([zn], 1)[0]!;

  for (let idx = 0; idx < slices.length - 1; idx++) {
    const slJ = slices[idx]!;
    const slNext = slices[idx + 1]!;
    const wJOff = varMap.weights.get(slJ.T)!.offset;
    const wNextOff = varMap.weights.get(slNext.T)!.offset;

    const alphaJ = Math.sqrt(slJ.T / (slJ.sigma_star ** 2));
    const alphaNext = Math.sqrt(slNext.T / (slNext.sigma_star ** 2));

    // C5 left: alpha_j * B1_left @ w_j >= alpha_next * B1_left @ w_next
    // → alpha_next * B1_left @ w_next - alpha_j * B1_left @ w_j <= 0
    {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wNextOff + j] += alphaNext * B1Left[j]!;
        row[wJOff + j] -= alphaJ * B1Left[j]!;
      }
      gRows.push({ row, rhs: 0 });
    }

    // C5 right: alpha_j * B1_right @ w_j <= alpha_next * B1_right @ w_next
    // → alpha_j * B1_right @ w_j - alpha_next * B1_right @ w_next <= 0
    {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wJOff + j] += alphaJ * B1Right[j]!;
        row[wNextOff + j] -= alphaNext * B1Right[j]!;
      }
      gRows.push({ row, rhs: 0 });
    }
  }
}

/** Butterfly linearization parameters for one expiry. */
export interface ExpiryButterflyParams {
  /** Interior butterfly constraint matrix (nBf x nBasis) */
  ABf: number[][];
  /** Interior butterfly RHS (nBf) */
  bBf: number[];
  /** Left edge constraint vector (nBasis) */
  aEdgeLeft: number[];
  /** Left edge RHS */
  bEdgeLeft: number;
  /** Right edge constraint vector (nBasis) */
  aEdgeRight: number[];
  /** Right edge RHS */
  bEdgeRight: number;
}

export type ButterflyParams = Map<number, ExpiryButterflyParams>;

/**
 * Compute butterfly linearization parameters from previous weights.
 */
export function computeButterflyParams(
  basis: CVIBasis,
  slices: MarketSlice[],
  config: CVIConfig,
  prevWeights: Map<number, number[]>,
): ButterflyParams {
  const params: ButterflyParams = new Map();
  const z0 = basis.knots[0]!;
  const zn = basis.knots[basis.knots.length - 1]!;
  const nBf = config.n_butterfly_points;
  const nb = basis.nBasis;

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
    const wPrev = prevWeights.get(T)!;

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

    // A_bf[p,:] = (1/v_star)*B2[p,:] - beta_1[p]*(1/v_star)*B1[p,:] - beta_2[p]*B0[p,:]
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

    // Edge constraints
    let aEdgeLeft = new Array<number>(nb).fill(0);
    let bEdgeLeft = -100;
    let aEdgeRight = new Array<number>(nb).fill(0);
    let bEdgeRight = 100;

    // Right edge (z_n): s <= s_lower(v)
    const kRight = zn * sl.sigma_star * Math.sqrt(T);
    let vRefRight = 0;
    for (let j = 0; j < nb; j++) vRefRight += B0Right[j]! * wPrev[j]!;
    vRefRight = Math.max(vRefRight, 1e-10);

    if (checkD1D2Condition(vRefRight, kRight, T)) {
      const { boundRef, dsDv } = edgeBoundLinearized(vRefRight, kRight, vStar, T, "lower");
      aEdgeRight = B1Right.map((v, j) => (1 / vStar) * v - dsDv * B0Right[j]!);
      bEdgeRight = boundRef - dsDv * vRefRight;
    }

    // Left edge (z_0): s >= s_upper(v)
    const kLeft = z0 * sl.sigma_star * Math.sqrt(T);
    let vRefLeft = 0;
    for (let j = 0; j < nb; j++) vRefLeft += B0Left[j]! * wPrev[j]!;
    vRefLeft = Math.max(vRefLeft, 1e-10);

    if (checkD1D2Condition(vRefLeft, kLeft, T)) {
      const { boundRef, dsDv } = edgeBoundLinearized(vRefLeft, kLeft, vStar, T, "upper");
      aEdgeLeft = B1Left.map((v, j) => (1 / vStar) * v - dsDv * B0Left[j]!);
      bEdgeLeft = boundRef - dsDv * vRefLeft;
    }

    params.set(T, { ABf, bBf, aEdgeLeft, bEdgeLeft, aEdgeRight, bEdgeRight });
  }

  return params;
}

function buildButterflyConstraints(
  basis: CVIBasis,
  sl: MarketSlice,
  config: CVIConfig,
  varMap: VariableMap,
  gRows: { row: number[]; rhs: number }[],
  butterflyParams?: ButterflyParams,
): void {
  const T = sl.T;
  const n = varMap.totalVars;
  const vStar = sl.sigma_star ** 2;
  const wOff = varMap.weights.get(T)!.offset;
  const nb = basis.nBasis;
  const nBf = config.n_butterfly_points;
  const z0 = basis.knots[0]!;
  const zn = basis.knots[basis.knots.length - 1]!;

  if (butterflyParams && butterflyParams.has(T)) {
    const bp = butterflyParams.get(T)!;

    // C7: A_bf @ w >= b_bf  →  -A_bf @ w <= -b_bf
    for (let p = 0; p < bp.ABf.length; p++) {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = -bp.ABf[p]![j]!;
      }
      gRows.push({ row, rhs: -bp.bBf[p]! });
    }

    // C8 left: a_edge_left @ w >= b_edge_left  →  -a_edge_left @ w <= -b_edge_left
    {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = -bp.aEdgeLeft[j]!;
      }
      gRows.push({ row, rhs: -bp.bEdgeLeft });
    }

    // C8 right: a_edge_right @ w <= b_edge_right
    {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = bp.aEdgeRight[j]!;
      }
      gRows.push({ row, rhs: bp.bEdgeRight });
    }
  } else {
    // Trivially satisfied initial butterfly constraints
    const zBfInit = linspace(z0, zn, nBf + 2).slice(1, -1);
    const B2Init = basis.designMatrix(zBfInit, 2);

    // C7: (1/v_star) * B2 @ w >= -100  →  -(1/v_star) * B2 @ w <= 100
    for (let p = 0; p < nBf; p++) {
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = -(1 / vStar) * B2Init[p]![j]!;
      }
      gRows.push({ row, rhs: 100 });
    }

    // C8 left: trivially satisfied
    {
      const B1LeftInit = basis.designMatrix([z0], 1)[0]!;
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = -(1 / vStar) * B1LeftInit[j]!;
      }
      gRows.push({ row, rhs: 100 });
    }

    // C8 right: trivially satisfied
    {
      const B1RightInit = basis.designMatrix([zn], 1)[0]!;
      const row = new Array<number>(n).fill(0);
      for (let j = 0; j < nb; j++) {
        row[wOff + j] = (1 / vStar) * B1RightInit[j]!;
      }
      gRows.push({ row, rhs: 100 });
    }
  }
}
