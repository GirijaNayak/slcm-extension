import assert from "node:assert/strict";
import test from "node:test";
import {
  classifyCourseType,
  classifyProvisionalGrade,
  LAB_PBL_GRADE_THRESHOLDS,
  RELATIVE_GRADING_DISCLAIMER,
  THEORY_GRADE_THRESHOLDS,
} from "../src/calculations/provisional-grade.js";

// 1. All supplied theory thresholds
test("Theory thresholds: A+ >= 82, A >= 72, B >= 62, C >= 52, D >= 42, E > 35 and < 42, F < 35", () => {
  assert.equal(classifyProvisionalGrade(85, "theory").grade, "A+");
  assert.equal(classifyProvisionalGrade(75, "theory").grade, "A");
  assert.equal(classifyProvisionalGrade(65, "theory").grade, "B");
  assert.equal(classifyProvisionalGrade(55, "theory").grade, "C");
  assert.equal(classifyProvisionalGrade(45, "theory").grade, "D");
  assert.equal(classifyProvisionalGrade(38, "theory").grade, "E");
  assert.equal(classifyProvisionalGrade(30, "theory").grade, "F");
  assert.equal(classifyProvisionalGrade(0, "theory").grade, "F");
});

// 2. All supplied lab and PBL thresholds
test("Lab/PBL thresholds: A+ >= 90, A >= 80, B >= 70, C >= 60, D >= 50, E > 35 and < 50, F < 35", () => {
  ["lab", "pbl"].forEach((type) => {
    assert.equal(classifyProvisionalGrade(92, type).grade, "A+");
    assert.equal(classifyProvisionalGrade(82, type).grade, "A");
    assert.equal(classifyProvisionalGrade(72, type).grade, "B");
    assert.equal(classifyProvisionalGrade(62, type).grade, "C");
    assert.equal(classifyProvisionalGrade(52, type).grade, "D");
    assert.equal(classifyProvisionalGrade(45, type).grade, "E");
    assert.equal(classifyProvisionalGrade(28, type).grade, "F");
    assert.equal(classifyProvisionalGrade(0, type).grade, "F");
  });
});

// 3. Exact boundaries for theory (35, 42, 52, 62, 72, 82)
test("Theory exact boundary testing", () => {
  // 82 boundary
  assert.equal(classifyProvisionalGrade(82, "theory").grade, "A+");
  assert.equal(classifyProvisionalGrade(81.99, "theory").grade, "A");

  // 72 boundary
  assert.equal(classifyProvisionalGrade(72, "theory").grade, "A");
  assert.equal(classifyProvisionalGrade(71.99, "theory").grade, "B");

  // 62 boundary
  assert.equal(classifyProvisionalGrade(62, "theory").grade, "B");
  assert.equal(classifyProvisionalGrade(61.99, "theory").grade, "C");

  // 52 boundary
  assert.equal(classifyProvisionalGrade(52, "theory").grade, "C");
  assert.equal(classifyProvisionalGrade(51.99, "theory").grade, "D");

  // 42 boundary
  assert.equal(classifyProvisionalGrade(42, "theory").grade, "D");
  assert.equal(classifyProvisionalGrade(41.99, "theory").grade, "E");

  // Exactly 35 is undefined under the supplied rules
  const boundary35 = classifyProvisionalGrade(35, "theory");
  assert.equal(boundary35.ok, false);
  assert.equal(boundary35.grade, null);
  assert.equal(boundary35.status, "undefined_boundary");
  assert.equal(boundary35.isBoundaryAmbiguous, true);

  // Just above 35 is E
  assert.equal(classifyProvisionalGrade(35.01, "theory").grade, "E");
  // Just below 35 is F
  assert.equal(classifyProvisionalGrade(34.99, "theory").grade, "F");
});

