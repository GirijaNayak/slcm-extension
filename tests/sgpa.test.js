import assert from "node:assert/strict";
import test from "node:test";
import {
  calculateSGPA,
  computeSgpa,
  gradePointForLetter,
  letterForPoint,
  predictLetterFromAbsolute,
} from "../src/calculations/sgpa.js";
import {
  getGradePoint,
  isGradeEvaluative,
  isGradeSupported,
  isNonEvaluativeGrade,
  isSatisfactorySubject,
  MUJ_GRADE_POINT_MAP,
  normalizeGrade,
} from "../src/calculations/grade-points.js";

// 1. Credit-weighted SGPA with multiple courses
test("Case 1: Credit-weighted SGPA with multiple courses", () => {
  const courses = [
    { courseCode: "CS101", credits: 4, grade: "A" },  // 4 * 9 = 36
    { courseCode: "CS102", credits: 3, grade: "B" },  // 3 * 8 = 24
    { courseCode: "CS103", credits: 3, grade: "A+" }, // 3 * 10 = 30
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.ok, true);
  assert.equal(res.status, "complete");
  assert.equal(res.totalCredits, 10);
  assert.equal(res.gradedCredits, 10);
  assert.equal(res.totalWeightedPoints, 90);
  assert.equal(res.sgpa, 9.0);
});

// 2. Unequal course credits (weights properly; not simple average)
test("Case 2: Unequal course credits are weighted, not simple average", () => {
  // Course 1: 5 credits, Grade A+ (10) -> 50 pts
  // Course 2: 1 credit, Grade C (7) -> 7 pts
  // Weighted SGPA: (50 + 7) / 6 = 57 / 6 = 9.5
  // Simple unweighted average would be: (10 + 7) / 2 = 8.5
  const courses = [
    { courseCode: "HEAVY", credits: 5, grade: "A+" },
    { courseCode: "LIGHT", credits: 1, grade: "C" },
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.sgpa, 9.5);
  assert.notEqual(res.sgpa, 8.5);
});

// 3. Grade normalization (handles whitespace, lowercase, formatting)
test("Case 3: Grade normalization handles whitespace and case", () => {
  assert.equal(normalizeGrade("  a+ "), "A+");
  assert.equal(normalizeGrade("b"), "B");
  assert.equal(normalizeGrade(" c "), "C");
  assert.equal(normalizeGrade(null), "");
  assert.equal(normalizeGrade(undefined), "");

  const courses = [
    { courseCode: "CS1", credits: 2, grade: " a+ " },
    { courseCode: "CS2", credits: 2, grade: "b" },
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.ok, true);
  assert.equal(res.sgpa, 9.0);
});

// 4. Authoritative certificate grade point mapping (A+=10, A=9, B=8, C=7, D=6, E=5, F=0)
test("Case 4: Verified MUJ letter-to-grade-point mapping", () => {
  assert.equal(getGradePoint("A+"), 10);
  assert.equal(getGradePoint("A"), 9);
  assert.equal(getGradePoint("B"), 8);
  assert.equal(getGradePoint("C"), 7);
  assert.equal(getGradePoint("D"), 6);
  assert.equal(getGradePoint("E"), 5);
  assert.equal(getGradePoint("F"), 0);
  assert.equal(getGradePoint("I"), 0);
  assert.equal(getGradePoint("DT"), 0);

  assert.equal(isGradeSupported("A+"), true);
  assert.equal(isGradeSupported("E"), true);
  assert.equal(isGradeSupported("Z"), false);

  assert.equal(isGradeEvaluative("A"), true);
  assert.equal(isGradeEvaluative("F"), true);
  assert.equal(isGradeEvaluative("S"), false);
});

// 5. Invalid and zero credits handling
test("Case 5: Invalid and non-numeric credits flagged as warning without crashing", () => {
  const courses = [
    { courseCode: "GOOD", credits: 4, grade: "A" },
    { courseCode: "BAD_NAN", credits: "abc", grade: "B" },
    { courseCode: "BAD_NEG", credits: -2, grade: "A" },
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.status, "incomplete");
  assert.ok(res.warnings.includes("invalid_credits"));
  assert.equal(res.gradedCredits, 4);
  assert.equal(res.sgpa, 9.0); // Computes for valid courses while marking status incomplete
});

