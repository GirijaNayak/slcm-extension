import { MUJ_GRADE_POINTS } from "../shared/constants.js";
import { roundTo } from "./rounding.js";

export function gradePointForLetter(letter, table = MUJ_GRADE_POINTS) {
  if (letter === null || letter === undefined) return null;
  const key = String(letter).trim().toUpperCase();
  if (key in table) return table[key];
  return null;
}

export function letterForPoint(point, table = MUJ_GRADE_POINTS) {
  const match = Object.entries(table).find(([, value]) => value === point);
  return match ? match[0] : null;
}

export function computeSgpa(courses) {
  const issues = [];
  let creditPoints = 0;
  let credits = 0;
  const included = [];
  for (const course of courses || []) {
    const credit = Number(course.credits);
    const points =
      course.gradePoints !== undefined && course.gradePoints !== null
        ? Number(course.gradePoints)
        : gradePointForLetter(course.letter);
    if (!Number.isFinite(credit) || credit < 0) {
      issues.push("invalid_credits");
      continue;
    }
    if (course.excludeFromGpa) continue;
    if (!Number.isFinite(points)) {
      issues.push("missing_grade");
      continue;
    }
    creditPoints += credit * points;
    credits += credit;
    included.push({ ...course, credits: credit, gradePoints: points });
  }
  if (credits === 0) {
    return { ok: false, sgpa: null, credits: 0, creditPoints: 0, included, issues: [...issues, "zero_credits"] };
  }
  return {
    ok: true,
    sgpa: roundTo(creditPoints / credits, 2),
    credits: roundTo(credits, 2),
    creditPoints: roundTo(creditPoints, 4),
    included,
    issues,
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
