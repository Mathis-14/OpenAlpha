import type { QuantOptionType } from "@/types/api";

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;

  const t = 1 / (1 + p * x);
  const y =
    1 -
    (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x));

  return sign * y;
}

export function normalCdf(value: number): number {
  return 0.5 * (1 + erf(value / Math.sqrt(2)));
}

export function normalPdf(value: number): number {
  return Math.exp(-0.5 * value * value) / Math.sqrt(2 * Math.PI);
}

export type BlackScholesResult = {
  theoreticalPrice: number;
  delta: number;
  gamma: number;
  vega: number;
  theta: number;
  rho: number;
  volga: number;
  vanna: number;
  speed: number;
};

export function computeBlackScholes(
  optionType: QuantOptionType,
  spot: number,
  strike: number,
  timeToExpiryYears: number,
  volatility: number,
  riskFreeRate: number,
  dividendYield: number = 0,
): BlackScholesResult {
  const t = Math.max(timeToExpiryYears, 1e-6);
  const sigma = Math.max(volatility, 1e-6);
  const q = Number.isFinite(dividendYield) ? dividendYield : 0;
  const sqrtT = Math.sqrt(t);
  const d1 =
    (Math.log(spot / strike) + (riskFreeRate - q + 0.5 * sigma * sigma) * t) /
    (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;

  const pdf = normalPdf(d1);
  const nd1 = normalCdf(d1);
  const nd2 = normalCdf(d2);
  const nMinusD1 = normalCdf(-d1);
  const nMinusD2 = normalCdf(-d2);
  const discount = Math.exp(-riskFreeRate * t);
  const carryDiscount = Math.exp(-q * t);

  const theoreticalPrice =
    optionType === "call"
      ? spot * carryDiscount * nd1 - strike * discount * nd2
      : strike * discount * nMinusD2 - spot * carryDiscount * nMinusD1;

  const delta = optionType === "call"
    ? carryDiscount * nd1
    : carryDiscount * (nd1 - 1);
  const gamma = (carryDiscount * pdf) / (spot * sigma * sqrtT);
  const rawVega = spot * carryDiscount * pdf * sqrtT;
  // Market convention: vega and rho are quoted per 1 vol/rate point (1%), not per unit 1.00 move.
  const vega = rawVega / 100;
  // Volga is reported per 1 vol point squared and vanna per 1 vol point.
  const volga = (rawVega * d1 * d2) / (sigma * 10_000);
  const vanna = (-(carryDiscount * pdf) * d2) / (sigma * 100);
  const speed = -(gamma / spot) * (d1 / (sigma * sqrtT) + 1);

  const theta =
    optionType === "call"
      ? (-spot * carryDiscount * pdf * sigma) / (2 * sqrtT) -
        riskFreeRate * strike * discount * nd2 +
        q * spot * carryDiscount * nd1
      : (-spot * carryDiscount * pdf * sigma) / (2 * sqrtT) +
        riskFreeRate * strike * discount * nMinusD2 -
        q * spot * carryDiscount * nMinusD1;

  const rho =
    optionType === "call"
      ? (strike * t * discount * nd2) / 100
      : (-strike * t * discount * nMinusD2) / 100;

  return {
    theoreticalPrice,
    delta,
    gamma,
    vega,
    theta: theta / 365,
    rho,
    volga,
    vanna,
    speed,
  };
}
