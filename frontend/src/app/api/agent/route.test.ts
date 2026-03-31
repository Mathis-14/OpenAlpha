import test from "node:test";
import assert from "node:assert/strict";
import { normalizeRequest, POST } from "./route.ts";

test("normalizeRequest rejects empty or too-long queries", () => {
  assert.equal(normalizeRequest({ query: "" }), null);
  assert.equal(normalizeRequest({ query: "x".repeat(2001) }), null);
});

test("normalizeRequest preserves stock ticker context and trims values", () => {
  const normalized = normalizeRequest({
    query: "  What's going on here? ",
    ticker: " aapl ",
  });

  assert.deepEqual(normalized, {
    query: "What's going on here?",
    ticker: "aapl",
    dashboard_context: undefined,
    country: undefined,
    crypto_instrument: undefined,
    commodity_instrument: undefined,
  });
});

test("normalizeRequest keeps valid macro country context", () => {
  const normalized = normalizeRequest({
    query: "Inflation?",
    dashboard_context: "macro",
    country: "fr",
  });

  assert.deepEqual(normalized, {
    query: "Inflation?",
    ticker: undefined,
    dashboard_context: "macro",
    country: "fr",
    crypto_instrument: undefined,
    commodity_instrument: undefined,
  });
});

test("normalizeRequest accepts only supported crypto and commodity instruments", () => {
  const normalized = normalizeRequest({
    query: "Check this market",
    dashboard_context: "crypto",
    crypto_instrument: "DOGE-PERPETUAL",
    commodity_instrument: " Gold ",
  });

  assert.deepEqual(normalized, {
    query: "Check this market",
    ticker: undefined,
    dashboard_context: "crypto",
    country: undefined,
    crypto_instrument: undefined,
    commodity_instrument: "gold",
  });
});

test("POST allows deterministic conversation starters without MISTRAL_API_KEY", async () => {
  const originalKey = process.env.MISTRAL_API_KEY;
  const originalQuotaEnabled = process.env.QUOTA_ENABLED;
  const originalQuotaSecret = process.env.REQUEST_QUOTA_SIGNING_SECRET;
  delete process.env.MISTRAL_API_KEY;
  process.env.QUOTA_ENABLED = "false";
  process.env.REQUEST_QUOTA_SIGNING_SECRET = "test-quota-secret";

  try {
    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "hello how are you" }),
      }),
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /text\/event-stream/i);
  } finally {
    process.env.MISTRAL_API_KEY = originalKey;
    process.env.QUOTA_ENABLED = originalQuotaEnabled;
    process.env.REQUEST_QUOTA_SIGNING_SECRET = originalQuotaSecret;
  }
});

test("POST allows deterministic creator replies without MISTRAL_API_KEY", async () => {
  const originalKey = process.env.MISTRAL_API_KEY;
  const originalQuotaEnabled = process.env.QUOTA_ENABLED;
  const originalQuotaSecret = process.env.REQUEST_QUOTA_SIGNING_SECRET;
  delete process.env.MISTRAL_API_KEY;
  process.env.QUOTA_ENABLED = "false";
  process.env.REQUEST_QUOTA_SIGNING_SECRET = "test-quota-secret";

  try {
    const response = await POST(
      new Request("http://localhost/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Who created you?" }),
      }),
    );

    assert.equal(response.status, 200);
    assert.match(response.headers.get("Content-Type") ?? "", /text\/event-stream/i);
  } finally {
    process.env.MISTRAL_API_KEY = originalKey;
    process.env.QUOTA_ENABLED = originalQuotaEnabled;
    process.env.REQUEST_QUOTA_SIGNING_SECRET = originalQuotaSecret;
  }
});
