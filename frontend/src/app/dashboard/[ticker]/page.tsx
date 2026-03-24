import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TickerSearch from "@/components/ticker-search";

interface DashboardPageProps {
  params: Promise<{ ticker: string }>;
}

export default async function DashboardPage({ params }: DashboardPageProps) {
  const { ticker } = await params;
  const symbol = ticker.toUpperCase();

  return (
    <div className="min-h-screen bg-background">
      {/* Top bar */}
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

      {/* Dashboard body */}
      <main className="mx-auto max-w-7xl px-6 py-8">
        <div className="space-y-6">
          <div className="flex items-baseline gap-3">
            <h1 className="text-3xl font-bold tracking-tight">{symbol}</h1>
            <span className="text-muted-foreground">Dashboard</span>
          </div>

          <Card className="border-border/40 bg-card/60">
            <CardHeader>
              <CardTitle className="text-muted-foreground">
                Coming in Phase 7
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground leading-relaxed">
                This dashboard will display TradingView charts, fundamentals
                grid, news feed, SEC filings panel, and the AI agent chat.
                The data layer and API client are ready -- the full dashboard
                UI is built in the next phase.
              </p>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
}
