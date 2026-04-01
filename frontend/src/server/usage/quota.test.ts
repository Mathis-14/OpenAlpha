import test from "node:test";
import assert from "node:assert/strict";
import {
  createQuotaCookieHeader,
  decrementQuota,
  getQuotaConfig,
  getQuotaSnapshot,
  getUnlockGuard,
  initializeQuota,
  registerUnlockFailure,
  verifyOverridePassword,
} from "./quota.ts";

const ORIGINAL_ENV = { ...process.env };

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

function extractCookieValue(setCookieHeader: string): string {
  return setCookieHeader.split(";")[0] ?? "";
}

test.beforeEach(() => {
  restoreEnv();
  Object.assign(process.env, {
    NODE_ENV: "test",
    REQUEST_QUOTA_SIGNING_SECRET: "quota-test-secret",
    REQUEST_OVERRIDE_PASSWORD: "correct horse battery staple",
  });
});

test.after(() => {
  restoreEnv();
});

test("initializeQuota seeds the default limit when no cookie is present", () => {
  const initialized = initializeQuota(null);

  assert.equal(initialized.limit, 10);
  assert.equal(initialized.remaining, 10);
  assert.match(initialized.cookieHeader, /^oa_agent_quota=/);
});

test("decrementQuota consumes one request from a valid signed cookie", () => {
  const initialCookie = createQuotaCookieHeader(3);
  const decision = decrementQuota(extractCookieValue(initialCookie));

  assert.equal(decision.allowed, true);
  assert.equal(decision.limit, 10);
  assert.equal(decision.remaining, 2);
  assert.match(decision.cookieHeader, /^oa_agent_quota=/);
});

test("authenticated quota upgrades legacy cookies to the higher tier", () => {
  const anonCookie = createQuotaCookieHeader(4);
  const snapshot = getQuotaSnapshot(
    extractCookieValue(anonCookie),
    getQuotaConfig(true),
  );

  assert.equal(snapshot.limit, 20);
  assert.equal(snapshot.remaining, 14);
});

test("invalid quota cookies fail closed instead of resetting quota", () => {
  const snapshot = getQuotaSnapshot("oa_agent_quota=malformed.signature");

  assert.equal(snapshot.remaining, 0);
  assert.equal(snapshot.source, "invalid");
});

test("unlock failures lock the legacy cookie path after five bad attempts", () => {
  const realDateNow = Date.now;
  Date.now = () => 1_700_000_000_000;

  try {
    let cookieHeader: string | null = null;
    let lastAttempt: ReturnType<typeof registerUnlockFailure> | undefined;

    for (let attempt = 0; attempt < 5; attempt += 1) {
      lastAttempt = registerUnlockFailure(cookieHeader);
      cookieHeader = extractCookieValue(lastAttempt.cookieHeader);
    }

    assert.ok(lastAttempt);
    assert.equal(lastAttempt.blocked, true);
    assert.equal(lastAttempt.retryAfterSeconds, 900);

    const guard = getUnlockGuard(cookieHeader);
    assert.equal(guard.blocked, true);
    assert.equal(guard.retryAfterSeconds, 900);
  } finally {
    Date.now = realDateNow;
  }
});

test("verifyOverridePassword only accepts the configured unlock password", () => {
  assert.equal(verifyOverridePassword("wrong password"), false);
  assert.equal(
    verifyOverridePassword("correct horse battery staple"),
    true,
  );
});
