import { calculateRequiredEte } from "../../../calculations/ete-required.js";
import { escapeHtml } from "../../../shared/dom.js";
import { INJECT_ATTR } from "../../../shared/constants.js";

let activePopover = null;

/**
 * Opens a compact anchored popover showing the ETE Target Calculator for a theory course.
 *
 * Answers: "How many marks do I need in ETE to achieve grade X in this theory subject?"
 *
 * @param {Object} options
 * @param {HTMLElement} options.anchorEl - The button triggering the popover
 * @param {Object} options.course - Course record with mte, cws, courseName, courseCode
 * @param {string} [options.defaultTarget] - Default target grade (e.g. "A")
 */
export function openEteTargetPopover({ anchorEl, course, defaultTarget = "A" }) {
  closeActiveEtePopover();

  let currentTarget = defaultTarget;
  let customCwsEstimate = null;

  const popover = document.createElement("div");
  popover.className = "mujx-ete-popover";
  popover.setAttribute(INJECT_ATTR, "ete-popover");
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", "End Term Exam Target Calculator");

  document.body.appendChild(popover);
  activePopover = popover;

  function render() {
    const calc = calculateRequiredEte({
      targetGrade: currentTarget,
      mte: course.mte,
      cws: course.cws,
      cwsEstimate: customCwsEstimate,
      eteMax: 40,
      courseType: course.courseType || "theory",
    });

    const statusBadgeClass =
      calc.feasibility === "achievable"
        ? "safe"
        : calc.feasibility === "already_secured"
        ? "safe"
        : calc.feasibility === "impossible"
        ? "danger"
        : "warning";

    const statusLabel =
      calc.feasibility === "achievable"
        ? "✓ Achievable"
        : calc.feasibility === "already_secured"
        ? "★ Target Secured"
        : calc.feasibility === "impossible"
        ? "✕ Exceeds ETE Max"
        : calc.feasibility === "cws_pending"
        ? "ℹ CWS Pending"
        : "Unresolved";


    popover.innerHTML = `
      <div class="mujx-popover-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; border-bottom:1px solid rgba(125,125,125,0.25); padding-bottom:8px;">
        <div>
          <div style="font-size:10px; text-transform:uppercase; font-weight:700; color:var(--mujx-accent, #2dd4bf); letter-spacing:0.04em;">
            ETE Target Calculator
          </div>
          <div style="font-weight:700; font-size:13px; color:#ffffff; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(course.courseName)}">
            ${escapeHtml(course.courseName)}
          </div>
        </div>
        <button type="button" data-role="close-popover" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; padding:2px 6px;">✕</button>
      </div>

      <!-- Target Grade Selection Buttons -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11px; opacity:0.8; margin-bottom:5px; font-weight:600;">Select Target Grade:</div>
        <div style="display:flex; gap:5px; flex-wrap:wrap;">
          ${["A+", "A", "B", "C", "D", "E"]
            .map(
              (g) => `
                <button type="button" class="mujx-target-chip ${g === currentTarget ? "active" : ""}" data-grade="${g}" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer; border:1px solid ${g === currentTarget ? "var(--mujx-accent, #2dd4bf)" : "rgba(125,125,125,0.3)"}; background:${g === currentTarget ? "rgba(45,212,191,0.22)" : "rgba(255,255,255,0.06)"}; color:${g === currentTarget ? "var(--mujx-accent, #2dd4bf)" : "#e2e8f0"};">
                  ${g}
                </button>
              `,
            )
            .join("")}
        </div>
      </div>

      <!-- Internal Marks Breakdown -->
      <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(125,125,125,0.2); border-radius:6px; padding:8px 10px; margin-bottom:10px; font-size:11.5px; display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; justify-content:space-between;">
          <span style="opacity:0.75;">Mid Term (MTE):</span>
          <strong>${course.mte !== null ? `${course.mte} / 30` : "Not graded"}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="opacity:0.75;">Sessionals (CWS):</span>
          <span>
            ${
              course.cws !== null
                ? `<strong>${course.cws} / 30</strong>`
                : `<span style="color:#f59e0b; font-size:11px;">Pending</span>`
            }
          </span>
        </div>
        ${
          course.cws === null
            ? `
              <div style="margin-top:4px; padding-top:4px; border-top:1px dashed rgba(125,125,125,0.2); display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; opacity:0.8;">CWS Estimate:</span>
                <input type="number" min="0" max="30" placeholder="e.g. 24" value="${customCwsEstimate !== null ? customCwsEstimate : ""}" data-role="cws-estimate-input" style="width:65px; padding:2px 5px; font-size:11px; border-radius:4px; background:rgba(0,0,0,0.4); border:1px solid #0d9488; color:#fff;" />
              </div>
            `
            : ""
        }
        <div style="display:flex; justify-content:space-between; margin-top:2px; border-top:1px solid rgba(125,125,125,0.2); padding-top:4px;">
          <span>Internal Subtotal:</span>
          <strong style="color:var(--mujx-accent, #2dd4bf);">${calc.internalSubtotal}</strong>
        </div>
      </div>

      <!-- Result Card -->
      <div style="background:${calc.feasibility === "impossible" ? "rgba(244,63,94,0.12)" : "rgba(13,148,136,0.14)"}; border:1px solid ${calc.feasibility === "impossible" ? "rgba(244,63,94,0.35)" : "rgba(13,148,136,0.35)"}; border-radius:8px; padding:10px 12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Required in ETE</span>
          <span class="mujx-chip ${statusBadgeClass}" style="font-size:10.5px; padding:2px 6px;">${statusLabel}</span>
        </div>

        <div style="display:flex; align-items:baseline; gap:8px;">
          <span style="font-size:24px; font-weight:800; color:${calc.feasibility === "impossible" ? "#f43f5e" : "#2dd4bf"};">
            ${calc.requiredETE !== null ? calc.requiredETE : "—"}
          </span>
          <span style="font-size:13px; opacity:0.75;">/ ${calc.eteMax} marks</span>
          ${calc.percentOfEte !== null ? `<span style="font-size:11.5px; opacity:0.8;">(${calc.percentOfEte}%)</span>` : ""}
        </div>

        <div style="font-size:11px; opacity:0.85; margin-top:6px; line-height:1.35;">
          ${escapeHtml(calc.message)}
        </div>
      </div>

      <!-- Disclaimer Footer -->
      <div style="font-size:10px; opacity:0.65; line-height:1.3; border-top:1px dashed rgba(125,125,125,0.25); padding-top:6px;">
        Assumes standard additive structure (MTE 30 + CWS 30 + ETE 40). Target thresholds are based on specified provisional boundaries. Official relative grading cohort cutoffs may vary.
      </div>
    `;

    // Event handlers
    popover.querySelectorAll("[data-grade]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        currentTarget = btn.dataset.grade;
        render();
      });
    });

    popover.querySelector("[data-role=close-popover]")?.addEventListener("click", (e) => {
      e.stopPropagation();
      e.preventDefault();
      closeActiveEtePopover();
    });

    const cwsInput = popover.querySelector("[data-role=cws-estimate-input]");
    cwsInput?.addEventListener("input", (e) => {
      e.stopPropagation();
      const val = Number(e.target.value);
      customCwsEstimate = Number.isFinite(val) && val >= 0 ? val : null;
      render();
    });
  }

  // Prevent popover clicks from bubbling to global window handlers
  popover.addEventListener("click", (e) => e.stopPropagation());
  popover.addEventListener("mousedown", (e) => e.stopPropagation());

  // Initial render then position once next to anchor
  render();
  positionPopover(popover, anchorEl, course);

  // Escape key and outside click listeners
  const onKeydown = (e) => {
    if (e.key === "Escape") closeActiveEtePopover();
  };
  const onPointerDown = (e) => {
    if (!popover.contains(e.target) && !anchorEl.contains(e.target)) {
      closeActiveEtePopover();
    }
  };

  window.addEventListener("keydown", onKeydown);
  setTimeout(() => window.addEventListener("pointerdown", onPointerDown), 10);

  popover._cleanupListeners = () => {
    window.removeEventListener("keydown", onKeydown);
    window.removeEventListener("pointerdown", onPointerDown);
  };
}

