import assert from "node:assert/strict";
import test from "node:test";
import { compareScenarios, computeCgpa } from "../src/calculations/cgpa.js";

test("credit-weighted CGPA matches the handbook example", () => {
  const result = computeCgpa({
    currentCgpa: 8.48,
    completedCredits: 25,
    semesters: [
      { sgpa: 8.62, credits: 25 },
      { sgpa: 8.24, credits: 26 },
      { sgpa: 8.42, credits: 26 },
    ],
  });
  assert.equal(result.finalCgpa, 8.44);
  assert.equal(result.totalCredits, 102);
});

test("different credit loads are not averaged equally", () => {
  const equal = computeCgpa({
    currentCgpa: 8,
    completedCredits: 20,
    semesters: [{ sgpa: 10, credits: 20 }],
  });
  const uneven = computeCgpa({
    currentCgpa: 8,
    completedCredits: 20,
    semesters: [{ sgpa: 10, credits: 5 }],
  });
  assert.equal(equal.finalCgpa, 9);
  assert.equal(uneven.finalCgpa, 8.4);
});

test("invalid inputs", () => {
  assert.equal(computeCgpa({ currentCgpa: -1, completedCredits: 10, semesters: [] }).ok, false);
});

test("scenario comparison", () => {
  const compared = compareScenarios(
    { currentCgpa: 7.5, completedCredits: 40 },
    [
      { id: "a", name: "A", semesters: [{ sgpa: 9, credits: 20 }] },
      { id: "b", name: "B", semesters: [{ sgpa: 8, credits: 20 }] },
    ],
  );
  assert.ok(compared[0].result.finalCgpa > compared[1].result.finalCgpa);
});
