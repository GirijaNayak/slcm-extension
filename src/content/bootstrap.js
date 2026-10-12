import { BOOT_FLAG, INJECT_ATTR, PAGE_KINDS, STORAGE_KEYS } from "../shared/constants.js";
import { detectPage } from "./page-detector.js";
import { applyTheme, createOverlay, injectColumn, teardownAll } from "./overlay-manager.js";
import { observePath, observeTable } from "./observers.js";
import { loadPreferences, savePreferences } from "../storage/preferences.js";
import {
  dismissNotification,
  loadCache,
  loadNotifications,
  loadTimetableSnapshot,
  recordNotifications,
  resetCache,
  saveCache,
  saveTimetableSnapshot,
} from "../storage/cache.js";
import { extractAttendanceFromDocument } from "../data/attendance-adapter.js";
import { extractMarksFromDocument } from "../data/marks-adapter.js";
import { extractSemesterContext } from "../data/semester-adapter.js";
import { extractTimetableFromDocument } from "../data/timetable-adapter.js";
import { parseCgpaSummaryTable, parseGradesTable } from "../data/grades-adapter.js";
import { enhanceGradeSheet } from "../ui/components/grades/grade-sheet.js";
import { analyzeSchedule } from "../data/timetable-adapter.js";
import { planTargetCgpa } from "../calculations/target-cgpa.js";
import { fingerprint } from "../data/normalizers.js";
import { enhanceRecord } from "../calculations/attendance.js";
import { parseNumber } from "../shared/dom.js";
import { renderAttendanceCell, renderAttendancePanel } from "../ui/components/attendance/panel.js";
import { renderMarksPanel } from "../ui/components/marks/panel.js";
import { renderCgpaPredictor } from "../ui/components/cgpa-predictor/panel.js";
import { renderTargetPlanner } from "../ui/components/target-cgpa-planner/panel.js";
import { renderTimetablePanel } from "../ui/components/timetable/panel.js";
import { buildAcademicAlerts, renderNotifications } from "../ui/components/notifications/panel.js";
import { logError, logInfo } from "../shared/logger.js";

const cleanups = [];
let activeFloatingTab = "alerts";

async function boot() {
  if (window[BOOT_FLAG]) return;
  window[BOOT_FLAG] = true;
  await mount();
  cleanups.push(observePath(() => remount()));

  // Listen to local preference / cache changes
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === "local") remount();
  });

  // Message handler for test commands, manual resets, status checks
  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type === "mujx.teardown") {
      teardownAll();
      window[BOOT_FLAG] = false;
      sendResponse({ ok: true });
    }
    if (message?.type === "mujx.status") {
      sendResponse({ ok: true, href: location.href, page: detectPage() });
    }
    return true;
  });
}

async function remount() {
  cleanups.splice(0).forEach((fn) => fn?.());
  teardownAll();
  await mount();
}

