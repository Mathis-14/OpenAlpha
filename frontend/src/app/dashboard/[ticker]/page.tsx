import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TickerSearch from "@/components/ticker-search";
import LandingSpotlight from "@/components/landing-spotlight";
import OverviewCard from "@/components/dashboard/overview-card";
import PriceChart from "@/components/dashboard/price-chart";
import FundamentalsGrid from "@/components/dashboard/fundamentals-grid";
import NewsFeed from "@/components/dashboard/news-feed";
import FilingsPanel from "@/components/dashboard/filings-panel";
import AgentChat from "@/components/dashboard/agent-chat";
import DashboardOpenedTracker from "@/components/dashboard-opened-tracker";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DownloadDataLink from "@/components/download-data-link";
import RequestQuotaBadge from "@/components/request-quota-badge";
import { buildDataPageHref } from "@/lib/data-export";
import { ServiceError } from "@/server/shared/errors";
import { getFilings } from "@/server/filings/service";
import { getMarketData } from "@/server/market/service";
import { getNews } from "@/server/news/service";
import type { MarketResponse } from "@/types/api";

interface DashboardPageProps {
  params: Promise<{ ticker: string }>;
}

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  const [marketResult, newsResult, filingsResult] = await Promise.all([
    getMarketData(symbol)
      .then((d) => ({ ok: true as const, data: d }))
      .catch((e: unknown) => ({
        ok: false as const,
        status: e instanceof ServiceError ? e.status : 500,
        message:
          e instanceof ServiceError
            ? e.message
            : "Failed to load market data",
      })),
    getNews(symbol)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        status: error instanceof ServiceError ? error.status : 500,
      })),
    getFilings(symbol)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        status: error instanceof ServiceError ? error.status : 500,
      })),
  ]);

  let market: MarketResponse | null = null;
  let marketError: string | null = null;

  if (marketResult.ok) {
    market = marketResult.data;
  } else {
    marketError =
      marketResult.status === 503
        ? "Market data provider is temporarily unavailable. Try again in a moment."
        : marketResult.status === 404
          ? `Ticker "${symbol}" was not found. Check the symbol and try again.`
          : "Something went wrong loading market data.";
  }

  const newsError =
    newsResult.ok || newsResult.status === 404
      ? null
      : "News is temporarily unavailable. Try again in a moment.";
  const filingsError =
    filingsResult.ok || filingsResult.status === 404
      ? null
      : "SEC filings are temporarily unavailable. Try again in a moment.";
  const news = newsResult.ok ? newsResult.data : { ticker: symbol, articles: [] };
  const filings = filingsResult.ok
    ? filingsResult.data
    : { ticker: symbol, filings: [] };

  const topWidgets = market ? (
    <OverviewCard key="overview" data={market.overview} />
  ) : (
    <Card
      key="market-error"
      className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
    >
      <CardHeader>
        <CardTitle className="text-[#161616]">{symbol}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-light text-black/64">{marketError}</p>
      </CardContent>
    </Card>
  );

  const chartWidget = market ? (
    <PriceChart
      key="price-chart"
      ticker={symbol}
      initialData={market.price_history}
      initialPeriod="1mo"
      fillHeight
    />
  ) : null;

  const bottomLeftChildren = [
    market ? <FundamentalsGrid key="fundamentals" data={market.fundamentals} /> : null,
    (
      <div key="filings-panel" className="min-h-0">
        <FilingsPanel filings={filings.filings} error={filingsError} fillHeight />
      </div>
    ),
  ];

  const bottomLeftWidgets = (
    <div className="grid h-[520px] min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-6">
      {bottomLeftChildren}
    </div>
  );

  const bottomRightWidgets = (
    <div className="h-[520px] min-h-0">
      <NewsFeed articles={news.articles} error={newsError} fillHeight />
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
              {symbol}
            </Badge>
            <DownloadDataLink
              href={buildDataPageHref({
                asset_class: "stock",
                asset: symbol,
              })}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1280px] px-6 py-8">
        <DashboardOpenedTracker type="stocks" />
        <DashboardLayout
          topWidgets={topWidgets}
          chartWidget={chartWidget}
          bottomLeftWidgets={bottomLeftWidgets}
          bottomRightWidgets={bottomRightWidgets}
          agentPanel={<AgentChat ticker={symbol} />}
        />
      </main>
    </div>
  );
}
