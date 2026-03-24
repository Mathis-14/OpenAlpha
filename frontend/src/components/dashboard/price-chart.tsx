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
        textColor: "rgba(255,255,255,0.5)",
        fontSize: 12,
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.04)" },
        horzLines: { color: "rgba(255,255,255,0.04)" },
      },
      crosshair: {
        vertLine: { labelBackgroundColor: "#9B93F5" },
        horzLine: { labelBackgroundColor: "#9B93F5" },
      },
      timeScale: {
        borderColor: "rgba(255,255,255,0.06)",
        timeVisible: period === "1d" || period === "5d",
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.06)" },
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
    chart.timeScale().fitContent();

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
      if (el) chart.applyOptions({ width: el.clientWidth });
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
    };
  }, [data, period]);

  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Price</CardTitle>
          <div className="flex gap-1">
            {PERIODS.map((p) => (
              <button
                key={p.value}
                onClick={() => handlePeriodChange(p.value)}
                className={`rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                  period === p.value
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
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
            <div className="absolute inset-0 z-10 flex items-center justify-center bg-card/80 backdrop-blur-sm">
              <span className="text-sm text-muted-foreground">Loading...</span>
            </div>
          )}
          <div ref={containerRef} className="h-[400px] w-full" />
        </div>
      </CardContent>
    </Card>
  );
}
