/**
 * Data structures for CVI calibration.
 *
 * Port of: vol-surface-cvi/src/cvi/types.py
 */

/** Market data for a single expiry. */
export interface MarketSlice {
  /** Time to expiry in years */
  T: number;
  /** Forward price */
  F: number;
  /** Anchor ATM volatility */
  sigma_star: number;
  /** Normalized log-moneyness per option */
  z: number[];
  /** Log-forward moneyness per option */
  k: number[];
  /** Mid variance (IV_mid^2), NaN if no bid+ask */
  v_mid: number[];
  /** Bid variance, NaN if no bid */
  v_bid: number[];
  /** Ask variance, NaN if no ask */
  v_ask: number[];
  /** BS vega at bid IV */
  vega_bid: number[];
  /** BS vega at ask IV */
  vega_ask: number[];
  /** Option has a bid */
  has_bid: boolean[];
  /** Option has an ask */
  has_ask: boolean[];
}

/** Configuration for CVI calibration. */
export interface CVIConfig {
  /** Interior knots z_0 ... z_{n-1} */
  knots: number[];
  /** Number of strikes for calendar spread discretization */
  n_calendar_strikes: number;
  /** Number of points for butterfly discretization */
  n_butterfly_points: number;
  /** TV regularization weight */
  lambda_reg: number;
  /** Max butterfly iterations */
  max_iter: number;
  /** Relative weight change for convergence */
  convergence_tol: number;
  /** Fine grid size for PDF verification */
  n_pdf_check: number;
}

/** Result of CVI calibration for one or more expiries. */
export interface CVIResult {
  /** T → B-spline weight vector */
  weights: Map<number, number[]>;
  /** T → [v_atm, skew, c_0..c_{n-1}] */
  cvi_params: Map<number, number[]>;
  iterations: number;
  converged: boolean;
  solver_status: string;
  objective_value: number;
  /** T → count of PDF < 0 points */
  butterfly_violations: Map<number, number>;
}

/** Default CVI configuration for U.S. equities. */
export function defaultCVIConfig(): CVIConfig {
  const n = 20;
  const zMin = -5;
  const zMax = 5;
  const knots: number[] = [];
  for (let i = 0; i < n; i++) {
    knots.push(zMin + (zMax - zMin) * i / (n - 1));
  }
  return {
    knots,
    n_calendar_strikes: 20,
    n_butterfly_points: 50,
    lambda_reg: 0.05,
    max_iter: 5,
    convergence_tol: 1e-6,
    n_pdf_check: 500,
  };
}
