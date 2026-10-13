import { parseInternalMarksSummaryTable } from "../data/marks-adapter.js";
import { enhanceInternalMarksPage } from "../ui/components/marks/prediction-panel.js";
import { resolveAllCredits, inferCourseCredits } from "../data/credit-resolver.js";
import { INJECT_ATTR } from "../shared/constants.js";

(() => {
  'use strict';
  if (window.__mujxMarksLoaded) return;
  window.__mujxMarksLoaded = true;

  async function runMarksEnhancer() {
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const summary = parseInternalMarksSummaryTable(table);
      if (summary.available && summary.courses.length) {
        const sem = document.getElementById("ddlSemester")?.value || "";

        // 1. Initial fast render with local/inferred credits
        applyCredits(summary.courses, {});
        renderMarks(table, summary);

        // 2. Concurrently resolve and fetch credits from Attendance Summary, Faculty Grades API, and past Grades
        try {
          const resolvedMap = await resolveAllCredits(sem);
          if (applyCredits(summary.courses, resolvedMap)) {
            renderMarks(table, summary);
          }
        } catch (_) {}

        break;
      }
    }
  }

  function applyCredits(courses, credMap) {
    let changed = false;
    courses.forEach((c) => {
      const key = c.courseCode || c.id;
      if (credMap && credMap[key]) {
        const val = Number(credMap[key]);
        if (c.credits !== val) {
          c.credits = val;
          changed = true;
        }
      } else if (!c.credits || c.credits === 4) {
        const inferred = inferCourseCredits(c.courseName, c.courseCode, c.courseType);
        if (c.credits !== inferred) {
          c.credits = inferred;
          changed = true;
        }
      }
    });
    return changed;
  }

  function renderMarks(table, summary) {
    const dataSig = summary.courses
      .map((c) => `${c.id}:${c.internalSubtotal}:${c.mte}:${c.cws}:${c.prs}:${c.credits}`)
      .join(";");

    if (
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
