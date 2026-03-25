import Image from "next/image";
import { ArrowDown, ArrowUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCryptoMarketMeta } from "@/lib/crypto";
import type { CryptoOverview } from "@/types/api";

function formatCompactNumber(value: number | null, digits: number = 2): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: digits,
  });
}

function formatCurrency(value: number | null, digits: number = 2): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null, digits: number = 2): string {
  if (value == null) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

export default function CryptoOverviewGrid({
  overview,
}: {
  overview: CryptoOverview;
}) {
  const positive = (overview.change_24h ?? 0) >= 0;
  const Arrow = positive ? ArrowUp : ArrowDown;
  const marketMeta = getCryptoMarketMeta(overview.instrument);

  return (
    <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Card className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] transition-colors hover:border-black/[0.12]">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <Image
                  src={marketMeta.logoSrc}
                  alt={`${marketMeta.name} logo`}
                  width={28}
                  height={28}
                  className="h-7 w-7"
                />
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-[#161616]">
                    {marketMeta.symbol}
                  </p>
                  <p className="text-xs font-light uppercase tracking-[0.18em] text-black/46">
                    {marketMeta.detailLabel}
                  </p>
                </div>
              </div>
              <CardTitle className="text-[1.65rem] font-medium tracking-tight text-[#161616]">
                {formatCurrency(overview.last_price)}
              </CardTitle>
            </div>
            <Badge
              variant="outline"
              className={
                positive
                  ? "border-transparent bg-[#1080ff] text-white"
                  : "border-transparent bg-[#ffe8e5] text-[#b93828]"
              }
            >
              <Arrow className="mr-0.5 h-3 w-3" />
              {formatPercent(Math.abs(overview.change_24h ?? 0))}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-end space-y-1.5 pt-0">
          <p className="text-sm font-light text-black/62">
            {marketMeta.name} perpetual on Deribit
          </p>
          <p className="text-xs text-black/48">
            Deribit perpetual future · {overview.base_currency}/{overview.quote_currency}
          </p>
        </CardContent>
      </Card>

      <MetricCard
        label="Mark price"
        value={formatCurrency(overview.mark_price)}
        meta="Fair-price reference used for liquidation and PnL."
      />
      <MetricCard
        label="Index price"
        value={formatCurrency(overview.index_price)}
        meta={`Tracked against ${overview.price_index}.`}
      />
      <MetricCard
        label="Open interest"
        value={formatCompactNumber(overview.open_interest)}
        meta="Open contracts currently outstanding."
      />
      <MetricCard
        label="24H volume"
        value={formatCompactNumber(overview.volume_notional_24h)}
        meta="Approximate USD notional traded over the last day."
      />
      <MetricCard
        label={overview.funding_8h != null ? "Funding (8H)" : "Best ask"}
        value={
          overview.funding_8h != null
            ? formatPercent(overview.funding_8h * 100, 3)
            : formatCurrency(overview.best_ask_price)
        }
        meta={
          overview.funding_8h != null
            ? "Current eight-hour funding estimate on the perpetual."
            : "Current best ask on the Deribit order book."
        }
      />
    </div>
  );
}

function MetricCard({
  label,
  value,
  meta,
}: {
  label: string;
  value: string;
  meta: string;
}) {
  return (
    <Card className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] transition-colors hover:border-black/[0.12]">
      <CardHeader className="pb-2">
        <div className="space-y-1">
          <p className="text-sm font-light text-black/56">{label}</p>
          <CardTitle className="text-[1.6rem] font-medium tracking-tight text-[#161616]">
            {value}
          </CardTitle>
        </div>
      </CardHeader>
      <CardContent className="flex flex-1 items-end pt-0">
        <p className="text-sm font-light leading-6 text-black/62">{meta}</p>
      </CardContent>
    </Card>
  );
}
