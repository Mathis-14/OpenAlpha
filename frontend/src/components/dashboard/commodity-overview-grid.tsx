"use client";

import Image from "next/image";
import { ArrowDown, ArrowUp, Droplets, Gem } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCommodityCategoryLabel, getCommodityMeta } from "@/lib/commodities";
import type { CommodityOverview } from "@/types/api";

function formatCurrency(value: number | null, digits = 2): string {
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

function formatNumber(value: number | null, digits = 2): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function formatPercent(value: number | null, digits = 2): string {
  if (value == null) {
    return "—";
  }

  return `${value >= 0 ? "+" : ""}${value.toFixed(digits)}%`;
}

function formatCompact(value: number | null): string {
  if (value == null) {
    return "—";
  }

  return value.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

export default function CommodityOverviewGrid({
  overview,
}: {
  overview: CommodityOverview;
}) {
  const positive = overview.change_percent >= 0;
  const Arrow = positive ? ArrowUp : ArrowDown;
  const CategoryIcon = overview.category === "energy" ? Droplets : Gem;
  const commodityMeta = getCommodityMeta(overview.instrument);
  const usesPlainNumber =
    overview.category === "index" ||
    overview.unit_label.toLowerCase().includes("cents");

  function formatPrimaryValue(value: number | null): string {
    return usesPlainNumber ? formatNumber(value) : formatCurrency(value);
  }

  return (
    <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-3">
      <Card className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] transition-colors hover:border-black/[0.12]">
        <CardHeader className="pb-2">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-[#eef5ff] text-[#1080ff]">
                  {commodityMeta.logoSrc ? (
                    <Image
                      src={commodityMeta.logoSrc}
                      alt={`${overview.name} logo`}
                      width={36}
                      height={36}
                      className="h-9 w-9 rounded-full object-cover"
                    />
                  ) : (
                    <CategoryIcon className="h-4.5 w-4.5" />
                  )}
                </div>
                <div className="space-y-0.5">
                  <p className="text-sm font-medium text-[#161616]">
                    {overview.short_label}
                  </p>
                  <p className="text-xs font-light uppercase tracking-[0.18em] text-black/46">
                    {getCommodityCategoryLabel(overview.category)}
                  </p>
                </div>
              </div>
              <CardTitle className="text-[1.65rem] font-medium tracking-tight text-[#161616]">
                {formatPrimaryValue(overview.current_price)}
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
              {formatPercent(Math.abs(overview.change_percent))}
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-1 flex-col justify-end space-y-1.5 pt-0">
          <p className="text-sm font-light text-black/62">{overview.description}</p>
          <p className="text-xs text-black/48">
            {overview.unit_label} · {overview.exchange_label}
          </p>
        </CardContent>
      </Card>

      <MetricCard
        label="Previous close"
        value={formatPrimaryValue(overview.previous_close)}
        meta="Latest prior session reference used for the daily change."
      />
      <MetricCard
        label="Volume"
        value={formatCompact(overview.volume)}
        meta={
          overview.volume == null
            ? "Not available for this benchmark series."
            : "Reported futures volume when the source makes it available."
        }
      />
      <MetricCard
        label="Open interest"
        value={formatCompact(overview.open_interest)}
        meta={
          overview.open_interest == null
            ? "Not available for this benchmark series."
            : "Open contracts outstanding when the source exposes it."
        }
      />
      <MetricCard
        label="Day range"
        value={`${formatPrimaryValue(overview.day_low)} - ${formatPrimaryValue(overview.day_high)}`}
        meta={
          overview.day_low == null || overview.day_high == null
            ? "Intraday range is not available for this benchmark series."
            : "Current session low-to-high range."
        }
      />
      <MetricCard
        label="52W range"
        value={`${formatPrimaryValue(overview.fifty_two_week_low)} - ${formatPrimaryValue(overview.fifty_two_week_high)}`}
        meta={
          overview.category === "index"
            ? "Twelve-month index range from the benchmark series."
            : "Twelve-month range from the source data."
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
