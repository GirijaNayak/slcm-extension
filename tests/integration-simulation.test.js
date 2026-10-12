import assert from "node:assert/strict";
import test from "node:test";
import { analyzeSchedule } from "../src/data/timetable-adapter.js";
import { attendancePercent, classesNeeded, safeSkips, simulateFuture } from "../src/calculations/attendance.js";
import { planTargetCgpa } from "../src/calculations/target-cgpa.js";
import { requiredScore, sumAssessments, weightedTotal } from "../src/calculations/marks.js";
import { computeCgpa } from "../src/calculations/cgpa.js";
import { computeSgpa } from "../src/calculations/sgpa.js";
import { SessionExpiredError } from "../src/data/slcm-client.js";

test("timetable schedule analysis detects current and upcoming classes", () => {
  const base = new Date();
  const startNow = new Date(base.getTime() - 20 * 60000).toISOString();
  const endNow = new Date(base.getTime() + 40 * 60000).toISOString();
  const startNext = new Date(base.getTime() + 60 * 60000).toISOString();
  const endNext = new Date(base.getTime() + 110 * 60000).toISOString();

  const events = [
    { title: "Machine Learning", start: startNow, end: endNow, room: "LT-201" },
    { title: "Cloud Computing", start: startNext, end: endNext, room: "Lab-3" },
  ];

  const analysis = analyzeSchedule(events, base);
  assert.equal(analysis.current?.title, "Machine Learning");
  assert.equal(analysis.current?.room, "LT-201");
  assert.equal(analysis.upcoming?.title, "Cloud Computing");
});

test("timetable schedule analysis flags overlapping conflict slots", () => {
  const base = new Date();
  const startA = new Date(base.getTime() + 10 * 60000).toISOString();
  const endA = new Date(base.getTime() + 70 * 60000).toISOString();
  const startB = new Date(base.getTime() + 30 * 60000).toISOString(); // Overlaps A
  const endB = new Date(base.getTime() + 90 * 60000).toISOString();

  const events = [
    { title: "Elective 1", start: startA, end: endA },
    { title: "Elective 2", start: startB, end: endB },
  ];

  const analysis = analyzeSchedule(events, base);
  assert.equal(analysis.conflicts.length, 1);
  assert.equal(analysis.conflicts[0].a.title, "Elective 1");
  assert.equal(analysis.conflicts[0].b.title, "Elective 2");
});

test("timetable gap analysis detects breaks between classes", () => {
  const today = new Date();
  today.setHours(9, 0, 0, 0);

  const class1End = new Date(today);
  class1End.setHours(10, 0, 0, 0);

  const class2Start = new Date(today);
  class2Start.setHours(11, 0, 0, 0); // 60 min gap

  const class2End = new Date(today);
  class2End.setHours(12, 0, 0, 0);

  const events = [
    { title: "Lecture 1", start: today.toISOString(), end: class1End.toISOString() },
    { title: "Lecture 2", start: class2Start.toISOString(), end: class2End.toISOString() },
  ];

  const analysis = analyzeSchedule(events, today);
  assert.equal(analysis.gaps.length, 1);
  assert.equal(analysis.gaps[0].minutes, 60);
});

test("attendance simulator handles simultaneous attending and missing", () => {
  // Currently 18/24 (75%). Attend 4, miss 2 -> 22/30 (73.33%)
  const sim = simulateFuture(18, 24, 4, 2, 75);
  assert.equal(sim.present, 22);
  assert.equal(sim.total, 30);
  assert.equal(sim.percent, 73.33);
  assert.equal(sim.safeSkips, 0);
  assert.ok(sim.classesNeeded > 0);
});

test("attendance safe skips exact boundary behavior at 75%", () => {
  // 15/20 = 75.0%. Cannot miss any class without falling below 75%
  assert.equal(safeSkips(15, 20, 75).skips, 0);
  // 16/20 = 80.0%. Can miss 1 class (16/21 = 76.19% >= 75%)
  assert.equal(safeSkips(16, 20, 75).skips, 1);
  // 18/20 = 90.0%. 18/0.75 = 24. 24 - 20 = 4 safe skips
  assert.equal(safeSkips(18, 20, 75).skips, 4);
});

test("classes needed exact boundary calculation", () => {
  // 14/20 = 70.0%. Need k such that (14+k)/(20+k) >= 0.75
  // 14 + k >= 15 + 0.75k => 0.25k >= 1 => k >= 4
  assert.equal(classesNeeded(14, 20, 75).needed, 4);
});

test("maximum achievable CGPA matches theoretical limit", () => {
  // Current 7.0 with 50 completed credits. 50 remaining credits with cap 10.0
  // Max points = 7*50 + 10*50 = 850. Max CGPA = 850 / 100 = 8.5
  const plan = planTargetCgpa({
    currentCgpa: 7.0,
    completedCredits: 50,
    targetCgpa: 9.0, // Impossible target
    remainingCredits: 50,
    gradeCap: 10,
  });
  assert.equal(plan.feasible, false);
  assert.equal(plan.reason, "impossible_above_cap");
  assert.equal(plan.maxCgpa, 8.5);
});

test("target CGPA calculation when current exceeds target", () => {
  const plan = planTargetCgpa({
    currentCgpa: 9.2,
    completedCredits: 80,
    targetCgpa: 8.5,
    remainingCredits: 40,
    gradeCap: 10,
  });
  assert.equal(plan.feasible, true);
  assert.equal(plan.requiredAverageSgpa, 7.1);
  assert.equal(plan.reason, "feasible");
});

test("marks requiredScore detects alreadyMet and impossible boundaries", () => {
  // Target 50, obtained 50, remaining max 40 -> alreadyMet
  const met = requiredScore({ obtained: 50, remainingMax: 40, targetTotal: 50 });
  assert.equal(met.alreadyMet, true);
  assert.equal(met.impossible, false);

  // Target 90, obtained 40, remaining max 40 -> impossible (needs 50 out of 40)
  const imp = requiredScore({ obtained: 40, remainingMax: 40, targetTotal: 90 });
  assert.equal(imp.impossible, true);
  assert.equal(imp.required, 50);
});

test("SessionExpiredError formats standard diagnostic path", () => {
  const err = new SessionExpiredError("/Student/Academic/Attendance");
  assert.equal(err.name, "SessionExpiredError");
  assert.equal(err.path, "/Student/Academic/Attendance");
  assert.match(err.message, /session expired/i);
});
