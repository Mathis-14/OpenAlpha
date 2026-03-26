import Image from "next/image";
import Link from "next/link";
import LandingSpotlight from "@/components/landing-spotlight";
import AgentChat from "@/components/dashboard/agent-chat";
import DataQuickLinks from "@/components/data-quick-links";
import { Badge } from "@/components/ui/badge";
import DataExportTool from "@/components/data-export-tool";
import RequestQuotaBadge from "@/components/request-quota-badge";
import {
  getDefaultAssetForClass,
  getDefaultDateRange,
  isDataAssetClass,
} from "@/lib/data-export";
import type { DataAssetClass, MacroCountry } from "@/types/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function DataPage({
  searchParams,
}: {
  searchParams?: Promise<{
    asset_class?: string;
    asset?: string;
    country?: string;
    start_date?: string;
    end_date?: string;
    assistant_ready?: string;
  }>;
}) {
  const params = searchParams ? await searchParams : undefined;
  const assetClass: DataAssetClass = isDataAssetClass(params?.asset_class ?? "")
    ? (params?.asset_class as DataAssetClass)
    : "stock";
  const defaults = getDefaultDateRange(assetClass);
  const country: MacroCountry = params?.country === "fr" ? "fr" : "us";
  const initialAsset =
    params?.asset?.trim() || getDefaultAssetForClass(assetClass);
  const initialStartDate = params?.start_date?.trim() || defaults.startDate;
  const initialEndDate = params?.end_date?.trim() || defaults.endDate;
  const assistantReady = params?.assistant_ready === "1";
  const dataToolKey = [
    assetClass,
    initialAsset,
    country,
    initialStartDate,
    initialEndDate,
    assistantReady ? "assistant" : "manual",
  ].join(":");

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#fafcff]">
      <LandingSpotlight />
      <div className="pointer-events-none absolute inset-0 z-[2] bg-[linear-gradient(180deg,rgba(255,255,255,0.6),rgba(247,251,255,0.84)_34%,rgba(247,251,255,0.98)_100%)]" />

      <header className="sticky top-0 z-40 border-b border-black/[0.08] bg-white/88 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <Link href="/" className="shrink-0 transition-opacity hover:opacity-80">
              <Image
                src="/openalpha_logo_light.svg"
                alt="OpenAlpha"
                width={680}
                height={200}
                className="h-8 w-auto"
              />
            </Link>
            <RequestQuotaBadge />
          </div>
          <Badge
            variant="outline"
            className="border-black/[0.08] bg-[#f4f8ff] font-mono text-sm text-[#161616]"
          >
            Get the data
          </Badge>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-[1220px] space-y-6 px-6 py-8">
        <div className="grid gap-6 xl:grid-cols-[minmax(0,0.88fr)_minmax(420px,0.64fr)] xl:items-stretch">
          <div className="min-h-0 xl:h-[720px]">
            <DataExportTool
              key={dataToolKey}
              initialAssetClass={assetClass}
              initialAsset={initialAsset}
              initialCountry={country}
              initialStartDate={initialStartDate}
              initialEndDate={initialEndDate}
              assistantReady={assistantReady}
            />
          </div>
          <div className="min-h-0 xl:h-[720px]">
            <AgentChat variant="dashboard" dataAssistant />
          </div>
        </div>

        <DataQuickLinks />
      </main>
    </div>
  );
}
