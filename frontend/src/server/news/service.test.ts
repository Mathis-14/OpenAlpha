import test from "node:test";
import assert from "node:assert/strict";
import {
  getContextNews,
  getFocusedNews,
  getMarketNews,
} from "./service.ts";

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

const WEAK_FEED = `<?xml version="1.0"?>
<rss>
  <channel>
    <item>
      <title>ETF flows lift Mag 7 basket</title>
      <link>https://example.com/etf</link>
      <description>A basket of mega-cap names is active today.</description>
      <pubDate>Tue, 31 Mar 2026 11:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const FINNHUB_COMPANY_NEWS = [
  {
    headline: "Apple suppliers gain after upbeat device demand",
    source: "Finnhub",
    summary: "AAPL suppliers are seeing stronger demand.",
    url: "https://example.com/finnhub-aapl",
    datetime: 1_775_000_000,
  },
];

const FINNHUB_MARKET_NEWS = [
  {
    headline: "Global markets watch rates and inflation data",
    source: "Finnhub",
    summary: "Investors are focused on macro signals and central banks.",
    url: "https://example.com/finnhub-markets",
    datetime: 1_775_100_000,
  },
];

const FINNHUB_TOPIC_NEWS = [
  {
    headline: "Silver prices climb as investors rotate into precious metals",
    source: "Finnhub",
    summary: "Silver and gold are drawing safe-haven flows as rate expectations shift.",
    url: "https://example.com/finnhub-silver",
    datetime: 1_775_200_000,
  },
  {
    headline: "Bitcoin steadies as crypto traders watch macro risk",
    source: "Finnhub",
    summary: "Bitcoin and Ethereum are trading defensively ahead of macro catalysts.",
    url: "https://example.com/finnhub-bitcoin",
    datetime: 1_775_200_100,
  },
];

const FINNHUB_GOOGLE_REDIRECT_NEWS = [
  {
    headline: "Reuters article routed through Google News RSS",
    source: "Reuters",
    summary: "This should remain readable but not clickable.",
    url: "https://news.google.com/rss/articles/CBMiuwFBVV95cUxPTGI1RDRzSnZ0MW9jTlhyd0tGNFdjQk5EQkwtS3U3UjJXUzFxR05NRVlmT01WLUtEeGlTZzhiUExVbEpENElQT05YckFqcS1URTRZQUZtMzZ1UF9YSXFUYVNlT2ttbjRaTFlhUXVkQmJHVV9oUUFtNjA2N1VzVFpOS0QxNFkzeWozYmFOYWx0bFZ3YzJESUtxZ2RfREtYR2RiaWFQS2VBRzdhcUpUNTBVRGQyMkYweHFHd0Ew?oc=5",
    datetime: 1_775_100_000,
  },
];

function xmlResponse(body: string): Response {
  return new Response(body, {
    status: 200,
    headers: { "Content-Type": "application/xml" },
  });
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function failingResponse(status: number): Response {
  return new Response("error", {
    status,
    headers: { "Content-Type": "text/plain" },
  });
}

test("focused news ranking prefers Yahoo articles that mention the requested query", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  delete process.env.FINNHUB_API_KEY;

  global.fetch = async () => xmlResponse(SAMPLE_FEED);

  try {
    const result = await getFocusedNews("AAPL", 2);
    assert.equal(result.kind, "focused");
    assert.equal(result.query, "AAPL");
    assert.equal(result.articles[0]?.title, "Apple launches a new enterprise push");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    }
  }
});

test("focused news falls back to Finnhub when Yahoo relevance is weak", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("finance.yahoo.com")) {
      return xmlResponse(WEAK_FEED);
    }

    if (url.includes("/company-news")) {
      return jsonResponse(FINNHUB_COMPANY_NEWS);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getFocusedNews("AAPL", 2);
    assert.equal(result.kind, "focused");
    assert.equal(result.data_status, "complete");
    assert.equal(result.articles[0]?.source, "Finnhub");
    assert.equal(result.articles[0]?.title, "Apple suppliers gain after upbeat device demand");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("focused topic news uses Finnhub general-news fallback instead of company news", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";
  let companyNewsRequested = false;
  let marketNewsRequested = false;

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("finance.yahoo.com")) {
      return xmlResponse(WEAK_FEED);
    }

    if (url.includes("/company-news")) {
      companyNewsRequested = true;
      return jsonResponse(FINNHUB_COMPANY_NEWS);
    }

    if (url.includes("/api/v1/news")) {
      marketNewsRequested = true;
      return jsonResponse(FINNHUB_TOPIC_NEWS);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getFocusedNews("silver", 2);
    assert.equal(result.kind, "focused");
    assert.equal(result.data_status, "complete");
    assert.equal(companyNewsRequested, false);
    assert.equal(marketNewsRequested, true);
    assert.equal(result.provider, "finnhub");
    assert.equal(result.source_mode, "broad_feed");
    assert.match(result.warnings?.[0] ?? "", /general-news fallback/i);
    assert.equal(result.articles[0]?.title, "Silver prices climb as investors rotate into precious metals");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("focused crypto topic news uses Finnhub general-news fallback when Yahoo is weak", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("finance.yahoo.com")) {
      return xmlResponse(WEAK_FEED);
    }

    if (url.includes("/api/v1/news")) {
      return jsonResponse(FINNHUB_TOPIC_NEWS);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getFocusedNews("Bitcoin", 2);
    assert.equal(result.kind, "focused");
    assert.equal(result.provider, "finnhub");
    assert.equal(result.source_mode, "broad_feed");
    assert.equal(result.articles[0]?.title, "Bitcoin steadies as crypto traders watch macro risk");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("focused news keeps the Yahoo degraded result when Finnhub fallback also fails", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("finance.yahoo.com")) {
      return xmlResponse(WEAK_FEED);
    }

    if (url.includes("/company-news")) {
      return failingResponse(500);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getFocusedNews("AAPL", 2);
    assert.equal(result.kind, "focused");
    assert.equal(result.data_status, "partial");
    assert.equal(result.articles[0]?.title, "ETF flows lift Mag 7 basket");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("focused topic news surfaces a warning when no Finnhub fallback is configured", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  delete process.env.FINNHUB_API_KEY;

  global.fetch = async () => xmlResponse(WEAK_FEED);

  try {
    const result = await getFocusedNews("silver", 2);
    assert.equal(result.kind, "focused");
    assert.equal(result.provider, "yahoo");
    assert.equal(result.data_status, "partial");
    assert.match(result.warnings?.join(" ") ?? "", /no Finnhub fallback is configured/i);
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    }
  }
});

test("context news uses the broad pipeline and exposes broad metadata", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/v1/news")) {
      return jsonResponse(FINNHUB_MARKET_NEWS);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getContextNews("markets", 2);
    assert.equal(result.kind, "context");
    assert.equal(result.data_status, "complete");
    assert.equal(result.theme_id, "markets");
    assert.equal(result.provider, "finnhub");
    assert.equal(result.source_mode, "broad_feed");
    assert.equal(result.resolved_query, "general");
    assert.equal(result.articles[0]?.title, "Global markets watch rates and inflation data");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("context news canonicalizes generic global requests to markets", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/v1/news")) {
      return jsonResponse(FINNHUB_MARKET_NEWS);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getContextNews("global", 2);
    assert.equal(result.query, "markets");
    assert.equal(result.theme_id, "markets");
    assert.equal(result.resolved_query, "general");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("market news uses Finnhub general news when the key is present", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/v1/news")) {
      return jsonResponse(FINNHUB_MARKET_NEWS);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getMarketNews(2);
    assert.equal(result.kind, "context");
    assert.equal(result.data_status, "complete");
    assert.equal(result.articles[0]?.source, "Finnhub");
    assert.equal(result.articles[0]?.title, "Global markets watch rates and inflation data");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("market news strips unusable Google News RSS redirect links", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/v1/news")) {
      return jsonResponse(FINNHUB_GOOGLE_REDIRECT_NEWS);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getMarketNews(2);
    assert.equal(result.articles[0]?.title, "Reuters article routed through Google News RSS");
    assert.equal(result.articles[0]?.url, "");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("market news falls back to Yahoo markets when Finnhub fails", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/api/v1/news")) {
      return failingResponse(500);
    }

    if (url.includes("finance.yahoo.com")) {
      return xmlResponse(SAMPLE_FEED);
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const result = await getMarketNews(2);
    assert.equal(result.kind, "context");
    assert.equal(result.data_status, "complete");
    assert.equal(result.articles[0]?.source, "Yahoo Finance");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("context news returns partial when no broad context headlines are available", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  delete process.env.FINNHUB_API_KEY;

  global.fetch = async () => xmlResponse(`<?xml version="1.0"?><rss><channel></channel></rss>`);

  try {
    const result = await getContextNews("geopolitics", 2);
    assert.equal(result.kind, "context");
    assert.equal(result.data_status, "partial");
    assert.ok(result.warnings?.length);
    assert.equal(result.articles.length, 0);
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    }
  }
});
