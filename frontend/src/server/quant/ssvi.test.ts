import test from "node:test";
import assert from "node:assert/strict";
import type { QuantOptionChain, QuantOptionContract } from "@/types/api";
import { buildArbitrageFreeSurface, ssviVariance } from "./ssvi.ts";

function buildContract(
  optionType: "call" | "put",
  strike: number,
  expiration: string,
  iv: number,
): QuantOptionContract {
  return {
    contract_symbol: `${optionType}-${strike.toFixed(2)}-${expiration}`,
    option_type: optionType,
    strike,
    expiration,
    last_price: 4.25,
    bid: 4.1,
    ask: 4.4,
    midpoint: 4.25,
    implied_volatility: iv,
    volume: 120,
    open_interest: 800,
    in_the_money: false,
    last_trade_date: null,
  };
}

function buildSyntheticChain(): QuantOptionChain {
  const spot = 100;
  const rho = -0.4;
  const eta = 1.1;
  const gamma = 0.4;
  const expirations = [
    { expiration: "2026-05-15", days: 45, theta: 0.022 },
    { expiration: "2026-07-17", days: 108, theta: 0.041 },
    { expiration: "2026-10-16", days: 199, theta: 0.073 },
  ];
  const moneynessValues = [0.8, 0.88, 0.94, 1.0, 1.06, 1.14, 1.22];

  return {
    symbol: "SPY",
    name: "SPDR S&P 500 ETF Trust",
    currency: "USD",
    exchange: "NYSE Arca",
    spot_price: spot,
    previous_close: 99.5,
    as_of: null,
    available_expirations: expirations.map((item) => item.expiration),
    atm_strike: 100,
    expiration_count: expirations.length,
    expirations: expirations.map((item) => {
      const t = item.days / 365.25;
      const forward = spot * Math.exp(0.04 * t);
      const calls = moneynessValues.map((moneyness) => {
        const strike = Number((forward * moneyness).toFixed(4));
        const logMoneyness = Math.log(moneyness);
        const iv = Math.sqrt(ssviVariance(logMoneyness, item.theta, rho, eta, gamma) / t);
        return buildContract("call", strike, item.expiration, iv);
      });
      const puts = moneynessValues.map((moneyness) => {
        const strike = Number((forward * moneyness).toFixed(4));
        const logMoneyness = Math.log(moneyness);
        const iv = Math.sqrt(ssviVariance(logMoneyness, item.theta, rho, eta, gamma) / t);
        return buildContract("put", strike, item.expiration, iv);
      });

      return {
        expiration: item.expiration,
        days_to_expiry: item.days,
        time_to_expiry_years: Number(t.toFixed(6)),
        calls,
        puts,
      };
    }),
    warnings: undefined,
    data_status: "complete",
  };
}

test("buildArbitrageFreeSurface calibrates an SSVI surface from synthetic equity data", () => {
  const chain = buildSyntheticChain();
  const surface = buildArbitrageFreeSurface(chain, 0.04);

  assert.equal(surface.model, "ssvi");
  assert.equal(surface.data_status, "complete");
  assert.equal(surface.expirations.length, 3);
  assert.ok((surface.filtered_point_count ?? 0) >= 15);
  assert.ok(surface.calibration != null);
  assert.ok((surface.calibration?.butterfly_margin ?? -1) > 0);
  assert.equal(surface.calibration?.calendar_valid, true);
  assert.ok(surface.z_values.every((row) => row.every((value) => value != null && value > 0)));
});

test("buildArbitrageFreeSurface returns partial when too little filtered data remains", () => {
  const chain = buildSyntheticChain();
  chain.expirations = [
    {
      ...chain.expirations[0],
      days_to_expiry: 3,
      calls: chain.expirations[0].calls.slice(0, 2),
      puts: chain.expirations[0].puts.slice(0, 2),
    },
  ];
  chain.available_expirations = [chain.expirations[0].expiration];
  chain.expiration_count = 1;

  const surface = buildArbitrageFreeSurface(chain, 0.04);

  assert.equal(surface.data_status, "partial");
  assert.equal(surface.expirations.length, 0);
  assert.ok((surface.warnings?.length ?? 0) > 0);
});

test("buildArbitrageFreeSurface excludes extreme wing outliers from the final surface", () => {
  const chain = buildSyntheticChain();

  chain.expirations[1].calls[6].implied_volatility = 1.45;
  chain.expirations[1].calls[6].bid = 6.5;
  chain.expirations[1].calls[6].ask = 7.1;
  chain.expirations[1].calls[6].midpoint = 6.8;
  chain.expirations[1].calls[6].open_interest = 2_400;
  chain.expirations[1].calls[6].volume = 380;

  const surface = buildArbitrageFreeSurface(chain, 0.04);

  assert.equal(surface.data_status, "complete");
  assert.ok((surface.filtered_point_count ?? 0) <= 21);
  assert.ok((surface.warnings?.length ?? 0) > 0);
  assert.ok(surface.points.every((point) => point.implied_volatility < 1));
});
