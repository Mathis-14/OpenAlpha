import type {
  QuantAgentRequest as FrontendQuantAgentRequest,
  QuantGreeksMetric,
} from "@/types/api";
import { QUANT_SYSTEM_PROMPT } from "@/server/quant-agent/prompt";
import {
  QUANT_TOOL_DEFINITIONS,
  dispatchQuantToolWithDisplay,
} from "@/server/quant-agent/tools";

const MISTRAL_CHAT_URL = "https://api.mistral.ai/v1/chat/completions";
const MAX_TOOL_ROUNDS = 10;
const LLM_TIMEOUT_MS = 30_000;
const MAX_TOKENS = 1400;
const STREAM_CHUNK_SIZE = 48;
const STREAM_CHUNK_DELAY_MS = 18;
const TOOL_REQUIRED_MESSAGE =
  "You must call at least one tool before answering. Do not answer from memory.";
const FEATURED_TICKERS = [
  "SPY",
  "QQQ",
  "AAPL",
  "TSLA",
  "MSFT",
  "AMZN",
  "NVDA",
  "META",
  "GOOGL",
];
const SYMBOL_STOPWORDS = new Set([
  "IV",
  "DTE",
  "ATM",
  "ITM",
  "OTM",
  "USD",
  "CALL",
  "PUT",
  "VOL",
  "SSVI",
  "TTE",
]);

export type QuantAgentRequest = FrontendQuantAgentRequest;

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
    chunks.push(remaining.slice(0, cut));
    remaining = remaining.slice(cut);
  }

  if (remaining) {
    chunks.push(remaining);
  }

  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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

