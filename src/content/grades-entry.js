import { parseGradesTable } from "../data/grades-adapter.js";
import { enhanceGradeSheet } from "../ui/components/grades/grade-sheet.js";
import { INJECT_ATTR } from "../shared/constants.js";

(() => {
  'use strict';
  if (window.__mujxGradesLoaded) return;
  window.__mujxGradesLoaded = true;

  function runGradesEnhancer() {
    const tables = document.querySelectorAll("table");
    for (const table of tables) {
      const text = (table.textContent || "").toLowerCase();
      if (text.includes("grade") && (text.includes("course") || text.includes("credit") || text.includes("session"))) {
        const gradeSheetData = parseGradesTable(table);
        if (gradeSheetData.available && gradeSheetData.records.length) {
          const dataSig = `${gradeSheetData.session || ""}:${gradeSheetData.records.map((r) => `${r.courseCode}-${r.letter}-${r.credits}`).join(";")}`;
          if (table.getAttribute("data-mujx-sig") === dataSig && table.querySelector(`[${INJECT_ATTR}="grade-points"]`)) {
            continue;
          }

          table.querySelectorAll(`[${INJECT_ATTR}]`).forEach((el) => el.remove());
          document.querySelectorAll(`[${INJECT_ATTR}="grade-banner"]`).forEach((el) => el.remove());
          table.setAttribute("data-mujx-sig", dataSig);

          enhanceGradeSheet({
            table,
            records: gradeSheetData.records,
            totalCreditsFromFooter: gradeSheetData.totalCreditsFromFooter,
            headerRow: gradeSheetData.headerRow,
            allRows: gradeSheetData.allRows,
            headerRowIndex: gradeSheetData.headerRowIndex,
            session: gradeSheetData.session,
          });

          // Save parsed grades, credits, and satisfactory course flags to chrome.storage.local
          try {
            const gradesMap = {};
            const creditsMap = {};
            const satisfactoryMap = {};
            gradeSheetData.records.forEach((r) => {
              if (r.courseCode) {
                if (r.letter) gradesMap[r.courseCode] = r.letter;
                if (r.credits) creditsMap[r.courseCode] = r.credits;
                if (r.letter === "S" || r.letter === "U" || r.letter === "AP") {
                  satisfactoryMap[r.courseCode] = true;
                }
              }
            });
            if (typeof chrome !== "undefined" && chrome.storage?.local) {
              chrome.storage.local.get(["subjectGrades", "courseCredits", "satisfactoryCourses"], (res) => {
                const prevG = res?.subjectGrades || {};
                const prevC = res?.courseCredits || {};
                const prevS = res?.satisfactoryCourses || {};
                chrome.storage.local.set({
                  subjectGrades: { ...prevG, ...gradesMap },
                  courseCredits: { ...prevC, ...creditsMap },
                  satisfactoryCourses: { ...prevS, ...satisfactoryMap }
                });
              });
            }
          } catch (_) {}
          break;
        }
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runGradesEnhancer, { once: true });
  } else {
    runGradesEnhancer();
  }

  // Handle Search / Find button clicks and dropdown changes
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("button, input[type=submit], input[type=button], a");
    if (btn) {
      setTimeout(runGradesEnhancer, 150);
      setTimeout(runGradesEnhancer, 500);
      setTimeout(runGradesEnhancer, 1000);
    }
  }, true);

  document.addEventListener("change", (e) => {
    if (e.target.closest("select")) {
      setTimeout(runGradesEnhancer, 150);
      setTimeout(runGradesEnhancer, 500);
    }
  }, true);
})();
