"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import AgentAlphaIcon from "@/components/agent-alpha-icon";
import MarkdownMessage from "@/components/markdown-message";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { streamAgent, type AgentSSE } from "@/lib/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  Send,
  Wrench,
  XCircle,
} from "lucide-react";

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

interface AgentChatProps {
  ticker?: string;
  variant?: "dashboard" | "landing";
  autoFocusInput?: boolean;
}

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

const LANDING_SUGGESTIONS = [
  "What's Nvidia's current price trend?",
  "What are the latest U.S. inflation data?",
  "How is Bitcoin performing this week?",
];

export default function AgentChat({
  ticker,
  variant = "dashboard",
  autoFocusInput = false,
}: AgentChatProps) {
  const router = useRouter();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const isLanding = variant === "landing";
  const landingCompactEmpty = isLanding && messages.length === 0 && !streaming;
  const landingHasConversation = isLanding && (messages.length > 0 || streaming);

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

  const suggestions = ticker
    ? TICKER_SUGGESTIONS
    : isLanding
      ? LANDING_SUGGESTIONS
      : GENERAL_SUGGESTIONS;
  const showSuggestions = messages.length === 0 && !streaming;

  const placeholderText = ticker
    ? `Ask about ${ticker}...`
    : "Ask about any stock or market...";

  const introText = ticker ? (
    <>
      Ask anything about{" "}
      <span className={isLanding ? "font-medium text-[#161616]" : "font-medium text-foreground"}>
        {ticker}
      </span>
      . The agent will fetch real data before answering.
    </>
  ) : (
    "Ask about any stock, market trends, or economic indicators. The agent will fetch real data before answering."
  );
  const showLandingIntro = !isLanding || Boolean(ticker);

  return (
    <Card
      className={cn(
        "flex flex-col overflow-hidden border backdrop-blur-xl",
        isLanding
          ? cn(
              "rounded-[16px] border-black/[0.08] bg-white shadow-[0_34px_70px_-40px_rgba(0,0,0,0.12)]",
              landingCompactEmpty
                ? "min-h-[300px] sm:min-h-[320px]"
                : landingHasConversation
                  ? "h-[min(70vh,560px)] sm:h-[min(72vh,620px)]"
                  : "h-[420px] sm:h-[460px]",
            )
          : "h-full rounded-[16px] border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]",
      )}
    >
      <CardHeader
        className={cn(
          "shrink-0",
          isLanding ? "pb-1.5 pt-4" : "pb-3",
        )}
      >
        {isLanding ? (
          <div className="space-y-2 text-center">
            <div className="space-y-1.5">
              <CardTitle className="text-[1.7rem] font-medium tracking-tight text-[#161616] sm:text-[1.9rem]">
                Ask Alpha
              </CardTitle>
              <p className="mx-auto max-w-[48rem] text-sm leading-6 font-light text-black/68 sm:text-[15px]">
                Ask about stocks, macro trends, or economic signals, then open a stock dashboard when you need to go deeper.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-1.5">
            <CardTitle className="flex items-center gap-2 text-[#161616]">
              <AgentAlphaIcon tone="light" className="h-[1.75rem] w-[1.75rem]" />
              Alpha
            </CardTitle>
            <p className="text-sm font-light text-black/62">
              Ask about {ticker}. Alpha will pull live data before answering.
            </p>
          </div>
        )}
      </CardHeader>

      <CardContent
        className={cn(
          "flex min-h-0 flex-1 flex-col",
          isLanding ? "gap-3 px-5 pb-4 text-left sm:px-6 sm:pb-4" : "gap-3",
        )}
      >
        <div
          ref={scrollRef}
          className={cn(
            isLanding
              ? landingCompactEmpty
                ? "space-y-3 px-1 pb-0 pt-0 text-left"
                : "min-h-0 flex-1 overflow-y-auto space-y-4 px-1 pb-1 pt-0 text-left"
              : "min-h-0 flex-1 overflow-y-auto space-y-4 rounded-[14px] border border-black/[0.08] bg-[#f8fbff] p-4 pr-3",
          )}
        >
          {showSuggestions && (
            <div
              className={cn(
                "space-y-3",
                isLanding &&
                  "mx-auto flex max-w-3xl flex-col items-center pt-0 text-center",
              )}
            >
              {showLandingIntro && (
                <div className="space-y-3">
                  <p
                    className={cn(
                      "text-muted-foreground",
                      isLanding
                        ? "mx-auto max-w-2xl text-[15px] leading-7 font-light text-black/66"
                        : "text-sm",
                    )}
                  >
                    {introText}
                  </p>
                </div>
              )}
              <div
                className={cn(
                  "flex flex-wrap gap-2.5",
                  isLanding && "justify-center",
                )}
              >
                {suggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className={cn(
                      "rounded-full border transition-colors",
                      isLanding
                        ? "border-black/[0.08] bg-[#f4f8ff] px-4 py-2 text-xs font-normal text-black/74 hover:bg-[#e9f3ff] hover:text-[#161616]"
                        : "border-black/[0.08] bg-white px-3 py-1.5 text-xs text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]",
                    )}
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
              variant={variant}
              onOpenTicker={(symbol) => router.push(`/dashboard/${symbol}`)}
            />
          ))}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend(input);
          }}
          className={cn(
            "shrink-0",
            isLanding
              ? "flex flex-col gap-3 border-t border-black/[0.08] pt-2.5 sm:flex-row"
              : "flex gap-2 border-t border-black/[0.08] pt-3",
          )}
        >
          <div className="relative flex-1">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              autoFocus={autoFocusInput}
              placeholder={placeholderText}
              disabled={streaming}
              className={cn(
                "w-full border outline-none transition-colors placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-primary/50 disabled:opacity-50",
                isLanding
                  ? "h-10 rounded-[10px] border-black/[0.08] bg-[#f4f8ff] px-4 text-sm text-[#161616] shadow-[inset_0_1px_0_rgba(255,255,255,0.7)]"
                  : "h-10 rounded-[10px] border-black/[0.08] bg-[#f4f8ff] px-4 text-sm text-[#161616] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
              )}
            />
          </div>
          {streaming ? (
            <button
              type="button"
              onClick={handleStop}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-1.5 font-medium transition-colors",
                isLanding
                  ? "h-10 rounded-[10px] bg-destructive/10 px-4 text-sm text-destructive hover:bg-destructive/20"
                  : "h-10 rounded-[10px] bg-destructive/10 px-4 text-sm text-destructive hover:bg-destructive/20",
              )}
            >
              Stop
            </button>
          ) : (
            <button
              type="submit"
              aria-disabled={!input.trim() || undefined}
              className={cn(
                "inline-flex shrink-0 items-center justify-center gap-1.5 font-medium transition-colors",
                isLanding
                  ? "h-10 rounded-[10px] bg-[#1080ff] px-4 text-sm text-white shadow-none hover:bg-[#006fe6]"
                  : "h-10 rounded-[10px] bg-[#1080ff] px-4 text-sm text-white hover:bg-[#006fe6]",
                !input.trim() && "pointer-events-none opacity-50",
              )}
            >
              <Send className="h-4 w-4" />
              {isLanding && <span>Ask</span>}
            </button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}

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