// 4. Exact boundaries for labs/PBL (35, 50, 60, 70, 80, 90)
test("Lab/PBL exact boundary testing", () => {
  // 90 boundary
  assert.equal(classifyProvisionalGrade(90, "lab").grade, "A+");
  assert.equal(classifyProvisionalGrade(89.99, "lab").grade, "A");

  // 80 boundary
  assert.equal(classifyProvisionalGrade(80, "lab").grade, "A");
  assert.equal(classifyProvisionalGrade(79.99, "lab").grade, "B");

  // 70 boundary
  assert.equal(classifyProvisionalGrade(70, "lab").grade, "B");
  assert.equal(classifyProvisionalGrade(69.99, "lab").grade, "C");

  // 60 boundary
  assert.equal(classifyProvisionalGrade(60, "lab").grade, "C");
  assert.equal(classifyProvisionalGrade(59.99, "lab").grade, "D");

  // 50 boundary
  assert.equal(classifyProvisionalGrade(50, "lab").grade, "D");
  assert.equal(classifyProvisionalGrade(49.99, "lab").grade, "E");

  // Exactly 35 is undefined
  const boundary35 = classifyProvisionalGrade(35, "lab");
  assert.equal(boundary35.ok, false);
  assert.equal(boundary35.status, "undefined_boundary");
  assert.equal(boundary35.grade, null);

  assert.equal(classifyProvisionalGrade(35.01, "lab").grade, "E");
  assert.equal(classifyProvisionalGrade(34.99, "lab").grade, "F");
});

// 5. Course type classification helper
test("classifyCourseType identifies theory, lab, and PBL accurately", () => {
  assert.equal(classifyCourseType({ courseName: "ENGINEERING CHEMISTRY" }), "theory");
  assert.equal(classifyCourseType({ courseName: "DATA STRUCTURES AND ALGORITHMS LAB" }), "lab");
  assert.equal(classifyCourseType({ courseName: "ELECTRICAL & ELECTRONICS WORKSHOP" }), "lab");
  assert.equal(classifyCourseType({ courseName: "PROJECT BASED LEARNING 1" }), "pbl");
  assert.equal(classifyCourseType({ courseCode: "CSE2170", courseName: "PBL-1" }), "pbl");
  assert.equal(classifyCourseType({ courseCode: "CSE2131" }), "lab"); // ends with digit, but let's test explicit
});

// 6. Unknown course type handling
test("Unknown course type returns unknown_type status", () => {
  const res = classifyProvisionalGrade(85, "seminar");
  assert.equal(res.ok, false);
  assert.equal(res.status, "unknown_type");
  assert.equal(res.grade, null);
});

// 7. Missing and invalid marks handling
test("Missing, null, and negative marks handling", () => {
  assert.equal(classifyProvisionalGrade(null, "theory").status, "missing_marks");
  assert.equal(classifyProvisionalGrade(undefined, "theory").status, "missing_marks");
  assert.equal(classifyProvisionalGrade("", "theory").status, "missing_marks");
  assert.equal(classifyProvisionalGrade(-5, "theory").status, "invalid_marks");
  assert.equal(classifyProvisionalGrade("abc", "theory").status, "invalid_marks");
});

// 8. Relative grading disclaimer is always present
test("Relative grading disclaimer is included in all calculation results", () => {
  const res = classifyProvisionalGrade(78, "theory");
  assert.ok(res.disclaimer.includes("relative grading system"));
  assert.ok(res.disclaimer.includes("SGPA and Grade Prediction Is Only an Estimate"));
  assert.equal(res.disclaimer, RELATIVE_GRADING_DISCLAIMER);
});

// 9. Technical Writing Clinic and MATLAB with theory components are classified as theory
test("Technical Writing Clinic and MATLAB with theory marks are classified as theory, not lab", () => {
  assert.equal(
    classifyCourseType({ courseCode: "LLC1010", courseName: "TECHNICAL WRITING CLINIC 1", mte1: 23, cws: 22 }),
    "theory"
  );
  assert.equal(
    classifyCourseType({ courseCode: "MEE1006", courseName: "MATLAB FOR ENGINEERS", mte1: 11, cws: 29.25 }),
    "theory"
  );
  assert.equal(
    classifyCourseType({ courseName: "PROBLEM SOLVING USING COMPUTERS LAB", prs: 53 }),
    "lab"
  );
});

