import { getCommodityMeta } from "@/lib/commodities";
import { getCryptoMarketMeta } from "@/lib/crypto";
import type {
  CommodityInstrumentSlug,
  CryptoInstrument,
  MacroCountry,
  MacroIndicatorSlug,
} from "@/types/api";

const GEOPOLITICAL_CONTEXT_PATTERN =
  /\b(geopolitic|geopolitical|tariff|tariffs|trade war|trade tension|war|wars|conflict|conflicts|sanction|sanctions|election|elections|middle east)\b/i;

function getMacroCountryLabel(country: MacroCountry): string {
  return country === "fr" ? "France" : "United States";
}

export function getFocusedNewsQueryForStock(ticker: string): string {
  return ticker.trim().toUpperCase();
}

export function getFocusedNewsQueryForCommodity(
  instrument: CommodityInstrumentSlug,
): string {
  return getCommodityMeta(instrument).name;
}

export function getFocusedNewsQueryForCrypto(
  instrument: CryptoInstrument,
): string {
  return getCryptoMarketMeta(instrument).name;
}

export function getFocusedNewsQueryForMacro(
  country: MacroCountry,
  indicator?: MacroIndicatorSlug,
): string {
  const countryLabel = getMacroCountryLabel(country);

  switch (indicator) {
    case "cpi":
      return `${countryLabel} inflation`;
    case "fed-funds":
      return `${countryLabel} interest rates`;
    case "gdp-growth":
      return `${countryLabel} economy`;
    case "treasury-10y":
      return `${countryLabel} bond yields`;
    case "unemployment":
      return `${countryLabel} unemployment`;
    default:
      return `${countryLabel} economy`;
  }
}

export function getContextNewsQueryFromPrompt(query: string): string {
  return GEOPOLITICAL_CONTEXT_PATTERN.test(query) ? "geopolitics" : "markets";
}

export function getDefaultContextNewsQuery(): string {
  return "markets";
}
