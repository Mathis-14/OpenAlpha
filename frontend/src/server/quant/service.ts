import YahooFinance from "yahoo-finance2";
import type {
  QuantGreeksActiveTenor,
  QuantGreeksAnchorContract,
  QuantGreeksResult,
  QuantOptionChain,
  QuantOptionContract,
  QuantOptionExpiration,
  QuantGreeksTermNode,
  QuantOptionType,
  QuantPayoffLeg,
  QuantPayoffResult,
  QuantSurfaceResult,
  QuantYieldCurveResult,
} from "@/types/api";
import { ServiceError } from "@/server/shared/errors";
import { normalizeDashboardSymbol, toProviderSymbol } from "@/server/market/symbols";
import { getDividendYield } from "@/server/market/service";
import { fetchJson } from "@/server/shared/http";
import { deriveActiveTenor, interpolateLinearly } from "@/lib/quant/greeks-context";
import { computeBlackScholes } from "@/server/quant/black-scholes";
import {
  getTreasuryCurve,
  resolveTreasuryRateForPricing,
  type TreasuryCurve,
  type TreasuryRateResolution,
} from "@/server/quant/rates";
import { buildArbitrageFreeSurface } from "@/server/quant/ssvi";

const yahooFinance = new YahooFinance({
  suppressNotices: ["yahooSurvey"],
});

const QUANT_TIMEOUT_MS = 12_000;
const FALLBACK_RISK_FREE_RATE = 0.04;

type YahooOptionsResult = {
  underlyingSymbol?: string;
  expirationDates?: Date[];
  quote?: {
    shortName?: string;
    longName?: string;
    currency?: string;
    fullExchangeName?: string;
    exchange?: string;
    regularMarketPrice?: number | null;
    regularMarketPreviousClose?: number | null;
    regularMarketTime?: Date | string | number | null;
  };
  options?: Array<{
    expirationDate?: Date;
    calls?: Array<YahooContract | DirectYahooContract>;
    puts?: Array<YahooContract | DirectYahooContract>;
  }>;
};

type YahooContract = {
  contractSymbol?: string;
  strike?: number;
  currency?: string;
  lastPrice?: number;
  change?: number;
  percentChange?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  contractSize?: "REGULAR";
  expiration?: Date;
  lastTradeDate?: Date;
  impliedVolatility?: number;
  inTheMoney?: boolean;
};

type DirectYahooOptionsResponse = {
  optionChain?: {
    result?: Array<{
      expirationDates?: number[];
      quote?: YahooOptionsResult["quote"];
      options?: Array<{
        expirationDate?: number;
        calls?: DirectYahooContract[];
        puts?: DirectYahooContract[];
      }>;
    }>;
  };
};

type DirectYahooContract = {
  contractSymbol?: string;
  strike?: number;
  currency?: string;
  lastPrice?: number;
  volume?: number;
  openInterest?: number;
  bid?: number;
  ask?: number;
  expiration?: number;
  lastTradeDate?: number;
  impliedVolatility?: number;
  inTheMoney?: boolean;
};

export type QuantGreeksInput = {
  symbol?: string;
  option_type?: QuantOptionType;
  strike?: number;
  expiration?: string;
  spot_price?: number;
  volatility?: number;
  risk_free_rate?: number;
  days_to_expiry?: number;
  time_to_expiry_years?: number;
};

type NormalizedGreeksInputs = {
  symbol?: string;
  expiration?: string;
  optionType: QuantOptionType;
  strike: number;
  spotPrice: number;
  volatility: number;
  riskFreeRate: number;
  dividendYield: number;
  timeToExpiryYears: number;
  activeTenor: QuantGreeksActiveTenor;
  maturityNodes: QuantGreeksTermNode[];
  maturityRangeDays?: {
    min: number;
    max: number;
  };
  assumptions: string[];
};

type StrikeAnchorResult = {
  volatility: number;
  anchor: QuantGreeksAnchorContract;
};

type ResolvedGreeksTermNode = QuantGreeksTermNode & {
  risk_free_rate_resolution: TreasuryRateResolution | undefined;
};

const DEFAULT_GREEKS_TARGET_DAYS = 30;

function asNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function formatDate(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function toIsoTimestamp(value: Date | string | number | null | undefined): string | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }

  if (typeof value === "number") {
    const date = new Date(value * (value > 1e12 ? 1 : 1000));
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }

  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function toExpirationDate(value: string | Date | number | null | undefined): Date | null {
  if (value == null) {
    return null;
  }

  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value : null;
  }

  if (typeof value === "number") {
    const date = new Date(value * 1000);
    return Number.isFinite(date.getTime()) ? date : null;
  }

  const date = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(date.getTime()) ? date : null;
}

function yearsToExpiry(date: Date): number {
  const diffMs = date.getTime() - Date.now();
  return Math.max(diffMs / (365.25 * 24 * 60 * 60 * 1000), 1 / 365.25);
}

function daysToExpiry(date: Date): number {
  return Math.max(
    1,
    Math.round((date.getTime() - Date.now()) / (24 * 60 * 60 * 1000)),
  );
}

function midpointFromBidAsk(bid: number | null, ask: number | null): number | null {
  if (bid != null && ask != null && bid > 0 && ask > 0) {
    return Number(((bid + ask) / 2).toFixed(4));
  }

  if (bid != null && bid > 0) {
    return bid;
  }

  if (ask != null && ask > 0) {
    return ask;
  }

  return null;
}

