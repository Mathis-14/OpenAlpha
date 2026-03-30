import test from "node:test";
import assert from "node:assert/strict";
import { ServiceError } from "@/server/shared/errors";
import { buildOverview } from "./service.ts";

test("buildOverview fails closed when a required quote field is missing", () => {
  assert.throws(
    () =>
      buildOverview(
        {
          regularMarketPrice: 101.25,
          regularMarketPreviousClose: 100.5,
          regularMarketVolume: null,
          shortName: "Apple",
          currency: "USD",
        } as never,
        "AAPL",
      ),
    (error: unknown) =>
      error instanceof ServiceError &&
      error.status === 503 &&
      /regularMarketVolume/.test(error.message),
  );
});
