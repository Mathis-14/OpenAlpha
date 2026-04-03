import test from "node:test";
import assert from "node:assert/strict";
import type { TreasuryCurve } from "./rates.ts";
import { buildPayoffDiagram, computeGreeks, shapeTreasuryCurveForQuant } from "./service.ts";

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

test("shapeTreasuryCurveForQuant exposes the Treasury curve used for risk-free interpolation", () => {
  const curve: TreasuryCurve = {
    as_of: "2026-04-02",
    nodes: [
      {
        series_id: "DGS1MO",
        label: "1M",
        tenor_days: 30,
        latest_date: "2026-04-02",
        rate_percent: 4.2,
        rate_decimal: 0.042,
        continuous_rate: Math.log(1.042),
      },
      {
        series_id: "DGS10",
        label: "10Y",
        tenor_days: 3650,
        latest_date: "2026-04-02",
        rate_percent: 4.05,
        rate_decimal: 0.0405,
        continuous_rate: Math.log(1.0405),
      },
    ],
  };

  const result = shapeTreasuryCurveForQuant(curve);

  assert.equal(result.source, "fred");
  assert.equal(result.curve_method, "treasury_constant_maturity_par_curve");
  assert.equal(result.interpolation_method, "log_discount_factor");
  assert.equal(result.as_of, "2026-04-02");
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[0]?.label, "1M");
  assert.equal(result.nodes[1]?.label, "10Y");
});

test("computeGreeks falls back when Treasury coverage is inadequate for the requested tenor", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FRED_API_KEY;

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

    if (seriesId === "DGS10") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          observations: [{ date: "2026-04-02", value: "4.10" }],
        }),
      } as Response;
    }

    if (seriesId === "DGS30") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          observations: [{ date: "2026-04-02", value: "4.30" }],
        }),
      } as Response;
    }

    return {
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await computeGreeks({
      option_type: "call",
      strike: 100,
      spot_price: 100,
      volatility: 0.22,
      time_to_expiry_years: 30 / 365.25,
    });

    assert.equal(result.risk_free_rate, 0.04);
    assert.ok(
      result.assumptions.some((assumption) =>
        /coverage for the 30D tenor starts at 10Y/i.test(assumption),
      ),
    );
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) {
      delete process.env.FRED_API_KEY;
    } else {
      process.env.FRED_API_KEY = originalKey;
    }
  }
});

test("computeGreeks uses bracketed Treasury nodes when the tenor is adequately covered", { concurrency: false }, async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FRED_API_KEY;

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

    if (seriesId === "DGS1MO") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          observations: [{ date: "2026-04-02", value: "4.00" }],
        }),
      } as Response;
    }

    if (seriesId === "DGS3MO") {
      return {
        ok: true,
        status: 200,
        json: async () => ({
          observations: [{ date: "2026-04-02", value: "4.20" }],
        }),
      } as Response;
    }

    return {
      ok: false,
      status: 503,
      json: async () => ({}),
    } as Response;
  }) as typeof fetch;

  try {
    const result = await computeGreeks({
      option_type: "put",
      strike: 100,
      spot_price: 100,
      volatility: 0.25,
      time_to_expiry_years: 45 / 365.25,
    });

    assert.notEqual(result.risk_free_rate, 0.04);
    assert.ok(
      result.assumptions.some((assumption) =>
        /between the 1M and 3M Treasury nodes/i.test(assumption),
      ),
    );
  } finally {
    global.fetch = originalFetch;
    if (originalKey == null) {
      delete process.env.FRED_API_KEY;
    } else {
      process.env.FRED_API_KEY = originalKey;
    }
  }
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