function mapProviderError(error: unknown, symbol: string): ServiceError {
  const message = error instanceof Error ? error.message : String(error);
  const normalized = message.toLowerCase();

  if (
    normalized.includes("no data") ||
    normalized.includes("not found") ||
    normalized.includes("delisted") ||
    normalized.includes("404")
  ) {
    return new ServiceError(404, {
      error: "invalid_ticker",
      ticker: symbol,
      detail: `No options data found for ${symbol}.`,
    });
  }

  return new ServiceError(503, {
    error: "upstream_unavailable",
    provider: "yfinance",
    ticker: symbol,
    detail: message,
  });
}

function mapContract(
  contract: YahooContract | DirectYahooContract,
  optionType: QuantOptionType,
  expiration: Date,
): QuantOptionContract | null {
  const strike = asNumber(contract.strike);
  if (strike == null) {
    return null;
  }

  const bid = asNumber(contract.bid);
  const ask = asNumber(contract.ask);
  const lastPrice = asNumber(contract.lastPrice);
  const midpoint = midpointFromBidAsk(bid, ask) ?? lastPrice;

  return {
    contract_symbol: String(contract.contractSymbol ?? "").trim() || `${optionType}-${strike}`,
    option_type: optionType,
    strike,
    expiration: formatDate(expiration),
    last_price: lastPrice,
    bid,
    ask,
    midpoint,
    implied_volatility: asNumber(contract.impliedVolatility),
    volume: asNumber(contract.volume),
    open_interest: asNumber(contract.openInterest),
    in_the_money: Boolean(contract.inTheMoney),
    last_trade_date: toIsoTimestamp(contract.lastTradeDate),
  };
}

function mapExpiration(entry: {
  expirationDate?: Date;
  calls?: Array<YahooContract | DirectYahooContract>;
  puts?: Array<YahooContract | DirectYahooContract>;
}): QuantOptionExpiration | null {
  const expiration = entry.expirationDate;
  if (!(expiration instanceof Date) || !Number.isFinite(expiration.getTime())) {
    return null;
  }

  const calls = (entry.calls ?? [])
    .map((contract) => mapContract(contract, "call", expiration))
    .filter((contract): contract is QuantOptionContract => contract != null)
    .sort((left, right) => left.strike - right.strike);
  const puts = (entry.puts ?? [])
    .map((contract) => mapContract(contract, "put", expiration))
    .filter((contract): contract is QuantOptionContract => contract != null)
    .sort((left, right) => left.strike - right.strike);

  return {
    expiration: formatDate(expiration),
    days_to_expiry: daysToExpiry(expiration),
    time_to_expiry_years: Number(yearsToExpiry(expiration).toFixed(6)),
    calls,
    puts,
  };
}

function mapDirectResult(payload: DirectYahooOptionsResponse): YahooOptionsResult {
  const result = payload.optionChain?.result?.[0];
  if (!result) {
    throw new Error("Unexpected direct Yahoo options response");
  }

  return {
    underlyingSymbol: result.quote?.shortName ?? undefined,
    expirationDates: (result.expirationDates ?? [])
      .map((value) => toExpirationDate(value))
      .filter((value): value is Date => value != null),
    quote: result.quote,
    options: (result.options ?? []).map((entry) => ({
      expirationDate: toExpirationDate(entry.expirationDate) ?? undefined,
      calls: entry.calls,
      puts: entry.puts,
    })),
  };
}

async function fetchDirectYahooOptions(
  symbol: string,
  expiration?: Date,
): Promise<YahooOptionsResult> {
  const providerSymbol = toProviderSymbol(symbol);
  const url = new URL(`https://query1.finance.yahoo.com/v7/finance/options/${providerSymbol}`);
  if (expiration) {
    url.searchParams.set("date", String(Math.floor(expiration.getTime() / 1000)));
  }

  const payload = await fetchJson<DirectYahooOptionsResponse>(url, {
    timeoutMs: QUANT_TIMEOUT_MS,
  });

  return mapDirectResult(payload);
}

async function fetchOptionsViaProvider(
  symbol: string,
  expiration?: Date,
): Promise<YahooOptionsResult> {
  const providerSymbol = toProviderSymbol(symbol);
  try {
    return (await yahooFinance.options(
      providerSymbol,
      expiration ? { date: expiration } : undefined,
    )) as YahooOptionsResult;
  } catch (error) {
    try {
      return await fetchDirectYahooOptions(symbol, expiration);
    } catch (fallbackError) {
      throw mapProviderError(fallbackError ?? error, symbol);
    }
  }
}

async function fetchCompleteChain(
  symbol: string,
  requestedExpiration?: Date,
): Promise<YahooOptionsResult> {
  const initial = await fetchOptionsViaProvider(symbol, requestedExpiration);
  if (requestedExpiration) {
    return initial;
  }

  const expirationDates = (initial.expirationDates ?? []).filter((date) =>
    Number.isFinite(date.getTime()),
  );

  if (expirationDates.length === 0) {
    return initial;
  }

  const alreadyComplete =
    (initial.options?.length ?? 0) >= expirationDates.length;
  if (alreadyComplete) {
    return initial;
  }

  const options = await Promise.all(
    expirationDates.map(async (expiration) => {
      const result = await fetchOptionsViaProvider(symbol, expiration);
      return result.options?.[0] ?? null;
    }),
  );

  return {
    ...initial,
    expirationDates,
    options: options.filter((entry): entry is NonNullable<typeof entry> => entry != null),
  };
}

