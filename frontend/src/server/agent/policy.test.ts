import test from "node:test";
import assert from "node:assert/strict";
import { createAgentPolicy } from "./policy.ts";

test("macro trend requests require macro series", () => {
  const policy = createAgentPolicy({
    query: "What does growth look like over the last few years?",
    dashboard_context: "macro",
    country: "us",
  });

  assert.equal(policy.mode, "analysis");
  assert.deepEqual(policy.requiredTools, ["get_macro_series"]);
  assert.deepEqual(policy.allowedTools, ["get_macro_series"]);
  assert.equal(policy.preferredMacroIndicator, "gdp-growth");
});

test("stock benchmark requests are declined instead of routed to other tools", () => {
  const policy = createAgentPolicy({
    query: "How is it doing versus the S&P 500 today?",
    ticker: "AAPL",
  });

  assert.equal(policy.mode, "decline");
  assert.match(policy.declineMessage ?? "", /benchmark|S&P 500/i);
});

test("unsupported commodity requests are declined", () => {
  const policy = createAgentPolicy({
    query: "What does corn look like right now?",
    dashboard_context: "commodity",
    commodity_instrument: "gold",
  });

  assert.equal(policy.mode, "decline");
  assert.match(policy.declineMessage ?? "", /supported commodity dashboards/i);
});

test("unsupported crypto markets are declined", () => {
  const policy = createAgentPolicy({
    query: "What does SOL look like here?",
    dashboard_context: "crypto",
    crypto_instrument: "BTC-PERPETUAL",
  });

  assert.equal(policy.mode, "decline");
  assert.match(policy.declineMessage ?? "", /BTC and ETH/i);
});

test("multi-driver stock questions require overview, fundamentals, and news", () => {
  const policy = createAgentPolicy({
    query: "Is this stock more about momentum, fundamentals, or recent headlines right now?",
    ticker: "AAPL",
  });

  assert.equal(policy.mode, "analysis");
  assert.deepEqual(policy.requiredTools, [
    "get_stock_overview",
    "get_stock_fundamentals",
    "get_news",
    "get_context_news",
  ]);
});

test("macro driver questions require macro data plus focused and context news", () => {
  const policy = createAgentPolicy({
    query: "What is driving the inflation trend in the U.S.?",
    dashboard_context: "macro",
    country: "us",
  });

  assert.equal(policy.mode, "analysis");
  assert.deepEqual(policy.requiredTools, [
    "get_macro_series",
    "get_news",
    "get_context_news",
  ]);
});

test("crypto news recap no longer declines and uses focused news", () => {
  const policy = createAgentPolicy({
    query: "Any recent headlines around Bitcoin?",
    dashboard_context: "crypto",
    crypto_instrument: "BTC-PERPETUAL",
  });

  assert.equal(policy.mode, "analysis");
  assert.deepEqual(policy.requiredTools, ["get_news"]);
  assert.ok(policy.allowedTools.includes("get_context_news"));
});

test("general casual queries do not force a stock overview tool", () => {
  const policy = createAgentPolicy({
    query: "hello how are you",
  });

  assert.equal(policy.strictSubject, "general");
  assert.deepEqual(policy.requiredTools, []);
});
