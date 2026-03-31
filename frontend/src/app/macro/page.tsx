import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TickerSearch from "@/components/ticker-search";
import LandingSpotlight from "@/components/landing-spotlight";
import AgentChat from "@/components/dashboard/agent-chat";
import DashboardOpenedTracker from "@/components/dashboard-opened-tracker";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DownloadDataLink from "@/components/download-data-link";
import NewsFeed from "@/components/dashboard/news-feed";
import RequestQuotaBadge from "@/components/request-quota-badge";
import MacroChart from "@/components/dashboard/macro-chart";
import MacroOverviewGrid from "@/components/dashboard/macro-overview-grid";
import { buildDataPageHref } from "@/lib/data-export";
import {
  MacroServiceError,
  getMacroIndicator,
  getMacroSnapshotForCountry,
} from "@/server/macro/service";
import { getDefaultContextNewsQuery, getFocusedNewsQueryForMacro } from "@/server/news/queries";
import { getContextNews, getFocusedNews } from "@/server/news/service";
import { ServiceError } from "@/server/shared/errors";
import type {
  MacroCountry,
  MacroHistoryRange,
  MacroIndicatorSlug,
} from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_INDICATOR: MacroIndicatorSlug = "fed-funds";
const DEFAULT_RANGE: MacroHistoryRange = "5y";
const COUNTRY_OPTIONS: { value: MacroCountry; label: string }[] = [
  { value: "us", label: "United States" },
  { value: "fr", label: "France" },
];

export default async function MacroPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const country: MacroCountry = params?.country === "fr" ? "fr" : "us";

  const focusedNewsQuery = getFocusedNewsQueryForMacro(country);
  const contextNewsQuery = getDefaultContextNewsQuery();

  const [snapshotResult, seriesResult, focusedNewsResult, contextNewsResult] = await Promise.all([
    getMacroSnapshotForCountry(country)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        status: error instanceof MacroServiceError ? error.status : 500,
        message:
          error instanceof MacroServiceError
            ? error.message
            : "Failed to load macro snapshot",
      })),
    getMacroIndicator(DEFAULT_INDICATOR, DEFAULT_RANGE, country)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        status: error instanceof MacroServiceError ? error.status : 500,
        message:
          error instanceof MacroServiceError
            ? error.message
            : "Failed to load macro history",
      })),
    getFocusedNews(focusedNewsQuery)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        status: error instanceof ServiceError ? error.status : 500,
      })),
    getContextNews(contextNewsQuery)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        status: error instanceof ServiceError ? error.status : 500,
      })),
  ]);

  const snapshot = snapshotResult.ok ? snapshotResult.data : null;
  const initialSeries = seriesResult.ok
    ? seriesResult.data
    : snapshot?.fed_funds_rate ?? null;
  const snapshotError = snapshotResult.ok
    ? null
    : snapshotResult.status === 503
      ? "The macro data provider is temporarily unavailable. Try again in a moment."
      : "Something went wrong loading macro data.";
  const focusedNewsError =
    focusedNewsResult.ok || focusedNewsResult.status === 404
      ? null
      : "Focused macro news is temporarily unavailable. Try again in a moment.";
  const contextNewsError =
    contextNewsResult.ok || contextNewsResult.status === 404
      ? null
      : "Broader market context is temporarily unavailable. Try again in a moment.";
  const focusedNews = focusedNewsResult.ok
    ? focusedNewsResult.data
    : { query: focusedNewsQuery, kind: "focused" as const, articles: [] };
  const contextNews = contextNewsResult.ok
    ? contextNewsResult.data
    : { query: contextNewsQuery, kind: "context" as const, articles: [] };

  const topWidgets = (
    <>
      <Card
        key="macro-country-switch"
        className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
      >
        <CardContent className="flex flex-col gap-2.5 py-3.5 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p className="text-sm font-medium text-[#161616]">Country</p>
            <p className="text-xs font-light text-black/58">
              Switch the macro dashboard between the U.S. and France.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {COUNTRY_OPTIONS.map((option) => (
              <Link
                key={option.value}
                href={option.value === "us" ? "/macro" : `/macro?country=${option.value}`}
                className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
                  country === option.value
                    ? "bg-[#1080ff] text-white"
                    : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
                }`}
              >
                {option.label}
              </Link>
            ))}
          </div>
        </CardContent>
      </Card>

      {snapshot ? (
        <MacroOverviewGrid key="macro-overview" snapshot={snapshot} country={country} />
      ) : (
        <Card
          key="macro-overview-fallback"
          className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
        >
          <CardHeader>
            <CardTitle className="text-[#161616]">Macro snapshot</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-light text-black/64">{snapshotError}</p>
          </CardContent>
        </Card>
      )}
    </>
  );

  const chartWidget = initialSeries ? (
    <MacroChart
      key={`macro-chart-${country}`}
      initialIndicator={initialSeries}
      initialIndicatorSlug={DEFAULT_INDICATOR}
      initialRange={DEFAULT_RANGE}
      country={country}
      fillHeight
    />
  ) : (
    <Card
      key="macro-chart-fallback"
      className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
    >
      <CardHeader>
        <CardTitle className="text-[#161616]">Macro trends</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-light text-black/64">
          Unable to load chart history right now.
        </p>
      </CardContent>
    </Card>
  );

  const bottomWidgets = (
    <div className="h-[520px] min-h-0">
      <NewsFeed
        articles={[]}
        fillHeight
        sections={[
          {
            id: "macro-focused-news",
            title: "Macro Focus",
            articles: focusedNews.articles,
            warnings: focusedNews.warnings,
            error: focusedNewsError,
            emptyStateMessage:
              "No specific news on this topic. Broader market news is shown below.",
          },
          {
            id: "macro-context-news",
            title: "Broader Market Context",
            articles: contextNews.articles,
            warnings: contextNews.warnings,
            error: contextNewsError,
          },
        ]}
      />
    </div>
  );

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-6 py-3">
          <Link
            href="/"
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            <Image
              src="/openalpha_logo_light.svg"
              alt="OpenAlpha"
              width={680}
              height={200}
              className="h-8 w-auto"
            />
          </Link>
          <RequestQuotaBadge />
          <div className="max-w-[360px] flex-1">
            <TickerSearch variant="dashboard" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Badge
              variant="outline"
              className="border-black/[0.08] bg-[#f4f8ff] font-mono text-sm text-[#161616]"
            >
              {country === "fr" ? "Macro · FR" : "Macro · US"}
            </Badge>
            <DownloadDataLink
              href={buildDataPageHref({
                asset_class: "macro",
                asset: "fed-funds",
                country,
              })}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1280px] px-6 py-8">
        <DashboardOpenedTracker type="macro" />
        <DashboardLayout
          topWidgets={topWidgets}
          chartWidget={chartWidget}
          bottomWidgets={bottomWidgets}
          agentPanel={
            <AgentChat
              key={`macro-agent-${country}`}
              variant="dashboard"
              macroCountry={country}
            />
          }
        />
      </main>
    </div>
  );
}
