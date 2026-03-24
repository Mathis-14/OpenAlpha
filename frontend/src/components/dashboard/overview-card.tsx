import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { TickerOverview } from "@/types/api";
import { ArrowDown, ArrowUp } from "lucide-react";

function fmt(n: number | null, opts?: Intl.NumberFormatOptions): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", opts);
}

function fmtCompact(n: number | null): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 2,
  });
}

function fmtPrice(n: number, currency: string): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function OverviewCard({ data }: { data: TickerOverview }) {
  const positive = data.change >= 0;
  const Arrow = positive ? ArrowUp : ArrowDown;

  return (
    <Card className="border-border/40 bg-card/60 transition-colors hover:border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-2xl font-bold tracking-tight">
              {data.name}
            </CardTitle>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {data.symbol} · {data.exchange} · {data.currency}
            </p>
          </div>
          <Badge
            variant={positive ? "default" : "destructive"}
            className={positive ? "bg-positive text-white" : ""}
          >
            <Arrow className="mr-0.5 h-3 w-3" />
            {fmt(Math.abs(data.change_percent), { maximumFractionDigits: 2 })}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold tabular-nums tracking-tight">
            {fmtPrice(data.current_price, data.currency)}
          </span>
          <span
            className={`text-sm font-medium ${positive ? "text-positive" : "text-negative"}`}
          >
            {positive ? "+" : ""}
            {fmt(data.change, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </span>
        </div>

        <div className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 text-sm sm:grid-cols-4">
          <Stat label="Prev Close" value={fmtPrice(data.previous_close, data.currency)} />
          <Stat label="Volume" value={fmtCompact(data.volume)} />
          <Stat label="Market Cap" value={fmtCompact(data.market_cap)} />
          <Stat
            label="52W Range"
            value={
              data.fifty_two_week_low != null && data.fifty_two_week_high != null
                ? `${fmt(data.fifty_two_week_low, { maximumFractionDigits: 2 })} – ${fmt(data.fifty_two_week_high, { maximumFractionDigits: 2 })}`
                : "—"
            }
          />
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-muted-foreground">{label}</p>
      <p className="font-medium tabular-nums">{value}</p>
    </div>
  );
}