function buildChainResult(
  symbol: string,
  result: YahooOptionsResult,
  selectedExpiration?: string,
): QuantOptionChain {
  const expirations = (result.options ?? [])
    .map((entry) => mapExpiration(entry))
    .filter((entry): entry is QuantOptionExpiration => entry != null)
    .sort((left, right) => left.time_to_expiry_years - right.time_to_expiry_years);

  const spotPrice = asNumber(result.quote?.regularMarketPrice);
  if (spotPrice == null) {
    throw new ServiceError(503, {
      error: "upstream_unavailable",
      provider: "yfinance",
      ticker: symbol,
      detail: "Missing underlying spot price in Yahoo options response.",
    });
  }

  const firstExpiration = expirations[0] ?? null;
  const referenceContracts = firstExpiration
    ? [...firstExpiration.calls, ...firstExpiration.puts]
    : [];

  let atmStrike: number | null = null;
  if (referenceContracts.length > 0) {
    const closest = referenceContracts.reduce((best, contract) => {
      if (!best) {
        return contract;
      }

      return Math.abs(contract.strike - spotPrice) < Math.abs(best.strike - spotPrice)
        ? contract
        : best;
    }, referenceContracts[0]);
    atmStrike = closest?.strike ?? null;
  }

  const warnings: string[] = [];
  if (expirations.length === 0) {
    warnings.push(`No options contracts were returned for ${symbol}.`);
  }

  return {
    symbol,
    name: result.quote?.shortName ?? result.quote?.longName ?? symbol,
    currency: result.quote?.currency ?? "USD",
    exchange: result.quote?.fullExchangeName ?? result.quote?.exchange ?? "",
    spot_price: spotPrice,
    previous_close: asNumber(result.quote?.regularMarketPreviousClose),
    as_of: toIsoTimestamp(result.quote?.regularMarketTime),
    available_expirations: expirations.map((entry) => entry.expiration),
    selected_expiration: selectedExpiration,
    atm_strike: atmStrike,
    expiration_count: expirations.length,
    expirations,
    warnings: warnings.length > 0 ? warnings : undefined,
    data_status: expirations.length > 0 ? "complete" : "partial",
  };
}

function getContractPriceSignal(contract: QuantOptionContract): number | null {
  if (contract.midpoint != null && Number.isFinite(contract.midpoint) && contract.midpoint > 0) {
    return contract.midpoint;
  }

  if (contract.last_price != null && Number.isFinite(contract.last_price) && contract.last_price > 0) {
    return contract.last_price;
  }

  return null;
}

function getContractRelativeSpread(contract: QuantOptionContract): number | null {
  if (
    contract.bid == null ||
    contract.ask == null ||
    !Number.isFinite(contract.bid) ||
    !Number.isFinite(contract.ask) ||
    contract.bid < 0 ||
    contract.ask <= 0 ||
    contract.ask < contract.bid
  ) {
    return null;
  }

  const midpoint = midpointFromBidAsk(contract.bid, contract.ask);
  if (midpoint == null || midpoint <= 0) {
    return null;
  }

  return (contract.ask - contract.bid) / midpoint;
}

function getLastTradeTimestamp(contract: QuantOptionContract): number {
  if (!contract.last_trade_date) {
    return 0;
  }

  const timestamp = Date.parse(contract.last_trade_date);
  return Number.isFinite(timestamp) ? timestamp : 0;
}

function compareContractsForTargetStrike(
  left: QuantOptionContract,
  right: QuantOptionContract,
  targetStrike: number,
): number {
  const leftDistance = Math.abs(left.strike - targetStrike);
  const rightDistance = Math.abs(right.strike - targetStrike);
  if (leftDistance !== rightDistance) {
    return leftDistance - rightDistance;
  }

  const leftSpread = getContractRelativeSpread(left);
  const rightSpread = getContractRelativeSpread(right);
  if (leftSpread != null || rightSpread != null) {
    return (leftSpread ?? Number.POSITIVE_INFINITY) - (rightSpread ?? Number.POSITIVE_INFINITY);
  }

  const leftOpenInterest = left.open_interest ?? -1;
  const rightOpenInterest = right.open_interest ?? -1;
  if (leftOpenInterest !== rightOpenInterest) {
    return rightOpenInterest - leftOpenInterest;
  }

  const leftVolume = left.volume ?? -1;
  const rightVolume = right.volume ?? -1;
  if (leftVolume !== rightVolume) {
    return rightVolume - leftVolume;
  }

  return getLastTradeTimestamp(right) - getLastTradeTimestamp(left);
}

function pickBestContract(
  contracts: QuantOptionContract[],
  targetStrike: number,
): QuantOptionContract | null {
  if (contracts.length === 0) {
    return null;
  }

  return [...contracts].sort((left, right) =>
    compareContractsForTargetStrike(left, right, targetStrike),
  )[0] ?? null;
}

function isUsableGreeksContract(contract: QuantOptionContract): boolean {
  return (
    contract.implied_volatility != null &&
    Number.isFinite(contract.implied_volatility) &&
    contract.implied_volatility > 0 &&
    getContractPriceSignal(contract) != null
  );
}

function meanOrNull(values: Array<number | null | undefined>): number | null {
  const usable = values.filter((value): value is number => value != null && Number.isFinite(value));
  if (usable.length === 0) {
    return null;
  }

  return usable.reduce((sum, value) => sum + value, 0) / usable.length;
}