async function complete(messages: MistralMessage[]): Promise<CompletionResponse> {
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
        tools: QUANT_TOOL_DEFINITIONS,
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

type QuantIntentHints = {
  symbol?: string;
  optionType?: "call" | "put";
  focusMetric?: QuantGreeksMetric;
  daysToExpiry?: number;
  volatility?: number;
  strike?: number;
};

export function extractQuantIntentHints(query: string): QuantIntentHints {
  const source = query.trim();
  const upper = source.toUpperCase();

  const featuredSymbol = FEATURED_TICKERS.find((ticker) =>
    new RegExp(`\\b${ticker}\\b`, "i").test(source),
  );
  const uppercaseSymbol =
    upper.match(/\b[A-Z]{1,5}\b/g)?.find((candidate) => !SYMBOL_STOPWORDS.has(candidate)) ??
    undefined;

  const metricMap: Array<[RegExp, QuantGreeksMetric]> = [
    [/\bvolga\b/i, "volga"],
    [/\bvanna\b/i, "vanna"],
    [/\bspeed\b/i, "speed"],
    [/\bgamma\b/i, "gamma"],
    [/\bvega\b/i, "vega"],
    [/\btheta\b/i, "theta"],
    [/\brho\b/i, "rho"],
    [/\bdelta\b/i, "delta"],
    [/\bpayoff\b/i, "payoff"],
    [/\bprice\b/i, "price"],
  ];

  const focusMetric = metricMap.find(([pattern]) => pattern.test(source))?.[1];
  const optionType = /\bput\b/i.test(source)
    ? "put"
    : /\bcall\b/i.test(source)
      ? "call"
      : undefined;
  const daysToExpiryMatch = source.match(/(\d+(?:\.\d+)?)\s*(?:day|days|dte)\b/i);
  const volatilityMatch = source.match(/(\d+(?:\.\d+)?)\s*%?\s*(?:iv|vol|volatility)\b/i);
  const strikeMatch =
    source.match(/\bstrike\s+(\d+(?:\.\d+)?)\b/i) ??
    source.match(/\b(\d+(?:\.\d+)?)\s*(?:call|put)\b/i);

  return {
    symbol: featuredSymbol ?? uppercaseSymbol,
    optionType,
    focusMetric,
    daysToExpiry: daysToExpiryMatch ? Number(daysToExpiryMatch[1]) : undefined,
    volatility: volatilityMatch ? Number(volatilityMatch[1]) / 100 : undefined,
    strike: strikeMatch ? Number(strikeMatch[1]) : undefined,
  };
}

export function applyQuantHintsToToolArguments(
  name: string,
  args: Record<string, unknown>,
  hints: QuantIntentHints,
): Record<string, unknown> {
  const nextArgs = { ...args };

  if (
    (name === "fetch_option_chain" || name === "build_vol_surface" || name === "build_payoff_diagram") &&
    !nextArgs.symbol &&
    hints.symbol
  ) {
    nextArgs.symbol = hints.symbol;
  }

  if (name === "compute_greeks") {
    if (!nextArgs.symbol && hints.symbol) {
      nextArgs.symbol = hints.symbol;
    }
    if (!nextArgs.option_type && hints.optionType) {
      nextArgs.option_type = hints.optionType;
    }
    if (nextArgs.focus_metric == null && hints.focusMetric) {
      nextArgs.focus_metric = hints.focusMetric;
    }
    if (nextArgs.days_to_expiry == null && nextArgs.time_to_expiry_years == null && nextArgs.expiration == null && hints.daysToExpiry != null) {
      nextArgs.days_to_expiry = hints.daysToExpiry;
    }
    if (nextArgs.volatility == null && hints.volatility != null) {
      nextArgs.volatility = hints.volatility;
    }
    if (nextArgs.strike == null && hints.strike != null) {
      nextArgs.strike = hints.strike;
    }
  }

  return nextArgs;
}

function buildUserContent(query: string): string {
  const hints = extractQuantIntentHints(query);
  const contextHints = [
    hints.symbol ? `detected_ticker=${hints.symbol}` : null,
    hints.optionType ? `detected_option_type=${hints.optionType}` : null,
    hints.focusMetric ? `detected_metric=${hints.focusMetric}` : null,
    hints.daysToExpiry != null ? `detected_days_to_expiry=${hints.daysToExpiry}` : null,
    hints.volatility != null ? `detected_volatility=${(hints.volatility * 100).toFixed(1)}%` : null,
  ]
    .filter(Boolean)
    .join(", ");

  return [
    query,
    "",
    "[Context: this is Quant Alpha. Scope is U.S. equity options only. Use tools for option chains, Greeks, volatility surfaces, and payoff diagrams. When the user asks for strategy analytics, translate the natural-language strategy into structured option legs before calling build_payoff_diagram.]",
    contextHints ? `[Detected hints: ${contextHints}]` : "",
  ].join("\n");
}

export async function* runQuantAgent(
  request: QuantAgentRequest,
): AsyncGenerator<string, void, void> {
  if (!process.env.MISTRAL_API_KEY?.trim()) {
    yield sse("error", { message: "MISTRAL_API_KEY is not configured" });
    yield sse("done", {});
    return;
  }

  const messages: MistralMessage[] = [
    { role: "system", content: QUANT_SYSTEM_PROMPT },
    { role: "user", content: buildUserContent(request.query) },
  ];
  const queryHints = extractQuantIntentHints(request.query);

  let anyToolCalled = false;
  let toolCorrectionUsed = false;

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
      anyToolCalled = true;
      messages.push({
        role: "assistant",
        content: normalizeTextContent(choice.message.content),
        tool_calls: toolCalls,
      });

      for (const toolCall of toolCalls) {
        const name = toolCall.function.name;
        const args = applyQuantHintsToToolArguments(
          name,
          parseToolArguments(toolCall.function.arguments),
          queryHints,
        );

        yield sse("tool_call", { name, arguments: args });

        try {
          const [result, displays] = await dispatchQuantToolWithDisplay(name, args);
          yield sse("tool_result", { name, success: true });

          for (const display of displays) {
            yield sse(display.type, display.data as Record<string, unknown>);
          }

          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name,
            content: result,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Tool failed";
          yield sse("tool_result", { name, success: false, error: message });
          messages.push({
            role: "tool",
            tool_call_id: toolCall.id,
            name,
            content: JSON.stringify({ error: message }),
          });
        }
      }

      continue;
    }

    const finalAnswer = normalizeTextContent(choice.message.content).trim();
    if (!anyToolCalled) {
      if (toolCorrectionUsed) {
        for await (const chunk of emitBufferedAnswer(
          "I need to use a quant tool before I can answer reliably.",
        )) {
          yield chunk;
        }
        yield sse("done", {});
        return;
      }

      toolCorrectionUsed = true;
      if (finalAnswer) {
        messages.push({ role: "assistant", content: finalAnswer });
      }
      messages.push({ role: "user", content: TOOL_REQUIRED_MESSAGE });
      continue;
    }

    for await (const chunk of emitBufferedAnswer(finalAnswer)) {
      yield chunk;
    }
    yield sse("done", {});
    return;
  }

  yield sse("error", { message: "Quant Alpha hit the maximum tool rounds." });
  yield sse("done", {});
}
