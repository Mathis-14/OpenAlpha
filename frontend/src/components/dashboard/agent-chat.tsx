"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { sendGAEvent } from "@next/third-parties/google";
import AgentAlphaIcon from "@/components/agent-alpha-icon";
import ConversationHistoryDialog from "@/components/dashboard/conversation-history-dialog";
import QuantAlphaIcon from "@/components/quant-alpha-icon";
import MarkdownMessage from "@/components/markdown-message";
import UsageUnlockModal from "@/components/usage-unlock-modal";
import VoiceInput from "@/components/dashboard/voice-input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  QuotaExhaustedError,
  streamAgent,
  streamQuantAgent,
  type AgentSSE,
} from "@/lib/api";
import {
  addMessage,
  createConversation,
  deleteConversation,
  getMessages,
  getUserConversations,
  type ConversationPage,
} from "@/lib/chatStorage";
import { useUsageQuota } from "@/components/usage-quota-provider";
import { useAuth } from "@/contexts/AuthContext";
import {
  getCommodityCategoryLabel,
  getCommodityMeta,
} from "@/lib/commodities";
import { getCryptoMarketMeta } from "@/lib/crypto";
import type {
  ChatEntry,
  ChatMessage,
  ChatAgentType,
  DisplayAboutEntry,
  ToolCallEntry,
  ToolResultEntry,
  DisplayChartEntry,
  DisplayDownloadEntry,
  DisplayMetricEntry,
  ErrorEntry,
} from "@/types/chat";
import type {
  CommodityInstrumentSlug,
  CryptoInstrument,
  MacroCountry,
} from "@/types/api";
import { cn } from "@/lib/utils";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Download,
  History,
  LayoutDashboard,
  Loader2,
  LogIn,
  LogOut,
  Send,
  Wrench,
  XCircle,
} from "lucide-react";

type AgentAccent = "blue" | "orange";
type AgentIdentity = "alpha" | "quant";

interface AgentChatProps {
  ticker?: string;
  variant?: "dashboard" | "landing" | "quant";
  autoFocusInput?: boolean;
  macroCountry?: MacroCountry;
  cryptoInstrument?: CryptoInstrument;
  commodityInstrument?: CommodityInstrumentSlug;
  dataAssistant?: boolean;
  apiPath?: "/api/agent" | "/api/quant-agent";
  agentName?: string;
  agentIdentity?: AgentIdentity;
  accent?: AgentAccent;
  headerVariant?: "default" | "hero";
  headerRightContent?: ReactNode;
  introTextOverride?: string;
  headerDescriptionOverride?: string;
  hideHeader?: boolean;
  suggestionsOverride?: string[];
  showSuggestionsOverride?: boolean;
  placeholderOverride?: string;
  onEvent?: (event: AgentSSE) => void;
  renderDisplayEntriesInline?: boolean;
  prefillInput?: string | null;
  prefillNonce?: number;
  onConversationLoaded?: (messages: ChatMessage[]) => void;
  onConversationReset?: () => void;
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
  "What's the latest trend in gold?",
];

const QUANT_SUGGESTIONS = [
  "Show me the NVDA volatility surface.",
  "Fetch the AAPL option chain and summarize the nearest expiry.",
  "Compute the Greeks for a SPY 550 call expiring next month.",
  "Build the payoff diagram for a TSLA call spread.",
];

const DATA_SUGGESTIONS = [
  "I want gold data for a momentum project.",
  "I need BTC daily data for volatility research.",
  "I want U.S. CPI data for an inflation study.",
];

const MACRO_SUGGESTIONS: Record<MacroCountry, string[]> = {
  us: [
    "What changed in the latest U.S. inflation release?",
    "How do rates and unemployment look right now?",
    "Summarize the U.S. growth outlook from this dashboard.",
  ],
  fr: [
    "What changed in the latest France inflation release?",
    "How do French rates and unemployment look right now?",
    "Summarize the France growth outlook from this dashboard.",
  ],
};

const CRYPTO_SUGGESTIONS: Record<CryptoInstrument, string[]> = {
  "BTC-PERPETUAL": [
    "What's the current BTC perpetual trend?",
    "How do mark price and index price compare right now?",
    "What do open interest and funding say about positioning?",
  ],
  "ETH-PERPETUAL": [
    "What's the current ETH perpetual trend?",
    "How do mark price and index price compare right now?",
    "What do open interest and funding say about positioning?",
  ],
};

function getCommoditySuggestions(
  instrument: CommodityInstrumentSlug,
): string[] {
  const commodityName = getCommodityMeta(instrument).name;

  return [
    `What's the current ${commodityName} price trend?`,
    `How is ${commodityName} trading versus its 52-week range?`,
    `Summarize ${commodityName} price action over the last month.`,
  ];
}

function getAccentClasses(accent: AgentAccent) {
  if (accent === "orange") {
    return {
      solidButton: "bg-[#E8701A] text-white hover:bg-[#cf6112]",
      userBubble: "border border-[#E8701A]/18 bg-[#E8701A] text-white",
      softSurface: "border border-black/[0.08] bg-[#fff4ec]",
      softSurfaceHover: "hover:bg-[#ffe8d8] hover:text-[#161616]",
      inputSurface:
        "min-w-0 flex-1 rounded-[12px] border border-black/[0.08] bg-[#fff4ec] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
      inputFocus:
        "focus-within:border-[#E8701A]/36 focus-within:ring-4 focus-within:ring-[#E8701A]/12",
      iconSurface: "border border-black/[0.08] bg-[#fff4ec]",
      titleAccent: "text-[#c85f14]",
      subtleText: "text-black/62",
    };
  }

  return {
    solidButton: "bg-[#1080ff] text-white hover:bg-[#006fe6]",
    userBubble: "border border-black/[0.08] bg-[#1080ff] text-white shadow-none",
    softSurface: "border border-black/[0.08] bg-[#f4f8ff]",
    softSurfaceHover: "hover:bg-[#e9f3ff] hover:text-[#161616]",
    inputSurface:
      "min-w-0 flex-1 rounded-[12px] border border-black/[0.08] bg-[#f4f8ff] shadow-[inset_0_1px_0_rgba(255,255,255,0.72)]",
    inputFocus:
      "focus-within:border-[#1080ff]/36 focus-within:ring-4 focus-within:ring-[#1080ff]/12",
    iconSurface: "border border-black/[0.08] bg-[#f4f8ff]",
    titleAccent: "text-[#161616]",
    subtleText: "text-black/62",
  };
}