function getSuggestedTicker(entries: ChatEntry[]): string | null {
  const symbols = Array.from(
    new Set(
      entries.flatMap((entry) => {
        if (entry.type !== "tool_call") {
          return [];
        }

        const candidate = entry.arguments.symbol ?? entry.arguments.ticker;
        if (typeof candidate !== "string" || !candidate.trim()) {
          return [];
        }

        return [candidate.trim().toUpperCase()];
      }),
    ),
  );

  return symbols.length === 1 ? symbols[0] : null;
}

function MessageBubble({
  message,
  streaming,
  variant,
  onOpenTicker,
}: {
  message: ChatMessage;
  streaming: boolean;
  variant: "dashboard" | "landing";
  onOpenTicker: (ticker: string) => void;
}) {
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[80%] rounded-[14px] rounded-br-[8px] px-4 py-2.5 text-sm text-foreground",
              variant === "landing" || variant === "dashboard"
                ? "border border-black/[0.08] bg-[#1080ff] text-white shadow-none"
                : "bg-primary/15",
          )}
        >
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
  const suggestedTicker =
    variant === "landing" ? getSuggestedTicker(entries) : null;

  return (
    <div className="space-y-2.5 text-left">
      {toolEntries.length > 0 && (
        <div className="space-y-1">
          {toolEntries.map((entry, i) => (
            <ToolBadge key={i} entry={entry} variant={variant} />
          ))}
        </div>
      )}

      {suggestedTicker && (
        <DashboardSuggestionCard
          symbol={suggestedTicker}
          variant={variant}
          onOpen={() => onOpenTicker(suggestedTicker)}
        />
      )}

      {displayMetrics.map((entry, i) => (
        <MetricDisplay key={`metric-${i}`} metrics={entry.metrics} variant={variant} />
      ))}

      {displayCharts.map((entry, i) => (
        <ChartDisplay key={`chart-${i}`} entry={entry} variant={variant} />
      ))}

      {message.content && (
        <div className="flex gap-2.5">
          <div
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              variant === "landing" || variant === "dashboard"
                ? "border border-black/[0.08] bg-[#f4f8ff]"
                : "bg-primary/15",
            )}
          >
            <AgentAlphaIcon
              tone={variant === "landing" || variant === "dashboard" ? "light" : "default"}
              className="h-[1.45rem] w-[1.45rem]"
            />
          </div>
          <div
            className={cn(
              "min-w-0 flex-1 text-sm",
              variant === "landing" || variant === "dashboard" ? "text-[#161616]" : "text-foreground/90",
            )}
          >
            <MarkdownMessage
              content={message.content}
              tone={variant === "landing" || variant === "dashboard" ? "light" : "default"}
              streaming={streaming}
            />
          </div>
        </div>
      )}

      {errorEntries.map((entry, i) => (
        <div key={i} className="flex items-start gap-2 text-sm text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          {entry.message}
        </div>
      ))}

      {streaming && !message.content && errorEntries.length === 0 && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          {toolEntries.length > 0 ? "Processing..." : "Thinking..."}
        </div>
      )}
    </div>
  );
}

