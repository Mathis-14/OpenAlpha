"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { streamAgent, type AgentSSE } from "@/lib/api";
import MarkdownMessage from "@/components/markdown-message";
import {
  Bot,
  Loader2,
  Send,
  Wrench,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

interface ToolCallEntry {
  type: "tool_call";
  name: string;
  arguments: Record<string, unknown>;
}

interface ToolResultEntry {
  type: "tool_result";
  name: string;
  success: boolean;
  error?: string;
}

interface TextEntry {
  type: "text";
  content: string;
}

interface ErrorEntry {
  type: "error";
  message: string;
}

interface DisplayMetricEntry {
  type: "display_metric";
  metrics: { label: string; value: string }[];
}

interface DisplayChartEntry {
  type: "display_chart";
  symbol: string;
  period: string;
  points: { date: string; close: number }[];
}

type ChatEntry =
  | ToolCallEntry
  | ToolResultEntry
  | TextEntry
  | ErrorEntry
  | DisplayMetricEntry
  | DisplayChartEntry;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  entries?: ChatEntry[];
}

// ── Suggested questions ──────────────────────────────────────────────────────

const TICKER_SUGGESTIONS = [
  "Give me a quick overview of this stock",
  "What are the key risks?",
  "How are the fundamentals looking?",
  "Summarize the latest SEC filings",
  "What's the recent news sentiment?",
];

const GENERAL_SUGGESTIONS = [
  "How is the S&P 500 doing today?",
  "What's the current Fed Funds rate?",
  "Compare AAPL vs MSFT fundamentals",
  "What are the top tech stocks to watch?",
  "Summarize the latest macro outlook",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function AgentChat({ ticker }: { ticker?: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  async function handleSend(query: string) {
    if (!query.trim() || streaming) return;

    const userMsg: ChatMessage = { role: "user", content: query.trim() };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setStreaming(true);

    const entries: ChatEntry[] = [];
    const controller = new AbortController();
    abortRef.current = controller;

    setMessages((prev) => [
      ...prev,
      { role: "assistant", content: "", entries: [] },
    ]);

    let runningText = "";

    try {
      for await (const sse of streamAgent(
        query.trim(),
        ticker,
        controller.signal,
      )) {
        if (sse.event === "text_delta") {
          runningText += (sse.data.content as string) ?? "";
          setMessages((prev) => {
            const updated = [...prev];
            updated[updated.length - 1] = {
              role: "assistant",
              content: runningText,
              entries: [...entries],
            };
            return updated;
          });
          scrollToBottom();
          continue;
        }

        const entry = sseToEntry(sse);
        if (!entry) continue;

        entries.push(entry);

        if (entry.type === "text") {
          runningText = entry.content;
        }

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: runningText,
            entries: [...entries],
          };
          return updated;
        });
        scrollToBottom();
      }
    } catch (err) {
      if ((err as Error).name !== "AbortError") {
        entries.push({
          type: "error",
          message: (err as Error).message || "Connection failed",
        });
        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: runningText,
            entries: [...entries],
          };
          return updated;
        });
      }
    } finally {
      setStreaming(false);
      abortRef.current = null;
      scrollToBottom();
    }
  }

  function handleStop() {
    abortRef.current?.abort();
  }

  const suggestions = ticker ? TICKER_SUGGESTIONS : GENERAL_SUGGESTIONS;
  const showSuggestions = messages.length === 0 && !streaming;

  const placeholderText = ticker
    ? `Ask about ${ticker}...`
    : "Ask about any stock or market...";

  const introText = ticker ? (
    <>
      Ask anything about{" "}
      <span className="font-medium text-foreground">{ticker}</span>. The agent
      will fetch real data before answering.
    </>
  ) : (
    "Ask about any stock, market trends, or economic indicators. The agent will fetch real data before answering."
  );

  return (
    <Card className="flex h-full flex-col border-border/40 bg-card/60">
      <CardHeader className="shrink-0 pb-3">
        <CardTitle className="flex items-center gap-2">
          <Bot className="h-5 w-5 text-primary" />
          AI Agent
        </CardTitle>
      </CardHeader>

      <CardContent className="flex min-h-0 flex-1 flex-col gap-3">
        <div
          ref={scrollRef}
          className="min-h-0 flex-1 space-y-4 overflow-y-auto rounded-lg bg-background/40 p-4"
        >
          {showSuggestions && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{introText}</p>
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className="rounded-full border border-border/50 bg-card/60 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {messages.map((msg, i) => (
            <MessageBubble
              key={i}
              message={msg}
              streaming={streaming && i === messages.length - 1}
            />
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className="flex shrink-0 gap-2"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={placeholderText}
            disabled={streaming}
            className="h-10 flex-1 rounded-lg border border-border/50 bg-background/60 px-4 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50 disabled:opacity-50"
          />
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              aria-disabled={!input.trim() || undefined}
              className={`inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 ${!input.trim() ? "pointer-events-none opacity-50" : ""}`}
            >
              <Send className="h-4 w-4" />
            </button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function sseToEntry(sse: AgentSSE): ChatEntry | null {
  switch (sse.event) {
    case "tool_call":
      return {
        type: "tool_call",
        name: (sse.data.name as string) ?? "unknown",
        arguments: (sse.data.arguments as Record<string, unknown>) ?? {},
      };
    case "tool_result":
      return {
        type: "tool_result",
        name: (sse.data.name as string) ?? "unknown",
        success: sse.data.success as boolean,
        error: sse.data.error as string | undefined,
      };
    case "text":
      return { type: "text", content: (sse.data.content as string) ?? "" };
    case "display_metric":
      return {
        type: "display_metric",
        metrics: (sse.data.metrics as { label: string; value: string }[]) ?? [],
      };
    case "display_chart":
      return {
        type: "display_chart",
        symbol: (sse.data.symbol as string) ?? "",
        period: (sse.data.period as string) ?? "",
        points: (sse.data.points as { date: string; close: number }[]) ?? [],
      };
    case "error":
      return {
        type: "error",
        message: (sse.data.message as string) ?? "Unknown error",
      };
    case "done":
      return null;
    default:
      return null;
  }
}

function MessageBubble({
  message,
  streaming,
}: {
  message: ChatMessage;
  streaming: boolean;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[80%] rounded-2xl rounded-br-md bg-primary/15 px-4 py-2.5 text-sm text-foreground">
          {message.content}
        </div>
      </div>
    );
  }

  const entries = message.entries ?? [];
  const toolEntries = entries.filter(
    (e): e is ToolCallEntry | ToolResultEntry =>
      e.type === "tool_call" || e.type === "tool_result",
  );
  const displayMetrics = entries.filter(
    (e): e is DisplayMetricEntry => e.type === "display_metric",
  );
  const displayCharts = entries.filter(
    (e): e is DisplayChartEntry => e.type === "display_chart",
  );
  const errorEntries = entries.filter(
    (e): e is ErrorEntry => e.type === "error",
  );

  return (
    <div className="space-y-2">
      {/* Tool calls */}
      {toolEntries.length > 0 && (
        <div className="space-y-1">
          {toolEntries.map((entry, i) => (
            <ToolBadge key={i} entry={entry} />
          ))}
        </div>
      )}

      {/* Display metrics */}
      {displayMetrics.map((entry, i) => (
        <MetricDisplay key={`metric-${i}`} metrics={entry.metrics} />
      ))}

      {/* Display charts */}
      {displayCharts.map((entry, i) => (
        <ChartDisplay key={`chart-${i}`} entry={entry} />
      ))}

      {/* Text response */}
      {message.content && (
        <div className="flex gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 text-sm text-foreground/90">
            <MarkdownMessage content={message.content} />
          </div>
        </div>
      )}

      {/* Errors */}
      {errorEntries.map((entry, i) => (
        <div key={i} className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {entry.message}
        </div>
      ))}

      {/* Streaming indicator */}
      {streaming && !message.content && errorEntries.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {toolEntries.length > 0 ? "Processing..." : "Thinking..."}
        </div>
      )}
    </div>
  );
}

