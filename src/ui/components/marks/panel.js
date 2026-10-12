import {
  applyHypothetical,
  requiredScore,
  sumAssessments,
  weightedTotal,
} from "../../../calculations/marks.js";
import { computeSgpa, gradePointForLetter } from "../../../calculations/sgpa.js";
import { groupMarksBySubject } from "../../../data/marks-adapter.js";
import { escapeHtml } from "../../../shared/dom.js";
import { openPopover } from "../../popover.js";

const DEFAULT_GRADE_TARGETS = [
  { label: "Grade A+ (90%)", minPct: 90 },
  { label: "Grade A (80%)", minPct: 80 },
  { label: "Grade B (70%)", minPct: 70 },
  { label: "Grade C (60%)", minPct: 60 },
  { label: "Grade D (50%)", minPct: 50 },
  { label: "Pass Floor (40%)", minPct: 40 },
];

export function renderMarksPanel({ records, wrap, weights, creditsBySubject = {}, startExpanded = false }) {
  const groups = groupMarksBySubject(records);

  // Store editable state per group
  const groupState = groups.map((group) => ({
    credits: creditsBySubject[group.subject] || 3,
    targetMinPct: 70, // Default target Grade B
    eteMax: 40,
  }));

  wrap.innerHTML = `
    <div class="mujx-inline-bar" aria-label="Marks intelligence bar">
      <div class="mujx-inline-bar-left">
        <span class="mujx-kicker"><span class="mujx-kicker-dot"></span> MUJX Intel</span>
        <strong style="color:var(--mujx-accent);">Estimated SGPA: <span data-role="inline-sgpa-val">—</span></strong>
        <span class="mujx-sub" style="margin:0;">(${groups.length} subjects tracked)</span>
        <span class="mujx-chip safe" style="font-size:11px; padding:1px 7px;">Credit-Weighted</span>
      </div>
      <div class="mujx-inline-bar-right">
        <button class="mujx-btn secondary" type="button" data-role="toggle-marks-btn" style="padding:4px 9px; font-size:11.5px;">
          🔮 What-If Simulator <span data-role="marks-chevron">${startExpanded ? '▴' : '▾'}</span>
        </button>
      </div>
    </div>

    <section class="mujx-card" data-role="marks-container" aria-label="Marks and SGPA predictor" style="margin-top:0; margin-bottom:16px;" ${startExpanded ? '' : 'hidden'}>
      <div class="mujx-head">
        <div>
          <div class="mujx-kicker"><span class="mujx-kicker-dot"></span> Marks & SGPA Predictor</div>
          <h2 class="mujx-title" style="font-size:16px;">Course Assessment & SGPA Estimation</h2>
          <p class="mujx-sub">Official marks are preserved in the portal. Enter what-if scores below to simulate your final course grade and SGPA.</p>
        </div>
        <button class="mujx-btn secondary" type="button" data-role="reset-all" style="padding:5px 10px; font-size:12px;">↺ Reset</button>
      </div>

      <div class="mujx-sim-box" style="margin-bottom:12px;">
        <div style="font-size:12px; color:var(--mujx-muted); line-height:1.45;">
          <strong>Institutional Evaluation Scheme:</strong> Assumed weights MTE ${weights.mte} / CWS ${weights.cws} / ETE ${weights.ete} from the MUJ Examination Handbook 2023-24. Relative grading applies cohort-wide for classes &gt; 25 students; results are simulated estimates.
        </div>
      </div>

      <div data-role="groups-container"></div>

      <div class="mujx-card" style="background:var(--mujx-bg); margin-top:14px; border:1px solid var(--mujx-accent); padding:14px 16px;">
        <div class="mujx-head" style="margin-bottom:6px;">
          <div>
            <div class="mujx-kicker" style="color:var(--mujx-accent)">Semester Estimation</div>
            <h3 class="mujx-title" style="font-size:14px">Credit-Weighted Simulated SGPA</h3>
          </div>
          <div style="text-align:right">
            <span class="mujx-metric-label">Estimated SGPA</span>
            <b data-role="sgpa-val" style="font-size:22px; color:var(--mujx-accent); display:block;">—</b>
          </div>
        </div>
        <p class="mujx-sub" data-role="sgpa-details" style="font-size:11.5px; margin:0;"></p>
      </div>
    </section>
  `;

  const toggleBtn = wrap.querySelector("[data-role=toggle-marks-btn]");
  const chevron = wrap.querySelector("[data-role=marks-chevron]");
  const marksContainer = wrap.querySelector("[data-role=marks-container]");
  const container = wrap.querySelector("[data-role=groups-container]");
  const sgpaValEl = wrap.querySelector("[data-role=sgpa-val]");
  const inlineSgpaValEl = wrap.querySelector("[data-role=inline-sgpa-val]");
  const sgpaDetailsEl = wrap.querySelector("[data-role=sgpa-details]");

  toggleBtn?.addEventListener("click", () => {
    const isHidden = marksContainer.hasAttribute("hidden");
    if (isHidden) {
      marksContainer.removeAttribute("hidden");
      chevron.textContent = "▴";
    } else {
      marksContainer.setAttribute("hidden", "");
      chevron.textContent = "▾";
    }
  });

  const paintGroups = () => {
    container.innerHTML = groups
      .map((group, gi) => {
        const official = sumAssessments(group.items);
        const state = groupState[gi];

        return `
          <article class="mujx-card" style="margin: 10px 0; padding: 12px 14px; background:var(--mujx-surface);" data-gi="${gi}">
            <div class="mujx-head" style="margin-bottom:8px;">
              <div>
                <strong style="font-size:14px; color:var(--mujx-ink);">${escapeHtml(group.subject)}</strong>
                <div class="mujx-sub" style="font-size:11.5px;">Recorded: <strong>${official.obtained ?? "—"} / ${official.maximum ?? "—"}</strong> (${official.percent !== null ? `${official.percent}%` : "—"})</div>
              </div>
              <div class="mujx-row" style="align-items:center;">
                <label class="mujx-sub" style="font-size:11.5px;">Credits:
                  <input class="mujx-input" data-role="group-credits" data-gi="${gi}" type="number" min="1" max="10" step="0.5" value="${escapeHtml(state.credits)}" style="width:55px; padding:4px 6px;">
                </label>
                <button type="button" class="mujx-btn secondary" data-role="inspect-assumptions-btn" data-gi="${gi}" style="padding:4px 8px; font-size:11px;">🔍 Inspect Assumptions</button>
              </div>
            </div>

            <table class="mujx-table">
              <thead>
                <tr>
                  <th>Component</th>
                  <th>Official</th>
                  <th>Assumed Wt</th>
                  <th>What-If Obtained</th>
                </tr>
              </thead>
              <tbody>
                ${group.items
                  .map((item, ii) => {
                    const weight = item.weight ?? inferWeight(item.component, weights);
                    return `
                      <tr>
                        <td><strong>${escapeHtml(item.component)}</strong></td>
                        <td>${item.obtained !== null ? `${item.obtained} / ${item.maximum}` : "Not uploaded"}</td>
                        <td>${weight !== null ? `${weight}%` : "—"}</td>
                        <td>
                          <input class="mujx-input" data-role="what-if-score" data-gi="${gi}" data-ii="${ii}" type="number" min="0" max="${item.maximum || 100}" step="0.5" placeholder="${item.obtained !== null ? item.obtained : 'Enter'}" style="width:80px; padding:4px 7px;">
                        </td>
                      </tr>
                    `;
                  })
                  .join("")}
              </tbody>
            </table>

            <!-- Target Grade Planning for this subject -->
            <div class="mujx-sim" style="margin-top:8px; padding-top:8px;">
              <div class="mujx-row" style="justify-content:space-between; align-items:center;">
                <div class="mujx-row" style="align-items:center;">
                  <label class="mujx-sub" style="font-weight:600; font-size:12px;">Target Goal:
                    <select class="mujx-select" data-role="target-select" data-gi="${gi}" style="padding:4px 8px; font-size:12px;">
                      ${DEFAULT_GRADE_TARGETS.map(
                        (t) => `<option value="${t.minPct}" ${state.targetMinPct === t.minPct ? "selected" : ""}>${t.label}</option>`,
                      ).join("")}
                    </select>
                  </label>
                  <label class="mujx-sub" style="font-size:12px;">ETE Max:
                    <input class="mujx-input" data-role="ete-max" data-gi="${gi}" type="number" value="${state.eteMax}" style="width:50px; padding:4px 6px; font-size:12px;">
                  </label>
                </div>
                <div data-role="target-analysis-${gi}" style="font-size:12px;"></div>
              </div>
              <div data-role="course-summary-${gi}" class="mujx-note" style="margin-top:6px;"></div>
            </div>
          </article>
        `;
      })
      .join("");

    attachListeners();
    recalculateAll();
  };

  const attachListeners = () => {
    container.querySelectorAll("[data-role=what-if-score]").forEach((input) => {
      input.addEventListener("input", recalculateAll);
    });

    container.querySelectorAll("[data-role=group-credits]").forEach((input) => {
      input.addEventListener("change", (e) => {
        const gi = Number(e.target.dataset.gi);
        groupState[gi].credits = Math.max(1, Number(e.target.value) || 3);
        recalculateAll();
      });
    });

    container.querySelectorAll("[data-role=target-select]").forEach((sel) => {
      sel.addEventListener("change", (e) => {
        const gi = Number(e.target.dataset.gi);
        groupState[gi].targetMinPct = Number(e.target.value);
        recalculateAll();
      });
    });

    container.querySelectorAll("[data-role=ete-max]").forEach((input) => {
      input.addEventListener("change", (e) => {
        const gi = Number(e.target.dataset.gi);
        groupState[gi].eteMax = Math.max(1, Number(e.target.value) || 40);
        recalculateAll();
      });
    });

    container.querySelectorAll("[data-role=inspect-assumptions-btn]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const gi = Number(btn.dataset.gi);
        openAssumptionsPopover(btn, groups[gi], groupState[gi], weights);
      });
    });
  };

  const recalculateAll = () => {
    const courseEstimates = [];

    groups.forEach((group, gi) => {
      const state = groupState[gi];
      const overrides = group.items.map((item, ii) => {
        const val = container.querySelector(`[data-role=what-if-score][data-gi="${gi}"][data-ii="${ii}"]`)?.value;
        return { id: item.id, obtained: val === "" ? null : Number(val) };
      });

      const merged = applyHypothetical(group.items, overrides);
      const total = sumAssessments(merged);
      const weighted = weightedTotal(
        merged.map((item) => ({
          ...item,
          weight: item.weight ?? inferWeight(item.component, weights),
          maximum: item.maximum || inferWeight(item.component, weights),
        })),
      );

      const targetScoreVal = state.targetMinPct;
      const internalEarned = weighted.ok ? weighted.weighted : total.obtained || 0;
      const eteRemaining = state.eteMax;

      const reqAnalysis = requiredScore({
        obtained: internalEarned,
        remainingMax: eteRemaining,
        targetTotal: targetScoreVal,
      });

      const targetEl = container.querySelector(`[data-role="target-analysis-${gi}"]`);
      if (targetEl) {
        if (reqAnalysis.alreadyMet) {
          targetEl.innerHTML = `<button type="button" class="mujx-chip safe interactive" data-gi="${gi}" data-role="chip-inspect">✓ Target Secured (${internalEarned.toFixed(1)} pts)</button>`;
        } else if (reqAnalysis.impossible) {
          targetEl.innerHTML = `<button type="button" class="mujx-chip low interactive" data-gi="${gi}" data-role="chip-inspect">⚠️ Need ${reqAnalysis.required} / ${eteRemaining} in ETE</button>`;
        } else {
          targetEl.innerHTML = `<button type="button" class="mujx-chip borderline interactive" data-gi="${gi}" data-role="chip-inspect">Need <strong>${reqAnalysis.required}</strong> / ${eteRemaining} in ETE</button>`;
        }

        const chipBtn = targetEl.querySelector("[data-role=chip-inspect]");
        chipBtn?.addEventListener("click", (e) => {
          e.stopPropagation();
          openAssumptionsPopover(chipBtn, group, state, weights, reqAnalysis);
        });
      }

      const summaryEl = container.querySelector(`[data-role="course-summary-${gi}"]`);
      if (summaryEl) {
        const isSimulated = merged.some((m) => m.source === "simulated");
        summaryEl.innerHTML = `
          ${isSimulated ? '<span class="mujx-chip borderline" style="font-size:10px; padding:1px 6px;">SIMULATED</span> ' : '<span class="mujx-chip safe" style="font-size:10px; padding:1px 6px;">OFFICIAL</span> '}
          Obtained so far: <strong>${total.obtained ?? "—"} / ${total.maximum ?? "—"}</strong>
          ${weighted.ok ? `· Weighted: <strong>${weighted.weighted} / ${weighted.weightSum}</strong>` : ""}
        `;
      }

      const estimatedTotalPct = weighted.ok
        ? (weighted.weighted / weighted.weightSum) * 100
        : total.percent;

      if (estimatedTotalPct !== null) {
        const pts = Math.min(10, Math.max(0, Math.round(estimatedTotalPct / 10)));
        courseEstimates.push({
          subject: group.subject,
          credits: state.credits,
          gradePoints: pts,
        });
      }
    });

    const sgpaResult = computeSgpa(courseEstimates);
    if (sgpaResult.ok) {
      const formatted = sgpaResult.sgpa.toFixed(2);
      sgpaValEl.textContent = formatted;
      if (inlineSgpaValEl) inlineSgpaValEl.textContent = formatted;
      sgpaDetailsEl.textContent = `Based on ${sgpaResult.credits} credits across ${courseEstimates.length} courses using institutional credit-weighted GPA formula.`;
    } else {
      sgpaValEl.textContent = "—";
      if (inlineSgpaValEl) inlineSgpaValEl.textContent = "—";
      sgpaDetailsEl.textContent = "Enter assessment marks above to calculate simulated semester SGPA.";
    }
  };

  wrap.querySelector("[data-role=reset-all]")?.addEventListener("click", () => {
    paintGroups();
  });

  paintGroups();
}

