import { detectFeedbackPage } from "../feedback/detection/feedback-detector.js";
import { parseQuestionnaire } from "../feedback/detection/question-parser.js";
import { mountFeedbackAssistant } from "../feedback/ui/feedback-assistant.js";
import { saveFeedbackTracker, updateCourseStatus } from "../feedback/storage/feedback-storage.js";
import { loadPreferences } from "../storage/preferences.js";
import { INJECT_ATTR } from "../shared/constants.js";
import { logInfo, logError } from "../shared/logger.js";

(() => {
  "use strict";
  if (window.__mujxFeedbackLoaded) return;
  window.__mujxFeedbackLoaded = true;

  let currentCleanup = null;
  let lastHandledSignature = "";

  async function runFeedbackEnhancer() {
    try {
      const prefs = await loadPreferences();
      if (prefs.features && prefs.features.feedbackAssistant === false) {
        logInfo("feedback assistant disabled in preferences");
        return;
      }

      const detected = detectFeedbackPage(document, location.href);

      // Case A: Active Feedback Questionnaire
      if (detected.kind === "questionnaire" || detected.kind === "unknown_feedback") {
        const questionnaire = parseQuestionnaire(document);
        if (questionnaire.questions.length > 0) {
          const sig = `questionnaire_${detected.metadata.courseKey}_${questionnaire.questions.length}`;
          if (sig === lastHandledSignature && document.querySelector(`[${INJECT_ATTR}="feedback-assistant"]`)) {
            return;
          }
          lastHandledSignature = sig;

          if (currentCleanup) currentCleanup();

          currentCleanup = await mountFeedbackAssistant({
            doc: document,
            metadata: detected.metadata,
            questions: questionnaire.questions,
            submitButton: detected.submitButton,
          });

          logInfo("mounted feedback assistant", {
            course: detected.metadata.courseName,
            questions: questionnaire.questions.length,
          });
          return;
        }
      }

      // Case B: Feedback Course List Page
      if (detected.kind === "list" && detected.courses.length > 0) {
        const sig = `list_${detected.courses.map((c) => `${c.id}:${c.status}`).join(";")}`;
        if (sig === lastHandledSignature && document.querySelector(`[${INJECT_ATTR}="feedback-list-banner"]`)) {
          return;
        }
        lastHandledSignature = sig;

        // Save courses to tracker
        await saveFeedbackTracker({ courses: detected.courses });

        // Enhance the Feedback List Table with an executive tracker banner
        enhanceFeedbackListPage(detected.courses, detected.academicSession);
        logInfo("enhanced feedback list page", { courses: detected.courses.length });
        return;
      }
    } catch (err) {
      logError("error in runFeedbackEnhancer", err);
    }
  }

  /**
   * Enhances the course feedback list table with a high-level tracker banner
   */
  function enhanceFeedbackListPage(courses = [], session = "") {
    document.querySelectorAll(`[${INJECT_ATTR}="feedback-list-banner"]`).forEach((el) => el.remove());

    const pendingCourses = courses.filter((c) => c.status === "Pending");
    const completedCourses = courses.filter((c) => c.status === "Completed");
    const allCompleted = pendingCourses.length === 0;

    const banner = document.createElement("div");
    banner.className = "mujx-feedback-list-banner";
    banner.setAttribute(INJECT_ATTR, "feedback-list-banner");
    banner.style.margin = "14px 0";
    banner.style.padding = "14px 18px";
    banner.style.borderRadius = "10px";
    banner.style.background = "#1e1e2d";
    banner.style.border = "1px solid #2d2d3f";
    banner.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)";
    banner.style.color = "#f1f5f9";
    banner.style.display = "flex";
    banner.style.justifyContent = "space-between";
    banner.style.alignItems = "center";
    banner.style.flexWrap = "wrap";
    banner.style.gap = "12px";

    banner.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:36px; height:36px; border-radius:8px; background:linear-gradient(135deg, #0d9488, #2dd4bf); display:flex; align-items:center; justify-content:center; font-size:16px;">
          ⚡
        </div>
        <div>
          <div style="font-size:14px; font-weight:700; color:#fff; display:flex; align-items:center; gap:8px;">
            <span>Course Feedback Status</span>
            <span style="font-size:10px; font-weight:700; padding:2px 7px; border-radius:9999px; background:${allCompleted ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}; color:${allCompleted ? "#34d399" : "#fbbf24"};">
              ${allCompleted ? "ALL COMPLETED" : `${pendingCourses.length} PENDING`}
            </span>
          </div>
          <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">
            ${session} • Open any course to activate the One-Click Feedback Assistant
          </div>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:14px;">
        <div style="display:flex; gap:12px; font-size:12px;">
          <div>
            <span style="font-weight:700; color:#fff;">${courses.length}</span>
            <span style="color:#94a3b8; font-size:11px;">Total</span>
          </div>
          <div>
            <span style="font-weight:700; color:#34d399;">${completedCourses.length}</span>
            <span style="color:#94a3b8; font-size:11px;">Completed</span>
          </div>
          <div>
            <span style="font-weight:700; color:#fbbf24;">${pendingCourses.length}</span>
            <span style="color:#94a3b8; font-size:11px;">Pending</span>
          </div>
        </div>

        ${
          pendingCourses.length > 0 && pendingCourses[0].actionUrl
            ? `
          <a href="${pendingCourses[0].actionUrl}" style="text-decoration:none; padding:8px 14px; font-size:12px; font-weight:700; border-radius:6px; background:linear-gradient(135deg, #0d9488, #0f766e); color:#fff; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(13,148,136,0.3);">
            <span>Fill Next Pending Course →</span>
          </a>
        `
            : ""
        }
      </div>
    `;

    // Find first table or content container to insert banner above
    const target = document.querySelector("table")?.closest(".table-responsive, .table-scrollable") || document.querySelector("table");
    if (target?.parentNode) {
      target.parentNode.insertBefore(banner, target);
    }
  }

  // Initialize
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", runFeedbackEnhancer, { once: true });
  } else {
    runFeedbackEnhancer();
  }

  // Handle SPA transitions, AJAX clicks, tab switches
  const observer = new MutationObserver(() => {
    runFeedbackEnhancer();
  });

  observer.observe(document.body, { childList: true, subtree: true });

  window.addEventListener("popstate", () => setTimeout(runFeedbackEnhancer, 200));
  document.addEventListener("click", (e) => {
    if (e.target.closest("a, button, select")) {
      setTimeout(runFeedbackEnhancer, 300);
      setTimeout(runFeedbackEnhancer, 1000);
    }
  }, true);
})();
