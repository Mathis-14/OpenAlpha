import type {
  AgentRequest,
  CommodityInstrumentSlug,
  CryptoInstrument,
  DataAssetClass,
  MacroCountry,
  MacroIndicatorSlug,
} from "@/types/api";
import {
  buildDataPageHref,
  getDataExportSchema,
  getDefaultDateRange,
  getDisplayAssetName,
} from "@/lib/data-export";
import { normalizeSuggestedDataExportArgs, type SuggestedDataExport } from "@/server/agent/tools";

type DataCandidate = {
  index: number;
  assetClass: DataAssetClass;
  asset: string;
  country?: MacroCountry;
};

export type DataAssistantResult =
  | {
      kind: "plan";
      plan: SuggestedDataExport;
      toolArgs: Record<string, unknown>;
      answer: string;
      displayDownload: {
        href: string;
        label: string;
        description: string;
      };
    }
  | {
      kind: "decline";
      answer: string;
    };

const STOCK_NAME_ALIASES: Record<string, string> = {
  apple: "AAPL",
  microsoft: "MSFT",
  nvidia: "NVDA",
  tesla: "TSLA",
};

const CRYPTO_ALIASES: Array<{ pattern: RegExp; instrument: CryptoInstrument }> = [
  { pattern: /\b(bitcoin|btc)\b/i, instrument: "BTC-PERPETUAL" },
  { pattern: /\b(ethereum|eth)\b/i, instrument: "ETH-PERPETUAL" },
];

const COMMODITY_ALIASES: Array<{ pattern: RegExp; instrument: CommodityInstrumentSlug }> = [
  { pattern: /\bgold\b/i, instrument: "gold" },
  { pattern: /\bsilver\b/i, instrument: "silver" },
  { pattern: /\b(wti|crude oil|oil)\b/i, instrument: "wti" },
  { pattern: /\bbrent\b/i, instrument: "brent" },
  { pattern: /\bnatural gas|nat gas\b/i, instrument: "natural-gas" },
  { pattern: /\bcopper\b/i, instrument: "copper" },
  { pattern: /\bgasoline\b/i, instrument: "gasoline" },
  { pattern: /\baluminum|aluminium\b/i, instrument: "aluminum" },
  { pattern: /\bwheat\b/i, instrument: "wheat" },
  { pattern: /\bcoffee\b/i, instrument: "coffee" },
  { pattern: /\bcocoa\b/i, instrument: "cocoa" },
  { pattern: /\bheating oil\b/i, instrument: "heating-oil" },
  { pattern: /\bpropane\b/i, instrument: "propane" },
  { pattern: /\bcoal\b/i, instrument: "coal" },
  { pattern: /\buranium\b/i, instrument: "uranium" },
  { pattern: /\ball commodities|commodities index\b/i, instrument: "all-commodities-index" },
];

const MACRO_INDICATOR_ALIASES: Array<{
  pattern: RegExp;
  indicator: MacroIndicatorSlug;
}> = [
  { pattern: /\b(cpi|inflation)\b/i, indicator: "cpi" },
  { pattern: /\b(unemployment|jobless)\b/i, indicator: "unemployment" },
  { pattern: /\b(gdp|growth)\b/i, indicator: "gdp-growth" },
  { pattern: /\b(10[- ]?year|10y|treasury yield|bond yield)\b/i, indicator: "treasury-10y" },
  { pattern: /\b(fed funds|policy rate|deposit facility|interest rates?)\b/i, indicator: "fed-funds" },
];

