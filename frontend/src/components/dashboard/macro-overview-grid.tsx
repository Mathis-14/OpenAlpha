import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUtcDate } from "@/lib/date-format";
import type {
  MacroCountry,
  MacroIndicator,
  MacroIndicatorSlug,
  MacroSnapshot,
} from "@/types/api";

const MACRO_CARDS: Record<MacroCountry, {
  slug: MacroIndicatorSlug;
  label: string;
  getIndicator: (snapshot: MacroSnapshot) => MacroIndicator;
}[]> = {
  us: [
    {
      slug: "fed-funds",
      label: "Fed funds",
      getIndicator: (snapshot) => snapshot.fed_funds_rate,
    },
    {
      slug: "cpi",
      label: "CPI",
      getIndicator: (snapshot) => snapshot.cpi,
    },
    {
      slug: "gdp-growth",
      label: "GDP growth",
      getIndicator: (snapshot) => snapshot.gdp_growth,
    },
    {
      slug: "treasury-10y",
      label: "10Y Treasury",
      getIndicator: (snapshot) => snapshot.treasury_10y,
    },
    {
      slug: "unemployment",
      label: "Unemployment",
      getIndicator: (snapshot) => snapshot.unemployment,
    },
  ],
  fr: [
    {
      slug: "fed-funds",
      label: "Policy rate",
      getIndicator: (snapshot) => snapshot.fed_funds_rate,
    },
    {
      slug: "cpi",
      label: "CPI",
      getIndicator: (snapshot) => snapshot.cpi,
    },
    {
      slug: "gdp-growth",
      label: "GDP growth",
      getIndicator: (snapshot) => snapshot.gdp_growth,
    },
    {
      slug: "treasury-10y",
      label: "10Y OAT",
      getIndicator: (snapshot) => snapshot.treasury_10y,
    },
    {
      slug: "unemployment",
      label: "Unemployment",
      getIndicator: (snapshot) => snapshot.unemployment,
    },
  ],
};

function formatIndicatorValue(indicator: MacroIndicator): string {
  if (indicator.unit === "%") {
    return `${indicator.latest_value.toFixed(2)}%`;
  }

  return indicator.latest_value.toLocaleString("en-US", {
    maximumFractionDigits: indicator.unit === "index" ? 2 : 1,
  });
}

function formatIndicatorDelta(indicator: MacroIndicator): string | null {
  if (indicator.history.length < 2) {
    return null;
  }

  const previous = indicator.history[indicator.history.length - 2]?.value;
  if (previous == null) {
    return null;
  }

  const change = indicator.latest_value - previous;
  const sign = change >= 0 ? "+" : "";
  const suffix = indicator.unit === "%" ? " pts" : "";
  return `${sign}${change.toFixed(2)}${suffix}`;
}

export default function MacroOverviewGrid({
  snapshot,
  country,
}: {
  snapshot: MacroSnapshot;
  country: MacroCountry;
}) {
  return (
    <div className="grid grid-cols-1 items-stretch gap-3 md:grid-cols-2 xl:grid-cols-5">
      {MACRO_CARDS[country].map((card) => {
        const indicator = card.getIndicator(snapshot);
        const delta = formatIndicatorDelta(indicator);

        return (
          <Card
            key={card.slug}
            className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)] transition-colors hover:border-black/[0.12]"
          >
            <CardHeader className="pb-2">
              <div className="space-y-1">
                <p className="text-sm font-light text-black/56">{card.label}</p>
                <CardTitle className="text-[1.65rem] font-medium tracking-tight text-[#161616]">
                  {formatIndicatorValue(indicator)}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent className="flex flex-1 flex-col justify-end space-y-1.5 pt-0">
              <p className="text-sm font-light text-black/62">{indicator.name}</p>
              <div className="flex items-center justify-between text-xs text-black/48">
                <span>Updated {formatUtcDate(indicator.latest_date)}</span>
                {delta && (
                  <span className="rounded-full bg-[#f4f8ff] px-2 py-0.5 text-[#161616]">
                    {delta}
                  </span>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
