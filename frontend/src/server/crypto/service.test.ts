import test from "node:test";
import assert from "node:assert/strict";
import { ServiceError } from "@/server/shared/errors";
import { buildCryptoOverview } from "./service.ts";

test("buildCryptoOverview fails closed when mark price is missing", () => {
  assert.throws(
    () =>
      buildCryptoOverview(
        "BTC-PERPETUAL",
        {
          base_currency: "BTC",
          quote_currency: "USD",
          settlement_currency: "BTC",
          price_index: "btc_usd",
          state: "open",
          instrument_type: "future",
          settlement_period: "perpetual",
        } as never,
        {
          last_price: 70000,
          mark_price: null,
        } as never,
      ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 503 &&
      /mark_price/.test(error.message),
  );
});
