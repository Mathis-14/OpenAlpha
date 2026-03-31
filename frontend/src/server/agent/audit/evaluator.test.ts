import test from "node:test";
import assert from "node:assert/strict";
import { evaluateAuditCase, parseSseChunk } from "./evaluator.ts";
import type { AuditCase } from "./types.ts";

const BASE_CASE: AuditCase = {
  id: "stock-xx",
  label: "Base",
  context: "stock",
  request: {
    query: "What's the current price and volume?",
    ticker: "AAPL",
  },
  requiredTools: ["get_stock_overview"],
  requiredAnswerChecks: [],
  forbiddenAnswerChecks: [],
  downloadExpectation: "forbidden",
  answerMustReferenceCurrentSubject: false,
  numericGrounding: "strict",
  allowRetryOnInfra: true,
};

test("parseSseChunk reads event payloads from raw SSE text", () => {
  const events = parseSseChunk(
    'event: text_delta\ndata: {"content":"Hello"}\n\n' +
      'event: done\ndata: {}\n\n',
  );

  assert.equal(events.length, 2);
  assert.equal(events[0]?.event, "text_delta");
  assert.deepEqual(events[0]?.data, { content: "Hello" });
  assert.equal(events[1]?.event, "done");
});

test("evaluateAuditCase flags figures that do not match tool output", () => {
  const evaluation = evaluateAuditCase(BASE_CASE, {
    transcript: [],
    toolCalls: [{ name: "get_stock_overview", args: { symbol: "AAPL" } }],
    toolResults: [
      {
        name: "get_stock_overview",
        args: { symbol: "AAPL" },
        success: true,
        rawContent: '{"current_price":180,"volume":1000000}',
        parsedContent: { current_price: 180, volume: 1_000_000 },
        displays: [],
      },
    ],
    finalAnswer: "AAPL is around $250 with volume near 3.0M.",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "hard_fail");
  assert.ok(
    evaluation.findings.some(
      (finding) => finding.category === "contradicted_by_tool_output",
    ),
  );
});

test("evaluateAuditCase flags stale macro wording when latest date is old", () => {
  const macroCase: AuditCase = {
    ...BASE_CASE,
    id: "macro-xx",
    context: "macro",
    request: {
      query: "As of today, what is inflation?",
      dashboard_context: "macro",
      country: "us",
    },
    requiredTools: ["get_macro_snapshot"],
    numericGrounding: "off",
  };

  const evaluation = evaluateAuditCase(macroCase, {
    transcript: [],
    toolCalls: [{ name: "get_macro_snapshot", args: { country: "us" } }],
    toolResults: [
      {
        name: "get_macro_snapshot",
        args: { country: "us" },
        success: true,
        rawContent:
          '{"cpi":{"latest_value":317.0,"latest_date":"2026-02-01","unit":"index"}}',
        parsedContent: {
          cpi: {
            latest_value: 317,
            latest_date: "2026-02-01",
            unit: "index",
          },
        },
        displays: [],
      },
    ],
    finalAnswer: "As of today, inflation is running at 317.0 on the CPI index.",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "hard_fail");
  assert.ok(
    evaluation.findings.some(
      (finding) => finding.category === "stale_or_time_unsafe_answer",
    ),
  );
});

test("evaluateAuditCase normalizes curly apostrophes for answer checks", () => {
  const analystCase: AuditCase = {
    ...BASE_CASE,
    requiredAnswerChecks: [
      {
        pattern: /\b(don'?t have|not available)\b/i,
        message: "Unsupported request should be declined honestly.",
        category: "unsupported_claim",
        level: "hard",
        severity: "high",
      },
    ],
    numericGrounding: "off",
  };

  const evaluation = evaluateAuditCase(analystCase, {
    transcript: [],
    toolCalls: [{ name: "get_stock_overview", args: { symbol: "AAPL" } }],
    toolResults: [],
    finalAnswer: "I don’t have that data in the current tool output.",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "pass");
});

test("evaluateAuditCase ignores label numbers like 24h and 52-week", () => {
  const evaluation = evaluateAuditCase(BASE_CASE, {
    transcript: [],
    toolCalls: [{ name: "get_stock_overview", args: { symbol: "AAPL" } }],
    toolResults: [
      {
        name: "get_stock_overview",
        args: { symbol: "AAPL" },
        success: true,
        rawContent:
          '{"current_price":246.63,"change":-2.17,"change_percent":-0.8722,"volume":38248670,"market_cap":3624949514240,"fifty_two_week_high":288.62,"fifty_two_week_low":169.21}',
        parsedContent: {
          current_price: 246.63,
          change: -2.17,
          change_percent: -0.8722,
          volume: 38_248_670,
          market_cap: 3_624_949_514_240,
          fifty_two_week_high: 288.62,
          fifty_two_week_low: 169.21,
        },
        displays: [],
      },
    ],
    finalAnswer:
      "Price is $246.63 (-$2.17, -0.9%) with volume at 38.2M. The 52-week range is $169.21 to $288.62.",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "pass");
});

test("evaluateAuditCase ignores month-day dates and formula helper numbers", () => {
  const macroCase: AuditCase = {
    ...BASE_CASE,
    id: "macro-yy",
    context: "macro",
    request: {
      query: "As of today, what is inflation?",
      dashboard_context: "macro",
      country: "us",
    },
    requiredTools: ["get_macro_snapshot"],
    numericGrounding: "strict",
  };

  const evaluation = evaluateAuditCase(macroCase, {
    transcript: [],
    toolCalls: [{ name: "get_macro_snapshot", args: { country: "us" } }],
    toolResults: [
      {
        name: "get_macro_snapshot",
        args: { country: "us" },
        success: true,
        rawContent:
          '{"cpi":{"latest_value":327.46,"history":[{"value":313.569}]},"treasury_10y":{"latest_value":4.44,"latest_date":"2026-03-27"}}',
        parsedContent: {
          cpi: {
            latest_value: 327.46,
            history: [{ value: 313.569 }],
          },
          treasury_10y: {
            latest_value: 4.44,
            latest_date: "2026-03-27",
          },
        },
        displays: [],
      },
    ],
    finalAnswer:
      "Inflation is 4.1% (calculated from CPI: (327.46 - 313.569)/313.569 × 100). The 10-Year Treasury Yield is 4.44% (Mar 27, 2026).",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "pass");
});

test("evaluateAuditCase allows unsupported-request declines with no tool calls when no tools were expected", () => {
  const unsupportedCase: AuditCase = {
    ...BASE_CASE,
    requiredTools: [],
    requiredAnyTools: undefined,
    requiredAnswerChecks: [
      {
        pattern: /\b(not supported|don't have|cannot)\b/i,
        message: "Unsupported request should be declined honestly.",
        category: "unsupported_claim",
        level: "hard",
        severity: "high",
      },
    ],
    numericGrounding: "off",
  };

  const evaluation = evaluateAuditCase(unsupportedCase, {
    transcript: [],
    toolCalls: [],
    toolResults: [],
    finalAnswer: "I don't have that dataset in the current tool path.",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "pass");
});

test("evaluateAuditCase ignores day numbers inside month-day-year dates", () => {
  const macroCase: AuditCase = {
    ...BASE_CASE,
    id: "macro-zz",
    context: "macro",
    request: {
      query: "What are the latest readings?",
      dashboard_context: "macro",
      country: "us",
    },
    requiredTools: ["get_macro_snapshot"],
    numericGrounding: "strict",
  };

  const evaluation = evaluateAuditCase(macroCase, {
    transcript: [],
    toolCalls: [{ name: "get_macro_snapshot", args: { country: "us" } }],
    toolResults: [
      {
        name: "get_macro_snapshot",
        args: { country: "us" },
        success: true,
        rawContent:
          '{"fed_funds_rate":{"latest_value":3.64},"treasury_10y":{"latest_value":4.44},"cpi":{"latest_value":327.46},"unemployment":{"latest_value":4.4}}',
        parsedContent: {
          fed_funds_rate: { latest_value: 3.64 },
          treasury_10y: { latest_value: 4.44 },
          cpi: { latest_value: 327.46 },
          unemployment: { latest_value: 4.4 },
        },
        displays: [],
      },
    ],
    finalAnswer:
      "Federal Funds Rate is 3.64% (as of Feb 1, 2026), the 10-Year Treasury Yield is 4.44%, CPI is 327.46, and unemployment is 4.4%.",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "pass");
});

test("evaluateAuditCase accepts simple absolute differences derived from tool output", () => {
  const cryptoCase: AuditCase = {
    ...BASE_CASE,
    id: "crypto-zz",
    context: "crypto",
    request: {
      query: "Explain the mark price versus the last price.",
      dashboard_context: "crypto",
      crypto_instrument: "BTC-PERPETUAL",
    },
    requiredTools: ["get_crypto_overview"],
    numericGrounding: "strict",
  };

  const evaluation = evaluateAuditCase(cryptoCase, {
    transcript: [],
    toolCalls: [{ name: "get_crypto_overview", args: { instrument: "BTC-PERPETUAL" } }],
    toolResults: [
      {
        name: "get_crypto_overview",
        args: { instrument: "BTC-PERPETUAL" },
        success: true,
        rawContent: '{"last_price":66842,"mark_price":66847.75}',
        parsedContent: {
          last_price: 66842,
          mark_price: 66847.75,
        },
        displays: [],
      },
    ],
    finalAnswer:
      "The mark price is $66,847.75 versus a last price of $66,842, a gap of about $5.75.",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "pass");
});

test("evaluateAuditCase accepts lowercase compact suffixes and derived percentages", () => {
  const commodityCase: AuditCase = {
    ...BASE_CASE,
    id: "commodity-yy",
    context: "commodity",
    request: {
      query: "Give me a quick snapshot of this commodity.",
      dashboard_context: "commodity",
      commodity_instrument: "gold",
    },
    requiredTools: ["get_commodity_overview", "get_commodity_price_history"],
    numericGrounding: "strict",
  };

  const evaluation = evaluateAuditCase(commodityCase, {
    transcript: [],
    toolCalls: [
      { name: "get_commodity_overview", args: { instrument: "gold" } },
      { name: "get_commodity_price_history", args: { instrument: "gold", range: "1mo" } },
    ],
    toolResults: [
      {
        name: "get_commodity_overview",
        args: { instrument: "gold" },
        success: true,
        rawContent:
          '{"current_price":4525,"fifty_two_week_high":5586.2,"volume":2349}',
        parsedContent: {
          current_price: 4525,
          fifty_two_week_high: 5586.2,
          volume: 2349,
        },
        displays: [],
      },
      {
        name: "get_commodity_price_history",
        args: { instrument: "gold", range: "1mo" },
        success: true,
        rawContent: '{"price_history":[{"close":5300},{"close":4400}]}',
        parsedContent: {
          price_history: [{ close: 5300 }, { close: 4400 }],
        },
        displays: [],
      },
    ],
    finalAnswer:
      "Gold is down about 19% from the 52-week high, with volume around 2.3k contracts after a move from roughly 5,300 to 4,400.",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "pass");
});

test("evaluateAuditCase marks pure infrastructure failures as blocked", () => {
  const evaluation = evaluateAuditCase(BASE_CASE, {
    transcript: [
      {
        event: "error",
        data: { message: "LLM request timed out" },
        raw: 'event: error\ndata: {"message":"LLM request timed out"}\n\n',
      },
    ],
    toolCalls: [],
    toolResults: [],
    finalAnswer: "",
    displayDownload: null,
  });

  assert.equal(evaluation.status, "blocked");
  assert.ok(
    evaluation.findings.some(
      (finding) => finding.category === "infra_blocked",
    ),
  );
});
