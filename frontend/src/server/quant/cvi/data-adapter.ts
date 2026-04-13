/**
 * Convert QuantOptionChain (Yahoo Finance) into CVI MarketSlice[].
 *
 * Key steps per expiry:
 * 1. Estimate forward F via put-call parity
 * 2. Estimate sigma_star (weighted median of near-ATM IVs)
 * 3. Derive bid/ask IVs from bid/ask prices and vega
 * 4. Compute z = log(K/F) / (sigma_star * sqrt(T))
 * 5. Filter and build MarketSlice
 */

import type {
  QuantOptionChain,
  QuantOptionContract,
} from "@/types/api";
import { normalPdf } from "@/lib/quant/black-scholes";
import type { MarketSlice } from "./types";

const MIN_DTE = 7;
const MAX_DTE = 365;
const IV_MIN = 0.01;
const IV_MAX = 4.50;
const Z_MIN = -6;
const Z_MAX = 6;
const NEAR_ATM_THRESHOLD = 0.10;
const MIN_OPTIONS_PER_EXPIRY = 5;

function getPriceProxy(contract: QuantOptionContract): number | null {
  const candidate = contract.midpoint ?? contract.last_price ?? contract.bid ?? contract.ask;
  return candidate != null && Number.isFinite(candidate) ? candidate : null;
}

