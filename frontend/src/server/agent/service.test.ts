import test from "node:test";
import assert from "node:assert/strict";
import { buildDownloadSuggestion, type AgentRequest } from "./service.ts";

test("buildDownloadSuggestion maps one macro series tool call to the exact export", () => {
  const request: AgentRequest = {
    query: "I need U.S. CPI data for research.",
    dashboard_context: "macro",
    country: "us",
  };

  const suggestion = buildDownloadSuggestion(request, [
    {
      name: "get_macro_series",
      args: {
        indicator: "cpi",
        country: "us",
        range: "5y",
      },
    },
  ]);

  assert.ok(suggestion);
  assert.match(suggestion.href, /asset_class=macro/);
  assert.match(suggestion.href, /asset=cpi/);
  assert.match(suggestion.href, /country=us/);
});

test("buildDownloadSuggestion returns null for ambiguous macro indicators", () => {
  const request: AgentRequest = {
    query: "Compare CPI and unemployment.",
    dashboard_context: "macro",
    country: "us",
  };

  const suggestion = buildDownloadSuggestion(request, [
    {
      name: "get_macro_series",
      args: { indicator: "cpi", country: "us" },
    },
    {
      name: "get_macro_series",
      args: { indicator: "unemployment", country: "us" },
    },
  ]);

  assert.equal(suggestion, null);
});
