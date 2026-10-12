import { roundTo } from "./rounding.js";

export function sumAssessments(assessments) {
  const issues = [];
  let obtained = 0;
  let maximum = 0;
  let counted = 0;
  for (const item of assessments || []) {
    const score = toScore(item.obtained);
    const max = toScore(item.maximum);
    if (score === null && item.obtained !== 0) {
      issues.push("missing_score");
      continue;
    }
    if (max === null || max <= 0) {
      issues.push("invalid_maximum");
      continue;
    }
    if (score < 0) {
      issues.push("negative_score");
      continue;
    }
    obtained += score;
    maximum += max;
    counted += 1;
  }
  return {
    ok: counted > 0,
    obtained: roundTo(obtained, 2),
    maximum: roundTo(maximum, 2),
    percent: maximum > 0 ? roundTo((obtained / maximum) * 100, 2) : null,
    counted,
    issues,
  };
}

export function weightedTotal(components) {
  const issues = [];
  let weighted = 0;
  let weightSum = 0;
  for (const component of components || []) {
    const score = toScore(component.obtained);
    const max = toScore(component.maximum);
    const weight = toScore(component.weight);
    if (score === null || max === null || max <= 0 || weight === null || weight < 0) {
      issues.push("invalid_component");
      continue;
    }
    weighted += (score / max) * weight;
    weightSum += weight;
  }
  return {
    ok: weightSum > 0,
    weighted: roundTo(weighted, 2),
    weightSum: roundTo(weightSum, 2),
    issues,
  };
}

export function requiredScore({ obtained, remainingMax, targetTotal, currentMax = 0 }) {
  const issues = [];
  if (![obtained, remainingMax, targetTotal].every(Number.isFinite)) {
    return { ok: false, required: null, issues: ["invalid_input"] };
  }
  if (remainingMax < 0) issues.push("invalid_remaining");
  const already = obtained + currentMax;
  if (remainingMax === 0) {
    return {
      ok: true,
      required: null,
      alreadyMet: already >= targetTotal,
      impossible: already < targetTotal,
      issues,
    };
  }
  const required = targetTotal - obtained;
  return {
    ok: true,
    required: roundTo(required, 2),
    alreadyMet: required <= 0,
    impossible: required > remainingMax,
    percentOfRemaining: remainingMax > 0 ? roundTo((Math.max(required, 0) / remainingMax) * 100, 2) : null,
    issues,
  };
}

export function applyHypothetical(official, hypothetical) {
  const merged = (official || []).map((item) => {
    const override = (hypothetical || []).find((row) => row.id === item.id);
    if (!override || override.obtained === "" || override.obtained === null || override.obtained === undefined) {
      return { ...item, source: "official" };
    }
    return {
      ...item,
      obtained: toScore(override.obtained),
      source: "simulated",
    };
  });
  return merged;
}

function toScore(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}
