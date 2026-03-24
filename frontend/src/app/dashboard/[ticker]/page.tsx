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
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import {
  getMarketData,
  getNews,
  getFilings,
  ApiError,
} from "@/lib/api";
import type { MarketResponse } from "@/types/api";

interface DashboardPageProps {
  params: Promise<{ ticker: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  const [marketResult, news, filings] = await Promise.all([
    getMarketData(symbol)
      .then((d) => ({ ok: true as const, data: d }))
      .catch((e: unknown) => ({
        ok: false as const,
        status: e instanceof ApiError ? e.status : 500,
        message:
          e instanceof ApiError
            ? e.message
            : "Failed to load market data",
      })),
    getNews(symbol).catch(() => ({ ticker: symbol, articles: [] })),
    getFilings(symbol).catch(() => ({ ticker: symbol, filings: [] })),
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

  const dataWidgets = (
    <>
      {market ? (
        <>
          <OverviewCard data={market.overview} />
          <PriceChart
            ticker={symbol}
            initialData={market.price_history}
            initialPeriod="1mo"
          />
          <FundamentalsGrid data={market.fundamentals} />
        </>
      ) : (
        <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
          <CardHeader>
            <CardTitle className="text-[#161616]">{symbol}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm font-light text-black/64">{marketError}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <NewsFeed articles={news.articles} />
        <FilingsPanel filings={filings.filings} />
      </div>
    </>
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
          <div className="max-w-[360px] flex-1">
            <TickerSearch variant="dashboard" />
          </div>
          <Badge
            variant="outline"
            className="border-black/[0.08] bg-[#f4f8ff] font-mono text-sm text-[#161616]"
          >
            {symbol}
          </Badge>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1280px] px-6 py-8">
        <DashboardLayout
          dataWidgets={dataWidgets}
          agentPanel={<AgentChat ticker={symbol} />}
        />
      </main>
    </div>
  );
}
