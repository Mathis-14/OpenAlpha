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

test("get_news exposes focused-topic fallback metadata when Yahoo is weak", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (url.includes("finance.yahoo.com")) {
      return new Response(
        `<?xml version="1.0"?>
          <rss>
            <channel>
              <item>
                <title>ETF flows lift Mag 7 basket</title>
                <link>https://example.com/etf</link>
                <description>A basket of mega-cap names is active today.</description>
                <pubDate>Tue, 31 Mar 2026 11:00:00 GMT</pubDate>
              </item>
            </channel>
          </rss>`,
        {
          status: 200,
          headers: { "Content-Type": "application/xml" },
        },
      );
    }

    if (url.includes("/api/v1/news")) {
      return new Response(
        JSON.stringify([
          {
            headline: "Silver prices climb as investors rotate into precious metals",
            source: "Finnhub",
            summary: "Silver is drawing safe-haven flows.",
            url: "https://example.com/silver",
            datetime: 1_775_200_000,
          },
        ]),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    throw new Error(`Unexpected fetch URL: ${url}`);
  };

  try {
    const [raw] = await dispatchToolWithDisplay("get_news", {
      query: "silver",
      limit: 1,
    });
    const parsed = JSON.parse(raw) as {
      provider?: string;
      source_mode?: string;
      warnings?: string[];
      digest?: {
        provider?: string | null;
        source_mode?: string | null;
        fallback_summary?: string | null;
      };
      articles: Array<{ title: string }>;
    };
    assert.equal(parsed.provider, "finnhub");
    assert.equal(parsed.source_mode, "broad_feed");
    assert.match(parsed.warnings?.[0] ?? "", /general-news fallback/i);
    assert.equal(parsed.digest?.provider, "finnhub");
    assert.equal(parsed.digest?.source_mode, "broad_feed");
    assert.match(parsed.digest?.fallback_summary ?? "", /general-news fallback/i);
    assert.equal(parsed.articles[0]?.title, "Silver prices climb as investors rotate into precious metals");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("get_context_news accepts broader market queries", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (!url.includes("/api/v1/news")) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    return new Response(
      JSON.stringify([
        {
          headline: "Markets brace for a busy week",
          source: "Finnhub",
          summary: "Wall Street is watching rates and geopolitics.",
          url: "https://example.com/markets",
          datetime: 1_775_100_000,
        },
      ]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const [raw] = await dispatchToolWithDisplay("get_context_news", {
      query: "markets",
      limit: 1,
    });
    const parsed = JSON.parse(raw) as {
      kind: string;
      provider?: string;
      source_mode?: string;
      theme_id?: string;
      digest?: {
        article_count: number;
        top_headlines: Array<{ title: string; link_available: boolean }>;
      };
      articles: Array<{ title: string }>;
    };
    assert.equal(parsed.kind, "context");
    assert.equal(parsed.provider, "finnhub");
    assert.equal(parsed.source_mode, "broad_feed");
    assert.equal(parsed.theme_id, "markets");
    assert.equal(parsed.digest?.article_count, 1);
    assert.equal(parsed.digest?.top_headlines[0]?.link_available, true);
    assert.equal(parsed.articles[0]?.title, "Markets brace for a busy week");
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});

test("get_context_news omits unusable empty article URLs from the model-facing payload", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.FINNHUB_API_KEY;
  process.env.FINNHUB_API_KEY = "test-finnhub";

  global.fetch = async (input) => {
    const url = String(input);
    if (!url.includes("/api/v1/news")) {
      throw new Error(`Unexpected fetch URL: ${url}`);
    }

    return new Response(
      JSON.stringify([
        {
          headline: "Reuters item routed through Google News RSS",
          source: "Reuters",
          summary: "Readable headline, unusable redirect URL.",
          url: "https://news.google.com/rss/articles/CBMiuwFBVV95cUxPTGI1RDRzSnZ0MW9jTlhyd0tGNFdjQk5EQkwtS3U3UjJXUzFxR05NRVlmT01WLUtEeGlTZzhiUExVbEpENElQT05YckFqcS1URTRZQUZtMzZ1UF9YSXFUYVNlT2ttbjRaTFlhUXVkQmJHVV9oUUFtNjA2N1VzVFpOS0QxNFkzeWozYmFOYWx0bFZ3YzJESUtxZ2RfREtYR2RiaWFQS2VBRzdhcUpUNTBVRGQyMkYweHFHd0Ew?oc=5",
          datetime: 1_775_100_000,
        },
      ]),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    const [raw] = await dispatchToolWithDisplay("get_context_news", {
      query: "markets",
      limit: 1,
    });
    const parsed = JSON.parse(raw) as {
      articles: Array<Record<string, unknown>>;
      digest?: { top_headlines: Array<{ link_available: boolean }> };
    };
    assert.equal("url" in (parsed.articles[0] ?? {}), false);
    assert.equal(parsed.digest?.top_headlines[0]?.link_available, false);
  } finally {
    global.fetch = originalFetch;
    if (originalKey != null) {
      process.env.FINNHUB_API_KEY = originalKey;
    } else {
      delete process.env.FINNHUB_API_KEY;
    }
  }
});
