/**
 * FastAPI base URL for all browser and server fetches.
 *
 * Resolves in order:
 * 1. Server only: `INTERNAL_API_URL` — use when the Node server must reach a different host
 *    than the browser (e.g. Docker: server → `http://backend:8000`, browser → `http://localhost:8000`).
 * 2. `NEXT_PUBLIC_API_URL` — must match what the browser can reach (embedded at build time on the client).
 * 3. Default `http://127.0.0.1:8000` — avoids empty-env pitfalls and IPv6/`localhost` quirks.
 *
 * Note: `process.env.NEXT_PUBLIC_API_URL ?? default` is wrong for `""` (empty string is not nullish),
 * which makes `fetch` hit the Next origin instead of FastAPI.
 */
const DEFAULT_API_BASE = "http://127.0.0.1:8000";
const LOCALHOST = "localhost";
const LOOPBACK = "127.0.0.1";

function trimTrailingSlash(url: string): string {
  return url.replace(/\/$/, "");
}

function normalizeServerLoopback(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.hostname === LOCALHOST) {
      parsed.hostname = LOOPBACK;
    }
    return trimTrailingSlash(parsed.toString());
  } catch {
    return trimTrailingSlash(url);
  }
}

export function getApiBaseUrl(): string {
  if (
    typeof window === "undefined" &&
    process.env.INTERNAL_API_URL != null &&
    String(process.env.INTERNAL_API_URL).trim() !== ""
  ) {
    return normalizeServerLoopback(String(process.env.INTERNAL_API_URL).trim());
  }

  const pub = process.env.NEXT_PUBLIC_API_URL;
  if (pub != null && String(pub).trim() !== "") {
    const value = String(pub).trim();
    return typeof window === "undefined"
      ? normalizeServerLoopback(value)
      : trimTrailingSlash(value);
  }

  return DEFAULT_API_BASE;
}
