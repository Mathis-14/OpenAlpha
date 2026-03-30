import test from "node:test";
import assert from "node:assert/strict";
import { getFilings } from "./service.ts";

const ORIGINAL_FETCH = globalThis.fetch;
const ORIGINAL_ENV = { ...process.env };

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  restoreEnv();
});

test("getFilings returns partial metadata when filing sections cannot be fetched", async () => {
  Object.assign(process.env, {
    EDGAR_USER_AGENT: "OpenAlpha test@openalpha.io",
  });

  globalThis.fetch = (async (input) => {
    const url = String(input);

    if (url.includes("company_tickers.json")) {
      return new Response(
        JSON.stringify({
          "0": { cik_str: 320193, ticker: "AAPL", title: "Apple Inc." },
        }),
        { status: 200 },
      );
    }

    if (url.includes("CIK0000320193.json")) {
      return new Response(
        JSON.stringify({
          filings: {
            recent: {
              form: ["10-K"],
              accessionNumber: ["0000320193-24-000001"],
              filingDate: ["2024-10-31"],
              primaryDocument: ["a10-k.htm"],
            },
          },
        }),
        { status: 200 },
      );
    }

    if (url.includes("/Archives/edgar/data/320193/000032019324000001/a10-k.htm")) {
      return new Response("unavailable", { status: 503 });
    }

    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  const result = await getFilings("AAPL", "10-K", 1);

  assert.equal(result.data_status, "partial");
  assert.ok(result.warnings?.[0]?.includes("Filing metadata is still available"));
  assert.equal(result.filings.length, 1);
  assert.equal(result.filings[0]?.sections_available, false);
  assert.deepEqual(result.filings[0]?.sections, []);
});
