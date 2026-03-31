import test from "node:test";
import assert from "node:assert/strict";
import {
  buildDownloadSuggestion,
  getDeterministicAgentReply,
  getConversationStarterReply,
  runAgent,
  type AgentRequest,
} from "./service.ts";

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

test("buildDownloadSuggestion ignores topic-style news tool calls as stock symbol sources", () => {
  const request: AgentRequest = {
    query: "What is driving gold today?",
  };

  const suggestion = buildDownloadSuggestion(request, [
    {
      name: "get_news",
      args: {
        query: "gold",
      },
    },
    {
      name: "get_context_news",
      args: {
        query: "markets",
      },
    },
  ]);

  assert.equal(suggestion, null);
});

test("getConversationStarterReply handles vague landing-page greetings", () => {
  const reply = getConversationStarterReply({
    query: "hello",
  });

  assert.ok(reply);
  assert.match(reply ?? "", /stocks|macro|commodit|btc|eth/i);
  assert.match(reply ?? "", /nvidia|inflation|gold|bitcoin/i);
});

test("getDeterministicAgentReply handles creator questions with exact attribution", () => {
  const reply = getDeterministicAgentReply({
    query: "Who created you?",
  });

  assert.ok(reply);
  assert.match(reply?.answer ?? "", /Mathis Villaret/i);
  assert.match(reply?.answer ?? "", /linkedin/i);
  assert.match(reply?.answer ?? "", /github/i);
  assert.equal(reply?.displayAbout?.href, "/about");
});

test("getConversationStarterReply handles casual greetings with extra words", () => {
  const reply = getConversationStarterReply({
    query: "hello how are you",
    ticker: "AAPL",
  });

  assert.ok(reply);
  assert.match(reply ?? "", /AAPL/i);
  assert.doesNotMatch(reply ?? "", /how are you/i);
});

test("getConversationStarterReply redirects clearly off-topic prompts", () => {
  const reply = getConversationStarterReply({
    query: "And can you help me with my cat?",
  });

  assert.ok(reply);
  assert.match(reply ?? "", /non-finance topic/i);
  assert.match(reply ?? "", /nvidia|inflation|gold|bitcoin/i);
});

test("getConversationStarterReply stays null for concrete asset questions", () => {
  const reply = getConversationStarterReply({
    query: "Tell me about Nvidia",
  });

  assert.equal(reply, null);
});

test("getConversationStarterReply gives context-specific onboarding in data mode", () => {
  const reply = getConversationStarterReply({
    query: "help",
    dashboard_context: "data",
  });

  assert.ok(reply);
  assert.match(reply ?? "", /raw csv export/i);
  assert.match(reply ?? "", /nvda|cpi/i);
});

test("runAgent streams multiple text chunks for deterministic starter replies", async () => {
  const originalKey = process.env.MISTRAL_API_KEY;
  process.env.MISTRAL_API_KEY = "test-key";

  const chunks: string[] = [];
  try {
    for await (const rawChunk of runAgent({ query: "hello how are you" })) {
      chunks.push(rawChunk);
    }
  } finally {
    process.env.MISTRAL_API_KEY = originalKey;
  }

  const textChunks = chunks.filter((chunk) => chunk.includes("event: text_delta"));
  assert.ok(textChunks.length > 1);
});

test("runAgent emits an about card for creator questions", async () => {
  const originalKey = process.env.MISTRAL_API_KEY;
  delete process.env.MISTRAL_API_KEY;

  const chunks: string[] = [];
  try {
    for await (const rawChunk of runAgent({ query: "Who created you?" })) {
      chunks.push(rawChunk);
    }
  } finally {
    process.env.MISTRAL_API_KEY = originalKey;
  }

  const joined = chunks.join("");
  assert.match(joined, /event: display_about/);
  assert.match(joined, /Mathis Villaret/);
  assert.match(joined, /github/i);
  assert.match(joined, /linkedin/i);
});

test("runAgent does not resend rejected tool calls as unmatched assistant tool_call messages", async () => {
  const originalFetch = global.fetch;
  const originalKey = process.env.MISTRAL_API_KEY;
  process.env.MISTRAL_API_KEY = "test-key";

  const requestBodies: Array<Record<string, unknown>> = [];
  let fetchCalls = 0;

  global.fetch = async (_input: RequestInfo | URL, init?: RequestInit) => {
    fetchCalls += 1;
    const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
    requestBodies.push(body);

    if (fetchCalls === 1) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              finish_reason: "tool_calls",
              message: {
                content: "",
                tool_calls: [
                  {
                    id: "call_1",
                    function: {
                      name: "get_macro_snapshot",
                      arguments: "{\"country\":\"us\"}",
                    },
                  },
                ],
              },
            },
          ],
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            finish_reason: "stop",
            message: {
              content: "Please ask about CPI, unemployment, GDP growth, Fed funds, or the 10-year yield.",
            },
          },
        ],
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  };

  try {
    for await (const chunk of runAgent({
      query: "How has inflation been trending lately?",
      dashboard_context: "macro",
      country: "us",
    })) {
      void chunk;
    }
  } finally {
    global.fetch = originalFetch;
    process.env.MISTRAL_API_KEY = originalKey;
  }

  assert.equal(requestBodies.length, 2);
  const secondMessages = requestBodies[1].messages as Array<Record<string, unknown>>;
  assert.ok(secondMessages.every((message) => !("tool_calls" in message)));
});
