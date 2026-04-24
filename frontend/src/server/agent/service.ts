import type {
  AgentRequest as FrontendAgentRequest,
  CommodityInstrumentSlug,
  CryptoInstrument,
  MacroCountry,
  MacroIndicatorSlug,
} from "@/types/api";
import { isCommodityInstrument } from "@/lib/commodities";
import { buildDataPageHref, getDisplayAssetName } from "@/lib/data-export";
import { resolveDataAssistantResult, isDataPlanningQuery } from "@/server/agent/data-assistant";
import {
  buildDeclineAnswer,
  buildPolicySystemPrompt,
  buildToolCorrectionPrompt,
  createAgentPolicy,
  getMissingRequiredTools,
  getToolPolicyViolations,
  type AgentToolName,
} from "@/server/agent/policy";
import { SYSTEM_PROMPT } from "@/server/agent/prompt";
import { buildAnswerRevisionPrompt, validateAgentAnswer } from "@/server/agent/validator";
import {
  type DisplayEvent,
  normalizeSuggestedDataExportArgs,
  TOOL_DEFINITIONS,
  dispatchToolWithDisplay,
} from "@/server/agent/tools";
import {
  getContextNewsQueryFromPrompt,
  getFocusedNewsQueryForCommodity,
  getFocusedNewsQueryForCrypto,
  getFocusedNewsQueryForMacro,
  getFocusedNewsQueryForStock,
} from "@/server/news/queries";

const MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions";
const MAX_TOOL_ROUNDS = 10;
const LLM_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1024;
const STREAM_CHUNK_SIZE = 48;
const STREAM_CHUNK_DELAY_MS = 18;
const TOOL_REQUIRED_MESSAGE =
  "You must call at least one tool before answering. Do not answer from memory.";

export type AgentRequest = FrontendAgentRequest;

export type AgentToolCallRecord = {
  name: string;
  args: Record<string, unknown>;
};

export type AgentToolResultRecord = AgentToolCallRecord & {
  success: boolean;
  rawContent?: string;
  parsedContent?: unknown;
  displays: DisplayEvent[];
  error?: string;
};

export type AgentRunObserver = {
  onToolCall?: (record: AgentToolCallRecord) => void;
  onToolResult?: (record: AgentToolResultRecord) => void;
};

type DeterministicAgentReply = {
  answer: string;
  displayAbout?: {
    href: string;
    label: string;
    description: string;
    github_href: string;
    linkedin_href: string;
  };
};

type MistralToolCall = {
  id: string;
  type?: "function";
  function: {
    name: string;
    arguments: string;
  };
};

type MistralMessage = {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: MistralToolCall[];
  tool_call_id?: string;
  name?: string;
};

type CompletionResponse = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: {
      content?: unknown;
      tool_calls?: MistralToolCall[] | null;
    };
  }>;
};

const LOW_SIGNAL_QUERY_PATTERNS = [
  /^(hi|hello|hey|yo|bonjour|salut)[!.? ]*$/i,
  /^(help|what|start|sup)[!.? ]*$/i,
  /^(hello|hi|hey)\s+how are you[?.! ]*$/i,
  /^how are you[?.! ]*$/i,
  /^what's up[?.! ]*$/i,
  /^what can you do[?.! ]*$/i,
  /^can you help(?: me)?[?.! ]*$/i,
  /^how do i use (?:this|alpha)[?.! ]*$/i,
];

const OFF_TOPIC_QUERY_PATTERN =
  /\b(cat|dog|pet|vet|recipe|cook|cooking|plate|meal|dinner|lunch|breakfast|food)\b/i;
const FINANCE_CUE_PATTERN =
  /\b(stock|stocks|ticker|tickers|share|shares|company|companies|earnings|valuation|fundamental|fundamentals|filing|filings|10-k|10-q|price|prices|market|markets|macro|inflation|cpi|fed|rate|rates|gdp|unemployment|yield|treasury|commodity|commodities|gold|silver|oil|wti|brent|copper|bitcoin|btc|ethereum|eth|crypto|funding|open interest|csv|export|data|dashboard)\b/i;