function normalizeQuery(query: string): string {
  return query
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

function detectMacroCountry(query: string, request: AgentRequest): MacroCountry | undefined {
  if (/\b(france|french)\b/i.test(query)) {
    return "fr";
  }

  if (/\b(united states|u\.s\.|us)\b/i.test(query)) {
    return "us";
  }

  return request.country ?? (request.dashboard_context === "macro" ? "us" : undefined);
}

function addCandidate(
  output: DataCandidate[],
  candidate: DataCandidate,
): void {
  if (
    output.some(
      (entry) =>
        entry.assetClass === candidate.assetClass &&
        entry.asset === candidate.asset &&
        entry.country === candidate.country,
    )
  ) {
    return;
  }

  output.push(candidate);
}

function detectExplicitCandidates(query: string, request: AgentRequest): DataCandidate[] {
  const candidates: DataCandidate[] = [];

  if (request.ticker && /\b(this stock|this ticker|here)\b/i.test(query)) {
    addCandidate(candidates, {
      index: -1,
      assetClass: "stock",
      asset: request.ticker.toUpperCase(),
    });
  }

  if (
    request.dashboard_context === "commodity" &&
    request.commodity_instrument &&
    /\b(this commodity|this market|here)\b/i.test(query)
  ) {
    addCandidate(candidates, {
      index: -1,
      assetClass: "commodity",
      asset: request.commodity_instrument,
    });
  }

  if (
    request.dashboard_context === "crypto" &&
    request.crypto_instrument &&
    /\b(this market|here|this instrument)\b/i.test(query)
  ) {
    addCandidate(candidates, {
      index: -1,
      assetClass: "crypto",
      asset: request.crypto_instrument,
    });
  }

  for (const [name, ticker] of Object.entries(STOCK_NAME_ALIASES)) {
    const index = query.toLowerCase().indexOf(name);
    if (index >= 0) {
      addCandidate(candidates, {
        index,
        assetClass: "stock",
        asset: ticker,
      });
    }
  }

  for (const match of query.matchAll(/\b[A-Z]{2,5}\b/g)) {
    const symbol = match[0];
    if (
      symbol === "BTC" ||
      symbol === "ETH" ||
      symbol === "CPI" ||
      symbol === "GDP" ||
      symbol === "CSV" ||
      symbol === "RAW"
    ) {
      continue;
    }

    addCandidate(candidates, {
      index: match.index ?? 0,
      assetClass: "stock",
      asset: symbol,
    });
  }

  for (const crypto of CRYPTO_ALIASES) {
    const match = crypto.pattern.exec(query);
    if (match) {
      addCandidate(candidates, {
        index: match.index,
        assetClass: "crypto",
        asset: crypto.instrument,
      });
    }
  }

  for (const commodity of COMMODITY_ALIASES) {
    const match = commodity.pattern.exec(query);
    if (match) {
      addCandidate(candidates, {
        index: match.index,
        assetClass: "commodity",
        asset: commodity.instrument,
      });
    }
  }

  const macroCountry = detectMacroCountry(query, request);
  for (const indicator of MACRO_INDICATOR_ALIASES) {
    const match = indicator.pattern.exec(query);
    if (match) {
      addCandidate(candidates, {
        index: match.index,
        assetClass: "macro",
        asset: indicator.indicator,
        country: macroCountry ?? "us",
      });
    }
  }

  if (candidates.length === 0 && request.dashboard_context === "macro") {
      const fallbackCountry = request.country ?? "us";
      const firstMacroIndicator =
        MACRO_INDICATOR_ALIASES.find((item) => item.pattern.test(query))?.indicator;

      if (firstMacroIndicator) {
        addCandidate(candidates, {
          index: query.length,
          assetClass: "macro",
          asset: firstMacroIndicator,
          country: fallbackCountry,
        });
      }
  }

  return candidates.sort((left, right) => left.index - right.index);
}

function detectUnsupportedSurface(query: string): string | null {
  if (/\b(options?|greeks?|implied vol|volatility surface|vol surface)\b/i.test(query)) {
    return "Options Greeks and volatility-surface exports are not supported by the current Get the data tool.";
  }

  if (/\b(filings?|sec filings?|news)\b/i.test(query)) {
    return "Filings and news exports are not supported here. The current Get the data tool only supports raw market and macro CSV exports.";
  }

  if (/\b(shipping|freight)\b/i.test(query)) {
    return "Shipping-rate and freight datasets are not supported by the current Get the data tool.";
  }

  return null;
}

function detectBundleIntent(query: string): boolean {
  return /\b(bundle|zip|one dataset|single dataset|one file|same file)\b/i.test(query);
}

function requestsFirstExport(query: string): boolean {
  return /\b(first export|one export first|start with|start me with)\b/i.test(query);
}

function detectImplicitMacroCandidate(
  query: string,
  request: AgentRequest,
): DataCandidate | null {
  const country = detectMacroCountry(query, request) ?? "us";

  if (/\b(recession|slowdown|downturn|hard landing|soft landing)\b/i.test(query)) {
    return {
      index: query.length,
      assetClass: "macro",
      asset: "unemployment",
      country,
    };
  }

  if (/\b(inflation shock|pricing pressure|disinflation)\b/i.test(query)) {
    return {
      index: query.length,
      assetClass: "macro",
      asset: "cpi",
      country,
    };
  }

  return null;
}

function parseDateRange(
  query: string,
  assetClass: DataAssetClass,
): { start_date: string; end_date: string; range_preset?: "1mo" | "3mo" | "1y" | "5y" } {
  const exactDates = [
    ...query.matchAll(/\b(20\d{2}-\d{2}-\d{2})\b/g),
  ].map((match) => match[1]);

  if (exactDates.length >= 2) {
    return {
      start_date: exactDates[0],
      end_date: exactDates[1],
    };
  }

  if (/\b(last|past)\s+(five|5)\s+years?\b/i.test(query)) {
    const range = getDefaultDateRange(assetClass === "macro" ? "macro" : assetClass);
    return {
      start_date: range.startDate,
      end_date: range.endDate,
      range_preset: "5y",
    };
  }

  if (/\b(last|past)\s+(three|3)\s+months?\b/i.test(query)) {
    const range = getDefaultDateRange(assetClass);
    return {
      start_date: range.startDate,
      end_date: range.endDate,
      range_preset: "3mo",
    };
  }

  if (/\b(last|past)\s+(year|12 months?)\b/i.test(query)) {
    const range = getDefaultDateRange(assetClass);
    return {
      start_date: range.startDate,
      end_date: range.endDate,
      range_preset: "1y",
    };
  }

  if (/\b(last|past)\s+month\b/i.test(query)) {
    const range = getDefaultDateRange(assetClass);
    return {
      start_date: range.startDate,
      end_date: range.endDate,
      range_preset: "1mo",
    };
  }

  const range = getDefaultDateRange(assetClass === "macro" ? "macro" : assetClass);
  return {
    start_date: range.startDate,
    end_date: range.endDate,
  };
}

function buildReason(
  query: string,
  assetClass: DataAssetClass,
  asset: string,
  multipleTargets: DataCandidate[],
): string {
  if (assetClass === "stock" && /\bearnings\b/i.test(query)) {
    return "This gives you the daily price series needed to line up post-earnings moves in your own analysis.";
  }

  if (assetClass === "crypto" && /\bfunding\b/i.test(query)) {
    return "This is the supported raw price export for the selected perpetual market; use it as the starting dataset for funding-related research.";
  }

  if (multipleTargets.length > 1) {
    return "This is the first supported export to start with. The remaining targets should be exported separately.";
  }

  if (assetClass === "macro") {
    return "This is the cleanest first macro CSV for the request.";
  }

  if (assetClass === "commodity") {
    return "This gives you the supported raw commodity series for the request.";
  }

  return `This is the supported raw CSV export for ${getDisplayAssetName(assetClass, asset)}.`;
}

function buildPlanAnswer(
  plan: SuggestedDataExport,
  query: string,
  extraCandidates: DataCandidate[],
): string {
  const schema = getDataExportSchema(plan.asset_class, plan.asset);
  const assetName = getDisplayAssetName(plan.asset_class, plan.asset, plan.country);
  const lines = [
    "Export plan prepared.",
    `- Asset: ${assetName}`,
    `- Format: ${schema === "ohlcv" ? "Daily OHLCV CSV" : "Date, value CSV"}`,
    `- Date range: ${plan.start_date} to ${plan.end_date}`,
    `- Why: ${plan.reason ?? buildReason(query, plan.asset_class, plan.asset, extraCandidates)}`,
  ];

  if (extraCandidates.length > 1 || detectBundleIntent(query)) {
    const nextTargets = extraCandidates
      .slice(1, 3)
      .map((candidate) =>
        getDisplayAssetName(
          candidate.assetClass,
          candidate.asset,
          candidate.country,
        ),
      );

    if (nextTargets.length > 0) {
      lines.push(
        `Start with this export first. After that, export ${nextTargets.join(" and ")} separately.`,
      );
    } else {
      lines.push("This tool supports one export at a time rather than a bundled file.");
    }
  }

  if (extraCandidates.length <= 1 && requestsFirstExport(query)) {
    lines.push("Start with this export first.");
  }

  lines.push("Open the details and click Download CSV.");
  return lines.join("\n");
}

function buildDeclineAnswer(message: string): string {
  return [
    message,
    "",
    "Supported exports here are:",
    "- Stocks, crypto, and Yahoo-backed commodities as daily OHLCV CSVs",
    "- Macro and FRED-backed commodities as date,value CSVs",
  ].join("\n");
}

export function isDataPlanningQuery(request: AgentRequest): boolean {
  return request.dashboard_context === "data" ||
    /\b(csv|download|export|dataset|raw data|data file|one file|zip|bundle)\b/i.test(request.query);
}

export function resolveDataAssistantResult(
  request: AgentRequest,
): DataAssistantResult {
  const query = normalizeQuery(request.query);
  const candidates = detectExplicitCandidates(query, request);
  const unsupportedSurface = detectUnsupportedSurface(query);

  if (unsupportedSurface) {
    return {
      kind: "decline",
      answer: buildDeclineAnswer(unsupportedSurface),
    };
  }

  if (candidates.length === 0) {
    const implicitMacroCandidate = detectImplicitMacroCandidate(query, request);
    if (implicitMacroCandidate) {
      candidates.push(implicitMacroCandidate);
    }
  }

  if (candidates.length === 0) {
    return {
      kind: "decline",
      answer: buildDeclineAnswer(
        "I could not map this request to one supported export target.",
      ),
    };
  }

  const primary = candidates[0];
  const dates = parseDateRange(query, primary.assetClass);
  const reason = buildReason(query, primary.assetClass, primary.asset, candidates);
  const toolArgs: Record<string, unknown> = {
    asset_class: primary.assetClass,
    asset: primary.asset,
    start_date: dates.start_date,
    end_date: dates.end_date,
    reason,
  };

  if (primary.assetClass === "macro") {
    toolArgs.country = primary.country ?? detectMacroCountry(query, request) ?? "us";
  }

  if (dates.range_preset) {
    toolArgs.range_preset = dates.range_preset;
  }

  const plan = normalizeSuggestedDataExportArgs(toolArgs);
  const href = buildDataPageHref({
    asset_class: plan.asset_class,
    asset: plan.asset,
    country: plan.country,
    start_date: plan.start_date,
    end_date: plan.end_date,
    assistant_ready: true,
  });
  const description = `Open the raw CSV export tool prefilled for ${getDisplayAssetName(plan.asset_class, plan.asset, plan.country)} from ${plan.start_date} to ${plan.end_date}.`;

  return {
    kind: "plan",
    plan,
    toolArgs,
    answer: buildPlanAnswer(plan, query, candidates),
    displayDownload: {
      href,
      label: "Get the data with details",
      description,
    },
  };
}
