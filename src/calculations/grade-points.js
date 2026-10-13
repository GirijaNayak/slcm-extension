/**
 * Manipal University Jaipur Grade Point Mapping Module
 * Authoritative reference: Certificate of GPA and CGPA Calculation Process & MUJ Examination Regulations
 *
 * Official Mapping:
 * A+ : 10 (Outstanding)
 * A  : 9  (Excellent)
 * B  : 8  (Very Good)
 * C  : 7  (Good)
 * D  : 6  (Fair)
 * E  : 5  (Marginal / Pass)
 * F  : 0  (Failure)
 * I  : 0  (Incomplete)
 * DT : 0  (Detained due to attendance shortage)
 *
 * Special Non-Evaluative Grades:
 * S  : Satisfactory (e.g. MEE1007 Creativity & Innovation) - fulfills degree requirements; excluded from GPA divisor
 * U  : Unsatisfactory - non-evaluative
 * AP : Audit Pass - fulfills audit requirement; excluded from GPA divisor
 * W  : Withdrawn
 */

export const MUJ_GRADE_POINT_MAP = Object.freeze({
  "A+": 10,
  A: 9,
  B: 8,
  C: 7,
  D: 6,
  E: 5,
  F: 0,
  I: 0,
  DT: 0,
  S: null,
  U: null,
  AP: null,
  W: null,
});

export const NON_EVALUATIVE_GRADES = Object.freeze(["S", "U", "AP", "W"]);

/**
 * Normalizes letter grade by stripping whitespace and converting to uppercase.
 * @param {string|unknown} grade
 * @returns {string}
 */
export function normalizeGrade(grade) {
  if (grade === null || grade === undefined) return "";
  return String(grade).trim().toUpperCase();
}

/**
 * Retrieves the official grade point for a letter grade.
 * Returns:
 * - Number (0 to 10) for evaluative grades (A+, A, B, C, D, E, F, I, DT)
 * - null for verified non-evaluative grades (S, U, AP, W)
 * - undefined for unknown/unsupported grades (distinguishes from genuine zero points)
 *
 * @param {string} grade
 * @param {Record<string, number|null>} [customMap]
 * @returns {number | null | undefined}
 */
export function getGradePoint(grade, customMap = MUJ_GRADE_POINT_MAP) {
  const key = normalizeGrade(grade);
  if (!key) return undefined;
  if (Object.prototype.hasOwnProperty.call(customMap, key)) {
    return customMap[key];
  }
  return undefined;
}

/**
 * Checks if a grade is recognized under the university grading scheme.
 * @param {string} grade
 * @param {Record<string, number|null>} [customMap]
 * @returns {boolean}
 */
export function isGradeSupported(grade, customMap = MUJ_GRADE_POINT_MAP) {
  const key = normalizeGrade(grade);
  return Boolean(key && Object.prototype.hasOwnProperty.call(customMap, key));
}

/**
 * Checks if a grade contributes numeric points to the GPA calculation.
 * @param {string} grade
 * @param {Record<string, number|null>} [customMap]
 * @returns {boolean}
 */
export function isGradeEvaluative(grade, customMap = MUJ_GRADE_POINT_MAP) {
  const point = getGradePoint(grade, customMap);
  return typeof point === "number" && Number.isFinite(point);
}

/**
 * Checks if a grade is non-evaluative (fulfills credit requirement but excluded from GPA divisor).
 * @param {string} grade
 * @returns {boolean}
 */
export function isNonEvaluativeGrade(grade) {
  const key = normalizeGrade(grade);
  return NON_EVALUATIVE_GRADES.includes(key);
}

/**
 * Checks whether a course is a Satisfactory/Unsatisfactory (non-evaluative) subject.
 * @param {Object} course
 * @param {Record<string, boolean|string>} [satisfactoryMap]
 * @returns {boolean}
 */
export function isSatisfactorySubject(course = {}, satisfactoryMap = {}) {
  const code = String(course.courseCode || course.code || course.id || "").trim().toUpperCase();
  const name = String(course.courseName || course.name || course.subject || "").trim().toUpperCase();
  const officialGrade = String(course.officialGrade || course.grade || course.letter || "").trim().toUpperCase();

  if (officialGrade === "S" || officialGrade === "U" || officialGrade === "AP") {
    return true;
  }
  if (satisfactoryMap) {
    if (code && satisfactoryMap[code]) return true;
    if (name && satisfactoryMap[name]) return true;
  }
  // Officially known MUJ curriculum S/U courses
  if (code === "MEE1007" || name.includes("CREATIVITY & INNOVATION") || name.includes("CREATIVITY AND INNOVATION")) {
    return true;
  }
  return false;
}

