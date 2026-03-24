import Image from "next/image";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import TickerSearch from "@/components/ticker-search";
import LandingSpotlight from "@/components/landing-spotlight";
import AgentChat from "@/components/dashboard/agent-chat";
import DashboardLayout from "@/components/dashboard/dashboard-layout";
import MacroChart from "@/components/dashboard/macro-chart";
import MacroOverviewGrid from "@/components/dashboard/macro-overview-grid";
import {
  ApiError,
  getMacroSeries,
  getMacroSnapshot,
} from "@/lib/api";
import type {
  MacroCountry,
  MacroHistoryRange,
  MacroIndicatorSlug,
} from "@/types/api";

const DEFAULT_INDICATOR: MacroIndicatorSlug = "fed-funds";
const DEFAULT_RANGE: MacroHistoryRange = "5y";
const COUNTRY_OPTIONS: { value: MacroCountry; label: string }[] = [
  { value: "us", label: "United States" },
  { value: "fr", label: "France" },
];

export default async function MacroPage({
  searchParams,
}: {
  searchParams?: Promise<{ country?: string }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const country: MacroCountry = params?.country === "fr" ? "fr" : "us";

  const [snapshotResult, seriesResult] = await Promise.all([
    getMacroSnapshot(country)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        status: error instanceof ApiError ? error.status : 500,
        message:
          error instanceof ApiError
            ? error.message
            : "Failed to load macro snapshot",
      })),
    getMacroSeries(DEFAULT_INDICATOR, DEFAULT_RANGE, country)
      .then((data) => ({ ok: true as const, data }))
      .catch((error: unknown) => ({
        ok: false as const,
        status: error instanceof ApiError ? error.status : 500,
        message:
          error instanceof ApiError
            ? error.message
            : "Failed to load macro history",
      })),
  ]);

  const snapshot = snapshotResult.ok ? snapshotResult.data : null;
  const initialSeries = seriesResult.ok
    ? seriesResult.data
    : snapshot?.fed_funds_rate ?? null;
  const snapshotError = snapshotResult.ok
    ? null
    : snapshotResult.status === 503
      ? "The macro data provider is temporarily unavailable. Try again in a moment."
      : "Something went wrong loading macro data.";

  const dataWidgets = [
    <Card
      key="macro-country-switch"
      className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
    >
      <CardContent className="flex flex-col gap-3 py-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p className="text-sm font-medium text-[#161616]">Country</p>
          <p className="text-sm font-light text-black/62">
            Switch the macro dashboard between the U.S. and France.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {COUNTRY_OPTIONS.map((option) => (
            <Link
              key={option.value}
              href={option.value === "us" ? "/macro" : `/macro?country=${option.value}`}
              className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
                country === option.value
                  ? "bg-[#1080ff] text-white"
                  : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
              }`}
            >
              {option.label}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>,

    snapshot ? (
      <MacroOverviewGrid key="macro-overview" snapshot={snapshot} country={country} />
    ) : (
      <Card
        key="macro-overview-fallback"
        className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
      >
        <CardHeader>
          <CardTitle className="text-[#161616]">Macro snapshot</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-light text-black/64">{snapshotError}</p>
        </CardContent>
      </Card>
    ),

    initialSeries ? (
      <MacroChart
        key={`macro-chart-${country}`}
        initialIndicator={initialSeries}
        initialIndicatorSlug={DEFAULT_INDICATOR}
        initialRange={DEFAULT_RANGE}
        country={country}
      />
    ) : (
      <Card
        key="macro-chart-fallback"
        className="rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]"
      >
        <CardHeader>
          <CardTitle className="text-[#161616]">Macro trends</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm font-light text-black/64">
            Unable to load chart history right now.
          </p>
        </CardContent>
      </Card>
    ),
  ];

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center gap-4 px-6 py-3">
          <Link
            href="/"
            className="shrink-0 transition-opacity hover:opacity-80"
          >
            <Image
              src="/openalpha_logo_light.svg"
              alt="OpenAlpha"
              width={680}
              height={200}
              className="h-8 w-auto"
            />
          </Link>
          <div className="max-w-[360px] flex-1">
            <TickerSearch variant="dashboard" />
          </div>
          <Badge
            variant="outline"
            className="border-black/[0.08] bg-[#f4f8ff] font-mono text-sm text-[#161616]"
          >
            {country === "fr" ? "Macro · FR" : "Macro · US"}
          </Badge>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1280px] px-6 py-8">
        <DashboardLayout
          dataWidgets={dataWidgets}
          agentPanel={
            <AgentChat
              key={`macro-agent-${country}`}
              variant="dashboard"
              macroCountry={country}
            />
          }
        />
      </main>
    </div>
  );
}
