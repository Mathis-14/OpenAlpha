import { createHmac, timingSafeEqual } from "node:crypto";

const QUOTA_COOKIE_NAME = "oa_agent_quota";
const UNLOCK_GUARD_COOKIE_NAME = "oa_agent_unlock_guard";
const QUOTA_LIMIT = 20;
const QUOTA_REFILL = 20;
const QUOTA_MAX = 1_000;
const COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 90;
const UNLOCK_MAX_FAILURES = 5;
const UNLOCK_LOCKOUT_SECONDS = 60 * 15;
const DEV_SIGNING_SECRET = "openalpha-dev-request-quota-secret";
const DEV_OVERRIDE_PASSWORD = "openalpha-dev-password";

type QuotaCookieState =
  | { status: "absent"; remaining: number }
  | { status: "invalid"; remaining: 0 }
  | { status: "valid"; remaining: number };

type UnlockGuardPayload = {
  failedAttempts: number;
  lockedUntil: number | null;
};

function getSigningSecret(): string {
  const configured = process.env.REQUEST_QUOTA_SIGNING_SECRET?.trim();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_SIGNING_SECRET;
  }

  throw new Error("REQUEST_QUOTA_SIGNING_SECRET is not configured");
}

function getOverridePassword(): string {
  const configured = process.env.REQUEST_OVERRIDE_PASSWORD?.trim();
  if (configured) {
    return configured;
  }

  if (process.env.NODE_ENV !== "production") {
    return DEV_OVERRIDE_PASSWORD;
  }

  throw new Error("REQUEST_OVERRIDE_PASSWORD is not configured");
}

function readCookieValue(
  cookieHeader: string | null,
  name: string,
): string | null {
  if (!cookieHeader) {
    return null;
  }

  for (const part of cookieHeader.split(";")) {
    const [rawName, ...rest] = part.trim().split("=");
    if (rawName === name) {
      return rest.join("=") || null;
    }
  }

  return null;
}

function sign(encodedPayload: string): string {
  return createHmac("sha256", getSigningSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);

  if (left.length !== right.length) {
    return false;
  }

  return timingSafeEqual(left, right);
}

function clampRemaining(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(value), QUOTA_MAX));
}

function clampFailedAttempts(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(0, Math.min(Math.trunc(value), UNLOCK_MAX_FAILURES));
}

function clampLockedUntil(value: number | null): number | null {
  if (value == null) {
    return null;
  }

  if (!Number.isFinite(value)) {
    return null;
  }

  return Math.max(0, Math.trunc(value));
}

function encodePayload(remaining: number): string {
  return Buffer.from(JSON.stringify({ remaining: clampRemaining(remaining) }))
    .toString("base64url");
}

function decodePayload(encodedPayload: string): number | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as { remaining?: unknown };

    if (typeof parsed.remaining !== "number") {
      return null;
    }

    if (!Number.isInteger(parsed.remaining)) {
      return null;
    }

    if (parsed.remaining < 0 || parsed.remaining > QUOTA_MAX) {
      return null;
    }

    return parsed.remaining;
  } catch {
    return null;
  }
}

function encodeUnlockGuardPayload(payload: UnlockGuardPayload): string {
  return Buffer.from(
    JSON.stringify({
      failedAttempts: clampFailedAttempts(payload.failedAttempts),
      lockedUntil: clampLockedUntil(payload.lockedUntil),
    }),
  ).toString("base64url");
}

function decodeUnlockGuardPayload(
  encodedPayload: string,
): UnlockGuardPayload | null {
  try {
    const parsed = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8"),
    ) as {
      failedAttempts?: unknown;
      lockedUntil?: unknown;
    };

    if (typeof parsed.failedAttempts !== "number") {
      return null;
    }

    if (!Number.isInteger(parsed.failedAttempts)) {
      return null;
    }

    if (
      parsed.lockedUntil != null &&
      (typeof parsed.lockedUntil !== "number" ||
        !Number.isInteger(parsed.lockedUntil))
    ) {
      return null;
    }

    if (
      parsed.failedAttempts < 0 ||
      parsed.failedAttempts > UNLOCK_MAX_FAILURES
    ) {
      return null;
    }

    return {
      failedAttempts: parsed.failedAttempts,
      lockedUntil:
        typeof parsed.lockedUntil === "number" ? parsed.lockedUntil : null,
    };
  } catch {
    return null;
  }
}