function getDefaultGreeksTargetDays(nodes: QuantGreeksTermNode[]): number {
  if (nodes.length === 0) {
    return DEFAULT_GREEKS_TARGET_DAYS;
  }

  const nodeAtOrAfterThirty = nodes.find((node) => node.days_to_expiry >= DEFAULT_GREEKS_TARGET_DAYS);
  if (!nodeAtOrAfterThirty) {
    return nodes[nodes.length - 1]!.days_to_expiry;
  }

  const nearestByDistance = nodes.reduce((best, node) => {
    return Math.abs(node.days_to_expiry - DEFAULT_GREEKS_TARGET_DAYS) <
      Math.abs(best.days_to_expiry - DEFAULT_GREEKS_TARGET_DAYS)
      ? node
      : best;
  }, nodes[0]!);

  if (Math.abs(nodeAtOrAfterThirty.days_to_expiry - DEFAULT_GREEKS_TARGET_DAYS) <= 7) {
    return nodeAtOrAfterThirty.days_to_expiry;
  }

  return nearestByDistance.days_to_expiry;
}

function describeTreasuryRateResolution(
  resolution: TreasuryRateResolution,
  curveAsOf: string | null,
  fallbackRate: number,
  targetDaysToExpiry: number,
): string {
  const asOfLabel = curveAsOf ? ` (latest node date ${curveAsOf})` : "";
  const tenorLabel = `${Math.max(1, Math.round(targetDaysToExpiry))}D`;

  switch (resolution.coverage_mode) {
    case "exact":
      return `Used the ${resolution.lower_node?.label ?? tenorLabel} Treasury node${asOfLabel} for the active risk-free rate.`;
    case "interpolated":
      return `Interpolated the active risk-free rate between the ${resolution.lower_node?.label ?? "lower"} and ${resolution.upper_node?.label ?? "upper"} Treasury nodes${asOfLabel}.`;
    case "edge_clamp_short":
      return `Used the ${resolution.upper_node?.label ?? "short-end"} Treasury node${asOfLabel} as the short-end risk-free anchor for the active ${tenorLabel} tenor.`;
    case "edge_clamp_long":
      return `Used the ${resolution.lower_node?.label ?? "long-end"} Treasury node${asOfLabel} as the long-end risk-free anchor for the active ${tenorLabel} tenor.`;
    case "fallback":
    default:
      return `${resolution.warning ?? `Treasury curve data did not adequately cover the active ${tenorLabel} tenor.`} The risk-free rate fell back to ${(fallbackRate * 100).toFixed(2)}%.`;
  }
}

function interpolateOptionalValue(
  lowerX: number,
  lowerY: number | null | undefined,
  upperX: number,
  upperY: number | null | undefined,
  targetX: number,
): number | null {
  if (
    lowerY == null ||
    upperY == null ||
    !Number.isFinite(lowerY) ||
    !Number.isFinite(upperY)
  ) {
    return null;
  }

  return interpolateLinearly(lowerX, lowerY, upperX, upperY, targetX);
}

function buildAnchorContract(
  contract: QuantOptionContract,
  strikeMode: QuantGreeksAnchorContract["strike_mode"],
  targetStrike: number,
): QuantGreeksAnchorContract {
  return {
    contract_symbol: contract.contract_symbol,
    strike: Number(targetStrike.toFixed(6)),
    strike_mode: strikeMode,
    lower_strike: strikeMode === "exact" ? contract.strike : null,
    upper_strike: strikeMode === "exact" ? contract.strike : null,
    last_price: contract.last_price,
    midpoint: contract.midpoint,
    bid: contract.bid,
    ask: contract.ask,
    open_interest: contract.open_interest,
    volume: contract.volume,
    relative_spread: getContractRelativeSpread(contract),
    last_trade_date: contract.last_trade_date,
  };
}

function buildInterpolatedAnchor(
  lowerContract: QuantOptionContract,
  upperContract: QuantOptionContract,
  targetStrike: number,
  timeToExpiryYears: number,
): StrikeAnchorResult {
  const lowerTime = Math.max(timeToExpiryYears, 1e-6);
  const lowerTotalVariance =
    (lowerContract.implied_volatility! ** 2) * lowerTime;
  const upperTotalVariance =
    (upperContract.implied_volatility! ** 2) * lowerTime;
  const targetTotalVariance = interpolateLinearly(
    lowerContract.strike,
    lowerTotalVariance,
    upperContract.strike,
    upperTotalVariance,
    targetStrike,
  );
  const targetVolatility = Math.sqrt(Math.max(targetTotalVariance / lowerTime, 1e-10));
  const interpolatedMidpoint = interpolateOptionalValue(
    lowerContract.strike,
    lowerContract.midpoint,
    upperContract.strike,
    upperContract.midpoint,
    targetStrike,
  );
  const interpolatedBid = interpolateOptionalValue(
    lowerContract.strike,
    lowerContract.bid,
    upperContract.strike,
    upperContract.bid,
    targetStrike,
  );
  const interpolatedAsk = interpolateOptionalValue(
    lowerContract.strike,
    lowerContract.ask,
    upperContract.strike,
    upperContract.ask,
    targetStrike,
  );
  const relativeSpread =
    interpolatedBid != null && interpolatedAsk != null && interpolatedMidpoint != null && interpolatedMidpoint > 0
      ? (interpolatedAsk - interpolatedBid) / interpolatedMidpoint
      : null;

  return {
    volatility: Number(targetVolatility.toFixed(8)),
    anchor: {
      contract_symbol: null,
      strike: Number(targetStrike.toFixed(6)),
      strike_mode: "interpolated",
      lower_strike: lowerContract.strike,
      upper_strike: upperContract.strike,
      last_price: meanOrNull([lowerContract.last_price, upperContract.last_price]),
      midpoint: interpolatedMidpoint != null ? Number(interpolatedMidpoint.toFixed(6)) : null,
      bid: interpolatedBid != null ? Number(interpolatedBid.toFixed(6)) : null,
      ask: interpolatedAsk != null ? Number(interpolatedAsk.toFixed(6)) : null,
      open_interest: meanOrNull([lowerContract.open_interest, upperContract.open_interest]),
      volume: meanOrNull([lowerContract.volume, upperContract.volume]),
      relative_spread: relativeSpread != null ? Number(relativeSpread.toFixed(8)) : null,
      last_trade_date:
        getLastTradeTimestamp(lowerContract) >= getLastTradeTimestamp(upperContract)
          ? lowerContract.last_trade_date
          : upperContract.last_trade_date,
    },
  };
}

