/**
 * Top-level CVI calibration entry point.
 *
 * Converts a QuantOptionChain into a QuantSurfaceResult using
 * CVI (Convex Volatility Interpolation) calibration.
 */

import type { QuantOptionChain, QuantSurfaceResult } from "@/types/api";
import { chainToMarketSlices } from "./data-adapter";
import { calibrateCVI } from "./solver";
import { CVIBasis } from "./basis";
import { defaultCVIConfig } from "./types";
import { linspace, clip } from "./matrix";

/**
 * Build a CVI-calibrated implied-volatility surface.
 *
 * @param chain Option chain from Yahoo Finance
 * @param riskFreeRate Risk-free rate (decimal)
 * @returns QuantSurfaceResult with model: "cvi"
 */
export async function buildCVISurface(
  chain: QuantOptionChain,
  riskFreeRate: number,
): Promise<QuantSurfaceResult> {
  const config = defaultCVIConfig();
  const { slices, warnings } = chainToMarketSlices(chain, riskFreeRate);

  if (slices.length < 1) {
    return emptyResult(chain, warnings, slices.length);
  }

  // Run CVI calibration
  const result = await calibrateCVI(slices, config);

  if (result.weights.size === 0) {
    return emptyResult(chain, [
      ...warnings,
      `CVI calibration failed: ${result.solver_status}`,
    ], slices.length);
  }

  // Build the output surface
  const basis = new CVIBasis(config.knots);
  const sortedSlices = [...slices].sort((a, b) => a.T - b.T);

  // Moneyness grid for surface output (matching SSVI output style)
  const allZ = slices.flatMap((sl) => sl.z);
  const zMin = Math.max(Math.min(...allZ) * 1.1, config.knots[0]!);
  const zMax = Math.min(Math.max(...allZ) * 1.1, config.knots[config.knots.length - 1]!);

  // Convert z-grid to moneyness grid using the first expiry as reference
  const gridSize = 27;
  const zGrid = linspace(zMin, zMax, gridSize);

  // Compute moneyness from z: moneyness = exp(z * sigma_star * sqrt(T))
  // Use the median sigma_star across expiries for a stable grid
  const sigmaStars = sortedSlices.map((sl) => sl.sigma_star);
  sigmaStars.sort((a, b) => a - b);
  const medianSigma = sigmaStars[Math.floor(sigmaStars.length / 2)]!;
  const medianT = sortedSlices[Math.floor(sortedSlices.length / 2)]!.T;
  const moneynessValues = zGrid.map((z) =>
    Number(Math.exp(z * medianSigma * Math.sqrt(medianT)).toFixed(4)),
  );

  const expirations: string[] = [];
  const daysToExpiryValues: number[] = [];
  const zValues: Array<Array<number>> = [];

  for (const sl of sortedSlices) {
    const w = result.weights.get(sl.T);
    if (!w) continue;

    // Find the matching expiration info
    const expInfo = chain.expirations.find(
      (e) => Math.abs(e.time_to_expiry_years - sl.T) < 0.001,
    );
    if (!expInfo) continue;

    expirations.push(expInfo.expiration);
    daysToExpiryValues.push(expInfo.days_to_expiry);

    // Evaluate IV at the z-grid points for this expiry
    // z_local = log(moneyness) / (sigma_star * sqrt(T))
    const ivRow: number[] = [];
    for (const moneyness of moneynessValues) {
      const k = Math.log(moneyness);
      const zLocal = k / (sl.sigma_star * Math.sqrt(sl.T));
      const zClamped = clip(zLocal, config.knots[0]!, config.knots[config.knots.length - 1]!);

      const vArr = basis.eval([zClamped], w, 0);
      const variance = clip(vArr[0]!, 1e-10, 25);  // cap at 500% IV
      ivRow.push(Number(Math.sqrt(variance).toFixed(6)));
    }
    zValues.push(ivRow);
  }

  // Build market data points for scatter overlay
  const points = slices.flatMap((sl) => {
    const expInfo = chain.expirations.find(
      (e) => Math.abs(e.time_to_expiry_years - sl.T) < 0.001,
    );
    if (!expInfo) return [];

    return sl.z.map((z, i) => {
      const moneyness = Math.exp(sl.k[i]!);
      const iv = Math.sqrt(Math.max(sl.v_mid[i] ?? sl.v_bid[i] ?? sl.v_ask[i] ?? 0, 0));
      return {
        expiration: expInfo.expiration,
        days_to_expiry: expInfo.days_to_expiry,
        time_to_expiry_years: sl.T,
        strike: Math.exp(sl.k[i]!) * sl.F,
        moneyness: Number(moneyness.toFixed(4)),
        implied_volatility: Number(iv.toFixed(6)),
      };
    });
  });

  // Aggregate butterfly violations
  const totalViolations: Record<string, number> = {};
  for (const [T, count] of result.butterfly_violations) {
    const expInfo = chain.expirations.find(
      (e) => Math.abs(e.time_to_expiry_years - T) < 0.001,
    );
    const key = expInfo?.expiration ?? T.toFixed(4);
    totalViolations[key] = count;
  }

  const calWarnings = [...warnings];
  if (!result.converged) {
    calWarnings.push(
      `CVI did not converge after ${result.iterations} iterations (status: ${result.solver_status}).`,
    );
  }
  const violationCount = Array.from(result.butterfly_violations.values()).reduce(
    (s, v) => s + v, 0,
  );
  if (violationCount > 0) {
    calWarnings.push(
      `${violationCount} butterfly constraint violations detected on the fine grid.`,
    );
  }

  return {
    symbol: chain.symbol,
    spot_price: chain.spot_price,
    x_axis: "moneyness",
    expirations,
    days_to_expiry_values: daysToExpiryValues,
    moneyness_values: moneynessValues,
    z_values: zValues,
    points,
    model: "cvi",
    raw_point_count: chain.expirations.reduce(
      (s, e) => s + e.calls.length + e.puts.length, 0,
    ),
    filtered_point_count: points.length,
    calibration: {
      iterations: result.iterations,
      converged: result.converged,
      solver_status: result.solver_status,
      objective_value: Number(result.objective_value.toExponential(6)),
      butterfly_violations: totalViolations,
      calendar_valid: true,
      loss: result.objective_value,
    },
    warnings: calWarnings.length > 0 ? calWarnings : undefined,
    data_status: result.converged ? "complete" : "partial",
  };
}

function emptyResult(
  chain: QuantOptionChain,
  warnings: string[],
  filteredCount: number,
): QuantSurfaceResult {
  return {
    symbol: chain.symbol,
    spot_price: chain.spot_price,
    x_axis: "moneyness",
    expirations: [],
    days_to_expiry_values: [],
    moneyness_values: [],
    z_values: [],
    points: [],
    model: "cvi",
    raw_point_count: chain.expirations.reduce(
      (s, e) => s + e.calls.length + e.puts.length, 0,
    ),
    filtered_point_count: filteredCount,
    warnings: [
      ...warnings,
      `Not enough data to calibrate a CVI surface for ${chain.symbol}.`,
    ],
    data_status: "partial",
  };
}