// 6. Empty course list handling
test("Case 6: Empty course list returns incomplete status gracefully", () => {
  const res = calculateSGPA([]);
  assert.equal(res.ok, false);
  assert.equal(res.status, "incomplete");
  assert.equal(res.sgpa, null);
  assert.equal(res.totalCredits, 0);
  assert.ok(res.warnings.includes("empty_courses"));
});

// 7. Zero total credits handling (prevents division by zero)
test("Case 7: Zero total credits prevents division by zero", () => {
  const courses = [
    { courseCode: "ZERO1", credits: 0, grade: "A" },
    { courseCode: "ZERO2", credits: 0, grade: "B" },
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.ok, false);
  assert.equal(res.sgpa, null);
  assert.equal(res.gradedCredits, 0);
  assert.ok(res.warnings.includes("zero_credits"));
});

// 8. Unknown letter grades (does NOT silently treat as 0)
test("Case 8: Unknown letter grades marked with warning and calculation incomplete", () => {
  const courses = [
    { courseCode: "CS101", credits: 4, grade: "A" },
    { courseCode: "UNKNOWN", credits: 4, grade: "XYZ" }, // unsupported grade
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.status, "incomplete");
  assert.ok(res.warnings.includes("unknown_grade"));
  // Unknown grade should NOT contribute 0 points to gradedCredits
  assert.equal(res.gradedCredits, 4);
  const unknownCourse = res.courses.find((c) => c.courseCode === "UNKNOWN");
  assert.equal(unknownCourse.status, "unknown_grade");
  assert.equal(unknownCourse.gradePoints, null);
});

// 9. Missing grade values handling
test("Case 9: Missing grade values marked with warning and calculation incomplete", () => {
  const courses = [
    { courseCode: "CS101", credits: 4, grade: "A" },
    { courseCode: "NO_GRADE", credits: 4, grade: null },
    { courseCode: "EMPTY_GRADE", credits: 3, grade: "   " },
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.status, "incomplete");
  assert.ok(res.warnings.includes("missing_grade"));
  assert.equal(res.gradedCredits, 4);
});

// 10. Special grades (Grade S, U, AP excluded from GPA divisor per MUJ regulations)
test("Case 10: Special grade S (Satisfactory) contributes to total credits but excluded from GPA divisor", () => {
  assert.equal(isNonEvaluativeGrade("S"), true);
  assert.equal(isNonEvaluativeGrade("U"), true);
  assert.equal(isNonEvaluativeGrade("AP"), true);
  assert.equal(isNonEvaluativeGrade("A"), false);

  const courses = [
    { courseCode: "CS101", credits: 4, grade: "A" },  // 4 * 9 = 36
    { courseCode: "MEE1007", credits: 2, grade: "S" }, // Satisfactory (2 credits earned, 0 grade points)
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.ok, true);
  assert.equal(res.totalCredits, 6);   // 4 + 2 = 6 total credits
  assert.equal(res.gradedCredits, 4);  // 4 graded credits
  assert.equal(res.totalWeightedPoints, 36);
  assert.equal(res.sgpa, 9.0); // 36 / 4 = 9.0 (NOT 36 / 6 = 6.0!)
});

// 11. Duplicate table rows deduplication
test("Case 11: Duplicate table rows are deduplicated", () => {
  const courses = [
    { courseCode: "CSE2101", credits: 4, grade: "B", session: "JUL-NOV 2025" },
    { courseCode: "CSE2101", credits: 4, grade: "B", session: "JUL-NOV 2025" }, // duplicate row
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.totalCount, 1);
  assert.equal(res.totalCredits, 4);
  assert.equal(res.sgpa, 8.0);
});

