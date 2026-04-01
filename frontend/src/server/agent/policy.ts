import type {
  AgentRequest,
  CommodityInstrumentSlug,
  CryptoInstrument,
  MacroCountry,
  MacroIndicatorSlug,
} from "@/types/api";

export const AGENT_TOOL_NAMES = [
  "get_stock_overview",
  "get_stock_fundamentals",
  "get_price_history",
  "get_macro_snapshot",
  "get_macro_series",
  "suggest_data_export",
  "get_commodity_overview",
  "get_commodity_price_history",
  "get_crypto_overview",
  "get_crypto_price_history",
  "get_sec_filings",
  "get_news",
  "get_context_news",
] as const;

export type AgentToolName = (typeof AGENT_TOOL_NAMES)[number];

export type AgentAnswerMode = "analysis" | "decline";

export type AgentPolicy = {
  mode: AgentAnswerMode;
  requiredTools: AgentToolName[];
  allowedTools: AgentToolName[];
  strictSubject: "ticker" | "macro" | "commodity" | "crypto" | "general";
  preferredMacroIndicator?: MacroIndicatorSlug;
  preferredMacroCountry?: MacroCountry;
  preferredCryptoInstrument?: CryptoInstrument;
  preferredCommodityInstrument?: CommodityInstrumentSlug;
  declineMessage?: string;
  answerGuidance: string[];
};

const MACRO_TOOLS: AgentToolName[] = [
  "get_macro_snapshot",
  "get_macro_series",
  "get_news",
  "get_context_news",
];

const GENERAL_TOOLS: AgentToolName[] = [...AGENT_TOOL_NAMES];

const SUPPORTED_COMMODITY_LIST =
  "Gold, Silver, WTI Crude Oil, Brent Crude Oil, Natural Gas, Copper, Gasoline, Aluminum, Wheat, Coffee, Cocoa, Heating Oil, Propane, Coal, Uranium, and the All Commodities Index";

function uniqueTools(tools: AgentToolName[]): AgentToolName[] {
  return Array.from(new Set(tools));
}

function normalizeQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-");
}

function detectMacroCountry(query: string): MacroCountry | undefined {
  if (/\b(france|french)\b/i.test(query)) {
    return "fr";
  }

  if (/\b(united states|u\.s\.|us)\b/i.test(query)) {
    return "us";
  }

  return undefined;
}

function detectMacroIndicators(query: string): MacroIndicatorSlug[] {
  const indicators: MacroIndicatorSlug[] = [];

  if (/\b(cpi|inflation)\b/i.test(query)) {
    indicators.push("cpi");
  }

  if (/\b(unemployment|labor|labour|jobless)\b/i.test(query)) {
    indicators.push("unemployment");
  }

  if (/\b(gdp|growth)\b/i.test(query)) {
    indicators.push("gdp-growth");
  }

  if (/\b(10[- ]?year|10y|treasury yield|government bond yield|yield)\b/i.test(query)) {
    indicators.push("treasury-10y");
  }

  if (/\b(fed funds|policy rate|deposit facility|rates?)\b/i.test(query)) {
    indicators.push("fed-funds");
  }

  return Array.from(new Set(indicators));
}

function isExplicitMacroSnapshotQuery(query: string): boolean {
  return /\b(snapshot|at a glance|latest readings|latest reading|right now|as of today|current|latest)\b/i.test(
    query,
  );
}

function isTrendOrHistoryQuery(query: string): boolean {
  return /\b(trend|trending|history|historical|over the last|over the past|past \d|last \d|last month|last year|five years|three years|ten years|still near|highs?|lows?|range|how has|has .* been|improving|deteriorating|rolled over|price action|traded)\b/i.test(
    query,
  );
}

function isNewsQuestion(query: string): boolean {
  return /\b(news|headline|headlines|article|articles|catalyst)\b/i.test(query);
}

function isDriverQuestion(query: string): boolean {
  return /\b(driver|drivers|what matters|what moved|what is driving|backdrop|risk|risks|geopolitic(?:s|al)?|affect(?:ing|ed|s)?|impact(?:ing|ed|s)?|broader market|market context|broader context|world market|global risk|global risks)\b/i.test(
    query,
  );
}

