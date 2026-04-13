/**
 * CVI Basis: cubic B-spline basis with CVI ↔ B-spline parameter transforms.
 *
 * CVI parameters are [v(0), dv/dz(0), d²v/dz²(z_0), ..., d²v/dz²(z_{n-1})]
 * which map bijectively to B-spline weights via the transform matrix M.
 *
 * Port of: vol-surface-cvi/src/cvi/basis.py
 */

import { Matrix } from "./matrix";
import { clampedKnotVector, designMatrix, evaluateSpline } from "./bspline";

export class CVIBasis {
  /** Interior knots z_0 < z_1 < ... < z_{n-1} */
  readonly knots: number[];
  /** Number of interior knots */
  readonly n: number;
  /** Number of B-spline basis functions (n + 2) */
  readonly nBasis: number;
  /** Clamped knot vector (length n + 6) */
  readonly t: number[];
  /** Spline degree (always 3 for cubic) */
  readonly degree = 3;

  /** B-spline weights → CVI params */
  private _M: Matrix;
  /** CVI params → B-spline weights (M inverse) */
  private _L: Matrix;

  constructor(knots: number[]) {
    if (knots.length < 4) {
      throw new Error("knots must have at least 4 elements");
    }
    for (let i = 1; i < knots.length; i++) {
      if (knots[i]! <= knots[i - 1]!) {
        throw new Error("knots must be strictly increasing");
      }
    }

    this.knots = knots;
    this.n = knots.length;
    this.nBasis = knots.length + 2;
    this.t = clampedKnotVector(knots);

    const { M, L } = this._buildTransforms();
    this._M = M;
    this._L = L;
  }

  /** Compute the design matrix at evaluation points for a given derivative order. */
  designMatrix(zEval: number[], deriv: number): number[][] {
    return designMatrix(zEval, this.t, this.degree, deriv);
  }

  /** Evaluate the spline (or its derivative) at given points. */
  eval(zEval: number[], weights: number[], deriv: number): number[] {
    return evaluateSpline(zEval, this.t, weights, this.degree, deriv);
  }

  /** Convert CVI parameters to B-spline weights. */
  cviToBspline(cviParams: number[]): number[] {
    return this._L.multiplyVector(cviParams);
  }

  /** Convert B-spline weights to CVI parameters. */
  bsplineToCvi(weights: number[]): number[] {
    return this._M.multiplyVector(weights);
  }

  /** The transform matrix M (weights → CVI params). */
  get M(): Matrix {
    return this._M;
  }

  /** The inverse transform L (CVI params → weights). */
  get L(): Matrix {
    return this._L;
  }

  /**
   * Build the invertible linear maps between CVI params and B-spline weights.
   *
   * CVI params = M @ weights, where:
   *   Row 0:      v(0)            = B(0) @ w
   *   Row 1:      dv/dz(0)        = B'(0) @ w
   *   Rows 2..n+1: d²v/dz²(z_i)  = B''(z_i) @ w   for i = 0..n-1
   */
  private _buildTransforms(): { M: Matrix; L: Matrix } {
    const nb = this.nBasis;
    const M = Matrix.zeros(nb, nb);

    // Row 0: v(0) = B(0) @ w
    const B0_at_0 = designMatrix([0], this.t, this.degree, 0);
    M.setRow(0, B0_at_0[0]!);

    // Row 1: dv/dz(0) = B'(0) @ w
    const B1_at_0 = designMatrix([0], this.t, this.degree, 1);
    M.setRow(1, B1_at_0[0]!);

    // Rows 2..n+1: d²v/dz²(z_i) = B''(z_i) @ w
    const B2_at_knots = designMatrix(this.knots, this.t, this.degree, 2);
    for (let i = 0; i < this.n; i++) {
      M.setRow(i + 2, B2_at_knots[i]!);
    }

    // Check conditioning
    const cond = M.conditionNumber();
    if (cond > 1e8) {
      throw new Error(
        `CVI transform matrix M is ill-conditioned (cond=${cond.toExponential(2)}). ` +
        "Check knot spacing.",
      );
    }

    const L = M.inverse();
    return { M, L };
  }
}
