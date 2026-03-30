import test from "node:test";
import assert from "node:assert/strict";
import { dispatchToolWithDisplay } from "./tools.ts";

test("crypto tools reject unsupported instruments instead of falling back", async () => {
  await assert.rejects(
    () =>
      dispatchToolWithDisplay("get_crypto_overview", {
        instrument: "DOGE-PERPETUAL",
      }),
    /Unsupported crypto instrument/,
  );
});

test("commodity tools reject unsupported instruments instead of falling back", async () => {
  await assert.rejects(
    () =>
      dispatchToolWithDisplay("get_commodity_overview", {
        instrument: "corn",
      }),
    /Unsupported commodity instrument/,
  );
});
