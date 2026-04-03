import test from "node:test";
import assert from "node:assert/strict";
import {
  getTreasuryCurve,
  interpolateTreasuryContinuousRate,
  resolveTreasuryRateForPricing,
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

test("resolveTreasuryRateForPricing allows short-end clamp only when the short node is near 1M", () => {
  const resolution = resolveTreasuryRateForPricing(SAMPLE_CURVE, 7 / 365.25, 0.04);

  assert.equal(resolution.source, "treasury_curve");
  assert.equal(resolution.coverage_mode, "edge_clamp_short");
  assert.equal(resolution.rate, SAMPLE_CURVE.nodes[0]!.continuous_rate);
});

test("resolveTreasuryRateForPricing falls back when only long-end nodes survive for a short tenor", () => {
  const longOnlyCurve: TreasuryCurve = {
    as_of: "2026-04-01",
    nodes: [
      {
        series_id: "DGS10",
        label: "10Y",
        tenor_days: 3650,
        latest_date: "2026-04-01",
        rate_percent: 4.2,
        rate_decimal: 0.042,
        continuous_rate: Math.log(1.042),
      },
      {
        series_id: "DGS30",
        label: "30Y",
        tenor_days: 365 * 30,
        latest_date: "2026-04-01",
        rate_percent: 4.35,
        rate_decimal: 0.0435,
        continuous_rate: Math.log(1.0435),
      },
    ],
  };

  const resolution = resolveTreasuryRateForPricing(longOnlyCurve, 30 / 365.25, 0.04);

  assert.equal(resolution.source, "fallback");
  assert.equal(resolution.coverage_mode, "fallback");
  assert.equal(resolution.rate, 0.04);
  assert.match(resolution.warning ?? "", /starts at 10Y/i);
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