function buildCookieAttributes(maxAgeSeconds: number): string[] {
  const attributes = [
    "Path=/",
    "HttpOnly",
    "SameSite=Lax",
    `Max-Age=${maxAgeSeconds}`,
  ];

  if (process.env.NODE_ENV === "production") {
    attributes.push("Secure");
  }

  return attributes;
}

function createSignedCookieHeader(
  name: string,
  encodedPayload: string,
  maxAgeSeconds = COOKIE_MAX_AGE_SECONDS,
): string {
  const signature = sign(encodedPayload);
  const cookie = `${name}=${encodedPayload}.${signature}`;

  return `${cookie}; ${buildCookieAttributes(maxAgeSeconds).join("; ")}`;
}

function createClearedCookieHeader(name: string): string {
  return `${name}=; ${buildCookieAttributes(0).join("; ")}`;
}

export function readQuotaCookieState(
  cookieHeader: string | null,
): QuotaCookieState {
  const raw = readCookieValue(cookieHeader, QUOTA_COOKIE_NAME);
  if (!raw) {
    return { status: "absent", remaining: QUOTA_LIMIT };
  }

  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) {
    return { status: "invalid", remaining: 0 };
  }

  const expected = sign(encodedPayload);
  if (!safeEqual(signature, expected)) {
    return { status: "invalid", remaining: 0 };
  }

  const remaining = decodePayload(encodedPayload);
  if (remaining == null) {
    return { status: "invalid", remaining: 0 };
  }

  return { status: "valid", remaining };
}

export function getQuotaSnapshot(cookieHeader: string | null): {
  limit: number;
  remaining: number;
  source: QuotaCookieState["status"];
} {
  const state = readQuotaCookieState(cookieHeader);

  return {
    limit: QUOTA_LIMIT,
    remaining: state.remaining,
    source: state.status,
  };
}

export function createQuotaCookieHeader(remaining: number): string {
  const normalized = clampRemaining(remaining);
  const encodedPayload = encodePayload(normalized);
  return createSignedCookieHeader(QUOTA_COOKIE_NAME, encodedPayload);
}

export function decrementQuota(cookieHeader: string | null): {
  limit: number;
  remaining: number;
  allowed: boolean;
  cookieHeader: string;
} {
  const snapshot = getQuotaSnapshot(cookieHeader);
  const nextRemaining = snapshot.remaining > 0 ? snapshot.remaining - 1 : 0;

  return {
    limit: snapshot.limit,
    remaining: nextRemaining,
    allowed: snapshot.remaining > 0,
    cookieHeader: createQuotaCookieHeader(nextRemaining),
  };
}

export function refillQuota(cookieHeader: string | null): {
  limit: number;
  remaining: number;
  cookieHeader: string;
} {
  const snapshot = getQuotaSnapshot(cookieHeader);
  const nextRemaining = clampRemaining(snapshot.remaining + QUOTA_REFILL);

  return {
    limit: snapshot.limit,
    remaining: nextRemaining,
    cookieHeader: createQuotaCookieHeader(nextRemaining),
  };
}

export function initializeQuota(cookieHeader: string | null): {
  limit: number;
  remaining: number;
  cookieHeader: string;
} {
  const snapshot = getQuotaSnapshot(cookieHeader);

  return {
    limit: snapshot.limit,
    remaining: snapshot.remaining,
    cookieHeader: createQuotaCookieHeader(snapshot.remaining),
  };
}

export function verifyOverridePassword(candidate: string): boolean {
  const normalized = candidate.trim();
  if (!normalized) {
    return false;
  }

  return safeEqual(normalized, getOverridePassword());
}

