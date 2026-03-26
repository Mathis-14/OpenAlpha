import Image from "next/image";
import Link from "next/link";
import CommodityNav from "@/components/dashboard/commodity-nav";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LandingSpotlight from "@/components/landing-spotlight";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import AgentChat from "@/components/dashboard/agent-chat";
import CommodityOverviewGrid from "@/components/dashboard/commodity-overview-grid";
import CommodityPriceChart from "@/components/dashboard/commodity-price-chart";
import DownloadDataLink from "@/components/download-data-link";
import RequestQuotaBadge from "@/components/request-quota-badge";
import { buildDataPageHref } from "@/lib/data-export";
import {
  getCommodityCategoryLabel,
  getCommodityMeta,
  SUPPORTED_COMMODITIES,
} from "@/lib/commodities";
import {
  getCommodityMarketData,
  parseCommodityInstrument,
} from "@/server/commodities/service";
import { ServiceError } from "@/server/shared/errors";
import type { CommodityRange } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RANGE: CommodityRange = "1mo";

function formatValue(value: number | null, suffix = ""): string {
  if (value == null) {
    return "—";
  }

  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: suffix === "%" ? 3 : 2,
  })}${suffix}`;
}

export default async function CommodityInstrumentPage({
  params,
}: {
  params: Promise<{ instrument: string }>;
}) {
  const resolved = await params;
  const instrument = parseCommodityInstrument(resolved.instrument);

  const marketResult = await getCommodityMarketData(instrument, DEFAULT_RANGE)
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => ({
      ok: false as const,
      status: error instanceof ServiceError ? error.status : 500,
      message:
        error instanceof ServiceError
          ? error.message
          : "Failed to load commodity market data",
    }));

  const overview = marketResult.ok ? marketResult.data.overview : null;
  const initialHistory = marketResult.ok ? marketResult.data.price_history : [];
  const marketMeta = getCommodityMeta(instrument);
  const errorMessage = marketResult.ok
    ? null
    : marketResult.status === 404
      ? `Commodity "${instrument}" is not supported in this dashboard.`
      : marketResult.status === 503
        ? "Commodity market data is temporarily unavailable. Try again in a moment."
        : "Something went wrong loading commodity market data.";

  const topWidgets = overview ? (
    <CommodityOverviewGrid key="commodity-overview" overview={overview} />
  ) : (
    <Card
      key="commodity-overview-error"
      className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
    >
      <CardHeader>
        <CardTitle className="text-[#161616]">{marketMeta.name}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-light text-black/64">{errorMessage}</p>
      </CardContent>
    </Card>
  );

  const chartWidget = overview ? (
    <CommodityPriceChart
      key="commodity-chart"
      instrument={instrument}
      initialData={initialHistory}
      initialRange={DEFAULT_RANGE}
      fillHeight
    />
  ) : null;

  const bottomWidgets = overview ? (
    <Card
      key="commodity-details"
      className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
    >
      <CardHeader>
        <CardTitle className="text-[#161616]">Instrument details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <DetailStat label="Benchmark" value={marketMeta.name} />
        <DetailStat
          label="Category"
          value={getCommodityCategoryLabel(marketMeta.category)}
        />
        <DetailStat label="Unit" value={marketMeta.unit_label} />
        <DetailStat label="Exchange" value={overview.exchange_label} />
        <DetailStat label="Source" value={overview.source_label} />
        <DetailStat label="Provider symbol" value={overview.provider_symbol} />
        <DetailStat
          label="Session range"
          value={`${formatValue(overview.day_low)} - ${formatValue(overview.day_high)}`}
        />
        <DetailStat
          label="52W range"
          value={`${formatValue(overview.fifty_two_week_low)} - ${formatValue(overview.fifty_two_week_high)}`}
        />
        <DetailStat
          label="Market state"
          value={overview.market_state ?? "—"}
        />
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-3 px-6 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-4">
              <Link href="/" className="shrink-0 transition-opacity hover:opacity-80">
                <Image
                  src="/openalpha_logo_light.svg"
                  alt="OpenAlpha"
                  width={680}
                  height={200}
                  className="h-8 w-auto"
                />
              </Link>
              <RequestQuotaBadge />
            </div>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <Badge
                variant="outline"
                className="border-black/[0.08] bg-[#f4f8ff] font-mono text-sm text-[#161616]"
              >
                Commodities · {marketMeta.short_label}
              </Badge>
              <DownloadDataLink
                href={buildDataPageHref({
                  asset_class: "commodity",
                  asset: instrument,
                })}
              />
            </div>
          </div>

          <div className="min-w-0">
            <CommodityNav
              currentInstrument={instrument}
              instruments={SUPPORTED_COMMODITIES}
            />
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1280px] px-6 py-8">
        <DashboardLayout
          topWidgets={topWidgets}
          chartWidget={chartWidget}
          bottomWidgets={bottomWidgets}
          agentPanel={
            <AgentChat
              key={`commodity-agent-${instrument}`}
              variant="dashboard"
              commodityInstrument={instrument}
            />
          }
        />
      </main>
    </div>
  );
}

function DetailStat({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div>
      <p className="text-black/52">{label}</p>
      <p className="mt-1 font-medium text-[#161616]">{value}</p>
    </div>
  );
}
