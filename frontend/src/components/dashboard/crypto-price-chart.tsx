"use client";

import { useEffect, useRef, useState } from "react";
import {
  CandlestickSeries,
  ColorType,
  createChart,
  type IChartApi,
  type Time,
  type UTCTimestamp,
} from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCryptoPriceHistory } from "@/lib/api";
import type { CryptoInstrument, CryptoRange, PricePoint } from "@/types/api";

const RANGES: { label: string; value: CryptoRange }[] = [
  { label: "1D", value: "1d" },
  { label: "1W", value: "1w" },
  { label: "1M", value: "1mo" },
  { label: "3M", value: "3mo" },
  { label: "1Y", value: "1y" },
  { label: "Max", value: "max" },
];

interface CryptoPriceChartProps {
  instrument: CryptoInstrument;
  initialData: PricePoint[];
  initialRange: CryptoRange;
  fillHeight?: boolean;
}

function toChartTime(value: number): Time {
  return value as UTCTimestamp;
}

export default function CryptoPriceChart({
  instrument,
  initialData,
  initialRange,
  fillHeight = false,
}: CryptoPriceChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const [range, setRange] = useState<CryptoRange>(initialRange);
  const [cache, setCache] = useState<Record<string, PricePoint[]>>({
    [initialRange]: initialData,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = cache[range] ?? initialData;

  function fitChartToData(chart: IChartApi) {
    requestAnimationFrame(() => {
      chart.timeScale().fitContent();
    });
  }

  async function handleRangeChange(nextRange: CryptoRange) {
    if (nextRange === range) {
      return;
    }

    if (cache[nextRange]) {
      setError(null);
      setRange(nextRange);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const history = await getCryptoPriceHistory(instrument, nextRange);
      setCache((prev) => ({ ...prev, [nextRange]: history }));
      setRange(nextRange);
    } catch {
      setError("Unable to refresh crypto price history right now.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }

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
        timeVisible: range === "1d" || range === "1w",
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
      data.map((point) => ({
        time: toChartTime(point.date),
        open: point.open,
        high: point.high,
        low: point.low,
        close: point.close,
      })) as Parameters<typeof candleSeries.setData>[0],
    );
    fitChartToData(chart);

    chartRef.current = chart;

    const ro = new ResizeObserver(() => {
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
  }, [data, range]);

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
            {RANGES.map((item) => (
              <button
                key={item.value}
                onClick={() => handleRangeChange(item.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
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
