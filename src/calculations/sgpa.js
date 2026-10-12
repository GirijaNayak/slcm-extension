import {
  getGradePoint,
  isNonEvaluativeGrade,
  MUJ_GRADE_POINT_MAP,
  normalizeGrade,
} from "./grade-points.js";
import { roundTo } from "./rounding.js";

/**
 * Re-export gradePointForLetter for backwards compatibility.
 */
export function gradePointForLetter(letter, table = MUJ_GRADE_POINT_MAP) {
  const gp = getGradePoint(letter, table);
  return typeof gp === "number" ? gp : null;
}

export function letterForPoint(point, table = MUJ_GRADE_POINT_MAP) {
  const match = Object.entries(table).find(([, value]) => value === point);
  return match ? match[0] : null;
}

/**
 * Pure calculation engine for Manipal University Jaipur SGPA.
 * Authoritative reference: Certificate of GPA and CGPA Calculation Process
 *
 * Formula:
 * SGPA = Σ(Ci × Gi) / ΣCi
 *
 * Where:
 * - Ci = course credits
 * - Gi = grade points corresponding to letter grade
 * - Excludes non-evaluative courses (Grade 'S', 'U', 'AP', etc.) from divisor
 * - Flags unknown grades, invalid credits, and credit mismatches
 *
 * @param {Array<Object>} rawCourses
 * @param {Object|Record<string, number|null>} [optionsOrMap]
 * @returns {Object}
 */
