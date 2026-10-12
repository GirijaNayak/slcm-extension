import { extractCgpaSummary, extractGradesFromDocument } from "./grades-adapter.js";
import { computeSgpa } from "../calculations/sgpa.js";

export function extractSemesterContext(doc = document) {
  const grades = extractGradesFromDocument(doc);
  const summary = grades.summary || extractCgpaSummary(doc);
  const sgpa = grades.records.length ? computeSgpa(grades.records) : null;
  return {
    currentCgpa: summary.cgpa,
    completedCredits: summary.completedCredits ?? sgpa?.credits ?? null,
    currentSgpa: summary.sgpa ?? sgpa?.sgpa ?? null,
    courses: grades.records,
    source: grades.available ? "grades-table" : summary.available ? "summary-text" : "none",
    available: Boolean(summary.cgpa || summary.completedCredits || grades.records.length),
  };
}