async function mount() {
  try {
    const prefs = await loadPreferences();
    const page = detectPage();
    logInfo("page detected", { kind: page.kind, reason: page.reason });

    // Skip login pages entirely
    if (page.kind === PAGE_KINDS.login) return;

    const cache = await loadCache();
    const seed = extractSemesterContext();
    let attendance = extractAttendanceFromDocument();
    const marks = extractMarksFromDocument();
    let timetable = extractTimetableFromDocument();

    // Cache fingerprints to detect changes
    const marksFingerprint = marks.available
      ? fingerprint(marks.records.map((r) => [r.subject, r.component, r.obtained]))
      : null;
    const marksChanged = Boolean(
      marksFingerprint && cache.marks?.fingerprint && cache.marks.fingerprint !== marksFingerprint,
    );

    if (attendance.available) {
      await saveCache({
        attendance: {
          count: attendance.records.length,
          fingerprint: fingerprint(attendance.records.map((r) => [r.courseCode, r.present, r.absent, r.total])),
        },
      });
    }

    if (marks.available) {
      await saveCache({ marks: { count: marks.records.length, fingerprint: marksFingerprint } });
    }

    let snapshotChanged = false;
    if (timetable.available) {
      const previous = await loadTimetableSnapshot();
      snapshotChanged = Boolean(previous && previous.fingerprint && previous.fingerprint !== timetable.fingerprint);
      await saveTimetableSnapshot({ fingerprint: timetable.fingerprint, at: new Date().toISOString() });
      await saveCache({ timetable: { count: timetable.events.length, fingerprint: timetable.fingerprint } });
    }

    const hasGradeTableInDOM = () => {
      const tables = document.querySelectorAll("table");
      for (const t of tables) {
        const text = (t.textContent || "").toLowerCase();
        if (text.includes("grade") && (text.includes("course") || text.includes("credit") || text.includes("session"))) {
          return true;
        }
        if (text.includes("cgpa") && (text.includes("student") || text.includes("registration"))) {
          return true;
        }
      }
      return false;
    };

    const isGradesPage =
      page.kind === PAGE_KINDS.grades ||
      location.pathname.toLowerCase().includes("grade") ||
      location.pathname.toLowerCase().includes("cgpaga") ||
      location.pathname.toLowerCase().includes("examination") ||
      hasGradeTableInDOM();
    const isMarksPage = page.kind === PAGE_KINDS.marks;

    // 1. INLINE ENHANCEMENT: Attendance Tables (both Attendance page AND Dashboard)
    // Directly injects the "MUJX Intel" column into the website's table. Zero overlays.
    // Strictly guard so attendance is NEVER injected on grades or marks pages.
    if (
      prefs.features.attendance &&
      !isGradesPage &&
      !isMarksPage &&
      attendance.available &&
      attendance.table
    ) {
      const cleanup = injectColumn(attendance.table, {
        key: "attendance-intel",
        title: "MUJX Intel",
        render: (td, row) => {
          const cells = [...row.cells].map((cell) => cell.textContent);
          const record = attendance.records.find((item) => cells.join(" ").includes(item.subject)) || {
            subject: cells[1] || cells[0],
            present: parseNumber(cells[cells.length - 3]),
            total: parseNumber(cells[cells.length - 2]),
          };
          renderAttendanceCell(td, record, prefs.attendanceThreshold, prefs.borderlineBand);
        },
      });
      cleanups.push(cleanup);

      cleanups.push(
        observeTable(attendance.table, () => {
          attendance = extractAttendanceFromDocument();
          remount();
        }),
      );

      const enhanced = attendance.records.map((r) =>
        enhanceRecord(r, prefs.attendanceThreshold, prefs.borderlineBand),
      );
      await recordAlertsIfAny(enhanced, snapshotChanged, marksChanged);
    }

    // 2. INLINE ENHANCEMENT: CGPA & Grade Sheet Tables (/Student/Academic/GradesForStudent & CGPAGPAForStudent)
    if (isGradesPage) {
      enhanceGradesInline(prefs);

      // Continuous DOM observation for dynamic AJAX / postback tables (e.g. clicking 'Find' for a semester)
      const dynamicObserver = new MutationObserver((mutations) => {
        const hasExternalChanges = mutations.some((m) => {
          const target = m.target;
          return !(target?.hasAttribute?.(INJECT_ATTR) || target?.closest?.(`[${INJECT_ATTR}]`));
        });
        if (hasExternalChanges) {
          enhanceGradesInline(prefs);
        }
      });
      dynamicObserver.observe(document.body, { childList: true, subtree: true });
      cleanups.push(() => dynamicObserver.disconnect());

      // Listen to user interactions with buttons and dropdowns (e.g. Find button, semester select)
      const onUserInteraction = (e) => {
        const isInteractive = e.target.closest("button, input[type=submit], input[type=button], select, a, input");
        if (isInteractive) {
          setTimeout(() => enhanceGradesInline(prefs), 100);
          setTimeout(() => enhanceGradesInline(prefs), 350);
          setTimeout(() => enhanceGradesInline(prefs), 800);
          setTimeout(() => enhanceGradesInline(prefs), 1600);
        }
      };
      document.addEventListener("click", onUserInteraction, true);
      document.addEventListener("change", onUserInteraction, true);
      cleanups.push(() => {
        document.removeEventListener("click", onUserInteraction, true);
        document.removeEventListener("change", onUserInteraction, true);
      });
    }

    // 3. INLINE ENHANCEMENT: Internal Marks Table
    if (prefs.features.marks && isMarksPage) {
      enhanceMarksTableInline(marks, prefs);
    }

    // 4. INLINE ENHANCEMENT: Timetable (highlight active class slot in place)
    if (prefs.features.timetable) {
      highlightActiveTimetableSlot(timetable.events);
    }

    // 5. Universal Floating MUJX Hub (small unobtrusive pill in bottom-right corner only, closed by default)
    mountFloatingHub(prefs, seed, snapshotChanged, attendance, marksChanged, timetable, marks);

    // Controlled Auto-refresh
    if (prefs.autoRefreshMinutes > 0) {
      const timer = setTimeout(() => remount(), prefs.autoRefreshMinutes * 60 * 1000);
      cleanups.push(() => clearTimeout(timer));
    }
  } catch (error) {
    logError("extension mount failed", { code: error.name });
  }
}

