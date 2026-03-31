import test from "node:test";
import assert from "node:assert/strict";
import { AGENT_AUDIT_CASES } from "./cases.ts";

test("agent audit fixtures cover 100 cases with 20 per context", () => {
  assert.equal(AGENT_AUDIT_CASES.length, 100);

  const counts = AGENT_AUDIT_CASES.reduce<Record<string, number>>((acc, auditCase) => {
    acc[auditCase.context] = (acc[auditCase.context] ?? 0) + 1;
    return acc;
  }, {});

  assert.deepEqual(counts, {
    stock: 20,
    macro: 20,
    commodity: 20,
    crypto: 20,
    data: 20,
  });
});

test("agent audit fixture ids are unique", () => {
  const ids = AGENT_AUDIT_CASES.map((auditCase) => auditCase.id);
  assert.equal(new Set(ids).size, ids.length);
});
