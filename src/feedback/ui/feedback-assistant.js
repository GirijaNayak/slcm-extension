import { fillEntireForm, resetCurrentForm } from "../engine/form-filler.js";
import { validateQuestionnaire, scrollToQuestion } from "../engine/form-validator.js";
import {
  loadFeedbackPreferences,
  loadFeedbackDraft,
  saveFeedbackDraft,
  updateCourseStatus,
} from "../storage/feedback-storage.js";
import { openFeedbackPreferencesModal } from "./feedback-preferences-modal.js";
import { openFeedbackReportModal } from "./feedback-report-modal.js";
import { escapeHtml } from "../../shared/dom.js";
import { INJECT_ATTR } from "../../shared/constants.js";

/**
 * Mounts the Floating Feedback Assistant on an active questionnaire page.
 */
export async function mountFeedbackAssistant({
  doc = document,
  metadata = {},
  questions = [],
  submitButton = null,
} = {}) {
  // Remove existing instance if any
  document.querySelectorAll(`[${INJECT_ATTR}="feedback-assistant"]`).forEach((el) => el.remove());

  const { courseName, courseCode, facultyName, academicSession, courseKey } = metadata;
  let preferences = await loadFeedbackPreferences();
  let isMinimized = false;
  let isFilling = false;
  let lastFillSummary = null;

  // Initial validation
  let validation = validateQuestionnaire(questions);

  // Check if saved draft exists
  const savedDraft = await loadFeedbackDraft(courseKey, academicSession);

  const container = document.createElement("div");
  container.className = "mujx-feedback-assistant";
  container.setAttribute(INJECT_ATTR, "feedback-assistant");
  container.style.position = "fixed";
  container.style.right = "20px";
  container.style.bottom = "20px";
  container.style.zIndex = "2147483640";
  container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";

  document.body.appendChild(container);

  function render() {
    validation = validateQuestionnaire(questions);
    const {
      total,
      answeredCount,
      unansweredCount,
      failedCount,
      completionPercentage,
      isFullyAnswered,
    } = validation;

    if (isMinimized) {
      container.innerHTML = `
        <button type="button" data-role="expand-btn" class="mujx-feedback-min-pill" style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; border-radius:9999px; background:linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color:#fff; font-size:12.5px; font-weight:700; border:none; box-shadow:0 10px 25px -4px rgba(13,148,136,0.5); cursor:pointer; user-select:none;">
          <span>⚡</span>
          <span>Feedback Assistant (${answeredCount}/${total} - ${completionPercentage}%)</span>
        </button>
      `;
      container.querySelector('[data-role="expand-btn"]').addEventListener("click", () => {
        isMinimized = false;
        render();
      });
      return;
    }

    container.innerHTML = `
      <div class="mujx-feedback-card" style="width:390px; max-width:calc(100vw - 32px); background:#1e1e2d; border:1px solid #2d2d3f; border-radius:14px; box-shadow:0 20px 30px -10px rgba(0,0,0,0.5), 0 8px 12px -4px rgba(0,0,0,0.3); overflow:hidden; color:#f1f5f9; display:flex; flex-direction:column; animation:mujx-slide-up 0.2s ease;">
        
        <!-- Header -->
        <div style="padding:12px 16px; background:#121826; border-bottom:1px solid #2d2d3f; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:22px; height:22px; border-radius:5px; background:linear-gradient(135deg, #0d9488, #2dd4bf); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; color:#fff;">
              MX
            </div>
            <div>
              <div style="font-size:13px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                <span>Feedback Assistant</span>
                <span style="font-size:9.5px; padding:1px 5px; border-radius:4px; background:${isFullyAnswered ? "rgba(16,185,129,0.2)" : "rgba(45,212,191,0.2)"}; color:${isFullyAnswered ? "#34d399" : "#2dd4bf"}; font-weight:700;">
                  ${isFullyAnswered ? "VERIFIED 100%" : "READY"}
                </span>
              </div>
            </div>
          </div>
          <button type="button" data-role="minimize-btn" title="Minimize panel" style="background:none; border:none; color:#94a3b8; font-size:15px; cursor:pointer; padding:2px 6px;">—</button>
        </div>

        <!-- Course Metadata Strip -->
        <div style="padding:10px 16px; background:rgba(255,255,255,0.02); border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
          <div style="min-width:0; flex:1;">
            <div style="font-size:12.5px; font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(courseName)}">
              ${escapeHtml(courseName)}
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(facultyName)}">
              ${escapeHtml(facultyName)}
            </div>
          </div>
          <span style="font-size:10px; font-weight:700; background:#2d2d3f; color:#94a3b8; padding:2px 6px; border-radius:4px; margin-left:8px; white-space:nowrap;">
            ${escapeHtml(courseCode)}
          </span>
        </div>

        <!-- Progress Bar & Stats -->
        <div style="padding:12px 16px 10px 16px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; font-size:11.5px;">
            <span style="color:#94a3b8;">Questionnaire Progress</span>
            <span style="font-weight:700; color:${isFullyAnswered ? "#34d399" : "#f1f5f9"}; font-variant-numeric:tabular-nums;">
              ${answeredCount} / ${total} (${completionPercentage}%)
            </span>
          </div>

          <!-- Progress Bar Track -->
          <div style="height:6px; background:#121826; border-radius:9999px; overflow:hidden; border:1px solid rgba(255,255,255,0.06);">
            <div style="height:100%; width:${completionPercentage}%; background:${isFullyAnswered ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #0d9488, #2dd4bf)"}; border-radius:9999px; transition:width 0.25s ease;"></div>
          </div>

          ${
            savedDraft && answeredCount === 0
              ? `
            <div style="background:rgba(45,212,191,0.08); border:1px dashed rgba(45,212,191,0.3); border-radius:6px; padding:6px 10px; font-size:11px; display:flex; justify-content:space-between; align-items:center;">
              <span style="color:#99f6e4;">Saved draft found for this course.</span>
              <button type="button" id="mujx_restore_draft_btn" style="background:none; border:none; color:var(--mujx-accent, #2dd4bf); font-weight:700; cursor:pointer; text-decoration:underline;">Restore</button>
            </div>
          `
              : ""
          }
        </div>

        <!-- Post-Fill Detailed Summary Block -->
        ${
          lastFillSummary
            ? `
          <div style="margin:0 16px 10px 16px; padding:10px 12px; background:rgba(0,0,0,0.3); border:1px solid ${lastFillSummary.isFullyAnswered ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}; border-radius:8px;">
            <div style="font-size:12px; font-weight:700; color:${lastFillSummary.isFullyAnswered ? "#34d399" : "#fbbf24"}; display:flex; align-items:center; justify-content:space-between;">
              <span>Feedback Filling Complete</span>
              <span style="font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:${lastFillSummary.isFullyAnswered ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}; color:${lastFillSummary.isFullyAnswered ? "#34d399" : "#fbbf24"};">
                ${lastFillSummary.isFullyAnswered ? "ALL VERIFIED" : "ATTENTION"}
              </span>
            </div>

            <div style="margin-top:8px; font-size:11px; display:grid; grid-template-columns:1fr 1fr; gap:4px 10px; color:#cbd5e1;">
              <div>Total Questions: <strong style="color:#fff;">${lastFillSummary.total}</strong></div>
              <div>Successfully Answered: <strong style="color:#34d399;">${lastFillSummary.successfullyAnswered}</strong></div>
              <div>Unanswered: <strong style="color:${lastFillSummary.unanswered > 0 ? "#f87171" : "#94a3b8"};">${lastFillSummary.unanswered}</strong></div>
              <div>Failed: <strong style="color:${lastFillSummary.failed > 0 ? "#ef4444" : "#94a3b8"};">${lastFillSummary.failed}</strong></div>
            </div>

            <div style="margin-top:8px; font-size:11px; font-weight:600; color:${lastFillSummary.isFullyAnswered ? "#34d399" : "#fbbf24"};">
              Status: ${lastFillSummary.isFullyAnswered ? "Ready for Review." : "Some questions require manual attention."}
            </div>

            ${
              (!lastFillSummary.isFullyAnswered || lastFillSummary.failed > 0 || lastFillSummary.unanswered > 0) && validation.firstUnanswered
                ? `
              <button type="button" id="mujx_goto_first_unanswered_btn" style="margin-top:8px; width:100%; padding:6px 10px; font-size:11px; font-weight:700; background:#dc2626; color:#fff; border:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                <span>🎯 Navigate to First Incomplete Question</span>
              </button>
            `
                : ""
            }
          </div>
        `
            : ""
        }

        <!-- Main One-Click Action -->
        <div style="padding:0 16px 12px 16px;">
          <button type="button" id="mujx_fill_all_btn" ${isFilling ? "disabled" : ""} style="width:100%; padding:10px 14px; font-size:13px; font-weight:700; border-radius:8px; border:none; background:linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color:#fff; cursor:${isFilling ? "wait" : "pointer"}; box-shadow:0 4px 12px rgba(13,148,136,0.35); display:flex; align-items:center; justify-content:center; gap:8px; transition:transform 0.1s ease;">
            <span>${isFilling ? "⏳" : "⚡"}</span>
            <span>${isFilling ? "Filling Questionnaire..." : "Fill Entire Form (One-Click)"}</span>
          </button>
        </div>

        <!-- Secondary Action Buttons -->
        <div style="padding:0 16px 14px 16px; display:flex; gap:6px; justify-content:space-between;">
          <button type="button" id="mujx_open_prefs_btn" title="Edit answer preferences" style="flex:1; padding:6px 8px; font-size:11px; font-weight:600; background:#121826; border:1px solid #2d2d3f; border-radius:6px; color:#e2e8f0; cursor:pointer; text-align:center;">
            ⚙️ Prefs
          </button>
          <button type="button" id="mujx_reset_form_btn" title="Reset all answers" style="flex:1; padding:6px 8px; font-size:11px; font-weight:600; background:#121826; border:1px solid #2d2d3f; border-radius:6px; color:#e2e8f0; cursor:pointer; text-align:center;">
            🔄 Reset
          </button>
          <button type="button" id="mujx_open_report_btn" title="Check completion report" style="flex:1; padding:6px 8px; font-size:11px; font-weight:600; background:#121826; border:1px solid #2d2d3f; border-radius:6px; color:#e2e8f0; cursor:pointer; text-align:center;">
            📋 Report
          </button>
          ${
            submitButton
              ? `
            <button type="button" id="mujx_jump_submit_btn" title="Scroll down to submit button" style="flex:1; padding:6px 8px; font-size:11px; font-weight:600; background:#121826; border:1px solid #2d2d3f; border-radius:6px; color:#2dd4bf; cursor:pointer; text-align:center;">
              📤 Submit
            </button>
          `
              : ""
          }
        </div>

        <!-- Footer Advisory -->
        <div style="padding:8px 16px; background:#121826; border-top:1px solid #2d2d3f; font-size:10px; color:#94a3b8; display:flex; justify-content:space-between; align-items:center;">
          <span>Student review required before manual submit</span>
          <span style="color:#2dd4bf; font-weight:600;">MUJX</span>
        </div>

      </div>
    `;

    // Attach event listeners
    attachListeners();
  }

  function attachListeners() {
    container.querySelector('[data-role="minimize-btn"]')?.addEventListener("click", () => {
      isMinimized = true;
      render();
    });

    // Fill Entire Form Button
    container.querySelector("#mujx_fill_all_btn")?.addEventListener("click", async () => {
      if (isFilling) return;
      isFilling = true;
      render();

      preferences = await loadFeedbackPreferences();
      const fillResult = await fillEntireForm({
        questions,
        preferences,
      });

      validation = validateQuestionnaire(questions);
      lastFillSummary = {
        total: validation.total,
        successfullyAnswered: validation.answeredCount,
        unanswered: validation.unansweredCount,
        failed: fillResult.failed,
        isFullyAnswered: validation.isFullyAnswered,
      };

      // Save draft of filled answers
      saveCurrentAnswersAsDraft();

      isFilling = false;
      render();

      // Open report modal for immediate review if there are any failures or user wants full audit
      if (!validation.isFullyAnswered || fillResult.failed > 0) {
        openFeedbackReportModal({ validationResult: validation, submitButton });
      }
    });

    // Navigate to first incomplete question
    container.querySelector("#mujx_goto_first_unanswered_btn")?.addEventListener("click", () => {
      validation = validateQuestionnaire(questions);
      if (validation.firstUnanswered) {
        scrollToQuestion(validation.firstUnanswered);
      }
    });

    // Open Preferences Modal
    container.querySelector("#mujx_open_prefs_btn")?.addEventListener("click", () => {
      openFeedbackPreferencesModal({
        onSaved: async (updated) => {
          if (updated) preferences = updated;
          render();
        },
      });
    });

    // Reset Current Form
    container.querySelector("#mujx_reset_form_btn")?.addEventListener("click", () => {
      if (confirm("Clear all answers on this feedback questionnaire?")) {
        resetCurrentForm(questions);
        lastFillSummary = null;
        render();
      }
    });

    // Open Report Modal
    container.querySelector("#mujx_open_report_btn")?.addEventListener("click", () => {
      validation = validateQuestionnaire(questions);
      openFeedbackReportModal({ validationResult: validation, submitButton });
    });

    // Scroll to Submit Button
    container.querySelector("#mujx_jump_submit_btn")?.addEventListener("click", () => {
      if (submitButton) {
        submitButton.scrollIntoView({ behavior: "smooth", block: "center" });
        submitButton.classList.add("mujx-highlight-unanswered");
        setTimeout(() => {
          submitButton.classList.remove("mujx-highlight-unanswered");
        }, 2500);
      }
    });

    // Restore Draft
    container.querySelector("#mujx_restore_draft_btn")?.addEventListener("click", () => {
      if (savedDraft?.answers) {
        restoreDraftAnswers(savedDraft.answers);
        render();
      }
    });
  }

  function saveCurrentAnswersAsDraft() {
    const answersMap = {};
    questions.forEach((q) => {
      if (q.isAnswered && q.currentValue !== null) {
        answersMap[q.id] = q.currentValue;
      }
    });
    saveFeedbackDraft(courseKey, academicSession, answersMap);
  }

  function restoreDraftAnswers(answersMap) {
    questions.forEach((q) => {
      const savedVal = answersMap[q.id];
      if (savedVal !== undefined) {
        if (q.type === "yes_no") {
          const isYes = String(savedVal).toUpperCase() === "YES";
          const el = isYes ? q.controls.yesElement : q.controls.noElement;
          const radio = isYes ? q.controls.yesRadio : q.controls.noRadio;
          if (radio) {
            radio.checked = true;
          }
          if (el) {
            try {
              el.click();
            } catch (_) {}
            el.classList?.add("active", "selected");
          }
        } else if (q.type === "dropdown") {
          const select = q.controls.selectElement;
          if (select) {
            select.value = savedVal;
            select.dispatchEvent(new Event("change", { bubbles: true }));
          }
        } else if (q.type === "comment") {
          const ta = q.controls.textareaElement;
          if (ta) {
            ta.value = savedVal;
            ta.dispatchEvent(new Event("input", { bubbles: true }));
          }
        }
        q.isAnswered = true;
        q.currentValue = savedVal;
      }
    });
  }

  // Monitor live questionnaire changes to update progress and auto-save draft
  const observer = new MutationObserver(() => {
    if (!isFilling) {
      const v = validateQuestionnaire(questions);
      if (v.answeredCount !== validation.answeredCount || v.total !== validation.total) {
        saveCurrentAnswersAsDraft();
        render();
      }
    }
  });

  try {
    observer.observe(doc.body || doc, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["class", "checked", "aria-pressed", "aria-checked"],
    });
  } catch (_) {
    try {
      observer.observe(doc, { childList: true, subtree: true });
    } catch (_) {}
  }

  doc.addEventListener("change", (e) => {
    if (e.target.closest?.(`[${INJECT_ATTR}]`)) return;
    if (e.target.matches?.("input[type=radio], select, textarea")) {
      saveCurrentAnswersAsDraft();
      render();
    }
  });

  // Watch for submission on university submit button
  if (submitButton) {
    submitButton.addEventListener("click", () => {
      updateCourseStatus(courseKey, "Completed");
    });
  }

  // Initial render
  render();

  return () => {
    observer.disconnect();
    container.remove();
  };
}