export function calculateSGPA(rawCourses = [], optionsOrMap = {}) {
  // Support passing custom map directly or options object
  const options =
    optionsOrMap && typeof optionsOrMap === "object" && !optionsOrMap.gradePointMap && optionsOrMap["A"] !== undefined
      ? { gradePointMap: optionsOrMap }
      : optionsOrMap || {};

  const gradePointMap = options.gradePointMap || MUJ_GRADE_POINT_MAP;
  const expectedTotalCredits = options.expectedTotalCredits ?? null;
  const detectedSemester = options.semester || null;

  const warnings = [];
  const warningDetails = [];
  const processedCourses = [];
  const seenCourseKeys = new Set();

  let totalCredits = 0;
  let gradedCredits = 0;
  let totalWeightedPoints = 0;
  let hasIncompleteData = false;

  for (const raw of rawCourses) {
    if (!raw) continue;

    const courseCode = String(raw.courseCode || raw.CourseCode || raw.code || "").trim();
    const courseName = String(raw.courseName || raw.CourseName || raw.subject || raw.paper || "").trim();
    const rawCredits = raw.credits !== undefined ? raw.credits : raw.Credits;
    const rawGrade = raw.grade ?? raw.letter ?? raw.Grade ?? raw.OfficialGrade ?? null;
    const session = String(raw.session || raw.academicSession || raw.AcademicSession || raw.semester || "").trim();

    // Deduplicate exact duplicate rows if both courseCode and session match
    const dedupeKey = `${courseCode.toUpperCase() || courseName.toUpperCase()}::${session.toUpperCase()}`;
    if (courseCode && seenCourseKeys.has(dedupeKey)) {
      continue;
    }
    if (courseCode) {
      seenCourseKeys.add(dedupeKey);
    }

    const isCreditValid =
      rawCredits !== null &&
      rawCredits !== undefined &&
      String(rawCredits).trim() !== "" &&
      Number.isFinite(Number(rawCredits)) &&
      Number(rawCredits) >= 0;
    const credit = isCreditValid ? Number(rawCredits) : null;

    if (!isCreditValid) {
      hasIncompleteData = true;
      if (!warnings.includes("invalid_credits")) warnings.push("invalid_credits");
      warningDetails.push({
        code: "invalid_credits",
        courseCode,
        message: `Course ${courseCode || courseName || "Unknown"} has invalid credits (${rawCredits}).`,
      });
      processedCourses.push({
        courseCode,
        courseName,
        credits: null,
        rawCredits,
        grade: rawGrade,
        gradePoints: null,
        weightedPoints: 0,
        excludedFromGpa: true,
        status: "invalid_credits",
        session,
      });
      continue;
    }

    totalCredits += credit;

    // Check for missing grade
    if (rawGrade === null || rawGrade === undefined || String(rawGrade).trim() === "") {
      hasIncompleteData = true;
      if (!warnings.includes("missing_grade")) warnings.push("missing_grade");
      warningDetails.push({
        code: "missing_grade",
        courseCode,
        message: `Course ${courseCode || courseName || "Unknown"} is missing a letter grade.`,
      });
      processedCourses.push({
        courseCode,
        courseName,
        credits: credit,
        rawCredits,
        grade: null,
        gradePoints: null,
        weightedPoints: 0,
        excludedFromGpa: true,
        status: "missing_grade",
        session,
      });
      continue;
    }

    const normGrade = normalizeGrade(rawGrade);
    const isNonEval = raw.excludeFromGpa || isNonEvaluativeGrade(normGrade);

    // Non-evaluative grades (e.g. S = Satisfactory, AP = Audit Pass)
    if (isNonEval) {
      processedCourses.push({
        courseCode,
        courseName,
        credits: credit,
        rawCredits,
        grade: normGrade,
        gradePoints: null,
        weightedPoints: 0,
        excludedFromGpa: true,
        isSatisfactory: normGrade === "S",
        status: "non_evaluative",
        session,
      });
      continue;
    }

    // Evaluative grade check
    const gradePoint = getGradePoint(normGrade, gradePointMap);

    if (gradePoint === undefined) {
      // Unknown / unsupported grade - DO NOT silently treat as 0!
      hasIncompleteData = true;
      if (!warnings.includes("unknown_grade")) warnings.push("unknown_grade");
      warningDetails.push({
        code: "unknown_grade",
        courseCode,
        grade: normGrade,
        message: `Course ${courseCode || courseName || "Unknown"} has unsupported grade '${normGrade}'.`,
      });
      processedCourses.push({
        courseCode,
        courseName,
        credits: credit,
        rawCredits,
        grade: normGrade,
        gradePoints: null,
        weightedPoints: 0,
        excludedFromGpa: false,
        status: "unknown_grade",
        session,
      });
      continue;
    }

    // Valid evaluative course
    const courseWeightedPoints = credit * gradePoint;
    gradedCredits += credit;
    totalWeightedPoints += courseWeightedPoints;

    processedCourses.push({
      courseCode,
      courseName,
      credits: credit,
      rawCredits,
      grade: normGrade,
      gradePoints: gradePoint,
      weightedPoints: courseWeightedPoints,
      excludedFromGpa: false,
      status: "valid",
      session,
    });
  }

  // Credit mismatch verification with footer total row
  if (expectedTotalCredits !== null && Number.isFinite(expectedTotalCredits)) {
    if (Math.abs(totalCredits - expectedTotalCredits) > 0.01) {
      warnings.push("credit_mismatch");
      warningDetails.push({
        code: "credit_mismatch",
        message: `Calculated credits (${roundTo(totalCredits, 2)}) do not match table footer total (${expectedTotalCredits}).`,
      });
    }
  }

  // Determine calculation status
  let status = "complete";
  if (processedCourses.length === 0 || totalCredits === 0 || gradedCredits === 0) {
    status = "incomplete";
    if (processedCourses.length === 0 && !warnings.includes("empty_courses")) warnings.push("empty_courses");
    if (gradedCredits === 0 && !warnings.includes("zero_credits")) warnings.push("zero_credits");
  } else if (hasIncompleteData) {
    status = "incomplete";
  }

  const rawSgpa = gradedCredits > 0 ? totalWeightedPoints / gradedCredits : null;
  const roundedSgpa = rawSgpa !== null ? roundTo(rawSgpa, 2) : null;

  const formula = "SGPA = Σ(Ci × Gi) / ΣCi";
  const substitutedFormula =
    gradedCredits > 0
      ? `SGPA = ${roundTo(totalWeightedPoints, 4)} / ${gradedCredits} = ${roundedSgpa}`
      : "SGPA = N/A (0 graded credits)";

  return {
    ok: status === "complete" && roundedSgpa !== null,
    sgpa: roundedSgpa,
    rawSgpa,
    totalCredits: roundTo(totalCredits, 2),
    gradedCredits: roundTo(gradedCredits, 2),
    totalWeightedPoints: roundTo(totalWeightedPoints, 4),
    courses: processedCourses,
    includedCourses: processedCourses,
    evaluatedCount: processedCourses.filter((c) => c.status === "valid").length,
    totalCount: processedCourses.length,
    status,
    warnings,
    warningDetails,
    issues: warnings, // backwards compatibility
    semester: detectedSemester,
    formula,
    substitutedFormula,
  };
}

/**
 * Backward compatibility wrapper for existing callers of computeSgpa.
 */
export function computeSgpa(courses) {
  const result = calculateSGPA(courses);
  return {
    ok: result.ok,
    sgpa: result.sgpa,
    credits: result.totalCredits,
    gradedCredits: result.gradedCredits,
    creditPoints: result.totalWeightedPoints,
    included: result.courses.map((c) => ({
      ...c,
      letter: c.grade,
      creditPoints: c.weightedPoints,
    })),
    issues: result.warnings,
  };
}

export function predictLetterFromAbsolute(percent, boundaries) {
  if (!Number.isFinite(percent) || !Array.isArray(boundaries) || boundaries.length === 0) {
    return {
      ok: false,
      letter: null,
      assumption: "No absolute boundaries configured. MUJ uses relative grading when a course has more than 25 students.",
    };
  }
  const sorted = [...boundaries].sort((a, b) => b.minPercent - a.minPercent);
  const hit = sorted.find((row) => percent >= row.minPercent);
  return {
    ok: Boolean(hit),
    letter: hit?.letter ?? null,
    assumption: "Absolute cutoffs are user-configured exploration values, not official MUJ relative-grade boundaries.",
  };
}
