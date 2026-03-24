"use client";

import { useEffect, useRef, useState } from "react";
import {
  createChart,
  ColorType,
  CandlestickSeries,
  type IChartApi,
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
}

export default function PriceChart({
  ticker,
  initialData,
  initialPeriod,
}: PriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [period, setPeriod] = useState<PeriodType>(initialPeriod);
  const [cache, setCache] = useState<Record<string, PricePoint[]>>({
    [initialPeriod]: initialData,
  });
  const [loading, setLoading] = useState(false);

  const data = cache[period] ?? initialData;

  function fitChartToData(chart: IChartApi) {
    requestAnimationFrame(() => {
      chart.timeScale().fitContent();
    });
  }

  async function handlePeriodChange(newPeriod: PeriodType) {
    setPeriod(newPeriod);
    if (cache[newPeriod]) return;
    setLoading(true);
    try {
      const d = await getPriceHistory(ticker, newPeriod);
      setCache((prev) => ({ ...prev, [newPeriod]: d }));
    } catch {
      /* keep showing previous data */
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
      height: 400,
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
        time: p.date,
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
      chart.applyOptions({ width: el.clientWidth });
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
    <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
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
      <CardContent>
        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-[14px] bg-white/85 backdrop-blur-sm">
              <span className="text-sm text-black/56">Loading...</span>
            </div>
          )}
          <div ref={containerRef} className="h-[400px] w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
