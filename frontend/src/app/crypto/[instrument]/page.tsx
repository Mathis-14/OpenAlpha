import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import LandingSpotlight from "@/components/landing-spotlight";
import AgentChat from "@/components/dashboard/agent-chat";
import CryptoOverviewGrid from "@/components/dashboard/crypto-overview-grid";
import CryptoPriceChart from "@/components/dashboard/crypto-price-chart";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import DownloadDataLink from "@/components/download-data-link";
import RequestQuotaBadge from "@/components/request-quota-badge";
import {
  getCryptoMarketData,
  parseCryptoInstrument,
} from "@/server/crypto/service";
import { getCryptoMarketMeta } from "@/lib/crypto";
import { formatUtcDate } from "@/lib/date-format";
import { buildDataPageHref } from "@/lib/data-export";
import { ServiceError } from "@/server/shared/errors";
import type { CryptoInstrument, CryptoRange } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_RANGE: CryptoRange = "1mo";
const NAV_INSTRUMENTS: CryptoInstrument[] = ["BTC-PERPETUAL", "ETH-PERPETUAL"];

function formatValue(value: number | null, suffix = ""): string {
  if (value == null) {
    return "—";
  }

  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: suffix === "%" ? 3 : 2,
  })}${suffix}`;
}

function formatTimestamp(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return formatUtcDate(value);
}

export default async function CryptoInstrumentPage({
  params,
}: {
  params: Promise<{ instrument: string }>;
}) {
  const resolved = await params;
  const instrument = parseCryptoInstrument(resolved.instrument);

  const marketResult = await getCryptoMarketData(instrument, DEFAULT_RANGE)
    .then((data) => ({ ok: true as const, data }))
    .catch((error: unknown) => ({
      ok: false as const,
      status: error instanceof ServiceError ? error.status : 500,
      message:
        error instanceof ServiceError
          ? error.message
          : "Failed to load crypto market data",
    }));

  const overview = marketResult.ok ? marketResult.data.overview : null;
  const initialHistory = marketResult.ok ? marketResult.data.price_history : [];
  const marketMeta = getCryptoMarketMeta(instrument);
  const errorMessage = marketResult.ok
    ? null
    : marketResult.status === 404
      ? `Instrument "${instrument}" is not supported in this crypto dashboard.`
      : marketResult.status === 503
        ? "Deribit market data is temporarily unavailable. Try again in a moment."
        : "Something went wrong loading crypto market data.";

  const topWidgets = overview ? (
    <CryptoOverviewGrid key="crypto-overview" overview={overview} />
  ) : (
    <Card
      key="crypto-overview-error"
      className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
    >
      <CardHeader>
        <CardTitle className="text-[#161616]">{instrument}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm font-light text-black/64">{errorMessage}</p>
      </CardContent>
    </Card>
  );

  const chartWidget = overview ? (
    <CryptoPriceChart
      key="crypto-chart"
      instrument={instrument}
      initialData={initialHistory}
      initialRange={DEFAULT_RANGE}
      fillHeight
    />
  ) : null;

  const bottomWidgets = overview ? (
    <Card
      key="crypto-metadata"
      className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
    >
      <CardHeader>
        <CardTitle className="text-[#161616]">Instrument details</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 gap-x-8 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-3">
        <DetailStat
          label="Market"
          value={`${marketMeta.name} ${marketMeta.detailLabel.toLowerCase()}`}
        />
        <DetailStat label="Status" value={overview.status} />
        <DetailStat label="Index" value={overview.price_index} />
        <DetailStat label="Settlement" value={overview.settlement_period} />
        <DetailStat
          label="Contract size"
          value={formatValue(overview.contract_size)}
        />
        <DetailStat label="Tick size" value={formatValue(overview.tick_size)} />
        <DetailStat
          label="Min trade amount"
          value={formatValue(overview.min_trade_amount)}
        />
        <DetailStat
          label="Max leverage"
          value={
            overview.max_leverage != null
              ? `${overview.max_leverage.toFixed(0)}x`
              : "—"
          }
        />
        <DetailStat
          label="Maker / taker"
          value={
            overview.maker_commission != null && overview.taker_commission != null
              ? `${(overview.maker_commission * 100).toFixed(3)}% / ${(overview.taker_commission * 100).toFixed(3)}%`
              : "—"
          }
        />
        <DetailStat
          label="Created"
          value={formatTimestamp(overview.creation_timestamp)}
        />
        <DetailStat
          label="Expiry"
          value={
            overview.settlement_period === "perpetual"
              ? "Perpetual"
              : formatTimestamp(overview.expiration_timestamp)
          }
        />
        <DetailStat
          label="Best bid / ask"
          value={`${formatValue(overview.best_bid_price)} / ${formatValue(overview.best_ask_price)}`}
        />
      </CardContent>
    </Card>
  ) : null;

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-4">
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
            <div className="flex flex-wrap gap-2">
              {NAV_INSTRUMENTS.map((option) => {
                const optionMeta = getCryptoMarketMeta(option);
                return (
                <Link
                  key={option}
                  href={`/crypto/${option}`}
                  className={`inline-flex h-9 items-center justify-center gap-2 rounded-[10px] px-3.5 text-sm transition-colors ${
                    option === instrument
                      ? "bg-[#1080ff] text-white"
                      : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
                  }`}
                >
                  <Image
                    src={optionMeta.logoSrc}
                    alt={`${optionMeta.name} logo`}
                    width={18}
                    height={18}
                    className="h-[18px] w-[18px]"
                  />
                  {optionMeta.symbol}
                </Link>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Badge
              variant="outline"
              className="border-black/[0.08] bg-[#f4f8ff] font-mono text-sm text-[#161616]"
            >
              {marketMeta.symbol} · Deribit
            </Badge>
            <DownloadDataLink
              href={buildDataPageHref({
                asset_class: "crypto",
                asset: instrument,
              })}
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
              key={`crypto-agent-${instrument}`}
              variant="dashboard"
              cryptoInstrument={instrument}
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
