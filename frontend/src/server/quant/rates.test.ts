import test from "node:test";
import assert from "node:assert/strict";
import {
  getTreasuryCurve,
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

test("getTreasuryCurve retries transient node failures and tolerates one missing node", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FRED_API_KEY;
  const attempts = new Map<string, number>();

  process.env.FRED_API_KEY = "test-key";
  global.fetch = (async (input: URL | RequestInfo) => {
    const href =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;
    const url = new URL(href);
    const seriesId = url.searchParams.get("series_id") ?? "unknown";
    const attempt = (attempts.get(seriesId) ?? 0) + 1;
    attempts.set(seriesId, attempt);

    if (seriesId === "DGS1MO" && attempt === 1) {
      throw new Error("temporary network failure");
    }

    if (seriesId === "DGS30") {
      return {
        ok: false,
        status: 503,
        json: async () => ({}),
      } as Response;
    }

    return {
      ok: true,
      status: 200,
      json: async () => ({
        observations: [
          { date: "2026-04-02", value: "4.00" },
        ],
      }),
    } as Response;
  }) as typeof fetch;

  try {
    const curve = await getTreasuryCurve();

    assert.equal(curve.nodes.length, 10);
    assert.ok((curve.warnings?.length ?? 0) >= 1);
    assert.equal(attempts.get("DGS1MO"), 2);
    assert.equal(curve.nodes[0]?.label, "1M");
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) {
      delete process.env.FRED_API_KEY;
    } else {
      process.env.FRED_API_KEY = originalKey;
    }
  }
});
