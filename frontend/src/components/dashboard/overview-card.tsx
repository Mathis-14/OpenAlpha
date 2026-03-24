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
    <Card className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] transition-colors hover:border-black/[0.12]">
      <CardHeader>
        <div className="flex items-start justify-between">
          <div>
            <CardTitle className="text-2xl font-medium tracking-tight text-[#161616]">
              {data.name}
            </CardTitle>
            <p className="mt-0.5 text-sm font-light text-black/56">
              {data.symbol} · {data.exchange} · {data.currency}
            </p>
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
            {fmt(Math.abs(data.change_percent), { maximumFractionDigits: 2 })}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-medium tabular-nums tracking-tight text-[#161616]">
            {fmtPrice(data.current_price, data.currency)}
          </span>
          <span
            className={`text-sm font-medium ${positive ? "text-[#1080ff]" : "text-[#b93828]"}`}
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
      <p className="text-black/52">{label}</p>
      <p className="font-medium tabular-nums text-[#161616]">{value}</p>
    </div>
  );
}