// 12. Display rounding to two decimal places
test("Case 12: Display rounding to two decimal places", () => {
  // Course 1: 3 credits, Grade A (9) -> 27 pts
  // Course 2: 4 credits, Grade B (8) -> 32 pts
  // Course 3: 4 credits, Grade C (7) -> 28 pts
  // Total: 87 / 11 = 7.909090... -> rounded: 7.91
  const courses = [
    { credits: 3, grade: "A" },
    { credits: 4, grade: "B" },
    { credits: 4, grade: "C" },
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.sgpa, 7.91);
  assert.ok(Math.abs(res.rawSgpa - (87 / 11)) < 1e-9);
});

// 13. Incomplete calculation tracking
test("Case 13: Incomplete calculations accurately flagged", () => {
  const courses = [
    { courseCode: "C1", credits: 3, grade: "A" },
    { courseCode: "C2", credits: null, grade: "B" },
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.status, "incomplete");
  assert.equal(res.ok, false);
});

// 14. Authoritative certificate semester regression example (212 / 25 = 8.48)
test("Case 14: Certificate regression test - 25 credits, 212 points = 8.48 SGPA", () => {
  const certificateCourses = [
    { courseName: "Engineering Mathematics-I", credits: 4, grade: "A" },   // 4 * 9 = 36
    { courseName: "Mechanics of Solids", credits: 4, grade: "A+" },         // 4 * 10 = 40
    { courseName: "Basic Electronics", credits: 4, grade: "B" },            // 4 * 8 = 32
    { courseName: "Mechanical Engineering Science", credits: 4, grade: "C" },// 4 * 7 = 28
    { courseName: "Engineering Physics", credits: 4, grade: "B" },          // 4 * 8 = 32
    { courseName: "Communication Skills in English", credits: 3, grade: "A" },// 3 * 9 = 27
    { courseName: "Basic Workshop Practice", credits: 1, grade: "A" },      // 1 * 9 = 9
    { courseName: "Engineering Physics Lab", credits: 1, grade: "B" },      // 1 * 8 = 8
  ];
  const res = calculateSGPA(certificateCourses);
  assert.equal(res.ok, true);
  assert.equal(res.totalCredits, 25);
  assert.equal(res.gradedCredits, 25);
  assert.equal(res.totalWeightedPoints, 212);
  assert.equal(res.sgpa, 8.48);
  assert.equal(res.formula, "SGPA = Σ(Ci × Gi) / ΣCi");
  assert.equal(res.substitutedFormula, "SGPA = 212 / 25 = 8.48");
});

// 15. Student official Semester II live regression data (JAN-MAY 2025)
test("Case 15: Student Semester II official data yields exact 8.44 SGPA", () => {
  const sem2Courses = [
    { courseCode: "CHY1001", credits: 4, grade: "B", session: "JAN-MAY 2025" },  // 32
    { courseCode: "CSE1002", credits: 3, grade: "A+", session: "JAN-MAY 2025" }, // 30
    { courseCode: "CSE1031", credits: 1, grade: "A", session: "JAN-MAY 2025" },  // 9
    { courseCode: "ECE1030", credits: 1, grade: "B", session: "JAN-MAY 2025" },  // 8
    { courseCode: "EEE1002", credits: 4, grade: "A", session: "JAN-MAY 2025" },  // 36
    { courseCode: "LLC1010", credits: 1, grade: "C", session: "JAN-MAY 2025" },  // 7
    { courseCode: "MAS1001", credits: 3, grade: "B", session: "JAN-MAY 2025" },  // 24
    { courseCode: "MEE1007", credits: 2, grade: "S", session: "JAN-MAY 2025" },  // S (0 pts, 2 cr)
    { courseCode: "MEE1035", credits: 1, grade: "D", session: "JAN-MAY 2025" },  // 6
  ];
  const res = calculateSGPA(sem2Courses, { expectedTotalCredits: 20, semester: "JAN-MAY 2025" });
  assert.equal(res.ok, true);
  assert.equal(res.totalCredits, 20);
  assert.equal(res.gradedCredits, 18);
  assert.equal(res.totalWeightedPoints, 152);
  assert.equal(res.sgpa, 8.44);
  assert.equal(res.semester, "JAN-MAY 2025");
});

