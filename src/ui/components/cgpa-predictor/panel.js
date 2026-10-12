import { compareScenarios, computeCgpa } from "../../../calculations/cgpa.js";
import { progressionChart } from "../../charts.js";
import { escapeHtml } from "../../../shared/dom.js";

export function renderCgpaPredictor({ wrap, seed }) {
  const state = {
    currentCgpa: seed?.currentCgpa ?? (seed?.currentSgpa ?? 8.0),
    completedCredits: seed?.completedCredits ?? 60,
    scenarioNameA: "Conservative Plan",
    scenarioNameB: "Ambitious Plan",
    semestersA: [
      { label: "Sem 5", sgpa: 8.2, credits: 22 },
      { label: "Sem 6", sgpa: 8.4, credits: 22 },
      { label: "Sem 7", sgpa: 8.5, credits: 20 },
      { label: "Sem 8", sgpa: 9.0, credits: 16 },
    ],
    semestersB: [
      { label: "Sem 5", sgpa: 9.0, credits: 22 },
      { label: "Sem 6", sgpa: 9.2, credits: 22 },
      { label: "Sem 7", sgpa: 9.4, credits: 20 },
      { label: "Sem 8", sgpa: 9.5, credits: 16 },
    ],
  };

  const paint = () => {
    wrap.innerHTML = `
      <section class="mujx-card" aria-label="CGPA predictor">
        <div class="mujx-head">
          <div>
            <div class="mujx-kicker"><span class="mujx-kicker-dot"></span> Feature C</div>
            <h2 class="mujx-title">CGPA Progression Predictor</h2>
            <p class="mujx-sub">Project your graduation CGPA across future semesters under multiple hypothetical academic scenarios.</p>
          </div>
          <button class="mujx-btn secondary" type="button" data-role="reset-btn">↺ Reset to Baseline</button>
        </div>

        ${
          seed?.available
            ? `<div class="mujx-sim-box" style="margin-bottom:12px; background:var(--mujx-info-bg); border-color:var(--mujx-info-border);">
                <span style="font-size:12px; color:var(--mujx-info);">Prefilled from ${escapeHtml(seed.source)}: Current CGPA <strong>${seed.currentCgpa ?? "—"}</strong> (${seed.completedCredits ?? "—"} credits).</span>
              </div>`
            : `<div class="mujx-sim-box" style="margin-bottom:12px;">
                <span class="mujx-sub">Enter your verified CGPA and completed credits below to start simulation.</span>
              </div>`
        }

        <div class="mujx-row" style="margin-bottom:16px;">
          <label class="mujx-sub"><strong>Current CGPA</strong>
            <input class="mujx-input" data-k="currentCgpa" type="number" step="0.01" min="0" max="10" value="${escapeHtml(state.currentCgpa)}" style="width:110px; font-weight:700;">
          </label>
          <label class="mujx-sub"><strong>Completed Credits</strong>
            <input class="mujx-input" data-k="completedCredits" type="number" step="1" min="0" max="250" value="${escapeHtml(state.completedCredits)}" style="width:110px; font-weight:700;">
          </label>
          <div style="align-self:flex-end;">
            <button class="mujx-btn secondary" type="button" data-role="add-sem-btn" style="padding:6px 12px; font-size:12px;">+ Add Semester</button>
            <button class="mujx-btn secondary" type="button" data-role="remove-sem-btn" style="padding:6px 12px; font-size:12px;">- Remove</button>
          </div>
        </div>

        <div class="mujx-grid" style="grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap:16px;">
          <!-- Scenario A -->
          <div class="mujx-card" style="margin:0; border:1px solid #0d9488;">
            <div class="mujx-head" style="margin-bottom:8px;">
              <div>
                <span class="mujx-chip safe" style="font-size:11px;">Scenario A</span>
                <input class="mujx-input" data-role="sc-name-a" value="${escapeHtml(state.scenarioNameA)}" style="font-weight:700; margin-top:4px; font-size:13px; width:100%;">
              </div>
              <div style="text-align:right">
                <span class="mujx-metric-label">Projected CGPA</span>
                <b data-role="final-cgpa-a" style="color:#0d9488; font-size:20px;">—</b>
              </div>
            </div>
            <div data-role="sem-inputs-a"></div>
          </div>

          <!-- Scenario B -->
          <div class="mujx-card" style="margin:0; border:1px solid #6366f1;">
            <div class="mujx-head" style="margin-bottom:8px;">
              <div>
                <span class="mujx-chip" style="font-size:11px; background:#e0e7ff; color:#4338ca; border:1px solid #c7d2fe;">Scenario B</span>
                <input class="mujx-input" data-role="sc-name-b" value="${escapeHtml(state.scenarioNameB)}" style="font-weight:700; margin-top:4px; font-size:13px; width:100%;">
              </div>
              <div style="text-align:right">
                <span class="mujx-metric-label">Projected CGPA</span>
                <b data-role="final-cgpa-b" style="color:#6366f1; font-size:20px;">—</b>
              </div>
            </div>
            <div data-role="sem-inputs-b"></div>
          </div>
        </div>

        <!-- Trajectory Chart -->
        <div style="margin-top:16px;">
          <h3 class="mujx-title" style="font-size:14px; margin-bottom:4px;">Progression Trajectory Comparison</h3>
          <div data-role="chart-slot"></div>
        </div>

        <!-- Milestone Table -->
        <div style="margin-top:14px;">
          <h3 class="mujx-title" style="font-size:14px; margin-bottom:4px;">Semester Milestone Breakdown</h3>
          <div data-role="table-slot"></div>
        </div>

        <p class="mujx-note" style="margin-top:12px;">
          * Formula: <code>CGPA = Σ(SGPA_i × Credits_i) / Σ(Credits_i)</code>. MUJ assigns letter grades and grade points per course; semesters with higher credit loads carry proportionately higher weight in your cumulative record.
        </p>
      </section>
    `;

    paintInputs();
    recalculate();
  };

  const paintInputs = () => {
    const hostA = wrap.querySelector("[data-role=sem-inputs-a]");
    const hostB = wrap.querySelector("[data-role=sem-inputs-b]");

    hostA.innerHTML = state.semestersA
      .map(
        (s, i) => `
          <div class="mujx-row" style="margin-bottom:6px; align-items:center;">
            <span style="font-size:12px; font-weight:600; width:52px;">${escapeHtml(s.label)}</span>
            <input class="mujx-input" data-sc="a" data-i="${i}" data-f="sgpa" type="number" step="0.01" min="0" max="10" placeholder="SGPA" value="${s.sgpa}" style="width:72px;">
            <input class="mujx-input" data-sc="a" data-i="${i}" data-f="credits" type="number" step="1" min="1" max="40" placeholder="Credits" value="${s.credits}" style="width:72px;">
            <span class="mujx-sub" style="font-size:11px;">credits</span>
          </div>
        `,
      )
      .join("");

    hostB.innerHTML = state.semestersB
      .map(
        (s, i) => `
          <div class="mujx-row" style="margin-bottom:6px; align-items:center;">
            <span style="font-size:12px; font-weight:600; width:52px;">${escapeHtml(s.label)}</span>
            <input class="mujx-input" data-sc="b" data-i="${i}" data-f="sgpa" type="number" step="0.01" min="0" max="10" placeholder="SGPA" value="${s.sgpa}" style="width:72px;">
            <input class="mujx-input" data-sc="b" data-i="${i}" data-f="credits" type="number" step="1" min="1" max="40" placeholder="Credits" value="${s.credits}" style="width:72px;">
            <span class="mujx-sub" style="font-size:11px;">credits</span>
          </div>
        `,
      )
      .join("");

    attachListeners();
  };

  const attachListeners = () => {
    wrap.querySelector("[data-k=currentCgpa]").addEventListener("input", (e) => {
      state.currentCgpa = Number(e.target.value) || 0;
      recalculate();
    });

    wrap.querySelector("[data-k=completedCredits]").addEventListener("input", (e) => {
      state.completedCredits = Number(e.target.value) || 0;
      recalculate();
    });

    wrap.querySelector("[data-role=sc-name-a]").addEventListener("input", (e) => {
      state.scenarioNameA = e.target.value || "Scenario A";
      recalculate();
    });

    wrap.querySelector("[data-role=sc-name-b]").addEventListener("input", (e) => {
      state.scenarioNameB = e.target.value || "Scenario B";
      recalculate();
    });

    wrap.querySelectorAll("[data-sc]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const scKey = e.target.dataset.sc === "a" ? "semestersA" : "semestersB";
        const idx = Number(e.target.dataset.i);
        const field = e.target.dataset.f;
        state[scKey][idx][field] = Number(e.target.value) || 0;
        recalculate();
      });
    });

    wrap.querySelector("[data-role=add-sem-btn]").addEventListener("click", () => {
      const nextNum = state.semestersA.length + 5; // e.g. Sem 5, 6, 7...
      state.semestersA.push({ label: `Sem ${nextNum}`, sgpa: 8.5, credits: 20 });
      state.semestersB.push({ label: `Sem ${nextNum}`, sgpa: 9.0, credits: 20 });
      paintInputs();
      recalculate();
    });

    wrap.querySelector("[data-role=remove-sem-btn]").addEventListener("click", () => {
      if (state.semestersA.length > 1) {
        state.semestersA.pop();
        state.semestersB.pop();
        paintInputs();
        recalculate();
      }
    });

    wrap.querySelector("[data-role=reset-btn]").addEventListener("click", () => {
      state.currentCgpa = seed?.currentCgpa ?? (seed?.currentSgpa ?? 8.0);
      state.completedCredits = seed?.completedCredits ?? 60;
      paint();
    });
  };

  const recalculate = () => {
    const baseInput = {
      currentCgpa: Number(state.currentCgpa),
      completedCredits: Number(state.completedCredits),
    };

    const resA = computeCgpa({
      ...baseInput,
      semesters: state.semestersA,
    });

    const resB = computeCgpa({
      ...baseInput,
      semesters: state.semestersB,
    });

    // Update final CGPA badges
    const cgpaAEl = wrap.querySelector("[data-role=final-cgpa-a]");
    const cgpaBEl = wrap.querySelector("[data-role=final-cgpa-b]");
    if (cgpaAEl) cgpaAEl.textContent = resA.ok && resA.finalCgpa !== null ? resA.finalCgpa.toFixed(2) : "—";
    if (cgpaBEl) cgpaBEl.textContent = resB.ok && resB.finalCgpa !== null ? resB.finalCgpa.toFixed(2) : "—";

    // Chart rendering
    const chartSlot = wrap.querySelector("[data-role=chart-slot]");
    if (chartSlot && resA.ok && resB.ok) {
      const pointsA = resA.projected.map((p) => ({ label: p.label, y: p.cgpa }));
      const pointsB = resB.projected.map((p) => ({ label: p.label, y: p.cgpa }));
      chartSlot.innerHTML = progressionChart(pointsA, {
        secondaryPoints: pointsB,
        primaryName: state.scenarioNameA,
        secondaryName: state.scenarioNameB,
      });
    }

    // Milestone Table
    const tableSlot = wrap.querySelector("[data-role=table-slot]");
    if (tableSlot && resA.ok && resB.ok) {
      const rows = resA.projected.map((pA, i) => {
        const pB = resB.projected[i] || { cgpa: null, sgpa: null };
        const delta = pA.cgpa !== null && pB.cgpa !== null ? (pB.cgpa - pA.cgpa).toFixed(2) : "—";
        return `
          <tr>
            <td><strong>${escapeHtml(pA.label)}</strong></td>
            <td>${pA.semesterCredits ? `${pA.semesterCredits} cr` : "Initial"}</td>
            <td>${pA.sgpa !== null ? pA.sgpa.toFixed(2) : "—"}</td>
            <td><strong style="color:#0d9488">${pA.cgpa !== null ? pA.cgpa.toFixed(2) : "—"}</strong></td>
            <td>${pB.sgpa !== null ? pB.sgpa.toFixed(2) : "—"}</td>
            <td><strong style="color:#6366f1">${pB.cgpa !== null ? pB.cgpa.toFixed(2) : "—"}</strong></td>
            <td><span class="mujx-chip ${Number(delta) >= 0 ? 'safe' : 'low'}" style="font-size:11px;">${Number(delta) >= 0 ? `+${delta}` : delta}</span></td>
          </tr>
        `;
      });

      tableSlot.innerHTML = `
        <table class="mujx-table">
          <thead>
            <tr>
              <th>Milestone</th>
              <th>Credits</th>
              <th>${escapeHtml(state.scenarioNameA)} SGPA</th>
              <th>${escapeHtml(state.scenarioNameA)} CGPA</th>
              <th>${escapeHtml(state.scenarioNameB)} SGPA</th>
              <th>${escapeHtml(state.scenarioNameB)} CGPA</th>
              <th>Difference</th>
            </tr>
          </thead>
          <tbody>
            ${rows.join("")}
          </tbody>
        </table>
      `;
    }
  };

  paint();
}
