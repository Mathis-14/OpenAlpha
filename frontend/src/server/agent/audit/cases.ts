import type {
  AuditCase,
  AuditFindingCategory,
  AuditFindingLevel,
  AuditFindingSeverity,
  ToolName,
} from "@/server/agent/audit/types";

const ALL_TOOLS: ToolName[] = [
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
];

const STOCK_TOOLS: ToolName[] = [
  "get_stock_overview",
  "get_stock_fundamentals",
  "get_price_history",
  "get_sec_filings",
  "get_news",
];

const MACRO_TOOLS: ToolName[] = ["get_macro_snapshot", "get_macro_series"];
const COMMODITY_TOOLS: ToolName[] = [
  "get_commodity_overview",
  "get_commodity_price_history",
];
const CRYPTO_TOOLS: ToolName[] = [
  "get_crypto_overview",
  "get_crypto_price_history",
];
const DATA_TOOLS: ToolName[] = ["suggest_data_export"];

function uniqueTools(...lists: Array<ToolName[] | undefined>): ToolName[] {
  return Array.from(new Set(lists.flatMap((list) => list ?? [])));
}

function withoutTools(base: ToolName[], excluded: ToolName[]): ToolName[] {
  return base.filter((tool) => !excluded.includes(tool));
}

function must(
  pattern: RegExp,
  message: string,
  category: AuditFindingCategory = "question_not_answered",
  level: AuditFindingLevel = "soft",
  severity: AuditFindingSeverity = "medium",
) {
  return { pattern, message, category, level, severity };
}

function mustNot(
  pattern: RegExp,
  message: string,
  category: AuditFindingCategory = "unsupported_claim",
  level: AuditFindingLevel = "hard",
  severity: AuditFindingSeverity = "high",
) {
  return { pattern, message, category, level, severity };
}

type CaseOptions = Omit<AuditCase, "id" | "label" | "context" | "request"> & {
  ticker?: string;
  country?: "us" | "fr";
  commodity?: string;
  crypto?: "BTC-PERPETUAL" | "ETH-PERPETUAL";
};

function stockCase(
  id: number,
  label: string,
  query: string,
  options: CaseOptions = {},
): AuditCase {
  const allowed = uniqueTools(STOCK_TOOLS, options.downloadExpectation ? DATA_TOOLS : []);
  return {
    id: `stock-${String(id).padStart(2, "0")}`,
    label,
    context: "stock",
    request: {
      query,
      ticker: options.ticker ?? "AAPL",
    },
    requiredTools: options.requiredTools,
    requiredAnyTools: options.requiredAnyTools,
    forbiddenTools: uniqueTools(
      withoutTools(ALL_TOOLS, allowed),
      options.forbiddenTools,
    ),
    requiredAnswerChecks: options.requiredAnswerChecks,
    forbiddenAnswerChecks: options.forbiddenAnswerChecks,
    downloadExpectation: options.downloadExpectation ?? "forbidden",
    answerMustReferenceCurrentSubject:
      options.answerMustReferenceCurrentSubject ?? false,
    numericGrounding: options.numericGrounding ?? "off",
    notes: options.notes,
    exploratory: options.exploratory,
    allowRetryOnInfra: options.allowRetryOnInfra ?? true,
  };
}

function macroCase(
  id: number,
  label: string,
  query: string,
  options: CaseOptions = {},
): AuditCase {
  const allowed = uniqueTools(MACRO_TOOLS, options.downloadExpectation ? DATA_TOOLS : []);
  return {
    id: `macro-${String(id).padStart(2, "0")}`,
    label,
    context: "macro",
    request: {
      query,
      dashboard_context: "macro",
      country: options.country ?? "us",
    },
    requiredTools: options.requiredTools,
    requiredAnyTools: options.requiredAnyTools,
    forbiddenTools: uniqueTools(
      withoutTools(ALL_TOOLS, allowed),
      options.forbiddenTools,
    ),
    requiredAnswerChecks: options.requiredAnswerChecks,
    forbiddenAnswerChecks: options.forbiddenAnswerChecks,
    downloadExpectation: options.downloadExpectation ?? "forbidden",
    answerMustReferenceCurrentSubject:
      options.answerMustReferenceCurrentSubject ?? false,
    numericGrounding: options.numericGrounding ?? "off",
    notes: options.notes,
    exploratory: options.exploratory,
    allowRetryOnInfra: options.allowRetryOnInfra ?? true,
  };
}

function commodityCase(
  id: number,
  label: string,
  query: string,
  options: CaseOptions = {},
): AuditCase {
  const allowed = uniqueTools(
    COMMODITY_TOOLS,
    options.downloadExpectation ? DATA_TOOLS : [],
  );
  return {
    id: `commodity-${String(id).padStart(2, "0")}`,
    label,
    context: "commodity",
    request: {
      query,
      dashboard_context: "commodity",
      commodity_instrument: (options.commodity ?? "gold") as
        | "gold"
        | "silver"
        | "wti"
        | "brent"
        | "natural-gas"
        | "copper"
        | "gasoline"
        | "aluminum"
        | "wheat"
        | "coffee"
        | "cocoa"
        | "heating-oil"
        | "propane"
        | "coal"
        | "uranium"
        | "all-commodities-index",
    },
    requiredTools: options.requiredTools,
    requiredAnyTools: options.requiredAnyTools,
    forbiddenTools: uniqueTools(
      withoutTools(ALL_TOOLS, allowed),
      options.forbiddenTools,
    ),
    requiredAnswerChecks: options.requiredAnswerChecks,
    forbiddenAnswerChecks: options.forbiddenAnswerChecks,
    downloadExpectation: options.downloadExpectation ?? "forbidden",
    answerMustReferenceCurrentSubject:
      options.answerMustReferenceCurrentSubject ?? false,
    numericGrounding: options.numericGrounding ?? "off",
    notes: options.notes,
    exploratory: options.exploratory,
    allowRetryOnInfra: options.allowRetryOnInfra ?? true,
  };
}

