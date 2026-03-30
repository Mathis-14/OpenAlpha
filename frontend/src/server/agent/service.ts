import type {
  CommodityInstrumentSlug,
  CryptoInstrument,
  MacroCountry,
  MacroIndicatorSlug,
} from "@/types/api";
import { isCommodityInstrument } from "@/lib/commodities";
import { buildDataPageHref, getDisplayAssetName } from "@/lib/data-export";
import { SYSTEM_PROMPT } from "@/server/agent/prompt";
import {
  normalizeSuggestedDataExportArgs,
  TOOL_DEFINITIONS,
  dispatchToolWithDisplay,
} from "@/server/agent/tools";

const MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions";
const MAX_TOOL_ROUNDS = 10;
const LLM_TIMEOUT_MS = 30_000;
const STREAM_TIMEOUT_MS = 60_000;
const MAX_TOKENS = 1024;
const TOOL_REQUIRED_MESSAGE =
  "You must call at least one tool before answering. Do not answer from memory.";

export type AgentRequest = {
  query: string;
  ticker?: string | null;
  dashboard_context?: "macro" | "crypto" | "commodity" | "data" | null;
  country?: MacroCountry | null;
  crypto_instrument?: CryptoInstrument | null;
  commodity_instrument?: CommodityInstrumentSlug | null;
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

type StreamChunk = {
  choices?: Array<{
    delta?: {
      content?: unknown;
    };
  }>;
};

function sse(event: string, data: Record<string, unknown>): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
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

function buildUserContent(
  query: string,
  ticker: string | null | undefined,
  dashboardContext: "macro" | "crypto" | "commodity" | "data" | null | undefined,
  country: MacroCountry | null | undefined,
  cryptoInstrument: CryptoInstrument | null | undefined,
  commodityInstrument: CommodityInstrumentSlug | null | undefined,
): string {
  if (ticker) {
    return `${query}\n\n[Context: the user is asking about ticker ${ticker.toUpperCase()}]`;
  }

  if (dashboardContext === "commodity" && commodityInstrument) {
    return (
      `${query}\n\n` +
      `[Context: the user is on the commodity dashboard for ${commodityInstrument}. ` +
      `Use get_commodity_overview and get_commodity_price_history for ${commodityInstrument}. ` +
      "Keep the answer grounded in this commodity dashboard and its live futures market data.]"
    );
  }

  if (dashboardContext === "crypto" && cryptoInstrument) {
    return (
      `${query}\n\n` +
      `[Context: the user is on the crypto dashboard for ${cryptoInstrument}. ` +
      `Use get_crypto_overview and get_crypto_price_history for ${cryptoInstrument}. ` +
      "Keep the answer grounded in Deribit market data only.]"
    );
  }

  if (dashboardContext === "macro") {
    const normalizedCountry = country === "fr" ? "fr" : "us";
    const countryLabel =
      normalizedCountry === "fr" ? "France" : "the United States";

    return (
      `${query}\n\n` +
      `[Context: the user is on the macro dashboard for ${countryLabel}. ` +
      `Use get_macro_snapshot with country='${normalizedCountry}' for broad context, ` +
      `and use get_macro_series with country='${normalizedCountry}' when the user asks about one indicator trend or history. ` +
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

type ReaderChunk = ReadableStreamReadResult<Uint8Array>;

async function readWithTimeout(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): Promise<ReaderChunk> {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race<ReaderChunk>([
      reader.read(),
      new Promise<ReaderChunk>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error("LLM stream timed out during response generation"));
        }, STREAM_TIMEOUT_MS);
      }),
    ]);
  } finally {
    if (timeoutId != null) {
      clearTimeout(timeoutId);
    }
  }
}

async function* streamCompletion(
  messages: MistralMessage[],
): AsyncGenerator<string, void, void> {
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
        max_tokens: MAX_TOKENS,
        stream: true,
      }),
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      throw new Error("LLM streaming request timed out");
    }
    throw new Error(`LLM stream failed: ${(error as Error).message}`);
  }

  if (!response.ok || !response.body) {
    const body = await response.text().catch(() => "");
    throw new Error(`LLM stream failed: ${body || response.statusText}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  try {
    for (;;) {
      const { done, value } = await readWithTimeout(reader);
      if (done) {
        break;
      }

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";

      for (const part of parts) {
        const lines = part.split("\n");
        let data = "";
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            data += line.slice(6);
          }
        }

        if (!data || data === "[DONE]") {
          continue;
        }

        try {
          const payload = JSON.parse(data) as StreamChunk;
          const delta = payload.choices?.[0]?.delta?.content;
          const text = normalizeTextContent(delta);
          if (text) {
            yield text;
          }
        } catch {
          continue;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function parseToolArguments(raw: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function wantsDownload(query: string): boolean {
  return /\b(csv|download|export|raw data|dataset|data file)\b/i.test(query);
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
      toolCall.name === "get_news" ||
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
): AsyncGenerator<string, void, void> {
  if (!process.env.MISTRAL_API_KEY?.trim()) {
    yield sse("error", { message: "MISTRAL_API_KEY is not configured" });
    yield sse("done", {});
    return;
  }

  const messages: MistralMessage[] = [
    { role: "system", content: SYSTEM_PROMPT },
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

    if (!hasToolCalls) {
      if (!anyToolCalled && round === 0) {
        messages.push({
          role: "assistant",
          content: normalizeTextContent(choice.message.content),
        });
        messages.push({ role: "user", content: TOOL_REQUIRED_MESSAGE });
        continue;
      }

      if (request.dashboard_context === "data" || wantsDownload(request.query)) {
        const suggestion = buildDownloadSuggestion(request, observedToolCalls);
        if (suggestion) {
          yield sse("display_download", suggestion);
        }
      }

      try {
        for await (const text of streamCompletion(messages)) {
          yield sse("text_delta", { content: text });
        }
      } catch (error) {
        yield sse("error", { message: (error as Error).message });
        yield sse("done", {});
        return;
      }

      yield sse("done", {});
      return;
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

      yield sse("tool_call", { name, arguments: args });

      try {
        const [result, displays] = await dispatchToolWithDisplay(name, args);
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
        yield sse("tool_result", { name, success: false, error: message });
        messages.push({
          role: "tool",
          name,
          tool_call_id: toolCall.id,
          content: JSON.stringify({ error: message }),
        });
      }
    }
  }

  yield sse("error", {
    message: `Agent exceeded maximum tool rounds (${MAX_TOOL_ROUNDS})`,
  });
  yield sse("done", {});
}
