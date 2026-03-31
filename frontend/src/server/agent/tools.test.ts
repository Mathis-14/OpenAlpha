import test from "node:test";
import assert from "node:assert/strict";
import { dispatchToolWithDisplay } from "./tools.ts";

test("crypto tools reject unsupported instruments instead of falling back", async () => {
  await assert.rejects(
    () =>
      dispatchToolWithDisplay("get_crypto_overview", {
        instrument: "DOGE-PERPETUAL",
      }),
    /Unsupported crypto instrument/,
  );
});

test("commodity tools reject unsupported instruments instead of falling back", async () => {
  await assert.rejects(
    () =>
      dispatchToolWithDisplay("get_commodity_overview", {
        instrument: "corn",
      }),
    /Unsupported commodity instrument/,
  );
});

test("get_news accepts focused topic queries", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      `<?xml version="1.0"?>
        <rss>
          <channel>
            <item>
              <title>Gold steadies as traders watch rates</title>
              <link>https://example.com/gold</link>
              <description>Gold markets are digesting the latest inflation data.</description>
              <pubDate>Tue, 31 Mar 2026 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`,
      {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      },
    );

  try {
    const [raw] = await dispatchToolWithDisplay("get_news", {
      query: "gold",
      limit: 1,
    });
    const parsed = JSON.parse(raw) as { query: string; articles: Array<{ title: string }> };
    assert.equal(parsed.query, "gold");
    assert.equal(parsed.articles[0]?.title, "Gold steadies as traders watch rates");
  } finally {
    global.fetch = originalFetch;
  }
});

test("get_context_news accepts broader market queries", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(
      `<?xml version="1.0"?>
        <rss>
          <channel>
            <item>
              <title>Markets brace for a busy week</title>
              <link>https://example.com/markets</link>
              <description>Wall Street is watching rates and geopolitics.</description>
              <pubDate>Tue, 31 Mar 2026 12:00:00 GMT</pubDate>
            </item>
          </channel>
        </rss>`,
      {
        status: 200,
        headers: { "Content-Type": "application/xml" },
      },
    );

  try {
    const [raw] = await dispatchToolWithDisplay("get_context_news", {
      query: "markets",
      limit: 1,
    });
    const parsed = JSON.parse(raw) as { kind: string; articles: Array<{ title: string }> };
    assert.equal(parsed.kind, "context");
    assert.equal(parsed.articles[0]?.title, "Markets brace for a busy week");
  } finally {
    global.fetch = originalFetch;
  }
});
