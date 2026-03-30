"use client";

import Image from "next/image";
import { startTransition, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { sendGAEvent } from "@next/third-parties/google";
import {
  Check,
  ChevronDown,
  Database,
  Download,
  FileText,
  Sparkles,
} from "lucide-react";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import TICKERS from "@/data/tickers";
import { searchTickers } from "@/lib/api";
import {
  buildDataExportHref,
  buildDataPageHref,
  DATA_ASSET_CLASS_OPTIONS,
  getDataExportSchema,
  getDataProviderLabel,
  getDataSchemaColumns,
  getDefaultAssetForClass,
  getDefaultDateRange,
  getDisplayAssetName,
  MACRO_COUNTRY_OPTIONS,
  MACRO_INDICATOR_OPTIONS,
  isValidAssetSelection,
} from "@/lib/data-export";
import { getCommodityMeta, SUPPORTED_COMMODITIES } from "@/lib/commodities";
import { getCryptoMarketMeta, SUPPORTED_CRYPTO_MARKETS } from "@/lib/crypto";
import { cn } from "@/lib/utils";
import type { DataAssetClass, MacroCountry } from "@/types/api";

type SearchResult = {
  symbol: string;
  name: string;
};

type PickerOption = {
  value: string;
  label: string;
  description?: string;
  logoSrc?: string;
};

const MAX_STOCK_RESULTS = 8;

const PRESET_OPTIONS: Array<{
  label: string;
  days: number;
  assetClasses?: DataAssetClass[];
}> = [
  { label: "1M", days: 31, assetClasses: ["stock", "commodity", "crypto"] },
  { label: "3M", days: 93, assetClasses: ["stock", "commodity", "crypto"] },
  { label: "1Y", days: 365 },
  { label: "5Y", days: 365 * 5 },
];

function formatDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function buildPresetRange(days: number) {
  const endDate = new Date();
  const startDate = new Date(endDate);
  startDate.setUTCDate(startDate.getUTCDate() - days);

  return {
    startDate: formatDateInputValue(startDate),
    endDate: formatDateInputValue(endDate),
  };
}

function filterLocalStockResults(query: string): SearchResult[] {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return TICKERS.filter(
    (entry) =>
      entry.symbol.toLowerCase().startsWith(normalizedQuery) ||
      entry.name.toLowerCase().includes(normalizedQuery),
  )
    .slice(0, MAX_STOCK_RESULTS)
    .map((entry) => ({
      symbol: entry.symbol,
      name: entry.name,
    }));
}

function AssetPicker({
  value,
  onChange,
  options,
  placeholder,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: PickerOption[];
  placeholder?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const selected =
    options.find((option) => option.value === value) ?? null;

  useEffect(() => {
    if (!open) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [open]);

  return (
    <div ref={wrapperRef} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="flex h-10 w-full items-center justify-between rounded-[10px] border border-black/[0.08] bg-[#f4f8ff] px-3.5 text-left text-sm text-[#161616] transition-colors hover:bg-[#edf4ff]"
      >
        <span className="flex min-w-0 items-center gap-2.5">
          {selected?.logoSrc && (
            <Image
              src={selected.logoSrc}
              alt=""
              width={18}
              height={18}
              className="h-[18px] w-[18px] shrink-0 rounded-full"
            />
          )}
          <span className="truncate">
            {selected?.label ?? placeholder ?? "Select"}
          </span>
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 shrink-0 text-black/44 transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div className="absolute top-full left-0 z-30 mt-1.5 w-full overflow-hidden rounded-[14px] border border-black/[0.08] bg-white shadow-[0_20px_40px_-28px_rgba(0,0,0,0.16)]">
          <div className="max-h-[17.5rem] overflow-y-auto py-1.5">
            {options.map((option) => {
              const selectedOption = option.value === value;

              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  className={cn(
                    "flex w-full items-start gap-3 px-3.5 py-2.5 text-left text-sm transition-colors",
                    selectedOption
                      ? "bg-[#edf4ff] text-[#161616]"
                      : "text-black/72 hover:bg-[#f7fbff]",
                  )}
                >
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center pt-0.5">
                    {option.logoSrc ? (
                      <Image
                        src={option.logoSrc}
                        alt=""
                        width={18}
                        height={18}
                        className="h-[18px] w-[18px] rounded-full"
                      />
                    ) : selectedOption ? (
                      <Check className="h-4 w-4 text-[#1080ff]" />
                    ) : (
                      <span className="h-4 w-4 rounded-full border border-black/[0.08] bg-[#f6f9ff]" />
                    )}
                  </span>
                  <span className="min-w-0">
                    <span className="block font-medium text-[#161616]">
                      {option.label}
                    </span>
                    {option.description && (
                      <span className="mt-0.5 block text-xs leading-5 text-black/54">
                        {option.description}
                      </span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export default function DataExportTool({
  initialAssetClass,
  initialAsset,
  initialCountry,
  initialStartDate,
  initialEndDate,
  assistantReady = false,
}: {
  initialAssetClass: DataAssetClass;
  initialAsset: string;
  initialCountry: MacroCountry;
  initialStartDate: string;
  initialEndDate: string;
  assistantReady?: boolean;
}) {
  const router = useRouter();
  const initialPageHref = buildDataPageHref({
    asset_class: initialAssetClass,
    asset: initialAsset || undefined,
    country: initialAssetClass === "macro" ? initialCountry : undefined,
    start_date: initialStartDate,
    end_date: initialEndDate,
    assistant_ready: assistantReady || undefined,
  });
  const [assetClass, setAssetClass] = useState<DataAssetClass>(initialAssetClass);
  const [asset, setAsset] = useState(initialAsset);
  const [country, setCountry] = useState<MacroCountry>(initialCountry);
  const [startDate, setStartDate] = useState(initialStartDate);
  const [endDate, setEndDate] = useState(initialEndDate);
  const [stockResults, setStockResults] = useState<SearchResult[]>([]);
  const [stockQueryOpen, setStockQueryOpen] = useState(false);
  const [agentPrepared, setAgentPrepared] = useState(assistantReady);
  const [searchUnavailable, setSearchUnavailable] = useState(false);
  const [syncedPageHref, setSyncedPageHref] = useState(initialPageHref);

  if (initialPageHref !== syncedPageHref) {
    setSyncedPageHref(initialPageHref);
    setAssetClass(initialAssetClass);
    setAsset(initialAsset);
    setCountry(initialCountry);
    setStartDate(initialStartDate);
    setEndDate(initialEndDate);
    setAgentPrepared(assistantReady);
    setStockResults([]);
    setStockQueryOpen(false);
    setSearchUnavailable(false);
  }

  useEffect(() => {
    if (assetClass !== "stock") {
      return;
    }
    const query = asset.trim();
    if (!query) {
      return;
    }

    const localResults = filterLocalStockResults(query);

    if (localResults.length >= MAX_STOCK_RESULTS) {
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const results = await searchTickers(query, controller.signal);
        if (!controller.signal.aborted) {
          const localSymbols = new Set(localResults.map((result) => result.symbol));
          setStockResults(
            results
              .filter((result) => !localSymbols.has(result.symbol))
              .slice(0, MAX_STOCK_RESULTS - localResults.length),
          );
          setSearchUnavailable(false);
        }
      } catch {
        if (!controller.signal.aborted) {
          setSearchUnavailable(true);
        }
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [asset, assetClass]);

  const schema = useMemo(
    () => getDataExportSchema(assetClass, asset),
    [asset, assetClass],
  );
  const providerLabel = useMemo(
    () => getDataProviderLabel(assetClass, asset),
    [asset, assetClass],
  );
  const columns = useMemo(() => getDataSchemaColumns(schema), [schema]);
  const formValid = isValidAssetSelection(assetClass, asset, country) && startDate && endDate;
  const pageHref = buildDataPageHref({
    asset_class: assetClass,
    asset: asset || undefined,
    country: assetClass === "macro" ? country : undefined,
    start_date: startDate,
    end_date: endDate,
    assistant_ready: agentPrepared || undefined,
  });
  const hasPendingChanges = pageHref !== initialPageHref;
  const exportHref = formValid
    ? buildDataExportHref({
        asset_class: assetClass,
        asset,
        country: assetClass === "macro" ? country : undefined,
        start_date: startDate,
        end_date: endDate,
      })
    : "";

  function applyAssetClass(next: DataAssetClass) {
    const defaults = getDefaultDateRange(next);
    setAgentPrepared(false);
    setAssetClass(next);
    setAsset(getDefaultAssetForClass(next));
    setCountry("us");
    setStartDate(defaults.startDate);
    setEndDate(defaults.endDate);
    setStockResults([]);
    setStockQueryOpen(false);
    setSearchUnavailable(false);
  }

  const displayName = formValid
    ? getDisplayAssetName(assetClass, asset, country)
    : "Select an asset";
  const visibleStockResults = useMemo(() => {
    if (assetClass !== "stock" || !asset.trim()) {
      return [];
    }

    const localResults = filterLocalStockResults(asset);
    const localSymbols = new Set(localResults.map((result) => result.symbol));
    return [
      ...localResults,
      ...stockResults
        .filter((result) => !localSymbols.has(result.symbol))
        .slice(0, MAX_STOCK_RESULTS - localResults.length),
    ];
  }, [asset, assetClass, stockResults]);
  const showStockResults = stockQueryOpen && visibleStockResults.length > 0;
  const commodityOptions: PickerOption[] = SUPPORTED_COMMODITIES.map((item) => ({
    value: item.instrument,
    label: item.name,
    description: item.category,
    logoSrc: getCommodityMeta(item.instrument).logoSrc,
  }));
  const cryptoOptions: PickerOption[] = SUPPORTED_CRYPTO_MARKETS.map((item) => ({
    value: item.instrument,
    label: `${item.symbol} · ${item.name}`,
    description: item.detailLabel,
    logoSrc: getCryptoMarketMeta(item.instrument).logoSrc,
  }));
  const macroCountryOptions: PickerOption[] = MACRO_COUNTRY_OPTIONS.map((item) => ({
    value: item.value,
    label: item.label,
  }));
  const macroIndicatorOptions: PickerOption[] = MACRO_INDICATOR_OPTIONS.map((item) => ({
    value: item.value,
    label: item.label,
  }));

  function applyDraftToUrl() {
    startTransition(() => {
      router.replace(pageHref, { scroll: false });
    });
  }

  return (
    <Card className="flex h-full flex-col rounded-[16px] border border-black/[0.08] bg-white shadow-[0_24px_48px_-38px_rgba(0,0,0,0.08)]">
      <CardHeader className="space-y-2 border-b border-black/[0.06]">
        <CardTitle className="text-[1.5rem] font-medium tracking-tight text-[#161616]">
          Get the data
        </CardTitle>
        <p className="max-w-[60ch] text-sm leading-6 font-light text-black/66">
          Export raw CSV series for one asset at a time. This tool is built for clean downstream analysis, not report formatting.
        </p>
      </CardHeader>
      <CardContent className="flex min-h-0 flex-1 flex-col gap-5 pt-6">
        <div className="flex-1">
          <div className="space-y-6">
            <div className="space-y-3">
            <p className="text-sm font-medium text-[#161616]">Asset class</p>
            <div className="flex flex-wrap gap-2">
              {DATA_ASSET_CLASS_OPTIONS.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => applyAssetClass(option.value)}
                  className={`inline-flex h-9 items-center justify-center rounded-[10px] px-3.5 text-sm transition-colors ${
                    assetClass === option.value
                      ? "bg-[#1080ff] text-white"
                      : "border border-black/[0.08] bg-white text-black/62 hover:bg-[#f4f8ff] hover:text-[#161616]"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <div className="space-y-3">
                <p className="text-sm font-medium text-[#161616]">Asset</p>
                {assetClass === "stock" ? (
                  <div className="relative space-y-2">
                    <input
                      type="text"
                      value={asset}
                      onChange={(event) => {
                        const nextValue = event.target.value.toUpperCase();
                        setAgentPrepared(false);
                        setAsset(nextValue);
                        setStockResults([]);
                        if (!nextValue.trim()) {
                          setStockQueryOpen(false);
                        }
                        setStockQueryOpen(Boolean(nextValue.trim()));
                        setSearchUnavailable(false);
                      }}
                      onFocus={() => {
                        if (stockResults.length > 0) {
                          setStockQueryOpen(true);
                        }
                      }}
                      onBlur={() => {
                        window.setTimeout(() => setStockQueryOpen(false), 120);
                      }}
                      placeholder="Ticker symbol (AAPL, NVDA, BRK.B)"
                      className="h-10 w-full rounded-[10px] border border-black/[0.08] bg-[#f4f8ff] px-3.5 text-sm text-[#161616] outline-none transition-colors placeholder:text-black/36 focus-visible:border-[#1080ff] focus-visible:ring-3 focus-visible:ring-[#1080ff]/20"
                    />
                    {showStockResults && (
                      <ul className="absolute top-full left-0 z-20 mt-1.5 max-h-64 w-full overflow-y-auto rounded-[14px] border border-black/[0.08] bg-white shadow-lg">
                        {visibleStockResults.map((result) => (
                          <li key={result.symbol}>
                            <button
                              type="button"
                              onMouseDown={(event) => {
                                event.preventDefault();
                                setAgentPrepared(false);
                                setAsset(result.symbol.toUpperCase());
                                setStockQueryOpen(false);
                              }}
                              className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm transition-colors hover:bg-[#f6f9ff]"
                            >
                              <span className="font-medium text-[#161616]">
                                {result.symbol}
                              </span>
                              <span className="truncate text-black/54">
                                {result.name}
                              </span>
                            </button>
                          </li>
                        ))}
                      </ul>
                    )}
                    {searchUnavailable ? (
                      <p className="text-xs text-black/52">
                        Remote search is temporarily unavailable. Showing local matches only.
                      </p>
                    ) : null}
                  </div>
                ) : assetClass === "macro" ? (
                  <div className="space-y-3">
                    <AssetPicker
                      value={country}
                      onChange={(nextValue) => {
                        setAgentPrepared(false);
                        setCountry(nextValue as MacroCountry);
                      }}
                      options={macroCountryOptions}
                    />
                    <AssetPicker
                      value={asset}
                      onChange={(nextValue) => {
                        setAgentPrepared(false);
                        setAsset(nextValue);
                      }}
                      options={macroIndicatorOptions}
                    />
                  </div>
                ) : assetClass === "commodity" ? (
                  <AssetPicker
                    value={asset}
                    onChange={(nextValue) => {
                      setAgentPrepared(false);
                      setAsset(nextValue);
                    }}
                    options={commodityOptions}
                  />
                ) : (
                  <AssetPicker
                    value={asset}
                    onChange={(nextValue) => {
                      setAgentPrepared(false);
                      setAsset(nextValue);
                    }}
                    options={cryptoOptions}
                  />
                )}
              </div>

              <div className="space-y-3">
                <p className="text-sm font-medium text-[#161616]">Dates</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <input
                    type="date"
                    value={startDate}
                    onChange={(event) => {
                      setAgentPrepared(false);
                      setStartDate(event.target.value);
                    }}
                    className="h-10 rounded-[10px] border border-black/[0.08] bg-[#f4f8ff] px-3.5 text-sm text-[#161616] outline-none"
                  />
                  <input
                    type="date"
                    value={endDate}
                    onChange={(event) => {
                      setAgentPrepared(false);
                      setEndDate(event.target.value);
                    }}
                    className="h-10 rounded-[10px] border border-black/[0.08] bg-[#f4f8ff] px-3.5 text-sm text-[#161616] outline-none"
                  />
                </div>
                <div className="flex flex-wrap gap-2">
                  {PRESET_OPTIONS.filter(
                    (preset) =>
                      !preset.assetClasses ||
                      preset.assetClasses.includes(assetClass),
                  ).map((preset) => (
                    <button
                      key={`${assetClass}-${preset.label}`}
                      type="button"
                      onClick={() => {
                        const range = buildPresetRange(preset.days);
                        setAgentPrepared(false);
                        setStartDate(range.startDate);
                        setEndDate(range.endDate);
                      }}
                      className="inline-flex h-8 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white px-3 text-xs text-black/62 transition-colors hover:bg-[#f4f8ff] hover:text-[#161616]"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid items-stretch gap-4 lg:grid-cols-2">
              <Card className="h-full rounded-[14px] border border-black/[0.08] bg-[#fbfdff] shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-[#161616]">
                    <FileText className="h-4 w-4" />
                    CSV schema
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex h-full flex-col space-y-2 text-sm text-black/64">
                  <p>
                    <span className="font-medium text-[#161616]">Asset</span>: {displayName}
                  </p>
                  <p>
                    <span className="font-medium text-[#161616]">Columns</span>: {columns.join(", ")}
                  </p>
                  <p>
                    <span className="font-medium text-[#161616]">Provider</span>: {providerLabel}
                  </p>
                </CardContent>
              </Card>

              <Card className="h-full rounded-[14px] border border-black/[0.08] bg-[#fbfdff] shadow-none">
                <CardHeader className="pb-2">
                  <CardTitle className="flex items-center gap-2 text-base text-[#161616]">
                    <Database className="h-4 w-4" />
                    Export notes
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex h-full flex-col space-y-2 text-sm font-light text-black/64">
                  <p>One asset per file.</p>
                  <p>Structured numeric series only.</p>
                  <p>No filings, news, or report text in v1.</p>
                  <p>Large exports are capped for predictable Vercel execution.</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>

        <div className="shrink-0 border-t border-black/[0.06] pt-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-h-[40px] min-w-0 flex-1">
              {agentPrepared && formValid ? (
                <div className="inline-flex max-w-full items-center gap-2 rounded-[12px] border border-[#1080ff]/18 bg-[#f4f8ff] px-3 py-2 text-xs text-black/70">
                  <Sparkles className="h-4 w-4 shrink-0 text-[#1080ff]" />
                  <span className="truncate whitespace-nowrap">
                    Prepared by Alpha. Click Download CSV.
                  </span>
                </div>
              ) : (
                <div className="h-[40px]" />
              )}
            </div>
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                onClick={applyDraftToUrl}
                disabled={!hasPendingChanges}
                className={cn(
                  "inline-flex h-10 items-center justify-center rounded-[10px] border border-black/[0.08] bg-white px-4 text-sm text-[#161616] transition-colors hover:bg-[#f4f8ff]",
                  !hasPendingChanges && "pointer-events-none opacity-50",
                )}
              >
                Apply
              </button>
              {formValid ? (
                <a
                  href={exportHref}
                  onClick={() =>
                    sendGAEvent("event", "download_clicked", { format: "csv" })
                  }
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#1080ff] px-5 text-sm font-medium text-white transition-colors hover:bg-[#006fe6]",
                    agentPrepared &&
                      "ring-4 ring-[#1080ff]/18 shadow-[0_0_0_1px_rgba(16,128,255,0.12),0_0_0_12px_rgba(16,128,255,0.08),0_18px_38px_-24px_rgba(16,128,255,0.45)] animate-[pulse_2s_ease-in-out_infinite]",
                  )}
                >
                  <Download className="h-4 w-4" />
                  Download CSV
                </a>
              ) : (
                <span className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] bg-[#1080ff] px-5 text-sm font-medium text-white opacity-50">
                  <Download className="h-4 w-4" />
                  Download CSV
                </span>
              )}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