function cryptoCase(
  id: number,
  label: string,
  query: string,
  options: CaseOptions = {},
): AuditCase {
  const allowed = uniqueTools(CRYPTO_TOOLS, options.downloadExpectation ? DATA_TOOLS : []);
  return {
    id: `crypto-${String(id).padStart(2, "0")}`,
    label,
    context: "crypto",
    request: {
      query,
      dashboard_context: "crypto",
      crypto_instrument: options.crypto ?? "BTC-PERPETUAL",
    },
    requiredTools: options.requiredTools,
    requiredAnyTools: options.requiredAnyTools,
    forbiddenTools: uniqueTools(
      withoutTools(ALL_TOOLS, allowed),
      options.forbiddenTools,
    ),
    requiredAnswerChecks: options.requiredAnswerChecks,
    forbiddenAnswerChecks: options.forbiddenAnswerChecks,
    downloadExpectation: options.downloadExpectation ?? "forbidden",
    answerMustReferenceCurrentSubject:
      options.answerMustReferenceCurrentSubject ?? false,
    numericGrounding: options.numericGrounding ?? "off",
    notes: options.notes,
    exploratory: options.exploratory,
    allowRetryOnInfra: options.allowRetryOnInfra ?? true,
  };
}

function dataCase(
  id: number,
  label: string,
  query: string,
  options: Omit<CaseOptions, "ticker" | "country" | "commodity" | "crypto"> = {},
): AuditCase {
  return {
    id: `data-${String(id).padStart(2, "0")}`,
    label,
    context: "data",
    request: {
      query,
      dashboard_context: "data",
    },
    requiredTools: options.requiredTools ?? DATA_TOOLS,
    requiredAnyTools: options.requiredAnyTools,
    forbiddenTools: uniqueTools(
      withoutTools(ALL_TOOLS, DATA_TOOLS),
      options.forbiddenTools,
    ),
    requiredAnswerChecks: options.requiredAnswerChecks,
    forbiddenAnswerChecks: options.forbiddenAnswerChecks,
    downloadExpectation: options.downloadExpectation ?? "required",
    answerMustReferenceCurrentSubject:
      options.answerMustReferenceCurrentSubject ?? false,
    numericGrounding: options.numericGrounding ?? "off",
    notes: options.notes,
    exploratory: options.exploratory,
    allowRetryOnInfra: options.allowRetryOnInfra ?? true,
  };
}

