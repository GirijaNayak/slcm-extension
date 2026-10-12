import { roundTo } from "./rounding.js";

export function planTargetCgpa({
  currentCgpa,
  completedCredits,
  targetCgpa,
  remainingCredits,
  remainingSemesters = [],
  gradeCap = 10,
}) {
  const issues = [];
  if (!Number.isFinite(currentCgpa) || currentCgpa < 0) issues.push("invalid_cgpa");
  if (!Number.isFinite(completedCredits) || completedCredits < 0) issues.push("invalid_completed_credits");
  if (!Number.isFinite(targetCgpa) || targetCgpa < 0) issues.push("invalid_target");
  if (!Number.isFinite(remainingCredits) || remainingCredits < 0) issues.push("invalid_remaining_credits");
  if (!Number.isFinite(gradeCap) || gradeCap <= 0) issues.push("invalid_grade_cap");
  if (issues.length) return { ok: false, issues };

  const totalCredits = completedCredits + remainingCredits;
  const currentPoints = currentCgpa * completedCredits;
  const maxPoints = currentPoints + remainingCredits * gradeCap;
  const maxCgpa = totalCredits > 0 ? roundTo(maxPoints / totalCredits, 2) : currentCgpa;
  const minPoints = currentPoints;
  const minCgpa = totalCredits > 0 ? roundTo(minPoints / totalCredits, 2) : currentCgpa;

  if (remainingCredits === 0) {
    const met = roundTo(currentCgpa, 2) >= roundTo(targetCgpa, 2);
    return {
      ok: true,
      requiredAverageSgpa: null,
      feasible: met,
      reason: met ? "already_met" : "no_remaining_credits",
      maxCgpa: roundTo(currentCgpa, 2),
      minCgpa: roundTo(currentCgpa, 2),
      explanation: met
        ? "No remaining credits. The current CGPA already meets the target."
        : "No remaining credits, so CGPA cannot change.",
      issues,
      bySemester: [],
    };
  }

  const requiredAverageSgpa = (targetCgpa * totalCredits - currentPoints) / remainingCredits;
  const roundedRequired = roundTo(requiredAverageSgpa, 2);
  const feasible = requiredAverageSgpa <= gradeCap + 1e-9 && requiredAverageSgpa >= 0;
  let reason = "feasible";
  if (requiredAverageSgpa > gradeCap) reason = "impossible_above_cap";
  if (requiredAverageSgpa < 0) reason = "already_above_target";

  const bySemester = distributeRequired(remainingSemesters, requiredAverageSgpa, remainingCredits, gradeCap);

  return {
    ok: true,
    requiredAverageSgpa: roundedRequired,
    feasible: feasible || reason === "already_above_target",
    reason,
    maxCgpa,
    minCgpa,
    totalCredits: roundTo(totalCredits, 2),
    remainingCredits: roundTo(remainingCredits, 2),
    bySemester,
    explanation: buildExplanation({
      targetCgpa,
      currentCgpa,
      completedCredits,
      remainingCredits,
      requiredAverageSgpa: roundedRequired,
      gradeCap,
      reason,
      maxCgpa,
    }),
    issues,
  };
}

function distributeRequired(semesters, requiredAverage, remainingCredits, gradeCap) {
  if (!semesters?.length) {
    return [
      {
        label: "Remaining work",
        credits: roundTo(remainingCredits, 2),
        requiredSgpa: roundTo(requiredAverage, 2),
      },
    ];
  }
  return semesters.map((semester, index) => ({
    label: semester.label || `Remaining ${index + 1}`,
    credits: roundTo(Number(semester.credits) || 0, 2),
    requiredSgpa: roundTo(Math.min(gradeCap, Math.max(0, requiredAverage)), 2),
    note: "Equal-SGPA plan. Different semester loads still use the credit-weighted required average.",
  }));
}

function buildExplanation({
  targetCgpa,
  currentCgpa,
  completedCredits,
  remainingCredits,
  requiredAverageSgpa,
  gradeCap,
  reason,
  maxCgpa,
}) {
  const formula = `Required SGPA = [Target CGPA × (Completed + Remaining) − Current CGPA × Completed] / Remaining = ${requiredAverageSgpa}`;
  if (reason === "impossible_above_cap") {
    return `${formula}. This exceeds the grade cap of ${gradeCap}. Maximum achievable CGPA under these credits is ${maxCgpa}.`;
  }
  if (reason === "already_above_target") {
    return `${formula}. The target is already at or below the current trajectory; any non-negative remaining performance keeps you above it only if the required average is not forced negative. Current CGPA is ${currentCgpa}.`;
  }
  return `${formula}. This is a credit-weighted plan, not a simple average of semester GPAs.`;
}