function DashboardSuggestionCard({
  symbol,
  onOpen,
  variant,
}: {
  symbol: string;
  onOpen: () => void;
  variant: "dashboard" | "landing";
}) {
  return (
    <div
      className={cn(
        "rounded-[14px] p-3 text-left",
        variant === "landing" || variant === "dashboard"
          ? "border border-black/[0.08] bg-[#f4f8ff]"
          : "border border-white/[0.08] bg-white/[0.03]",
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p
            className={cn(
              "inline-flex items-center gap-2 text-[11px] font-normal uppercase tracking-[0.2em]",
              variant === "landing" || variant === "dashboard" ? "text-black/54" : "text-white/52",
            )}
          >
            <LayoutDashboard className="h-3.5 w-3.5" />
            Stock Workspace Ready
          </p>
          <p className={cn("text-sm", variant === "landing" || variant === "dashboard" ? "text-black/76" : "text-white/78")}>
            Open the <span className="font-mono font-semibold">{symbol}</span>{" "}
            dashboard for charts, fundamentals, filings, and a dedicated stock
            agent.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpen}
          className={cn(
            "inline-flex h-9 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-medium transition-colors",
            variant === "landing" || variant === "dashboard"
              ? "border border-black/[0.08] bg-[#1080ff] text-white hover:bg-[#006fe6]"
              : "border border-white/[0.1] bg-white text-black hover:bg-white/92",
          )}
        >
          Open {symbol}
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function ToolBadge({
  entry,
  variant,
}: {
  entry: ToolCallEntry | ToolResultEntry;
  variant: "dashboard" | "landing";
}) {
  if (entry.type === "tool_call") {
    return (
      <div
        className={cn(
          "flex items-center gap-1.5 text-xs",
          variant === "landing" || variant === "dashboard" ? "text-black/54" : "text-muted-foreground",
        )}
      >
        <Wrench className="h-3 w-3" />
        <span>
          Calling{" "}
          <span
            className={cn(
              "font-mono font-medium",
              variant === "landing" || variant === "dashboard" ? "text-black/70" : "text-foreground/70",
            )}
          >
            {entry.name}
          </span>
        </span>
        {Object.keys(entry.arguments).length > 0 && (
          <span
            className={cn(
              "font-mono",
              variant === "landing" || variant === "dashboard"
                ? "text-black/46"
                : "text-muted-foreground/60",
            )}
          >
            (
            {Object.entries(entry.arguments)
              .map(([k, v]) => `${k}=${JSON.stringify(v)}`)
              .join(", ")}
            )
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
  variant,
}: {
  metrics: { label: string; value: string }[];
  variant: "dashboard" | "landing";
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2 rounded-[14px] p-3 text-left",
        variant === "landing" || variant === "dashboard"
          ? "border border-black/[0.08] bg-[#f4f8ff]"
          : "border border-border/40 bg-background/60",
      )}
    >
      {metrics.map((m) => (
        <div key={m.label}>
          <p
            className={cn(
              "text-[10px] uppercase tracking-wider",
              variant === "landing" || variant === "dashboard"
                ? "font-normal text-black/52"
                : "font-medium text-muted-foreground",
            )}
          >
            {m.label}
          </p>
          <p
            className={cn(
              "font-mono text-sm",
              variant === "landing" || variant === "dashboard"
                ? "font-medium text-[#161616]"
                : "font-semibold text-foreground",
            )}
          >
            {m.value}
          </p>
        </div>
      ))}
    </div>
  );
}

function ChartDisplay({
  entry,
  variant,
}: {
  entry: DisplayChartEntry;
  variant: "dashboard" | "landing";
}) {
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
    <div
      className={cn(
        "rounded-[14px] p-3 text-left",
        variant === "landing" || variant === "dashboard"
          ? "border border-black/[0.08] bg-[#f4f8ff]"
          : "border border-border/40 bg-background/60",
      )}
    >
      <div className="mb-1 flex items-baseline justify-between">
        <span
          className={cn(
            "text-xs",
            variant === "landing" || variant === "dashboard"
              ? "font-medium text-[#161616]"
              : "font-medium text-foreground",
          )}
        >
          {entry.symbol}
          <span
            className={cn(
              "ml-1.5",
              variant === "landing" || variant === "dashboard" ? "text-black/54" : "text-muted-foreground",
            )}
          >
            {entry.period}
          </span>
        </span>
        <span
          className={`text-xs font-mono font-semibold ${
            positive ? "text-positive" : "text-negative"
          }`}
        >
          ${closes[closes.length - 1].toFixed(2)}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${w} ${h}`}
        className="h-16 w-full"
        preserveAspectRatio="none"
      >
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
