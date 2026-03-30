import test from "node:test";
import assert from "node:assert/strict";
import { runRedisCommand, runRedisEval } from "./upstash.ts";

const ORIGINAL_ENV = { ...process.env };
const ORIGINAL_FETCH = globalThis.fetch;

function restoreEnv() {
  for (const key of Object.keys(process.env)) {
    if (!(key in ORIGINAL_ENV)) {
      delete process.env[key];
    }
  }

  for (const [key, value] of Object.entries(ORIGINAL_ENV)) {
    process.env[key] = value;
  }
}

test.beforeEach(() => {
  restoreEnv();
  Object.assign(process.env, {
    UPSTASH_REDIS_REST_URL: "https://example.upstash.io",
    UPSTASH_REDIS_REST_TOKEN: "upstash-test-token",
  });
});

test.afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
});

test.after(() => {
  restoreEnv();
});

test("runRedisCommand posts the raw command to Upstash", async () => {
  let received: {
    url?: string;
    method?: string;
    authorization?: string | null;
    body?: unknown;
  } = {};

  globalThis.fetch = (async (input, init) => {
    received = {
      url: String(input),
      method: init?.method,
      authorization: new Headers(init?.headers).get("Authorization"),
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    };

    return new Response(JSON.stringify({ result: "ok" }), { status: 200 });
  }) as typeof fetch;

  const result = await runRedisCommand<string>(["GET", "openalpha:quota:test"]);

  assert.equal(result, "ok");
  assert.equal(received.url, "https://example.upstash.io");
  assert.equal(received.method, "POST");
  assert.equal(received.authorization, "Bearer upstash-test-token");
  assert.deepEqual(received.body, ["GET", "openalpha:quota:test"]);
});

test("runRedisEval wraps scripts in an EVAL command", async () => {
  let receivedBody: unknown;

  globalThis.fetch = (async (_input, init) => {
    receivedBody = init?.body ? JSON.parse(String(init.body)) : undefined;
    return new Response(JSON.stringify({ result: [1, 19] }), { status: 200 });
  }) as typeof fetch;

  const result = await runRedisEval<[number, number]>(
    "return {1, 19}",
    ["quota:key"],
    [20, 1000],
  );

  assert.deepEqual(result, [1, 19]);
  assert.deepEqual(receivedBody, [
    "EVAL",
    "return {1, 19}",
    1,
    "quota:key",
    20,
    1000,
  ]);
});

test("missing Upstash configuration throws immediately", async () => {
  delete process.env.UPSTASH_REDIS_REST_URL;

  await assert.rejects(
    () => runRedisCommand(["GET", "openalpha:quota:test"]),
    /Upstash Redis is not configured/,
  );
});

test("Upstash payload errors are surfaced to callers", async () => {
  globalThis.fetch = (async () => {
    return new Response(
      JSON.stringify({ error: "ERR mocked redis failure" }),
      { status: 200 },
    );
  }) as typeof fetch;

  await assert.rejects(
    () => runRedisCommand(["GET", "openalpha:quota:test"]),
    /ERR mocked redis failure/,
  );
});
