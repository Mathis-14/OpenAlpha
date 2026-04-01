import test from "node:test";
import assert from "node:assert/strict";
import { POST, isSupportedAudioFile } from "./route.ts";

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
  const originalKey = process.env.MISTRAL_API_KEY;
  delete process.env.MISTRAL_API_KEY;

  try {
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
  } finally {
    process.env.MISTRAL_API_KEY = originalKey;
  }
});

test("POST rejects missing file uploads", async () => {
  const originalKey = process.env.MISTRAL_API_KEY;
  process.env.MISTRAL_API_KEY = "test-key";

  try {
    const response = await POST(
      new Request("http://localhost/api/transcribe", {
        method: "POST",
        body: new FormData(),
      }),
    );

    assert.equal(response.status, 400);
    const payload = (await response.json()) as { error?: string };
    assert.equal(payload.error, "invalid_request");
  } finally {
    process.env.MISTRAL_API_KEY = originalKey;
  }
});

test("POST rejects unsupported media types", async () => {
  const originalKey = process.env.MISTRAL_API_KEY;
  process.env.MISTRAL_API_KEY = "test-key";

  try {
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
  } finally {
    process.env.MISTRAL_API_KEY = originalKey;
  }
});