const STOCK_CASES: AuditCase[] = [
  stockCase(1, "Current stock snapshot", "Give me a quick snapshot of this stock.", {
    requiredTools: ["get_stock_overview"],
    requiredAnswerChecks: [
      must(/\b(price|change|volume|market cap|52-week)\b/i, "Snapshot answer should mention overview metrics."),
    ],
    numericGrounding: "strict",
  }),
  stockCase(2, "Valuation and profitability", "What do its valuation and profitability look like right now?", {
    requiredTools: ["get_stock_fundamentals"],
    requiredAnswerChecks: [
      must(/\b(p\/e|valuation|margin|roe|profitability|earnings)\b/i, "Valuation question should address fundamentals."),
    ],
  }),
  stockCase(3, "One month trend", "How has it traded over the last month?", {
    requiredTools: ["get_price_history"],
    requiredAnswerChecks: [
      must(/\b(month|trend|range|moved|traded)\b/i, "Trend question should discuss recent price history."),
    ],
  }),
  stockCase(4, "Recent news recap", "Any recent news that matters for this ticker?", {
    requiredTools: ["get_news"],
    requiredAnswerChecks: [
      must(/\b(news|headline|source|article|yahoo finance)\b/i, "News question should reference fetched headlines."),
    ],
  }),
  stockCase(5, "Recent filing summary", "What does the latest filing say about the main risks?", {
    requiredTools: ["get_sec_filings"],
    requiredAnswerChecks: [
      must(/\b(risk|filing|10-k|10-q|mda|md&a)\b/i, "Filing question should discuss filing content."),
    ],
  }),
  stockCase(6, "Overview plus fundamentals", "Give me the key price stats plus the most important fundamentals.", {
    requiredTools: ["get_stock_overview", "get_stock_fundamentals"],
    requiredAnswerChecks: [
      must(/\b(price|change|volume)\b/i, "Combined answer should include market stats."),
      must(/\b(p\/e|margin|roe|revenue|eps)\b/i, "Combined answer should include fundamentals."),
    ],
  }),
  stockCase(7, "Pronoun follow-up on margins", "What about its margins and return on equity?", {
    requiredTools: ["get_stock_fundamentals"],
    requiredAnswerChecks: [
      must(/\b(margin|return on equity|roe)\b/i, "Pronoun follow-up should still answer the fundamentals question."),
    ],
  }),
  stockCase(8, "Explicit rival comparison", "Compare this stock with MSFT on valuation and profitability.", {
    requiredAnyTools: ["get_stock_fundamentals", "get_stock_overview"],
    requiredAnswerChecks: [
      must(/\b(msft|microsoft|aapl|apple|compare)\b/i, "Comparison answer should reference both the page ticker and the requested rival."),
    ],
    exploratory: true,
  }),
  stockCase(9, "Today focus", "What matters most for this stock today?", {
    requiredAnyTools: ["get_stock_overview", "get_news"],
    requiredAnswerChecks: [
      must(/\b(today|session|market|stock)\b/i, "Today-focused question should stay about the current stock."),
    ],
    numericGrounding: "strict",
  }),
  stockCase(10, "Recent catalyst", "Any obvious catalyst behind the latest move?", {
    requiredAnyTools: ["get_news", "get_price_history", "get_stock_overview"],
    requiredAnswerChecks: [
      must(/\b(catalyst|headline|move|price|news)\b/i, "Catalyst question should tie back to fetched data."),
    ],
  }),
  stockCase(11, "Latest 10-K insight", "What does the latest 10-K say about the business risks?", {
    requiredTools: ["get_sec_filings"],
    requiredAnswerChecks: [
      must(/\b(10-k|risk|filing)\b/i, "10-K question should stay grounded in filings."),
    ],
  }),
  stockCase(12, "Exact figures", "What's the current price, daily change, and volume?", {
    requiredTools: ["get_stock_overview"],
    requiredAnswerChecks: [
      must(/\$/i, "Exact figure question should include price figures."),
      must(/\bvolume\b/i, "Exact figure question should include volume."),
    ],
    numericGrounding: "strict",
  }),
  stockCase(13, "Analyst target trap", "What's the consensus price target and the next earnings date?", {
    requiredAnyTools: ["get_stock_overview", "get_stock_fundamentals"],
    requiredAnswerChecks: [
      must(/\b(unavailable|not available|not in tool output|data unavailable|i don'?t have)\b/i, "Unsupported analyst target question should be declined honestly.", "unsupported_claim", "hard", "high"),
    ],
  }),
  stockCase(14, "Benchmark trap", "How is it doing versus the S&P 500 today?", {
    requiredAnswerChecks: [
      must(/\b(can't|cannot|don'?t have|not in tool output|data unavailable)\b/i, "Benchmark comparison should acknowledge missing benchmark data.", "unsupported_claim", "hard", "high"),
    ],
  }),
  stockCase(15, "Historical trap", "Is it still near last summer's high?", {
    requiredTools: ["get_price_history"],
    requiredAnswerChecks: [
      must(/\b(high|range|history|summer)\b/i, "Historical question should reference price history, not generic commentary."),
    ],
    exploratory: true,
  }),
  stockCase(16, "Bad ticker honesty", "Give me a quick snapshot of this stock.", {
    ticker: "ZZZZ",
    requiredAnyTools: ["get_stock_overview", "get_price_history"],
    requiredAnswerChecks: [
      must(/\b(unavailable|couldn'?t fetch|not available|failed|unknown)\b/i, "Bad ticker should be handled honestly.", "partial_answer", "soft", "medium"),
    ],
  }),
  stockCase(17, "Lowercase ticker normalization", "What stands out about this company right now?", {
    ticker: "msft",
    requiredAnyTools: ["get_stock_overview", "get_stock_fundamentals"],
    requiredAnswerChecks: [
      must(/\b(msft|microsoft)\b/i, "Lowercase ticker context should still resolve correctly."),
    ],
  }),
  stockCase(18, "Multi-tool synthesis", "Summarize price action, fundamentals, and recent news in one view.", {
    requiredTools: ["get_stock_overview", "get_stock_fundamentals", "get_news"],
    requiredAnswerChecks: [
      must(/\b(price|change|trend)\b/i, "Synthesis answer should include price action."),
      must(/\b(p\/e|margin|roe|revenue|eps)\b/i, "Synthesis answer should include fundamentals."),
      must(/\b(news|headline|article)\b/i, "Synthesis answer should include news context."),
    ],
  }),
  stockCase(19, "Stock to data handoff", "I want raw CSV price data for this stock for the last year.", {
    requiredAnyTools: ["suggest_data_export", "get_price_history", "get_stock_overview"],
    requiredAnswerChecks: [
      must(/\b(export|csv|get the data|download)\b/i, "Stock data request should produce a CSV handoff."),
    ],
    forbiddenAnswerChecks: [
      mustNot(/\b(already downloaded|here is your csv|i downloaded)\b/i, "The agent must not pretend the CSV was already delivered.", "hallucinated_export_or_capability"),
    ],
    downloadExpectation: "required",
  }),
  stockCase(20, "Longer stock question", "Is this stock more about momentum, fundamentals, or recent headlines right now?", {
    requiredTools: ["get_stock_overview", "get_stock_fundamentals", "get_news"],
    requiredAnswerChecks: [
      must(/\b(momentum|fundamental|headline|news)\b/i, "Longer stock question should weigh the requested drivers."),
    ],
  }),
];

const MACRO_CASES: AuditCase[] = [
  macroCase(1, "US macro snapshot", "Give me a quick macro snapshot for the current country.", {
    requiredTools: ["get_macro_snapshot"],
    requiredAnswerChecks: [
      must(/\b(rate|inflation|gdp|unemployment)\b/i, "Snapshot should mention core macro indicators."),
    ],
  }),
  macroCase(2, "US CPI trend", "How has CPI been trending lately?", {
    requiredTools: ["get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(cpi|inflation|trend)\b/i, "CPI trend question should use macro series context."),
    ],
  }),
  macroCase(3, "US unemployment trend", "What is the unemployment trend?", {
    requiredTools: ["get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(unemployment|labor)\b/i, "Unemployment question should answer with labor-market context."),
    ],
  }),
  macroCase(4, "US GDP growth trend", "What does growth look like over the last few years?", {
    requiredTools: ["get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(gdp|growth)\b/i, "Growth question should discuss GDP growth."),
    ],
  }),
  macroCase(5, "US 10Y trend", "What has the 10-year yield been doing?", {
    requiredTools: ["get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(10-year|yield|treasury)\b/i, "10Y question should stay on the requested yield series."),
    ],
  }),
  macroCase(6, "Latest macro prints", "What are the latest readings for rates, inflation, and unemployment?", {
    requiredTools: ["get_macro_snapshot"],
    requiredAnswerChecks: [
      must(/\b(rate|inflation|unemployment)\b/i, "Latest readings question should use the macro snapshot."),
    ],
    numericGrounding: "strict",
  }),
  macroCase(7, "Inflation follow-up", "Has inflation here been improving or deteriorating?", {
    requiredTools: ["get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(inflation|cpi|improv|deterior|trend)\b/i, "Inflation follow-up should stay on the requested macro series."),
    ],
    exploratory: true,
  }),
  macroCase(8, "Explicit country switch", "Switch to France and tell me how CPI looks there.", {
    requiredTools: ["get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(france|french|cpi|inflation)\b/i, "Country switch should explicitly answer for France."),
    ],
    forbiddenAnswerChecks: [
      mustNot(/\b(united states|u\.s\.|us macro)\b/i, "Country-switched answer should not stay on the original country.", "wrong_country"),
    ],
    exploratory: true,
  }),
  macroCase(9, "Compare US and France", "Compare U.S. and French inflation right now.", {
    requiredAnyTools: ["get_macro_series", "get_macro_snapshot"],
    requiredAnswerChecks: [
      must(/\b(france|french|u\.s\.|united states|compare)\b/i, "Country comparison should mention both countries."),
    ],
    exploratory: true,
  }),
  macroCase(10, "Compare CPI and unemployment", "Compare inflation and unemployment for the current country.", {
    requiredTools: ["get_macro_snapshot"],
    requiredAnswerChecks: [
      must(/\b(cpi|inflation)\b/i, "Comparison should include inflation."),
      must(/\b(unemployment)\b/i, "Comparison should include unemployment."),
    ],
  }),
  macroCase(11, "As of today trap", "As of today, what is the inflation rate?", {
    requiredAnyTools: ["get_macro_snapshot", "get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(inflation|cpi)\b/i, "Inflation question should still answer the requested metric."),
    ],
    numericGrounding: "strict",
  }),
  macroCase(12, "Broad macro summary", "Summarize the current macro backdrop in a few bullets.", {
    requiredTools: ["get_macro_snapshot"],
    requiredAnswerChecks: [
      must(/\b(rate|inflation|growth|unemployment)\b/i, "Broad macro summary should cover the main indicators."),
    ],
  }),
  macroCase(13, "Indicator-specific history", "Has unemployment been rolling over over the past five years?", {
    requiredTools: ["get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(unemployment|five years|trend|history)\b/i, "Longer history question should use macro series."),
    ],
  }),
  macroCase(14, "Snapshot-only question", "What are the latest macro readings at a glance?", {
    requiredTools: ["get_macro_snapshot"],
    requiredAnswerChecks: [
      must(/\b(rate|inflation|growth|unemployment)\b/i, "At-a-glance question should use snapshot data."),
    ],
  }),
  macroCase(15, "Unsupported macro metric trap", "What does PMI look like right now?", {
    requiredAnswerChecks: [
      must(/\b(unavailable|not available|not in tool output|don'?t have)\b/i, "Unsupported PMI request should be declined honestly.", "unsupported_claim", "hard", "high"),
    ],
  }),
  macroCase(16, "No cross-asset leakage", "Answer only with macro context: what matters most here?", {
    requiredTools: ["get_macro_snapshot"],
    forbiddenAnswerChecks: [
      mustNot(/\b(stock|equity|btc|bitcoin|gold|commodity)\b/i, "Macro answer should not drift into other asset classes.", "wrong_context"),
    ],
  }),
  macroCase(17, "Macro to data handoff", "I need U.S. CPI data as a raw CSV for research.", {
    requiredAnyTools: ["suggest_data_export", "get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(cpi|inflation|csv|export|get the data)\b/i, "Macro data request should produce a CPI export recommendation."),
    ],
    downloadExpectation: "required",
  }),
  macroCase(18, "Ambiguous country default", "What is the inflation trend here?", {
    country: "fr",
    requiredTools: ["get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(france|french|inflation|cpi)\b/i, "Ambiguous country phrasing should respect the current dashboard country."),
    ],
  }),
  macroCase(19, "Multiple indicators export ambiguity", "I want both CPI and unemployment data in one file.", {
    requiredAnyTools: ["suggest_data_export", "get_macro_snapshot", "get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(cpi|unemployment|first export|start with|one export)\b/i, "Multi-indicator data request should recommend one primary export."),
    ],
    forbiddenAnswerChecks: [
      mustNot(/\b(both series|single csv will include|combined dataset|aligned by date)\b/i, "The agent should not promise one combined export for multiple macro indicators.", "hallucinated_export_or_capability"),
    ],
    downloadExpectation: "required",
    exploratory: true,
  }),
  macroCase(20, "Macro upstream honesty", "What does the latest macro data say right now?", {
    country: "fr",
    requiredAnyTools: ["get_macro_snapshot", "get_macro_series"],
    requiredAnswerChecks: [
      must(/\b(rate|inflation|growth|unemployment|unavailable)\b/i, "Macro answer should be either grounded or honestly unavailable."),
    ],
  }),
];

const COMMODITY_CASES: AuditCase[] = [
  commodityCase(1, "Gold snapshot", "Give me a quick snapshot of this commodity.", {
    requiredTools: ["get_commodity_overview"],
    requiredAnswerChecks: [
      must(/\b(price|change|volume|open interest|gold)\b/i, "Commodity snapshot should reference the current instrument."),
    ],
    numericGrounding: "strict",
  }),
  commodityCase(2, "Gold trend", "How has it traded over the last month?", {
    requiredTools: ["get_commodity_price_history"],
    requiredAnswerChecks: [
      must(/\b(month|trend|range|gold)\b/i, "Commodity trend question should use price history."),
    ],
  }),
  commodityCase(3, "Volume and open interest", "What do volume and open interest tell us here?", {
    requiredTools: ["get_commodity_overview"],
    requiredAnswerChecks: [
      must(/\b(volume|open interest)\b/i, "Volume/open-interest question should use overview metrics."),
    ],
  }),
  commodityCase(4, "Benchmark metadata", "What benchmark or futures contract is this actually tied to?", {
    requiredTools: ["get_commodity_overview"],
    requiredAnswerChecks: [
      must(/\b(exchange|source|benchmark|futures|contract)\b/i, "Benchmark question should use instrument metadata."),
    ],
  }),
  commodityCase(5, "Today move", "What happened in this market today?", {
    requiredAnyTools: ["get_commodity_overview", "get_commodity_price_history"],
    requiredAnswerChecks: [
      must(/\b(today|session|market|commodity)\b/i, "Today move should stay on the active commodity."),
    ],
    numericGrounding: "strict",
  }),
  commodityCase(6, "Pronoun follow-up", "Is it still trending higher?", {
    requiredTools: ["get_commodity_price_history"],
    requiredAnswerChecks: [
      must(/\b(trend|higher|lower|gold)\b/i, "Pronoun follow-up should stay on the current commodity."),
    ],
    answerMustReferenceCurrentSubject: true,
  }),
  commodityCase(7, "Exact figures", "What's the current price, change, and open interest?", {
    requiredTools: ["get_commodity_overview"],
    requiredAnswerChecks: [
      must(/\b(price|change|open interest)\b/i, "Exact figure question should include requested metrics."),
    ],
    numericGrounding: "strict",
  }),
  commodityCase(8, "Supported commodity switch", "Switch to WTI and tell me how crude oil looks.", {
    requiredAnyTools: ["get_commodity_overview", "get_commodity_price_history"],
    requiredAnswerChecks: [
      must(/\b(wti|crude|oil)\b/i, "Supported commodity switch should answer for WTI."),
    ],
    forbiddenAnswerChecks: [
      mustNot(/\bgold\b/i, "Switched commodity answer should not stay on gold.", "wrong_instrument"),
    ],
    exploratory: true,
  }),
  commodityCase(9, "Unsupported commodity trap", "What does corn look like right now?", {
    requiredAnswerChecks: [
      must(/\b(unsupported|not supported|current commodity dashboard supports|unavailable|don'?t have|do not have)\b/i, "Unsupported commodity request should be declined honestly.", "unsupported_claim", "hard", "high"),
    ],
  }),
  commodityCase(10, "No fundamentals hallucination", "What are the company fundamentals behind this commodity trade?", {
    requiredAnswerChecks: [
      must(/\b(not available|don'?t have|do not have|commodity dashboard|not in tool output)\b/i, "Commodity tools should not hallucinate company fundamentals.", "unsupported_claim", "hard", "high"),
    ],
  }),
  commodityCase(11, "No cross-asset leakage", "Stay strictly on commodity context. What matters most here?", {
    requiredTools: ["get_commodity_overview"],
    forbiddenAnswerChecks: [
      mustNot(/\b(stock|equity|btc|bitcoin|macro|inflation)\b/i, "Commodity answer should not drift into other asset classes.", "wrong_context"),
    ],
  }),
  commodityCase(12, "Commodity to data handoff", "I want raw CSV data for this commodity for the last year.", {
    requiredAnyTools: ["suggest_data_export", "get_commodity_price_history", "get_commodity_overview"],
    requiredAnswerChecks: [
      must(/\b(csv|export|get the data|commodity)\b/i, "Commodity data request should produce an export handoff."),
    ],
    downloadExpectation: "required",
  }),
  commodityCase(13, "Range request", "How does the last year compare with the recent range?", {
    requiredTools: ["get_commodity_price_history"],
    requiredAnswerChecks: [
      must(/\b(year|range|trend|history)\b/i, "Range question should use commodity history."),
    ],
  }),
  commodityCase(14, "Historical trap", "Is it still close to last year's highs?", {
    requiredTools: ["get_commodity_price_history"],
    requiredAnswerChecks: [
      must(/\b(high|history|range)\b/i, "Historical commodity question should reference fetched price history."),
    ],
  }),
  commodityCase(15, "Current plus rival mention", "Compare this market with silver briefly.", {
    requiredAnyTools: ["get_commodity_overview", "get_commodity_price_history"],
    requiredAnswerChecks: [
      must(/\b(gold|silver|compare)\b/i, "Commodity comparison should mention both markets."),
    ],
    exploratory: true,
  }),
  commodityCase(16, "Live data only explanation", "What can you actually say here from the live dashboard data only?", {
    requiredTools: ["get_commodity_overview"],
    requiredAnswerChecks: [
      must(/\b(price|change|volume|open interest|dashboard)\b/i, "Live-data-only answer should stay within commodity dashboard fields."),
    ],
  }),
  commodityCase(17, "Supply/inventory trap", "What do inventories say about this commodity right now?", {
    requiredAnswerChecks: [
      must(/\b(not available|don'?t have|do not have|not in tool output|unsupported)\b/i, "Inventory question should be declined if the tools do not provide it.", "unsupported_claim", "hard", "high"),
    ],
  }),
  commodityCase(18, "Compare two supported commodities", "Compare gold and copper for recent price action.", {
    requiredAnyTools: ["get_commodity_price_history", "get_commodity_overview"],
    requiredAnswerChecks: [
      must(/\b(gold|copper|compare)\b/i, "Supported commodity comparison should mention both assets."),
    ],
    exploratory: true,
  }),
  commodityCase(19, "Tool error honesty", "Please answer this using only a supported commodity instrument.", {
    commodity: "all-commodities-index",
    requiredTools: ["get_commodity_overview"],
    requiredAnswerChecks: [
      must(/\b(commodit|index|price|change|overview|unavailable)\b/i, "Commodity answer should either stay grounded or acknowledge tool failure."),
    ],
  }),
  commodityCase(20, "Longer commodity question", "Is this market more about momentum, positioning, or just noise right now?", {
    requiredTools: ["get_commodity_overview", "get_commodity_price_history"],
    requiredAnswerChecks: [
      must(/\b(momentum|positioning|open interest|trend|noise)\b/i, "Longer commodity answer should weigh the requested drivers."),
    ],
  }),
];

const CRYPTO_CASES: AuditCase[] = [
  cryptoCase(1, "BTC snapshot", "Give me a quick snapshot of this market.", {
    requiredTools: ["get_crypto_overview"],
    requiredAnswerChecks: [
      must(/\b(price|change|open interest|mark price|btc|bitcoin)\b/i, "Crypto snapshot should reference live derivative metrics."),
    ],
    numericGrounding: "strict",
  }),
  cryptoCase(2, "ETH snapshot", "Give me a quick snapshot of this market.", {
    crypto: "ETH-PERPETUAL",
    requiredTools: ["get_crypto_overview"],
    requiredAnswerChecks: [
      must(/\b(eth|ethereum|price|change|open interest)\b/i, "ETH snapshot should stay on the requested instrument."),
    ],
    numericGrounding: "strict",
  }),
  cryptoCase(3, "Crypto trend", "How has it traded over the last month?", {
    requiredTools: ["get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(month|trend|range|btc|bitcoin)\b/i, "Crypto trend question should use price history."),
    ],
  }),
  cryptoCase(4, "Open interest", "What does open interest say about positioning?", {
    requiredTools: ["get_crypto_overview"],
    requiredAnswerChecks: [
      must(/\b(open interest|positioning)\b/i, "Open interest question should use overview metrics."),
    ],
  }),
  cryptoCase(5, "Funding", "What is funding doing here?", {
    requiredTools: ["get_crypto_overview"],
    requiredAnswerChecks: [
      must(/\b(funding)\b/i, "Funding question should use the Deribit overview."),
    ],
    numericGrounding: "strict",
  }),
  cryptoCase(6, "Mark vs last", "Explain the mark price versus the last price.", {
    requiredTools: ["get_crypto_overview"],
    requiredAnswerChecks: [
      must(/\b(mark price|last price)\b/i, "Mark-versus-last question should mention both fields."),
    ],
    numericGrounding: "strict",
  }),
  cryptoCase(7, "Pronoun follow-up", "Is it still bid or fading?", {
    requiredAnyTools: ["get_crypto_overview", "get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(bitcoin|btc|market|trend|fading|bid)\b/i, "Pronoun follow-up should remain on the current crypto instrument."),
    ],
    answerMustReferenceCurrentSubject: true,
  }),
  cryptoCase(8, "Instrument switch", "Switch to ETH and tell me how it looks.", {
    requiredAnyTools: ["get_crypto_overview", "get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(eth|ethereum)\b/i, "Explicit crypto switch should answer for ETH."),
    ],
    forbiddenAnswerChecks: [
      mustNot(/\bbitcoin|btc\b/i, "Switched crypto answer should not stay on BTC.", "wrong_instrument"),
    ],
    exploratory: true,
  }),
  cryptoCase(9, "Unsupported market trap", "What does SOL look like here?", {
    requiredAnswerChecks: [
      must(/\b(unsupported|btc and eth perpetuals only|only support btc and eth perpetual|not supported|unavailable)\b/i, "Unsupported crypto market request should be declined honestly.", "unsupported_claim", "hard", "high"),
    ],
  }),
  cryptoCase(10, "No on-chain hallucination", "What do on-chain flows say about this setup?", {
    requiredAnswerChecks: [
      must(/\b(not available|on-chain|not in tool output|don'?t have)\b/i, "Crypto tools should not hallucinate on-chain analytics.", "unsupported_claim", "hard", "high"),
    ],
  }),
  cryptoCase(11, "No cross-asset leakage", "Stay strictly on crypto dashboard context. What matters most here?", {
    requiredTools: ["get_crypto_overview"],
    forbiddenAnswerChecks: [
      mustNot(/\b(stock|equity|macro|inflation|gold|commodity)\b/i, "Crypto answer should not drift into other asset classes.", "wrong_context"),
    ],
  }),
  cryptoCase(12, "Crypto to data handoff", "I want raw CSV data for this market over the past year.", {
    requiredAnyTools: ["suggest_data_export", "get_crypto_price_history", "get_crypto_overview"],
    requiredAnswerChecks: [
      must(/\b(csv|export|get the data|btc|bitcoin)\b/i, "Crypto data request should produce a CSV handoff."),
    ],
    downloadExpectation: "required",
  }),
  cryptoCase(13, "Today move", "What happened in this market today?", {
    requiredAnyTools: ["get_crypto_overview", "get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(today|session|market|btc|bitcoin)\b/i, "Today crypto question should stay on the requested instrument."),
    ],
    numericGrounding: "strict",
  }),
  cryptoCase(14, "Exact figures", "What's the current last price, mark price, and open interest?", {
    requiredTools: ["get_crypto_overview"],
    requiredAnswerChecks: [
      must(/\b(mark price|last price|open interest)\b/i, "Exact crypto metric question should include requested fields."),
    ],
    numericGrounding: "strict",
  }),
  cryptoCase(15, "Name mapping", "How does Bitcoin look right now?", {
    requiredAnyTools: ["get_crypto_overview", "get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(bitcoin|btc)\b/i, "Bitcoin naming should still map to the supported BTC perpetual."),
    ],
  }),
  cryptoCase(16, "Compare BTC vs ETH", "Compare Bitcoin and Ethereum here.", {
    requiredAnyTools: ["get_crypto_overview", "get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(bitcoin|btc|ethereum|eth|compare)\b/i, "Crypto comparison should mention both BTC and ETH."),
    ],
    exploratory: true,
  }),
  cryptoCase(17, "Unsupported exchange breadth trap", "What do other exchanges say about this move?", {
    requiredAnswerChecks: [
      must(/\b(not available|deribit|not in tool output|don'?t have)\b/i, "Crypto answer should not invent broader exchange coverage.", "unsupported_claim", "hard", "high"),
    ],
  }),
  cryptoCase(18, "Historical narrative trap", "Is Bitcoin still near the highs from earlier this year?", {
    requiredTools: ["get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(high|history|range|year)\b/i, "Historical crypto question should reference fetched history."),
    ],
    exploratory: true,
  }),
  cryptoCase(19, "Mixed price, funding, OI", "Summarize price action, funding, and open interest in one view.", {
    requiredTools: ["get_crypto_overview", "get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(price|trend)\b/i, "Mixed crypto answer should cover price action."),
      must(/\b(funding)\b/i, "Mixed crypto answer should cover funding."),
      must(/\b(open interest)\b/i, "Mixed crypto answer should cover open interest."),
    ],
  }),
  cryptoCase(20, "Tool error honesty", "Answer only if the supported instrument data is actually available.", {
    crypto: "ETH-PERPETUAL",
    requiredAnyTools: ["get_crypto_overview", "get_crypto_price_history"],
    requiredAnswerChecks: [
      must(/\b(eth|ethereum|price|funding|unavailable)\b/i, "Crypto answer should either stay grounded or acknowledge unavailability."),
    ],
  }),
];

const DATA_CASES: AuditCase[] = [
  dataCase(1, "Stock export recommendation", "I need raw daily price data for AAPL for the last year.", {
    requiredAnswerChecks: [
      must(/\b(aapl|stock|csv|export|get the data)\b/i, "Stock export request should produce a stock CSV plan."),
    ],
  }),
  dataCase(2, "Macro export recommendation", "I need U.S. CPI data for the last five years as CSV.", {
    requiredAnswerChecks: [
      must(/\b(cpi|u\.s\.|united states|csv|export)\b/i, "Macro export request should produce a CPI export plan."),
    ],
  }),
  dataCase(3, "Commodity export recommendation", "I want gold price data as a CSV export.", {
    requiredAnswerChecks: [
      must(/\b(gold|commodity|csv|export)\b/i, "Commodity export request should produce a gold CSV plan."),
    ],
  }),
  dataCase(4, "Crypto export recommendation", "Give me the best raw CSV export for Bitcoin perpetual data.", {
    requiredAnswerChecks: [
      must(/\b(bitcoin|btc|perpetual|csv|export)\b/i, "Crypto export request should map Bitcoin to the supported BTC perpetual export."),
    ],
  }),
  dataCase(5, "One export only", "I need AAPL prices, CPI, and Bitcoin in one dataset.", {
    requiredAnswerChecks: [
      must(/\b(first export|start with|one export|get the data)\b/i, "Multi-dataset request should recommend one primary export first."),
    ],
  }),
  dataCase(6, "Exact date mapping", "I need NVDA daily prices from 2024-01-01 to 2024-12-31.", {
    requiredAnswerChecks: [
      must(/\b(2024-01-01|2024-12-31)\b/i, "Exact date request should preserve the requested date range."),
    ],
  }),
  dataCase(7, "Preset range mapping", "I need raw ETH data for the last three months.", {
    requiredAnswerChecks: [
      must(/\b(eth|ethereum|three months|3mo|range)\b/i, "Preset-range request should preserve the requested time window."),
    ],
  }),
  dataCase(8, "Macro country correctness", "I need French inflation data as CSV.", {
    requiredAnswerChecks: [
      must(/\b(france|french|inflation|cpi)\b/i, "French macro export should keep the correct country context."),
    ],
  }),
  dataCase(9, "Download handoff", "Prepare the exact export I should use for BTC raw data.", {
    requiredAnswerChecks: [
      must(/\b(export|download|get the data|btc|bitcoin)\b/i, "Prepared export should include a download handoff."),
    ],
  }),
  dataCase(10, "No fake direct download", "Give me the CSV now for U.S. CPI.", {
    requiredAnswerChecks: [
      must(/\b(prepared|get the data|download csv)\b/i, "Data assistant should describe the handoff flow."),
    ],
    forbiddenAnswerChecks: [
      mustNot(/\b(here is your csv|i downloaded|already downloaded|attached csv)\b/i, "Data assistant must not pretend the file was already delivered.", "hallucinated_export_or_capability"),
    ],
  }),
  dataCase(11, "No unsupported filings promise", "Can you export filings and news together for MSFT?", {
    requiredTools: [],
    requiredAnswerChecks: [
      must(/\b(not available|csv|raw data|one export|filings|news)\b/i, "Unsupported export scope should be constrained honestly."),
    ],
    downloadExpectation: "forbidden",
  }),
  dataCase(12, "No multi-asset ZIP promise", "Bundle BTC, ETH, and CPI into one ZIP for me.", {
    requiredAnswerChecks: [
      must(/\b(one export|start with|not supported|zip)\b/i, "Bulk ZIP request should be declined in favor of one primary export."),
    ],
  }),
  dataCase(13, "Unsupported dataset request", "I need options Greeks data as CSV.", {
    requiredTools: [],
    requiredAnswerChecks: [
      must(/\b(not supported|unavailable|current get the data tool)\b/i, "Unsupported dataset request should be declined honestly.", "unsupported_claim", "hard", "high"),
    ],
    downloadExpectation: "forbidden",
  }),
  dataCase(14, "Project mapping to stock export", "I want to study whether Apple sells off after earnings using price data.", {
    requiredAnswerChecks: [
      must(/\b(apple|aapl|price data|stock|export)\b/i, "Project mapping should pick the best-first stock export."),
    ],
  }),
  dataCase(15, "Follow-up refinement", "Make that a French inflation export instead.", {
    requiredAnswerChecks: [
      must(/\b(france|french|inflation|cpi)\b/i, "Follow-up data request should reflect the updated target export."),
    ],
    exploratory: true,
  }),
  dataCase(16, "Ambiguous project", "I want to study recession risk with one export first.", {
    requiredAnswerChecks: [
      must(/\b(export|start with|first|cpi|unemployment|rates|gdp)\b/i, "Ambiguous macro project should still choose one concrete first export."),
    ],
  }),
  dataCase(17, "Unsupported commodity surface", "I need live shipping-rate data as CSV.", {
    requiredTools: [],
    requiredAnswerChecks: [
      must(/\b(not supported|unavailable|current tool)\b/i, "Unsupported commodity-like dataset should be declined honestly.", "unsupported_claim", "hard", "high"),
    ],
    downloadExpectation: "forbidden",
  }),
  dataCase(18, "Planner mode only", "Before anything else, tell me the best export for ETH funding research.", {
    requiredAnswerChecks: [
      must(/\b(export|eth|ethereum|funding)\b/i, "Data assistant should stay in planning mode for ETH funding research."),
    ],
    forbiddenAnswerChecks: [
      mustNot(/\b(on-chain|news|filings|fundamentals)\b/i, "Data assistant should not drift into unsupported analysis surfaces.", "wrong_context"),
    ],
  }),
  dataCase(19, "No dashboard-style analysis answer", "Don't analyze it, just tell me the exact raw export for gold.", {
    requiredAnswerChecks: [
      must(/\b(gold|export|csv|get the data)\b/i, "Data assistant should give a concrete export, not a dashboard analysis."),
    ],
    forbiddenAnswerChecks: [
      mustNot(/\b(bullish|bearish|support|resistance|positioning|outlook)\b/i, "Data assistant should not respond with market analysis when only an export was requested.", "wrong_context"),
    ],
  }),
  dataCase(20, "Primary export plus next step", "I eventually need CPI and unemployment, but give me the first export to start with.", {
    requiredAnswerChecks: [
      must(/\b(first export|start with|cpi|unemployment)\b/i, "Multi-export planning should recommend one first export and mention the next one briefly."),
    ],
  }),
];

function assertCaseCoverage(cases: AuditCase[]) {
  const byContext = new Map<string, number>();
  for (const auditCase of cases) {
    byContext.set(auditCase.context, (byContext.get(auditCase.context) ?? 0) + 1);
  }

  for (const context of ["stock", "macro", "commodity", "crypto", "data"]) {
    if (byContext.get(context) !== 20) {
      throw new Error(`Expected 20 audit cases for ${context}, received ${byContext.get(context) ?? 0}`);
    }
  }

  if (cases.length !== 100) {
    throw new Error(`Expected 100 audit cases, received ${cases.length}`);
  }
}

export const AGENT_AUDIT_CASES: AuditCase[] = [
  ...STOCK_CASES,
  ...MACRO_CASES,
  ...COMMODITY_CASES,
  ...CRYPTO_CASES,
  ...DATA_CASES,
];

assertCaseCoverage(AGENT_AUDIT_CASES);
