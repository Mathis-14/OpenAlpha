import type { QuantAgentRequest as FrontendQuantAgentRequest } from "@/types/api";
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

function buildUserContent(query: string): string {
  return [
    query,
    "",
    "[Context: this is Quant Alpha. Scope is U.S. equity options only. Use tools for option chains, Greeks, volatility surfaces, and payoff diagrams. When the user asks for strategy analytics, translate the natural-language strategy into structured option legs before calling build_payoff_diagram.]",
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
        const args = parseToolArguments(toolCall.function.arguments);

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
