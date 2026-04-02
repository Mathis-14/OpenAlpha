import test from "node:test";
import assert from "node:assert/strict";
import {
  interpolateTreasuryContinuousRate,
  type TreasuryCurve,
} from "./rates.ts";

const SAMPLE_CURVE: TreasuryCurve = {
  as_of: "2026-04-01",
  nodes: [
    {
      series_id: "DGS1MO",
      label: "1M",
      tenor_days: 30,
      latest_date: "2026-04-01",
      rate_percent: 4.1,
      rate_decimal: 0.041,
      continuous_rate: Math.log(1.041),
    },
    {
      series_id: "DGS6MO",
      label: "6M",
      tenor_days: 182,
      latest_date: "2026-04-01",
      rate_percent: 4.25,
      rate_decimal: 0.0425,
      continuous_rate: Math.log(1.0425),
    },
    {
      series_id: "DGS2",
      label: "2Y",
      tenor_days: 730,
      latest_date: "2026-04-01",
      rate_percent: 4.4,
      rate_decimal: 0.044,
      continuous_rate: Math.log(1.044),
    },
  ],
};

test("interpolateTreasuryContinuousRate clamps below the shortest tenor", () => {
  const rate = interpolateTreasuryContinuousRate(SAMPLE_CURVE, 1 / 365.25);
  assert.equal(rate, SAMPLE_CURVE.nodes[0]!.continuous_rate);
});

test("interpolateTreasuryContinuousRate clamps above the longest tenor", () => {
  const rate = interpolateTreasuryContinuousRate(SAMPLE_CURVE, 5);
  assert.equal(rate, SAMPLE_CURVE.nodes[SAMPLE_CURVE.nodes.length - 1]!.continuous_rate);
});

test("interpolateTreasuryContinuousRate interpolates inside the curve", () => {
  const rate = interpolateTreasuryContinuousRate(SAMPLE_CURVE, 0.5);
  assert.ok(rate > SAMPLE_CURVE.nodes[0]!.continuous_rate);
  assert.ok(rate < SAMPLE_CURVE.nodes[2]!.continuous_rate);
});
