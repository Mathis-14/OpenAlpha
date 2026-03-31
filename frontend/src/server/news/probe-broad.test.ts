import test from "node:test";
import assert from "node:assert/strict";
import { renderBroadNewsProbeReport } from "./probe-broad.ts";
import type { BroadNewsProbeResult } from "./broad.ts";

test("probe report includes winning queries, attempts, and warnings", () => {
  const report = renderBroadNewsProbeReport({
    generated_at: "2026-03-31T12:00:00.000Z",
    providers: ["yahoo"],
    themes: [
      {
        theme_id: "markets",
        theme_label: "Markets",
        winner: {
          provider: "yahoo",
          source_mode: "query_feed",
          query: "financial markets",
          score: 21,
          outcome: "success",
          article_count: 4,
          reason: "Strong finance and macro keyword match.",
        },
        attempts: [
          {
            provider: "yahoo",
            source_mode: "query_feed",
            query: "markets",
            score: 8,
            outcome: "weak",
            article_count: 2,
            reason: "Too generic.",
          },
          {
            provider: "yahoo",
            source_mode: "query_feed",
            query: "financial markets",
            score: 21,
            outcome: "success",
            article_count: 4,
            reason: "Strong finance and macro keyword match.",
          },
        ],
        warnings: ["First query was too generic."],
      },
    ],
  } satisfies BroadNewsProbeResult);

  assert.match(report, /financial markets/);
  assert.match(report, /query_feed/);
  assert.match(report, /First query was too generic/);
  assert.match(report, /Strong finance and macro keyword match/);
});
