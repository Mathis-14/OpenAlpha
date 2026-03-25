"use client";

import { useEffect, useRef, useState } from "react";
import {
  AreaSeries,
  ColorType,
  LineStyle,
  createChart,
  type IChartApi,
} from "lightweight-charts";
import { getMacroSeries } from "@/lib/api";
import type {
  MacroCountry,
  MacroHistoryRange,
  MacroIndicator,
  MacroIndicatorSlug,
} from "@/types/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const INDICATORS: Record<
  MacroCountry,
  { slug: MacroIndicatorSlug; label: string }[]
> = {
  us: [
    { slug: "fed-funds", label: "Fed funds" },
    { slug: "cpi", label: "CPI" },
    { slug: "gdp-growth", label: "GDP growth" },
    { slug: "treasury-10y", label: "10Y Treasury" },
    { slug: "unemployment", label: "Unemployment" },
  ],
  fr: [
    { slug: "fed-funds", label: "Policy rate" },
    { slug: "cpi", label: "CPI" },
    { slug: "gdp-growth", label: "GDP growth" },
    { slug: "treasury-10y", label: "10Y OAT" },
    { slug: "unemployment", label: "Unemployment" },
  ],
};

const RANGES: { value: MacroHistoryRange; label: string }[] = [
  { value: "1y", label: "1Y" },
  { value: "3y", label: "3Y" },
  { value: "5y", label: "5Y" },
  { value: "10y", label: "10Y" },
  { value: "max", label: "Max" },
];

function formatIndicatorValue(indicator: MacroIndicator): string {
  if (indicator.unit === "%") {
    return `${indicator.latest_value.toFixed(2)}%`;
  }

  return indicator.latest_value.toLocaleString("en-US", {
    maximumFractionDigits: indicator.unit === "index" ? 2 : 1,
  });
}

export default function MacroChart({
  initialIndicator,
  initialIndicatorSlug,
  initialRange,
  country,
  fillHeight = false,
}: {
  initialIndicator: MacroIndicator;
  initialIndicatorSlug: MacroIndicatorSlug;
  initialRange: MacroHistoryRange;
  country: MacroCountry;
  fillHeight?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [indicator, setIndicator] =
    useState<MacroIndicatorSlug>(initialIndicatorSlug);
  const [range, setRange] = useState<MacroHistoryRange>(initialRange);
  const [cache, setCache] = useState<Record<string, MacroIndicator>>({
    [`${initialIndicatorSlug}:${initialRange}`]: initialIndicator,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cacheKey = `${indicator}:${range}`;
  const data = cache[cacheKey] ?? initialIndicator;

  function fitChartToData(chart: IChartApi) {
    requestAnimationFrame(() => {
      chart.timeScale().fitContent();
    });
  }

  async function loadSeries(
    nextIndicator: MacroIndicatorSlug,
    nextRange: MacroHistoryRange,
  ) {
    const nextKey = `${nextIndicator}:${nextRange}`;
    if (cache[nextKey]) {
      setError(null);
      setIndicator(nextIndicator);
      setRange(nextRange);
      return;
    }

    setLoading(true);
    try {
      const result = await getMacroSeries(nextIndicator, nextRange, country);
      setCache((prev) => ({ ...prev, [nextKey]: result }));
      setIndicator(nextIndicator);
      setRange(nextRange);
      setError(null);
    } catch {
      setError("Unable to refresh chart data right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const chart = createChart(el, {
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: "rgba(22,22,22,0.52)",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(0,0,0,0.04)" },
        horzLines: { color: "rgba(0,0,0,0.05)" },
      },
      crosshair: {
        vertLine: {
          color: "rgba(16,128,255,0.2)",
          labelBackgroundColor: "#1080ff",
          style: LineStyle.Solid,
        },
        horzLine: { labelBackgroundColor: "#1080ff" },
      },
      timeScale: { borderColor: "rgba(0,0,0,0.08)" },
      rightPriceScale: { borderColor: "rgba(0,0,0,0.08)" },
      width: el.clientWidth,
      height: el.clientHeight || 300,
    });

    const series = chart.addSeries(AreaSeries, {
      lineColor: "#1080ff",
      topColor: "rgba(16, 128, 255, 0.24)",
      bottomColor: "rgba(16, 128, 255, 0.02)",
      lineWidth: 2,
    });

    series.setData(
      data.history.map((point) => ({
        time: point.date,
        value: point.value,
      })) as Parameters<typeof series.setData>[0],
    );
    fitChartToData(chart);

    chartRef.current = chart;

    const resizeObserver = new ResizeObserver(() => {
      chart.applyOptions({
        width: el.clientWidth,
        height: el.clientHeight || 300,
      });
      fitChartToData(chart);
    });
    resizeObserver.observe(el);

    return () => {
      resizeObserver.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data]);

  return (
    <Card
      className={`rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] ${
        fillHeight ? "flex h-full min-h-0 flex-col" : ""
      }`}
    >
      <CardHeader className="space-y-3 pb-3">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div className="space-y-1">
            <CardTitle className="text-[#161616]">Macro trends</CardTitle>
            <p className="text-sm font-light text-black/62">
              {data.name} · {formatIndicatorValue(data)} · FRED
            </p>
          </div>
          <div className="flex flex-wrap gap-1">
            {RANGES.map((item) => (
              <button
                key={item.value}
                type="button"
                onClick={() => loadSeries(indicator, item.value)}
                className={`rounded-[10px] px-3 py-1.5 text-xs font-medium transition-colors ${
                  range === item.value
                    ? "bg-[#1080ff] text-white"
                    : "text-black/54 hover:bg-[#f4f8ff] hover:text-[#161616]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {INDICATORS[country].map((item) => (
            <button
              key={item.slug}
              type="button"
              onClick={() => loadSeries(item.slug, range)}
              className={`rounded-[10px] border px-3 py-2 text-sm transition-colors ${
                indicator === item.slug
                  ? "border-[#1080ff]/18 bg-[#eef5ff] text-[#161616]"
                  : "border-black/[0.08] bg-white text-black/62 hover:bg-[#f7fbff] hover:text-[#161616]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </CardHeader>
      <CardContent className={fillHeight ? "flex min-h-0 flex-1 flex-col space-y-3 pt-0" : "space-y-3 pt-0"}>
        <div className={`relative ${fillHeight ? "min-h-0 flex-1" : ""}`}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[14px] bg-white/80 backdrop-blur-sm">
              <span className="text-sm text-black/56">Loading chart…</span>
            </div>
          )}
          <div
            ref={containerRef}
            className={fillHeight ? "min-h-[220px] h-full w-full" : "h-[300px] w-full"}
          />
        </div>

        <div className="flex flex-col gap-1 text-xs text-black/48 sm:flex-row sm:items-center sm:justify-between">
          <span>
            Latest release:{" "}
            {new Date(data.latest_date).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span>Source: Federal Reserve Economic Data (FRED)</span>
        </div>

        {error && <p className="text-sm text-[#b93828]">{error}</p>}
      </CardContent>
    </Card>
  );
}
