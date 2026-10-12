import { planTargetCgpa } from "../../../calculations/target-cgpa.js";
import { escapeHtml } from "../../../shared/dom.js";

export function renderTargetPlanner({ wrap, seed, gradeCap = 10 }) {
  const state = {
    currentCgpa: seed?.currentCgpa ?? (seed?.currentSgpa ?? 8.0),
    completedCredits: seed?.completedCredits ?? 60,
    targetCgpa: 8.5,
    remainingSemesters: [
      { label: "Semester 5", credits: 22 },
      { label: "Semester 6", credits: 22 },
      { label: "Semester 7", credits: 20 },
      { label: "Semester 8", credits: 16 },
    ],
  };

  const paint = () => {
    wrap.innerHTML = `
      <section class="mujx-card" aria-label="Target CGPA planner">
        <div class="mujx-head">
          <div>
            <div class="mujx-kicker"><span class="mujx-kicker-dot"></span> Feature D</div>
            <h2 class="mujx-title">Target CGPA Planner</h2>
            <p class="mujx-sub">Find the exact semester SGPA required to reach your target graduation CGPA.</p>
          </div>
          <button class="mujx-btn secondary" type="button" data-role="reset-btn">↺ Reset</button>
        </div>

        <div class="mujx-row" style="margin-bottom:14px; align-items:flex-end;">
          <label class="mujx-sub"><strong>Current CGPA</strong>
            <input class="mujx-input" data-k="currentCgpa" type="number" step="0.01" min="0" max="10" value="${escapeHtml(state.currentCgpa)}" style="width:105px; font-weight:700;">
          </label>
          <label class="mujx-sub"><strong>Completed Credits</strong>
            <input class="mujx-input" data-k="completedCredits" type="number" step="1" min="0" value="${escapeHtml(state.completedCredits)}" style="width:105px; font-weight:700;">
          </label>
          <label class="mujx-sub"><strong>Target CGPA</strong>
            <input class="mujx-input" data-k="targetCgpa" type="number" step="0.01" min="0" max="10" value="${escapeHtml(state.targetCgpa)}" style="width:105px; font-weight:700; color:var(--mujx-accent);">
          </label>
          <div class="mujx-row" style="gap:4px; margin-bottom:2px;">
            <button class="mujx-btn secondary" data-preset="8.0" type="button" style="padding:5px 9px; font-size:11px;">8.0</button>
            <button class="mujx-btn secondary" data-preset="8.5" type="button" style="padding:5px 9px; font-size:11px;">8.5</button>
            <button class="mujx-btn secondary" data-preset="9.0" type="button" style="padding:5px 9px; font-size:11px;">9.0</button>
            <button class="mujx-btn secondary" data-preset="9.5" type="button" style="padding:5px 9px; font-size:11px;">9.5</button>
          </div>
        </div>

        <!-- Remaining Semesters Config -->
        <div class="mujx-sim-box" style="margin-bottom:16px;">
          <div class="mujx-head" style="margin-bottom:8px;">
            <div>
              <strong style="font-size:13px;">Remaining Semesters & Credit Load</strong>
              <div class="mujx-sub">Specify credits for each future semester to calculate credit-weighted requirements.</div>
            </div>
            <div>
              <button class="mujx-btn secondary" data-role="add-sem" type="button" style="padding:4px 8px; font-size:11px;">+ Add</button>
              <button class="mujx-btn secondary" data-role="remove-sem" type="button" style="padding:4px 8px; font-size:11px;">- Remove</button>
            </div>
          </div>
          <div class="mujx-row" data-role="sem-list" style="gap:8px;"></div>
        </div>

        <!-- Resulting Feasibility & Metric Output -->
        <div data-role="plan-output"></div>

        <p class="mujx-note" style="margin-top:12px;">
          * Mathematical Identity: <code>Required SGPA = [Target CGPA × (Completed + Remaining) − Current CGPA × Completed] / Remaining</code>. Grade cap is ${gradeCap}.0.
        </p>
      </section>
    `;

    paintSemList();
    recalculate();
  };

  const paintSemList = () => {
    const listEl = wrap.querySelector("[data-role=sem-list]");
    listEl.innerHTML = state.remainingSemesters
      .map(
        (sem, i) => `
          <label class="mujx-sub" style="background:var(--mujx-surface); border:1px solid var(--mujx-line); border-radius:var(--mujx-radius-sm); padding:6px 10px; display:inline-flex; flex-direction:column; gap:2px;">
            <strong>${escapeHtml(sem.label)}</strong>
            <div style="display:flex; align-items:center; gap:4px;">
              <input class="mujx-input" data-sem-idx="${i}" type="number" min="1" max="40" value="${sem.credits}" style="width:60px; padding:3px 6px; font-size:12px;">
              <span style="font-size:11px;">cr</span>
            </div>
          </label>
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

    wrap.querySelector("[data-k=targetCgpa]").addEventListener("input", (e) => {
      state.targetCgpa = Number(e.target.value) || 0;
      recalculate();
    });

    wrap.querySelectorAll("[data-preset]").forEach((btn) => {
      btn.addEventListener("click", () => {
        state.targetCgpa = Number(btn.dataset.preset);
        wrap.querySelector("[data-k=targetCgpa]").value = state.targetCgpa;
        recalculate();
      });
    });

    wrap.querySelectorAll("[data-sem-idx]").forEach((input) => {
      input.addEventListener("input", (e) => {
        const idx = Number(e.target.dataset.semIdx);
        state.remainingSemesters[idx].credits = Number(e.target.value) || 0;
        recalculate();
      });
    });

    wrap.querySelector("[data-role=add-sem]").addEventListener("click", () => {
      const nextNum = state.remainingSemesters.length + 5;
      state.remainingSemesters.push({ label: `Semester ${nextNum}`, credits: 20 });
      paintSemList();
      recalculate();
    });

    wrap.querySelector("[data-role=remove-sem]").addEventListener("click", () => {
      if (state.remainingSemesters.length > 1) {
        state.remainingSemesters.pop();
        paintSemList();
        recalculate();
      }
    });

    wrap.querySelector("[data-role=reset-btn]").addEventListener("click", () => {
      state.currentCgpa = seed?.currentCgpa ?? (seed?.currentSgpa ?? 8.0);
      state.completedCredits = seed?.completedCredits ?? 60;
      state.targetCgpa = 8.5;
      paint();
    });
  };

  const recalculate = () => {
    const totalRemainingCredits = state.remainingSemesters.reduce((sum, s) => sum + (Number(s.credits) || 0), 0);

    const plan = planTargetCgpa({
      currentCgpa: Number(state.currentCgpa),
      completedCredits: Number(state.completedCredits),
      targetCgpa: Number(state.targetCgpa),
      remainingCredits: totalRemainingCredits,
      remainingSemesters: state.remainingSemesters,
      gradeCap,
    });

    const outEl = wrap.querySelector("[data-role=plan-output]");

    if (!plan.ok) {
      outEl.innerHTML = `<div class="mujx-error">Unable to compute plan: ${(plan.issues || []).join(", ")}</div>`;
      return;
    }

    let statusChip = "";
    let statusClass = "safe";
    let statusText = "Feasible";

    if (plan.reason === "already_met" || plan.reason === "already_above_target") {
      statusClass = "safe";
      statusText = "Target Already Achieved";
      statusChip = `<span class="mujx-chip safe">✓ Target Achieved</span>`;
    } else if (plan.reason === "impossible_above_cap") {
      statusClass = "low";
      statusText = `Impossible (> ${gradeCap}.0 cap)`;
      statusChip = `<span class="mujx-chip low">✕ Mathematically Impossible</span>`;
    } else if (plan.requiredAverageSgpa > 9.0) {
      statusClass = "borderline";
      statusText = "High Effort Required (SGPA > 9.0)";
      statusChip = `<span class="mujx-chip borderline">⚠️ High Effort Required</span>`;
    } else {
      statusClass = "safe";
      statusText = "Feasible Target";
      statusChip = `<span class="mujx-chip safe">✓ Highly Feasible</span>`;
    }

    outEl.innerHTML = `
      <div class="mujx-card" style="margin:0; background:var(--mujx-bg); border-left: 4px solid var(--mujx-${statusClass === 'safe' ? 'ok' : statusClass === 'borderline' ? 'warn' : 'bad'});">
        <div class="mujx-head" style="margin-bottom:6px;">
          <div>
            <div style="margin-bottom:4px;">${statusChip}</div>
            <strong style="font-size:15px; color:var(--mujx-ink);">${statusText}</strong>
          </div>
          <div style="text-align:right;">
            <span class="mujx-metric-label">Required Avg SGPA</span>
            <b style="font-size:24px; color:var(--mujx-${statusClass === 'safe' ? 'ok' : statusClass === 'borderline' ? 'warn' : 'bad'});">
              ${plan.requiredAverageSgpa !== null ? plan.requiredAverageSgpa.toFixed(2) : "—"}
            </b>
          </div>
        </div>

        <div class="mujx-grid" style="margin: 10px 0;">
          <div class="mujx-metric">
            <span class="mujx-metric-label">Target CGPA</span>
            <b style="color:var(--mujx-accent);">${Number(state.targetCgpa).toFixed(2)}</b>
          </div>
          <div class="mujx-metric">
            <span class="mujx-metric-label">Max Achievable CGPA</span>
            <b>${plan.maxCgpa.toFixed(2)}</b>
            <span class="mujx-sub" style="font-size:10.5px;">Assuming ${gradeCap}.0 in all remaining</span>
          </div>
          <div class="mujx-metric">
            <span class="mujx-metric-label">Remaining Work</span>
            <b>${totalRemainingCredits} cr</b>
            <span class="mujx-sub" style="font-size:10.5px;">Across ${state.remainingSemesters.length} semesters</span>
          </div>
        </div>

        <div style="font-size:12.5px; color:var(--mujx-ink); margin-top:8px;">
          ${escapeHtml(plan.explanation)}
        </div>

        <!-- Semester Target Allocation -->
        ${
          plan.bySemester?.length
            ? `<div style="margin-top:14px;">
                <strong style="font-size:13px;">Semester-by-Semester Recommended Target:</strong>
                <div class="mujx-row" style="margin-top:8px; gap:8px;">
                  ${plan.bySemester
                    .map(
                      (sem) => `
                      <div class="mujx-metric" style="flex:1; min-width:120px; background:var(--mujx-surface);">
                        <span class="mujx-metric-label">${escapeHtml(sem.label)} (${sem.credits} cr)</span>
                        <b style="color:var(--mujx-accent); font-size:17px;">SGPA ${sem.requiredSgpa}</b>
                      </div>
                    `,
                    )
                    .join("")}
                </div>
              </div>`
            : ""
        }
      </div>
    `;
  };

  paint();
}