/**
 * Enhances Grade Sheet and CGPA tables directly on the website without any overlay.
 */
function enhanceGradesInline(prefs) {
  const allTables = [
    ...document.querySelectorAll("table"),
    ...[...document.querySelectorAll("iframe")].flatMap((f) => {
      try {
        return [...(f.contentDocument?.querySelectorAll("table") || [])];
      } catch {
        return [];
      }
    }),
  ];

  for (const table of allTables) {
    const text = (table.textContent || "").toLowerCase();

    // Case A: Grade Sheet (/Student/Academic/GradesForStudent)
    // Computes official credit-weighted SGPA and provides interactive predictor
    if (text.includes("grade") && (text.includes("course") || text.includes("credit") || text.includes("session"))) {
      const gradeSheetData = parseGradesTable(table);
      if (gradeSheetData.available && gradeSheetData.records.length) {
        const dataSig = `${gradeSheetData.session || ""}:${gradeSheetData.records.map((r) => `${r.courseCode}-${r.letter}-${r.credits}`).join(";")}`;
        if (table.getAttribute("data-mujx-sig") === dataSig && table.querySelector(`[${INJECT_ATTR}="grade-points"]`)) {
          continue;
        }

        // Clean previous injections if dataset changed
        table.querySelectorAll(`[${INJECT_ATTR}]`).forEach((el) => el.remove());
        table.setAttribute("data-mujx-sig", dataSig);

        const cleanup = enhanceGradeSheet({
          table,
          records: gradeSheetData.records,
          totalCreditsFromFooter: gradeSheetData.totalCreditsFromFooter,
          headerRow: gradeSheetData.headerRow,
          allRows: gradeSheetData.allRows,
          headerRowIndex: gradeSheetData.headerRowIndex,
          session: gradeSheetData.session,
        });
        cleanups.push(cleanup);
        continue;
      }
    }

    // Case B: Multi-semester CGPA table (/Student/Academic/CGPAGPAForStudent)
    if (text.includes("cgpa") && (text.includes("student") || text.includes("registration"))) {
      if (table.querySelector(`[${INJECT_ATTR}="cgpa-target-intel"]`)) continue;
      const cgpaData = parseCgpaSummaryTable(table);
      if (cgpaData && cgpaData.cgpa !== null) {
        const completedCr = cgpaData.completedCredits || 89;
        const targetGoal = cgpaData.cgpa < 8.0 ? 8.0 : cgpaData.cgpa < 8.5 ? 8.5 : 9.0;
        const plan = planTargetCgpa({
          currentCgpa: cgpaData.cgpa,
          completedCredits: completedCr,
          targetCgpa: targetGoal,
          remainingCredits: 20,
          gradeCap: prefs.gradeCap || 10,
        });

        const cleanup = injectColumn(table, {
          key: "cgpa-target-intel",
          title: "MUJX Target Plan",
          render: (td) => {
            const reqText =
              plan.requiredAverageSgpa !== null
                ? `Next Sem: ${plan.requiredAverageSgpa.toFixed(2)} SGPA for ${targetGoal.toFixed(1)} CGPA`
                : `Target ${targetGoal.toFixed(1)} Met`;
            td.innerHTML = `
              <div style="font-size:12px; font-weight:700; color:var(--mujx-accent, #2dd4bf); white-space:nowrap;">
                ${reqText}
              </div>
              <div style="font-size:11px; opacity:0.75;">
                Current: <strong>${cgpaData.cgpa}</strong> (${completedCr} cr)
              </div>
            `;
          },
        });
        cleanups.push(cleanup);
      }
    }
  }
}