function openAssumptionsPopover(anchorEl, group, state, weights, reqAnalysis = null) {
  const content = `
    <div>
      <div style="font-size:12px; margin-bottom:8px;">
        Course: <strong>${escapeHtml(group.subject)}</strong> (${state.credits} credits)<br>
        Target: <strong>${state.targetMinPct}%</strong> · ETE Max: <strong>${state.eteMax} marks</strong>
      </div>

      <div class="mujx-formula-box">
        <strong>Institutional Evaluation Scheme:</strong><br>
        MTE: ${weights.mte}% | CWS: ${weights.cws}% | ETE: ${weights.ete}%<br>
        <span style="font-size:10.5px; color:var(--mujx-muted);">Source: MUJ Examination Handbook 2023-24</span>
      </div>

      ${
        reqAnalysis
          ? `<div style="margin:8px 0; font-size:12px;">
              ${
                reqAnalysis.alreadyMet
                  ? '<span class="mujx-chip safe">✓ Target Secured</span> Already earned enough marks!'
                  : reqAnalysis.impossible
                  ? `<span class="mujx-chip low">⚠️ Mathematically Impossible</span> Need ${reqAnalysis.required} marks out of ${state.eteMax} in ETE.`
                  : `<span class="mujx-chip borderline">Target Achievable</span> Need <strong>${reqAnalysis.required}</strong> marks (${reqAnalysis.percentOfRemaining}%) in ETE.`
              }
            </div>`
          : ""
      }

      <div style="margin-top:10px; padding-top:8px; border-top:1px dashed var(--mujx-line);">
        <strong style="font-size:11.5px; text-transform:uppercase; color:var(--mujx-muted);">Target Grade Cutoff Assumptions:</strong>
        <div class="mujx-calc-step"><span>Grade A+ (10 pts):</span><span>90% overall</span></div>
        <div class="mujx-calc-step"><span>Grade A (9 pts):</span><span>80% overall</span></div>
        <div class="mujx-calc-step"><span>Grade B (8 pts):</span><span>70% overall</span></div>
        <div class="mujx-calc-step"><span>Grade C (7 pts):</span><span>60% overall</span></div>
        <div class="mujx-calc-step"><span>Pass Floor (5 pts):</span><span>40% overall (35% in ETE)</span></div>
      </div>

      <p class="mujx-note" style="margin-top:8px;">
        * Relative grading applies for classes &gt; 25 students. Actual letter grades depend on cohort mean & std dev.
      </p>
    </div>
  `;

  openPopover({
    anchorEl,
    title: "Marks & Grade Assumptions",
    badge: { text: "Estimates", type: "borderline" },
    contentHtml: content,
    width: 320,
  });
}

function inferWeight(component, weights) {
  const name = String(component || "").toLowerCase();
  if (name.includes("mid") || name.includes("mte")) return weights.mte;
  if (name.includes("cws") || name.includes("sessional") || name.includes("internal") || name.includes("assignment") || name.includes("quiz")) return weights.cws;
  if (name.includes("end") || name.includes("ete") || name.includes("term")) return weights.ete;
  return null;
}
