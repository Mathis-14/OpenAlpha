import test from "node:test";
import assert from "node:assert/strict";
import {
  applyQuantHintsToToolArguments,
  extractQuantIntentHints,
} from "./service.ts";

test("extractQuantIntentHints finds symbol, option type, tenor, vol, and metric", () => {
  const hints = extractQuantIntentHints(
    "Compute the gamma for a MSFT put with 30 days to expiry and 25% vol.",
  );

  assert.equal(hints.symbol, "MSFT");
  assert.equal(hints.optionType, "put");
  assert.equal(hints.focusMetric, "gamma");
  assert.equal(hints.daysToExpiry, 30);
  assert.equal(hints.volatility, 0.25);
});

test("applyQuantHintsToToolArguments fills missing compute_greeks inputs from query hints", () => {
  const args = applyQuantHintsToToolArguments(
    "compute_greeks",
    {
      option_type: "put",
      volatility: 0.25,
      days_to_expiry: 30,
      focus_metric: "delta",
    },
    { symbol: "MSFT", optionType: "put", focusMetric: "gamma", daysToExpiry: 30, volatility: 0.25 },
  );

  assert.equal(args.symbol, "MSFT");
  assert.equal(args.option_type, "put");
  assert.equal(args.volatility, 0.25);
  assert.equal(args.days_to_expiry, 30);
  assert.equal(args.focus_metric, "delta");
});