/**
 * Enhances internal marks tables directly in place without any overlay.
 */
function enhanceMarksTableInline(marks, prefs) {
  if (!marks.available) return;
  const tables = document.querySelectorAll("table");
  for (const table of tables) {
    const text = (table.textContent || "").toLowerCase();
    if (text.includes("mark") || text.includes("component") || text.includes("obtained")) {
      const cleanup = injectColumn(table, {
        key: "marks-weight-intel",
        title: "Weightage & Target",
        render: (td, row) => {
          td.innerHTML = `<span style="font-size:11.5px; color:#0d9488; font-weight:600;">Official Record</span>`;
        },
      });
      cleanups.push(cleanup);
    }
  }
}

/**
 * Highlights active timetable class card directly in the portal without any overlay.
 */
function highlightActiveTimetableSlot(events) {
  const analysis = analyzeSchedule(events);
  if (!analysis.current) return;
  const currentTitle = (analysis.current.title || "").toLowerCase();
  const cards = document.querySelectorAll(".mf-card, .fc-event, [data-event], .calendar-event, tr");
  for (const card of cards) {
    const text = (card.textContent || "").toLowerCase();
    if (text.includes(currentTitle)) {
      card.style.borderLeft = "4px solid #10b981";
      if (!card.querySelector("[data-mujx=live-badge]")) {
        const badge = document.createElement("span");
        badge.setAttribute("data-mujx", "live-badge");
        badge.className = "mujx-chip safe";
        badge.style.fontSize = "10px";
        badge.style.padding = "1px 5px";
        badge.style.marginLeft = "6px";
        badge.textContent = "● Happening Now";
        card.prepend(badge);
        cleanups.push(() => badge.remove());
      }
      break;
    }
  }
}

async function recordAlertsIfAny(enhancedAttendance, snapshotChanged, marksChanged) {
  const alerts = buildAcademicAlerts({
    attendance: enhancedAttendance,
    timetableChanged: snapshotChanged,
    newMarks: marksChanged,
  });
  if (alerts.length) await recordNotifications(alerts);
}

/**
 * Floating button at bottom-right corner only. Never auto-opens over the page.
 */
