import type { CryptoInstrument } from "@/types/api";

export const CRYPTO_MARKET_META: Record<
  CryptoInstrument,
  {
    symbol: "BTC" | "ETH";
    name: "Bitcoin" | "Ethereum";
    detailLabel: "Perpetual";
    logoSrc: string;
  }
> = {
  "BTC-PERPETUAL": {
    symbol: "BTC",
    name: "Bitcoin",
    detailLabel: "Perpetual",
    logoSrc: "/bitcoin_logo.svg",
  },
  "ETH-PERPETUAL": {
    symbol: "ETH",
    name: "Ethereum",
    detailLabel: "Perpetual",
    logoSrc: "/ethereum_logo.svg",
  },
};

export const SUPPORTED_CRYPTO_MARKETS = (
  Object.entries(CRYPTO_MARKET_META) as Array<
    [CryptoInstrument, (typeof CRYPTO_MARKET_META)[CryptoInstrument]]
  >
).map(([instrument, meta]) => ({
  instrument,
  ...meta,
}));

export function getCryptoMarketMeta(instrument: CryptoInstrument) {
  return CRYPTO_MARKET_META[instrument];
}
