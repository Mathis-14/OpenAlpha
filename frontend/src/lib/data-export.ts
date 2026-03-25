import {
  getCommodityMeta,
  SUPPORTED_COMMODITIES,
} from "@/lib/commodities";
import { SUPPORTED_CRYPTO_MARKETS } from "@/lib/crypto";
import type {
  CommodityInstrumentSlug,
  DataAssetClass,
  DataExportQuery,
  DataExportSchema,
  MacroCountry,
  MacroIndicatorSlug,
} from "@/types/api";

type DataPageQuery = Partial<DataExportQuery> & {
  assistant_ready?: boolean;
};

export const DATA_ASSET_CLASS_OPTIONS: Array<{
  value: DataAssetClass;
  label: string;
}> = [
  { value: "stock", label: "Stocks" },
  { value: "commodity", label: "Commodities" },
  { value: "macro", label: "Macro" },
  { value: "crypto", label: "Crypto" },
];

export const MACRO_COUNTRY_OPTIONS: Array<{
  value: MacroCountry;
  label: string;
}> = [
  { value: "us", label: "United States" },
  { value: "fr", label: "France" },
];

export const MACRO_INDICATOR_OPTIONS: Array<{
  value: MacroIndicatorSlug;
  label: string;
}> = [
  { value: "fed-funds", label: "Fed funds" },
  { value: "cpi", label: "CPI" },
  { value: "gdp-growth", label: "GDP growth" },
  { value: "treasury-10y", label: "10Y Treasury" },
  { value: "unemployment", label: "Unemployment" },
];

export const DEFAULT_DATA_ASSETS: Record<DataAssetClass, string> = {
  stock: "",
  commodity: "gold",
  macro: "fed-funds",
  crypto: "BTC-PERPETUAL",
};

export function formatDateInputValue(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function getDefaultDateRange(assetClass: DataAssetClass): {
  startDate: string;
  endDate: string;
} {
  const end = new Date();
  const start = new Date(end);

  if (assetClass === "macro") {
    start.setUTCDate(start.getUTCDate() - 365 * 5);
  } else {
    start.setUTCDate(start.getUTCDate() - 365);
  }

  return {
    startDate: formatDateInputValue(start),
    endDate: formatDateInputValue(end),
  };
}

export function isDataAssetClass(value: string): value is DataAssetClass {
  return (
    value === "stock" ||
    value === "commodity" ||
    value === "macro" ||
    value === "crypto"
  );
}

export function getDataExportSchema(
  assetClass: DataAssetClass,
  asset?: string,
): DataExportSchema {
  if (assetClass === "macro") {
    return "series";
  }

  if (assetClass === "commodity" && asset) {
    try {
      return getCommodityMeta(asset as CommodityInstrumentSlug).source.kind === "fred"
        ? "series"
        : "ohlcv";
    } catch {
      return "ohlcv";
    }
  }

  return "ohlcv";
}

export function getDataSchemaColumns(
  schema: DataExportSchema,
): string[] {
  return schema === "series"
    ? ["date", "value"]
    : ["date", "open", "high", "low", "close", "volume"];
}

export function getDataProviderLabel(
  assetClass: DataAssetClass,
  asset?: string,
): string {
  switch (assetClass) {
    case "stock":
      return "Yahoo Finance · daily OHLCV";
    case "crypto":
      return "Deribit public API · daily OHLCV";
    case "macro":
      return "FRED · native series frequency";
    case "commodity":
      if (!asset) {
        return "Commodity provider";
      }
      try {
        const meta = getCommodityMeta(asset as CommodityInstrumentSlug);
        return meta.source.kind === "fred"
          ? `${meta.source_label} · native series frequency`
          : `${meta.source_label} · daily OHLCV`;
      } catch {
        return "Commodity provider";
      }
  }
}

export function buildDataPageHref(query: DataPageQuery): string {
  const params = new URLSearchParams();
  if (query.asset_class) params.set("asset_class", query.asset_class);
  if (query.asset) params.set("asset", query.asset);
  if (query.country) params.set("country", query.country);
  if (query.start_date) params.set("start_date", query.start_date);
  if (query.end_date) params.set("end_date", query.end_date);
  if (query.assistant_ready) params.set("assistant_ready", "1");

  const search = params.toString();
  return search ? `/data?${search}` : "/data";
}

export function buildDataExportHref(query: Partial<DataExportQuery>): string {
  const params = new URLSearchParams();
  if (query.asset_class) params.set("asset_class", query.asset_class);
  if (query.asset) params.set("asset", query.asset);
  if (query.country) params.set("country", query.country);
  if (query.start_date) params.set("start_date", query.start_date);
  if (query.end_date) params.set("end_date", query.end_date);

  const search = params.toString();
  return search ? `/api/data/export?${search}` : "/api/data/export";
}

export function getDefaultAssetForClass(assetClass: DataAssetClass): string {
  return DEFAULT_DATA_ASSETS[assetClass];
}

export function isValidAssetSelection(
  assetClass: DataAssetClass,
  asset: string,
  country: MacroCountry,
): boolean {
  const normalized = asset.trim();

  if (!normalized) {
    return false;
  }

  switch (assetClass) {
    case "stock":
      return /^[A-Z0-9]{1,8}([.-][A-Z0-9]{1,4})?$/i.test(normalized);
    case "commodity":
      return SUPPORTED_COMMODITIES.some((item) => item.instrument === normalized);
    case "crypto":
      return SUPPORTED_CRYPTO_MARKETS.some(
        (item) => item.instrument === normalized,
      );
    case "macro":
      return (
        MACRO_COUNTRY_OPTIONS.some((item) => item.value === country) &&
        MACRO_INDICATOR_OPTIONS.some((item) => item.value === normalized)
      );
  }
}

export function getDisplayAssetName(
  assetClass: DataAssetClass,
  asset: string,
  country?: MacroCountry,
): string {
  switch (assetClass) {
    case "stock":
      return asset.toUpperCase();
    case "commodity":
      return getCommodityMeta(asset as CommodityInstrumentSlug).name;
    case "crypto":
      return (
        SUPPORTED_CRYPTO_MARKETS.find((item) => item.instrument === asset)?.symbol ??
        asset
      );
    case "macro": {
      const indicatorLabel =
        MACRO_INDICATOR_OPTIONS.find((item) => item.value === asset)?.label ?? asset;
      return `${country === "fr" ? "France" : "U.S."} ${indicatorLabel}`;
    }
  }
}