function bsVega(
  spot: number,
  strike: number,
  T: number,
  r: number,
  sigma: number,
): number {
  if (sigma <= 0 || T <= 0) return 0;
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(spot / strike) + (r + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  return spot * normalPdf(d1) * sqrtT;
}

/**
 * Estimate forward price via put-call parity from near-ATM options.
 */
function estimateForward(
  calls: Map<number, QuantOptionContract>,
  puts: Map<number, QuantOptionContract>,
  spot: number,
  T: number,
  r: number,
): number {
  const naiveForward = spot * Math.exp(r * T);
  const candidates: { forward: number; weight: number }[] = [];

  for (const [strike, call] of calls) {
    const put = puts.get(strike);
    if (!put) continue;

    const dist = Math.abs(Math.log(strike / spot));
    if (dist > 0.16) continue;

    const callPrice = getPriceProxy(call);
    const putPrice = getPriceProxy(put);
    if (callPrice == null || putPrice == null) continue;

    const implied = strike + Math.exp(r * T) * (callPrice - putPrice);
    if (
      !Number.isFinite(implied) ||
      implied <= 0 ||
      implied < naiveForward * 0.82 ||
      implied > naiveForward * 1.18
    ) {
      continue;
    }

    candidates.push({ forward: implied, weight: 1 / (dist + 0.01) });
  }

  if (candidates.length === 0) return naiveForward;

  candidates.sort((a, b) => b.weight - a.weight);
  const top = candidates.slice(0, 9);
  const values = top.map((c) => c.forward).sort((a, b) => a - b);
  const mid = Math.floor(values.length / 2);
  return values.length % 2 === 1
    ? values[mid]!
    : (values[mid - 1]! + values[mid]!) / 2;
}

/**
 * Estimate sigma_star: weighted median of near-ATM implied volatilities.
 */
function estimateSigmaStar(
  contracts: { iv: number; k: number }[],
): number {
  const nearAtm = contracts.filter((c) => Math.abs(c.k) < NEAR_ATM_THRESHOLD);
  if (nearAtm.length === 0) {
    // Fallback: use all contracts, sorted by |k|
    const sorted = [...contracts].sort((a, b) => Math.abs(a.k) - Math.abs(b.k));
    return sorted[0]?.iv ?? 0.2;
  }

  const items = nearAtm.map((c) => ({
    iv: c.iv,
    weight: 1 / (Math.abs(c.k) + 0.01),
  }));
  items.sort((a, b) => a.iv - b.iv);

  const totalWeight = items.reduce((s, i) => s + i.weight, 0);
  let cumWeight = 0;
  for (const item of items) {
    cumWeight += item.weight;
    if (cumWeight >= totalWeight / 2) return item.iv;
  }
  return items[items.length - 1]!.iv;
}

interface ProcessedOption {
  strike: number;
  k: number;
  z: number;
  iv: number;
  ivBid: number;
  ivAsk: number;
  hasBid: boolean;
  hasAsk: boolean;
  vegaBid: number;
  vegaAsk: number;
}

/**
 * Convert a QuantOptionChain into MarketSlice[] for CVI calibration.
 */
export function chainToMarketSlices(
  chain: QuantOptionChain,
  riskFreeRate: number,
): { slices: MarketSlice[]; warnings: string[] } {
  const warnings: string[] = [];
  const slices: MarketSlice[] = [];

  for (const exp of chain.expirations) {
    if (exp.days_to_expiry < MIN_DTE) {
      warnings.push(`Skipped ${exp.expiration}: too short-dated (${exp.days_to_expiry}d).`);
      continue;
    }
    if (exp.days_to_expiry > MAX_DTE) continue;

    const T = exp.time_to_expiry_years;

    // Build maps by strike
    const callsByStrike = new Map(
      exp.calls.map((c) => [c.strike, c] as const),
    );
    const putsByStrike = new Map(
      exp.puts.map((c) => [c.strike, c] as const),
    );

    // Estimate forward
    const F = estimateForward(callsByStrike, putsByStrike, chain.spot_price, T, riskFreeRate);

    // Collect usable options (pick best of call/put at each strike)
    const allStrikes = Array.from(
      new Set([...callsByStrike.keys(), ...putsByStrike.keys()]),
    ).sort((a, b) => a - b);

    const candidates: { strike: number; iv: number; k: number; contract: QuantOptionContract }[] = [];
    for (const strike of allStrikes) {
      const call = callsByStrike.get(strike);
      const put = putsByStrike.get(strike);

      // Choose the OTM option (or best available)
      const preferred = strike >= F ? call : put;
      const fallback = strike >= F ? put : call;
      const contract = preferred ?? fallback;
      if (!contract) continue;

      const iv = contract.implied_volatility;
      if (iv == null || !Number.isFinite(iv) || iv < IV_MIN || iv > IV_MAX) continue;

      const price = getPriceProxy(contract);
      if (price == null || price <= 0.01) continue;

      const k = Math.log(strike / F);
      candidates.push({ strike, iv, k, contract });
    }

    if (candidates.length < MIN_OPTIONS_PER_EXPIRY) {
      warnings.push(`Skipped ${exp.expiration}: too few usable options (${candidates.length}).`);
      continue;
    }

    // Estimate sigma_star
    const sigmaStar = estimateSigmaStar(candidates);
    if (sigmaStar <= 0) continue;

    // Build processed options
    const processed: ProcessedOption[] = [];
    for (const cand of candidates) {
      const z = cand.k / (sigmaStar * Math.sqrt(T));
      if (z < Z_MIN || z > Z_MAX) continue;

      const c = cand.contract;
      const vega = bsVega(chain.spot_price, cand.strike, T, riskFreeRate, cand.iv);

      // Derive bid/ask IVs from bid/ask prices
      let ivBid = cand.iv;
      let ivAsk = cand.iv;
      let hasBid = false;
      let hasAsk = false;

      if (c.bid != null && c.bid > 0 && c.ask != null && c.ask > 0 && vega > 1e-6) {
        const halfSpreadIv = (c.ask - c.bid) / (2 * vega);
        ivBid = Math.max(cand.iv - halfSpreadIv, 0.005);
        ivAsk = cand.iv + halfSpreadIv;
        hasBid = true;
        hasAsk = true;
      } else if (c.bid != null && c.bid > 0) {
        // Has bid only — estimate a synthetic spread
        ivBid = cand.iv * 0.95;
        ivAsk = cand.iv * 1.05;
        hasBid = true;
        hasAsk = false;
      } else if (c.ask != null && c.ask > 0) {
        ivBid = cand.iv * 0.95;
        ivAsk = cand.iv * 1.05;
        hasBid = false;
        hasAsk = true;
      } else {
        // Mark IV only — synthetic spread
        ivBid = cand.iv * 0.95;
        ivAsk = cand.iv * 1.05;
        hasBid = true;
        hasAsk = true;
      }

      const vegaBid = bsVega(chain.spot_price, cand.strike, T, riskFreeRate, ivBid);
      const vegaAsk = bsVega(chain.spot_price, cand.strike, T, riskFreeRate, ivAsk);

      processed.push({
        strike: cand.strike,
        k: cand.k,
        z,
        iv: cand.iv,
        ivBid,
        ivAsk,
        hasBid,
        hasAsk,
        vegaBid: Math.max(vegaBid, 1e-10),
        vegaAsk: Math.max(vegaAsk, 1e-10),
      });
    }

    if (processed.length < MIN_OPTIONS_PER_EXPIRY) {
      warnings.push(`Skipped ${exp.expiration}: too few options after z-filtering (${processed.length}).`);
      continue;
    }

    // Sort by z
    processed.sort((a, b) => a.z - b.z);

    slices.push({
      T,
      F,
      sigma_star: sigmaStar,
      z: processed.map((p) => p.z),
      k: processed.map((p) => p.k),
      v_mid: processed.map((p) => (p.hasBid && p.hasAsk) ? p.iv * p.iv : NaN),
      v_bid: processed.map((p) => p.hasBid ? p.ivBid * p.ivBid : NaN),
      v_ask: processed.map((p) => p.hasAsk ? p.ivAsk * p.ivAsk : NaN),
      vega_bid: processed.map((p) => p.vegaBid),
      vega_ask: processed.map((p) => p.vegaAsk),
      has_bid: processed.map((p) => p.hasBid),
      has_ask: processed.map((p) => p.hasAsk),
    });
  }

  slices.sort((a, b) => a.T - b.T);
  return { slices, warnings };
}