async function mountFloatingHub(prefs, seed, snapshotChanged, attendance, marksChanged, timetable, marks) {
  const overlay = createOverlay({ id: "float", placement: "float" });
  if (!overlay.host) return;
  applyTheme(overlay.wrap, prefs.theme);

  const enhancedAttendance = (attendance.records || []).map((r) =>
    enhanceRecord(r, prefs.attendanceThreshold, prefs.borderlineBand),
  );

  const alerts = buildAcademicAlerts({
    attendance: enhancedAttendance,
    timetableChanged: snapshotChanged,
    newMarks: marksChanged,
  });
  if (alerts.length) await recordNotifications(alerts);

  const notifsData = await loadNotifications();
  const alertCount = notifsData.items.length;

  let isHidden = false;
  try {
    const hubStored = await chrome.storage.local.get(STORAGE_KEYS.hubState);
    if (hubStored[STORAGE_KEYS.hubState]?.lastTab) {
      activeFloatingTab = hubStored[STORAGE_KEYS.hubState].lastTab;
    }
    isHidden = Boolean(hubStored[STORAGE_KEYS.hubState]?.hidden);
  } catch {
    // default tab remains alerts
  }

  overlay.wrap.innerHTML = `
    <div class="mujx-fab-container" style="display:${isHidden ? "none" : "inline-flex"}; align-items:center; gap:4px; pointer-events:auto;">
      <button class="mujx-fab-pill" type="button" data-role="fab-toggle" tabindex="0" role="button" aria-haspopup="dialog" aria-expanded="false" title="MUJX Academic Tools (Click to open sidebar drawer)">
        <span style="font-size:13px">✨</span>
        <span data-role="fab-label">MUJX</span>
        <span class="mujx-fab-badge" data-role="fab-badge" ${alertCount === 0 ? "hidden" : ""}>${alertCount}</span>
      </button>
      <button class="mujx-fab-min-btn" type="button" data-role="fab-min" title="Hide floating MUJX widget" style="background:rgba(0,0,0,0.55); border:1px solid rgba(255,255,255,0.25); border-radius:50%; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; font-size:10px; padding:0;">✕</button>
    </div>

    <div class="mujx-drawer" data-role="drawer" role="dialog" aria-label="MUJX Intelligence Hub" hidden>
      <div class="mujx-drawer-head">
        <div class="mujx-drawer-title">
          <span style="font-size:16px;">✨</span>
          <span>MUJX Academic Tools</span>
        </div>
        <button class="mujx-btn secondary" type="button" data-role="drawer-close" aria-label="Close hub" style="padding:4px 8px; font-size:12px;">✕</button>
      </div>

      <div class="mujx-drawer-tabs" role="tablist">
        <button class="mujx-tab-btn ${activeFloatingTab === 'alerts' ? 'active' : ''}" type="button" role="tab" data-tab="alerts">
          🔔 Alerts ${alertCount > 0 ? `(${alertCount})` : ''}
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === 'attendance' ? 'active' : ''}" type="button" role="tab" data-tab="attendance">
          📊 Attendance
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === 'marks' ? 'active' : ''}" type="button" role="tab" data-tab="marks">
          📝 Marks & SGPA
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === 'cgpa' ? 'active' : ''}" type="button" role="tab" data-tab="cgpa">
          📈 CGPA Predictor
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === 'planner' ? 'active' : ''}" type="button" role="tab" data-tab="planner">
          🎯 Target Planner
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === 'timetable' ? 'active' : ''}" type="button" role="tab" data-tab="timetable">
          📅 Timetable
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === 'settings' ? 'active' : ''}" type="button" role="tab" data-tab="settings">
          ⚙️ Settings
        </button>
      </div>

      <div class="mujx-drawer-body" data-role="drawer-body"></div>
    </div>
  `;

  const fabContainer = overlay.wrap.querySelector(".mujx-fab-container");
  const toggleBtn = overlay.wrap.querySelector("[data-role=fab-toggle]");
  const minBtn = overlay.wrap.querySelector("[data-role=fab-min]");
  const drawer = overlay.wrap.querySelector("[data-role=drawer]");
  const closeBtn = overlay.wrap.querySelector("[data-role=drawer-close]");

  minBtn?.addEventListener("click", async (e) => {
    e.stopPropagation();
    fabContainer.style.display = "none";
    try {
      await chrome.storage.local.set({ [STORAGE_KEYS.hubState]: { hidden: true } });
    } catch {}
  });
  const body = overlay.wrap.querySelector("[data-role=drawer-body]");
  const tabBtns = overlay.wrap.querySelectorAll("[data-tab]");

  const renderActiveTab = async () => {
    tabBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.tab === activeFloatingTab);
    });

    body.innerHTML = "";

    if (activeFloatingTab === "alerts") {
      const { items } = await loadNotifications();
      renderNotifications({
        wrap: body,
        items,
        onDismiss: async (id) => {
          await dismissNotification(id);
          renderActiveTab();
          updateBadge();
        },
        onClearAll: async () => {
          await resetCache();
          renderActiveTab();
          updateBadge();
        },
      });
    } else if (activeFloatingTab === "attendance") {
      if (attendance.records?.length) {
        renderAttendancePanel({
          records: attendance.records,
          threshold: prefs.attendanceThreshold,
          borderlineBand: prefs.borderlineBand,
          wrap: body,
        });
      } else {
        body.innerHTML = `
          <div class="mujx-empty">
            <div style="font-size:24px; margin-bottom:6px;">📊</div>
            <strong>No Attendance Data On This Page</strong>
            <p class="mujx-sub">Navigate to the <a href="/Student/Academic/Attendance" style="color:var(--mujx-accent)">Attendance</a> page to view and simulate your courses.</p>
          </div>
        `;
      }
    } else if (activeFloatingTab === "marks") {
      if (marks?.records?.length) {
        renderMarksPanel({
          records: marks.records,
          wrap: body,
          weights: prefs.assumedInternalWeights,
        });
      } else {
        body.innerHTML = `
          <div class="mujx-empty">
            <div style="font-size:24px; margin-bottom:6px;">📝</div>
            <strong>No Marks Data On This Page</strong>
            <p class="mujx-sub">Navigate to <a href="/Student/Academic/GetInternalMarks" style="color:var(--mujx-accent)">Internal Marks</a> to view and simulate subject scores.</p>
          </div>
        `;
      }
    } else if (activeFloatingTab === "cgpa") {
      renderCgpaPredictor({ wrap: body, seed });
    } else if (activeFloatingTab === "planner") {
      renderTargetPlanner({ wrap: body, seed, gradeCap: prefs.gradeCap });
    } else if (activeFloatingTab === "timetable") {
      if (timetable.events?.length) {
        renderTimetablePanel({
          wrap: body,
          events: timetable.events,
          snapshot: { changed: snapshotChanged },
          updatedAt: new Date().toLocaleTimeString(),
          attendanceRecords: attendance.records,
        });
      } else {
        body.innerHTML = `
          <div class="mujx-empty">
            <div style="font-size:24px; margin-bottom:6px;">📅</div>
            <strong>No Timetable Events On This Page</strong>
            <p class="mujx-sub">Navigate to the <a href="/Student/Academic/TimeTable" style="color:var(--mujx-accent)">Timetable</a> page to view schedule intelligence.</p>
          </div>
        `;
      }
    } else if (activeFloatingTab === "settings") {
      renderSettingsTab(body, prefs);
    }
  };

  const renderSettingsTab = (container, currentPrefs) => {
    container.innerHTML = `
      <div style="padding:4px 0;">
        <h4 class="mujx-title" style="font-size:14px; margin-bottom:12px;">MUJX Extension Preferences</h4>
        
        <div style="display:flex; flex-direction:column; gap:12px;">
          <label class="mujx-sub" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Target Attendance (%)</span>
            <input class="mujx-input" data-pref="attendanceThreshold" type="number" min="50" max="100" value="${currentPrefs.attendanceThreshold}" style="width:75px;">
          </label>

          <label class="mujx-sub" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Borderline Risk Band (±%)</span>
            <input class="mujx-input" data-pref="borderlineBand" type="number" min="1" max="15" value="${currentPrefs.borderlineBand}" style="width:75px;">
          </label>

          <label class="mujx-sub" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Grade Point Cap</span>
            <input class="mujx-input" data-pref="gradeCap" type="number" min="4" max="10" value="${currentPrefs.gradeCap}" style="width:75px;">
          </label>

          <label class="mujx-sub" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Theme</span>
            <select class="mujx-select" data-pref="theme" style="width:100px;">
              <option value="auto" ${currentPrefs.theme === 'auto' ? 'selected' : ''}>Auto</option>
              <option value="light" ${currentPrefs.theme === 'light' ? 'selected' : ''}>Light</option>
              <option value="dark" ${currentPrefs.theme === 'dark' ? 'selected' : ''}>Dark</option>
            </select>
          </label>

          <div style="display:flex; gap:8px; margin-top:10px;">
            <button class="mujx-btn" type="button" data-role="save-prefs-btn" style="flex:1;">Save Preferences</button>
            <button class="mujx-btn secondary" type="button" data-role="reset-cache-btn">Clear Cache</button>
          </div>

          <div data-role="settings-status" class="mujx-note" style="text-align:center;"></div>
        </div>
      </div>
    `;

    const saveBtn = container.querySelector("[data-role=save-prefs-btn]");
    const resetBtn = container.querySelector("[data-role=reset-cache-btn]");
    const statusEl = container.querySelector("[data-role=settings-status]");

    saveBtn?.addEventListener("click", async () => {
      const newThreshold = Number(container.querySelector("[data-pref=attendanceThreshold]")?.value) || 75;
      const newBand = Number(container.querySelector("[data-pref=borderlineBand]")?.value) || 5;
      const newCap = Number(container.querySelector("[data-pref=gradeCap]")?.value) || 10;
      const newTheme = container.querySelector("[data-pref=theme]")?.value || "auto";

      await savePreferences({
        attendanceThreshold: newThreshold,
        borderlineBand: newBand,
        gradeCap: newCap,
        theme: newTheme,
      });

      statusEl.textContent = "✓ Preferences saved successfully.";
      setTimeout(() => remount(), 500);
    });

    resetBtn?.addEventListener("click", async () => {
      await resetCache();
      statusEl.textContent = "✓ Cache cleared.";
      updateBadge();
    });
  };

  const updateBadge = async () => {
    const { items } = await loadNotifications();
    const badgeEl = overlay.wrap.querySelector("[data-role=fab-badge]");
    if (badgeEl) {
      badgeEl.textContent = items.length;
      badgeEl.hidden = items.length === 0;
    }
  };

  const openDrawer = () => {
    drawer.removeAttribute("hidden");
    toggleBtn.setAttribute("aria-expanded", "true");
    renderActiveTab();
    chrome.storage.local.set({
      [STORAGE_KEYS.hubState]: { open: true, lastTab: activeFloatingTab },
    }).catch(() => {});
  };

  const closeDrawer = () => {
    drawer.setAttribute("hidden", "");
    toggleBtn.setAttribute("aria-expanded", "false");
    chrome.storage.local.set({
      [STORAGE_KEYS.hubState]: { open: false, lastTab: activeFloatingTab },
    }).catch(() => {});
  };

  toggleBtn.addEventListener("click", () => {
    if (drawer.hasAttribute("hidden")) {
      openDrawer();
    } else {
      closeDrawer();
    }
  });

  toggleBtn.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      if (drawer.hasAttribute("hidden")) {
        openDrawer();
      } else {
        closeDrawer();
      }
    }
  });

  closeBtn.addEventListener("click", closeDrawer);

  tabBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      activeFloatingTab = btn.dataset.tab;
      renderActiveTab();
      chrome.storage.local.set({
        [STORAGE_KEYS.hubState]: { open: true, lastTab: activeFloatingTab },
      }).catch(() => {});
    });
  });

  const onKeydown = (e) => {
    if (e.key === "Escape" && !drawer.hasAttribute("hidden")) {
      closeDrawer();
    }
  };
  window.addEventListener("keydown", onKeydown);
  cleanups.push(() => window.removeEventListener("keydown", onKeydown));

  const onOutsideClick = (e) => {
    if (!drawer.hasAttribute("hidden")) {
      const path = e.composedPath();
      if (!path.includes(overlay.wrap)) {
        closeDrawer();
      }
    }
  };
  window.addEventListener("pointerdown", onOutsideClick);
  cleanups.push(() => window.removeEventListener("pointerdown", onOutsideClick));
}

boot();