function renderAgentIcon(identity: AgentIdentity, variant: "default" | "light", className?: string) {
  if (identity === "quant") {
    return <QuantAlphaIcon className={className} />;
  }

  return <AgentAlphaIcon tone={variant} className={className} />;
}

export default function AgentChat({
  ticker,
  variant = "dashboard",
  autoFocusInput = false,
  macroCountry,
  cryptoInstrument,
  commodityInstrument,
  dataAssistant = false,
  apiPath = "/api/agent",
  agentName,
  agentIdentity = "alpha",
  accent = "blue",
  headerVariant = "default",
  headerRightContent,
  introTextOverride,
  headerDescriptionOverride,
  hideHeader = false,
  suggestionsOverride,
  showSuggestionsOverride,
  placeholderOverride,
  onEvent,
  renderDisplayEntriesInline = true,
  prefillInput,
  prefillNonce,
  onConversationLoaded,
  onConversationReset,
}: AgentChatProps) {
  const router = useRouter();
  const {
    user,
    loading: authLoading,
    openAuthModal,
    signOut,
    getIdToken,
  } = useAuth();
  const {
    quota,
    loading: quotaLoading,
    unavailable: quotaUnavailable,
    refresh,
    setRemaining,
  } = useUsageQuota();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [unlockOpen, setUnlockOpen] = useState(false);
  const [prefillHighlight, setPrefillHighlight] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [historyItems, setHistoryItems] = useState<ConversationPage["items"]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const [historyCursor, setHistoryCursor] = useState<ConversationPage["cursor"]>(null);
  const [mounted, setMounted] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const conversationIdRef = useRef<string | null>(null);
  const conversationCreateRef = useRef<Promise<string | null> | null>(null);
  const lastAppliedPrefillKeyRef = useRef<string | null>(null);
  const prefillHighlightTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const accentClasses = getAccentClasses(accent);

  const isLanding = variant === "landing";
  const isQuant = agentIdentity === "quant" || variant === "quant";
  const displayVariant: "dashboard" | "landing" = isLanding ? "landing" : "dashboard";
  const landingCompactEmpty = isLanding && messages.length === 0 && !streaming;
  const landingHasConversation = isLanding && (messages.length > 0 || streaming);
  const cryptoMeta = cryptoInstrument
    ? getCryptoMarketMeta(cryptoInstrument)
    : null;
  const commodityMeta = commodityInstrument
    ? getCommodityMeta(commodityInstrument)
    : null;
  const agentType: ChatAgentType = isQuant ? "quant-alpha" : "alpha";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    const prefillKey =
      prefillInput == null ? null : `${String(prefillNonce ?? "none")}::${prefillInput}`;

    if (
      prefillInput == null ||
      lastAppliedPrefillKeyRef.current === prefillKey ||
      streaming
    ) {
      return;
    }

    setInput(prefillInput);
    lastAppliedPrefillKeyRef.current = prefillKey;
    setPrefillHighlight(true);
    if (prefillHighlightTimeoutRef.current) {
      clearTimeout(prefillHighlightTimeoutRef.current);
    }
    prefillHighlightTimeoutRef.current = setTimeout(() => {
      setPrefillHighlight(false);
      prefillHighlightTimeoutRef.current = null;
    }, 1400);
    inputRef.current?.focus();
  }, [prefillInput, prefillNonce, streaming]);

  useEffect(() => {
    return () => {
      if (prefillHighlightTimeoutRef.current) {
        clearTimeout(prefillHighlightTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    conversationIdRef.current = conversationId;
  }, [conversationId]);

  const loadConversationHistory = useCallback(async (reset: boolean) => {
    if (!user) {
      setHistoryItems([]);
      setHistoryHasMore(false);
      setHistoryCursor(null);
      return;
    }

    setHistoryLoading(true);
    try {
      const page = await getUserConversations(
        user.uid,
        agentType,
        reset ? null : historyCursor,
      );
      setHistoryItems((current) => (reset ? page.items : [...current, ...page.items]));
      setHistoryHasMore(page.hasMore);
      setHistoryCursor(page.cursor);
    } catch (error) {
      console.error("Failed to load conversations", error);
    } finally {
      setHistoryLoading(false);
    }
  }, [agentType, historyCursor, user]);

  useEffect(() => {
    conversationCreateRef.current = null;
    conversationIdRef.current = null;
    setConversationId(null);
    if (!user) {
      setHistoryItems([]);
      setHistoryHasMore(false);
      setHistoryCursor(null);
      setHistoryOpen(false);
      return;
    }

    void loadConversationHistory(true);
  }, [loadConversationHistory, user, user?.uid]);

  function runInBackground<T>(promise: Promise<T>, label: string) {
    void promise.catch((error) => {
      console.error(label, error);
    });
  }

  const ensureConversation = useCallback(async (firstMessage: string) => {
    if (!user) {
      return null;
    }

    if (conversationIdRef.current) {
      return conversationIdRef.current;
    }

    if (conversationCreateRef.current) {
      return conversationCreateRef.current;
    }

    const creation = createConversation(user.uid, agentType, firstMessage)
      .then((nextConversationId) => {
        conversationIdRef.current = nextConversationId;
        setConversationId(nextConversationId);
        runInBackground(loadConversationHistory(true), "Failed to refresh conversation history");
        return nextConversationId;
      })
      .catch((error) => {
        console.error("Failed to create conversation", error);
        return null;
      })
      .finally(() => {
        conversationCreateRef.current = null;
      });

    conversationCreateRef.current = creation;
    return creation;
  }, [agentType, loadConversationHistory, user]);

  function persistMessage(nextMessage: ChatMessage, firstUserMessage: string) {
    if (!user) {
      return;
    }

    runInBackground(
      ensureConversation(firstUserMessage).then(async (nextConversationId) => {
        if (!nextConversationId) {
          return;
        }

        await addMessage(nextConversationId, nextMessage);
        await loadConversationHistory(true);
      }),
      "Failed to persist chat message",
    );
  }

  async function handleLoadConversation(nextConversationId: string) {
    try {
      const persistedMessages = await getMessages(nextConversationId);
      setMessages(persistedMessages);
      setConversationId(nextConversationId);
      conversationIdRef.current = nextConversationId;
      setHistoryOpen(false);
      setInput("");
      onConversationLoaded?.(persistedMessages);
      scrollToBottom();
    } catch (error) {
      console.error("Failed to load conversation", error);
    }
  }

  function handleResetConversation() {
    setMessages([]);
    setInput("");
    setConversationId(null);
    conversationIdRef.current = null;
    conversationCreateRef.current = null;
    setHistoryOpen(false);
    onConversationReset?.();
  }

  async function handleDeleteConversation(targetConversationId: string) {
    if (!window.confirm("Delete this conversation?")) {
      return;
    }

    try {
      await deleteConversation(targetConversationId);
      setHistoryItems((current) => current.filter((item) => item.id !== targetConversationId));
      if (conversationIdRef.current === targetConversationId) {
        handleResetConversation();
      }
      runInBackground(loadConversationHistory(true), "Failed to refresh conversation history");
    } catch (error) {
      console.error("Failed to delete conversation", error);
    }
  }

  function scrollToBottom() {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: "smooth",
      });
    });
  }

  async function handleSend(query: string) {
    const trimmedQuery = query.trim();
    if (!trimmedQuery || streaming) return;
    setVoiceError(null);
    const shouldBlockOnClientQuota =
      !quotaLoading &&
      !quotaUnavailable &&
      quota != null &&
      quota.remaining <= 0 &&
      (!user || quota.limit >= 20);
    if (shouldBlockOnClientQuota) {
      sendGAEvent("event", "agent_request_failed", {
        reason: "quota_exceeded",
      });
      setUnlockOpen(true);
      return;
    }

    sendGAEvent("event", "agent_request_started");
    setStreaming(true);

    const authToken = user ? await getIdToken() : null;
    const entries: ChatEntry[] = [];
    const controller = new AbortController();
    abortRef.current = controller;
    let requestAccepted = false;
    let runningText = "";
    let requestFailed = false;
    let assistantCompleted = false;

    try {
      const stream =
        apiPath === "/api/quant-agent"
          ? streamQuantAgent(
              { query: trimmedQuery },
              controller.signal,
              {
                onAccepted: (remaining) => {
                  requestAccepted = true;
                  setMessages((prev) => [
                    ...prev,
                    { role: "user", content: trimmedQuery },
                    { role: "assistant", content: "", entries: [] },
                  ]);
                  persistMessage(
                    { role: "user", content: trimmedQuery },
                    trimmedQuery,
                  );
                  setInput("");
                  if (remaining != null) {
                    setRemaining(remaining);
                  } else if (quota && !quotaUnavailable) {
                    setRemaining(Math.max(0, quota.remaining - 1));
                  } else {
                    void refresh();
                  }
                  scrollToBottom();
                },
                authToken,
              },
            )
          : streamAgent(
              {
                query: trimmedQuery,
                ticker,
                dashboard_context: dataAssistant
                  ? "data"
                  : commodityInstrument
                  ? "commodity"
                  : cryptoInstrument
                    ? "crypto"
                    : macroCountry
                      ? "macro"
                      : undefined,
                country: macroCountry,
                crypto_instrument: cryptoInstrument,
                commodity_instrument: commodityInstrument,
              },
              controller.signal,
              {
                onAccepted: (remaining) => {
                  requestAccepted = true;
                  setMessages((prev) => [
                    ...prev,
                    { role: "user", content: trimmedQuery },
                    { role: "assistant", content: "", entries: [] },
                  ]);
                  persistMessage(
                    { role: "user", content: trimmedQuery },
                    trimmedQuery,
                  );
                  setInput("");
                  if (remaining != null) {
                    setRemaining(remaining);
                  } else if (quota && !quotaUnavailable) {
                    setRemaining(Math.max(0, quota.remaining - 1));
                  } else {
                    void refresh();
                  }
                  scrollToBottom();
                },
                authToken,
              },
            );

      for await (const sse of stream) {
        if (sse.event !== "done") {
          onEvent?.(sse);
        }
        if (sse.event === "done") {
          assistantCompleted = true;
          if (requestAccepted && !requestFailed) {
            sendGAEvent("event", "agent_request_completed");
          }
          continue;
        }

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

        if (sse.event === "error") {
          requestFailed = true;
          sendGAEvent("event", "agent_request_failed", { reason: "error" });
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

      if (requestAccepted && assistantCompleted && !requestFailed) {
        persistMessage(
          {
            role: "assistant",
            content: runningText,
            entries: [...entries],
          },
          trimmedQuery,
        );
      }
    } catch (err) {
      if (err instanceof QuotaExhaustedError) {
        sendGAEvent("event", "agent_request_failed", {
          reason: "quota_exceeded",
        });
        setRemaining(err.remaining);
        setUnlockOpen(true);
        void refresh();
        return;
      }

      if ((err as Error).name !== "AbortError") {
        requestFailed = true;
        sendGAEvent("event", "agent_request_failed", { reason: "error" });
        const message = (err as Error).message || "Connection failed";
        if (!requestAccepted) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "",
              entries: [{ type: "error", message }],
            },
          ]);
        } else {
          entries.push({
            type: "error",
            message,
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

  async function handleVoiceTranscription(text: string) {
    const transcript = text.trim();
    if (!transcript) {
      return;
    }

    setInput(transcript);
    requestAnimationFrame(() => {
      void handleSend(transcript);
    });
  }

  const suggestions = ticker
    ? TICKER_SUGGESTIONS
    : dataAssistant
      ? DATA_SUGGESTIONS
    : isQuant
      ? QUANT_SUGGESTIONS
    : commodityInstrument
      ? getCommoditySuggestions(commodityInstrument)
    : cryptoInstrument
      ? CRYPTO_SUGGESTIONS[cryptoInstrument]
      : macroCountry
      ? MACRO_SUGGESTIONS[macroCountry]
      : isLanding
        ? LANDING_SUGGESTIONS
        : GENERAL_SUGGESTIONS;
  const interactiveBodyReady = !isQuant || mounted;
  const showSuggestions =
    interactiveBodyReady &&
    (showSuggestionsOverride ?? true) && messages.length === 0 && !streaming;
  const resolvedSuggestions = suggestionsOverride ?? suggestions;

  const placeholderText = ticker
    ? `Ask about ${ticker}...`
    : dataAssistant
      ? "Describe your project and what data you need..."
    : isQuant
      ? "Ask about U.S. equity options, vol surfaces, or payoff diagrams..."
    : commodityInstrument
      ? `Ask about ${commodityMeta?.name ?? commodityInstrument}...`
    : cryptoInstrument
      ? `Ask about ${cryptoMeta?.symbol ?? cryptoInstrument}...`
    : macroCountry
      ? `Ask about ${macroCountry === "fr" ? "France" : "U.S."} macro data...`
      : "Ask about any stock or market...";
  const resolvedPlaceholder = placeholderOverride ?? placeholderText;

  const introText = ticker ? (
    <>
      Ask anything about{" "}
      <span className={isLanding ? "font-medium text-[#161616]" : "font-medium text-foreground"}>
        {ticker}
      </span>
      . The agent will fetch real data before answering.
    </>
  ) : commodityInstrument && commodityMeta ? (
    <>
      Ask about{" "}
      <span className={isLanding ? "font-medium text-[#161616]" : "font-medium text-foreground"}>
        {commodityMeta.name}
      </span>
      . Alpha will use live {getCommodityCategoryLabel(commodityMeta.category).toLowerCase()} market data from this commodity dashboard before answering.
    </>
  ) : cryptoInstrument && cryptoMeta ? (
    `Ask about ${cryptoMeta.name}. Alpha will use live Deribit market data from this ${cryptoMeta.detailLabel.toLowerCase()} dashboard before answering.`
  ) : dataAssistant ? (
    "Describe your project and what data you need. Alpha will do it for you."
  ) : macroCountry ? (
    `Ask about ${
      macroCountry === "fr" ? "France" : "U.S."
    } inflation, rates, growth, or labor data. Alpha will use the macro dashboard context before answering.`
  ) : isQuant ? (
    "Ask about U.S. equity options. Quant Alpha can fetch option chains, compute Greeks, build volatility surfaces, and model multi-leg payoff diagrams."
  ) : (
    "Ask about stocks, commodities, macro trends, or supported crypto markets. The agent will fetch real data before answering."
  );
  const resolvedIntroText = introTextOverride ?? introText;
  const showLandingIntro =
    !isLanding || Boolean(ticker || commodityInstrument);
  const resolvedAgentName =
    agentName ??
    (dataAssistant ? "Data assistant" : isQuant ? "Quant Alpha" : "Alpha");
  const canShowHistory = !isLanding && Boolean(user);
  const shouldShowAuthPrompt = !authLoading && !user;
  const headerDescription = headerDescriptionOverride ??
    (dataAssistant
      ? "Describe your project and what data you need. Alpha will do it for you."
      : isQuant
      ? "Ask about U.S. equity options. Quant Alpha will use live options data before answering."
      : commodityInstrument && commodityMeta
      ? `Ask about ${commodityMeta.name}. Alpha will stay grounded in this commodity dashboard.`
      : cryptoInstrument && cryptoMeta
      ? `Ask about ${cryptoMeta.symbol}. Alpha will stay grounded in Deribit market data from this ${cryptoMeta.detailLabel.toLowerCase()} dashboard.`
      : macroCountry
      ? `Ask about ${macroCountry === "fr" ? "France" : "U.S."} macro data. Alpha will use the dashboard context before answering.`
      : `Ask about ${ticker}. Alpha will pull live data before answering.`);
  const headerActionButtons = (
    <>
      {canShowHistory ? (
        <button
          type="button"
          onClick={() => setHistoryOpen(true)}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-black/[0.08] bg-white px-3 text-sm text-black/62 transition-colors hover:bg-[#f7fbff] hover:text-[#161616]"
        >
          <History className="h-4 w-4" />
          History
        </button>
      ) : null}
      {canShowHistory ? (
        <button
          type="button"
          onClick={() => {
            void signOut();
          }}
          className="inline-flex h-9 items-center justify-center gap-2 rounded-[10px] border border-black/[0.08] bg-white px-3 text-sm text-black/62 transition-colors hover:bg-[#f7fbff] hover:text-[#161616]"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      ) : null}
    </>
  );

  return (
    <Card
      className={cn(
        "flex h-full min-h-0 flex-col overflow-hidden border backdrop-blur-xl",
        isLanding
          ? cn(
              "rounded-[16px] border-black/[0.08] bg-white shadow-[0_34px_70px_-40px_rgba(0,0,0,0.12)]",
              landingCompactEmpty
                ? "min-h-[300px] sm:min-h-[320px]"
                : landingHasConversation
                  ? "h-[min(70vh,560px)] sm:h-[min(72vh,620px)]"
                  : "h-[420px] sm:h-[460px]",
            )
          : cn(
              "h-full rounded-[16px] border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]",
              dataAssistant && "shadow-[0_30px_60px_-36px_rgba(0,0,0,0.12)]",
              isQuant && "border-[#E8701A]/16 shadow-[0_28px_60px_-42px_rgba(232,112,26,0.28)]",
            ),
      )}
    >
      {!hideHeader && (
        <CardHeader
          className={cn(
            "shrink-0",
            isLanding ? "pb-1.5 pt-4" : headerVariant === "hero" ? "pb-4 pt-5" : "pb-3",
          )}
        >
          {isLanding ? (
            <div className="space-y-2 text-center">
              <div className="space-y-1.5">
                <CardTitle className="text-[1.7rem] font-medium tracking-tight text-[#161616] sm:text-[1.9rem]">
                  {resolvedAgentName}
                </CardTitle>
                <p className="mx-auto max-w-[48rem] text-sm leading-6 font-light text-black/68 sm:text-[15px]">
                  {headerDescription}
                </p>
              </div>
            </div>
          ) : headerVariant === "hero" ? (
            <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
              <div className="space-y-3">
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "rounded-[18px] border p-3.5 shadow-[0_18px_34px_-28px_rgba(0,0,0,0.16)]",
                      accent === "orange"
                        ? "border-[#E8701A]/16 bg-[#fff3e8] shadow-[0_18px_34px_-28px_rgba(232,112,26,0.28)]"
                        : "border-black/[0.08] bg-[#eef5ff]",
                    )}
                  >
                    {renderAgentIcon(agentIdentity, "light", "h-12 w-12")}
                  </div>
                  <div className="space-y-1.5">
                    <p
                      className={cn(
                        "text-[11px] font-medium uppercase tracking-[0.2em]",
                        accent === "orange" ? "text-[#c85f14]" : "text-[#1080ff]",
                      )}
                    >
                      {isQuant ? "Quant workspace" : "Agent workspace"}
                    </p>
                    <CardTitle className="text-[2rem] font-medium tracking-tight text-[#161616]">
                      {resolvedAgentName}
                    </CardTitle>
                  </div>
                </div>
                {headerDescription ? (
                  <p className={cn("max-w-[40rem] text-sm leading-6 font-light", accentClasses.subtleText)}>
                    {headerDescription}
                  </p>
                ) : null}
              </div>
              {headerRightContent ? (
                <div className="flex flex-wrap items-center gap-2">
                  {headerRightContent}
                  {headerActionButtons}
                </div>
              ) : canShowHistory ? (
                <div className="flex flex-wrap items-center gap-2">
                  {headerActionButtons}
                </div>
              ) : null}
            </div>
          ) : (
            <div className="flex items-start justify-between gap-3">
              <div className="space-y-1.5">
                <CardTitle className="flex items-center gap-2 text-[#161616]">
                  {renderAgentIcon(agentIdentity, "light", "h-[1.75rem] w-[1.75rem]")}
                  <span className={isQuant ? accentClasses.titleAccent : undefined}>
                    {resolvedAgentName}
                  </span>
                </CardTitle>
                {headerDescription ? (
                  <p className={cn("text-sm font-light", accentClasses.subtleText)}>
                    {headerDescription}
                  </p>
                ) : null}
              </div>
              {canShowHistory ? (
                <div className="flex flex-wrap items-center gap-2">
                  {headerActionButtons}
                </div>
              ) : null}
            </div>
          )}
        </CardHeader>
      )}

      <CardContent
        className={cn(
          "flex min-h-0 flex-1 flex-col overflow-hidden",
          isLanding ? "gap-3 px-5 pb-4 text-left sm:px-6 sm:pb-4" : "gap-3",
        )}
      >
        <div
          ref={scrollRef}
          className={cn(
            isLanding
              ? landingCompactEmpty
                ? "space-y-3 px-1 pb-0 pt-0 text-left"
                : "min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 px-1 pb-1 pt-0 text-left"
              : cn(
                  "min-h-0 flex-1 overflow-y-auto overscroll-contain space-y-4 rounded-[14px] border p-4 pr-3",
                  isQuant
                    ? "border-[#E8701A]/12 bg-[#fffaf5]"
                    : "border-black/[0.08] bg-[#f8fbff]",
                ),
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
              {showLandingIntro && resolvedIntroText ? (
                <div className={cn("space-y-3", dataAssistant && "space-y-2")}>
                  <p
                    className={cn(
                      accentClasses.subtleText,
                      isLanding
                        ? "mx-auto max-w-2xl text-[15px] leading-7 font-light text-black/66"
                        : dataAssistant
                          ? "text-sm leading-6 text-black/68"
                          : "text-sm",
                    )}
                  >
                    {resolvedIntroText}
                  </p>
                </div>
              ) : null}
              <div
                className={cn(
                  "flex flex-wrap gap-2.5",
                  isLanding && "justify-center",
                  dataAssistant && "gap-2",
                )}
              >
                {resolvedSuggestions.map((s) => (
                  <button
                    key={s}
                    onClick={() => handleSend(s)}
                    className={cn(
                      "rounded-full border transition-colors",
                      isLanding
                        ? cn(
                            accentClasses.softSurface,
                            accentClasses.softSurfaceHover,
                            "px-4 py-2 text-xs font-normal text-black/74",
                          )
                        : dataAssistant
                          ? "border-black/[0.08] bg-white px-3 py-2 text-xs text-black/68 hover:bg-[#f4f8ff] hover:text-[#161616]"
                          : cn(
                              accentClasses.softSurface,
                              accentClasses.softSurfaceHover,
                              "px-3 py-1.5 text-xs text-black/62",
                            ),
                    )}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}

          {interactiveBodyReady &&
            messages.map((msg, i) => (
            <MessageBubble
              key={`${msg.role}-${i}-${msg.content.slice(0, 32)}`}
              message={msg}
              streaming={streaming && i === messages.length - 1}
              variant={displayVariant}
              agentIdentity={agentIdentity}
              accent={accent}
              renderDisplayEntriesInline={renderDisplayEntriesInline}
              onOpenTicker={(symbol) => router.push(`/dashboard/${symbol}`)}
              onOpenMacro={(country) =>
                router.push(country === "fr" ? "/macro?country=fr" : "/macro")
              }
              onOpenCrypto={(instrument) => router.push(`/crypto/${instrument}`)}
              onOpenCommodity={(instrument) =>
                router.push(`/commodities/${instrument}`)
              }
              onOpenDownload={(href) => router.push(href)}
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
          {streaming ? (
            <>
              <div
                className={cn(
                  accentClasses.inputSurface,
                  accentClasses.inputFocus,
                  prefillHighlight &&
                    (accent === "orange"
                      ? "animate-pulse border-[#E8701A]/50 bg-[#fff1e3] ring-4 ring-[#E8701A]/18 shadow-[0_0_0_1px_rgba(232,112,26,0.14),0_0_28px_-8px_rgba(232,112,26,0.56)]"
                      : "animate-pulse border-[#1080ff]/50 bg-[#eaf4ff] ring-4 ring-[#1080ff]/16 shadow-[0_0_0_1px_rgba(16,128,255,0.14),0_0_28px_-8px_rgba(16,128,255,0.48)]"),
                )}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (voiceError) {
                      setVoiceError(null);
                    }
                  }}
                  autoFocus={autoFocusInput}
                  placeholder={resolvedPlaceholder}
                  disabled={streaming}
                  className="h-10 w-full rounded-[12px] border-0 bg-transparent px-4 text-sm text-[#161616] outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                />
              </div>
              <button
                type="button"
                onClick={handleStop}
                className="inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-destructive/10 px-4 text-sm font-medium text-destructive transition-colors hover:bg-destructive/20"
              >
                Stop
              </button>
            </>
          ) : (
            <>
              <div
                className={cn(
                  accentClasses.inputSurface,
                  accentClasses.inputFocus,
                  prefillHighlight &&
                    (accent === "orange"
                      ? "animate-pulse border-[#E8701A]/50 bg-[#fff1e3] ring-4 ring-[#E8701A]/18 shadow-[0_0_0_1px_rgba(232,112,26,0.14),0_0_28px_-8px_rgba(232,112,26,0.56)]"
                      : "animate-pulse border-[#1080ff]/50 bg-[#eaf4ff] ring-4 ring-[#1080ff]/16 shadow-[0_0_0_1px_rgba(16,128,255,0.14),0_0_28px_-8px_rgba(16,128,255,0.48)]"),
                )}
              >
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={(e) => {
                    setInput(e.target.value);
                    if (voiceError) {
                      setVoiceError(null);
                    }
                  }}
                  autoFocus={autoFocusInput}
                  placeholder={resolvedPlaceholder}
                  disabled={streaming}
                  className="h-10 w-full rounded-[12px] border-0 bg-transparent px-4 text-sm text-[#161616] outline-none placeholder:text-muted-foreground/60 disabled:opacity-50"
                />
              </div>
              <VoiceInput
                accent={accent}
                disabled={streaming}
                onTranscription={handleVoiceTranscription}
                onError={setVoiceError}
                getAuthToken={getIdToken}
              />
              <button
                type="submit"
                aria-disabled={!input.trim() || undefined}
                className={cn(
                  "inline-flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-medium transition-colors",
                  accentClasses.solidButton,
                  prefillHighlight &&
                    (accent === "orange"
                      ? "animate-pulse shadow-[0_0_24px_-8px_rgba(232,112,26,0.68)]"
                      : "animate-pulse shadow-[0_0_24px_-8px_rgba(16,128,255,0.6)]"),
                  !input.trim() && "pointer-events-none opacity-50",
                )}
              >
                <Send className="h-4 w-4" />
                {isLanding && <span>{isQuant ? "Analyze" : "Ask"}</span>}
              </button>
            </>
          )}
        </form>
        {voiceError ? (
          <p
            className={cn(
              "shrink-0 text-xs font-medium",
              accent === "orange" ? "text-[#b85a15]" : "text-[#0b63c7]",
            )}
          >
            {voiceError}
          </p>
        ) : null}
        {shouldShowAuthPrompt ? (
          <button
            type="button"
            onClick={openAuthModal}
            className={cn(
              "shrink-0 self-start text-xs font-medium transition-colors",
              accent === "orange"
                ? "text-[#c85f14] hover:text-[#a85010]"
                : "text-[#0b63c7] hover:text-[#0850a3]",
            )}
          >
            <span className="inline-flex items-center gap-1.5">
              <LogIn className="h-3.5 w-3.5" />
              Sign in for 10 extra requests and saved conversations.
            </span>
          </button>
        ) : null}
      </CardContent>
      <ConversationHistoryDialog
        open={historyOpen}
        onOpenChange={setHistoryOpen}
        conversations={historyItems}
        currentConversationId={conversationId}
        loading={historyLoading}
        hasMore={historyHasMore}
        onLoadConversation={(targetConversationId) => {
          void handleLoadConversation(targetConversationId);
        }}
        onDeleteConversation={(targetConversationId) => {
          void handleDeleteConversation(targetConversationId);
        }}
        onNewConversation={handleResetConversation}
        onLoadMore={() => {
          void loadConversationHistory(false);
        }}
      />
      <UsageUnlockModal
        open={unlockOpen}
        remaining={quota?.remaining ?? 0}
        onClose={() => setUnlockOpen(false)}
        onUnlocked={(nextQuota) => {
          setRemaining(nextQuota.remaining);
          setUnlockOpen(false);
        }}
      />
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
        points: (sse.data.points as { date: number; close: number }[]) ?? [],
      };
    case "display_download":
      return {
        type: "display_download",
        href: (sse.data.href as string) ?? "",
        label: (sse.data.label as string) ?? "Get the data",
        description:
          (sse.data.description as string) ??
          "Open the prefilled data export tool.",
      };
    case "display_about":
      return {
        type: "display_about",
        href: (sse.data.href as string) ?? "/about",
        label: (sse.data.label as string) ?? "About Alpha",
        description:
          (sse.data.description as string) ??
          "Learn more about OpenAlpha and its creator.",
        githubHref: (sse.data.github_href as string) ?? "https://github.com/Mathis-14",
        linkedinHref:
          (sse.data.linkedin_href as string) ??
          "https://www.linkedin.com/in/mathis-villaret",
      };
    case "display_quant_chain":
      return {
        type: "display_quant_chain",
        chain: sse.data.chain as import("@/types/api").QuantOptionChain,
      };
    case "display_quant_greeks":
      return {
        type: "display_quant_greeks",
        result: sse.data.result as import("@/types/api").QuantGreeksResult,
        preferredMetric:
          typeof sse.data.preferred_metric === "string"
            ? (sse.data.preferred_metric as import("@/types/api").QuantGreeksMetric)
            : undefined,
      };
    case "display_quant_surface":
      return {
        type: "display_quant_surface",
        surface: sse.data.surface as import("@/types/api").QuantSurfaceResult,
      };
    case "display_quant_payoff":
      return {
        type: "display_quant_payoff",
        payoff: sse.data.payoff as import("@/types/api").QuantPayoffResult,
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

function getSuggestedCryptoInstrument(
  entries: ChatEntry[],
): CryptoInstrument | null {
  const instruments = Array.from(
    new Set(
      entries.flatMap((entry) => {
        if (
          entry.type !== "tool_call" ||
          (entry.name !== "get_crypto_overview" &&
            entry.name !== "get_crypto_price_history")
        ) {
          return [];
        }

        const candidate = entry.arguments.instrument;
        if (candidate === "BTC-PERPETUAL" || candidate === "ETH-PERPETUAL") {
          return [candidate];
        }

        if (candidate === "BTC" || candidate === "BITCOIN") {
          return ["BTC-PERPETUAL"];
        }

        if (candidate === "ETH" || candidate === "ETHEREUM") {
          return ["ETH-PERPETUAL"];
        }

        return [];
      }),
    ),
  );

  return instruments.length === 1
    ? (instruments[0] as CryptoInstrument)
    : null;
}

function getSuggestedCommodityInstrument(
  entries: ChatEntry[],
): CommodityInstrumentSlug | null {
  const instruments = Array.from(
    new Set(
      entries.flatMap((entry) => {
        if (
          entry.type !== "tool_call" ||
          (entry.name !== "get_commodity_overview" &&
            entry.name !== "get_commodity_price_history")
        ) {
          return [];
        }

        const candidate = entry.arguments.instrument;
        if (typeof candidate !== "string") {
          return [];
        }

        try {
          return [getCommodityMeta(candidate as CommodityInstrumentSlug).instrument];
        } catch {
          return [];
        }
      }),
    ),
  );

  return instruments.length === 1
    ? (instruments[0] as CommodityInstrumentSlug)
    : null;
}

function getSuggestedMacroCountry(entries: ChatEntry[]): MacroCountry | null {
  const macroCalls = entries.filter(
    (entry): entry is ToolCallEntry =>
      entry.type === "tool_call" && entry.name === "get_macro_snapshot",
  );

  if (macroCalls.length === 0) {
    return null;
  }

  const explicitCountries = Array.from(
    new Set(
      macroCalls.flatMap((entry) => {
        const candidate = entry.arguments.country;
        if (candidate === "fr" || candidate === "us") {
          return [candidate];
        }
        return [];
      }),
    ),
  );

  if (explicitCountries.length > 1) {
    return null;
  }

  return (explicitCountries[0] as MacroCountry | undefined) ?? "us";
}

function MessageBubble({
  message,
  streaming,
  variant,
  agentIdentity,
  accent,
  renderDisplayEntriesInline,
  onOpenTicker,
  onOpenMacro,
  onOpenCrypto,
  onOpenCommodity,
  onOpenDownload,
}: {
  message: ChatMessage;
  streaming: boolean;
  variant: "dashboard" | "landing";
  agentIdentity: AgentIdentity;
  accent: AgentAccent;
  renderDisplayEntriesInline: boolean;
  onOpenTicker: (ticker: string) => void;
  onOpenMacro: (country: MacroCountry) => void;
  onOpenCrypto: (instrument: CryptoInstrument) => void;
  onOpenCommodity: (instrument: CommodityInstrumentSlug) => void;
  onOpenDownload: (href: string) => void;
}) {
  const accentClasses = getAccentClasses(accent);
  if (message.role === "user") {
    return (
      <div className="flex justify-end">
        <div
          className={cn(
            "max-w-[80%] rounded-[14px] rounded-br-[8px] px-4 py-2.5 text-sm text-foreground",
            accentClasses.userBubble,
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
  const displayDownloads = entries.filter(
    (e): e is DisplayDownloadEntry => e.type === "display_download",
  );
  const displayAboutCards = entries.filter(
    (e): e is DisplayAboutEntry => e.type === "display_about",
  );
  const errorEntries = entries.filter(
    (e): e is ErrorEntry => e.type === "error",
  );
  const suggestedTicker =
    variant === "landing" ? getSuggestedTicker(entries) : null;
  const suggestedCommodityInstrument =
    variant === "landing" && !suggestedTicker
      ? getSuggestedCommodityInstrument(entries)
      : null;
  const suggestedCryptoInstrument =
    variant === "landing" && !suggestedTicker && !suggestedCommodityInstrument
      ? getSuggestedCryptoInstrument(entries)
      : null;
  const suggestedMacroCountry =
    variant === "landing" &&
    !suggestedTicker &&
    !suggestedCommodityInstrument &&
    !suggestedCryptoInstrument
      ? getSuggestedMacroCountry(entries)
      : null;

  return (
    <div className="space-y-2.5 text-left">
      {toolEntries.length > 0 && (
        <div className="space-y-1">
          {toolEntries.map((entry, i) => (
            <ToolBadge
              key={`${entry.type}-${entry.name}-${i}`}
              entry={entry}
              variant={variant}
            />
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

      {suggestedCommodityInstrument && (
        <CommodityDashboardSuggestionCard
          instrument={suggestedCommodityInstrument}
          variant={variant}
          onOpen={() => onOpenCommodity(suggestedCommodityInstrument)}
        />
      )}

      {suggestedCryptoInstrument && (
        <CryptoDashboardSuggestionCard
          instrument={suggestedCryptoInstrument}
          variant={variant}
          onOpen={() => onOpenCrypto(suggestedCryptoInstrument)}
        />
      )}

      {suggestedMacroCountry && (
        <MacroDashboardSuggestionCard
          country={suggestedMacroCountry}
          variant={variant}
          onOpen={() => onOpenMacro(suggestedMacroCountry)}
        />
      )}

      {renderDisplayEntriesInline && displayMetrics.map((entry, i) => (
        <MetricDisplay key={`metric-${i}`} metrics={entry.metrics} variant={variant} />
      ))}

      {renderDisplayEntriesInline && displayCharts.map((entry, i) => (
        <ChartDisplay key={`chart-${i}`} entry={entry} variant={variant} />
      ))}

      {renderDisplayEntriesInline && displayDownloads.map((entry, i) => (
        <DownloadSuggestionCard
          key={`download-${i}`}
          entry={entry}
          variant={variant}
          onOpen={() => onOpenDownload(entry.href)}
        />
      ))}

      {renderDisplayEntriesInline && displayAboutCards.map((entry, i) => (
        <AboutSuggestionCard
          key={`about-${i}`}
          entry={entry}
          variant={variant}
        />
      ))}

      {message.content && (
        <div className="flex gap-2.5">
          <div
            className={cn(
              "mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full",
              accentClasses.iconSurface,
            )}
          >
            {renderAgentIcon(agentIdentity, "light", "h-[1.45rem] w-[1.45rem]")}
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
        <div
          key={`error-${entry.message.slice(0, 32)}-${i}`}
          className="flex items-start gap-2 text-sm text-destructive"
        >
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

function DownloadSuggestionCard({
  entry,
  onOpen,
  variant,
}: {
  entry: DisplayDownloadEntry;
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
              variant === "landing" || variant === "dashboard"
                ? "text-black/54"
                : "text-white/52",
            )}
          >
            <Download className="h-3.5 w-3.5" />
            {entry.label === "Get the data with details"
              ? "Export Plan Ready"
              : "Raw CSV Ready"}
          </p>
          <p
            className={cn(
              "text-sm",
              variant === "landing" || variant === "dashboard"
                ? "text-black/76"
                : "text-white/78",
            )}
          >
            {entry.description}
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
          {entry.label}
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function AboutSuggestionCard({
  entry,
  variant,
}: {
  entry: DisplayAboutEntry;
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
      <div className="space-y-3">
        <div className="space-y-1">
          <p
            className={cn(
              "inline-flex items-center gap-2 text-[11px] font-normal uppercase tracking-[0.2em]",
              variant === "landing" || variant === "dashboard"
                ? "text-black/54"
                : "text-white/52",
            )}
          >
            <ArrowUpRight className="h-3.5 w-3.5" />
            About OpenAlpha
          </p>
          <p
            className={cn(
              "text-sm",
              variant === "landing" || variant === "dashboard"
                ? "text-black/76"
                : "text-white/78",
            )}
          >
            {entry.description}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <a
            href={entry.href}
            className={cn(
              "inline-flex h-9 items-center justify-center gap-1.5 rounded-[10px] px-4 text-sm font-medium transition-colors",
              variant === "landing" || variant === "dashboard"
                ? "border border-black/[0.08] bg-[#1080ff] text-white hover:bg-[#006fe6]"
                : "border border-white/[0.1] bg-white text-black hover:bg-white/92",
            )}
          >
            {entry.label}
            <ArrowUpRight className="h-4 w-4" />
          </a>
          <a
            href={entry.githubHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-[10px] border px-4 text-sm transition-colors",
              variant === "landing" || variant === "dashboard"
                ? "border-black/[0.08] bg-white text-black/72 hover:bg-[#eef5ff] hover:text-[#161616]"
                : "border-white/[0.1] bg-transparent text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            GitHub
          </a>
          <a
            href={entry.linkedinHref}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "inline-flex h-9 items-center justify-center rounded-[10px] border px-4 text-sm transition-colors",
              variant === "landing" || variant === "dashboard"
                ? "border-black/[0.08] bg-white text-black/72 hover:bg-[#eef5ff] hover:text-[#161616]"
                : "border-white/[0.1] bg-transparent text-white/80 hover:bg-white/10 hover:text-white",
            )}
          >
            LinkedIn
          </a>
        </div>
      </div>
    </div>
  );
}

function CommodityDashboardSuggestionCard({
  instrument,
  onOpen,
  variant,
}: {
  instrument: CommodityInstrumentSlug;
  onOpen: () => void;
  variant: "dashboard" | "landing";
}) {
  const meta = getCommodityMeta(instrument);

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
            Commodity Dashboard Ready
          </p>
          <p className={cn("text-sm", variant === "landing" || variant === "dashboard" ? "text-black/76" : "text-white/78")}>
            Open <span className="font-medium">{meta.name}</span> for price action,
            benchmark context, and a dedicated commodity agent.
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
          Open {meta.short_label}
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function CryptoDashboardSuggestionCard({
  instrument,
  onOpen,
  variant,
}: {
  instrument: CryptoInstrument;
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
            Crypto Dashboard Ready
          </p>
          <p className={cn("text-sm", variant === "landing" || variant === "dashboard" ? "text-black/76" : "text-white/78")}>
            Open <span className="font-mono font-semibold">{instrument}</span> for
            Deribit price action, open interest, funding context, and a dedicated
            crypto agent.
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
          Open {instrument}
          <ArrowUpRight className="h-4 w-4" />
        </button>
      </div>
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

function MacroDashboardSuggestionCard({
  country,
  onOpen,
  variant,
}: {
  country: MacroCountry;
  onOpen: () => void;
  variant: "dashboard" | "landing";
}) {
  const label = country === "fr" ? "France" : "U.S.";

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
            Macro Dashboard Ready
          </p>
          <p className={cn("text-sm", variant === "landing" || variant === "dashboard" ? "text-black/76" : "text-white/78")}>
            Open the <span className="font-medium">{label}</span> macro dashboard
            for rates, inflation, growth, charts, and a dedicated macro agent.
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
          Open {label}
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
