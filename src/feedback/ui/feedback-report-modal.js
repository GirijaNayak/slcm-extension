import { scrollToQuestion } from "../engine/form-validator.js";
import { escapeHtml } from "../../shared/dom.js";
import { INJECT_ATTR } from "../../shared/constants.js";

/**
 * Renders the Completion and Verification Report Modal
 */
export function openFeedbackReportModal({
  validationResult,
  submitButton = null,
  onClose = null,
} = {}) {
  closeExistingModal();

  const {
    total,
    answeredCount,
    unansweredCount,
    completionPercentage,
    unansweredList,
    isFullyAnswered,
    firstUnanswered,
  } = validationResult;

  const backdrop = document.createElement("div");
  backdrop.className = "mujx-modal-backdrop";
  backdrop.setAttribute(INJECT_ATTR, "feedback-report-modal");

  const statusColor = isFullyAnswered ? "#10b981" : "#f59e0b";
  const statusBadge = isFullyAnswered ? "✓ Ready for Review" : "⚠️ Incomplete";

  backdrop.innerHTML = `
    <div class="mujx-modal-card" role="dialog" aria-label="Feedback Completion Report" style="max-width:520px;">
      <div class="mujx-modal-head" style="border-bottom:1px solid #2d2d3f; padding:14px 20px; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">${isFullyAnswered ? "✅" : "📋"}</span>
          <div>
            <h3 style="margin:0; font-size:15px; font-weight:700; color:#fff;">Feedback Completion Report</h3>
            <span style="font-size:11px; opacity:0.75;">Live questionnaire verification status</span>
          </div>
        </div>
        <button type="button" data-role="close-btn" style="background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer; padding:4px 8px;">✕</button>
      </div>

      <div class="mujx-modal-body" style="padding:18px 20px; display:flex; flex-direction:column; gap:16px; max-height:65vh; overflow-y:auto;">
        
        <!-- Top Stats Card -->
        <div style="background:#121826; border:1px solid #2d2d3f; border-radius:10px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8;">Status</div>
            <div style="font-size:16px; font-weight:800; color:${statusColor}; margin-top:2px;">${statusBadge}</div>
          </div>
          <div style="display:flex; gap:18px; text-align:right;">
            <div>
              <div style="font-size:18px; font-weight:800; color:#fff;">${answeredCount} / ${total}</div>
              <div style="font-size:10.5px; opacity:0.7;">Answered</div>
            </div>
            <div>
              <div style="font-size:18px; font-weight:800; color:${unansweredCount === 0 ? "#10b981" : "#f43f5e"};">${unansweredCount}</div>
              <div style="font-size:10.5px; opacity:0.7;">Unanswered</div>
            </div>
            <div>
              <div style="font-size:18px; font-weight:800; color:var(--mujx-accent, #2dd4bf);">${completionPercentage}%</div>
              <div style="font-size:10.5px; opacity:0.7;">Completion</div>
            </div>
          </div>
        </div>

        ${
          isFullyAnswered
            ? `
          <!-- Fully Answered Advisory -->
          <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:12px 14px; font-size:12px; line-height:1.45; color:#a7f3d0;">
            <div style="font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:12.5px; color:#34d399;">
              <span>🎉</span>
              <span>All Mandatory Questions Have Been Populated</span>
            </div>
            <div>
              Every question section has been verified. In accordance with university integrity policies, <strong>MUJX does not auto-submit feedback</strong>. Please review your answers before submitting.
            </div>
          </div>
        `
            : `
          <!-- Incomplete Questions Warning -->
          <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:8px; padding:12px 14px; font-size:12px; line-height:1.45; color:#fde68a;">
            <div style="font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:12.5px; color:#fbbf24;">
              <span>⚠️</span>
              <span>${unansweredCount} Question(s) Still Require Your Attention</span>
            </div>
            <div>
              The questions below were not completed or require manual selection before the university portal will accept your submission.
            </div>
          </div>

          <!-- Unanswered Questions List -->
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size:12px; font-weight:700; color:#fff;">Unanswered Questions:</div>
            ${unansweredList
              .map(
                (q, idx) => `
              <div style="background:#121826; border:1px solid #2d2d3f; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div style="flex:1; min-width:0;">
                  <div style="font-size:10px; opacity:0.6; text-transform:uppercase;">${escapeHtml(q.sectionTitle || "Question")}</div>
                  <div style="font-size:12px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(q.questionText)}">
                    ${idx + 1}. ${escapeHtml(q.questionText)}
                  </div>
                  <div style="font-size:10.5px; color:#f87171; margin-top:2px;">${escapeHtml(q.reason || "Unanswered")}</div>
                </div>
                <button type="button" data-jump-idx="${idx}" style="padding:4px 8px; font-size:11px; font-weight:600; border-radius:4px; background:rgba(45,212,191,0.15); border:1px solid rgba(45,212,191,0.4); color:var(--mujx-accent, #2dd4bf); cursor:pointer; white-space:nowrap;">
                  Jump to ↗
                </button>
              </div>
            `
              )
              .join("")}
          </div>
        `
        }

      </div>

      <div class="mujx-modal-foot" style="padding:14px 20px; border-top:1px solid #2d2d3f; display:flex; justify-content:space-between; align-items:center; background:#121826;">
        ${
          !isFullyAnswered && firstUnanswered
            ? `
          <button type="button" id="mujx_jump_first_btn" style="padding:8px 14px; font-size:12px; font-weight:700; border-radius:6px; background:#f59e0b; border:none; color:#000; cursor:pointer;">
            ↗ Go to First Unanswered Question
          </button>
        `
            : `<div></div>`
        }

        <div style="display:flex; gap:8px;">
          <button type="button" data-role="close-btn" style="padding:8px 14px; font-size:12px; font-weight:600; border-radius:6px; background:#2d2d3f; border:none; color:#fff; cursor:pointer;">Close</button>
          
          ${
            isFullyAnswered && submitButton
              ? `
            <button type="button" id="mujx_scroll_submit_btn" style="padding:8px 16px; font-size:12px; font-weight:700; border-radius:6px; background:var(--mujx-accent, #0d9488); border:none; color:#fff; cursor:pointer; box-shadow:0 2px 6px rgba(13,148,136,0.3);">
              Scroll to Submit Button ⬇
            </button>
          `
              : ""
          }
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Close handlers
  backdrop.querySelectorAll('[data-role="close-btn"]').forEach((btn) => {
    btn.addEventListener("click", () => {
      closeExistingModal();
      if (onClose) onClose();
    });
  });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) {
      closeExistingModal();
      if (onClose) onClose();
    }
  });

  // Jump to first unanswered
  backdrop.querySelector("#mujx_jump_first_btn")?.addEventListener("click", () => {
    closeExistingModal();
    if (firstUnanswered) {
      scrollToQuestion(firstUnanswered);
    }
  });

  // Jump to specific unanswered question
  backdrop.querySelectorAll("[data-jump-idx]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const idx = parseInt(btn.dataset.jumpIdx, 10);
      const q = unansweredList[idx];
      if (q) {
        closeExistingModal();
        scrollToQuestion(q);
      }
    });
  });

  // Scroll to submit button
  backdrop.querySelector("#mujx_scroll_submit_btn")?.addEventListener("click", () => {
    closeExistingModal();
    if (submitButton) {
      submitButton.scrollIntoView({ behavior: "smooth", block: "center" });
      submitButton.classList.add("mujx-highlight-unanswered");
      setTimeout(() => {
        submitButton.classList.remove("mujx-highlight-unanswered");
      }, 2500);
      try {
        submitButton.focus({ preventScroll: true });
      } catch (_) {}
    }
  });
}

function closeExistingModal() {
  document.querySelectorAll(`[${INJECT_ATTR}="feedback-report-modal"]`).forEach((el) => el.remove());
}