const CREATOR_QUERY_PATTERNS = [
  /\bwho\s+(?:built|made|created|developed|coded)\s+(?:you|uou|alpha|openalpha|this)\b/i,
  /\bwho\s+is\s+behind\s+(?:you|uou|alpha|openalpha|this)\b/i,
  /\bwho\s+made\s+(?:this|openalpha)\b/i,
  /\bwho\s+are\s+you\b/i,
  /\btell\s+me\s+about\s+(?:you|openalpha|alpha)\b/i,
];

function sse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function chunkText(value: string, chunkSize: number = STREAM_CHUNK_SIZE): string[] {
  if (!value.trim()) {
    return [];
  }

  const chunks: string[] = [];
  let remaining = value;

  while (remaining.length > chunkSize) {
    const slice = remaining.slice(0, chunkSize);
    const boundary = Math.max(
      slice.lastIndexOf("\n"),
      slice.lastIndexOf(". "),
      slice.lastIndexOf(" "),
    );
    const cut = boundary > 0 ? boundary : chunkSize;
    const nextChunk = remaining.slice(0, cut);
    chunks.push(nextChunk);
    remaining = remaining.slice(cut);
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

async function* emitBufferedAnswer(answer: string): AsyncGenerator<string, void, void> {
  const chunks = chunkText(answer);
  for (const [index, chunk] of chunks.entries()) {
    yield sse("text_delta", { content: chunk });
    if (index < chunks.length - 1) {
      await delay(STREAM_CHUNK_DELAY_MS);
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function formatCompactCount(value: number): string {
  return Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function looksGeneralBackdropPrompt(query: string): boolean {
  return /\b(global|world|broader|backdrop|market context|broader context|world market|global news|world news|global risks?|geopolitic|geopolitical|get_context_news)\b/i.test(
    query,
  );
}

function formatCompactMoney(value: number): string {
  return Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function getSuccessfulToolResult(
  toolResults: AgentToolResultRecord[],
  name: string,
): AgentToolResultRecord | null {
  return toolResults.find((result) => result.name === name && result.success) ?? null;
}

function buildStockOverviewFallback(
  request: AgentRequest,
  toolResults: AgentToolResultRecord[],
): string | null {
  const result = getSuccessfulToolResult(toolResults, "get_stock_overview");
  const parsed =
    result?.parsedContent && typeof result.parsedContent === "object"
      ? (result.parsedContent as Record<string, unknown>)
      : null;

  if (!parsed) {
    return null;
  }

  const currentPrice = typeof parsed.current_price === "number" ? parsed.current_price : null;
  const change = typeof parsed.change === "number" ? parsed.change : null;
  const changePercent =
    typeof parsed.change_percent === "number" ? parsed.change_percent : null;
  const volume = typeof parsed.volume === "number" ? parsed.volume : null;
  const marketCap = typeof parsed.market_cap === "number" ? parsed.market_cap : null;
  const high =
    typeof parsed.fifty_two_week_high === "number" ? parsed.fifty_two_week_high : null;
  const low =
    typeof parsed.fifty_two_week_low === "number" ? parsed.fifty_two_week_low : null;
  const symbol =
    typeof parsed.symbol === "string"
      ? parsed.symbol
      : request.ticker?.toUpperCase() ?? "This stock";

  if (
    currentPrice == null ||
    change == null ||
    changePercent == null ||
    volume == null ||
    marketCap == null ||
    high == null ||
    low == null
  ) {
    return null;
  }

  return [
    `Today, ${symbol} is at $${currentPrice.toFixed(2)}, ${change >= 0 ? "up" : "down"} $${Math.abs(change).toFixed(2)} (${changePercent.toFixed(1)}%) on ${formatCompactCount(volume)} shares.`,
    `Market cap is ${formatCompactMoney(marketCap)}, and the 52-week range is $${low.toFixed(2)} to $${high.toFixed(2)}.`,
    "I can't say more about average volume, catalysts, or benchmarks from this tool alone.",
  ].join(" ");
}

function buildValidationFallback(
  request: AgentRequest,
  toolResults: AgentToolResultRecord[],
): string | null {
  return buildStockOverviewFallback(request, toolResults);
}

function getMistralApiKey(): string {
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (!key) {
    throw new Error("MISTRAL_API_KEY is not configured");
  }
  return key;
}

function getMistralModel(): string {
  const value = process.env.MISTRAL_MODEL?.trim();
  return value || "mistral-small-latest";
}

function normalizeIntentQuery(query: string): string {
  return query
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u2010-\u2015\u2212]/g, "-")
    .trim();
}

function buildAboutCard() {
  return {
    href: "/about",
    label: "About Alpha",
    description: "Created by Mathis Villaret. Open the About page or use the direct profile links here.",
    github_href: "https://github.com/Mathis-14",
    linkedin_href: "https://www.linkedin.com/in/mathis-villaret",
  };
}

function getCreatorReply(request: AgentRequest): DeterministicAgentReply | null {
  const normalized = normalizeIntentQuery(request.query);
  const compact = normalized.replace(/\s+/g, " ").trim();

  if (!compact || !CREATOR_QUERY_PATTERNS.some((pattern) => pattern.test(compact))) {
    return null;
  }

  return {
    answer: [
      "I was created by Mathis Villaret.",
      "You can open the About page below, connect on [LinkedIn](https://www.linkedin.com/in/mathis-villaret), or view the work on [GitHub](https://github.com/Mathis-14).",
    ].join(" "),
    displayAbout: buildAboutCard(),
  };
}

export function getDeterministicAgentReply(
  request: AgentRequest,
): DeterministicAgentReply | null {
  return getCreatorReply(request) ?? (() => {
    const answer = getConversationStarterReply(request);
    return answer ? { answer } : null;
  })();
}

export function getConversationStarterReply(
  request: AgentRequest,
): string | null {
  const normalized = normalizeIntentQuery(request.query);
  const compact = normalized.replace(/\s+/g, " ").trim();

  if (!compact) {
    return null;
  }

  const hasFinanceCue = FINANCE_CUE_PATTERN.test(compact);
  const isOffTopic = OFF_TOPIC_QUERY_PATTERN.test(compact) && !hasFinanceCue;
  const isLowSignal =
    LOW_SIGNAL_QUERY_PATTERNS.some((pattern) => pattern.test(compact)) ||
    compact.split(" ").filter(Boolean).length <= 2;

  if (isOffTopic) {
    const contextualAsset =
      request.ticker
        ? `${request.ticker.toUpperCase()}`
        : request.dashboard_context === "macro"
          ? request.country === "fr"
            ? "France macro"
            : "U.S. macro"
          : request.dashboard_context === "commodity" && request.commodity_instrument
            ? request.commodity_instrument.replace(/-/g, " ")
            : request.dashboard_context === "crypto" && request.crypto_instrument
              ? request.crypto_instrument
              : null;

    return contextualAsset
      ? [
          `I can't help with that non-finance topic here, but I can help with ${contextualAsset}.`,
          "If you want, ask for a snapshot, trend, fundamentals, filings, macro context, or the matching raw CSV export.",
        ].join(" ")
      : [
          "I can't help with that non-finance topic here.",
          "I can help with stocks, macro, supported commodities, and BTC or ETH perpetuals instead.",
          "For example: `Tell me about Nvidia`, `What changed in U.S. inflation?`, `How is gold trading?`, or `How is Bitcoin performing this week?`",
        ].join(" ");
  }

  if (!isLowSignal || hasFinanceCue) {
    return null;
  }

  if (request.dashboard_context === "data") {
    return [
      "Tell me what data you need and what project you are working on.",
      "I can prepare one raw CSV export at a time for stocks, macro series, supported commodities, or BTC/ETH perpetuals.",
      "For example: `I need NVDA daily prices for the last year` or `I need U.S. CPI data as CSV`.",
    ].join(" ");
  }

  if (request.dashboard_context === "macro" && request.country) {
    const countryLabel = request.country === "fr" ? "France" : "the U.S.";
    return [
      `Tell me what you want to know about ${countryLabel} macro conditions.`,
      "I can help with inflation, rates, growth, unemployment, or the matching raw CSV export.",
      "For example: `What changed in inflation?` or `Give me the CPI export.`",
    ].join(" ");
  }

  if (request.dashboard_context === "commodity" && request.commodity_instrument) {
    const commodityLabel = request.commodity_instrument.replace(/-/g, " ");
    return [
      `Tell me what you want to know about ${commodityLabel}.`,
      "I can help with price action, range context, volume, open interest, or the raw CSV export.",
      "For example: `How is it trading versus its 52-week range?`",
    ].join(" ");
  }

  if (request.dashboard_context === "crypto" && request.crypto_instrument) {
    const cryptoLabel =
      request.crypto_instrument === "ETH-PERPETUAL" ? "ETH perpetuals" : "BTC perpetuals";
    return [
      `Tell me what you want to know about ${cryptoLabel}.`,
      "I can help with price action, funding, open interest, mark price, or the raw CSV export.",
      "For example: `What do funding and open interest say right now?`",
    ].join(" ");
  }

  if (request.ticker) {
    return [
      `Tell me what you want to know about ${request.ticker.toUpperCase()}.`,
      "I can help with the live snapshot, fundamentals, news, filings, or the raw CSV export.",
      "For example: `Give me a quick overview` or `What do the latest filings say?`",
    ].join(" ");
  }

  return [
    "Tell me what you want to analyze and I will point you to the right asset or dashboard.",
    "I can help with stocks, macro, supported commodities, and BTC or ETH perpetuals.",
    "Good starting points are: `Tell me about Nvidia`, `What changed in U.S. inflation?`, `How is gold trading?`, or `How is Bitcoin performing this week?`",
  ].join(" ");
}

function buildUserContent(
  query: string,
  ticker: string | null | undefined,
  dashboardContext: "macro" | "crypto" | "commodity" | "data" | null | undefined,
  country: MacroCountry | null | undefined,
  cryptoInstrument: CryptoInstrument | null | undefined,
  commodityInstrument: CommodityInstrumentSlug | null | undefined,
): string {
  if (ticker) {
    const focusedNewsQuery = getFocusedNewsQueryForStock(ticker);
    const contextNewsQuery = getContextNewsQueryFromPrompt(query);
    return (
      `${query}\n\n` +
      `[Context: the user is asking about ticker ${ticker.toUpperCase()}. ` +
      `Use get_stock_overview, get_stock_fundamentals, and get_price_history for ${ticker.toUpperCase()} when needed. ` +
      `For company-specific headlines, use get_news with query='${focusedNewsQuery}'. ` +
      `For broader market or geopolitical backdrop, use get_context_news with query='${contextNewsQuery}'.]`
    );
  }

  if (dashboardContext === "commodity" && commodityInstrument) {
    const focusedNewsQuery = getFocusedNewsQueryForCommodity(commodityInstrument);
    const contextNewsQuery = getContextNewsQueryFromPrompt(query);
    return (
      `${query}\n\n` +
      `[Context: the user is on the commodity dashboard for ${commodityInstrument}. ` +
      `Use get_commodity_overview and get_commodity_price_history for ${commodityInstrument}. ` +
      `For focused headlines, use get_news with query='${focusedNewsQuery}'. Do not use a generic focused query like 'commodities' when the active dashboard commodity is specific. ` +
      `For broader market or geopolitical backdrop, use get_context_news with query='${contextNewsQuery}'. ` +
      "Keep the answer grounded in this commodity dashboard and its live futures market data.]"
    );
  }

  if (dashboardContext === "crypto" && cryptoInstrument) {
    const focusedNewsQuery = getFocusedNewsQueryForCrypto(cryptoInstrument);
    const contextNewsQuery = getContextNewsQueryFromPrompt(query);
    return (
      `${query}\n\n` +
      `[Context: the user is on the crypto dashboard for ${cryptoInstrument}. ` +
      `Use get_crypto_overview and get_crypto_price_history for ${cryptoInstrument}. ` +
      `For focused headlines, use get_news with query='${focusedNewsQuery}'. Do not use generic focused queries like 'crypto' or 'market' when the active instrument is specific. ` +
      `For broader market or geopolitical backdrop, use get_context_news with query='${contextNewsQuery}'. ` +
      "Keep the answer grounded in Deribit market data only.]"
    );
  }

  if (dashboardContext === "macro") {
    const normalizedCountry = country === "fr" ? "fr" : "us";
    const countryLabel =
      normalizedCountry === "fr" ? "France" : "the United States";
    const focusedNewsQuery = getFocusedNewsQueryForMacro(normalizedCountry);
    const contextNewsQuery = getContextNewsQueryFromPrompt(query);

    return (
      `${query}\n\n` +
      `[Context: the user is on the macro dashboard for ${countryLabel}. ` +
      `Use get_macro_snapshot with country='${normalizedCountry}' for broad context, ` +
      `and use get_macro_series with country='${normalizedCountry}' when the user asks about one indicator trend or history. ` +
      `For focused headlines, use get_news with query='${focusedNewsQuery}' or the relevant indicator topic such as inflation, interest rates, bond yields, or unemployment. Do not use a generic focused query like 'macro' or 'market' when a country or indicator-specific topic is available. ` +
      `For broader market or geopolitical backdrop, use get_context_news with query='${contextNewsQuery}'. ` +
      "Keep the answer " +
      "grounded in that country unless the user asks to compare or switch countries.]"
    );
  }

  if (dashboardContext === "data") {
    return (
      `${query}\n\n` +
      "[Context: the user is on the Get the data page. Help them map their project to one supported raw CSV export at a time. " +
      "Use suggest_data_export when you have a concrete recommendation. " +
      "Prefer a single asset export, a clear date window, and a short note about why that export fits. " +
      "Do not promise filings, news, fundamentals, or bulk multi-asset exports from this tool.]"
    );
  }

  if (looksGeneralBackdropPrompt(query)) {
    const contextNewsQuery = getContextNewsQueryFromPrompt(query);
    return (
      `${query}\n\n` +
      `[Context: this is a broad market, geopolitical, macro, or risk-backdrop request. ` +
      `Use get_context_news with query='${contextNewsQuery}'. Do not pivot to focused news or asset-specific tools unless the user explicitly names a supported asset, ticker, or indicator.]`
    );
  }

  return query;
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    init.timeoutMs ?? LLM_TIMEOUT_MS,
  );

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function normalizeTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .flatMap((item) => {
        if (typeof item === "string") {
          return [item];
        }
        if (item && typeof item === "object") {
          const text = Reflect.get(item, "text");
          if (typeof text === "string") {
            return [text];
          }
        }
        return [];
      })
      .join("");
  }

  return "";
}

async function complete(
  messages: MistralMessage[],
): Promise<CompletionResponse> {
  let response: Response;
  try {
    response = await fetchWithTimeout(MISTRAL_CHAT_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getMistralApiKey()}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: getMistralModel(),
        messages,
        tools: TOOL_DEFINITIONS,
        tool_choice: "auto",
        parallel_tool_calls: false,
        max_tokens: MAX_TOKENS,
      }),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("LLM request timed out");
    }
    throw new Error(`LLM request failed: ${(error as Error).message}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(`LLM request failed: ${body || response.statusText}`);
  }

  return (await response.json()) as CompletionResponse;
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function parseToolContent(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

function normalizeMacroIndicatorCandidate(
  value: unknown,
): MacroIndicatorSlug | null {
  if (
    value === "fed-funds" ||
    value === "cpi" ||
    value === "gdp-growth" ||
    value === "treasury-10y" ||
    value === "unemployment"
  ) {
    return value;
  }

  return null;
}

function normalizeMacroCountryCandidate(
  value: unknown,
): MacroCountry | null {
  if (value === "fr" || value === "us") {
    return value;
  }

  return null;
}

export function buildDownloadSuggestion(
  request: AgentRequest,
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>,
): { href: string; label: string; description: string } | null {
  const assistantReady = request.dashboard_context === "data";
  const downloadLabel =
    assistantReady
      ? "Get the data with details"
      : "Get the data";

  const suggestedExports = toolCalls
    .filter((toolCall) => toolCall.name === "suggest_data_export")
    .flatMap((toolCall) => {
      try {
        return [normalizeSuggestedDataExportArgs(toolCall.args)];
      } catch {
        return [];
      }
    });

  if (suggestedExports.length === 1) {
    const plan = suggestedExports[0];
    const href = buildDataPageHref({
      asset_class: plan.asset_class,
      asset: plan.asset,
      country: plan.country,
      start_date: plan.start_date,
      end_date: plan.end_date,
      assistant_ready: assistantReady,
    });
    const description = plan.reason
      ? `${plan.reason} Prefilled for ${getDisplayAssetName(plan.asset_class, plan.asset, plan.country)} from ${plan.start_date} to ${plan.end_date}.`
      : `Open the raw CSV export tool prefilled for ${getDisplayAssetName(plan.asset_class, plan.asset, plan.country)} from ${plan.start_date} to ${plan.end_date}.`;

    return {
      href,
      label: downloadLabel,
      description,
    };
  }

  if (request.ticker) {
    const symbol = request.ticker.trim().toUpperCase();
    return {
      href: buildDataPageHref({
        asset_class: "stock",
        asset: symbol,
        assistant_ready: assistantReady,
      }),
      label: downloadLabel,
      description: `Open the raw CSV export tool prefilled for ${symbol}.`,
    };
  }

  if (request.dashboard_context === "commodity" && request.commodity_instrument) {
    return {
      href: buildDataPageHref({
        asset_class: "commodity",
        asset: request.commodity_instrument,
        assistant_ready: assistantReady,
      }),
      label: downloadLabel,
      description: `Open the raw CSV export tool prefilled for ${getDisplayAssetName("commodity", request.commodity_instrument)}.`,
    };
  }

  if (request.dashboard_context === "crypto" && request.crypto_instrument) {
    return {
      href: buildDataPageHref({
        asset_class: "crypto",
        asset: request.crypto_instrument,
        assistant_ready: assistantReady,
      }),
      label: downloadLabel,
      description: `Open the raw CSV export tool prefilled for ${getDisplayAssetName("crypto", request.crypto_instrument)}.`,
    };
  }

  const stockSymbols = new Set<string>();
  const macroSignals = new Set<string>();
  const cryptoInstruments = new Set<CryptoInstrument>();
  const commodityInstruments = new Set<CommodityInstrumentSlug>();

  for (const toolCall of toolCalls) {
    if (
      toolCall.name === "get_stock_overview" ||
      toolCall.name === "get_stock_fundamentals" ||
      toolCall.name === "get_price_history" ||
      toolCall.name === "get_sec_filings"
    ) {
      const candidate = toolCall.args.symbol ?? toolCall.args.ticker;
      if (typeof candidate === "string" && candidate.trim()) {
        stockSymbols.add(candidate.trim().toUpperCase());
      }
      continue;
    }

    if (
      toolCall.name === "get_macro_series"
    ) {
      const indicator = normalizeMacroIndicatorCandidate(toolCall.args.indicator);
      if (!indicator) {
        continue;
      }

      const country =
        normalizeMacroCountryCandidate(toolCall.args.country) ??
        (request.country === "fr" ? "fr" : "us");
      macroSignals.add(`${country}:${indicator}`);
      continue;
    }

    if (
      toolCall.name === "get_crypto_overview" ||
      toolCall.name === "get_crypto_price_history"
    ) {
      const candidate = toolCall.args.instrument;
      if (
        typeof candidate === "string" &&
        (candidate === "BTC-PERPETUAL" || candidate === "ETH-PERPETUAL")
      ) {
        cryptoInstruments.add(candidate);
      }
      continue;
    }

    if (
      toolCall.name === "get_commodity_overview" ||
      toolCall.name === "get_commodity_price_history"
    ) {
      const candidate = toolCall.args.instrument;
      if (
        typeof candidate === "string" &&
        isCommodityInstrument(candidate.trim().toLowerCase())
      ) {
        commodityInstruments.add(
          candidate.trim().toLowerCase() as CommodityInstrumentSlug,
        );
      }
    }
  }

  const signalCount =
    Number(stockSymbols.size > 0) +
    Number(macroSignals.size > 0) +
    Number(cryptoInstruments.size > 0) +
    Number(commodityInstruments.size > 0);

  if (signalCount !== 1) {
    return null;
  }

  if (stockSymbols.size === 1) {
    const symbol = Array.from(stockSymbols)[0];
    return {
      href: buildDataPageHref({
        asset_class: "stock",
        asset: symbol,
        assistant_ready: assistantReady,
      }),
      label: downloadLabel,
      description: `Open the raw CSV export tool prefilled for ${symbol}.`,
    };
  }

  if (macroSignals.size === 1) {
    const [country, indicator] = Array.from(macroSignals)[0].split(":") as [
      MacroCountry,
      MacroIndicatorSlug,
    ];

    return {
      href: buildDataPageHref({
        asset_class: "macro",
        asset: indicator,
        country,
        assistant_ready: assistantReady,
      }),
      label: downloadLabel,
      description: `Open the raw CSV export tool prefilled for ${getDisplayAssetName("macro", indicator, country)}.`,
    };
  }

  if (cryptoInstruments.size === 1) {
    const instrument = Array.from(cryptoInstruments)[0];
    return {
      href: buildDataPageHref({
        asset_class: "crypto",
        asset: instrument,
        assistant_ready: assistantReady,
      }),
      label: downloadLabel,
      description: `Open the raw CSV export tool prefilled for ${getDisplayAssetName("crypto", instrument)}.`,
    };
  }

  if (commodityInstruments.size === 1) {
    const instrument = Array.from(commodityInstruments)[0];
    return {
      href: buildDataPageHref({
        asset_class: "commodity",
        asset: instrument,
        assistant_ready: assistantReady,
      }),
      label: downloadLabel,
      description: `Open the raw CSV export tool prefilled for ${getDisplayAssetName("commodity", instrument)}.`,
    };
  }

  return null;
}

export async function* runAgent(
  request: AgentRequest,
  observer?: AgentRunObserver,
): AsyncGenerator<string, void, void> {
  const deterministicReply = getDeterministicAgentReply(request);
  if (deterministicReply) {
    if (deterministicReply.displayAbout) {
      yield sse("display_about", deterministicReply.displayAbout);
    }
    for await (const chunk of emitBufferedAnswer(deterministicReply.answer)) {
      yield chunk;
    }
    yield sse("done", {});
    return;
  }

  if (!process.env.MISTRAL_API_KEY?.trim()) {
    yield sse("error", { message: "MISTRAL_API_KEY is not configured" });
    yield sse("done", {});
    return;
  }

  if (isDataPlanningQuery(request)) {
    const planned = resolveDataAssistantResult(request);

    if (planned.kind === "decline") {
      for await (const chunk of emitBufferedAnswer(planned.answer)) {
        yield chunk;
      }
      yield sse("done", {});
      return;
    }

    observer?.onToolCall?.({
      name: "suggest_data_export",
      args: planned.toolArgs,
    });
    yield sse("tool_call", {
      name: "suggest_data_export",
      arguments: planned.toolArgs,
    });

    observer?.onToolResult?.({
      name: "suggest_data_export",
      args: planned.toolArgs,
      success: true,
      rawContent: JSON.stringify(planned.plan),
      parsedContent: planned.plan,
      displays: [],
    });
    yield sse("tool_result", {
      name: "suggest_data_export",
      success: true,
    });
    yield sse("display_download", planned.displayDownload);
    for await (const chunk of emitBufferedAnswer(planned.answer)) {
      yield chunk;
    }
    yield sse("done", {});
    return;
  }

  const policy = createAgentPolicy(request);
  if (policy.mode === "decline") {
    for await (const chunk of emitBufferedAnswer(buildDeclineAnswer(policy))) {
      yield chunk;
    }
    yield sse("done", {});
    return;
  }

  const messages: MistralMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "system", content: buildPolicySystemPrompt(policy) },
    {
      role: "user",
      content: buildUserContent(
        request.query,
        request.ticker,
        request.dashboard_context,
        request.country,
        request.crypto_instrument,
        request.commodity_instrument,
      ),
    },
  ];

  let anyToolCalled = false;
  const observedToolCalls: Array<{
    name: string;
    args: Record<string, unknown>;
  }> = [];
  const observedToolResults: AgentToolResultRecord[] = [];
  let policyViolationCorrectionUsed = false;
  let missingRequiredCorrectionUsed = false;
  let answerRevisionUsed = false;

  for (let round = 0; round < MAX_TOOL_ROUNDS; round += 1) {
    let completion: CompletionResponse;
    try {
      completion = await complete(messages);
    } catch (error) {
      yield sse("error", { message: (error as Error).message });
      yield sse("done", {});
      return;
    }

    const choice = completion.choices?.[0];
    if (!choice?.message) {
      yield sse("error", { message: "Empty response from LLM" });
      yield sse("done", {});
      return;
    }

    const toolCalls = choice.message.tool_calls ?? [];
    const hasToolCalls =
      choice.finish_reason === "tool_calls" && toolCalls.length > 0;

    if (hasToolCalls) {
      const calledToolNames = toolCalls.map(
        (toolCall) => toolCall.function.name as AgentToolName,
      );
      const violations = getToolPolicyViolations(policy, calledToolNames);

      if (violations.length > 0) {
        if (policyViolationCorrectionUsed) {
          for await (const chunk of emitBufferedAnswer(
            "I can't answer this request accurately with the currently allowed tool path.",
          )) {
            yield chunk;
          }
          yield sse("done", {});
          return;
        }

        policyViolationCorrectionUsed = true;
        const rejectedDraft = normalizeTextContent(choice.message.content).trim();
        if (rejectedDraft) {
          messages.push({
            role: "assistant",
            content: rejectedDraft,
          });
        }
        messages.push({
          role: "user",
          content: buildToolCorrectionPrompt(policy, violations),
        });
        continue;
      }

      anyToolCalled = true;
      messages.push({
        role: "assistant",
        content: normalizeTextContent(choice.message.content),
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;
        const args = parseToolArguments(toolCall.function.arguments);
        observedToolCalls.push({ name, args });
        observer?.onToolCall?.({ name, args });

        yield sse("tool_call", { name, arguments: args });

        try {
          const [result, displays] = await dispatchToolWithDisplay(name, args);
          const parsedContent = parseToolContent(result);
          const record: AgentToolResultRecord = {
            name,
            args,
            success: true,
            rawContent: result,
            parsedContent,
            displays,
          };
          observedToolResults.push(record);
          observer?.onToolResult?.(record);
          yield sse("tool_result", { name, success: true });
          for (const display of displays) {
            yield sse(display.type, display.data);
          }

          messages.push({
            role: "tool",
            name,
            tool_call_id: toolCall.id,
            content: result,
          });
        } catch (error) {
          const message = (error as Error).message || "Tool execution failed";
          const record: AgentToolResultRecord = {
            name,
            args,
            success: false,
            displays: [],
            error: message,
          };
          observedToolResults.push(record);
          observer?.onToolResult?.(record);
          yield sse("tool_result", { name, success: false, error: message });
          messages.push({
            role: "tool",
            name,
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: message }),
          });
        }
      }

      continue;
    }

    const draft = normalizeTextContent(choice.message.content).trim();

    if (!anyToolCalled && round === 0 && policy.requiredTools.length > 0) {
      messages.push({
        role: "assistant",
        content: draft,
      });
      messages.push({ role: "user", content: TOOL_REQUIRED_MESSAGE });
      continue;
    }

    const missingRequiredTools = getMissingRequiredTools(
      policy,
      observedToolCalls.map((toolCall) => toolCall.name as AgentToolName),
    );
    if (missingRequiredTools.length > 0) {
      if (missingRequiredCorrectionUsed) {
        for await (const chunk of emitBufferedAnswer(
          "I couldn't complete the required data fetch path for this question, so I can't answer it reliably from the current tool output.",
        )) {
          yield chunk;
        }
        yield sse("done", {});
        return;
      }

      missingRequiredCorrectionUsed = true;
      messages.push({
        role: "assistant",
        content: draft,
      });
      messages.push({
        role: "user",
        content: buildToolCorrectionPrompt(
          policy,
          missingRequiredTools.map((toolName) => `${toolName} is still required.`),
        ),
      });
      continue;
    }

    const validation = validateAgentAnswer(
      request,
      policy,
      draft,
      observedToolResults,
    );
    if (!validation.valid) {
      if (answerRevisionUsed) {
        const fallbackAnswer = buildValidationFallback(request, observedToolResults) ?? draft;
        for await (const chunk of emitBufferedAnswer(fallbackAnswer)) {
          yield chunk;
        }
        yield sse("done", {});
        return;
      }

      answerRevisionUsed = true;
      messages.push({
        role: "assistant",
        content: draft,
      });
      messages.push({
        role: "user",
        content: buildAnswerRevisionPrompt(validation.issues),
      });
      continue;
    }

    if (observedToolCalls.some((toolCall) => toolCall.name === "suggest_data_export")) {
      const suggestion = buildDownloadSuggestion(request, observedToolCalls);
      if (suggestion) {
        yield sse("display_download", suggestion);
      }
    }

    for await (const chunk of emitBufferedAnswer(draft)) {
      yield chunk;
    }
    yield sse("done", {});
    return;
  }

  yield sse("error", {
    message: `Agent exceeded maximum tool rounds (${MAX_TOOL_ROUNDS})`,
  });
  yield sse("done", {});
}
