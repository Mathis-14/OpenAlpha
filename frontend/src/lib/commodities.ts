import type {
  CommodityCategory,
  CommodityDiscoveryItem,
  CommodityInstrumentSlug,
} from "@/types/api";

type YahooSource = {
  kind: "yahoo";
  symbol: string;
};

type FredSource = {
  kind: "fred";
  seriesId: string;
};

export type CommodityMeta = CommodityDiscoveryItem & {
  logoSrc?: string;
  source: YahooSource | FredSource;
};

const COMMODITY_REGISTRY: Record<CommodityInstrumentSlug, CommodityMeta> = {
  gold: {
    instrument: "gold",
    short_label: "Gold",
    name: "Gold",
    description: "Track COMEX gold futures for the benchmark precious-metal price.",
    category: "metals",
    unit_label: "USD per troy ounce",
    exchange_label: "COMEX futures",
    source_label: "Yahoo Finance futures · benchmark context from FRED / market references",
    logoSrc: "/gold.svg",
    source: { kind: "yahoo", symbol: "GC=F" },
  },
  silver: {
    instrument: "silver",
    short_label: "Silver",
    name: "Silver",
    description: "Track COMEX silver futures for benchmark precious-metal pricing.",
    category: "metals",
    unit_label: "USD per troy ounce",
    exchange_label: "COMEX futures",
    source_label: "Yahoo Finance futures · benchmark context from FRED / market references",
    logoSrc: "/silver.svg",
    source: { kind: "yahoo", symbol: "SI=F" },
  },
  wti: {
    instrument: "wti",
    short_label: "WTI Crude Oil",
    name: "WTI Crude Oil",
    description: "Track NYMEX WTI crude futures for the core U.S. oil benchmark.",
    category: "energy",
    unit_label: "USD per barrel",
    exchange_label: "NYMEX futures",
    source_label: "Yahoo Finance futures · benchmark context from EIA / FRED",
    logoSrc: "/oil.svg",
    source: { kind: "yahoo", symbol: "CL=F" },
  },
  brent: {
    instrument: "brent",
    short_label: "Brent Crude Oil",
    name: "Brent Crude Oil",
    description: "Track ICE Brent crude futures for the global oil benchmark.",
    category: "energy",
    unit_label: "USD per barrel",
    exchange_label: "ICE futures",
    source_label: "Yahoo Finance futures · benchmark context from EIA / FRED",
    logoSrc: "/oil.svg",
    source: { kind: "yahoo", symbol: "BZ=F" },
  },
  "natural-gas": {
    instrument: "natural-gas",
    short_label: "Natural Gas",
    name: "Natural Gas",
    description: "Track Henry Hub natural-gas futures for the core U.S. gas benchmark.",
    category: "energy",
    unit_label: "USD per MMBtu",
    exchange_label: "NYMEX futures",
    source_label: "Yahoo Finance futures · benchmark context from EIA / FRED",
    logoSrc: "/natural_gas.svg",
    source: { kind: "yahoo", symbol: "NG=F" },
  },
  copper: {
    instrument: "copper",
    short_label: "Copper",
    name: "Copper",
    description: "Track COMEX copper futures for industrial metal pricing.",
    category: "metals",
    unit_label: "USD per pound",
    exchange_label: "COMEX futures",
    source_label: "Yahoo Finance futures · benchmark context from FRED / market references",
    logoSrc: "/copper.svg",
    source: { kind: "yahoo", symbol: "HG=F" },
  },
  gasoline: {
    instrument: "gasoline",
    short_label: "Gasoline",
    name: "Gasoline",
    description: "Track RBOB gasoline futures for refined-fuel pricing and retail fuel context.",
    category: "energy",
    unit_label: "USD per gallon",
    exchange_label: "NYMEX futures",
    source_label: "Yahoo Finance futures · benchmark context from EIA / FRED",
    logoSrc: "/gasoline.svg",
    source: { kind: "yahoo", symbol: "RB=F" },
  },
  aluminum: {
    instrument: "aluminum",
    short_label: "Aluminum",
    name: "Aluminum",
    description: "Track the global aluminum benchmark series for industrial metals pricing.",
    category: "metals",
    unit_label: "USD per metric ton",
    exchange_label: "Global benchmark",
    source_label: "FRED / IMF benchmark series",
    logoSrc: "/aluminum.svg",
    source: { kind: "fred", seriesId: "PALUMUSDM" },
  },
  wheat: {
    instrument: "wheat",
    short_label: "Wheat",
    name: "Wheat",
    description: "Track CBOT wheat futures for benchmark grain pricing.",
    category: "agriculture",
    unit_label: "US cents per bushel",
    exchange_label: "CBOT futures",
    source_label: "Yahoo Finance futures · benchmark context from FRED / IMF",
    logoSrc: "/wheat.svg",
    source: { kind: "yahoo", symbol: "ZW=F" },
  },
  coffee: {
    instrument: "coffee",
    short_label: "Coffee",
    name: "Coffee",
    description: "Track ICE coffee futures for benchmark soft-commodity pricing.",
    category: "agriculture",
    unit_label: "US cents per pound",
    exchange_label: "ICE futures",
    source_label: "Yahoo Finance futures · benchmark context from FRED / IMF",
    logoSrc: "/coffee.svg",
    source: { kind: "yahoo", symbol: "KC=F" },
  },
  cocoa: {
    instrument: "cocoa",
    short_label: "Cocoa",
    name: "Cocoa",
    description: "Track ICE cocoa futures for benchmark cocoa pricing.",
    category: "agriculture",
    unit_label: "USD per metric ton",
    exchange_label: "ICE futures",
    source_label: "Yahoo Finance futures · benchmark context from FRED / IMF",
    logoSrc: "/cocoa.svg",
    source: { kind: "yahoo", symbol: "CC=F" },
  },
  "heating-oil": {
    instrument: "heating-oil",
    short_label: "Heating Oil",
    name: "Heating Oil",
    description: "Track refined distillate pricing through benchmark heating-oil market data.",
    category: "energy",
    unit_label: "USD per gallon",
    exchange_label: "NYMEX futures",
    source_label: "Yahoo Finance futures · benchmark context from EIA / FRED",
    logoSrc: "/heating_oil.svg",
    source: { kind: "yahoo", symbol: "HO=F" },
  },
  propane: {
    instrument: "propane",
    short_label: "Propane",
    name: "Propane",
    description: "Track Mont Belvieu propane benchmark pricing for U.S. propane markets.",
    category: "energy",
    unit_label: "USD per gallon",
    exchange_label: "U.S. benchmark",
    source_label: "FRED / EIA benchmark series",
    logoSrc: "/propane.svg",
    source: { kind: "fred", seriesId: "DPROPANEMBTX" },
  },
  coal: {
    instrument: "coal",
    short_label: "Coal",
    name: "Coal",
    description: "Track Australian coal benchmark pricing for global coal markets.",
    category: "energy",
    unit_label: "USD per metric ton",
    exchange_label: "Global benchmark",
    source_label: "FRED / IMF benchmark series",
    logoSrc: "/coal.svg",
    source: { kind: "fred", seriesId: "PCOALAUUSDM" },
  },
  uranium: {
    instrument: "uranium",
    short_label: "Uranium",
    name: "Uranium",
    description: "Track the uranium benchmark price series for nuclear fuel markets.",
    category: "energy",
    unit_label: "USD per pound",
    exchange_label: "Global benchmark",
    source_label: "FRED / IMF benchmark series",
    logoSrc: "/uranium.svg",
    source: { kind: "fred", seriesId: "PURANUSDM" },
  },
  "all-commodities-index": {
    instrument: "all-commodities-index",
    short_label: "All Commodities Index",
    name: "All Commodities Index",
    description: "Track the broad all-commodities benchmark index across energy, metals, and agriculture.",
    category: "index",
    unit_label: "Index level",
    exchange_label: "Global benchmark",
    source_label: "FRED / IMF benchmark series",
    logoSrc: "/all_commodities_index.svg",
    source: { kind: "fred", seriesId: "PALLFNFINDEXM" },
  },
};

export const SUPPORTED_COMMODITIES = Object.values(COMMODITY_REGISTRY);

export function getCommodityMeta(instrument: CommodityInstrumentSlug): CommodityMeta {
  return COMMODITY_REGISTRY[instrument];
}

export function isCommodityInstrument(
  value: string,
): value is CommodityInstrumentSlug {
  return value in COMMODITY_REGISTRY;
}

export function getCommodityCategoryLabel(category: CommodityCategory): string {
  switch (category) {
    case "energy":
      return "Energy";
    case "metals":
      return "Metals";
    case "agriculture":
      return "Agriculture";
    default:
      return "Index";
  }
}

export function getCommoditySourceId(instrument: CommodityInstrumentSlug): string {
  const source = getCommodityMeta(instrument).source;
  return source.kind === "yahoo" ? source.symbol : source.seriesId;
}
