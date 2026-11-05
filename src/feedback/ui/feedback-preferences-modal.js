import {
  loadFeedbackPreferences,
  saveFeedbackPreferences,
  resetFeedbackPreferences,
} from "../storage/feedback-storage.js";
import { escapeHtml } from "../../shared/dom.js";
import { INJECT_ATTR } from "../../shared/constants.js";

/**
 * Renders the Feedback Preferences Modal
 */
export async function openFeedbackPreferencesModal({ onSaved = null } = {}) {
  closeExistingModal();

  const currentPrefs = await loadFeedbackPreferences();

  const backdrop = document.createElement("div");
  backdrop.className = "mujx-modal-backdrop";
  backdrop.setAttribute(INJECT_ATTR, "feedback-prefs-modal");

  backdrop.innerHTML = `
    <div class="mujx-modal-card" role="dialog" aria-label="Feedback Preferences">
      <div class="mujx-modal-head">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">⚙️</span>
          <div>
            <h3 style="margin:0; font-size:15px; font-weight:700; color:var(--mujx-ink, #fff);">Feedback Preferences</h3>
            <span style="font-size:11px; opacity:0.75;">Configure one-click answer defaults &amp; question overrides</span>
          </div>
        </div>
        <button type="button" data-role="close-btn" class="mujx-modal-close" style="background:none; border:none; color:var(--mujx-muted, #94a3b8); font-size:16px; cursor:pointer; padding:4px 8px;">✕</button>
      </div>

      <div class="mujx-modal-body" style="max-height:65vh; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:16px;">
        
        <!-- Global YES/NO Preference -->
        <div class="mujx-form-group">
          <label style="font-size:12px; font-weight:700; display:block; margin-bottom:6px;">Default YES/NO Selection</label>
          <div style="display:flex; gap:10px;">
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">
              <input type="radio" name="mujx_pref_yesno" value="YES" ${currentPrefs.defaultYesNo === "YES" ? "checked" : ""}>
              <span>YES (Recommended for regular classes &amp; positive reviews)</span>
            </label>
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">
              <input type="radio" name="mujx_pref_yesno" value="NO" ${currentPrefs.defaultYesNo === "NO" ? "checked" : ""}>
              <span>NO</span>
            </label>
          </div>
        </div>

        <!-- Dropdown Preference Strategy -->
        <div class="mujx-form-group">
          <label style="font-size:12px; font-weight:700; display:block; margin-bottom:6px;">Default Dropdown &amp; Rating Strategy</label>
          <select id="mujx_pref_dropdown" class="mujx-select" style="width:100%; padding:7px 10px; border-radius:6px; background:#121826; border:1px solid #2d2d3f; color:#f1f5f9; font-size:12.5px;">
            <option value="highest_positive" ${currentPrefs.defaultDropdownStrategy === "highest_positive" ? "selected" : ""}>Highest Positive Agreement (Strongly Agree / 5 Stars)</option>
            <option value="agree" ${currentPrefs.defaultDropdownStrategy === "agree" ? "selected" : ""}>Moderate Agreement (Agree / 4 Stars)</option>
          </select>
          <span style="font-size:10.5px; opacity:0.7; margin-top:4px; display:block;">Automatically selects the most constructive response for course relevance, satisfaction, and rating scales.</span>
        </div>

        <!-- Comments & Suggestions Textarea Preference -->
        <div class="mujx-form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label style="font-size:12px; font-weight:700;">Default Comment / Suggestions</label>
            <label style="font-size:11px; display:inline-flex; align-items:center; gap:4px; cursor:pointer;">
              <input type="checkbox" id="mujx_pref_fill_comments" ${currentPrefs.fillComments ? "checked" : ""}>
              <span>Fill Comments Field</span>
            </label>
          </div>
          <textarea id="mujx_pref_comment_text" rows="3" style="width:100%; padding:8px 10px; border-radius:6px; background:#121826; border:1px solid #2d2d3f; color:#f1f5f9; font-size:12px; resize:vertical;">${escapeHtml(currentPrefs.defaultComment || "")}</textarea>
        </div>

        <!-- Preservation Toggles -->
        <div class="mujx-form-group" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:10px 14px; display:flex; flex-direction:column; gap:8px;">
          <label style="font-size:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="mujx_pref_preserve_answers" ${currentPrefs.preserveExistingAnswers ? "checked" : ""}>
            <span>Preserve already-answered questions (Do not overwrite)</span>
          </label>
          <label style="font-size:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="mujx_pref_preserve_comments" ${currentPrefs.preserveExistingComments ? "checked" : ""}>
            <span>Preserve manually written comments (Never overwrite student notes)</span>
          </label>
        </div>

        <!-- Question Overrides Section -->
        <div class="mujx-form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label style="font-size:12px; font-weight:700;">Individual Question Overrides</label>
            <span style="font-size:10.5px; opacity:0.7;">Override answers for specific questions</span>
          </div>

          <div id="mujx_overrides_list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
            ${renderOverridesList(currentPrefs.overrides)}
          </div>

          <!-- Add New Override -->
          <div style="display:flex; gap:6px; align-items:center; background:#121826; padding:8px; border-radius:6px; border:1px dashed #2d2d3f;">
            <input type="text" id="mujx_new_override_q" placeholder="e.g. Effective time management during class" style="flex:1; padding:5px 8px; font-size:11.5px; background:none; border:1px solid #2d2d3f; border-radius:4px; color:#fff;" />
            <select id="mujx_new_override_val" style="padding:5px 8px; font-size:11.5px; background:#1e1e2d; border:1px solid #2d2d3f; border-radius:4px; color:#fff;">
              <option value="YES">YES</option>
              <option value="NO">NO</option>
              <option value="Strongly Agree">Strongly Agree</option>
              <option value="Agree">Agree</option>
              <option value="Neutral">Neutral</option>
              <option value="Disagree">Disagree</option>
            </select>
            <button type="button" id="mujx_add_override_btn" style="padding:5px 10px; font-size:11.5px; font-weight:700; background:var(--mujx-accent, #0d9488); border:none; border-radius:4px; color:#fff; cursor:pointer;">+ Add</button>
          </div>
        </div>

      </div>

      <div class="mujx-modal-foot" style="padding:14px 20px; border-top:1px solid #2d2d3f; display:flex; justify-content:space-between; align-items:center; background:#121826;">
        <button type="button" id="mujx_reset_defaults_btn" style="background:none; border:none; color:#f43f5e; font-size:12px; cursor:pointer; text-decoration:underline;">Reset to Defaults</button>
        <div style="display:flex; gap:8px;">
          <button type="button" data-role="close-btn" style="padding:7px 14px; font-size:12px; font-weight:600; border-radius:6px; background:#2d2d3f; border:none; color:#fff; cursor:pointer;">Cancel</button>
          <button type="button" id="mujx_save_prefs_btn" style="padding:7px 16px; font-size:12px; font-weight:700; border-radius:6px; background:var(--mujx-accent, #0d9488); border:none; color:#fff; cursor:pointer; box-shadow:0 2px 6px rgba(13,148,136,0.3);">Save Preferences</button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(backdrop);

  // Local working copy of overrides
  const workingOverrides = { ...(currentPrefs.overrides || {}) };

  // Handlers
  backdrop.querySelectorAll('[data-role="close-btn"]').forEach((btn) => {
    btn.addEventListener("click", closeExistingModal);
  });
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) closeExistingModal();
  });

  // Add override
  const addBtn = backdrop.querySelector("#mujx_add_override_btn");
  const newQInput = backdrop.querySelector("#mujx_new_override_q");
  const newValSelect = backdrop.querySelector("#mujx_new_override_val");
  const listEl = backdrop.querySelector("#mujx_overrides_list");

  addBtn.addEventListener("click", () => {
    const qText = (newQInput.value || "").trim();
    const qVal = newValSelect.value;
    if (qText) {
      workingOverrides[qText] = qVal;
      newQInput.value = "";
      listEl.innerHTML = renderOverridesList(workingOverrides);
      attachRemoveListeners(listEl, workingOverrides);
    }
  });

  attachRemoveListeners(listEl, workingOverrides);

  // Reset to defaults
  backdrop.querySelector("#mujx_reset_defaults_btn")?.addEventListener("click", async () => {
    if (confirm("Reset all feedback answer preferences back to defaults?")) {
      await resetFeedbackPreferences();
      closeExistingModal();
      if (onSaved) onSaved();
    }
  });

  // Save Preferences
  backdrop.querySelector("#mujx_save_prefs_btn")?.addEventListener("click", async () => {
    const yesNoChoice = backdrop.querySelector('input[name="mujx_pref_yesno"]:checked')?.value || "YES";
    const dropdownStrategy = backdrop.querySelector("#mujx_pref_dropdown")?.value || "highest_positive";
    const fillComments = Boolean(backdrop.querySelector("#mujx_pref_fill_comments")?.checked);
    const commentText = backdrop.querySelector("#mujx_pref_comment_text")?.value || "";
    const preserveAnswers = Boolean(backdrop.querySelector("#mujx_pref_preserve_answers")?.checked);
    const preserveComments = Boolean(backdrop.querySelector("#mujx_pref_preserve_comments")?.checked);

    const updated = {
      defaultYesNo: yesNoChoice,
      defaultDropdownStrategy: dropdownStrategy,
      fillComments,
      defaultComment: commentText,
      preserveExistingAnswers: preserveAnswers,
      preserveExistingComments: preserveComments,
      overrides: workingOverrides,
    };

    await saveFeedbackPreferences(updated);
    closeExistingModal();
    if (onSaved) onSaved(updated);
  });
}

function renderOverridesList(overrides) {
  const entries = Object.entries(overrides || {});
  if (entries.length === 0) {
    return `<div style="font-size:11px; opacity:0.5; font-style:italic;">No question overrides configured.</div>`;
  }
  return entries
    .map(
      ([q, val]) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#121826; padding:5px 8px; border-radius:4px; font-size:11.5px; border:1px solid #2d2d3f;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:280px;" title="${escapeHtml(q)}">${escapeHtml(q)}</span>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-weight:700; color:var(--mujx-accent, #2dd4bf); font-size:10.5px;">${escapeHtml(val)}</span>
          <button type="button" data-del-override="${escapeHtml(q)}" style="background:none; border:none; color:#f43f5e; cursor:pointer; font-size:12px;">✕</button>
        </div>
      </div>
    `
    )
    .join("");
}

function attachRemoveListeners(listEl, workingOverrides) {
  listEl.querySelectorAll("[data-del-override]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const k = btn.dataset.delOverride;
      delete workingOverrides[k];
      listEl.innerHTML = renderOverridesList(workingOverrides);
      attachRemoveListeners(listEl, workingOverrides);
    });
  });
}

function closeExistingModal() {
  document.querySelectorAll(`[${INJECT_ATTR}="feedback-prefs-modal"]`).forEach((el) => el.remove());
}
