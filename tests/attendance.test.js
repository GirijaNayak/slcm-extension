import assert from "node:assert/strict";
import test from "node:test";
import {
  attendancePercent,
  classesNeeded,
  classifyStatus,
  consecutiveRecovery,
  enhanceRecord,
  safeSkips,
  simulateFuture,
} from "../src/calculations/attendance.js";

test("percentage uses actual counts", () => {
  assert.equal(attendancePercent(15, 20).percent, 75);
  assert.equal(attendancePercent(0, 8).percent, 0);
});

test("zero totals and invalid values", () => {
  assert.equal(attendancePercent(0, 0).ok, false);
  assert.ok(attendancePercent(-1, 10).issues.includes("invalid_present"));
  assert.ok(attendancePercent(12, 10).issues.includes("present_exceeds_total"));
});

test("safe skips at 75%", () => {
  assert.equal(safeSkips(16, 20, 75).skips, 1);
  assert.equal(safeSkips(15, 20, 75).skips, 0);
  assert.equal(safeSkips(10, 20, 75).skips, 0);
});

test("classes needed at 75%", () => {
  assert.equal(classesNeeded(10, 20, 75).needed, 20);
  assert.equal(classesNeeded(15, 20, 75).needed, 0);
});

test("invalid threshold", () => {
  assert.equal(safeSkips(10, 10, 0).ok, false);
  assert.equal(classesNeeded(10, 10, 120).ok, false);
});

test("perfect attendance requirement cannot recover from a miss", () => {
  const result = classesNeeded(9, 10, 100);
  assert.equal(result.needed, null);
  assert.equal(result.reason, "impossible_unless_all_present");
});

test("future miss simulation is labeled hypothetical", () => {
  const sim = simulateFuture(16, 20, 0, 1, 75);
  assert.equal(sim.percent, 76.19);
  assert.match(sim.assumption, /hypothetical/i);
});

test("consecutive recovery explains the attend streak", () => {
  const result = consecutiveRecovery(10, 20, 75);
  assert.equal(result.needed, 20);
  assert.match(result.explanation, /20/);
});

test("status bands", () => {
  assert.equal(classifyStatus(80, 75, 5).code, "safe");
  assert.equal(classifyStatus(76, 75, 5).code, "borderline");
  assert.equal(classifyStatus(60, 75, 5).code, "low");
});

test("enhanceRecord keeps subject and adds intel", () => {
  const row = enhanceRecord({ subject: "Math", present: 10, total: 20 }, 75);
  assert.equal(row.classesNeeded, 20);
  assert.equal(row.status.code, "low");
});
