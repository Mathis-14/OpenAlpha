import { decrementUsageQuota } from "@/server/usage/adapter";

const MISTRAL_TRANSCRIBE_URL = "https://api.mistral.ai/v1/audio/transcriptions";
const MAX_AUDIO_BYTES = 10 * 1024 * 1024;
const TRANSCRIBE_TIMEOUT_MS = 30_000;
const ALLOWED_EXTENSIONS = new Set(["webm", "wav", "mp3", "m4a", "mp4", "ogg"]);

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

function appendSetCookies(headers: Headers, values: string[]) {
  for (const value of values) {
    headers.append("Set-Cookie", value);
  }
}

function getMistralApiKey(): string {
  const key = process.env.MISTRAL_API_KEY?.trim();
  if (!key) {
    throw new Error("MISTRAL_API_KEY is not configured");
  }
  return key;
}

function getExtension(name: string): string {
  const trimmed = name.trim();
  const lastDot = trimmed.lastIndexOf(".");
  if (lastDot < 0) {
    return "";
  }

  return trimmed.slice(lastDot + 1).toLowerCase();
}

export function isSupportedAudioFile(file: Pick<File, "type" | "name">): boolean {
  const mimeType = file.type.trim().toLowerCase();
  if (mimeType.startsWith("audio/") || mimeType === "video/webm") {
    return true;
  }

  return ALLOWED_EXTENSIONS.has(getExtension(file.name));
}

async function fetchWithTimeout(
  input: string,
  init: RequestInit & { timeoutMs?: number } = {},
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), init.timeoutMs ?? TRANSCRIBE_TIMEOUT_MS);

  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

export async function POST(request: Request): Promise<Response> {
  if (!process.env.MISTRAL_API_KEY?.trim()) {
    return Response.json(
      {
        error: "transcription_unavailable",
        detail: "MISTRAL_API_KEY is not configured",
      },
      { status: 503 },
    );
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return Response.json(
      { error: "invalid_request", detail: "Expected multipart/form-data." },
      { status: 400 },
    );
  }

  const upload = formData.get("file");
  if (!(upload instanceof File)) {
    return Response.json(
      { error: "invalid_request", detail: "Audio file is required." },
      { status: 400 },
    );
  }

  if (!isSupportedAudioFile(upload)) {
    return Response.json(
      {
        error: "unsupported_media_type",
        detail: "Only supported audio uploads are accepted.",
      },
      { status: 415 },
    );
  }

  if (upload.size > MAX_AUDIO_BYTES) {
    return Response.json(
      {
        error: "payload_too_large",
        detail: "Audio uploads must be 10 MB or smaller.",
      },
      { status: 413 },
    );
  }

  let quota;
  try {
    quota = await decrementUsageQuota(request, "voice");
  } catch (error) {
    return Response.json(
      {
        error: "quota_unavailable",
        detail: (error as Error).message || "Voice quota service unavailable.",
      },
      { status: 503 },
    );
  }

  if (!quota.allowed) {
    const headers = new Headers({
      "Cache-Control": "no-store",
      Vary: "Cookie, Authorization",
    });
    appendSetCookies(headers, quota.setCookieHeaders);

    return Response.json(
      {
        error: "quota_exhausted",
        detail:
          quota.limit > 5
            ? "Voice transcription limit reached. Try again later."
            : "Voice transcription limit reached. Sign in to get 10 voice requests.",
        remaining: 0,
        limit: quota.limit,
      },
      {
        status: 429,
        headers,
      },
    );
  }

  const upstreamFormData = new FormData();
  upstreamFormData.append("model", "voxtral-mini-latest");
  upstreamFormData.append("file", upload, upload.name || "voice-input.webm");

  let response: Response;
  try {
    response = await fetchWithTimeout(MISTRAL_TRANSCRIBE_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getMistralApiKey()}`,
      },
      body: upstreamFormData,
    });
  } catch (error) {
    if ((error as Error).name === "AbortError") {
      return Response.json(
        {
          error: "transcription_unavailable",
          detail: "Transcription timed out. Try again.",
        },
        { status: 503 },
      );
    }

    return Response.json(
      {
        error: "transcription_unavailable",
        detail: (error as Error).message || "Transcription request failed.",
      },
      { status: 503 },
    );
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    return Response.json(
      {
        error: "transcription_unavailable",
        detail: body || response.statusText || "Transcription failed.",
      },
      { status: 503 },
    );
  }

  let payload: { text?: unknown };
  try {
    payload = (await response.json()) as { text?: unknown };
  } catch {
    return Response.json(
      {
        error: "transcription_unavailable",
        detail: "Transcription returned an invalid response.",
      },
      { status: 503 },
    );
  }

  const text = typeof payload.text === "string" ? payload.text.trim() : "";
  const headers = new Headers({
    "Cache-Control": "no-store",
    Vary: "Cookie, Authorization",
  });
  appendSetCookies(headers, quota.setCookieHeaders);

  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers,
  });
}