function ToolBadge({ entry }: { entry: ToolCallEntry | ToolResultEntry }) {
  if (entry.type === "tool_call") {
    return (
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Wrench className="h-3 w-3" />
        <span>
          Calling <span className="font-mono font-medium text-foreground/70">{entry.name}</span>
        </span>
        {Object.keys(entry.arguments).length > 0 && (
          <span className="font-mono text-muted-foreground/60">
            ({Object.entries(entry.arguments)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ")})
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      {entry.success ? (
        <CheckCircle2 className="h-3 w-3 text-positive" />
      ) : (
        <XCircle className="h-3 w-3 text-negative" />
      )}
      <span className={entry.success ? "text-positive" : "text-negative"}>
        {entry.name} {entry.success ? "succeeded" : "failed"}
      </span>
    </div>
  );
}

function MetricDisplay({
  metrics,
}: {
  metrics: { label: string; value: string }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-2 rounded-lg border border-border/40 bg-background/60 p-3">
      {metrics.map((m) => (
        <div key={m.label}>
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {m.label}
          </p>
          <p className="font-mono text-sm font-semibold text-foreground">
            {m.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ChartDisplay({ entry }: { entry: DisplayChartEntry }) {
  if (entry.points.length === 0) return null;

  const closes = entry.points.map((p) => p.close);
  const min = Math.min(...closes);
  const max = Math.max(...closes);
  const range = max - min || 1;
  const h = 60;
  const w = 200;
  const step = w / (closes.length - 1 || 1);

  const polyline = closes
    .map((c, i) => `${i * step},${h - ((c - min) / range) * h}`)
    .join(" ");

  const positive = closes[closes.length - 1] >= closes[0];

  return (
    <div className="rounded-lg border border-border/40 bg-background/60 p-3">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-xs font-medium text-foreground">
          {entry.symbol}
          <span className="ml-1.5 text-muted-foreground">{entry.period}</span>
        </span>
        <span
          className={`text-xs font-mono font-semibold ${positive ? "text-positive" : "text-negative"}`}
        >
          ${closes[closes.length - 1].toFixed(2)}
        </span>
      </div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-16 w-full" preserveAspectRatio="none">
        <polyline
          points={polyline}
          fill="none"
          stroke={positive ? "var(--color-positive)" : "var(--color-negative)"}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}