// 16. Student official Semester III live regression data (JUL-NOV 2025)
test("Case 16: Student Semester III official data yields exact 8.08 SGPA", () => {
  const sem3Courses = [
    { courseCode: "CSE2101", credits: 4, grade: "C", session: "JUL-NOV 2025" },  // 4 * 7 = 28
    { courseCode: "CSE2102", credits: 4, grade: "B", session: "JUL-NOV 2025" },  // 4 * 8 = 32
    { courseCode: "CSE2103", credits: 4, grade: "B", session: "JUL-NOV 2025" },  // 4 * 8 = 32
    { courseCode: "CSE2122", credits: 4, grade: "A+", session: "JUL-NOV 2025" }, // 4 * 10 = 40
    { courseCode: "CSE2131", credits: 1, grade: "B", session: "JUL-NOV 2025" },  // 1 * 8 = 8
    { courseCode: "CSE2132", credits: 1, grade: "C", session: "JUL-NOV 2025" },  // 1 * 7 = 7
    { courseCode: "CSE2170", credits: 1, grade: "A+", session: "JUL-NOV 2025" }, // 1 * 10 = 10
    { courseCode: "MAS2001", credits: 3, grade: "C", session: "JUL-NOV 2025" },  // 3 * 7 = 21
    { courseCode: "MBB2101", credits: 3, grade: "B", session: "JUL-NOV 2025" },  // 3 * 8 = 24
  ];
  const res = calculateSGPA(sem3Courses, { expectedTotalCredits: 25, semester: "JUL-NOV 2025" });
  assert.equal(res.ok, true);
  assert.equal(res.totalCredits, 25);
  assert.equal(res.gradedCredits, 25);
  assert.equal(res.totalWeightedPoints, 202);
  assert.equal(res.sgpa, 8.08);
  assert.equal(res.semester, "JUL-NOV 2025");
});

// 17. Discrepancy handling: Total footer mismatch
test("Case 17: Total footer mismatch triggers credit_mismatch warning", () => {
  const courses = [
    { courseCode: "CS1", credits: 4, grade: "A" },
    { courseCode: "CS2", credits: 4, grade: "B" },
  ];
  const res = calculateSGPA(courses, { expectedTotalCredits: 12 }); // footer shows 12, courses sum to 8
  assert.ok(res.warnings.includes("credit_mismatch"));
});

// 18. Prediction simulation and absolute prediction
test("Case 18: Grade prediction and simulation", () => {
  const result = predictLetterFromAbsolute(91, [{ letter: "A+", minPercent: 90 }]);
  assert.equal(result.letter, "A+");
  assert.match(result.assumption, /not official/i);
});

// 19. Satisfactory / Unsatisfactory subject detection and SGPA exclusion
test("Case 19: isSatisfactorySubject detects S/U subjects and excludes from SGPA calculation", () => {
  assert.equal(isSatisfactorySubject({ courseCode: "MEE1007" }), true);
  assert.equal(isSatisfactorySubject({ courseName: "CREATIVITY & INNOVATION" }), true);
  assert.equal(isSatisfactorySubject({ courseCode: "LAS1010", officialGrade: "S" }), true);
  assert.equal(isSatisfactorySubject({ courseCode: "CUSTOM101" }, { CUSTOM101: true }), true);
  assert.equal(isSatisfactorySubject({ courseCode: "CHY1001", courseName: "ENGINEERING CHEMISTRY" }), false);
  assert.equal(isSatisfactorySubject({ courseCode: "LLC1010", courseName: "TECHNICAL WRITING CLINIC 1" }), false);

  const courses = [
    { courseCode: "CHY1001", credits: 4, grade: "B" }, // 4 * 8 = 32
    { courseCode: "MEE1007", credits: 2, grade: "S", excludeFromGpa: true }, // S excluded
    { courseCode: "LLC1010", credits: 1, grade: "C" }, // 1 * 7 = 7
  ];
  const res = calculateSGPA(courses);
  assert.equal(res.ok, true);
  assert.equal(res.totalCredits, 7); // 4 + 2 + 1
  assert.equal(res.gradedCredits, 5); // 4 + 1
  assert.equal(res.totalWeightedPoints, 39); // 32 + 7
  assert.equal(res.sgpa, 7.8); // 39 / 5 = 7.8
});
