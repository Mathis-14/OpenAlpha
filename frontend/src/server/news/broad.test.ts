import test from "node:test";
import assert from "node:assert/strict";
import type { NewsArticle } from "@/types/api";
import {
  createConfiguredBroadNewsProviders,
  getBroadNewsContext,
  type BroadNewsProvider,
  type BroadNewsSourceMode,
} from "./broad.ts";

function article(
  title: string,
  summary: string,
  published: string = "2026-03-31T12:00:00.000Z",
): NewsArticle {
  return {
    title,
    summary,
    published,
    source: "Test Wire",
    url: `https://example.com/${encodeURIComponent(title)}`,
  };
}

function providerFromMap(
  name: string,
  sourceMode: BroadNewsSourceMode,
  mapping: Record<string, NewsArticle[] | Error>,
): BroadNewsProvider {
  return {
    name,
    sourceMode,
    async fetchBroad(query) {
      const result = mapping[query];
      if (result instanceof Error) {
        throw result;
      }

      return result ?? [];
    },
  };
}

test("broad pipeline defaults to markets and prefers a Finnhub broad-feed winner", async () => {
  const finnhub = providerFromMap("finnhub", "broad_feed", {
    general: [
      article(
        "Markets steady as investors weigh inflation and yields",
        "Financial markets are digesting rates and risk sentiment.",
      ),
    ],
  });

  const yahoo = providerFromMap("yahoo", "query_feed", {
    SPY: [
      article(
        "SPY traders adjust positioning",
        "ETF investors rebalance portfolios.",
      ),
    ],
  });

  const result = await getBroadNewsContext(
    {
      query: "What is the broad market backdrop right now?",
    },
    {
      providers: [finnhub, yahoo],
    },
  );

  assert.equal(result.kind, "broad");
  assert.equal(result.theme_id, "markets");
  assert.equal(result.chosen_query, "general");
  assert.equal(result.provider, "finnhub");
  assert.equal(result.source_mode, "broad_feed");
});

test("broad pipeline keeps geopolitical prompts on geopolitics when broad-feed articles have geopolitical anchors", async () => {
  const finnhub = providerFromMap("finnhub", "broad_feed", {
    general: [
      article(
        "Tariffs and sanctions keep investors cautious",
        "Trade war pressure and diplomatic conflict remain central to markets.",
      ),
    ],
  });

  const result = await getBroadNewsContext(
    {
      query: "How much are tariffs and geopolitics driving markets?",
    },
    {
      providers: [finnhub],
    },
  );

  assert.equal(result.theme_id, "geopolitics");
  assert.equal(result.provider, "finnhub");
});

test("broad pipeline routes volatility-only headlines to risk-sentiment instead of geopolitics", async () => {
  const finnhub = providerFromMap("finnhub", "broad_feed", {
    general: [
      article(
        "Wall Street fear gauge rises as volatility spikes",
        "Investors rush toward hedges as risk sentiment deteriorates.",
      ),
    ],
  });

  const result = await getBroadNewsContext(
    {
      query: "How much geopolitical risk matters for investors right now?",
    },
    {
      providers: [finnhub],
    },
  );

  assert.equal(result.theme_id, "risk-sentiment");
});

test("broad pipeline prefers macro-economy when the feed carries macro anchors", async () => {
  const finnhub = providerFromMap("finnhub", "broad_feed", {
    general: [
      article(
        "Inflation, jobs, and GDP keep equity investors on edge",
        "Macro data from payrolls to consumer spending is shaping the outlook.",
      ),
    ],
  });

  const result = await getBroadNewsContext(
    {
      query: "What is the macro backdrop for equities?",
    },
    {
      providers: [finnhub],
    },
  );

  assert.equal(result.theme_id, "macro-economy");
});

test("broad pipeline falls back to Yahoo query feeds when Finnhub is weak", async () => {
  const finnhub = providerFromMap("finnhub", "broad_feed", {
    general: [
      article(
        "ETF investors rebalance positions",
        "Portfolio shifts continue without clear macro context.",
      ),
    ],
  });
  const yahoo = providerFromMap("yahoo", "query_feed", {
    "^TNX": [
      article(
        "Treasury yields rise as traders rethink the Fed path",
        "Bond markets are repricing monetary policy and rates.",
      ),
    ],
  });

  const result = await getBroadNewsContext(
    {
      query: "Are rates the main driver for markets right now?",
    },
    {
      providers: [finnhub, yahoo],
    },
  );

  assert.equal(result.theme_id, "rates-and-yields");
  assert.equal(result.provider, "yahoo");
  assert.equal(result.source_mode, "query_feed");
});

test("configured providers skip Finnhub when no API key is present", () => {
  const original = process.env.FINNHUB_API_KEY;
  delete process.env.FINNHUB_API_KEY;

  try {
    const providers = createConfiguredBroadNewsProviders();
    assert.deepEqual(
      providers.map((provider) => provider.name),
      ["yahoo"],
    );
  } finally {
    if (original != null) {
      process.env.FINNHUB_API_KEY = original;
    }
  }
});
