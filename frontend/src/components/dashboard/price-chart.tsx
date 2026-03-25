"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  type IChartApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { PricePoint, PeriodType } from "@/types/api";
import { getPriceHistory } from "@/lib/api";

const PERIODS: { label: string; value: PeriodType }[] = [
  { label: "1D", value: "1d" },
  { label: "5D", value: "5d" },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "6M", value: "6mo" },
  { label: "1Y", value: "1y" },
  { label: "5Y", value: "5y" },
];

interface PriceChartProps {
  ticker: string;
  initialData: PricePoint[];
  initialPeriod: PeriodType;
  fillHeight?: boolean;
}

function toChartTime(value: string | number): Time {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value as UTCTimestamp;
  }

  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return value;
  }

  const timestamp = typeof value === "string" ? Date.parse(value) : Number.NaN;
  if (Number.isFinite(timestamp)) {
    return Math.floor(timestamp / 1000) as UTCTimestamp;
  }

  throw new Error(`Invalid chart date: ${value}`);
}

export default function PriceChart({
  ticker,
  initialData,
  initialPeriod,
  fillHeight = false,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [period, setPeriod] = useState<PeriodType>(initialPeriod);
  const [cache, setCache] = useState<Record<string, PricePoint[]>>({
    [initialPeriod]: initialData,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = cache[period] ?? initialData;

  function fitChartToData(chart: IChartApi) {
    requestAnimationFrame(() => {
      chart.timeScale().fitContent();
    });
  }

  async function handlePeriodChange(newPeriod: PeriodType) {
    if (newPeriod === period) return;
    if (cache[newPeriod]) {
      setError(null);
      setPeriod(newPeriod);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const d = await getPriceHistory(ticker, newPeriod);
      setCache((prev) => ({ ...prev, [newPeriod]: d }));
      setPeriod(newPeriod);
    } catch {
      setError("Unable to refresh price history right now.");
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
        vertLines: { color: "rgba(0,0,0,0.05)" },
        horzLines: { color: "rgba(0,0,0,0.05)" },
      },
      crosshair: {
        vertLine: { labelBackgroundColor: "#1080ff" },
        horzLine: { labelBackgroundColor: "#1080ff" },
      },
      timeScale: {
        borderColor: "rgba(0,0,0,0.08)",
        timeVisible: period === "1d" || period === "5d",
      },
      rightPriceScale: { borderColor: "rgba(0,0,0,0.08)" },
      width: el.clientWidth,
      height: el.clientHeight || 320,
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderUpColor: "#22c55e",
      borderDownColor: "#ef4444",
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    candleSeries.setData(
      data.map((p) => ({
        time: toChartTime(p.date),
        open: p.open,
        high: p.high,
        low: p.low,
        close: p.close,
      })) as Parameters<typeof candleSeries.setData>[0],
    );
    fitChartToData(chart);

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (!el) return;
      chart.applyOptions({
        width: el.clientWidth,
        height: el.clientHeight || 320,
      });
      fitChartToData(chart);
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, period]);

  return (
    <Card
      className={`rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] ${
        fillHeight ? "flex h-full min-h-0 flex-col" : ""
      }`}
    >
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-[#161616]">Price</CardTitle>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriodChange(p.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                  period === p.value
                    ? "bg-[#1080ff] text-white"
                    : "text-black/54 hover:bg-[#f4f8ff] hover:text-[#161616]"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className={fillHeight ? "flex min-h-0 flex-1 flex-col pt-0" : "pt-0"}>
        <div className={`relative space-y-3 ${fillHeight ? "flex min-h-0 flex-1 flex-col" : ""}`}>
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[14px] bg-white/85 backdrop-blur-sm">
              <span className="text-sm text-black/56">Loading...</span>
            </div>
          )}
          <div
            ref={containerRef}
            className={fillHeight ? "min-h-[240px] flex-1 w-full" : "h-[320px] w-full"}
          />
          {error && <p className="text-sm text-[#b93828]">{error}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
