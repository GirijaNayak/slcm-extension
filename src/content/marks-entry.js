import { parseInternalMarksSummaryTable } from "../data/marks-adapter.js";
import { enhanceInternalMarksPage } from "../ui/components/marks/prediction-panel.js";
import { INJECT_ATTR } from "../shared/constants.js";

(() => {
  'use strict';
  if (window.__mujxMarksLoaded) return;
  window.__mujxMarksLoaded = true;

  function runMarksEnhancer() {
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const summary = parseInternalMarksSummaryTable(table);
      if (summary.available && summary.courses.length) {
        // Augment credits from chrome.storage.local if available
        try {
          if (typeof chrome !== "undefined" && chrome.storage?.local) {
            chrome.storage.local.get("courseCredits", (res) => {
              const credMap = res?.courseCredits || {};
              summary.courses.forEach((c) => {
                if (c.courseCode && credMap[c.courseCode]) {
                  c.credits = Number(credMap[c.courseCode]);
                }
              });
              renderMarks(table, summary);
            });
            return;
          }
        } catch (_) {}

        renderMarks(table, summary);
        break;
      }
    }
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
