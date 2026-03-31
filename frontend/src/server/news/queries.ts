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
const RATES_CONTEXT_PATTERN =
  /\b(rate|rates|yield|yields|treasury|bond|bonds|fed|central bank|monetary)\b/i;
const MACRO_CONTEXT_PATTERN =
  /\b(macro|inflation|cpi|gdp|growth|economy|economic|recession|jobs|jobless|payrolls|unemployment|consumer|spending)\b/i;
const RISK_CONTEXT_PATTERN =
  /\b(risk|risks|risk sentiment|risk-off|risk on|volatility|fear|selloff|stress|safe haven|uncertainty)\b/i;
const MARKET_CONTEXT_PATTERN =
  /\b(global|world|markets?|wall street|backdrop|broader market|market context|world market|market headline|market news)\b/i;

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

export function normalizeContextNewsQuery(query: string): string {
  if (GEOPOLITICAL_CONTEXT_PATTERN.test(query)) {
    return "geopolitics";
  }

  if (RATES_CONTEXT_PATTERN.test(query)) {
    return "rates";
  }

  if (MACRO_CONTEXT_PATTERN.test(query)) {
    return "macro";
  }

  if (RISK_CONTEXT_PATTERN.test(query)) {
    return "risk";
  }

  if (MARKET_CONTEXT_PATTERN.test(query)) {
    return "markets";
  }

  return "markets";
}

export function getContextNewsQueryFromPrompt(query: string): string {
  return normalizeContextNewsQuery(query);
}

export function getDefaultContextNewsQuery(): string {
  return "markets";
}
