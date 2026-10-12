import {
  attendancePercent,
  classesNeeded,
  classifyStatus,
  consecutiveRecovery,
  enhanceRecord,
  safeSkips,
  simulateFuture,
} from "../../../calculations/attendance.js";
import { escapeHtml } from "../../../shared/dom.js";

export function renderAttendancePanel({ records, threshold, borderlineBand, wrap }) {
  const enhanced = records.map((record) => enhanceRecord(record, threshold, borderlineBand));
  const safeCourses = enhanced.filter((r) => r.status.code === "safe");
  const borderlineCourses = enhanced.filter((r) => r.status.code === "borderline");
  const lowCourses = enhanced.filter((r) => r.status.code === "low");

  const sumPresent = records.reduce((acc, r) => acc + (Number(r.present) || 0), 0);
  const sumTotal = records.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
  const overall = attendancePercent(sumPresent, sumTotal);

  wrap.innerHTML = `
    <div style="padding:4px 0;">
      <h3 class="mujx-title" style="font-size:15px; margin-bottom:6px;">Attendance Summary & What-If Simulation</h3>
      <p class="mujx-sub" style="font-size:12px; margin-bottom:12px;">
        Overall: <strong>${overall.percent !== null ? `${overall.percent}%` : "—"}</strong> (${sumPresent}/${sumTotal} classes) · 
        <span style="color:var(--mujx-ok);">${safeCourses.length} Safe</span> · 
        <span style="color:var(--mujx-warn);">${borderlineCourses.length} At Risk</span> · 
        <span style="color:var(--mujx-bad);">${lowCourses.length} Critical</span>
      </p>

      <div class="mujx-row" style="margin-bottom:12px;">
        <label class="mujx-sub">Subject
          <select class="mujx-select" data-role="sim-subject">
            <option value="__all__">All Courses (${enhanced.length})</option>
            ${enhanced.map((r, i) => `<option value="${i}">${escapeHtml(r.subject)} (${r.percent}%)</option>`).join("")}
          </select>
        </label>
        <label class="mujx-sub">Classes to attend
          <input class="mujx-input" type="number" min="0" max="60" value="0" data-role="sim-attend" style="width:75px;">
        </label>
        <label class="mujx-sub">Classes to miss
          <input class="mujx-input" type="number" min="0" max="60" value="1" data-role="sim-miss" style="width:75px;">
        </label>
      </div>

      <div data-role="sim-out"></div>
    </div>
  `;

  const subSelect = wrap.querySelector("[data-role=sim-subject]");
  const attendInput = wrap.querySelector("[data-role=sim-attend]");
  const missInput = wrap.querySelector("[data-role=sim-miss]");
  const outEl = wrap.querySelector("[data-role=sim-out]");

  const updateSimulation = () => {
    const attend = Math.max(0, Math.floor(Number(attendInput.value) || 0));
    const miss = Math.max(0, Math.floor(Number(missInput.value) || 0));
    const selVal = subSelect.value;

    const subjectsToSimulate = selVal === "__all__" ? enhanced : [enhanced[Number(selVal)]].filter(Boolean);

    const rows = subjectsToSimulate.map((record) => {
      const sim = simulateFuture(Number(record.present) || 0, Number(record.total) || 0, attend, miss, threshold);
      const newStatus = classifyStatus(sim.percent, threshold, borderlineBand);
      return `
        <tr>
          <td><strong>${escapeHtml(record.subject)}</strong></td>
          <td>${record.percent ?? "—"}%</td>
          <td>${sim.present} / ${sim.total}</td>
          <td><strong style="color:${sim.percent >= threshold ? "var(--mujx-ok)" : "var(--mujx-bad)"}">${sim.percent ?? "—"}%</strong></td>
          <td><span class="mujx-chip ${newStatus.code}">${escapeHtml(newStatus.label)}</span></td>
          <td>${sim.safeSkips > 0 ? `<span class="mujx-skips-badge">+${sim.safeSkips} safe</span>` : `<span class="mujx-needed-badge">Need ${sim.classesNeeded}</span>`}</td>
        </tr>
      `;
    });

    outEl.innerHTML = `
      <table class="mujx-table">
        <thead>
          <tr>
            <th>Course</th>
            <th>Current %</th>
            <th>Projected</th>
            <th>Projected %</th>
            <th>Status</th>
            <th>Skips / Needed</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
      <p class="mujx-note" style="margin-top:6px;">* Simulated trajectory assuming you attend next ${attend} and miss next ${miss} classes.</p>
    `;
  };

  subSelect?.addEventListener("change", updateSimulation);
  attendInput?.addEventListener("input", updateSimulation);
  missInput?.addEventListener("input", updateSimulation);
  updateSimulation();

  return enhanced;
}

export function renderAttendanceCell(td, record, threshold, borderlineBand) {
  const enhanced = enhanceRecord(record, threshold, borderlineBand);
  const recovery = consecutiveRecovery(record.present, record.total, threshold);
  const status = enhanced.status || classifyStatus(enhanced.percent, threshold, borderlineBand);

  let splitHtml = "";
  if (record.theoryTotal || record.practicalTotal) {
    const parts = [];
    if (record.theoryTotal) {
      const tPct = record.theoryPresent !== null ? Math.round((record.theoryPresent / record.theoryTotal) * 100) : null;
      parts.push(`Theory: ${tPct !== null ? `${tPct}%` : "—"}`);
    }
    if (record.practicalTotal) {
      const pPct = record.practicalPresent !== null ? Math.round((record.practicalPresent / record.practicalTotal) * 100) : null;
      parts.push(`Lab: ${pPct !== null ? `${pPct}%` : "—"}`);
    }
    if (parts.length) {
      splitHtml = `<div class="mujx-intel-sub" style="font-size:10.5px; color:#64748b;">${parts.join(" · ")}</div>`;
    }
  }

  const tooltip = enhanced.safeSkips > 0
    ? `Safe Skips: ${enhanced.safeSkips} | Attended: ${record.present}/${record.total} (${enhanced.percent}%) | Target: ${threshold}%`
    : enhanced.classesNeeded > 0
    ? `Recovery: Need ${enhanced.classesNeeded} consecutive classes | Attended: ${record.present}/${record.total} (${enhanced.percent}%)`
    : `At ${threshold}% Cutoff`;

  td.innerHTML = `
    <div class="mujx-intel-cell" title="${escapeHtml(tooltip)}">
      <div class="mujx-intel-top" style="display:flex; align-items:center; gap:6px;">
        <span class="mujx-chip ${status.code}" style="font-size:11px; padding:1px 7px;">${escapeHtml(status.label)}</span>
        ${
          enhanced.safeSkips > 0
            ? `<span class="mujx-skips-badge" style="font-size:11px; font-weight:700;">+${enhanced.safeSkips} skip${enhanced.safeSkips === 1 ? "" : "s"}</span>`
            : enhanced.classesNeeded > 0
            ? `<span class="mujx-needed-badge" style="font-size:11px; font-weight:700;">Need ${enhanced.classesNeeded}</span>`
            : `<span class="mujx-skips-badge" style="background:#f1f5f9; color:#475569; font-size:11px;">At cutoff</span>`
        }
      </div>
      <div class="mujx-intel-sub" style="font-size:11px; color:#64748b;">${escapeHtml(recovery.explanation || "")}</div>
      ${splitHtml}
    </div>
  `;
}
