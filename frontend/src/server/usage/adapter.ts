import {
  clearUnlockGuardCookieHeader,
  decrementQuota,
  getQuotaCookieMaxAgeSeconds,
  getQuotaConfig,
  getQuotaMax,
  getUnlockGuard,
  getUnlockLockoutSeconds,
  getUnlockMaxFailures,
  initializeQuota,
  refillQuota,
  registerUnlockFailure,
  verifyOverridePassword,
} from "@/server/usage/quota";
import { getFirebaseUserIdFromRequest } from "@/server/auth/firebase";
import { runRedisCommand, runRedisEval } from "@/server/usage/upstash";

export type QuotaMode = "redis" | "legacy_cookie";

type QuotaState = {
  limit: number;
  remaining: number;
  mode: QuotaMode;
  setCookieHeaders: string[];
};

type QuotaDecision = QuotaState & {
  allowed: boolean;
};

type UnlockGuardState = {
  blocked: boolean;
  retryAfterSeconds: number;
  mode: QuotaMode;
  setCookieHeaders: string[];
};

const LOCALHOST_IDENTITY = "127.0.0.1";

type ResolvedQuotaIdentity = {
  key: string;
  authenticated: boolean;
};

const QUOTA_INIT_SCRIPT = `
local limit = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local current = tonumber(redis.call("GET", KEYS[1]))
if not current then
  current = limit
end
if current > max then
  current = max
end
if current < 0 then
  current = 0
end
redis.call("SET", KEYS[1], current, "EX", ttl)
return current
`;

const QUOTA_DECREMENT_SCRIPT = `
local limit = tonumber(ARGV[1])
local max = tonumber(ARGV[2])
local ttl = tonumber(ARGV[3])
local current = tonumber(redis.call("GET", KEYS[1]))
if not current then
  current = limit
end
if current > max then
  current = max
end
if current <= 0 then
  redis.call("SET", KEYS[1], 0, "EX", ttl)
  return {0, 0}
end
local nextValue = current - 1
if nextValue < 0 then
  nextValue = 0
end
redis.call("SET", KEYS[1], nextValue, "EX", ttl)
return {1, nextValue}
`;

const QUOTA_REFILL_SCRIPT = `
local limit = tonumber(ARGV[1])
local refill = tonumber(ARGV[2])
local max = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local current = tonumber(redis.call("GET", KEYS[1]))
if not current then
  current = limit
end
local nextValue = current + refill
if nextValue > max then
  nextValue = max
end
if nextValue < 0 then
  nextValue = 0
end
redis.call("SET", KEYS[1], nextValue, "EX", ttl)
return nextValue
`;

const UNLOCK_GUARD_SCRIPT = `
local now = tonumber(ARGV[1])
local lockedUntil = tonumber(redis.call("GET", KEYS[2]))
if not lockedUntil then
  return {0, 0}
end
if lockedUntil <= now then
  redis.call("DEL", KEYS[1])
  redis.call("DEL", KEYS[2])
  return {0, 0}
end
local retry = math.floor((lockedUntil - now + 999) / 1000)
return {1, retry}
`;

const UNLOCK_FAILURE_SCRIPT = `
local now = tonumber(ARGV[1])
local maxFailures = tonumber(ARGV[2])
local lockoutMs = tonumber(ARGV[3])
local ttl = tonumber(ARGV[4])
local lockedUntil = tonumber(redis.call("GET", KEYS[2]))
if lockedUntil and lockedUntil > now then
  local retry = math.floor((lockedUntil - now + 999) / 1000)
  return {1, retry}
end
if lockedUntil and lockedUntil <= now then
  redis.call("DEL", KEYS[1])
  redis.call("DEL", KEYS[2])
end
local attempts = tonumber(redis.call("GET", KEYS[1])) or 0
attempts = attempts + 1
redis.call("SET", KEYS[1], attempts, "EX", ttl)
if attempts >= maxFailures then
  local nextLockedUntil = now + lockoutMs
  redis.call("SET", KEYS[2], nextLockedUntil, "PX", lockoutMs)
  local retry = math.floor((lockoutMs + 999) / 1000)
  return {1, retry}
end
redis.call("DEL", KEYS[2])
return {0, 0}
`;

function isQuotaEnabled(): boolean {
  return process.env.QUOTA_ENABLED?.trim().toLowerCase() !== "false";
}

function getCookieHeader(request: Request): string | null {
  return request.headers.get("cookie");
}

