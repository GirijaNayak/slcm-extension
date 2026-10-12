import assert from "node:assert/strict";
import test from "node:test";
import { applyHypothetical, requiredScore, sumAssessments, weightedTotal } from "../src/calculations/marks.js";

test("aggregates assessment totals", () => {
  const total = sumAssessments([
    { obtained: 12, maximum: 15 },
    { obtained: 18, maximum: 20 },
  ]);
  assert.equal(total.obtained, 30);
  assert.equal(total.maximum, 35);
});

test("skips missing and malformed rows", () => {
  const total = sumAssessments([
    { obtained: "x", maximum: 10 },
    { obtained: 5, maximum: 0 },
    { obtained: 7, maximum: 10 },
  ]);
  assert.equal(total.obtained, 7);
  assert.ok(total.issues.length >= 2);
});

test("weighted components", () => {
  const result = weightedTotal([
    { obtained: 24, maximum: 30, weight: 30 },
    { obtained: 20, maximum: 30, weight: 30 },
    { obtained: 32, maximum: 40, weight: 40 },
  ]);
  assert.equal(result.ok, true);
  assert.equal(result.weightSum, 100);
});

test("required remaining marks", () => {
  const result = requiredScore({ obtained: 50, remainingMax: 40, targetTotal: 80 });
  assert.equal(result.required, 30);
  assert.equal(result.impossible, false);
});

test("impossible required marks", () => {
  const result = requiredScore({ obtained: 20, remainingMax: 40, targetTotal: 80 });
  assert.equal(result.impossible, true);
});

test("hypothetical overrides stay distinct from official", () => {
  const merged = applyHypothetical(
    [{ id: "mte", obtained: 20, maximum: 30 }],
    [{ id: "mte", obtained: 28 }],
  );
  assert.equal(merged[0].source, "simulated");
  assert.equal(merged[0].obtained, 28);
});
