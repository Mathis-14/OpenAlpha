"use client";

import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { sendGAEvent } from "@next/third-parties/google";
import {
  ArrowLeft,
  CandlestickChart,
  Orbit,
  Rows3,
  Sigma,
  Sparkles,
  TableProperties,
  Waves,
} from "lucide-react";
import AgentChat from "@/components/dashboard/agent-chat";
import QuantSurfacePlot from "@/components/quant/quant-surface-plot";
import RequestQuotaBadge from "@/components/request-quota-badge";
import type { AgentSSE } from "@/lib/api";
import { computeBlackScholes } from "@/lib/quant/black-scholes";
import { deriveActiveTenor } from "@/lib/quant/greeks-context";
import type { ChatEntry, ChatMessage } from "@/types/chat";
import type {
  QuantGreeksActiveTenor,
  QuantGreeksMetric,
  QuantGreeksResult,
  QuantGreeksTermNode,
  QuantOptionChain,
  QuantOptionContract,
  QuantPayoffResult,
  QuantSurfaceResult,
} from "@/types/api";

type QuantDisplayItem =
  | { id: string; type: "display_quant_chain"; chain: QuantOptionChain }
  | {
      id: string;
      type: "display_quant_greeks";
      result: QuantGreeksResult;
      preferredMetric?: QuantGreeksMetric;
    }
  | { id: string; type: "display_quant_surface"; surface: QuantSurfaceResult }
  | { id: string; type: "display_quant_payoff"; payoff: QuantPayoffResult };

const QUICK_PICKS = [
  "Show me the SPY volatility surface.",
  "Fetch the AAPL option chain and summarize the nearest expiry.",
  "Compute the Greeks for a NVDA 150 call expiring next month.",
  "Build the payoff diagram for a TSLA call spread.",
  "Show me the nearest QQQ option chain with the ATM contracts.",
  "Compute the Greeks for a MSFT put with 30 days to expiry and 25% vol.",
];

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

const Plot = dynamic(() => import("react-plotly.js"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[280px] items-center justify-center rounded-[14px] border border-[#E8701A]/12 bg-white text-sm text-black/58">
      Loading Greeks plot...
    </div>
  ),
});

const GREEKS_CHART_METRICS: Array<{
  id: QuantGreeksMetric;
  label: string;
}> = [
  { id: "delta", label: "Delta" },
  { id: "gamma", label: "Gamma" },
  { id: "vega", label: "Vega" },
  { id: "theta", label: "Theta" },
  { id: "rho", label: "Rho" },
  { id: "volga", label: "Volga" },
  { id: "vanna", label: "Vanna" },
  { id: "speed", label: "Speed" },
  { id: "price", label: "Price" },
  { id: "payoff", label: "Payoff" },
];

function formatNumber(value: number | null | undefined, digits = 2): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(value);
}

function formatPercent(value: number | null | undefined, digits = 1): string {
  if (value == null || !Number.isFinite(value)) {
    return "N/A";
  }

  return `${(value * 100).toFixed(digits)}%`;
}