function toSetCookieHeaders(value?: string | null): string[] {
  return value ? [value] : [];
}

function getRequestIp(request: Request): string | null {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) {
      return first;
    }
  }

  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) {
    return realIp;
  }

  if (process.env.NODE_ENV !== "production") {
    return LOCALHOST_IDENTITY;
  }

  return null;
}

async function resolveQuotaMode(): Promise<QuotaMode> {
  return isQuotaEnabled() ? "redis" : "legacy_cookie";
}

function resolveIpIdentity(request: Request): string {
  const ip = getRequestIp(request);
  if (!ip) {
    throw new Error("Unable to resolve client identity");
  }

  return `ip:${ip}`;
}

async function resolveQuotaIdentity(
  request: Request,
): Promise<ResolvedQuotaIdentity> {
  const userId = await getFirebaseUserIdFromRequest(request);
  if (userId) {
    return {
      key: `uid:${userId}`,
      authenticated: true,
    };
  }

  return {
    key: resolveIpIdentity(request),
    authenticated: false,
  };
}

function getQuotaKey(identity: string): string {
  return `openalpha:quota:${identity}:remaining`;
}

function getUnlockAttemptsKey(identity: string): string {
  return `openalpha:quota:${identity}:unlock_failures`;
}

function getUnlockLockKey(identity: string): string {
  return `openalpha:quota:${identity}:unlock_locked_until`;
}

function toNumber(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  throw new Error("Invalid Redis numeric response");
}

function toTuple(value: unknown): [number, number] {
  if (!Array.isArray(value) || value.length < 2) {
    throw new Error("Invalid Redis tuple response");
  }

  return [toNumber(value[0]), toNumber(value[1])];
}

async function getRedisQuotaSnapshot(
  identity: string,
  limit: number,
): Promise<number> {
  return toNumber(
    await runRedisEval<number>(
      QUOTA_INIT_SCRIPT,
      [getQuotaKey(identity)],
      [
        limit,
        getQuotaMax(),
        getQuotaCookieMaxAgeSeconds(),
      ],
    ),
  );
}

async function decrementRedisQuota(
  identity: string,
  limit: number,
): Promise<{
  allowed: boolean;
  remaining: number;
}> {
  const [allowedFlag, remaining] = toTuple(
    await runRedisEval<unknown>(
      QUOTA_DECREMENT_SCRIPT,
      [getQuotaKey(identity)],
      [
        limit,
        getQuotaMax(),
        getQuotaCookieMaxAgeSeconds(),
      ],
    ),
  );

  return {
    allowed: allowedFlag === 1,
    remaining,
  };
}

async function refillRedisQuota(
  identity: string,
  limit: number,
  refill: number,
): Promise<number> {
  return toNumber(
    await runRedisEval<number>(
      QUOTA_REFILL_SCRIPT,
      [getQuotaKey(identity)],
      [
        limit,
        refill,
        getQuotaMax(),
        getQuotaCookieMaxAgeSeconds(),
      ],
    ),
  );
}

async function getRedisUnlockGuard(identity: string): Promise<{
  blocked: boolean;
  retryAfterSeconds: number;
}> {
  const [blockedFlag, retryAfterSeconds] = toTuple(
    await runRedisEval<unknown>(
      UNLOCK_GUARD_SCRIPT,
      [getUnlockAttemptsKey(identity), getUnlockLockKey(identity)],
      [Date.now()],
    ),
  );

  return {
    blocked: blockedFlag === 1,
    retryAfterSeconds,
  };
}

async function registerRedisUnlockFailure(identity: string): Promise<{
  blocked: boolean;
  retryAfterSeconds: number;
}> {
  const [blockedFlag, retryAfterSeconds] = toTuple(
    await runRedisEval<unknown>(
      UNLOCK_FAILURE_SCRIPT,
      [getUnlockAttemptsKey(identity), getUnlockLockKey(identity)],
      [
        Date.now(),
        getUnlockMaxFailures(),
        getUnlockLockoutSeconds() * 1000,
        getQuotaCookieMaxAgeSeconds(),
      ],
    ),
  );

  return {
    blocked: blockedFlag === 1,
    retryAfterSeconds,
  };
}

async function clearRedisUnlockGuard(identity: string): Promise<void> {
  await runRedisCommand<number>([
    "DEL",
    getUnlockAttemptsKey(identity),
    getUnlockLockKey(identity),
  ]);
}

