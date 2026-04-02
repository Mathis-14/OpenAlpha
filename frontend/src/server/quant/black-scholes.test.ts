import test from "node:test";
import assert from "node:assert/strict";
import { computeBlackScholes } from "./black-scholes.ts";

test("computeBlackScholes matches a standard at-the-money call case", () => {
  const result = computeBlackScholes("call", 100, 100, 1, 0.2, 0.05);

  assert.ok(Math.abs(result.theoreticalPrice - 10.4506) < 0.02);
  assert.ok(Math.abs(result.delta - 0.6368) < 0.01);
  assert.ok(Math.abs(result.gamma - 0.0188) < 0.001);
  assert.ok(Math.abs(result.vega - 0.3752) < 0.01);
  assert.ok(result.volga > 0);
  assert.ok(Number.isFinite(result.vanna));
  assert.ok(result.speed < 0);
  assert.ok(result.theta < 0);
  assert.ok(result.rho > 0);
});

test("computeBlackScholes produces sensible signs for put Greeks", () => {
  const result = computeBlackScholes("put", 100, 100, 1, 0.2, 0.05);

  assert.ok(result.theoreticalPrice > 0);
  assert.ok(result.delta < 0);
  assert.ok(result.gamma > 0);
  assert.ok(result.vega > 0);
  assert.ok(result.volga > 0);
  assert.ok(Number.isFinite(result.vanna));
  assert.ok(result.speed < 0);
  assert.ok(result.theta < 0);
  assert.ok(result.rho < 0);
});

test("computeBlackScholes reflects continuous dividend yield in equity-style inputs", () => {
  const noDividend = computeBlackScholes("call", 100, 100, 1, 0.2, 0.05, 0);
  const withDividend = computeBlackScholes("call", 100, 100, 1, 0.2, 0.05, 0.02);

  assert.ok(withDividend.theoreticalPrice < noDividend.theoreticalPrice);
  assert.ok(withDividend.delta < noDividend.delta);
  assert.ok(withDividend.gamma > 0);
  assert.ok(withDividend.vega > 0);
});
