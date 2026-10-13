import { classifyProvisionalGrade, RELATIVE_GRADING_DISCLAIMER } from "../../../calculations/provisional-grade.js";
import { calculateSGPA } from "../../../calculations/sgpa.js";
import { isSatisfactorySubject } from "../../../calculations/grade-points.js";
import { openEteTargetPopover } from "./ete-target-control.js";
import { escapeHtml } from "../../../shared/dom.js";
import { INJECT_ATTR } from "../../../shared/constants.js";

/**
 * Enhances the Internal Marks table inline on /Student/Academic/InternalMarkForStudent
 * with marks-based provisional grade prediction, credit-weighted SGPA forecasting,
 * and the theory ETE Target Calculator.
 */
export function enhanceInternalMarksPage({ table, courses, headerRow, allRows, headerRowIndex, satisfactoryMap = {}, initialEteEstimates = {} }) {
  if (!table || !courses || !courses.length) return () => {};

  // Store per-course ETE estimates (load initial user estimates or default 28 for theory, 25 for labs)
  const courseEteEstimates = {};
  courses.forEach((c) => {
    const codeKey = (c.courseCode || "").toUpperCase();
    const idKey = (c.id || "").toUpperCase();
    const nameKey = (c.courseName || "").toUpperCase();

    const savedVal =
      initialEteEstimates[codeKey] ??
      initialEteEstimates[idKey] ??
      initialEteEstimates[nameKey] ??
      initialEteEstimates[c.id];

    if (savedVal !== undefined && savedVal !== null && !isNaN(Number(savedVal))) {
      courseEteEstimates[c.id] = Number(savedVal);
    } else {
      courseEteEstimates[c.id] = c.courseType === "theory" ? 28 : 25;
    }
  });

  // Load from chrome.storage.local if available to ensure persistence across page refreshes
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      chrome.storage.local.get(["userCustomEteEstimates"], (res) => {
        const stored = res?.userCustomEteEstimates;
        if (stored && typeof stored === "object") {
          let hasDiff = false;
          courses.forEach((c) => {
            const codeKey = (c.courseCode || "").toUpperCase();
            const idKey = (c.id || "").toUpperCase();
            const nameKey = (c.courseName || "").toUpperCase();
            const val = stored[codeKey] ?? stored[idKey] ?? stored[nameKey] ?? stored[c.id];
            if (val !== undefined && val !== null && !isNaN(Number(val))) {
              const num = Number(val);
              if (courseEteEstimates[c.id] !== num) {
                courseEteEstimates[c.id] = num;
                hasDiff = true;
              }
            }
          });
          if (hasDiff) {
            render();
          }
        }
      });
    }
  } catch (_) {}

  // Find column header row
  const theadRows = table.querySelectorAll("thead tr");
  const actualHeaderRow = headerRow || (theadRows.length ? theadRows[theadRows.length - 1] : table.rows[0]);
  if (!actualHeaderRow) return () => {};

  const rowsPool = allRows && allRows.length
    ? allRows.slice((headerRowIndex ?? 0) + 1)
    : table.tBodies.length
    ? [...table.tBodies].flatMap((body) => [...body.rows])
    : [...table.rows].slice(1);

  // Identify body rows (excluding Total row)
  const courseRows = [];
  for (const row of rowsPool) {
    if (row === actualHeaderRow) continue;
    const text = (row.textContent || "").toLowerCase();
    if (text.includes("total")) continue;
    if (row.cells && row.cells.length >= 3) {
      courseRows.push(row);
    }
  }

  // 1. Injected Top Container (Disclaimer + Prediction Summary)
  document.querySelectorAll(`[${INJECT_ATTR}="marks-banner"]`).forEach((b) => b.remove());

  const banner = document.createElement("div");
  banner.className = "mujx-marks-banner";
  banner.setAttribute(INJECT_ATTR, "marks-banner");

  const insertTarget = table.closest(".table-responsive, .table-scrollable") || table;
  insertTarget.parentNode?.insertBefore(banner, insertTarget);

  // 2. Add header cells for Credits (if not natively present), Predicted Grade and ETE Actions
  const isTh = Boolean(actualHeaderRow.querySelector("th"));
  
  const hasNativeCreditCol = Array.from(actualHeaderRow.cells).some((c) =>
    c.textContent.trim().toLowerCase().includes("credit") && !c.hasAttribute(INJECT_ATTR)
  );

  let thCredit = null;
  if (!hasNativeCreditCol) {
    thCredit = document.createElement(isTh ? "th" : "td");
    thCredit.textContent = "Credits";
    thCredit.setAttribute(INJECT_ATTR, "marks-credit-col");
    thCredit.title = "Course credits (used for credit-weighted SGPA calculation)";
    thCredit.style.fontWeight = "700";
    thCredit.style.textAlign = "center";
    actualHeaderRow.append(thCredit);
  }

  const thPred = document.createElement(isTh ? "th" : "td");
  thPred.textContent = "Predicted Grade";
  thPred.setAttribute(INJECT_ATTR, "marks-pred-col");
  thPred.title = "Provisional grade based on internal marks + estimated ETE";
  thPred.style.fontWeight = "700";
  thPred.style.textAlign = "center";
  actualHeaderRow.append(thPred);

  const thTarget = document.createElement(isTh ? "th" : "td");
  thTarget.textContent = "ETE Calculator";
  thTarget.setAttribute(INJECT_ATTR, "marks-target-col");
  thTarget.title = "Calculate required ETE score for target grade";
  thTarget.style.fontWeight = "700";
  thTarget.style.textAlign = "center";
  actualHeaderRow.append(thTarget);

  // 3. Add cells to each course row
  const rowInjections = [];
  courseRows.forEach((row, i) => {
    if (i >= courses.length) return;
    const course = courses[i];

    let tdCredit = null;
    if (!hasNativeCreditCol) {
      tdCredit = document.createElement("td");
      tdCredit.setAttribute(INJECT_ATTR, "marks-credit-col");
      tdCredit.style.textAlign = "center";
      row.append(tdCredit);
    }

    const tdPred = document.createElement("td");
    tdPred.setAttribute(INJECT_ATTR, "marks-pred-col");
    tdPred.style.textAlign = "center";
    tdPred.style.fontWeight = "600";
    row.append(tdPred);

    const tdTarget = document.createElement("td");
    tdTarget.setAttribute(INJECT_ATTR, "marks-target-col");
    tdTarget.style.textAlign = "center";
    row.append(tdTarget);

    rowInjections.push({ row, index: i, course, tdPred, tdTarget, tdCredit });
  });

  function render() {
    // 1. Calculate projected total and provisional grade for each course
    const predictedCourseList = courses.map((course) => {
      const isSatisfactory = isSatisfactorySubject(course, satisfactoryMap);
      if (isSatisfactory) {
        const totalMarks = (course.internalSubtotal !== null && course.internalSubtotal !== undefined)
          ? course.internalSubtotal
          : (course.declaredTotal ?? course.prs ?? 0);
        const isPass = totalMarks >= 35;
        const provGrade = isPass ? "S" : "U";
        return {
          ...course,
          isSatisfactory: true,
          estimatedEte: 0,
          projectedTotal: totalMarks,
          provisionalGrade: provGrade,
          provisionalStatus: isPass ? "pass" : "fail",
          grade: provGrade,
          letter: provGrade,
          excludeFromGpa: true,
        };
      }

      const estimatedEte = courseEteEstimates[course.id] ?? (course.courseType === "theory" ? 28 : 25);
      const projectedTotal = course.internalSubtotal + estimatedEte;
      const provisional = classifyProvisionalGrade(projectedTotal, course.courseType);

      return {
        ...course,
        isSatisfactory: false,
        estimatedEte,
        projectedTotal,
        provisionalGrade: provisional.grade,
        provisionalStatus: provisional.status,
        grade: provisional.grade,
        letter: provisional.grade,
      };
    });

    // 2. Compute predicted SGPA
    const sgpaResult = calculateSGPA(predictedCourseList);
    const sgpaText = sgpaResult.ok && sgpaResult.sgpa !== null ? sgpaResult.sgpa.toFixed(2) : "—";

    // 3. Update Banner HTML
    banner.innerHTML = `
      <!-- Prominent Relative-Grading Disclaimer -->
      <div class="mujx-disclaimer-card" style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.35); border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:11.5px; line-height:1.45; color:#fde68a;">
        <div style="font-weight:700; display:flex; align-items:center; gap:6px; color:#f59e0b; margin-bottom:3px; font-size:12px;">
          <span>⚠️</span>
          <span>Important: SGPA and Grade Prediction Is Only an Estimate</span>
        </div>
        <div>
          MUJ follows a <strong>relative grading system</strong>. These predictions use the configured marks thresholds and available internal assessment data, so your final grades and SGPA may differ from the university's officially declared results. Do not treat the predicted SGPA as your final SGPA.
        </div>
      </div>

      <!-- Main Prediction Strip -->
      <div class="mujx-grade-banner-main" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div class="mujx-grade-sgpa-pill" style="background:#1e1e2d; border:1px solid #2d2d3f; border-radius:8px; padding:8px 16px; box-shadow:0 1px 3px rgba(0,0,0,0.35); display:flex; flex-direction:column; align-items:flex-start;">
          <span class="mujx-grade-sgpa-label" style="font-size:10px; font-weight:600; color:#94a3b8; letter-spacing:0.05em; text-transform:uppercase;">PREDICTED SGPA (FORECAST)</span>
          <span class="mujx-grade-sgpa-value" style="font-size:24px; font-weight:800; color:#f1f5f9; line-height:1.15;">${sgpaText}</span>
        </div>

        <div class="mujx-grade-stats" style="display:flex; gap:16px; flex-wrap:wrap;">
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.totalCredits}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Total Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.evaluatedCount} / ${courses.length}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Predicted Courses</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.totalWeightedPoints}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Total Points (Σ Ci×Gi)</span>
          </div>
        </div>

      </div>
    `;

    // 4. Update Course Table Rows
    rowInjections.forEach(({ course, tdPred, tdTarget, tdCredit }) => {
      const predCourse = predictedCourseList.find((p) => p.id === course.id);
      const estEte = courseEteEstimates[course.id];
      const provGrade = predCourse?.provisionalGrade || "—";
      const totalScore = predCourse?.projectedTotal;

      // Render Credits Selector if custom credits column injected
      if (tdCredit) {
        const isSat = Boolean(predCourse?.isSatisfactory);
        const defaultCr = (course.courseType === "lab" || course.courseType === "pbl" || isSat) ? 1 : 3;
        const crVal = course.credits ?? defaultCr;
        const existingSelect = tdCredit.querySelector("select");

        if (existingSelect) {
          if (document.activeElement !== existingSelect && Number(existingSelect.value) !== crVal) {
            existingSelect.value = String(crVal);
          }
        } else {
          tdCredit.innerHTML = `
            <select class="mujx-credit-dropdown" style="padding:2px 5px; font-size:11px; border-radius:4px; background:rgba(0,0,0,0.3); border:1px solid rgba(13,148,136,0.4); color:inherit; font-weight:700; cursor:pointer;" title="Adjust course credits">
              <option value="1" ${crVal === 1 ? "selected" : ""}>1</option>
              <option value="2" ${crVal === 2 ? "selected" : ""}>2</option>
              <option value="3" ${crVal === 3 ? "selected" : ""}>3</option>
              <option value="4" ${crVal === 4 ? "selected" : ""}>4</option>
              <option value="0" ${crVal === 0 ? "selected" : ""}>0</option>
            </select>
          `;
          tdCredit.querySelector("select")?.addEventListener("change", (e) => {
            const newCr = Number(e.target.value);
            course.credits = newCr;
            try {
              if (typeof chrome !== "undefined" && chrome.storage?.local) {
                const codeKey = (course.courseCode || "").toUpperCase();
                const idKey = (course.id || "").toUpperCase();
                const nameKey = (course.courseName || "").toUpperCase();

                chrome.storage.local.get(["userCustomCredits", "courseCredits"], (res) => {
                  const userCreds = res?.userCustomCredits || {};
                  const courseCreds = res?.courseCredits || {};

                  if (codeKey) {
                    userCreds[codeKey] = newCr;
                    courseCreds[codeKey] = newCr;
                  }
                  if (idKey) {
                    userCreds[idKey] = newCr;
                    courseCreds[idKey] = newCr;
                  }
                  if (nameKey) {
                    userCreds[nameKey] = newCr;
                    courseCreds[nameKey] = newCr;
                  }

                  chrome.storage.local.set({
                    userCustomCredits: userCreds,
                    courseCredits: courseCreds,
                  });
                });
              }
            } catch (_) {}
            render();
          });
        }
      }

      // Render Predicted Grade Cell
      if (predCourse?.isSatisfactory) {
        const isPass = (predCourse?.projectedTotal ?? 0) >= 35;
        const sGrade = isPass ? "S" : "U";
        const sColor = isPass ? "#10b981" : "#ef4444";
        tdPred.innerHTML = `
          <div style="display:flex; justify-content:center; align-items:center;">
            <span style="font-size:14px; font-weight:800; color:${sColor};">${sGrade}</span>
          </div>
        `;
      } else {
        const existingInput = tdPred.querySelector(`[data-course-ete="${course.id}"]`);
        const gradeSpan = tdPred.querySelector(`[data-role="prov-grade"]`);
        const scoreSpan = tdPred.querySelector(`[data-role="total-score"]`);

        if (existingInput && gradeSpan && scoreSpan) {
          // In-place update: NEVER destroy the input element or lose cursor position
          gradeSpan.textContent = provGrade;
          scoreSpan.textContent = `(${totalScore}/100)`;
          if (document.activeElement !== existingInput && existingInput.value !== String(estEte)) {
            existingInput.value = estEte !== undefined && estEte !== null ? String(estEte) : "";
          }
        } else {
          tdPred.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
              <div style="display:inline-flex; align-items:center; gap:4px;">
                <span data-role="prov-grade" style="font-size:13px; font-weight:800; color:var(--mujx-accent, #2dd4bf);">${provGrade}</span>
                <span data-role="total-score" style="font-size:10px; opacity:0.7;">(${totalScore}/100)</span>
              </div>
              <div style="font-size:10.5px; opacity:0.7; display:flex; align-items:center; gap:2px;">
                <span>ETE:</span>
                <input type="number" min="0" max="40" value="${estEte}" data-course-ete="${course.id}" data-mujx="course-ete-input" style="width:38px; padding:1px 3px; font-size:10px; border-radius:3px; background:rgba(0,0,0,0.3); border:1px solid rgba(13,148,136,0.5); color:#fff; text-align:center;" />
              </div>
            </div>
          `;

          const rowEteInput = tdPred.querySelector(`[data-course-ete="${course.id}"]`);

          let eteSaveTimer = null;
          const saveScoreToStorage = (val, immediate = false) => {
            try {
              if (typeof chrome !== "undefined" && chrome.storage?.local) {
                const codeKey = (course.courseCode || "").toUpperCase();
                const idKey = (course.id || "").toUpperCase();
                const nameKey = (course.courseName || "").toUpperCase();

                if (initialEteEstimates) {
                  if (codeKey) initialEteEstimates[codeKey] = val;
                  if (idKey) initialEteEstimates[idKey] = val;
                  if (nameKey) initialEteEstimates[nameKey] = val;
                  initialEteEstimates[course.id] = val;
                }

                const commit = () => {
                  chrome.storage.local.get(["userCustomEteEstimates"], (res) => {
                    const userEte = res?.userCustomEteEstimates || {};
                    if (codeKey) userEte[codeKey] = val;
                    if (idKey) userEte[idKey] = val;
                    if (nameKey) userEte[nameKey] = val;
                    userEte[course.id] = val;

                    chrome.storage.local.set({
                      userCustomEteEstimates: userEte,
                    });
                  });
                };

                if (eteSaveTimer) clearTimeout(eteSaveTimer);
                if (immediate) {
                  commit();
                } else {
                  eteSaveTimer = setTimeout(commit, 250);
                }
              }
            } catch (_) {}
          };

          const handleEteInput = (valStr, isFinal) => {
            if (valStr === "" || valStr === null || valStr === undefined) {
              if (isFinal) {
                courseEteEstimates[course.id] = 0;
                rowEteInput.value = "0";
                saveScoreToStorage(0, true);
                render();
              }
              return;
            }

            const val = Number(valStr);
            if (!Number.isFinite(val) || val < 0) return;

            const clamped = Math.min(val, 40);
            if (isFinal && clamped !== val) {
              rowEteInput.value = String(clamped);
            }

            courseEteEstimates[course.id] = clamped;
            saveScoreToStorage(clamped, isFinal);
            render();
          };

          rowEteInput?.addEventListener("input", (e) => {
            handleEteInput(e.target.value, false);
          });
          rowEteInput?.addEventListener("change", (e) => {
            handleEteInput(e.target.value, true);
          });
          rowEteInput?.addEventListener("blur", (e) => {
            handleEteInput(e.target.value, true);
          });
        }
      }

      // Render ETE Calculator Target Button (only for evaluative theory courses)
      if (!tdTarget.hasChildNodes()) {
        if (predCourse?.isSatisfactory) {
          tdTarget.innerHTML = `<span style="font-size:10.5px; opacity:0.4;">—</span>`;
        } else if (course.courseType === "theory") {
          tdTarget.innerHTML = `
            <button type="button" class="mujx-ete-target-btn" data-course-id="${course.id}" style="padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; background:#1e1e2d; border:1px solid #2d2d3f; color:#f1f5f9; box-shadow:0 1px 3px rgba(0,0,0,0.25); cursor:pointer; white-space:nowrap;">
              ETE Target
            </button>
          `;

          const btn = tdTarget.querySelector(`[data-course-id="${course.id}"]`);
          btn?.addEventListener("click", (e) => {
            e.stopPropagation();
            openEteTargetPopover({ anchorEl: btn, course });
          });
        } else {
          tdTarget.innerHTML = `<span style="font-size:10.5px; opacity:0.5;">Lab / PBL</span>`;
        }
      }
    });
  }

  // Initial render
  render();

  return () => {
    banner.remove();
    thCredit?.remove();
    thPred.remove();
    thTarget.remove();
    rowInjections.forEach(({ tdPred, tdTarget, tdCredit }) => {
      tdCredit?.remove();
      tdPred.remove();
      tdTarget.remove();
    });
  };
}