export async function assertQuotaAvailable(request: Request): Promise<void> {
  const mode = await resolveQuotaMode();
  if (mode === "legacy_cookie") {
    return;
  }

  await resolveQuotaIdentity(request);
}

export async function getUsageQuotaState(request: Request): Promise<QuotaState> {
  const identity = await resolveQuotaIdentity(request);
  const quotaConfig = getQuotaConfig(identity.authenticated);
  const mode = await resolveQuotaMode();
  if (mode === "legacy_cookie") {
    const initialized = initializeQuota(getCookieHeader(request), quotaConfig);
    return {
      limit: initialized.limit,
      remaining: initialized.remaining,
      mode,
      setCookieHeaders: toSetCookieHeaders(initialized.cookieHeader),
    };
  }

  const remaining = await getRedisQuotaSnapshot(identity.key, quotaConfig.limit);

  return {
    limit: quotaConfig.limit,
    remaining,
    mode,
    setCookieHeaders: [],
  };
}

export async function decrementUsageQuota(request: Request): Promise<QuotaDecision> {
  const identity = await resolveQuotaIdentity(request);
  const quotaConfig = getQuotaConfig(identity.authenticated);
  const mode = await resolveQuotaMode();
  if (mode === "legacy_cookie") {
    const decision = decrementQuota(getCookieHeader(request), quotaConfig);
    return {
      limit: decision.limit,
      remaining: decision.remaining,
      allowed: decision.allowed,
      mode,
      setCookieHeaders: toSetCookieHeaders(decision.cookieHeader),
    };
  }

  const decision = await decrementRedisQuota(identity.key, quotaConfig.limit);

  return {
    limit: quotaConfig.limit,
    remaining: decision.remaining,
    allowed: decision.allowed,
    mode,
    setCookieHeaders: [],
  };
}

export async function getUsageUnlockGuard(request: Request): Promise<UnlockGuardState> {
  const mode = await resolveQuotaMode();
  if (mode === "legacy_cookie") {
    const guard = getUnlockGuard(getCookieHeader(request));
    return {
      blocked: guard.blocked,
      retryAfterSeconds: guard.retryAfterSeconds,
      mode,
      setCookieHeaders: [],
    };
  }

  const identity = await resolveQuotaIdentity(request);
  const guard = await getRedisUnlockGuard(identity.key);

  return {
    blocked: guard.blocked,
    retryAfterSeconds: guard.retryAfterSeconds,
    mode,
    setCookieHeaders: [],
  };
}

export async function registerUsageUnlockFailure(
  request: Request,
): Promise<UnlockGuardState> {
  const mode = await resolveQuotaMode();
  if (mode === "legacy_cookie") {
    const failure = registerUnlockFailure(getCookieHeader(request));
    return {
      blocked: failure.blocked,
      retryAfterSeconds: failure.retryAfterSeconds,
      mode,
      setCookieHeaders: toSetCookieHeaders(failure.cookieHeader),
    };
  }

  const identity = await resolveQuotaIdentity(request);
  const failure = await registerRedisUnlockFailure(identity.key);

  return {
    blocked: failure.blocked,
    retryAfterSeconds: failure.retryAfterSeconds,
    mode,
    setCookieHeaders: [],
  };
}

export async function refillUsageQuota(request: Request): Promise<QuotaState> {
  const identity = await resolveQuotaIdentity(request);
  const quotaConfig = getQuotaConfig(identity.authenticated);
  const mode = await resolveQuotaMode();
  if (mode === "legacy_cookie") {
    const refilled = refillQuota(getCookieHeader(request), quotaConfig);
    return {
      limit: refilled.limit,
      remaining: refilled.remaining,
      mode,
      setCookieHeaders: toSetCookieHeaders(refilled.cookieHeader),
    };
  }

  const remaining = await refillRedisQuota(
    identity.key,
    quotaConfig.limit,
    quotaConfig.refill,
  );
  await clearRedisUnlockGuard(identity.key);

  return {
    limit: quotaConfig.limit,
    remaining,
    mode,
    setCookieHeaders: [],
  };
}

export async function clearUsageUnlockGuard(request: Request): Promise<string[]> {
  const mode = await resolveQuotaMode();
  if (mode === "legacy_cookie") {
    return [clearUnlockGuardCookieHeader()];
  }

  const identity = await resolveQuotaIdentity(request);
  await clearRedisUnlockGuard(identity.key);
  return [];
}

export function validateOverridePassword(candidate: string): boolean {
  return verifyOverridePassword(candidate);
}