function isFilingQuestion(query: string): boolean {
  return /\b(10-k|10-q|filing|risk factors|mda|md&a|sec)\b/i.test(query);
}

function isFundamentalsQuestion(query: string): boolean {
  return /\b(fundamentals?|valuation|profitability|margin|margins|return on equity|roe|p\/e|eps|revenue|ebitda)\b/i.test(
    query,
  );
}

function isMultiDriverStockQuestion(query: string): boolean {
  return (
    isNewsQuestion(query) &&
    isFundamentalsQuestion(query) &&
    /\b(price|price action|overview|snapshot|momentum|right now|one view|driver|drivers)\b/i.test(
      query,
    )
  );
}

function isStockHistoryQuestion(query: string): boolean {
  return isTrendOrHistoryQuery(query) ||
    /\b(month|year|summer|traded|momentum)\b/i.test(query);
}

function isCommodityHistoryQuestion(query: string): boolean {
  return isTrendOrHistoryQuery(query) ||
    /\b(today|session|compare|month|year)\b/i.test(query);
}

function isCryptoHistoryQuestion(query: string): boolean {
  return isTrendOrHistoryQuery(query) ||
    /\b(today|session|compare)\b/i.test(query);
}

function isBenchmarkQuestion(query: string): boolean {
  return /\b(s&p|s and p|sp500|benchmark|nasdaq|dow|index)\b/i.test(query);
}

function mentionsUnsupportedMacroMetric(query: string): boolean {
  return /\b(pmi|pce|retail sales|payrolls)\b/i.test(query);
}

function mentionsUnsupportedCommodity(query: string): boolean {
  return /\b(corn|soybeans?|soybean|sugar|cotton|palladium|platinum)\b/i.test(query);
}

function mentionsUnsupportedCommoditySurface(query: string): boolean {
  return /\b(company fundamentals?|fundamentals? behind|inventor(?:y|ies)|supply)\b/i.test(
    query,
  );
}

function mentionsUnsupportedCryptoMarket(query: string): boolean {
  return /\b(sol|solana|doge|dogecoin|xrp|ripple|ada|cardano|bnb)\b/i.test(query);
}

function mentionsUnsupportedCryptoSurface(query: string): boolean {
  return /\b(on-chain|exchange flows|other exchanges|coinbase|binance|token fundamentals?)\b/i.test(
    query,
  );
}

function looksMacroQuery(query: string): boolean {
  return (
    detectMacroIndicators(query).length > 0 ||
    /\b(macro|inflation|rates?|fed|cpi|gdp|growth|unemployment|yield|treasury)\b/i.test(query)
  );
}

function looksCryptoQuery(query: string): boolean {
  return /\b(bitcoin|btc|ethereum|eth|crypto|funding|open interest|mark price|perpetual)\b/i.test(
    query,
  );
}

function looksCommodityQuery(query: string): boolean {
  return /\b(commodity|commodities|gold|silver|oil|wti|brent|natural gas|copper|gasoline|aluminum|wheat|coffee|cocoa|heating oil|propane|coal|uranium)\b/i.test(
    query,
  );
}

function looksBroadContextQuery(query: string): boolean {
  const hasBroadCue =
    /\b(global|world|broader|backdrop|market context|broader context|world market|market headlines?|global news|world news|global risks?|geopolitic(?:s|al)?|risk sentiment|get_context_news)\b/i.test(
      query,
    ) ||
    ((isNewsQuestion(query) || isDriverQuestion(query)) &&
      /\b(markets?|world|global)\b/i.test(query));

  if (!hasBroadCue) {
    return false;
  }

  if (looksCommodityQuery(query) || looksCryptoQuery(query)) {
    return false;
  }

  return !/\b(stock|stocks|ticker|tickers|share|shares|company|companies|fundamentals?|valuation|filing|10-k|10-q|sec|earnings)\b/i.test(
    query,
  );
}