export function closeActiveEtePopover() {
  if (activePopover) {
    activePopover._cleanupListeners?.();
    activePopover.remove();
    activePopover = null;
  }
}

function positionPopover(popover, anchorEl, course) {
  // If already positioned, lock position to prevent jumping
  if (popover.dataset.positioned === "true" && popover.style.left && popover.style.top) {
    return;
  }

  const targetAnchor = (anchorEl && anchorEl.isConnected)
    ? anchorEl
    : (course?.id ? document.querySelector(`[data-course-id="${course.id}"]`) : null) || anchorEl;

  if (!targetAnchor) return;

  const rect = targetAnchor.getBoundingClientRect();
  // If element is not rendered or detached with zero rect, do not move
  if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
    return;
  }

  const popoverWidth = 330;
  const scrollX = window.scrollX || window.pageXOffset || 0;
  const scrollY = window.scrollY || window.pageYOffset || 0;

  // Align right edge of popover with right edge of anchor button
  let left = rect.right + scrollX - popoverWidth;

  // Prevent left overflow
  if (left < scrollX + 12) {
    left = scrollX + 12;
  }

  // Prevent right overflow
  const maxLeft = scrollX + window.innerWidth - popoverWidth - 16;
  if (left > maxLeft) {
    left = maxLeft;
  }

  let top = rect.bottom + scrollY + 6;

  // If opening below would overflow the viewport and opening above fits, flip upward
  const popoverHeight = popover.offsetHeight || 370;
  if (rect.bottom + popoverHeight + 12 > window.innerHeight && rect.top - popoverHeight - 6 > 0) {
    top = rect.top + scrollY - popoverHeight - 6;
  }

  popover.style.position = "absolute";
  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
  popover.style.width = `${popoverWidth}px`;
  popover.style.zIndex = "99999";
  popover.style.background = "#181b20";
  popover.style.color = "#f1f5f9";
  popover.style.border = "1px solid rgba(13, 148, 136, 0.4)";
  popover.style.borderRadius = "10px";
  popover.style.padding = "14px";
  popover.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)";
  popover.style.boxSizing = "border-box";
  popover.dataset.positioned = "true";
}
