import { roundTo } from "./rounding.js";
import { RELATIVE_GRADING_DISCLAIMER } from "./provisional-grade.js";

/**
 * Minimum marks required for each theory letter grade
 * per RULES TO CACULATE GRADE.txt:
 * A+ : 82
 * A  : 72
 * B  : 62
 * C  : 52
 * D  : 42
 * E  : > 35 (minimum strictly greater than 35)
 * F  : 0
 */
export const THEORY_TARGET_MIN_MARKS = Object.freeze({
  "A+": 82,
  A: 72,
  B: 62,
  C: 52,
  D: 42,
  E: 35.01,
  F: 0,
});

export const DEFAULT_ETE_MAX = 40;

/**
 * Calculates the required End Term Examination (ETE) marks
 * to achieve a desired target grade in an eligible theory course.
 *
 * Formula:
 * E = T - M - C
 *
 * Where:
 * - T = minimum marks for the target grade
 * - M = verified applicable MTE marks
 * - C = verified applicable CWS marks (or explicit user estimate if pending)
 * - Emax = verified maximum marks for ETE (default: 40)
 *
 * @param {Object} params
 * @param {string} params.targetGrade - e.g. "A+", "A", "B", "C", "D", "E"
 * @param {number|unknown} params.mte - Verified MTE marks
 * @param {number|null} [params.cws] - Verified CWS marks (null if pending)
 * @param {number|null} [params.cwsEstimate] - Explicit scenario estimate if CWS is pending
 * @param {number} [params.eteMax] - Maximum possible marks in ETE (default: 40)
 * @param {string} [params.courseType] - 'theory' | 'lab' | 'pbl'
 * @returns {Object}
 */
export function calculateRequiredEte({
  targetGrade,
  mte,
  cws = null,
  cwsEstimate = null,
  eteMax = DEFAULT_ETE_MAX,
  courseType = "theory",
}) {
  const normType = String(courseType || "theory").toLowerCase();

  // 1. Course eligibility check: Only verified theory courses
  if (normType !== "theory") {
    return {
      ok: false,
      eligible: false,
      targetGrade,
      targetThreshold: null,
      mte: null,
      cws: null,
      cwsEstimated: false,
      cwsPending: false,
      internalSubtotal: 0,
      requiredETE: null,
      unclampedRequired: null,
      eteMax,
      feasibility: "ineligible",
      percentOfEte: null,
      message: `Course type is '${normType}'. The ETE Target Calculator is enabled exclusively for theory courses (labs and PBL are excluded).`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER,
    };
  }

  // 2. Validate target grade
  const normGrade = String(targetGrade || "").trim().toUpperCase();
  if (!(normGrade in THEORY_TARGET_MIN_MARKS)) {
    return {
      ok: false,
      eligible: true,
      targetGrade,
      targetThreshold: null,
      mte: null,
      cws: null,
      cwsEstimated: false,
      cwsPending: false,
      internalSubtotal: 0,
      requiredETE: null,
      unclampedRequired: null,
      eteMax,
      feasibility: "undefined_target",
      percentOfEte: null,
      message: `Unknown target grade '${targetGrade}'. Supported theory target grades: A+, A, B, C, D, E.`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER,
    };
  }

  // Target threshold
  const targetThreshold = THEORY_TARGET_MIN_MARKS[normGrade];

  // 3. Validate MTE marks
  const mteNum = Number(mte);
  if (!Number.isFinite(mteNum) || mteNum < 0) {
    return {
      ok: false,
      eligible: true,
      targetGrade: normGrade,
      targetThreshold,
      mte: null,
      cws: null,
      cwsEstimated: false,
      cwsPending: false,
      internalSubtotal: 0,
      requiredETE: null,
      unclampedRequired: null,
      eteMax,
      feasibility: "invalid_input",
      percentOfEte: null,
      message: `MTE marks (${mte}) are invalid or missing.`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER,
    };
  }

  // 4. Handle CWS status (verified vs pending with estimate)
  const isCwsVerified = cws !== null && cws !== undefined && Number.isFinite(Number(cws)) && Number(cws) >= 0;
  const isCwsEstimated = !isCwsVerified && cwsEstimate !== null && Number.isFinite(Number(cwsEstimate)) && Number(cwsEstimate) >= 0;
  const cwsPending = !isCwsVerified && !isCwsEstimated;

  const effectiveCws = isCwsVerified ? Number(cws) : isCwsEstimated ? Number(cwsEstimate) : 0;
  const internalSubtotal = roundTo(mteNum + effectiveCws, 2);

  if (cwsPending) {
    // CWS is pending and no estimate provided
    const requiredWithoutCws = targetThreshold - mteNum;
    return {
      ok: true,
      eligible: true,
      targetGrade: normGrade,
      targetThreshold,
      mte: mteNum,
      cws: null,
      cwsEstimated: false,
      cwsPending: true,
      internalSubtotal: mteNum,
      requiredETE: null,
      unclampedRequired: roundTo(requiredWithoutCws, 2),
      eteMax,
      feasibility: "cws_pending",
      percentOfEte: null,
      message: `CWS marks are pending. Need ${roundTo(requiredWithoutCws, 2)} total marks across (CWS + ETE) to achieve grade ${normGrade}. Enter a CWS estimate to calculate the ETE requirement.`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER,
    };
  }

  // 5. Calculate required ETE
  const unclampedRequired = targetThreshold - internalSubtotal;

  let feasibility = "achievable";
  let displayedRequired = 0;
  let percentOfEte = 0;

  if (unclampedRequired <= 0) {
    feasibility = "already_secured";
    displayedRequired = 0;
    percentOfEte = 0;
  } else if (unclampedRequired > eteMax) {
    feasibility = "impossible";
    displayedRequired = roundTo(unclampedRequired, 2);
    percentOfEte = roundTo((displayedRequired / eteMax) * 100, 1);
  } else {
    feasibility = "achievable";
    displayedRequired = roundTo(unclampedRequired, 2);
    percentOfEte = roundTo((displayedRequired / eteMax) * 100, 1);
  }

  return {
    ok: true,
    eligible: true,
    targetGrade: normGrade,
    targetThreshold,
    mte: mteNum,
    cws: isCwsVerified ? effectiveCws : null,
    cwsEstimated: isCwsEstimated,
    cwsPending: false,
    internalSubtotal,
    requiredETE: displayedRequired,
    unclampedRequired: roundTo(unclampedRequired, 2),
    eteMax,
    feasibility,
    percentOfEte,
    message: formatMessage(feasibility, displayedRequired, eteMax, normGrade, internalSubtotal, isCwsEstimated),
    disclaimer: RELATIVE_GRADING_DISCLAIMER,
  };
}

function formatMessage(feasibility, req, max, grade, subtotal, estimated) {
  const estNote = estimated ? " (based on estimated CWS)" : "";
  if (feasibility === "already_secured") {
    return `Grade ${grade} is already secured with current internal marks of ${subtotal}${estNote}! Required ETE: 0/${max}.`;
  }
  if (feasibility === "impossible") {
    return `Grade ${grade} requires ${req}/${max} marks in ETE${estNote}, which exceeds the maximum possible score (${max}).`;
  }
  return `Target ${grade} requires ${req}/${max} marks in ETE (${Math.round((req / max) * 100)}%)${estNote}.`;
}
