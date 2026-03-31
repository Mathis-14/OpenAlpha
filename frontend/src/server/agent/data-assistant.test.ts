import test from "node:test";
import assert from "node:assert/strict";
import { isDataPlanningQuery, resolveDataAssistantResult } from "./data-assistant.ts";

test("data assistant chooses one first export for multi-target requests", () => {
  const result = resolveDataAssistantResult({
    query: "I need AAPL prices, CPI, and Bitcoin in one dataset.",
    dashboard_context: "data",
  });

  assert.equal(result.kind, "plan");
  if (result.kind !== "plan") {
    return;
  }

  assert.equal(result.plan.asset_class, "stock");
  assert.equal(result.plan.asset, "AAPL");
  assert.match(result.answer, /Start with this export first/i);
});

test("data assistant rejects unsupported options greeks exports", () => {
  const result = resolveDataAssistantResult({
    query: "I need options Greeks data as CSV.",
    dashboard_context: "data",
  });

  assert.equal(result.kind, "decline");
  if (result.kind !== "decline") {
    return;
  }

  assert.match(result.answer, /not supported/i);
});

test("data assistant uses current stock context for this stock exports", () => {
  const result = resolveDataAssistantResult({
    query: "I want raw CSV price data for this stock for the last year.",
    ticker: "AAPL",
  });

  assert.equal(isDataPlanningQuery({
    query: "I want raw CSV price data for this stock for the last year.",
    ticker: "AAPL",
  }), true);
  assert.equal(result.kind, "plan");
  if (result.kind !== "plan") {
    return;
  }

  assert.equal(result.plan.asset_class, "stock");
  assert.equal(result.plan.asset, "AAPL");
});

test("data assistant rejects unsupported shipping-rate requests", () => {
  const result = resolveDataAssistantResult({
    query: "I need live shipping-rate data as CSV.",
    dashboard_context: "data",
  });

  assert.equal(result.kind, "decline");
  if (result.kind !== "decline") {
    return;
  }

  assert.match(result.answer, /shipping-rate|shipping/i);
});

test("data assistant chooses a first macro export for recession-risk research", () => {
  const result = resolveDataAssistantResult({
    query: "I want to study recession risk with one export first.",
    dashboard_context: "data",
  });

  assert.equal(result.kind, "plan");
  if (result.kind !== "plan") {
    return;
  }

  assert.equal(result.plan.asset_class, "macro");
  assert.equal(result.plan.asset, "unemployment");
  assert.match(result.answer, /start with/i);
});
