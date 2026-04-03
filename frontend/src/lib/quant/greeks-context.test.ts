import test from "node:test";
import assert from "node:assert/strict";
import { deriveActiveTenor, interpolateTotalVariance } from "./greeks-context.ts";
import type { QuantGreeksTermNode } from "@/types/api";

const SAMPLE_NODES: QuantGreeksTermNode[] = [
  {
    expiration: "2026-05-01",
    days_to_expiry: 30,
    time_to_expiry_years: 30 / 365.25,
    volatility: 0.2,
    risk_free_rate: 0.03,
    dividend_yield: 0.01,
    anchor: {
      contract_symbol: "CALL-100-30D",
      strike: 100,
      strike_mode: "exact",
      lower_strike: 100,
      upper_strike: 100,
      last_price: 3.5,
      midpoint: 3.45,
      bid: 3.4,
      ask: 3.5,
      open_interest: 1000,
      volume: 200,
      relative_spread: 0.03,
      last_trade_date: "2026-04-01T14:30:00.000Z",
    },
  },
  {
    expiration: "2026-06-15",
    days_to_expiry: 75,
    time_to_expiry_years: 75 / 365.25,
    volatility: 0.28,
    risk_free_rate: 0.035,
    dividend_yield: 0.01,
    anchor: {
      contract_symbol: "CALL-100-75D",
      strike: 100,
      strike_mode: "exact",
      lower_strike: 100,
      upper_strike: 100,
      last_price: 5.1,
      midpoint: 5.05,
      bid: 5,
      ask: 5.1,
      open_interest: 900,
      volume: 150,
      relative_spread: 0.02,
      last_trade_date: "2026-04-01T14:30:00.000Z",
    },
  },
];

test("deriveActiveTenor preserves exact listed day nodes", () => {
  const tenor = deriveActiveTenor(SAMPLE_NODES, 30);
  assert.ok(tenor);
  assert.equal(tenor.mode, "listed");
  assert.equal(tenor.expiration, "2026-05-01");
  assert.equal(tenor.days_to_expiry, 30);
  assert.equal(tenor.volatility, 0.2);
  assert.equal(tenor.riskFreeRate, 0.03);
});

test("deriveActiveTenor interpolates total variance between listed expiries", () => {
  const tenor = deriveActiveTenor(SAMPLE_NODES, 45);
  assert.ok(tenor);
  assert.equal(tenor.mode, "interpolated");
  assert.equal(tenor.days_to_expiry, 45);
  assert.ok(tenor.volatility > 0.2 && tenor.volatility < 0.28);
  assert.ok(tenor.riskFreeRate > 0.03 && tenor.riskFreeRate < 0.035);
  assert.equal(tenor.dividendYield, 0.01);
});

test("interpolateTotalVariance is consistent with end-point vols", () => {
  const lowerVol = 0.2;
  const upperVol = 0.28;
  assert.equal(
    interpolateTotalVariance(30 / 365.25, lowerVol, 75 / 365.25, upperVol, 30 / 365.25),
    lowerVol,
  );
  assert.equal(
    interpolateTotalVariance(30 / 365.25, lowerVol, 75 / 365.25, upperVol, 75 / 365.25),
    upperVol,
  );
});