export function getQuotaLimit(): number {
  return QUOTA_LIMIT;
}

export function getQuotaRefill(): number {
  return QUOTA_REFILL;
}

export function getQuotaMax(): number {
  return QUOTA_MAX;
}

export function getQuotaCookieMaxAgeSeconds(): number {
  return COOKIE_MAX_AGE_SECONDS;
}

export function getUnlockMaxFailures(): number {
  return UNLOCK_MAX_FAILURES;
}

export function getUnlockLockoutSeconds(): number {
  return UNLOCK_LOCKOUT_SECONDS;
}

export function getQuotaSigningSecret(): string {
  return getSigningSecret();
}

export function getUnlockGuard(cookieHeader: string | null): {
  blocked: boolean;
  retryAfterSeconds: number;
} {
  const raw = readCookieValue(cookieHeader, UNLOCK_GUARD_COOKIE_NAME);
  if (!raw) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  const [encodedPayload, signature] = raw.split(".");
  if (!encodedPayload || !signature) {
    return { blocked: true, retryAfterSeconds: UNLOCK_LOCKOUT_SECONDS };
  }

  const expected = sign(encodedPayload);
  if (!safeEqual(signature, expected)) {
    return { blocked: true, retryAfterSeconds: UNLOCK_LOCKOUT_SECONDS };
  }

  const payload = decodeUnlockGuardPayload(encodedPayload);
  if (!payload) {
    return { blocked: true, retryAfterSeconds: UNLOCK_LOCKOUT_SECONDS };
  }

  if (payload.lockedUntil == null) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  const now = Date.now();
  if (payload.lockedUntil <= now) {
    return { blocked: false, retryAfterSeconds: 0 };
  }

  return {
    blocked: true,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil((payload.lockedUntil - now) / 1000),
    ),
  };
}

export function registerUnlockFailure(cookieHeader: string | null): {
  blocked: boolean;
  retryAfterSeconds: number;
  cookieHeader: string;
} {
  const guard = getUnlockGuard(cookieHeader);
  if (guard.blocked) {
    return {
      blocked: true,
      retryAfterSeconds: guard.retryAfterSeconds,
      cookieHeader: createUnlockGuardCookieHeader(
        UNLOCK_MAX_FAILURES,
        Date.now() + guard.retryAfterSeconds * 1000,
      ),
    };
  }

  const raw = readCookieValue(cookieHeader, UNLOCK_GUARD_COOKIE_NAME);
  let failedAttempts = 0;
  if (raw) {
    const [encodedPayload, signature] = raw.split(".");
    if (encodedPayload && signature && safeEqual(signature, sign(encodedPayload))) {
      const payload = decodeUnlockGuardPayload(encodedPayload);
      failedAttempts = payload?.failedAttempts ?? 0;
    }
  }

  const nextFailedAttempts = clampFailedAttempts(failedAttempts + 1);
  if (nextFailedAttempts >= UNLOCK_MAX_FAILURES) {
    const lockedUntil = Date.now() + UNLOCK_LOCKOUT_SECONDS * 1000;

    return {
      blocked: true,
      retryAfterSeconds: UNLOCK_LOCKOUT_SECONDS,
      cookieHeader: createUnlockGuardCookieHeader(
        nextFailedAttempts,
        lockedUntil,
      ),
    };
  }

  return {
    blocked: false,
    retryAfterSeconds: 0,
    cookieHeader: createUnlockGuardCookieHeader(nextFailedAttempts, null),
  };
}

export function clearUnlockGuardCookieHeader(): string {
  return createClearedCookieHeader(UNLOCK_GUARD_COOKIE_NAME);
}

function createUnlockGuardCookieHeader(
  failedAttempts: number,
  lockedUntil: number | null,
): string {
  const encodedPayload = encodeUnlockGuardPayload({
    failedAttempts,
    lockedUntil,
  });

  return createSignedCookieHeader(UNLOCK_GUARD_COOKIE_NAME, encodedPayload);
}
