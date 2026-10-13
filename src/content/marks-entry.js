import { parseInternalMarksSummaryTable } from "../data/marks-adapter.js";
import { enhanceInternalMarksPage } from "../ui/components/marks/prediction-panel.js";
import { resolveAllCredits, inferCourseCredits } from "../data/credit-resolver.js";
import { isSatisfactorySubject } from "../calculations/grade-points.js";
import { INJECT_ATTR } from "../shared/constants.js";

(() => {
  'use strict';
  if (window.__mujxMarksLoaded) return;
  window.__mujxMarksLoaded = true;

  const knownSatisfactoryMap = { MEE1007: true };
  const storedUserCustomCredits = {};
  const storedCourseCredits = {};

  async function loadStorageCache() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const stored = await new Promise((res) =>
          chrome.storage.local.get(
            ["userCustomCredits", "courseCredits", "satisfactoryCourses", "subjectGrades"],
            (d) => res(d || {})
          )
        );
        if (stored?.courseCredits) Object.assign(storedCourseCredits, stored.courseCredits);
        if (stored?.userCustomCredits) Object.assign(storedUserCustomCredits, stored.userCustomCredits);
        if (stored?.satisfactoryCourses) Object.assign(knownSatisfactoryMap, stored.satisfactoryCourses);
        if (stored?.subjectGrades) {
          Object.entries(stored.subjectGrades).forEach(([k, g]) => {
            if (g === "S" || g === "U" || g === "AP") knownSatisfactoryMap[k] = true;
          });
        }
      }
    } catch (_) {}
  }

  async function runMarksEnhancer() {
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const summary = parseInternalMarksSummaryTable(table);
      if (summary.available && summary.courses.length) {
        const sem = document.getElementById("ddlSemester")?.value || "";

        // Read local storage immediately before initial render to prevent flashing/resetting
        await loadStorageCache();

        // 1. Initial fast render with local/saved user credits and preset 1 for Lab/PBL/S-U
        applyCredits(summary.courses, storedCourseCredits, storedUserCustomCredits, knownSatisfactoryMap);
        renderMarks(table, summary, knownSatisfactoryMap);

        // 2. Concurrently resolve and fetch credits and satisfactory courses
        try {
          const resolvedMap = await resolveAllCredits(sem);
          if (resolvedMap?.__satisfactory) {
            Object.assign(knownSatisfactoryMap, resolvedMap.__satisfactory);
          }
          if (resolvedMap?.__userCustom) {
            Object.assign(storedUserCustomCredits, resolvedMap.__userCustom);
          }
          applyCredits(summary.courses, resolvedMap, storedUserCustomCredits, knownSatisfactoryMap);
          renderMarks(table, summary, knownSatisfactoryMap, true);
        } catch (_) {}

        break;
      }
    }
  }

  function applyCredits(courses, credMap = {}, userCustomMap = {}, satisfactoryMap = {}) {
    let changed = false;
    courses.forEach((c) => {
      const codeKey = (c.courseCode || "").toUpperCase();
      const idKey = (c.id || "").toUpperCase();
      const nameKey = (c.courseName || "").toUpperCase();

      const isSat = isSatisfactorySubject(c, satisfactoryMap);
      const isLabOrPblOrSat = c.courseType === "lab" || c.courseType === "pbl" || isSat;

      // 1. Highest priority: User's explicitly chosen credit from local storage
      const userVal = userCustomMap[codeKey] ?? userCustomMap[idKey] ?? userCustomMap[nameKey];
      if (userVal !== undefined && userVal !== null && !isNaN(Number(userVal))) {
        const num = Number(userVal);
        if (c.credits !== num) {
          c.credits = num;
          changed = true;
        }
        return;
      }

      // 2. Preset to 1 credit for all Lab, PBL, and S/U courses
      if (isLabOrPblOrSat) {
        if (c.credits !== 1) {
          c.credits = 1;
          changed = true;
        }
        return;
      }

      // 3. Cred map from attendance/grades if available
      const mapVal = credMap[codeKey] ?? credMap[idKey] ?? credMap[nameKey];
      if (mapVal !== undefined && mapVal !== null && !isNaN(Number(mapVal))) {
        const val = Number(mapVal);
        if (c.credits !== val) {
          c.credits = val;
          changed = true;
        }
        return;
      }

      // 4. Default inference
      const inferred = inferCourseCredits(c.courseName, c.courseCode, c.courseType, isSat);
      if (c.credits !== inferred) {
        c.credits = inferred;
        changed = true;
      }
    });
    return changed;
  }

  function renderMarks(table, summary, satisfactoryMap = {}, force = false) {
    const dataSig = summary.courses
      .map((c) => `${c.id}:${c.internalSubtotal}:${c.mte}:${c.cws}:${c.prs}:${c.credits}:${Boolean(satisfactoryMap[c.courseCode || c.id])}`)
      .join(";");

    if (
      !force &&
      table.getAttribute("data-mujx-marks-sig") === dataSig &&
      table.querySelector(`[${INJECT_ATTR}="marks-pred-col"]`)
    ) {
      return;
    }

    table.querySelectorAll(`[${INJECT_ATTR}]`).forEach((el) => el.remove());
    table.closest(".table-responsive, .table-scrollable")?.parentNode?.querySelectorAll?.(`[${INJECT_ATTR}="marks-banner"]`)?.forEach((el) => el.remove());
    table.parentNode?.querySelectorAll?.(`[${INJECT_ATTR}="marks-banner"]`)?.forEach((el) => el.remove());
    document.querySelectorAll(`[${INJECT_ATTR}="marks-banner"]`).forEach((el) => el.remove());

    table.setAttribute("data-mujx-marks-sig", dataSig);

    enhanceInternalMarksPage({
      table,
      courses: summary.courses,
      headerRow: summary.headerRow,
      allRows: summary.allRows,
      headerRowIndex: summary.headerRowIndex,
      satisfactoryMap,
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runMarksEnhancer, { once: true });
  } else {
    runMarksEnhancer();
  }

  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button, input[type=submit], input[type=button], a");
    if (btn) {
      setTimeout(runMarksEnhancer, 150);
      setTimeout(runMarksEnhancer, 500);
      setTimeout(runMarksEnhancer, 1000);
    }
  }, true);

  document.addEventListener("change", (e) => {
    if (e.target.closest("select")) {
      setTimeout(runMarksEnhancer, 150);
      setTimeout(runMarksEnhancer, 500);
    }
  }, true);
})();
