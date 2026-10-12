import { roundTo } from "./rounding.js";

export function computeCgpa({ currentCgpa, completedCredits, semesters }) {
  const issues = [];
  if (!Number.isFinite(currentCgpa) || currentCgpa < 0) issues.push("invalid_cgpa");
  if (!Number.isFinite(completedCredits) || completedCredits < 0) issues.push("invalid_completed_credits");
  if (issues.length) {
    return { ok: false, projected: [], issues };
  }

  let points = currentCgpa * completedCredits;
  let credits = completedCredits;
  const projected = [
    {
      label: "Current",
      sgpa: currentCgpa,
      semesterCredits: 0,
      cumulativeCredits: roundTo(credits, 2),
      cgpa: roundTo(currentCgpa, 2),
      source: "official-or-entered",
    },
  ];

  (semesters || []).forEach((semester, index) => {
    const sgpa = Number(semester.sgpa);
    const semesterCredits = Number(semester.credits);
    if (!Number.isFinite(sgpa) || sgpa < 0) {
      issues.push("invalid_semester_sgpa");
      return;
    }
    if (!Number.isFinite(semesterCredits) || semesterCredits < 0) {
      issues.push("invalid_semester_credits");
      return;
    }
    points += sgpa * semesterCredits;
    credits += semesterCredits;
    projected.push({
      label: semester.label || `Semester ${index + 1}`,
      sgpa: roundTo(sgpa, 2),
      semesterCredits: roundTo(semesterCredits, 2),
      cumulativeCredits: roundTo(credits, 2),
      cgpa: credits > 0 ? roundTo(points / credits, 2) : null,
      source: "simulated",
    });
  });

  return {
    ok: true,
    projected,
    finalCgpa: projected[projected.length - 1]?.cgpa ?? null,
    totalCredits: roundTo(credits, 2),
    issues,
    formula: "CGPA = Σ(SGPA_i × Credits_i) / Σ(Credits_i), matching MUJ credit-weighted GPA.",
  };
}

export function compareScenarios(baseInput, scenarios) {
  return (scenarios || []).map((scenario) => ({
    id: scenario.id,
    name: scenario.name,
    result: computeCgpa({
      currentCgpa: baseInput.currentCgpa,
      completedCredits: baseInput.completedCredits,
      semesters: scenario.semesters,
    }),
  }));
}