function formatTenorFromDays(days: number): string {
  const safeDays = Math.max(1, Math.round(days));
  if (safeDays < 30) {
    return `${safeDays}D`;
  }

  const months = safeDays / 30.4375;
  if (months < 12) {
    return `${Math.round(months)}M`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = Math.round(months - years * 12);

  if (remainingMonths <= 0) {
    return `${years}Y`;
  }

  return `${years}Y ${remainingMonths}M`;
}

function getMaturitySliderLabels(minDays: number, maxDays: number): string[] {
  const anchors = [minDays, 30, 180, 365, maxDays]
    .filter((days, index, values) => days >= minDays && days <= maxDays && values.indexOf(days) === index)
    .sort((left, right) => left - right);

  return anchors.map((days) => formatTenorFromDays(days));
}

function formatDateLabel(value: string | null | undefined): string {
  if (!value) {
    return "N/A";
  }

  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function getNearestExpiration(chain: QuantOptionChain) {
  return (
    chain.expirations.find(
      (expiration) => expiration.expiration === chain.selected_expiration,
    ) ??
    chain.expirations[0] ??
    null
  );
}

function buildPreviewRows(chain: QuantOptionChain): Array<{
  strike: number;
  call: QuantOptionContract | null;
  put: QuantOptionContract | null;
}> {
  const expiration = getNearestExpiration(chain);
  if (!expiration) {
    return [];
  }

  const strikes = Array.from(
    new Set([
      ...expiration.calls.map((contract) => contract.strike),
      ...expiration.puts.map((contract) => contract.strike),
    ]),
  ).sort((left, right) => left - right);

  if (strikes.length === 0) {
    return [];
  }

  const centerStrike = chain.atm_strike ?? chain.spot_price;
  const centerIndex = strikes.reduce((bestIndex, strike, index) => {
    return Math.abs(strike - centerStrike) <
      Math.abs(strikes[bestIndex] - centerStrike)
      ? index
      : bestIndex;
  }, 0);

  const start = Math.max(0, centerIndex - 3);
  const end = Math.min(strikes.length, start + 7);
  const visibleStrikes = strikes.slice(start, end);

  return visibleStrikes.map((strike) => ({
    strike,
    call: expiration.calls.find((contract) => contract.strike === strike) ?? null,
    put: expiration.puts.find((contract) => contract.strike === strike) ?? null,
  }));
}

function getIntrinsicValue(result: QuantGreeksResult, spot: number): number {
  return result.option_type === "call"
    ? Math.max(spot - result.strike, 0)
    : Math.max(result.strike - spot, 0);
}

function getMetricValue(
  result: QuantGreeksResult,
  metric: QuantGreeksMetric,
  spot: number,
  inputs: {
    timeToExpiryYears: number;
    volatility: number;
    riskFreeRate: number;
    dividendYield: number;
    premiumReference: number;
  },
): number {
  const greeks = computeBlackScholes(
    result.option_type,
    spot,
    result.strike,
    inputs.timeToExpiryYears,
    inputs.volatility,
    inputs.riskFreeRate,
    inputs.dividendYield,
  );

  switch (metric) {
    case "price":
      return greeks.theoreticalPrice;
    case "payoff":
      return getIntrinsicValue(result, spot) - inputs.premiumReference;
    case "delta":
      return greeks.delta;
    case "gamma":
      return greeks.gamma;
    case "vega":
      return greeks.vega;
    case "theta":
      return greeks.theta;
    case "rho":
      return greeks.rho;
    case "volga":
      return greeks.volga;
    case "vanna":
      return greeks.vanna;
    case "speed":
      return greeks.speed;
  }
}

function buildGreeksProfile(
  result: QuantGreeksResult,
  metric: QuantGreeksMetric,
  inputs: {
    timeToExpiryYears: number;
    volatility: number;
    riskFreeRate: number;
    dividendYield: number;
    premiumReference: number;
  },
): Array<{ spot: number; value: number }> {
  const lowerAnchor = Math.min(result.spot_price, result.strike);
  const upperAnchor = Math.max(result.spot_price, result.strike);
  const start = Math.max(0.01, lowerAnchor * 0.55);
  const end = upperAnchor * 1.45;
  const steps = 72;

  return Array.from({ length: steps + 1 }, (_, index) => {
    const spot = start + ((end - start) * index) / steps;
    return {
      spot: Number(spot.toFixed(4)),
      value: getMetricValue(result, metric, spot, inputs),
    };
  });
}

type ClientTenorContext = QuantGreeksActiveTenor & {
  volatility: number;
  riskFreeRate: number;
  dividendYield: number;
};

function resolveClientTenorContext(
  result: QuantGreeksResult,
  targetDaysToExpiry: number,
): ClientTenorContext {
  const derived =
    result.maturity_nodes && result.maturity_nodes.length > 0
      ? deriveActiveTenor(result.maturity_nodes, targetDaysToExpiry)
      : null;

  if (derived) {
    return derived;
  }

  return {
    mode: result.active_tenor?.mode ?? "listed",
    days_to_expiry:
      result.active_tenor?.days_to_expiry ?? Math.max(1, Math.round(result.time_to_expiry_years * 365.25)),
    time_to_expiry_years: result.active_tenor?.time_to_expiry_years ?? result.time_to_expiry_years,
    expiration: result.active_tenor?.expiration ?? result.expiration,
    lower_anchor: result.active_tenor?.lower_anchor,
    upper_anchor: result.active_tenor?.upper_anchor,
    clamped: result.active_tenor?.clamped,
    volatility: result.volatility,
    riskFreeRate: result.risk_free_rate,
    dividendYield: result.dividend_yield ?? 0,
  };
}

function formatExpiryContext(
  activeTenor: ClientTenorContext,
): string {
  if (activeTenor.mode === "listed") {
    return activeTenor.expiration ? formatDateLabel(activeTenor.expiration) : "Listed expiry";
  }

  if (activeTenor.lower_anchor && activeTenor.upper_anchor) {
    return `${formatTenorFromDays(activeTenor.lower_anchor.days_to_expiry)} to ${formatTenorFromDays(activeTenor.upper_anchor.days_to_expiry)}`;
  }

  return "Interpolated tenor";
}

function getMaturityNodeLabels(nodes: QuantGreeksTermNode[]): string[] {
  if (nodes.length === 0) {
    return [];
  }

  const anchorDays = nodes.map((node) => node.days_to_expiry);
  const candidates = [anchorDays[0], anchorDays[Math.floor(anchorDays.length / 2)], anchorDays[anchorDays.length - 1]]
    .filter((value, index, values): value is number => value != null && values.indexOf(value) === index);

  return candidates.map((days) => formatTenorFromDays(days));
}

function createDisplayItem(event: AgentSSE): QuantDisplayItem | null {
  const id = `${event.event}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  switch (event.event) {
    case "display_quant_chain":
      return { id, type: event.event, chain: event.data.chain as QuantOptionChain };
    case "display_quant_greeks":
      return {
        id,
        type: event.event,
        result: event.data.result as QuantGreeksResult,
        preferredMetric:
          typeof event.data.preferred_metric === "string"
            ? (event.data.preferred_metric as QuantGreeksMetric)
            : undefined,
      };
    case "display_quant_surface":
      return {
        id,
        type: event.event,
        surface: event.data.surface as QuantSurfaceResult,
      };
    case "display_quant_payoff":
      return {
        id,
        type: event.event,
        payoff: event.data.payoff as QuantPayoffResult,
      };
    default:
      return null;
  }
}

function createDisplayItemFromEntry(
  entry: ChatEntry,
  id: string,
): QuantDisplayItem | null {
  switch (entry.type) {
    case "display_quant_chain":
      return { id, type: entry.type, chain: entry.chain };
    case "display_quant_greeks":
      return {
        id,
        type: entry.type,
        result: entry.result,
        preferredMetric: entry.preferredMetric,
      };
    case "display_quant_surface":
      return { id, type: entry.type, surface: entry.surface };
    case "display_quant_payoff":
      return { id, type: entry.type, payoff: entry.payoff };
    default:
      return null;
  }
}

function buildDisplayItemsFromMessages(messages: ChatMessage[]): QuantDisplayItem[] {
  const collected: QuantDisplayItem[] = [];

  messages.forEach((message, messageIndex) => {
    message.entries?.forEach((entry, entryIndex) => {
      const item = createDisplayItemFromEntry(entry, `history-${messageIndex}-${entryIndex}`);
      if (item) {
        collected.push(item);
      }
    });
  });

  return collected.reverse();
}

export default function QuantWorkspace() {
  const [displayItems, setDisplayItems] = useState<QuantDisplayItem[]>([]);
  const [prefillInput, setPrefillInput] = useState<string | null>(null);
  const [prefillNonce, setPrefillNonce] = useState(0);

  const latestSymbol = useMemo(() => {
    const latest = displayItems.find((item) => {
      switch (item.type) {
        case "display_quant_chain":
          return Boolean(item.chain.symbol);
        case "display_quant_greeks":
          return Boolean(item.result.symbol);
        case "display_quant_surface":
          return Boolean(item.surface.symbol);
        case "display_quant_payoff":
          return Boolean(item.payoff.symbol);
      }
    });

    if (!latest) {
      return null;
    }

    switch (latest.type) {
      case "display_quant_chain":
        return latest.chain.symbol;
      case "display_quant_greeks":
        return latest.result.symbol ?? null;
      case "display_quant_surface":
        return latest.surface.symbol;
      case "display_quant_payoff":
        return latest.payoff.symbol ?? null;
    }
  }, [displayItems]);

  function handlePrefill(prompt: string) {
    setPrefillInput(prompt);
    setPrefillNonce((value) => value + 1);
    sendGAEvent("event", "quant_quick_pick_clicked", { prompt });
  }

  function handleAgentEvent(event: AgentSSE) {
    const item = createDisplayItem(event);
    if (!item) {
      return;
    }

    setDisplayItems((current) => [item, ...current]);
  }

  function handleResetDisplay() {
    setDisplayItems([]);
    setPrefillInput(null);
    setPrefillNonce((value) => value + 1);
    sendGAEvent("event", "quant_display_reset");
  }

  const leftPanel = (
    <div className="flex h-full min-h-0 flex-col">
      <AgentChat
        variant="quant"
        apiPath="/api/quant-agent"
        agentName="Quant Alpha"
        agentIdentity="quant"
        accent="orange"
        headerVariant="hero"
        headerDescriptionOverride="Options analytics for U.S. equities. Ask for chains, Greeks, volatility surfaces, or payoff structures and let the agent populate the display panel with computed results."
        headerRightContent={
          <RequestQuotaBadge className="h-10 rounded-[12px] border-[#E8701A]/12 bg-white shadow-none" />
        }
        renderDisplayEntriesInline={false}
        introTextOverride=""
        showSuggestionsOverride={false}
        prefillInput={prefillInput}
        prefillNonce={prefillNonce}
        onEvent={handleAgentEvent}
        onConversationLoaded={(messages) => {
          setDisplayItems(buildDisplayItemsFromMessages(messages));
        }}
        onConversationReset={() => {
          setDisplayItems([]);
          setPrefillInput(null);
          setPrefillNonce((value) => value + 1);
        }}
      />
    </div>
  );

  const rightPanel = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-[18px] border border-[#E8701A]/16 bg-white shadow-[0_28px_60px_-40px_rgba(232,112,26,0.24)]">
      <div className="shrink-0 border-b border-[#E8701A]/10 px-5 py-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#c85f14]">
              Display surface
            </p>
            <h2 className="text-lg font-medium text-[#161616]">
              {latestSymbol ? `${latestSymbol} analytics` : "Quant outputs"}
            </h2>
            <p className="text-sm text-black/58">
              Agent-driven charts, tables, and analytics appear here, newest first.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {displayItems.length > 0 && (
              <button
                type="button"
                onClick={handleResetDisplay}
                className="inline-flex items-center gap-1 rounded-full border border-[#E8701A]/16 bg-[#fff3e8] px-2.5 py-0.5 text-[11px] text-[#c85f14] transition-colors hover:bg-[#ffead6]"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to welcome
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {displayItems.length === 0 ? (
          <QuantWelcomeState onPick={handlePrefill} />
        ) : (
          <div className="space-y-4">
            {displayItems.map((item) => {
              switch (item.type) {
                case "display_quant_chain":
                  return <QuantChainBlock key={item.id} chain={item.chain} />;
                case "display_quant_greeks":
                  return (
                    <QuantGreeksBlock
                      key={item.id}
                      result={item.result}
                      preferredMetric={item.preferredMetric}
                    />
                  );
                case "display_quant_surface":
                  return <QuantSurfaceBlock key={item.id} surface={item.surface} />;
                case "display_quant_payoff":
                  return <QuantPayoffBlock key={item.id} payoff={item.payoff} />;
              }
            })}
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="space-y-5">
      <div className="hidden xl:block">
        <div className="grid h-[calc(100vh-11rem)] min-h-[780px] grid-cols-2 gap-4">
          <div className="min-h-0">{leftPanel}</div>
          <div className="min-h-0">{rightPanel}</div>
        </div>
      </div>

      <div className="space-y-5 xl:hidden">
        <div className="min-h-[640px]">{leftPanel}</div>
        <div className="min-h-[620px]">{rightPanel}</div>
      </div>
    </div>
  );
}

function QuantWelcomeState({
  onPick,
}: {
  onPick: (prompt: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-[18px] border border-[#E8701A]/14 bg-[linear-gradient(180deg,#fffaf5,white)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-2">
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#c85f14]">
              Welcome state
            </p>
            <h3 className="text-[1.35rem] font-medium text-[#161616]">
              Start with a liquid U.S. equity name
            </h3>
          </div>
          <div className="grid gap-2 text-sm text-black/58">
            <div className="flex items-center gap-2">
              <Orbit className="h-4 w-4 text-[#E8701A]" />
              <span>Vol surfaces on moneyness × expiry</span>
            </div>
            <div className="flex items-center gap-2">
              <Sigma className="h-4 w-4 text-[#E8701A]" />
              <span>Greeks with inferred live defaults</span>
            </div>
            <div className="flex items-center gap-2">
              <CandlestickChart className="h-4 w-4 text-[#E8701A]" />
              <span>Payoff diagrams for multi-leg structures</span>
            </div>
          </div>
        </div>
      </div>

      <div className="rounded-[18px] border border-[#E8701A]/12 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-[#E8701A]" />
          <p className="text-sm font-medium text-[#161616]">Featured quick picks</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          {QUICK_PICKS.map((prompt) => (
            <button
              key={prompt}
              type="button"
              onClick={() => onPick(prompt)}
              className="rounded-[14px] border border-[#E8701A]/12 bg-[#fff8f2] px-4 py-3 text-left text-sm text-black/68 transition-colors hover:bg-[#ffefe0] hover:text-[#161616]"
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      <div className="rounded-[18px] border border-[#E8701A]/12 bg-white p-5">
        <div className="mb-3 flex items-center gap-2">
          <Rows3 className="h-4 w-4 text-[#E8701A]" />
          <p className="text-sm font-medium text-[#161616]">Featured tickers</p>
        </div>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5 lg:grid-cols-9">
          {FEATURED_TICKERS.map((ticker) => (
            <button
              key={ticker}
              type="button"
              onClick={() => onPick(`Show me the ${ticker} volatility surface.`)}
              className="min-w-0 rounded-full border border-[#E8701A]/12 bg-[#fff8f2] px-2 py-1 text-center text-[12px] text-black/64 transition-colors hover:bg-[#ffefe0] hover:text-[#161616] sm:text-[13px]"
            >
              {ticker}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function QuantChainBlock({
  chain,
}: {
  chain: QuantOptionChain;
}) {
  const nearestExpiration = getNearestExpiration(chain);
  const rows = buildPreviewRows(chain);

  return (
    <section className="rounded-[18px] border border-[#E8701A]/12 bg-white p-5 shadow-[0_18px_34px_-30px_rgba(232,112,26,0.35)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <TableProperties className="h-4 w-4 text-[#E8701A]" />
            <p className="text-sm font-medium text-[#161616]">Option chain snapshot</p>
          </div>
          <h3 className="text-[1.2rem] font-medium text-[#161616]">
            {chain.symbol} <span className="text-black/44">{chain.name}</span>
          </h3>
          <p className="text-sm text-black/58">
            Spot {formatNumber(chain.spot_price)} {chain.currency} on {chain.exchange || "Yahoo Finance"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InfoStat label="Expiries" value={String(chain.expiration_count)} />
          <InfoStat label="ATM strike" value={formatNumber(chain.atm_strike)} />
          <InfoStat
            label="Nearest expiry"
            value={nearestExpiration ? formatDateLabel(nearestExpiration.expiration) : "N/A"}
          />
        </div>
      </div>

      {rows.length > 0 && nearestExpiration ? (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.16em] text-black/46">
            <span className="rounded-full border border-[#E8701A]/12 bg-[#fff8f2] px-2.5 py-1">
              {nearestExpiration.expiration}
            </span>
            <span>{nearestExpiration.days_to_expiry} DTE</span>
          </div>
          <div className="overflow-hidden rounded-[14px] border border-[#E8701A]/10">
            <div className="max-h-[320px] overflow-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="sticky top-0 bg-[#fff5ec] text-black/64">
                  <tr>
                    <th className="px-3 py-2 font-medium">Call mid</th>
                    <th className="px-3 py-2 font-medium">Call IV</th>
                    <th className="px-3 py-2 font-medium">Strike</th>
                    <th className="px-3 py-2 font-medium">Put IV</th>
                    <th className="px-3 py-2 font-medium">Put mid</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.strike} className="border-t border-[#E8701A]/8">
                      <td className="px-3 py-2 text-black/68">
                        {formatNumber(row.call?.midpoint ?? row.call?.last_price)}
                      </td>
                      <td className="px-3 py-2 text-black/58">
                        {formatPercent(row.call?.implied_volatility)}
                      </td>
                      <td className="px-3 py-2 font-mono text-[#161616]">
                        {formatNumber(row.strike)}
                      </td>
                      <td className="px-3 py-2 text-black/58">
                        {formatPercent(row.put?.implied_volatility)}
                      </td>
                      <td className="px-3 py-2 text-black/68">
                        {formatNumber(row.put?.midpoint ?? row.put?.last_price)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-black/56">
          No contracts were available for a preview table.
        </p>
      )}
    </section>
  );
}

function QuantGreeksBlock({
  result,
  preferredMetric,
}: {
  result: QuantGreeksResult;
  preferredMetric?: QuantGreeksMetric;
}) {
  const resetKey = `${result.symbol ?? "custom"}:${result.strike}:${result.expiration ?? ""}:${preferredMetric ?? "delta"}`;

  return (
    <QuantGreeksBlockInner
      key={resetKey}
      result={result}
      preferredMetric={preferredMetric}
    />
  );
}

function QuantGreeksBlockInner({
  result,
  preferredMetric,
}: {
  result: QuantGreeksResult;
  preferredMetric?: QuantGreeksMetric;
}) {
  const [selectedMetric, setSelectedMetric] = useState<QuantGreeksMetric>(
    preferredMetric ?? "delta",
  );
  const listedNodes = result.maturity_nodes ?? [];
  const baseDaysToExpiry =
    result.active_tenor?.days_to_expiry ??
    Math.max(1, Math.round(result.time_to_expiry_years * 365.25));
  const minDaysToExpiry =
    listedNodes[0]?.days_to_expiry ??
    result.maturity_range_days?.min ??
    baseDaysToExpiry;
  const maxDaysToExpiry =
    listedNodes[listedNodes.length - 1]?.days_to_expiry ??
    result.maturity_range_days?.max ??
    baseDaysToExpiry;
  const defaultDaysToExpiry = Math.min(
    maxDaysToExpiry,
    Math.max(minDaysToExpiry, baseDaysToExpiry),
  );
  const [daysToExpiry, setDaysToExpiry] = useState(defaultDaysToExpiry);
  const activeTenor = useMemo(
    () => resolveClientTenorContext(result, daysToExpiry),
    [daysToExpiry, result],
  );
  const activeGreeks = useMemo(
    () =>
      computeBlackScholes(
        result.option_type,
        result.spot_price,
        result.strike,
        activeTenor.time_to_expiry_years,
        activeTenor.volatility,
        activeTenor.riskFreeRate,
        activeTenor.dividendYield,
      ),
    [activeTenor, result.option_type, result.spot_price, result.strike],
  );
  const maturityLabels =
    listedNodes.length > 0
      ? getMaturityNodeLabels(listedNodes)
      : getMaturitySliderLabels(minDaysToExpiry, maxDaysToExpiry);
  const showMaturityControl = selectedMetric !== "payoff" && maxDaysToExpiry > minDaysToExpiry;
  const titleTenorLabel =
    activeTenor.mode === "listed"
      ? activeTenor.expiration
        ? formatDateLabel(activeTenor.expiration)
        : formatTenorFromDays(activeTenor.days_to_expiry)
      : `${formatTenorFromDays(activeTenor.days_to_expiry)} target tenor`;

  return (
    <section className="rounded-[18px] border border-[#E8701A]/12 bg-white p-5 shadow-[0_18px_34px_-30px_rgba(232,112,26,0.35)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Sigma className="h-4 w-4 text-[#E8701A]" />
            <p className="text-sm font-medium text-[#161616]">Chain-linked BSM Greeks</p>
          </div>
          <h3 className="text-[1.2rem] font-medium text-[#161616]">
            {(result.symbol ?? "Custom")}
            <span className="ml-2 text-black/44">
              {result.option_type.toUpperCase()} {formatNumber(result.strike)} {titleTenorLabel}
            </span>
          </h3>
        </div>
        <InfoStat label="Theo price" value={formatNumber(activeGreeks.theoreticalPrice, 4)} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <InfoStat label="Delta" value={formatNumber(activeGreeks.delta, 4)} />
        <InfoStat label="Gamma" value={formatNumber(activeGreeks.gamma, 6)} />
        <InfoStat label="Vega / 1 vol pt" value={formatNumber(activeGreeks.vega, 4)} />
        <InfoStat label="Theta / day" value={formatNumber(activeGreeks.theta, 4)} />
        <InfoStat label="Rho / 1 rate pt" value={formatNumber(activeGreeks.rho, 4)} />
        <InfoStat label="Volga" value={formatNumber(activeGreeks.volga, 4)} />
        <InfoStat label="Vanna" value={formatNumber(activeGreeks.vanna, 4)} />
        <InfoStat label="Speed" value={formatNumber(activeGreeks.speed, 6)} />
        <InfoStat label="Volatility" value={formatPercent(activeTenor.volatility)} />
        <InfoStat label="Spot" value={formatNumber(result.spot_price)} />
        <InfoStat label="Risk-free" value={formatPercent(activeTenor.riskFreeRate, 2)} />
        <InfoStat label="Dividend yield" value={formatPercent(activeTenor.dividendYield, 2)} />
        <InfoStat label="TTE" value={formatTenorFromDays(activeTenor.days_to_expiry)} />
        <InfoStat
          label="Tenor mode"
          value={activeTenor.mode === "listed" ? "Listed expiry" : "Interpolated"}
        />
        <InfoStat label="Expiry context" value={formatExpiryContext(activeTenor)} />
      </div>

      <div className="mt-4 rounded-[14px] border border-[#E8701A]/10 bg-[#fff8f2] p-4">
        <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#c85f14]">
              Greeks visualization
            </p>
            <p className="text-sm text-black/58">
              Explore how the selected metric changes across spot prices and real listed or interpolated tenor nodes.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2">
            {GREEKS_CHART_METRICS.map((metric) => (
              <button
                key={metric.id}
                type="button"
                onClick={() => setSelectedMetric(metric.id)}
                className={
                  metric.id === selectedMetric
                    ? "rounded-full border border-[#E8701A]/20 bg-[#E8701A] px-3 py-1 text-xs font-medium text-white shadow-[0_10px_20px_-14px_rgba(232,112,26,0.45)]"
                    : "rounded-full border border-[#E8701A]/12 bg-white px-3 py-1 text-xs font-medium text-black/62 transition-colors hover:bg-[#ffefe0] hover:text-[#161616]"
                }
              >
                {metric.label}
              </button>
            ))}
          </div>
        </div>

        {showMaturityControl ? (
          <div className="mb-4 rounded-[14px] border border-[#E8701A]/10 bg-white p-3">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-medium uppercase tracking-[0.16em] text-[#c85f14]">
                Maturity
              </p>
              <p className="text-sm text-black/64">
                {formatTenorFromDays(activeTenor.days_to_expiry)}
                {activeTenor.mode === "interpolated" ? " (interpolated)" : ""}
              </p>
            </div>
            <input
              type="range"
              min={minDaysToExpiry}
              max={maxDaysToExpiry}
              step={1}
              value={daysToExpiry}
              onChange={(event) => setDaysToExpiry(Number(event.target.value))}
              className="h-2 w-full cursor-pointer appearance-none rounded-full bg-[#f7e7d9] accent-[#E8701A]"
            />
            <div className="mt-2 flex flex-wrap justify-between gap-2 text-[11px] text-black/42">
              {maturityLabels.map((label) => (
                <span key={label}>{label}</span>
              ))}
            </div>
            {listedNodes.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {listedNodes.map((node) => (
                  <button
                    key={`${node.expiration}-${node.days_to_expiry}`}
                    type="button"
                    onClick={() => setDaysToExpiry(node.days_to_expiry)}
                    className={
                      node.days_to_expiry === activeTenor.days_to_expiry && activeTenor.mode === "listed"
                        ? "rounded-full border border-[#E8701A]/18 bg-[#E8701A] px-2.5 py-1 text-[11px] font-medium text-white"
                        : "rounded-full border border-[#E8701A]/12 bg-[#fff8f2] px-2.5 py-1 text-[11px] text-black/62 transition-colors hover:bg-[#ffefe0] hover:text-[#161616]"
                    }
                  >
                    {formatTenorFromDays(node.days_to_expiry)}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="mb-4 rounded-[14px] border border-[#E8701A]/10 bg-white p-3 text-sm text-black/58">
            Payoff is defined at expiry, so maturity controls are disabled for this view.
          </div>
        )}

        <GreeksMiniChart
          result={result}
          metric={selectedMetric}
          tenorContext={activeTenor}
          premiumReference={activeGreeks.theoreticalPrice}
        />
      </div>

      {result.assumptions.length > 0 && (
        <div className="mt-4 rounded-[14px] border border-[#E8701A]/10 bg-[#fff8f2] p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-[#c85f14]">
            Assumptions
          </p>
          <ul className="space-y-1.5 text-sm text-black/62">
            {result.assumptions.map((assumption) => (
              <li key={assumption} className="flex gap-2">
                <span className="mt-[0.4rem] h-1.5 w-1.5 rounded-full bg-[#E8701A]" />
                <span>{assumption}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function GreeksMiniChart({
  result,
  metric,
  tenorContext,
  premiumReference,
}: {
  result: QuantGreeksResult;
  metric: QuantGreeksMetric;
  tenorContext: ClientTenorContext;
  premiumReference: number;
}) {
  const points = buildGreeksProfile(result, metric, {
    timeToExpiryYears: tenorContext.time_to_expiry_years,
    volatility: tenorContext.volatility,
    riskFreeRate: tenorContext.riskFreeRate,
    dividendYield: tenorContext.dividendYield,
    premiumReference,
  });
  if (points.length === 0) {
    return null;
  }

  const minSpot = points[0]?.spot ?? 0;
  const maxSpot = points[points.length - 1]?.spot ?? 1;
  const minValue = Math.min(...points.map((point) => point.value));
  const maxValue = Math.max(...points.map((point) => point.value));
  const selectedPoint = points.reduce((best, point) => {
    if (!best) {
      return point;
    }

    return Math.abs(point.spot - result.spot_price) < Math.abs(best.spot - result.spot_price)
      ? point
      : best;
  }, points[0]);

  const metricLabel =
    GREEKS_CHART_METRICS.find((entry) => entry.id === metric)?.label ?? metric;

  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-[14px] border border-[#E8701A]/12 bg-white p-2">
        <Plot
          data={[
            {
              type: "scatter",
              mode: "lines",
              x: points.map((point) => point.spot),
              y: points.map((point) => point.value),
              line: {
                color: "#E8701A",
                width: 3,
                shape: "spline",
                smoothing: 1.1,
              },
              hovertemplate: `Spot %{x:.2f}<br>${metricLabel} %{y:.6f}<extra></extra>`,
              name: metricLabel,
            },
            {
              type: "scatter",
              mode: "markers",
              x: [selectedPoint.spot],
              y: [selectedPoint.value],
              marker: {
                color: "#E8701A",
                size: 9,
                line: {
                  color: "rgba(255,255,255,0.9)",
                  width: 1.5,
                },
              },
              hovertemplate: `Current spot %{x:.2f}<br>${metricLabel} %{y:.6f}<extra></extra>`,
              name: "Current spot",
            },
          ]}
          layout={{
            autosize: true,
            height: 280,
            margin: { l: 48, r: 20, t: 10, b: 42 },
            paper_bgcolor: "rgba(0,0,0,0)",
            plot_bgcolor: "rgba(255,255,255,0)",
            xaxis: {
              title: { text: "Spot" },
              gridcolor: "rgba(232,112,26,0.10)",
              zerolinecolor: "rgba(22,22,22,0.10)",
            },
            yaxis: {
              title: { text: metricLabel },
              gridcolor: "rgba(232,112,26,0.10)",
              zerolinecolor: "rgba(22,22,22,0.10)",
            },
            shapes: [
              {
                type: "line",
                x0: result.spot_price,
                x1: result.spot_price,
                y0: minValue,
                y1: maxValue,
                line: {
                  color: "rgba(232,112,26,0.22)",
                  width: 1.5,
                  dash: "dot",
                },
              },
              ...(minValue <= 0 && maxValue >= 0
                ? [
                    {
                      type: "line" as const,
                      x0: minSpot,
                      x1: maxSpot,
                      y0: 0,
                      y1: 0,
                      line: {
                        color: "rgba(22,22,22,0.14)",
                        width: 1,
                        dash: "dot",
                      },
                    },
                  ]
                : []),
            ],
            showlegend: false,
          }}
          config={{
            displaylogo: false,
            responsive: true,
            modeBarButtonsToRemove: [
              "lasso2d",
              "select2d",
              "autoScale2d",
              "hoverCompareCartesian",
              "hoverClosestCartesian",
              "toImage",
            ],
          }}
          style={{ width: "100%", height: "280px" }}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <InfoStat label="Metric" value={metricLabel} />
        <InfoStat label="Spot range" value={`${formatNumber(minSpot)} to ${formatNumber(maxSpot)}`} />
        <InfoStat
          label="Maturity"
          value={formatTenorFromDays(tenorContext.days_to_expiry)}
        />
        <InfoStat
          label={`${metricLabel} @ spot`}
          value={formatNumber(
            selectedPoint.value,
            metric === "gamma" || metric === "speed" ? 6 : 4,
          )}
        />
      </div>
    </div>
  );
}

function QuantSurfaceBlock({
  surface,
}: {
  surface: QuantSurfaceResult;
}) {
  return (
    <section className="rounded-[18px] border border-[#E8701A]/12 bg-white p-5 shadow-[0_18px_34px_-30px_rgba(232,112,26,0.35)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Orbit className="h-4 w-4 text-[#E8701A]" />
            <p className="text-sm font-medium text-[#161616]">Volatility surface</p>
          </div>
          <h3 className="text-[1.2rem] font-medium text-[#161616]">
            {surface.symbol} IV surface
          </h3>
          <p className="text-sm text-black/58">
            {surface.model === "ssvi" ? "SSVI-calibrated" : "Model-free"} moneyness × expiry surface built from {surface.filtered_point_count ?? surface.points.length} usable implied-volatility points.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <InfoStat label="Spot" value={formatNumber(surface.spot_price)} />
          <InfoStat label="Expiries" value={String(surface.expirations.length)} />
          <InfoStat label="Grid points" value={String(surface.points.length)} />
        </div>
      </div>

      <QuantSurfacePlot surface={surface} />

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <InfoStat
          label="Moneyness range"
          value={
            surface.moneyness_values.length > 0
              ? `${formatNumber(surface.moneyness_values[0], 3)} to ${formatNumber(surface.moneyness_values[surface.moneyness_values.length - 1], 3)}`
              : "N/A"
          }
        />
        <InfoStat
          label="Term range"
          value={
            surface.days_to_expiry_values.length > 0
              ? `${surface.days_to_expiry_values[0]} to ${surface.days_to_expiry_values[surface.days_to_expiry_values.length - 1]} DTE`
              : "N/A"
          }
        />
        <InfoStat label="Status" value={surface.data_status ?? "unknown"} />
      </div>

      {surface.calibration && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <InfoStat label="Model" value={(surface.model ?? "raw").toUpperCase()} />
          <InfoStat label="rho" value={formatNumber(surface.calibration.rho, 4)} />
          <InfoStat label="eta" value={formatNumber(surface.calibration.eta, 4)} />
          <InfoStat label="gamma" value={formatNumber(surface.calibration.gamma, 4)} />
          <InfoStat
            label="Butterfly margin"
            value={formatNumber(surface.calibration.butterfly_margin, 4)}
          />
          <InfoStat
            label="Calendar"
            value={surface.calibration.calendar_valid ? "valid" : "invalid"}
          />
          <InfoStat
            label="Raw points"
            value={String(surface.raw_point_count ?? surface.points.length)}
          />
          <InfoStat
            label="Filtered points"
            value={String(surface.filtered_point_count ?? surface.points.length)}
          />
        </div>
      )}

      {surface.warnings && surface.warnings.length > 0 && (
        <p className="mt-3 text-sm text-black/56">{surface.warnings[0]}</p>
      )}
    </section>
  );
}

function QuantPayoffBlock({
  payoff,
}: {
  payoff: QuantPayoffResult;
}) {
  return (
    <section className="rounded-[18px] border border-[#E8701A]/12 bg-white p-5 shadow-[0_18px_34px_-30px_rgba(232,112,26,0.35)]">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Waves className="h-4 w-4 text-[#E8701A]" />
            <p className="text-sm font-medium text-[#161616]">Payoff diagram</p>
          </div>
          <h3 className="text-[1.2rem] font-medium text-[#161616]">
            {payoff.symbol ?? "Custom structure"} expiry payoff
          </h3>
        </div>
        <div className="flex flex-wrap gap-2">
          <InfoStat label="Breakevens" value={String(payoff.breakeven_points.length)} />
          <InfoStat
            label="Max profit"
            value={payoff.max_profit == null ? "Unlimited" : formatNumber(payoff.max_profit)}
          />
          <InfoStat
            label="Max loss"
            value={payoff.max_loss == null ? "Unlimited" : formatNumber(payoff.max_loss)}
          />
        </div>
      </div>

      <PayoffMiniChart payoff={payoff} />

      <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
        <div className="rounded-[14px] border border-[#E8701A]/10 bg-[#fff8f2] p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-[#c85f14]">
            Legs
          </p>
          <div className="space-y-2 text-sm text-black/64">
            {payoff.legs.map((leg, index) => (
              <div key={`${leg.option_type}-${leg.strike}-${index}`} className="flex items-center justify-between gap-3">
                <span className="font-medium text-[#161616]">
                  {leg.direction.toUpperCase()} {leg.option_type.toUpperCase()}
                </span>
                <span>
                  K {formatNumber(leg.strike)} | premium {formatNumber(leg.premium)} | qty {formatNumber(leg.quantity, 0)}
                </span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-[14px] border border-[#E8701A]/10 bg-[#fff8f2] p-4">
          <p className="mb-2 text-xs font-medium uppercase tracking-[0.16em] text-[#c85f14]">
            Structure summary
          </p>
          <div className="space-y-2 text-sm text-black/62">
            <p>Spot reference: {formatNumber(payoff.spot_reference)}</p>
            <p>
              Breakevens:{" "}
              {payoff.breakeven_points.length > 0
                ? payoff.breakeven_points.map((value) => formatNumber(value)).join(", ")
                : "None"}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function PayoffMiniChart({
  payoff,
}: {
  payoff: QuantPayoffResult;
}) {
  if (payoff.points.length === 0) {
    return null;
  }

  const width = 760;
  const height = 260;
  const minSpot = payoff.points[0]?.spot ?? 0;
  const maxSpot = payoff.points[payoff.points.length - 1]?.spot ?? 1;
  const minPayoff = Math.min(...payoff.points.map((point) => point.payoff));
  const maxPayoff = Math.max(...payoff.points.map((point) => point.payoff));
  const payoffRange = Math.max(maxPayoff - minPayoff, 1);
  const spotRange = Math.max(maxSpot - minSpot, 1);

  const polyline = payoff.points
    .map((point) => {
      const x = ((point.spot - minSpot) / spotRange) * width;
      const y = height - ((point.payoff - minPayoff) / payoffRange) * height;
      return `${x},${y}`;
    })
    .join(" ");

  const zeroY = height - ((0 - minPayoff) / payoffRange) * height;

  return (
    <div className="rounded-[14px] border border-[#E8701A]/12 bg-[#fff8f2] p-3">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[260px] w-full"
        preserveAspectRatio="none"
      >
        <line
          x1="0"
          x2={width}
          y1={zeroY}
          y2={zeroY}
          stroke="rgba(22,22,22,0.14)"
          strokeDasharray="4 4"
        />
        <polyline
          points={polyline}
          fill="none"
          stroke="#E8701A"
          strokeWidth="3"
          vectorEffect="non-scaling-stroke"
        />
      </svg>
    </div>
  );
}

function InfoStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="rounded-[14px] border border-[#E8701A]/10 bg-[#fff8f2] px-3.5 py-2.5">
      <p className="text-[10px] uppercase tracking-[0.16em] text-black/44">{label}</p>
      <p className="text-sm font-medium text-[#161616]">{value}</p>
    </div>
  );
}