function buildStrikeAnchorForExpiration(
  expiration: QuantOptionExpiration,
  optionType: QuantOptionType,
  targetStrike: number,
): StrikeAnchorResult | null {
  const usableContracts = (optionType === "call" ? expiration.calls : expiration.puts)
    .filter(isUsableGreeksContract)
    .sort((left, right) => left.strike - right.strike);

  if (usableContracts.length === 0) {
    return null;
  }

  const exactContracts = usableContracts.filter(
    (contract) => Math.abs(contract.strike - targetStrike) < 1e-8,
  );
  const exactContract = pickBestContract(exactContracts, targetStrike);
  if (exactContract) {
    return {
      volatility: exactContract.implied_volatility!,
      anchor: buildAnchorContract(exactContract, "exact", targetStrike),
    };
  }

  const lowerStrike = [...new Set(
    usableContracts
      .filter((contract) => contract.strike < targetStrike)
      .map((contract) => contract.strike),
  )].sort((left, right) => right - left)[0];
  const upperStrike = [...new Set(
    usableContracts
      .filter((contract) => contract.strike > targetStrike)
      .map((contract) => contract.strike),
  )].sort((left, right) => left - right)[0];

  if (lowerStrike != null && upperStrike != null && upperStrike > lowerStrike) {
    const lowerContract = pickBestContract(
      usableContracts.filter((contract) => contract.strike === lowerStrike),
      targetStrike,
    );
    const upperContract = pickBestContract(
      usableContracts.filter((contract) => contract.strike === upperStrike),
      targetStrike,
    );

    if (lowerContract && upperContract) {
      return buildInterpolatedAnchor(
        lowerContract,
        upperContract,
        targetStrike,
        expiration.time_to_expiry_years,
      );
    }
  }

  const nearestContract = pickBestContract(usableContracts, targetStrike);
  if (!nearestContract) {
    return null;
  }

  return {
    volatility: nearestContract.implied_volatility!,
    anchor: buildAnchorContract(nearestContract, "nearest", targetStrike),
  };
}

