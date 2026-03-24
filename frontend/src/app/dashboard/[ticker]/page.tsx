import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TickerSearch from "@/components/ticker-search";
import OverviewCard from "@/components/dashboard/overview-card";
import PriceChart from "@/components/dashboard/price-chart";
import FundamentalsGrid from "@/components/dashboard/fundamentals-grid";
import NewsFeed from "@/components/dashboard/news-feed";
import FilingsPanel from "@/components/dashboard/filings-panel";
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

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-40 border-b border-border/40 bg-background/80 backdrop-blur-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-4 px-6 py-3">
          <Link href="/" className="shrink-0 transition-opacity hover:opacity-80">
            <Image
              src="/openalpha_logo.svg"
              alt="OpenAlpha"
              width={680}
              height={200}
              className="h-8 w-auto"
            />
          </Link>
          <div className="flex-1 max-w-md">
            <TickerSearch />
          </div>
          <Badge variant="outline" className="text-sm font-mono">
            {symbol}
          </Badge>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="space-y-6">
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
            <Card className="border-destructive/40 bg-card/60">
              <CardHeader>
                <CardTitle className="text-destructive">{symbol}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{marketError}</p>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <NewsFeed articles={news.articles} />
            <FilingsPanel filings={filings.filings} />
          </div>
        </div>
      </main>
    </div>
  );
}
