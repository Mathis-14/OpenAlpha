import test from "node:test";
import assert from "node:assert/strict";
import { shouldUseMath } from "./markdown-message.tsx";

test("shouldUseMath stays off for finance currency ranges with unicode dashes", () => {
  assert.equal(shouldUseMath("Range: $169.21 – $288.62", false), false);
});

test("shouldUseMath stays on for explicit block math", () => {
  assert.equal(shouldUseMath("$$x^2 + y^2$$", false), true);
});

test("shouldUseMath stays on for inline symbolic math", () => {
  assert.equal(shouldUseMath("The formula is $x + y$.", false), true);
});

test("shouldUseMath stays off while streaming", () => {
  assert.equal(shouldUseMath("The formula is $x + y$.", true), false);
});
