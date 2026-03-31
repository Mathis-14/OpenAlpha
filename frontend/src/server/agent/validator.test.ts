import test from "node:test";
import assert from "node:assert/strict";
import { validateAgentAnswer } from "./validator.ts";
import type { AgentPolicy } from "./policy.ts";

const BASE_POLICY: AgentPolicy = {
  mode: "analysis",
  requiredTools: ["get_stock_overview"],
  allowedTools: ["get_stock_overview"],
  strictSubject: "ticker",
  answerGuidance: [],
};

test("validator rejects unsupported catalyst narratives in stock snapshot answers", () => {
  const result = validateAgentAnswer(
    {
      query: "What matters most for this stock today?",
      ticker: "AAPL",
    },
    BASE_POLICY,
    "AAPL is down slightly and macro tech sentiment is likely weighing on the stock today.",
    [
      {
        name: "get_stock_overview",
        args: { symbol: "AAPL" },
        success: true,
        rawContent: "{}",
        parsedContent: {
          current_price: 246.63,
          change: -2.17,
        },
        displays: [],
      },
    ],
  );

  assert.equal(result.valid, false);
  assert.match(result.issues.join(" "), /macro sentiment|catalysts/i);
});

test("validator rejects stale today wording for macro answers", () => {
  const result = validateAgentAnswer(
    {
      query: "As of today, what is inflation?",
      dashboard_context: "macro",
      country: "us",
    },
    {
      mode: "analysis",
      requiredTools: ["get_macro_snapshot"],
      allowedTools: ["get_macro_snapshot"],
      strictSubject: "macro",
      answerGuidance: [],
    },
    "As of today, inflation is 327.46 on the CPI index.",
    [
      {
        name: "get_macro_snapshot",
        args: { country: "us" },
        success: true,
        rawContent: "{}",
        parsedContent: {
          cpi: {
            latest_value: 327.46,
            latest_date: "2026-03-27",
            unit: "index",
          },
        },
        displays: [],
      },
    ],
  );

  assert.equal(result.valid, false);
  assert.match(result.issues.join(" "), /today/i);
});

test("validator rejects unsupported crypto open-interest unit conversion", () => {
  const result = validateAgentAnswer(
    {
      query: "What's the current open interest?",
      dashboard_context: "crypto",
      crypto_instrument: "BTC-PERPETUAL",
    },
    {
      mode: "analysis",
      requiredTools: ["get_crypto_overview"],
      allowedTools: ["get_crypto_overview"],
      strictSubject: "crypto",
      answerGuidance: [],
    },
    "Open interest is 986.7K BTC right now.",
    [
      {
        name: "get_crypto_overview",
        args: { instrument: "BTC-PERPETUAL" },
        success: true,
        rawContent: "{}",
        parsedContent: {
          open_interest_display: "986.7M",
          open_interest_unit: "native Deribit units",
        },
        displays: [],
      },
    ],
  );

  assert.equal(result.valid, false);
  assert.match(result.issues.join(" "), /open interest/i);
});

test("validator accepts explicit unavailability when tools failed", () => {
  const result = validateAgentAnswer(
    {
      query: "Give me a quick snapshot of this stock.",
      ticker: "ZZZZ",
    },
    BASE_POLICY,
    "I can't fetch data for ZZZZ right now because the market data feed returned an error.",
    [
      {
        name: "get_stock_overview",
        args: { symbol: "ZZZZ" },
        success: false,
        displays: [],
        error: "Unsupported or invalid asset: ZZZZ",
      },
    ],
  );

  assert.equal(result.valid, true);
});

test("validator rejects unsupported average-volume claims in stock snapshot answers", () => {
  const result = validateAgentAnswer(
    {
      query: "Give me a quick snapshot of this stock.",
      ticker: "AAPL",
    },
    BASE_POLICY,
    "AAPL is trading on heavy volume versus its 30-day average volume.",
    [
      {
        name: "get_stock_overview",
        args: { symbol: "AAPL" },
        success: true,
        rawContent: "{}",
        parsedContent: {
          current_price: 246.63,
          volume: 38_248_670,
        },
        displays: [],
      },
    ],
  );

  assert.equal(result.valid, false);
  assert.match(result.issues.join(" "), /average volume/i);
});
