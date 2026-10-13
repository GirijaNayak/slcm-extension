/**
 * Provisional Grade Classification Module
 *
 * Prediction model specified in RULES TO CACULATE GRADE.txt:
 *
 * Theory:
 * Total marks = MTE + CWS + ETE
 * A+ : 82 and above
 * A  : 72 and above
 * B  : 62 and above
 * C  : 52 and above
 * D  : 42 and above
 * E  : Above 35 and below 42
 * F  : Below 35
 * (Exactly 35 is undefined by university rule specification)
 *
 * Labs & PBL:
 * Total marks = PRS + ETE
 * A+ : 90 and above
 * A  : 80 and above
 * B  : 70 and above
 * C  : 60 and above
 * D  : 50 and above
 * E  : Above 35 and below 50
 * F  : Below 35
 * (Exactly 35 is undefined by university rule specification)
 */

export const RELATIVE_GRADING_DISCLAIMER =
  "Important: SGPA and Grade Prediction Is Only an Estimate. MUJ follows a relative grading system. These predictions use the configured marks thresholds and available assessment data, so your final grades and SGPA may differ from the university's officially declared results. Do not treat the predicted SGPA as your final SGPA.";

export const THEORY_GRADE_THRESHOLDS = Object.freeze([
  { grade: "A+", min: 82, max: Infinity, condition: ">= 82" },
  { grade: "A", min: 72, max: 82, condition: ">= 72 and < 82" },
  { grade: "B", min: 62, max: 72, condition: ">= 62 and < 72" },
  { grade: "C", min: 52, max: 62, condition: ">= 52 and < 62" },
  { grade: "D", min: 42, max: 52, condition: ">= 42 and < 52" },
  { grade: "E", min: 35.000001, max: 42, condition: "> 35 and < 42" },
  { grade: "F", min: -Infinity, max: 35, condition: "< 35" },
]);

export const LAB_PBL_GRADE_THRESHOLDS = Object.freeze([
  { grade: "A+", min: 90, max: Infinity, condition: ">= 90" },
  { grade: "A", min: 80, max: 90, condition: ">= 80 and < 90" },
  { grade: "B", min: 70, max: 80, condition: ">= 70 and < 80" },
  { grade: "C", min: 60, max: 70, condition: ">= 60 and < 70" },
  { grade: "D", min: 50, max: 60, condition: ">= 50 and < 60" },
  { grade: "E", min: 35.000001, max: 50, condition: "> 35 and < 50" },
  { grade: "F", min: -Infinity, max: 35, condition: "< 35" },
]);

/**
 * Classifies course into 'theory', 'lab', or 'pbl' based on metadata.
 * @param {Object} course
 * @returns {'theory' | 'lab' | 'pbl'}
 */
export function classifyCourseType(course = {}) {
  const name = String(course.courseName || course.subject || course.name || "").toUpperCase();
  const code = String(course.courseCode || course.code || "").toUpperCase();

  if (name.includes("PBL") || name.includes("PROJECT BASED LEARNING") || code.includes("PBL") || name.includes("PROJECT-BASED")) {
    return "pbl";
  }

  if (
    name.includes("LAB") ||
    name.includes("PRACTICAL") ||
    name.includes("WORKSHOP") ||
    name.includes("CLINIC") ||
    code.endsWith("L") ||
    code.endsWith("P") ||
    /(?:103\d|213\d|313\d|323\d)/.test(code) || // MUJ lab course code convention (e.g. CSE1031, CSE2131)
    (course.prs !== undefined && course.prs !== null && !course.mte && !course.mte1)
  ) {
    return "lab";
  }

  return "theory";
}

/**
 * Pure calculation function that determines the provisional letter grade
 * from total marks according to the verified prediction rules.
 *
 * @param {number|unknown} totalMarks
 * @param {'theory' | 'lab' | 'pbl'} [courseType]
 * @returns {Object}
 */
export function classifyProvisionalGrade(totalMarks, courseType = "theory") {
  const normType = String(courseType || "theory").toLowerCase();

  if (normType !== "theory" && normType !== "lab" && normType !== "pbl") {
    return {
      ok: false,
      grade: null,
      status: "unknown_type",
      totalMarks: null,
      courseType: normType,
      minThreshold: null,
      isBoundaryAmbiguous: false,
      message: `Unknown course type '${courseType}'. Must be 'theory', 'lab', or 'pbl'.`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER,
    };
  }

  if (totalMarks === null || totalMarks === undefined || totalMarks === "") {
    return {
      ok: false,
      grade: null,
      status: "missing_marks",
      totalMarks: null,
      courseType: normType,
      minThreshold: null,
      isBoundaryAmbiguous: false,
      message: "Marks value is missing or unavailable.",
      disclaimer: RELATIVE_GRADING_DISCLAIMER,
    };
  }

  const score = Number(totalMarks);
  if (!Number.isFinite(score) || score < 0) {
    return {
      ok: false,
      grade: null,
      status: "invalid_marks",
      totalMarks: score,
      courseType: normType,
      minThreshold: null,
      isBoundaryAmbiguous: false,
      message: `Invalid marks score (${totalMarks}).`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER,
    };
  }

  // Exact boundary at 35 is undefined under the supplied rules
  if (Math.abs(score - 35) < 1e-9) {
    return {
      ok: false,
      grade: null,
      status: "undefined_boundary",
      totalMarks: 35,
      courseType: normType,
      minThreshold: null,
      isBoundaryAmbiguous: true,
      message: "Score is exactly 35 marks. The university specification defines E as 'Above 35' and F as 'Below 35', leaving exactly 35 marks undefined.",
      disclaimer: RELATIVE_GRADING_DISCLAIMER,
    };
  }

  const isLabOrPbl = normType === "lab" || normType === "pbl";

  if (isLabOrPbl) {
    // Lab & PBL thresholds
    if (score >= 90) return result("A+", 90, normType, score);
    if (score >= 80) return result("A", 80, normType, score);
    if (score >= 70) return result("B", 70, normType, score);
    if (score >= 60) return result("C", 60, normType, score);
    if (score >= 50) return result("D", 50, normType, score);
    if (score > 35 && score < 50) return result("E", 35.01, normType, score);
    if (score < 35) return result("F", 0, normType, score);
  } else {
    // Theory thresholds
    if (score >= 82) return result("A+", 82, normType, score);
    if (score >= 72) return result("A", 72, normType, score);
    if (score >= 62) return result("B", 62, normType, score);
    if (score >= 52) return result("C", 52, normType, score);
    if (score >= 42) return result("D", 42, normType, score);
    if (score > 35 && score < 42) return result("E", 35.01, normType, score);
    if (score < 35) return result("F", 0, normType, score);
  }

  return {
    ok: false,
    grade: null,
    status: "unresolved",
    totalMarks: score,
    courseType: normType,
    minThreshold: null,
    isBoundaryAmbiguous: true,
    message: `Marks value ${score} could not be resolved.`,
    disclaimer: RELATIVE_GRADING_DISCLAIMER,
  };
}

function result(grade, minThreshold, courseType, score) {
  return {
    ok: true,
    grade,
    status: "resolved",
    totalMarks: score,
    courseType,
    minThreshold,
    isBoundaryAmbiguous: false,
    message: `Score ${score} classifies as provisional grade ${grade} (${courseType}).`,
    disclaimer: RELATIVE_GRADING_DISCLAIMER,
  };
}
