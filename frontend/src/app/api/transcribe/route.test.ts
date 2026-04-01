import test from "node:test";
import assert from "node:assert/strict";
import { POST, isSupportedAudioFile } from "./route.ts";

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

function extractCookieValue(setCookieHeader: string | null): string | null {
  return setCookieHeader?.split(";")[0] ?? null;
}

test.beforeEach(() => {
  restoreEnv();
  globalThis.fetch = ORIGINAL_FETCH;
});

test.after(() => {
  restoreEnv();
  globalThis.fetch = ORIGINAL_FETCH;
});

test("isSupportedAudioFile accepts audio mime types and known extensions", () => {
  assert.equal(
    isSupportedAudioFile({ type: "audio/webm;codecs=opus", name: "clip.webm" }),
    true,
  );
  assert.equal(
    isSupportedAudioFile({ type: "", name: "clip.m4a" }),
    true,
  );
  assert.equal(
    isSupportedAudioFile({ type: "text/plain", name: "notes.txt" }),
    false,
  );
});

test("POST returns 503 when MISTRAL_API_KEY is missing", async () => {
  delete process.env.MISTRAL_API_KEY;

  const formData = new FormData();
  formData.append("file", new File(["voice"], "voice.webm", { type: "audio/webm" }));

  const response = await POST(
    new Request("http://localhost/api/transcribe", {
      method: "POST",
      body: formData,
    }),
  );

  assert.equal(response.status, 503);
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, "transcription_unavailable");
});

test("POST rejects missing file uploads", async () => {
  process.env.MISTRAL_API_KEY = "test-key";

  const response = await POST(
    new Request("http://localhost/api/transcribe", {
      method: "POST",
      body: new FormData(),
    }),
  );

  assert.equal(response.status, 400);
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, "invalid_request");
});

test("POST rejects unsupported media types", async () => {
  process.env.MISTRAL_API_KEY = "test-key";

  const formData = new FormData();
  formData.append("file", new File(["hello"], "notes.txt", { type: "text/plain" }));

  const response = await POST(
    new Request("http://localhost/api/transcribe", {
      method: "POST",
      body: formData,
    }),
  );

  assert.equal(response.status, 415);
  const payload = (await response.json()) as { error?: string };
  assert.equal(payload.error, "unsupported_media_type");
});

test("POST enforces the anonymous voice quota after five successful uploads", async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    QUOTA_ENABLED: "false",
    MISTRAL_API_KEY: "test-key",
    REQUEST_QUOTA_SIGNING_SECRET: "quota-test-secret",
  });

  globalThis.fetch = async () =>
    new Response(JSON.stringify({ text: "voice prompt" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });

  let cookieHeader: string | null = null;

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const formData = new FormData();
    formData.append("file", new File(["voice"], "voice.webm", { type: "audio/webm" }));
    const headers = cookieHeader ? new Headers({ Cookie: cookieHeader }) : undefined;

    const response = await POST(
      new Request("http://localhost/api/transcribe", {
        method: "POST",
        body: formData,
        headers,
      }),
    );

    assert.equal(response.status, 200);
    const payload = (await response.json()) as { text?: string };
    assert.equal(payload.text, "voice prompt");
    cookieHeader = extractCookieValue(response.headers.get("set-cookie"));
    assert.ok(cookieHeader);
  }

  const finalFormData = new FormData();
  finalFormData.append("file", new File(["voice"], "voice.webm", { type: "audio/webm" }));

  const exhaustedResponse = await POST(
    new Request("http://localhost/api/transcribe", {
      method: "POST",
      body: finalFormData,
      headers: cookieHeader ? new Headers({ Cookie: cookieHeader }) : undefined,
    }),
  );

  assert.equal(exhaustedResponse.status, 429);
  const exhaustedPayload = (await exhaustedResponse.json()) as {
    error?: string;
    limit?: number;
    detail?: string;
  };
  assert.equal(exhaustedPayload.error, "quota_exhausted");
  assert.equal(exhaustedPayload.limit, 5);
  assert.match(exhaustedPayload.detail ?? "", /Sign in to get 10 voice requests/i);
});
