import test from "node:test";
import assert from "node:assert/strict";
import { getContextNews, getFocusedNews } from "./service.ts";

const SAMPLE_FEED = `<?xml version="1.0"?>
<rss>
  <channel>
    <item>
      <title>Apple launches a new enterprise push</title>
      <link>https://example.com/apple</link>
      <description>Apple and AAPL investors are watching the product roadmap.</description>
      <pubDate>Tue, 31 Mar 2026 12:00:00 GMT</pubDate>
    </item>
    <item>
      <title>ETF flows lift Mag 7 basket</title>
      <link>https://example.com/etf</link>
      <description>A basket of mega-cap names is active today.</description>
      <pubDate>Tue, 31 Mar 2026 11:00:00 GMT</pubDate>
    </item>
    <item>
      <title>Markets watch geopolitics and tariffs</title>
      <link>https://example.com/markets</link>
      <description>Global investors are focused on war risk and tariffs.</description>
      <pubDate>Tue, 31 Mar 2026 10:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

test("focused news ranking prefers articles that mention the requested query", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(SAMPLE_FEED, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });

  try {
    const result = await getFocusedNews("AAPL", 2);
    assert.equal(result.kind, "focused");
    assert.equal(result.query, "AAPL");
    assert.equal(result.articles[0]?.title, "Apple launches a new enterprise push");
  } finally {
    global.fetch = originalFetch;
  }
});

test("focused news adds a warning when query relevance is weak", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(SAMPLE_FEED, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });

  try {
    const result = await getFocusedNews("uranium", 2);
    assert.equal(result.kind, "focused");
    assert.equal(result.data_status, "partial");
    assert.ok(result.warnings?.length);
  } finally {
    global.fetch = originalFetch;
  }
});

test("context news returns a context feed without forcing a weak-relevance warning", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () =>
    new Response(SAMPLE_FEED, {
      status: 200,
      headers: { "Content-Type": "application/xml" },
    });

  try {
    const result = await getContextNews("markets", 2);
    assert.equal(result.kind, "context");
    assert.equal(result.data_status, "complete");
    assert.equal(result.articles[0]?.title, "Markets watch geopolitics and tariffs");
  } finally {
    global.fetch = originalFetch;
  }
});