function inferSpotReference(legs: QuantPayoffLeg[], fallbackSpot?: number): number {
  if (fallbackSpot != null && Number.isFinite(fallbackSpot) && fallbackSpot > 0) {
    return fallbackSpot;
  }

  const strikes = legs.map((leg) => leg.strike).filter((strike) => Number.isFinite(strike));
  if (strikes.length === 0) {
    return 100;
  }

  const sorted = [...strikes].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

export async function getQuantRiskFreeRate(
  timeToExpiryYears: number = 1,
  curve?: TreasuryCurve,
): Promise<number> {
  try {
    const activeCurve = curve ?? await getTreasuryCurve();
    return resolveTreasuryRateForPricing(
      activeCurve,
      timeToExpiryYears,
      FALLBACK_RISK_FREE_RATE,
    ).rate;
  } catch {
    return FALLBACK_RISK_FREE_RATE;
  }
}

export function shapeTreasuryCurveForQuant(curve: TreasuryCurve): QuantYieldCurveResult {
  return {
    as_of: curve.as_of,
    source: "fred",
    curve_method: "treasury_constant_maturity_par_curve",
    interpolation_method: "log_discount_factor",
    nodes: curve.nodes.map((node) => ({
      series_id: node.series_id,
      label: node.label,
      tenor_days: node.tenor_days,
      latest_date: node.latest_date,
      rate_percent: Number(node.rate_percent.toFixed(6)),
      rate_decimal: Number(node.rate_decimal.toFixed(8)),
      continuous_rate: Number(node.continuous_rate.toFixed(8)),
    })),
    warnings: curve.warnings,
  };
}

export async function getRiskFreeYieldCurve(): Promise<QuantYieldCurveResult> {
  const curve = await getTreasuryCurve();
  return shapeTreasuryCurveForQuant(curve);
}

export async function fetchOptionChain(
  symbol: string,
  expiration?: string | null,
): Promise<QuantOptionChain> {
  const normalized = normalizeDashboardSymbol(symbol);
  const requestedExpiration = expiration ? toExpirationDate(expiration) : null;

  if (expiration && !requestedExpiration) {
    throw new ServiceError(422, {
      error: "invalid_request",
      ticker: normalized,
      detail: "Expiration must be a valid yyyy-mm-dd date.",
    });
  }

  const raw = await fetchCompleteChain(normalized, requestedExpiration ?? undefined);
  return buildChainResult(
    normalized,
    raw,
    requestedExpiration ? formatDate(requestedExpiration) : undefined,
  );
}

async function normalizeGreeksInputs(input: QuantGreeksInput): Promise<NormalizedGreeksInputs> {
  const assumptions: string[] = [];
  const normalizedSymbol = input.symbol?.trim()
    ? normalizeDashboardSymbol(input.symbol)
    : undefined;
  const requestedExpirationDate = input.expiration ? toExpirationDate(input.expiration) : null;

  if (input.expiration && !requestedExpirationDate) {
    throw new ServiceError(422, {
      error: "invalid_request",
      ticker: normalizedSymbol,
      detail: "Expiration must be a valid yyyy-mm-dd date.",
    });
  }

  let chain: QuantOptionChain | null = null;
  if (normalizedSymbol) {
    chain = await fetchOptionChain(normalizedSymbol);
  }

  const optionType = input.option_type ?? "call";
  if (input.option_type == null) {
    assumptions.push("Defaulted option type to call.");
  }

  const listedRequestedExpiration =
    input.expiration && chain
      ? chain.expirations.find((entry) => entry.expiration === input.expiration) ?? null
      : null;

  const strike =
    input.strike ??
    chain?.atm_strike ??
    chain?.spot_price;
  if (strike == null || !Number.isFinite(strike) || strike <= 0) {
    throw new ServiceError(422, {
      error: "invalid_request",
      ticker: normalizedSymbol,
      detail: "compute_greeks requires a strike or a symbol with an option chain to infer the ATM strike.",
    });
  }
  if (input.strike == null && chain) {
    assumptions.push(`Used ATM strike ${strike.toFixed(2)} from the live chain.`);
  }

  const spotPrice =
    input.spot_price ??
    chain?.spot_price;
  if (spotPrice == null || !Number.isFinite(spotPrice) || spotPrice <= 0) {
    throw new ServiceError(422, {
      error: "invalid_request",
      ticker: normalizedSymbol,
      detail: "compute_greeks requires a valid spot price or a symbol with options data.",
    });
  }
  if (input.spot_price == null && chain) {
    assumptions.push(`Used live spot price ${spotPrice.toFixed(2)} from ${chain.symbol}.`);
  }

  const explicitTargetDays =
    typeof input.days_to_expiry === "number" && Number.isFinite(input.days_to_expiry)
      ? Math.max(input.days_to_expiry, 1)
      : typeof input.time_to_expiry_years === "number" &&
          Number.isFinite(input.time_to_expiry_years) &&
          input.time_to_expiry_years > 0
        ? Math.max(input.time_to_expiry_years * 365.25, 1)
        : null;

  if (requestedExpirationDate && explicitTargetDays != null) {
    const requestedExpirationDays = Math.max(
      1,
      (requestedExpirationDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000),
    );

    if (Math.abs(requestedExpirationDays - explicitTargetDays) > 2) {
      throw new ServiceError(422, {
        error: "invalid_request",
        ticker: normalizedSymbol,
        detail: "Expiration and days_to_expiry/time_to_expiry_years disagree materially. Provide only one tenor input or align them.",
      });
    }
  }

  const dividendYield =
    normalizedSymbol ? (await getDividendYield(normalizedSymbol)) ?? 0 : 0;
  if (normalizedSymbol && dividendYield > 0) {
    assumptions.push(
      `Used live dividend yield ${(dividendYield * 100).toFixed(2)}% as the continuous-yield proxy.`,
    );
  } else {
    assumptions.push("Used a 0.00% dividend yield assumption.");
  }

  let treasuryCurve: TreasuryCurve | null = null;
  if (input.risk_free_rate == null) {
    try {
      treasuryCurve = await getTreasuryCurve();
    } catch {
      assumptions.push(
        `Treasury curve fetch failed, so the risk-free rate fell back to ${(FALLBACK_RISK_FREE_RATE * 100).toFixed(2)}%.`,
      );
    }
  }

  let maturityNodes: ResolvedGreeksTermNode[] = [];
  if (chain) {
    maturityNodes = chain.expirations
      .map((expiration) => {
        const strikeAnchor = buildStrikeAnchorForExpiration(expiration, optionType, strike);
        if (!strikeAnchor) {
          return null;
        }

        const rateResolution =
          input.risk_free_rate == null
            ? resolveTreasuryRateForPricing(
                treasuryCurve,
                expiration.time_to_expiry_years,
                FALLBACK_RISK_FREE_RATE,
              )
            : undefined;
        const nodeRate = input.risk_free_rate ?? rateResolution?.rate ?? FALLBACK_RISK_FREE_RATE;

        return {
          expiration: expiration.expiration,
          days_to_expiry: expiration.days_to_expiry,
          time_to_expiry_years: expiration.time_to_expiry_years,
          volatility: Number((input.volatility ?? strikeAnchor.volatility).toFixed(8)),
          risk_free_rate: Number(nodeRate.toFixed(8)),
          dividend_yield: Number(dividendYield.toFixed(8)),
          anchor: strikeAnchor.anchor,
          risk_free_rate_resolution: rateResolution,
        };
      })
      .filter((node): node is ResolvedGreeksTermNode => node != null)
      .sort((left, right) => left.time_to_expiry_years - right.time_to_expiry_years);
  }

  if (maturityNodes.length === 0) {
    const fallbackTimeToExpiryYears =
      input.time_to_expiry_years ??
      (explicitTargetDays != null ? explicitTargetDays / 365.25 : null) ??
      (requestedExpirationDate ? yearsToExpiry(requestedExpirationDate) : null);

    if (
      fallbackTimeToExpiryYears == null ||
      !Number.isFinite(fallbackTimeToExpiryYears) ||
      fallbackTimeToExpiryYears <= 0
    ) {
      throw new ServiceError(422, {
        error: "invalid_request",
        ticker: normalizedSymbol,
        detail:
          "compute_greeks requires a valid time to expiry or an expiration date that can be inferred from the chain.",
      });
    }

    const fallbackRateResolution =
      input.risk_free_rate == null
        ? resolveTreasuryRateForPricing(
            treasuryCurve,
            fallbackTimeToExpiryYears,
            FALLBACK_RISK_FREE_RATE,
          )
        : undefined;
    const fallbackRate =
      input.risk_free_rate ??
      fallbackRateResolution?.rate ??
      FALLBACK_RISK_FREE_RATE;
    const fallbackVolatility = input.volatility;

    if (fallbackVolatility == null || !Number.isFinite(fallbackVolatility) || fallbackVolatility <= 0) {
      throw new ServiceError(422, {
        error: "invalid_request",
        ticker: normalizedSymbol,
        detail: "compute_greeks requires a valid volatility when no live chain contract can anchor the request.",
      });
    }

    const syntheticDate = requestedExpirationDate ?? new Date(
      Date.now() + fallbackTimeToExpiryYears * 365.25 * 24 * 60 * 60 * 1000,
    );
    maturityNodes = [
      {
        expiration: formatDate(syntheticDate),
        days_to_expiry: Math.max(1, Math.round(fallbackTimeToExpiryYears * 365.25)),
        time_to_expiry_years: Number(fallbackTimeToExpiryYears.toFixed(8)),
        volatility: Number(fallbackVolatility.toFixed(8)),
        risk_free_rate: Number(fallbackRate.toFixed(8)),
        dividend_yield: Number(dividendYield.toFixed(8)),
        anchor: {
          contract_symbol: null,
          strike: Number(strike.toFixed(6)),
          strike_mode: "exact",
          lower_strike: strike,
          upper_strike: strike,
          last_price: null,
          midpoint: null,
          bid: null,
          ask: null,
          open_interest: null,
          volume: null,
          relative_spread: null,
          last_trade_date: null,
        },
        risk_free_rate_resolution: fallbackRateResolution,
      },
    ];
    assumptions.push("No usable live option-chain anchor was available, so Greeks were computed from explicit synthetic inputs.");
  }

  if (input.volatility != null) {
    assumptions.push(
      `Applied user-specified volatility ${(input.volatility * 100).toFixed(2)}% across the selected tenor profile.`,
    );
  }

  if (input.risk_free_rate != null) {
    assumptions.push(
      `Applied user-specified risk-free rate ${(input.risk_free_rate * 100).toFixed(2)}% across the selected tenor profile.`,
    );
  }

  const targetDaysToExpiry =
    listedRequestedExpiration?.days_to_expiry ??
    explicitTargetDays ??
    (requestedExpirationDate ? daysToExpiry(requestedExpirationDate) : null) ??
    getDefaultGreeksTargetDays(maturityNodes);
  const activeTenor = deriveActiveTenor(maturityNodes, targetDaysToExpiry);
  if (!activeTenor) {
    throw new ServiceError(422, {
      error: "invalid_request",
      ticker: normalizedSymbol,
      detail: "Unable to build a valid maturity context for Greeks.",
    });
  }

  const activeExpiration =
    activeTenor.mode === "listed"
      ? activeTenor.expiration
      : listedRequestedExpiration?.expiration;

  if (listedRequestedExpiration) {
    assumptions.push(`Used listed expiry ${listedRequestedExpiration.expiration}.`);
  } else if (input.expiration && activeTenor.mode === "interpolated") {
    assumptions.push(
      `Requested expiration ${input.expiration} is not a listed expiry, so Greeks were interpolated between surrounding listed expiries.`,
    );
  } else if (activeTenor.mode === "interpolated") {
    assumptions.push(
      `Interpolated tenor ${activeTenor.days_to_expiry}D between ${activeTenor.lower_anchor?.days_to_expiry ?? "?"}D and ${activeTenor.upper_anchor?.days_to_expiry ?? "?"}D listed expiries.`,
    );
  } else if (!input.expiration && explicitTargetDays == null) {
    assumptions.push(
      `No tenor was specified, so Greeks defaulted to a representative ${activeTenor.days_to_expiry}D target tenor anchored to the live listed expiry ladder.`,
    );
  }

  if (activeTenor.clamped) {
    assumptions.push("Requested tenor lay outside the listed expiry range and was clamped to the nearest listed edge.");
  }

  let activeRiskFreeRate = activeTenor.riskFreeRate;
  if (input.risk_free_rate == null && treasuryCurve) {
    const activeRateResolution = resolveTreasuryRateForPricing(
      treasuryCurve,
      activeTenor.time_to_expiry_years,
      FALLBACK_RISK_FREE_RATE,
    );
    activeRiskFreeRate = activeRateResolution.rate;
    assumptions.push(
      describeTreasuryRateResolution(
        activeRateResolution,
        treasuryCurve.as_of,
        FALLBACK_RISK_FREE_RATE,
        activeTenor.days_to_expiry,
      ),
    );
    if (
      treasuryCurve.warnings &&
      treasuryCurve.warnings.length > 0 &&
      activeRateResolution.source === "treasury_curve"
    ) {
      assumptions.push(
        "Treasury curve data was partially available, but the active tenor remained adequately covered for pricing.",
      );
    }
  }

  assumptions.push(
    "Pricing and Greeks use the Black-Scholes-Merton approximation with continuous dividend yield. Listed U.S. equity options are American-style, so this remains an approximation.",
  );
  assumptions.push(
    "Greeks convention: vega is quoted per 1 vol point, rho per 1 rate point, theta per calendar day, volga per vol-point squared, and vanna per vol point.",
  );

  return {
    symbol: normalizedSymbol,
    expiration: activeExpiration,
    optionType,
    strike,
    spotPrice,
    volatility: activeTenor.volatility,
    riskFreeRate: activeRiskFreeRate,
    dividendYield: activeTenor.dividendYield,
    timeToExpiryYears: activeTenor.time_to_expiry_years,
    activeTenor,
    maturityNodes,
    maturityRangeDays:
      maturityNodes.length > 0
        ? {
            min: maturityNodes[0]!.days_to_expiry,
            max: maturityNodes[maturityNodes.length - 1]!.days_to_expiry,
          }
        : undefined,
    assumptions,
  };
}

export async function computeGreeks(
  input: QuantGreeksInput,
): Promise<QuantGreeksResult> {
  const normalized = await normalizeGreeksInputs(input);
  const result = computeBlackScholes(
    normalized.optionType,
    normalized.spotPrice,
    normalized.strike,
    normalized.timeToExpiryYears,
    normalized.volatility,
    normalized.riskFreeRate,
    normalized.dividendYield,
  );

  return {
    symbol: normalized.symbol,
    option_type: normalized.optionType,
    strike: normalized.strike,
    expiration: normalized.expiration,
    spot_price: Number(normalized.spotPrice.toFixed(6)),
    risk_free_rate: Number(normalized.riskFreeRate.toFixed(6)),
    dividend_yield: Number(normalized.dividendYield.toFixed(6)),
    volatility: Number(normalized.volatility.toFixed(6)),
    time_to_expiry_years: Number(normalized.timeToExpiryYears.toFixed(6)),
    theoretical_price: Number(result.theoreticalPrice.toFixed(6)),
    delta: Number(result.delta.toFixed(6)),
    gamma: Number(result.gamma.toFixed(6)),
    vega: Number(result.vega.toFixed(6)),
    theta: Number(result.theta.toFixed(6)),
    rho: Number(result.rho.toFixed(6)),
    volga: Number(result.volga.toFixed(6)),
    vanna: Number(result.vanna.toFixed(6)),
    speed: Number(result.speed.toFixed(6)),
    model: "bsm",
    approximation: "black_scholes_merton_with_continuous_dividend_yield",
    active_tenor: normalized.activeTenor,
    maturity_nodes: normalized.maturityNodes,
    maturity_range_days: normalized.maturityRangeDays,
    assumptions: normalized.assumptions,
  };
}

export async function buildVolSurface(
  symbol: string,
  model: "ssvi" | "cvi" = "ssvi",
): Promise<QuantSurfaceResult> {
  const chain = await fetchOptionChain(symbol);
  const riskFreeRate = await getQuantRiskFreeRate(1);
  if (model === "cvi") {
    const { buildCVISurface } = await import("@/server/quant/cvi/index");
    return buildCVISurface(chain, riskFreeRate);
  }
  return buildArbitrageFreeSurface(chain, riskFreeRate);
}

function payoffForLeg(
  spot: number,
  leg: QuantPayoffLeg,
): number {
  const intrinsic =
    leg.option_type === "call"
      ? Math.max(spot - leg.strike, 0)
      : Math.max(leg.strike - spot, 0);
  const signed =
    leg.direction === "long"
      ? intrinsic - leg.premium
      : leg.premium - intrinsic;

  return signed * leg.quantity;
}

function dedupeSorted(values: number[]): number[] {
  return Array.from(new Set(values.map((value) => Number(value.toFixed(6))))).sort(
    (left, right) => left - right,
  );
}

export async function buildPayoffDiagram(input: {
  symbol?: string;
  spot_price?: number;
  legs: QuantPayoffLeg[];
}): Promise<QuantPayoffResult> {
  if (!Array.isArray(input.legs) || input.legs.length === 0) {
    throw new ServiceError(422, {
      error: "invalid_request",
      detail: "build_payoff_diagram requires at least one option leg.",
    });
  }

  const symbol = input.symbol?.trim()
    ? normalizeDashboardSymbol(input.symbol)
    : undefined;
  const chain = symbol ? await fetchOptionChain(symbol) : null;
  const spotReference = inferSpotReference(
    input.legs,
    input.spot_price ?? chain?.spot_price ?? undefined,
  );

  const strikes = input.legs.map((leg) => leg.strike);
  const minStrike = Math.min(...strikes, spotReference);
  const maxStrike = Math.max(...strikes, spotReference);
  const start = Math.max(0, Math.min(minStrike * 0.5, spotReference * 0.5));
  const end = Math.max(maxStrike * 1.5, spotReference * 1.5);
  const steps = 120;
  const increment = (end - start) / steps;

  const points = Array.from({ length: steps + 1 }, (_, index) => {
    const spot = Number((start + increment * index).toFixed(4));
    const payoff = Number(
      input.legs.reduce((sum, leg) => sum + payoffForLeg(spot, leg), 0).toFixed(6),
    );

    return { spot, payoff };
  });

  const breakevens: number[] = [];
  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1];
    const current = points[index];
    if (previous.payoff === 0) {
      breakevens.push(previous.spot);
      continue;
    }
    if (previous.payoff < 0 && current.payoff > 0 || previous.payoff > 0 && current.payoff < 0) {
      const ratio = Math.abs(previous.payoff) / (Math.abs(previous.payoff) + Math.abs(current.payoff));
      breakevens.push(
        Number((previous.spot + (current.spot - previous.spot) * ratio).toFixed(4)),
      );
    }
  }

  const payoffs = points.map((point) => point.payoff);
  const maxProfit = Math.max(...payoffs);
  const maxLoss = Math.min(...payoffs);

  return {
    symbol,
    spot_reference: Number(spotReference.toFixed(6)),
    legs: input.legs,
    points,
    breakeven_points: dedupeSorted(breakevens),
    max_profit: Number.isFinite(maxProfit) ? Number(maxProfit.toFixed(6)) : null,
    max_loss: Number.isFinite(maxLoss) ? Number(maxLoss.toFixed(6)) : null,
  };
}
