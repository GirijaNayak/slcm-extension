import assert from "node:assert/strict";
import test from "node:test";
import { planTargetCgpa } from "../src/calculations/target-cgpa.js";

test("required SGPA uses the credit-weighted identity", () => {
  const result = planTargetCgpa({
    currentCgpa: 8,
    completedCredits: 80,
    targetCgpa: 8.5,
    remainingCredits: 40,
  });
  assert.equal(result.requiredAverageSgpa, 9.5);
  assert.equal(result.feasible, true);
});

test("impossible target above grade cap", () => {
  const result = planTargetCgpa({
    currentCgpa: 6,
    completedCredits: 100,
    targetCgpa: 9,
    remainingCredits: 20,
    gradeCap: 10,
  });
  assert.equal(result.feasible, false);
  assert.equal(result.reason, "impossible_above_cap");
  assert.ok(result.maxCgpa < 9);
});

test("zero remaining credits", () => {
  const result = planTargetCgpa({
    currentCgpa: 8.2,
    completedCredits: 120,
    targetCgpa: 8.5,
    remainingCredits: 0,
  });
  assert.equal(result.reason, "no_remaining_credits");
  assert.equal(result.feasible, false);
});

test("already met with no remaining work", () => {
  const result = planTargetCgpa({
    currentCgpa: 8.6,
    completedCredits: 120,
    targetCgpa: 8.5,
    remainingCredits: 0,
  });
  assert.equal(result.reason, "already_met");
});

test("rounding to two decimals", () => {
  const result = planTargetCgpa({
    currentCgpa: 7.33,
    completedCredits: 21,
    targetCgpa: 8,
    remainingCredits: 22,
  });
  assert.equal(result.requiredAverageSgpa, Number(result.requiredAverageSgpa.toFixed(2)));
});

test("malformed inputs", () => {
  assert.ok(planTargetCgpa({ currentCgpa: "x", completedCredits: 10, targetCgpa: 8, remainingCredits: 10 }).issues.includes("invalid_cgpa"));
});