function looksStockQuery(query: string): boolean {
  return (
    isNewsQuestion(query) ||
    isFilingQuestion(query) ||
    isFundamentalsQuestion(query) ||
    /\b(stock|stocks|ticker|tickers|shares?|company|companies|compare|overview|snapshot|price action|momentum|watchlist)\b/i.test(
      query,
    ) ||
    (/\b(tell me about|what's going on with|summarize)\b/i.test(query) &&
      !looksBroadContextQuery(query))
  );
}

function buildDeclinePolicy(message: string): AgentPolicy {
  return {
    mode: "decline",
    requiredTools: [],
    allowedTools: [],
    strictSubject: "general",
    declineMessage: message,
    answerGuidance: [],
  };
}

function buildStockPolicy(request: AgentRequest, query: string): AgentPolicy {
  if (isBenchmarkQuestion(query)) {
    return buildDeclinePolicy(
      `I can't compare ${request.ticker?.toUpperCase() ?? "this stock"} against the S&P 500 or another benchmark from the current tool output because this agent does not have benchmark index data in this path. I can still summarize the stock's own supported dashboard data.`,
    );
  }

  const requiredTools: AgentToolName[] = [];
  let allowedTools: AgentToolName[] = ["get_stock_overview"];
  const answerGuidance = [
    `Stay grounded on ticker ${request.ticker?.toUpperCase() ?? "the requested stock"}.`,
    "Do not infer catalysts, earnings, benchmark moves, or macro explanations unless a matching tool returned them.",
  ];

  if (isMultiDriverStockQuestion(query)) {
    requiredTools.push(
      "get_stock_overview",
      "get_stock_fundamentals",
      "get_news",
      "get_context_news",
    );
    allowedTools = [
      "get_stock_overview",
      "get_stock_fundamentals",
      "get_news",
      "get_context_news",
    ];
  } else if (isFilingQuestion(query)) {
    requiredTools.push("get_sec_filings");
    allowedTools = ["get_sec_filings"];
  } else if (isNewsQuestion(query) || isDriverQuestion(query)) {
    requiredTools.push("get_news");
    allowedTools = ["get_news", "get_context_news", "get_stock_overview"];
    if (isDriverQuestion(query)) {
      requiredTools.push("get_context_news");
    }
  } else if (isFundamentalsQuestion(query) && /price|stats|overview|key/i.test(query)) {
    requiredTools.push("get_stock_overview", "get_stock_fundamentals");
    allowedTools = ["get_stock_overview", "get_stock_fundamentals"];
  } else if (isFundamentalsQuestion(query)) {
    requiredTools.push("get_stock_fundamentals");
    allowedTools = ["get_stock_fundamentals"];
  } else if (isStockHistoryQuestion(query)) {
    requiredTools.push("get_price_history");
    allowedTools = ["get_price_history"];
  } else {
    requiredTools.push("get_stock_overview");
    allowedTools = ["get_stock_overview"];
  }

  return {
    mode: "analysis",
    requiredTools: uniqueTools(requiredTools),
    allowedTools: uniqueTools(allowedTools),
    strictSubject: "ticker",
    answerGuidance,
  };
}

function buildBroadContextPolicy(): AgentPolicy {
  return {
    mode: "analysis",
    requiredTools: ["get_context_news"],
    allowedTools: ["get_context_news"],
    strictSubject: "general",
    answerGuidance: [
      "Treat this as a generic broad market, geopolitical, macro, or risk-backdrop request.",
      "Use get_context_news only; do not pivot to focused news or asset-specific tools unless the user explicitly names a supported asset, ticker, or indicator.",
      "Keep the answer at the backdrop level rather than turning it into a stock or company answer.",
    ],
  };
}

function buildMacroPolicy(request: AgentRequest, query: string): AgentPolicy {
  if (mentionsUnsupportedMacroMetric(query)) {
    return buildDeclinePolicy(
      "I don't have PMI or other unsupported macro series in the current tool set. I can answer Fed funds, CPI, GDP growth, 10-year yields, or unemployment for the U.S. or France.",
    );
  }

  const detectedCountry = detectMacroCountry(query) ?? request.country ?? "us";
  const indicators = detectMacroIndicators(query);
  const singleIndicator = indicators.length === 1 ? indicators[0] : undefined;
  const explicitSnapshot = isExplicitMacroSnapshotQuery(query);
  const wantsNewsContext = isNewsQuestion(query) || isDriverQuestion(query);
  const mustUseSeries =
    singleIndicator != null &&
    (!explicitSnapshot ||
      /\b(switch to|compare|trend|history|improving|deteriorating|looks there|look there)\b/i.test(
        query,
      ));

  if (mustUseSeries && singleIndicator) {
    const newsTools: AgentToolName[] = wantsNewsContext
      ? ["get_news", "get_context_news"]
      : [];

    return {
      mode: "analysis",
      requiredTools: uniqueTools(["get_macro_series", ...newsTools]),
      allowedTools: uniqueTools(["get_macro_series", ...newsTools]),
      strictSubject: "macro",
      preferredMacroIndicator: singleIndicator,
      preferredMacroCountry: detectedCountry,
      answerGuidance: [
        `Use ${singleIndicator} for ${detectedCountry === "fr" ? "France" : "the United States"} only.`,
        "Do not answer from snapshot data when the question is about one indicator's trend or history.",
      ],
    };
  }

  const macroNewsTools: AgentToolName[] = wantsNewsContext
    ? ["get_news", "get_context_news"]
    : [];

  return {
    mode: "analysis",
    requiredTools: uniqueTools(["get_macro_snapshot", ...macroNewsTools]),
    allowedTools: MACRO_TOOLS,
    strictSubject: "macro",
    preferredMacroCountry: detectedCountry,
    answerGuidance: [
      `Stay on ${detectedCountry === "fr" ? "France" : "the United States"} unless the user explicitly compares countries.`,
      "Use current/today wording only if the tool dates support it.",
    ],
  };
}

function buildCommodityPolicy(request: AgentRequest, query: string): AgentPolicy {
  if (mentionsUnsupportedCommodity(query)) {
    return buildDeclinePolicy(
      `I don't have that commodity in the current dashboard. The supported commodity dashboards are ${SUPPORTED_COMMODITY_LIST}.`,
    );
  }

  if (mentionsUnsupportedCommoditySurface(query)) {
    return buildDeclinePolicy(
      "I only have commodity market data here: price action, range context, volume, open interest, and benchmark metadata. I do not have company fundamentals, inventory, or supply data in this path.",
    );
  }

  const requiredTools: AgentToolName[] = [];
  let allowedTools: AgentToolName[] = ["get_commodity_overview"];
  const wantsFocusedNews = isNewsQuestion(query);
  const wantsContext = isDriverQuestion(query);

  if (wantsFocusedNews || wantsContext) {
    requiredTools.push("get_commodity_overview");
    allowedTools = ["get_news", "get_context_news", "get_commodity_overview"];
    if (wantsFocusedNews) {
      requiredTools.push("get_news");
    }
    if (wantsContext) {
      requiredTools.push("get_context_news");
    }
  } else if (isCommodityHistoryQuestion(query)) {
    requiredTools.push("get_commodity_price_history");
    allowedTools = ["get_commodity_price_history", "get_commodity_overview"];
  } else {
    requiredTools.push("get_commodity_overview");
    allowedTools = ["get_commodity_overview"];
  }

  return {
    mode: "analysis",
    requiredTools: uniqueTools(requiredTools),
    allowedTools: uniqueTools(allowedTools),
    strictSubject: "commodity",
    preferredCommodityInstrument: request.commodity_instrument ?? undefined,
    answerGuidance: [
      "Stay grounded in the active commodity dashboard only.",
      "For focused headlines, stay on the active commodity rather than using a generic commodities query.",
      "Do not pivot to another commodity after declining an unsupported one.",
    ],
  };
}

function buildCryptoPolicy(request: AgentRequest, query: string): AgentPolicy {
  if (mentionsUnsupportedCryptoMarket(query)) {
    return buildDeclinePolicy(
      "I only support BTC and ETH perpetual market data in the current crypto dashboard.",
    );
  }

  if (mentionsUnsupportedCryptoSurface(query)) {
    return buildDeclinePolicy(
      "I only have Deribit perpetual market data here. I do not have on-chain analytics, token fundamentals, broader exchange coverage, or crypto news in this path.",
    );
  }

  const requiredTools: AgentToolName[] = [];
  let allowedTools: AgentToolName[] = ["get_crypto_overview"];
  const wantsFocusedNews = isNewsQuestion(query);
  const wantsContext = isDriverQuestion(query);

  if (wantsFocusedNews || wantsContext) {
    requiredTools.push("get_crypto_overview");
    allowedTools = ["get_news", "get_context_news", "get_crypto_overview"];
    if (wantsFocusedNews) {
      requiredTools.push("get_news");
    }
    if (wantsContext) {
      requiredTools.push("get_context_news");
    }
  } else if (isCryptoHistoryQuestion(query)) {
    requiredTools.push("get_crypto_price_history");
    allowedTools = ["get_crypto_price_history", "get_crypto_overview"];
  } else {
    requiredTools.push("get_crypto_overview");
    allowedTools = ["get_crypto_overview"];
  }

  return {
    mode: "analysis",
    requiredTools: uniqueTools(requiredTools),
    allowedTools: uniqueTools(allowedTools),
    strictSubject: "crypto",
    preferredCryptoInstrument: request.crypto_instrument ?? undefined,
    answerGuidance: [
      "Stay grounded in the active Deribit instrument only.",
      "For focused headlines, stay on the active crypto instrument rather than using a generic crypto or market query.",
      "Do not convert open interest into a different unit unless the tool output explicitly labels that unit.",
    ],
  };
}

export function createAgentPolicy(request: AgentRequest): AgentPolicy {
  const query = normalizeQuery(request.query);

  if (request.ticker) {
    return buildStockPolicy(request, query);
  }

  if (request.dashboard_context === "macro") {
    return buildMacroPolicy(request, query);
  }

  if (request.dashboard_context === "commodity") {
    return buildCommodityPolicy(request, query);
  }

  if (request.dashboard_context === "crypto") {
    return buildCryptoPolicy(request, query);
  }

  if (looksBroadContextQuery(query)) {
    return buildBroadContextPolicy();
  }

  if (looksMacroQuery(query)) {
    return buildMacroPolicy(request, query);
  }

  if (looksCryptoQuery(query)) {
    return buildCryptoPolicy(request, query);
  }

  if (looksCommodityQuery(query)) {
    return buildCommodityPolicy(request, query);
  }

  if (looksStockQuery(query)) {
    return buildStockPolicy(request, query);
  }

  return {
    mode: "analysis",
    requiredTools: [],
    allowedTools: GENERAL_TOOLS,
    strictSubject: "general",
    answerGuidance: [
      "If the request is vague or conversational, ask a clarifying question instead of forcing a data fetch.",
      "If the request is financial and specific, choose the matching tool family and stay grounded in the returned data.",
    ],
  };
}

export function buildPolicySystemPrompt(policy: AgentPolicy): string {
  if (policy.mode === "decline") {
    return "The request is unsupported in the current tool path. Do not improvise data.";
  }

  const lines = [
    "Policy for this request:",
    `- Allowed tools: ${policy.allowedTools.join(", ")}`,
    `- Required tools before answering: ${policy.requiredTools.join(", ") || "none"}`,
  ];

  for (const guidance of policy.answerGuidance) {
    lines.push(`- ${guidance}`);
  }

  return lines.join("\n");
}

export function getToolPolicyViolations(
  policy: AgentPolicy,
  toolNames: AgentToolName[],
): string[] {
  if (policy.mode === "decline") {
    return ["The request should be declined instead of calling tools."];
  }

  return toolNames.flatMap((toolName) =>
    policy.allowedTools.includes(toolName)
      ? []
      : [`${toolName} is not allowed for this request.`],
  );
}

export function getMissingRequiredTools(
  policy: AgentPolicy,
  observedToolNames: AgentToolName[],
): AgentToolName[] {
  if (policy.mode === "decline") {
    return [];
  }

  return policy.requiredTools.filter(
    (toolName) => !observedToolNames.includes(toolName),
  );
}

export function buildToolCorrectionPrompt(
  policy: AgentPolicy,
  issues: string[],
): string {
  const allowed =
    policy.allowedTools.length > 0
      ? policy.allowedTools.join(", ")
      : "no tools";
  const required =
    policy.requiredTools.length > 0
      ? policy.requiredTools.join(", ")
      : "no specific required tools";

  return [
    "Your last tool plan violated the request policy.",
    `Allowed tools: ${allowed}.`,
    `Required before answering: ${required}.`,
    ...issues.map((issue) => `- ${issue}`),
    "Retry with only allowed tools and do not answer until the required tools have been used.",
  ].join("\n");
}

export function buildDeclineAnswer(policy: AgentPolicy): string {
  return policy.declineMessage ?? "This request is not supported in the current tool path.";
}
