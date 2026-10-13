import assert from "node:assert/strict";
import test from "node:test";
import { calculateRequiredEte, DEFAULT_ETE_MAX, THEORY_TARGET_MIN_MARKS } from "../src/calculations/ete-required.js";

// 1. Required marks for each supported theory target
test("ETE Target: Required marks for each supported theory target with known MTE and CWS", () => {
  // Let MTE = 24 (out of 30), CWS = 26 (out of 30) -> Internal subtotal = 50
  // Target A+ (82): 82 - 50 = 32 / 40 (Achievable)
  const aPlus = calculateRequiredEte({ targetGrade: "A+", mte: 24, cws: 26 });
  assert.equal(aPlus.ok, true);
  assert.equal(aPlus.feasibility, "achievable");
  assert.equal(aPlus.requiredETE, 32);
  assert.equal(aPlus.percentOfEte, 80);

  // Target A (72): 72 - 50 = 22 / 40 (Achievable)
  const a = calculateRequiredEte({ targetGrade: "A", mte: 24, cws: 26 });
  assert.equal(a.requiredETE, 22);
  assert.equal(a.feasibility, "achievable");

  // Target B (62): 62 - 50 = 12 / 40 (Achievable)
  const b = calculateRequiredEte({ targetGrade: "B", mte: 24, cws: 26 });
  assert.equal(b.requiredETE, 12);
  assert.equal(b.feasibility, "achievable");

  // Target C (52): 52 - 50 = 2 / 40 (Achievable)
  const c = calculateRequiredEte({ targetGrade: "C", mte: 24, cws: 26 });
  assert.equal(c.requiredETE, 2);
  assert.equal(c.feasibility, "achievable");

  // Target D (42): 50 >= 42 -> Already secured! Required: 0
  const d = calculateRequiredEte({ targetGrade: "D", mte: 24, cws: 26 });
  assert.equal(d.feasibility, "already_secured");
  assert.equal(d.requiredETE, 0);
  assert.ok(d.unclampedRequired <= 0);
});

// 2. Impossible target when required score exceeds ETE max
test("ETE Target: Impossible target flagged when required exceeds ETE max", () => {
  // Let MTE = 12, CWS = 15 -> Subtotal = 27
  // Target A+ (82): 82 - 27 = 55 / 40 -> IMPOSSIBLE!
  const res = calculateRequiredEte({ targetGrade: "A+", mte: 12, cws: 15, eteMax: 40 });
  assert.equal(res.ok, true);
  assert.equal(res.feasibility, "impossible");
  assert.equal(res.requiredETE, 55); // Does NOT clamp impossible to 40!
  assert.equal(res.eteMax, 40);
  assert.match(res.message, /exceeds the maximum possible score/i);
});

// 3. Pending CWS without estimate vs. with estimate
test("ETE Target: Pending CWS handling", () => {
  // MTE = 20, CWS pending (null)
  const pending = calculateRequiredEte({ targetGrade: "A", mte: 20, cws: null });
  assert.equal(pending.ok, true);
  assert.equal(pending.cwsPending, true);
  assert.equal(pending.feasibility, "cws_pending");
  assert.equal(pending.requiredETE, null); // Cannot give definitive ETE without CWS
  assert.equal(pending.unclampedRequired, 52); // 72 - 20 = 52 needed across CWS + ETE

  // Now user provides scenario estimate for CWS = 25
  const withEstimate = calculateRequiredEte({ targetGrade: "A", mte: 20, cws: null, cwsEstimate: 25 });
  assert.equal(withEstimate.ok, true);
  assert.equal(withEstimate.cwsPending, false);
  assert.equal(withEstimate.cwsEstimated, true);
  assert.equal(withEstimate.internalSubtotal, 45);
  assert.equal(withEstimate.requiredETE, 27); // 72 - 45 = 27
  assert.equal(withEstimate.feasibility, "achievable");
});

// 4. Exclusion of Labs and PBL
test("ETE Target: Labs and PBL are strictly excluded", () => {
  const lab = calculateRequiredEte({ targetGrade: "A", mte: 20, cws: 20, courseType: "lab" });
  assert.equal(lab.eligible, false);
  assert.equal(lab.feasibility, "ineligible");

  const pbl = calculateRequiredEte({ targetGrade: "A", mte: 20, cws: 20, courseType: "pbl" });
  assert.equal(pbl.eligible, false);
  assert.equal(pbl.feasibility, "ineligible");
});

// 5. Invalid inputs and unknown target grades
test("ETE Target: Invalid inputs and unknown target grades", () => {
  assert.equal(calculateRequiredEte({ targetGrade: "UNKNOWN", mte: 20, cws: 20 }).feasibility, "undefined_target");
  assert.equal(calculateRequiredEte({ targetGrade: "A", mte: -5, cws: 20 }).feasibility, "invalid_input");
  assert.equal(calculateRequiredEte({ targetGrade: "A", mte: "abc", cws: 20 }).feasibility, "invalid_input");
});

// 6. Recalculation stability when marks update
test("ETE Target: Dynamic updates when marks change", () => {
  const initial = calculateRequiredEte({ targetGrade: "B", mte: 20, cws: 20 }); // subtotal = 40, need 22
  assert.equal(initial.requiredETE, 22);

  // MTE re-evaluated / updated to 25
  const updated = calculateRequiredEte({ targetGrade: "B", mte: 25, cws: 20 }); // subtotal = 45, need 17
  assert.equal(updated.requiredETE, 17);
});
