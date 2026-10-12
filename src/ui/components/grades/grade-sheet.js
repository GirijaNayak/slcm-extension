import { calculateSGPA, gradePointForLetter } from "../../../calculations/sgpa.js";
import { escapeHtml } from "../../../shared/dom.js";
import { INJECT_ATTR } from "../../../shared/constants.js";

/**
 * Enhances the Grade Sheet table (/Student/Academic/GradesForStudent) inline.
 * Computes official credit-weighted SGPA per MUJ Examination Handbook & Certificate.
 * Features:
 * - Compact inline summary strip (no giant modal/overlay)
 * - Academic session detection (e.g. "SGPA · JAN–MAY 2025", "SGPA · JUL–NOV 2025")
 * - Discrepancy handling & footer credit verification
 * - Expandable course-wise calculation breakdown with substituted formula
 * - Interactive Predict / Simulate Grades mode with real-time recalculation & reset
 */
export function enhanceGradeSheet({
  table,
  records,
  totalCreditsFromFooter,
  headerRow,
  allRows,
  headerRowIndex,
  session,
}) {
  if (!table || !records || !records.length) return () => {};

  // Check if table is already enhanced
  if (table.querySelector(`[${INJECT_ATTR}="grade-points"]`)) {
    // If the table already has our injected column, check if data matches current records
    return () => {};
  }

  // Preserve official records for reset capability
  const officialRecords = records.map((r) => ({ ...r }));
  let workingRecords = records.map((r) => ({ ...r }));
  let isPredictMode = false;
  let isBreakdownOpen = false;

  // Find the exact column header row
  const theadRows = table.querySelectorAll("thead tr");
  const actualHeaderRow = headerRow || (theadRows.length ? theadRows[theadRows.length - 1] : table.rows[0]);
  if (!actualHeaderRow) return () => {};

  const rowsPool = allRows && allRows.length
    ? allRows.slice((headerRowIndex ?? 0) + 1)
    : table.tBodies.length
    ? [...table.tBodies].flatMap((body) => [...body.rows])
    : [...table.rows].slice(1);

  // Identify body rows (excluding Total footer and the header row itself)
  const courseRows = [];
  let totalRow = null;

  for (const row of rowsPool) {
    if (row === actualHeaderRow) continue;
    const text = (row.textContent || "").toLowerCase();
    if (text.includes("total")) {
      totalRow = row;
    } else if (row.cells && row.cells.length >= 3) {
      courseRows.push(row);
    }
  }

  // 1. Create and insert the compact SGPA Summary Container above the table
  document.querySelectorAll(`[${INJECT_ATTR}="grade-banner"]`).forEach((b) => b.remove());

  const container = document.createElement("div");
  container.className = "mujx-grade-banner";
  container.setAttribute(INJECT_ATTR, "grade-banner");

  const insertTarget = table.closest(".table-responsive, .table-scrollable") || table;
  insertTarget.parentNode?.insertBefore(container, insertTarget);

  // 2. Add header cells for Grade Points (Gi) and Credit Points (Ci × Gi)
  const isTh = Boolean(actualHeaderRow.querySelector("th"));
  const thGp = document.createElement(isTh ? "th" : "td");
  thGp.textContent = "Pts (Gi)";
  thGp.setAttribute(INJECT_ATTR, "grade-points");
  thGp.title = "Grade Points corresponding to letter grade";
  thGp.style.fontWeight = "700";
  thGp.style.textAlign = "center";
  actualHeaderRow.append(thGp);

  const thCp = document.createElement(isTh ? "th" : "td");
  thCp.textContent = "Ci × Gi";
  thCp.setAttribute(INJECT_ATTR, "credit-points");
  thCp.title = "Credit Points = Course Credits × Grade Points (MUJ Formula)";
  thCp.style.fontWeight = "700";
  thCp.style.textAlign = "center";
  actualHeaderRow.append(thCp);

  // 3. Add cells to course rows
  const tdCells = [];
  courseRows.forEach((row, i) => {
    const tdGp = document.createElement("td");
    tdGp.setAttribute(INJECT_ATTR, "grade-points");
    tdGp.style.textAlign = "center";
    tdGp.style.fontWeight = "600";
    row.append(tdGp);

    const tdCp = document.createElement("td");
    tdCp.setAttribute(INJECT_ATTR, "credit-points");
    tdCp.style.textAlign = "center";
    tdCp.style.fontWeight = "600";
    row.append(tdCp);

    tdCells.push({ row, index: i, tdGp, tdCp });
  });

  // 4. Enhance total row if present
  let totalTdGp = null;
  let totalTdCp = null;
  if (totalRow) {
    totalTdGp = document.createElement("td");
    totalTdGp.setAttribute(INJECT_ATTR, "grade-points");
    totalTdGp.style.textAlign = "center";
    totalRow.append(totalTdGp);

    totalTdCp = document.createElement("td");
    totalTdCp.setAttribute(INJECT_ATTR, "credit-points");
    totalTdCp.style.textAlign = "center";
    totalRow.append(totalTdCp);
  }

  // Find the original Grade cells in course rows
  const originalGradeCells = courseRows.map((row) => {
    const cells = [...row.cells].filter((c) => !c.hasAttribute(INJECT_ATTR));
    return cells[cells.length - 1];
  });
  const originalGradeHtmls = originalGradeCells.map((c) => c?.innerHTML || "");

  // Determine detected session
  const detectedSession =
    session ||
    records.find((r) => r.session)?.session ||
    records.find((r) => r.semester)?.semester ||
    detectSemesterFromDOM(table.ownerDocument || document) ||
    "Semester not identified";

  function render() {
    const calculation = calculateSGPA(workingRecords, {
      expectedTotalCredits: totalCreditsFromFooter,
      semester: detectedSession,
    });

    const isModified = workingRecords.some((r, i) => r.letter !== officialRecords[i].letter);
    const sgpaText = calculation.sgpa !== null ? calculation.sgpa.toFixed(2) : "—";
    const statusLabel =
      calculation.status === "complete"
        ? "✓ Complete"
        : calculation.status === "provisional"
        ? "Provisional"
        : "⚠ Incomplete";

    const hasCreditMismatch = calculation.warnings.includes("credit_mismatch");
    const nonEvalCourses = calculation.courses.filter((c) => c.status === "non_evaluative");

    // Render Compact Summary Strip + Expandable Breakdown
    container.innerHTML = `
      <!-- 1. Compact Summary Strip -->
      <div class="mujx-grade-banner-main">
        <div class="mujx-grade-sgpa-pill">
          <span class="mujx-grade-sgpa-label">
            ${isModified ? "PREDICTED SGPA" : "OFFICIAL SGPA"}
            ${detectedSession ? `· ${escapeHtml(detectedSession)}` : ""}
          </span>
          <span class="mujx-grade-sgpa-value">${sgpaText}</span>
        </div>

        <div class="mujx-grade-stats">
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalCredits}</span>
            <span class="mujx-stat-lbl">Total Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.gradedCredits}</span>
            <span class="mujx-stat-lbl">Graded Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalWeightedPoints}</span>
            <span class="mujx-stat-lbl">Points (Σ Ci×Gi)</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalCount}</span>
            <span class="mujx-stat-lbl">Courses</span>
          </div>
        </div>

        <div class="mujx-grade-actions">
          <span class="mujx-chip ${calculation.status === "complete" ? "safe" : "danger"}" style="font-size:11px; padding:3px 8px;">
            ${statusLabel}
          </span>
          <button type="button" class="mujx-calc-toggle-btn" data-role="toggle-breakdown" style="padding:6px 11px; font-size:11.5px; border-radius:6px; cursor:pointer; background:rgba(13, 148, 136, 0.15); border:1px solid rgba(13, 148, 136, 0.4); color:inherit; font-weight:600;">
            ${isBreakdownOpen ? "✕ Hide calculation" : "🔍 View calculation"}
          </button>
          <button type="button" class="mujx-pred-btn ${isPredictMode ? "active" : ""}" data-role="toggle-pred" style="padding:6px 12px; font-size:11.5px;">
            ${isPredictMode ? "✓ Done Simulating" : "🎯 Predict SGPA"}
          </button>
          <button type="button" class="mujx-reset-btn" data-role="reset-pred" ${isModified ? "" : "hidden"} style="padding:6px 10px; font-size:11.5px;">
            ↺ Reset Official
          </button>
        </div>
      </div>

      <!-- Warnings / Discrepancy Alert -->
      ${
        hasCreditMismatch
          ? `<div class="mujx-warning-strip" style="background:rgba(245, 158, 11, 0.12); border:1px solid rgba(245, 158, 11, 0.35); border-radius:6px; padding:6px 12px; font-size:12px; color:#d97706; display:flex; align-items:center; gap:8px;">
              <span>⚠️</span>
              <span><strong>Credit Discrepancy:</strong> Sum of parsed course credits (${calculation.totalCredits}) does not match the table footer Total (${totalCreditsFromFooter}). Both values are preserved.</span>
            </div>`
          : ""
      }

      <!-- 2. Course-wise Expandable Breakdown Section (shown when View calculation is clicked) -->
      <div class="mujx-grade-breakdown" data-role="breakdown-section" ${isBreakdownOpen ? "" : "hidden"} style="background:rgba(0,0,0,0.22); border:1px solid rgba(125,125,125,0.25); border-radius:8px; padding:12px 14px; margin-top:6px; box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-weight:700; font-size:13px; color:var(--mujx-accent, #2dd4bf);">
            Course-Wise Calculation Breakdown (${escapeHtml(detectedSession)})
          </div>
          <div style="font-size:11px; opacity:0.75;">
            Formula: <strong>SGPA = Σ(Ci × Gi) / ΣCi</strong>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table class="mujx-breakdown-table" style="width:100%; border-collapse:collapse; font-size:11.5px; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid rgba(125,125,125,0.3); opacity:0.85;">
                <th style="padding:4px 8px;">Course Code</th>
                <th style="padding:4px 8px;">Course Name</th>
                <th style="padding:4px 8px; text-align:center;">Credits (Ci)</th>
                <th style="padding:4px 8px; text-align:center;">Grade</th>
                <th style="padding:4px 8px; text-align:center;">Grade Points (Gi)</th>
                <th style="padding:4px 8px; text-align:right;">Weighted (Ci × Gi)</th>
              </tr>
            </thead>
            <tbody>
              ${calculation.courses
                .map((c) => {
                  const isNonEval = c.status === "non_evaluative";
                  const isBad = c.status === "invalid_credits" || c.status === "unknown_grade" || c.status === "missing_grade";
                  const gpText = isNonEval ? "—" : isBad ? "Unresolved" : c.gradePoints !== null ? c.gradePoints : "—";
                  const wpText = isNonEval
                    ? `<span style="opacity:0.7; font-size:11px;">Satisfactory (Audit)</span>`
                    : isBad
                    ? `<span style="color:#ef4444;">Flagged</span>`
                    : c.weightedPoints;

                  return `
                    <tr style="border-bottom:1px solid rgba(125,125,125,0.12);">
                      <td style="padding:4px 8px; font-weight:600;">${escapeHtml(c.courseCode || "—")}</td>
                      <td style="padding:4px 8px;">${escapeHtml(c.courseName || "—")}</td>
                      <td style="padding:4px 8px; text-align:center;">${c.credits !== null ? c.credits : "—"}</td>
                      <td style="padding:4px 8px; text-align:center; font-weight:700;">${escapeHtml(c.grade || "—")}</td>
                      <td style="padding:4px 8px; text-align:center;">${gpText}</td>
                      <td style="padding:4px 8px; text-align:right; font-weight:600;">${wpText}</td>
                    </tr>
                  `;
                })
                .join("")}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid rgba(125,125,125,0.4); font-weight:700;">
                <td colspan="2" style="padding:6px 8px;">Totals (Evaluated: ${calculation.evaluatedCount} / Total: ${calculation.totalCount} courses)</td>
                <td style="padding:6px 8px; text-align:center;">${calculation.totalCredits} (Graded: ${calculation.gradedCredits})</td>
                <td colspan="2" style="padding:6px 8px; text-align:right;">Total Weighted Points (Σ Ci×Gi):</td>
                <td style="padding:6px 8px; text-align:right; color:var(--mujx-accent, #2dd4bf);">${calculation.totalWeightedPoints}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="margin-top:10px; padding-top:8px; border-top:1px dashed rgba(125,125,125,0.25); display:flex; flex-direction:column; gap:4px; font-size:11.5px;">
          <div>
            <strong>Substituted Identity:</strong>
            <code>${escapeHtml(calculation.substitutedFormula)}</code>
          </div>
          ${
            nonEvalCourses.length
              ? `<div style="opacity:0.85; color:#0d9488;">
                  ℹ️ <strong>Non-Evaluative Courses:</strong> ${nonEvalCourses.map((c) => `${escapeHtml(c.courseCode)} (${c.credits} cr, Grade '${escapeHtml(c.grade)}')`).join(", ")} fulfill degree requirements but do not carry grade points and are excluded from the GPA credit divisor per MUJ regulations.
                </div>`
              : ""
          }
        </div>
      </div>
    `;

    // Wire button events
    container.querySelector("[data-role=toggle-breakdown]")?.addEventListener("click", () => {
      isBreakdownOpen = !isBreakdownOpen;
      const bSec = container.querySelector("[data-role=breakdown-section]");
      if (bSec) bSec.hidden = !isBreakdownOpen;
      const tBtn = container.querySelector("[data-role=toggle-breakdown]");
      if (tBtn) tBtn.textContent = isBreakdownOpen ? "✕ Hide calculation" : "🔍 View calculation";
    });

    container.querySelector("[data-role=toggle-pred]")?.addEventListener("click", () => {
      isPredictMode = !isPredictMode;
      updateGradeCells();
      render();
    });

    container.querySelector("[data-role=reset-pred]")?.addEventListener("click", () => {
      workingRecords = officialRecords.map((r) => ({ ...r }));
      updateGradeCells();
      render();
    });

    // Update table course rows
    tdCells.forEach(({ index, tdGp, tdCp }) => {
      const rec = workingRecords[index];
      const inc = calculation.courses.find((_, i) => i === index) || {};
      const gp = inc.gradePoints;
      const cp = inc.weightedPoints;

      if (inc.status === "non_evaluative") {
        tdGp.innerHTML = `<span style="opacity:0.75; font-size:11.5px;">Satisfactory</span>`;
        tdCp.innerHTML = `<span style="opacity:0.6;">—</span>`;
      } else if (gp !== null && gp !== undefined) {
        tdGp.textContent = String(gp);
        tdCp.textContent = String(cp);
      } else {
        tdGp.textContent = "—";
        tdCp.textContent = "—";
      }
    });

    // Update total row if present
    if (totalRow) {
      if (totalTdGp) {
        totalTdGp.innerHTML = `<span style="font-size:11px; opacity:0.8;">Total Points:</span>`;
      }
      if (totalTdCp) {
        totalTdCp.innerHTML = `
          <div style="font-weight:700;">${calculation.totalWeightedPoints}</div>
          <div class="mujx-sgpa-table-badge" style="margin-top:2px;">SGPA: ${sgpaText}</div>
        `;
      }
    }
  }

  function updateGradeCells() {
    originalGradeCells.forEach((cell, i) => {
      if (!cell) return;
      if (isPredictMode) {
        const curLetter = workingRecords[i].letter || "";
        const options = ["A+", "A", "B", "C", "D", "E", "F", "S"];
        cell.innerHTML = `
          <select class="mujx-grade-select" data-grade-idx="${i}">
            ${options
              .map(
                (opt) =>
                  `<option value="${opt}" ${opt === curLetter ? "selected" : ""}>${opt}${
                    opt === "S" ? " (Satisfactory)" : ` (${gradePointForLetter(opt)})`
                  }</option>`,
              )
              .join("")}
          </select>
        `;
        const select = cell.querySelector("select");
        select?.addEventListener("change", (e) => {
          workingRecords[i].letter = e.target.value;
          render();
        });
      } else {
        cell.innerHTML = originalGradeHtmls[i];
      }
    });
  }

  // Initial render
  render();

  return () => {
    container.remove();
    thGp.remove();
    thCp.remove();
    tdCells.forEach(({ tdGp, tdCp }) => {
      tdGp.remove();
      tdCp.remove();
    });
    totalTdGp?.remove();
    totalTdCp?.remove();
    originalGradeCells.forEach((cell, i) => {
      if (cell) cell.innerHTML = originalGradeHtmls[i];
    });
  };
}

/**
 * Helper to discover semester or academic session from page controls (dropdowns, headings).
 */
function detectSemesterFromDOM(doc = document) {
  // Check semester selector dropdown
  const selects = doc.querySelectorAll("select");
  for (const sel of selects) {
    const selectedOption = sel.options[sel.selectedIndex];
    if (selectedOption) {
      const text = selectedOption.textContent.trim();
      if (/^(?:sem|semester|[ivx]+|\d+)/i.test(text)) {
        return `Semester ${text}`;
      }
    }
  }

  // Check subheaders or breadcrumbs
  const breadcrumbs = doc.querySelectorAll(".breadcrumb, .page-title, h1, h2, h3, h4");
  for (const el of breadcrumbs) {
    const text = el.textContent.trim();
    const match = text.match(/(JAN-MAY\s*\d{4}|JUL-NOV\s*\d{4}|Semester\s*[\dIVX]+)/i);
    if (match) return match[1].toUpperCase();
  }

  return null;
}
