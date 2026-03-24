import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { Fundamentals } from "@/types/api";

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
}[] = [
  { label: "P/E Ratio", key: "pe_ratio", format: (v) => fmt(v, "x") },
  { label: "Forward P/E", key: "forward_pe", format: (v) => fmt(v, "x") },
  { label: "EPS", key: "eps", format: (v) => fmt(v) },
  { label: "Revenue", key: "revenue", format: fmtCompact },
  { label: "EBITDA", key: "ebitda", format: fmtCompact },
  { label: "Gross Margin", key: "gross_margin", format: fmtPct },
  { label: "Operating Margin", key: "operating_margin", format: fmtPct },
  { label: "Profit Margin", key: "profit_margin", format: fmtPct },
  { label: "D/E Ratio", key: "debt_to_equity", format: (v) => fmt(v, "x") },
  { label: "ROE", key: "return_on_equity", format: fmtPct },
  { label: "Div Yield", key: "dividend_yield", format: fmtPct },
];

export default function FundamentalsGrid({ data }: { data: Fundamentals }) {
  return (
    <Card className="border-border/40 bg-card/60">
      <CardHeader>
        <CardTitle>Fundamentals</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 gap-x-8 gap-y-3 text-sm sm:grid-cols-3 lg:grid-cols-4">
          {METRICS.map((m) => (
            <div key={m.key}>
              <p className="text-muted-foreground">{m.label}</p>
              <p className="font-medium tabular-nums">{m.format(data[m.key])}</p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
