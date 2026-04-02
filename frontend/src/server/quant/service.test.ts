import test from "node:test";
import assert from "node:assert/strict";
import { buildPayoffDiagram, computeGreeks } from "./service.ts";

test("computeGreeks works without a live chain when all inputs are explicit", async () => {
  const result = await computeGreeks({
    option_type: "call",
    strike: 100,
    spot_price: 102,
    volatility: 0.24,
    risk_free_rate: 0.04,
    time_to_expiry_years: 0.5,
  });

  assert.equal(result.option_type, "call");
  assert.equal(result.strike, 100);
  assert.equal(result.spot_price, 102);
  assert.equal(result.volatility, 0.24);
  assert.equal(result.dividend_yield, 0);
  assert.equal(result.model, "bsm");
  assert.equal(result.approximation, "black_scholes_merton_with_continuous_dividend_yield");
  assert.equal(result.active_tenor?.mode, "listed");
  assert.ok((result.maturity_nodes?.length ?? 0) >= 1);
  assert.ok(result.theoretical_price > 0);
  assert.ok(result.delta > 0);
  assert.ok(result.assumptions.length >= 2);
});

test("computeGreeks rejects conflicting expiration and day tenor inputs", async () => {
  await assert.rejects(
    () =>
      computeGreeks({
        option_type: "put",
        strike: 100,
        spot_price: 100,
        volatility: 0.25,
        risk_free_rate: 0.04,
        expiration: "2026-12-31",
        days_to_expiry: 30,
      }),
    /disagree materially/i,
  );
});

test("buildPayoffDiagram computes a long call payoff profile", async () => {
  const result = await buildPayoffDiagram({
    spot_price: 100,
    legs: [
      {
        option_type: "call",
        direction: "long",
        strike: 100,
        premium: 8,
        quantity: 1,
      },
    ],
  });

  assert.equal(result.legs.length, 1);
  assert.ok(result.points.length > 50);
  assert.ok(result.max_loss != null && Math.abs(result.max_loss + 8) < 0.5);
  assert.ok(result.max_profit != null && result.max_profit > 40);
  assert.ok(result.breakeven_points.length >= 1);
  assert.ok(Math.abs(result.breakeven_points[0] - 108) < 1);
});
