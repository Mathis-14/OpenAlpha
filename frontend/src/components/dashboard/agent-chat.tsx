"use client";

import { useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { streamAgent, type AgentSSE } from "@/lib/api";
import {
  Bot,
  Loader2,
  Minimize2,
  Maximize2,
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

type ChatEntry = ToolCallEntry | ToolResultEntry | TextEntry | ErrorEntry;

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  entries?: ChatEntry[];
}

// ── Suggested questions ──────────────────────────────────────────────────────

const SUGGESTIONS = [
  "Give me a quick overview of this stock",
  "What are the key risks?",
  "How are the fundamentals looking?",
  "Summarize the latest SEC filings",
  "What's the recent news sentiment?",
];

// ── Component ────────────────────────────────────────────────────────────────

export default function AgentChat({ ticker }: { ticker: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [minimized, setMinimized] = useState(false);
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

    try {
      for await (const sse of streamAgent(
        query.trim(),
        ticker,
        controller.signal,
      )) {
        const entry = sseToEntry(sse);
        if (!entry) continue;

        entries.push(entry);
        const text =
          entry.type === "text"
            ? entry.content
            : entries
                .filter((e): e is TextEntry => e.type === "text")
                .map((e) => e.content)
                .join("");

        setMessages((prev) => {
          const updated = [...prev];
          updated[updated.length - 1] = {
            role: "assistant",
            content: text,
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
            content: "",
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

  const showSuggestions = messages.length === 0 && !streaming;

  return (
    <Card className="flex flex-col border-border/40 bg-card/60">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5 text-primary" />
            AI Agent
          </CardTitle>
          <button
            onClick={() => setMinimized((v) => !v)}
            className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            aria-label={minimized ? "Expand chat" : "Minimize chat"}
          >
            {minimized ? <Maximize2 className="h-4 w-4" /> : <Minimize2 className="h-4 w-4" />}
          </button>
        </div>
      </CardHeader>

      {!minimized && (
        <CardContent className="flex flex-1 flex-col gap-3">
          <div
            ref={scrollRef}
            className="flex-1 space-y-4 overflow-y-auto rounded-lg bg-background/40 p-4"
            style={{ maxHeight: "480px", minHeight: "200px" }}
          >
            {showSuggestions && (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Ask anything about <span className="font-medium text-foreground">{ticker}</span>. The agent will
                  fetch real data before answering.
                </p>
                <div className="flex flex-wrap gap-2">
                  {SUGGESTIONS.map((s) => (
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
              <MessageBubble key={i} message={msg} streaming={streaming && i === messages.length - 1} />
            ))}
          </div>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSend(input);
            }}
            className="flex gap-2"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask about ${ticker}...`}
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
      )}
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

      {/* Text response */}
      {message.content && (
        <div className="flex gap-2.5">
          <div className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/15">
            <Bot className="h-3.5 w-3.5 text-primary" />
          </div>
          <div className="min-w-0 flex-1 text-sm leading-relaxed text-foreground/90 whitespace-pre-wrap">
            {message.content}
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
