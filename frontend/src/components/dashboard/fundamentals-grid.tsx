import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { Fundamentals } from "@/types/api";
import { Info } from "lucide-react";

function fmt(n: number | null, suffix = ""): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 }) + suffix;
}

function fmtPct(n: number | null): string {
  if (n == null) return "—";
  return (n * 100).toLocaleString("en-US", { maximumFractionDigits: 2 }) + "%";
}

function fmtCompact(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

const METRICS: {
  label: string;
  key: keyof Fundamentals;
  format: (v: number | null) => string;
  tip: string;
}[] = [
  { label: "P/E Ratio", key: "pe_ratio", format: (v) => fmt(v, "x"), tip: "Price-to-Earnings: stock price divided by EPS. Lower may indicate undervaluation." },
  { label: "Forward P/E", key: "forward_pe", format: (v) => fmt(v, "x"), tip: "Forward P/E uses estimated future earnings. Useful for growth companies." },
  { label: "EPS", key: "eps", format: (v) => fmt(v), tip: "Earnings Per Share: net income divided by outstanding shares." },
  { label: "Revenue", key: "revenue", format: fmtCompact, tip: "Total revenue (top line) for the last reported period." },
  { label: "EBITDA", key: "ebitda", format: fmtCompact, tip: "Earnings Before Interest, Taxes, Depreciation, and Amortization." },
  { label: "Gross Margin", key: "gross_margin", format: fmtPct, tip: "Revenue minus cost of goods sold, as a percentage of revenue." },
  { label: "Op. Margin", key: "operating_margin", format: fmtPct, tip: "Operating income as a percentage of revenue. Measures operational efficiency." },
  { label: "Profit Margin", key: "profit_margin", format: fmtPct, tip: "Net income as a percentage of revenue. The bottom-line profitability." },
  { label: "D/E Ratio", key: "debt_to_equity", format: (v) => fmt(v, "x"), tip: "Total debt divided by shareholders' equity. Higher means more leverage." },
  { label: "ROE", key: "return_on_equity", format: fmtPct, tip: "Return on Equity: how efficiently a company uses shareholder capital." },
  { label: "Div Yield", key: "dividend_yield", format: fmtPct, tip: "Annual dividends per share divided by price per share." },
];

export default function FundamentalsGrid({ data }: { data: Fundamentals }) {
  return (
    <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
      <CardHeader>
        <CardTitle className="text-[#161616]">Fundamentals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.key} className="group">
              <Tooltip>
                <TooltipTrigger className="inline-flex items-center gap-1 text-black/52">
                  {m.label}
                  <Info className="h-3 w-3 opacity-0 transition-opacity group-hover:opacity-60" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p className="max-w-[220px]">{m.tip}</p>
                </TooltipContent>
              </Tooltip>
              <p className="font-medium tabular-nums text-[#161616]">{m.format(data[m.key])}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
