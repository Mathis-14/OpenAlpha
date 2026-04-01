import test from "node:test";
import assert from "node:assert/strict";
import { normalizeQuantRequest, POST } from "./route.ts";

test("normalizeQuantRequest rejects empty or too-long queries", () => {
  assert.equal(normalizeQuantRequest({ query: "" }), null);
  assert.equal(normalizeQuantRequest({ query: "x".repeat(2001) }), null);
});

test("normalizeQuantRequest trims the input query", () => {
  assert.deepEqual(normalizeQuantRequest({ query: "  show me SPY skew  " }), {
    query: "show me SPY skew",
  });
});

test("POST returns 503 when MISTRAL_API_KEY is missing", async () => {
  const originalKey = process.env.MISTRAL_API_KEY;
  delete process.env.MISTRAL_API_KEY;

  try {
    const response = await POST(
      new Request("http://localhost/api/quant-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: "Show me the NVDA volatility surface" }),
      }),
    );

    assert.equal(response.status, 503);
    const payload = (await response.json()) as { error?: string };
    assert.equal(payload.error, "agent_unavailable");
  } finally {
    process.env.MISTRAL_API_KEY = originalKey;
  }
});
