import { INJECT_ATTR } from "../../../shared/constants.js";
import { escapeHtml } from "../../../shared/dom.js";
import { slcmRequest } from "../../../data/slcm-client.js";
import { syncThemeAttribute, watchThemeChanges } from "../../../shared/theme.js";

const KEY = "mujx_dashboard_enabled";
const MAX_CONCURRENT_DETAILS = 2;
const DAY_DEBOUNCE_MS = 250;
const MIN_ATTENDANCE = 75;

const attCache = new Map(); // id -> type
let viewDate = new Date();
let abortCtl = null;
let navTimer = null;
let dateLabel = null;
let todayBtn = null;

// Adaptive theme variables & styles matching MUJ FISH & SLCM portal in both dark and light modes
const DASHBOARD_CSS = `
  :root, [data-theme="light"] {
    --mf-bg-card: #f8f9fa;
    --mf-border-card: rgba(0, 0, 0, 0.06);
    --mf-shadow-card: 0 1px 3px rgba(0, 0, 0, 0.05);
    --mf-title-color: #333333;
    --mf-time-color: #7a8190;
    --mf-status-color: #64748b;
    --mf-nav-bg: #f3f6f9;
    --mf-nav-btn: #555555;
    --mf-nav-btn-hover: #e4e8ee;
    --mf-date-color: #333333;
    --mf-head-color: #464457;
    --mf-head-border: #ebedf2;
    --mf-table-head-bg: #f3f6f9;
    --mf-table-th-color: #464457;
    --mf-table-td-color: #212529;
    --mf-table-border: #ebedf2;
    --mf-table-striped: rgba(0, 0, 0, 0.02);
    --mf-table-hover: rgba(0, 0, 0, 0.04);
    --mf-switch-label: #475569;
    --mf-track-bg: #cbd5e1;
    --mf-banner-bg: #fff1f2;
    --mf-banner-border: #fecdd3;
    --mf-banner-color: #b42318;
    --mf-pill-ok-bg: #e6f6ec;
    --mf-pill-ok-color: #166534;
    --mf-pill-warn-bg: #fff4d6;
    --mf-pill-warn-color: #92600a;
    --mf-pill-bad-bg: #fde8e8;
    --mf-pill-bad-color: #b42318;
    --mf-notice-info-bg: #e8f4fd;
    --mf-notice-info-color: #0d8abc;
    --mf-notice-sec-bg: #f1f5f9;
    --mf-notice-sec-color: #64748b;
    --mf-notice-danger-bg: #fde8e8;
    --mf-notice-danger-color: #b42318;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --mf-bg-card: rgba(255, 255, 255, 0.05);
      --mf-border-card: rgba(255, 255, 255, 0.08);
      --mf-shadow-card: 0 1px 4px rgba(0, 0, 0, 0.35);
      --mf-title-color: #f1f5f9;
      --mf-time-color: #94a3b8;
      --mf-status-color: #94a3b8;
      --mf-nav-bg: rgba(255, 255, 255, 0.06);
      --mf-nav-btn: #cbd5e1;
      --mf-nav-btn-hover: rgba(255, 255, 255, 0.12);
      --mf-date-color: #f1f5f9;
      --mf-head-color: #f1f5f9;
      --mf-head-border: rgba(255, 255, 255, 0.1);
      --mf-table-head-bg: rgba(255, 255, 255, 0.06);
      --mf-table-th-color: #e2e8f0;
      --mf-table-td-color: #cbd5e1;
      --mf-table-border: rgba(255, 255, 255, 0.08);
      --mf-table-striped: rgba(255, 255, 255, 0.02);
      --mf-table-hover: rgba(255, 255, 255, 0.04);
      --mf-switch-label: #cbd5e1;
      --mf-track-bg: #475569;
      --mf-banner-bg: rgba(225, 29, 72, 0.15);
      --mf-banner-border: rgba(225, 29, 72, 0.35);
      --mf-banner-color: #fb7185;
      --mf-pill-ok-bg: rgba(16, 185, 129, 0.18);
      --mf-pill-ok-color: #34d399;
      --mf-pill-warn-bg: rgba(245, 158, 11, 0.18);
      --mf-pill-warn-color: #fbbf24;
      --mf-pill-bad-bg: rgba(244, 63, 94, 0.18);
      --mf-pill-bad-color: #fb7185;
      --mf-notice-info-bg: rgba(37, 99, 235, 0.16);
      --mf-notice-info-color: #60a5fa;
      --mf-notice-sec-bg: rgba(255, 255, 255, 0.05);
      --mf-notice-sec-color: #94a3b8;
      --mf-notice-danger-bg: rgba(225, 29, 72, 0.16);
      --mf-notice-danger-color: #fb7185;
    }
  }

  html.dark, body.dark, [data-theme="dark"], [data-mujx-theme="dark"], html[data-darkreader-mode], body[data-darkreader-mode], html[data-color-scheme="dark"], .theme-dark, .dark-mode, .dark-theme, .slcm-dark {
    --mf-bg-card: rgba(255, 255, 255, 0.05) !important;
    --mf-border-card: rgba(255, 255, 255, 0.08) !important;
    --mf-shadow-card: 0 1px 4px rgba(0, 0, 0, 0.35) !important;
    --mf-title-color: #f1f5f9 !important;
    --mf-time-color: #94a3b8 !important;
    --mf-status-color: #94a3b8 !important;
    --mf-nav-bg: rgba(255, 255, 255, 0.06) !important;
    --mf-nav-btn: #cbd5e1 !important;
    --mf-nav-btn-hover: rgba(255, 255, 255, 0.12) !important;
    --mf-date-color: #f1f5f9 !important;
    --mf-head-color: #f1f5f9 !important;
    --mf-head-border: rgba(255, 255, 255, 0.1) !important;
    --mf-table-head-bg: rgba(255, 255, 255, 0.06) !important;
    --mf-table-th-color: #e2e8f0 !important;
    --mf-table-td-color: #cbd5e1 !important;
    --mf-table-border: rgba(255, 255, 255, 0.08) !important;
    --mf-table-striped: rgba(255, 255, 255, 0.02) !important;
    --mf-table-hover: rgba(255, 255, 255, 0.04) !important;
    --mf-switch-label: #cbd5e1 !important;
    --mf-track-bg: #475569 !important;
    --mf-banner-bg: rgba(225, 29, 72, 0.15) !important;
    --mf-banner-border: rgba(225, 29, 72, 0.35) !important;
    --mf-banner-color: #fb7185 !important;
    --mf-pill-ok-bg: rgba(16, 185, 129, 0.18) !important;
    --mf-pill-ok-color: #34d399 !important;
    --mf-pill-warn-bg: rgba(245, 158, 11, 0.18) !important;
    --mf-pill-warn-color: #fbbf24 !important;
    --mf-pill-bad-bg: rgba(244, 63, 94, 0.18) !important;
    --mf-pill-bad-color: #fb7185 !important;
    --mf-notice-info-bg: rgba(37, 99, 235, 0.16) !important;
    --mf-notice-info-color: #60a5fa !important;
    --mf-notice-sec-bg: rgba(255, 255, 255, 0.05) !important;
    --mf-notice-sec-color: #94a3b8 !important;
    --mf-notice-danger-bg: rgba(225, 29, 72, 0.16) !important;
    --mf-notice-danger-color: #fb7185 !important;
  }

  .mujx-hidden { display: none !important; }

  /* Toggle bar */
  #mujx-dash-bar {
    display: flex;
    justify-content: flex-end;
    align-items: center;
    margin: 0 0 10px;
    padding: 4px 0;
  }
  .mujx-switch {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    margin: 0;
    cursor: pointer;
    font-size: 12px;
    font-weight: 600;
    color: var(--mf-switch-label);
    user-select: none;
  }
  .mujx-switch input {
    position: absolute;
    opacity: 0;
    pointer-events: none;
  }
  .mujx-track {
    position: relative;
    width: 30px;
    height: 16px;
    border-radius: 8px;
    background: var(--mf-track-bg);
    transition: background .2s;
  }
  .mujx-track::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 12px;
    height: 12px;
    border-radius: 50%;
    background: #fff;
    transition: transform .2s;
  }
  .mujx-switch input:checked + .mujx-track {
    background: #22c55e;
  }
  .mujx-switch input:checked + .mujx-track::after {
    transform: translateX(14px);
  }
  .mujx-switch input:focus-visible + .mujx-track {
    outline: 2px solid #5d78ff;
    outline-offset: 2px;
  }

  /* Timetable Column */
  #mujx-timetable {
    display: flex;
    flex-direction: column;
    gap: 14px;
    margin-bottom: 20px;
  }
  .mf-head, .mujx-head {
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 2px solid var(--mf-head-border) !important;
    padding-bottom: 10px;
  }
  .mf-head h6, .mujx-head h6 {
    margin: 0;
    font-weight: 600;
    color: var(--mf-head-color) !important;
    font-size: 1rem;
  }
  .mf-nav, .mujx-nav {
    display: flex;
    align-items: center;
    gap: 4px;
    background: var(--mf-nav-bg) !important;
    padding: 3px 6px;
    border-radius: 6px;
  }
  .mf-nav button, .mujx-nav button {
    background: none;
    border: 0;
    cursor: pointer;
    color: var(--mf-nav-btn) !important;
    font-size: 1.2em;
    line-height: 1;
    padding: 2px 8px;
    border-radius: 4px;
  }
  .mf-nav button:hover, .mujx-nav button:hover {
    background: var(--mf-nav-btn-hover) !important;
  }
  .mf-date, .mujx-date {
    min-width: 84px;
    text-align: center;
    font-size: .85em;
    font-weight: 700;
    color: var(--mf-date-color) !important;
  }
  .mf-today, .mujx-today {
    font-size: .75em !important;
    font-weight: 600;
    color: #5d78ff !important;
  }
  .mf-list, .mujx-list {
    display: flex !important;
    flex-direction: column !important;
    gap: 10px !important;
    margin: 0 !important;
    padding: 0 !important;
  }
  .mf-card {
    --c: #6c6c6c;
    border-left: 4px solid var(--c) !important;
    padding: 10px 12px !important;
    background: var(--mf-bg-card) !important;
    border: 1px solid var(--mf-border-card) !important;
    border-left: 4px solid var(--c) !important;
    border-radius: 4px !important;
    box-shadow: var(--mf-shadow-card) !important;
    min-height: 42px !important;
    margin: 0 !important;
    box-sizing: border-box !important;
  }
  .mf-time {
    font-size: .75em !important;
    color: var(--mf-time-color) !important;
    margin-bottom: 2px !important;
    font-variant-numeric: tabular-nums !important;
  }
  .mf-title {
    font-weight: 500 !important;
    font-size: .9em !important;
    margin-bottom: 6px !important;
    color: var(--mf-title-color) !important;
    line-height: 1.3 !important;
  }
  .mf-status {
    font-size: .85em !important;
    color: var(--mf-status-color) !important;
  }

  /* Attendance Summary Column */
  #mujx-summary-container {
    margin-bottom: 25px;
  }
  #mujx-summary-container h6 {
    margin: 0;
    font-weight: 600;
    color: var(--mf-head-color) !important;
    font-size: 1rem;
  }
  #mujx-summary-container hr {
    border-color: var(--mf-head-border) !important;
  }
  #mujx-summary-body {
    overflow-x: auto;
  }
  .mujx-table {
    width: 100%;
    margin-bottom: 1rem;
    color: var(--mf-table-td-color) !important;
    border-collapse: collapse;
  }
  .mujx-table thead tr {
    background: var(--mf-table-head-bg) !important;
  }
  .mujx-table tbody tr:nth-of-type(odd) {
    background-color: var(--mf-table-striped) !important;
  }
  .mujx-table tbody tr:hover {
    background-color: var(--mf-table-hover) !important;
  }
  .mujx-table th {
    padding: 0.75rem;
    vertical-align: top;
    border-top: 1px solid var(--mf-table-border) !important;
    border-bottom: 1px solid var(--mf-table-border) !important;
    font-weight: 600;
    color: var(--mf-table-th-color) !important;
    font-size: 13px;
  }
  .mujx-table td {
    padding: 0.75rem;
    vertical-align: middle;
    border-top: 1px solid var(--mf-table-border) !important;
    border-bottom: 1px solid var(--mf-table-border) !important;
    font-size: 13px;
    color: var(--mf-table-td-color) !important;
  }
  .mujx-c {
    text-align: center;
  }
  .mujx-pill {
    display: inline-block;
    min-width: 52px;
    padding: 2px 8px;
    border-radius: 10px;
    font-weight: 700;
    font-size: .9em;
    text-align: center;
  }
  .mujx-ok {
    background: var(--mf-pill-ok-bg) !important;
    color: var(--mf-pill-ok-color) !important;
  }
  .mujx-warn {
    background: var(--mf-pill-warn-bg) !important;
    color: var(--mf-pill-warn-color) !important;
  }
  .mujx-bad {
    background: var(--mf-pill-bad-bg) !important;
    color: var(--mf-pill-bad-color) !important;
  }
  .mujx-low-att-banner {
    padding: 8px 14px;
    margin-bottom: 10px;
    border-radius: 6px;
    background: var(--mf-banner-bg) !important;
    border: 1px solid var(--mf-banner-border) !important;
    color: var(--mf-banner-color) !important;
    font-size: 13px;
    font-weight: 500;
  }
  .mujx-notice {
    padding: 8px 12px;
    border-radius: 4px;
    font-size: 13px;
    margin-bottom: 10px;
  }
  .mujx-notice-info {
    background: var(--mf-notice-info-bg) !important;
    color: var(--mf-notice-info-color) !important;
  }
  .mujx-notice-secondary {
    background: var(--mf-notice-sec-bg) !important;
    color: var(--mf-notice-sec-color) !important;
  }
  .mujx-notice-danger {
    background: var(--mf-notice-danger-bg) !important;
    color: var(--mf-notice-danger-color) !important;
  }
`;

function injectStyles() {
  if (document.getElementById("mujx-dashboard-styles")) return;
  const s = document.createElement("style");
  s.id = "mujx-dashboard-styles";
  s.setAttribute(INJECT_ATTR, "dash-styles");
  s.textContent = DASHBOARD_CSS;
  (document.head || document.documentElement).appendChild(s);
}

/**
 * Identifies the native Bootstrap columns on SLCM dashboard
 */
function getColumns() {
  const ev = document.getElementById("kt_ViewEvent");
  const col9 = ev && (ev.closest(".col-md-9") || ev.closest(".col-lg-9"));
  return { ev, col9, leftCol: col9 ? col9.previousElementSibling : null };
}

function findEventsHeader(col9) {
  return Array.from((col9 || document).querySelectorAll("h6")).find((h) =>
    h.textContent.includes("List of Events"),
  );
}

/**
 * Main dashboard mount function
 */
export function mountAcademicDashboard({ container, prefs }) {
  let cleanup = null;

  async function tryMount() {
    const { ev, col9, leftCol } = getColumns();
    if (!ev && !col9) return false;

    if (!cleanup) {
      syncThemeAttribute(document.documentElement);
      const unwatchTheme = watchThemeChanges(() => {
        syncThemeAttribute(document.documentElement);
      });

      injectStyles();

      let enabled = true;
      try {
        const stored = await chrome.storage.local.get([KEY]);
        if (stored && stored[KEY] !== undefined) {
          enabled = Boolean(stored[KEY]);
        }
      } catch {}

      addToggle(enabled);

      if (enabled) {
        mountTimetable(leftCol);
        loadSummary(col9, ev);
      }

      cleanup = () => {
        unwatchTheme();
        cleanupDashboard();
      };
    }
    return true;
  }

  if (tryMount()) return () => cleanup?.();

  const obs = new MutationObserver(() => {
    if (tryMount()) obs.disconnect();
  });
  if (document.body || document.documentElement) {
    obs.observe(document.body || document.documentElement, { childList: true, subtree: true });
  }

  let tries = 0;
  const poll = setInterval(() => {
    if (tryMount() || ++tries > 30) {
      clearInterval(poll);
      obs.disconnect();
    }
  }, 200);

  return () => {
    clearInterval(poll);
    obs.disconnect();
    cleanup?.();
  };
}

function addToggle(enabled) {
  if (document.getElementById("mujx-dash-bar")) return;
  const { ev, col9 } = getColumns();
  const row = col9 && col9.parentElement;
  const anchor = row || (ev && ev.parentElement);
  if (!anchor || !anchor.parentElement) return;

  const bar = document.createElement("div");
  bar.id = "mujx-dash-bar";
  bar.setAttribute(INJECT_ATTR, "dash-bar");

  const label = document.createElement("label");
  label.className = "mujx-switch";
  label.title = "Switch between the enhanced dashboard and the original portal view";

  const input = document.createElement("input");
  input.type = "checkbox";
  input.id = "mujx-dashboard-toggle";
  input.checked = enabled;

  input.addEventListener("change", async () => {
    input.disabled = true;
    try {
      await chrome.storage.local.set({ [KEY]: input.checked });
      location.reload();
    } catch {
      input.disabled = false;
    }
  });

  const track = document.createElement("span");
  track.className = "mujx-track";

  label.appendChild(input);
  label.appendChild(track);
  label.appendChild(document.createTextNode("Enhanced view"));
  bar.appendChild(label);

  anchor.parentElement.insertBefore(bar, anchor);
}

// ---------- Timetable Mounting & Logic ----------
function mountTimetable(leftCol) {
  if (!leftCol) return null;
  if (!leftCol.querySelector("#mujx-timetable")) {
    // Hide native notifications box children
    Array.from(leftCol.children).forEach((ch) => {
      if (ch.id !== "mujx-timetable") ch.classList.add("mujx-hidden");
    });
    leftCol.appendChild(buildTimetableElement());
    loadClasses();
  }
  return leftCol;
}

function buildTimetableElement() {
  const root = document.createElement("div");
  root.id = "mujx-timetable";
  root.setAttribute(INJECT_ATTR, "tt-root");

  const head = document.createElement("div");
  head.className = "mujx-head";

  const h6 = document.createElement("h6");
  h6.textContent = "Timetable";
  head.appendChild(h6);

  const nav = document.createElement("div");
  nav.className = "mujx-nav";

  todayBtn = document.createElement("button");
  todayBtn.type = "button";
  todayBtn.className = "mujx-today";
  todayBtn.textContent = "Today";
  todayBtn.addEventListener("click", () => goToDate(new Date()));

  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.textContent = "‹";
  prevBtn.setAttribute("aria-label", "Previous day");
  prevBtn.addEventListener("click", () => shiftDay(-1));

  dateLabel = document.createElement("span");
  dateLabel.className = "mujx-date";

  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "›";
  nextBtn.setAttribute("aria-label", "Next day");
  nextBtn.addEventListener("click", () => shiftDay(1));

  nav.appendChild(todayBtn);
  nav.appendChild(prevBtn);
  nav.appendChild(dateLabel);
  nav.appendChild(nextBtn);
  head.appendChild(nav);
  root.appendChild(head);

  const container = document.createElement("div");
  container.id = "mujx-classes-container";
  root.appendChild(container);

  updateDateUI();
  return root;
}

function updateDateUI() {
  const today = sameDay(viewDate, new Date());
  if (dateLabel) {
    dateLabel.textContent = today
      ? "Today"
      : viewDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }
  if (todayBtn) todayBtn.hidden = today;
}

function goToDate(date) {
  viewDate = date;
  updateDateUI();

  if (abortCtl) abortCtl.abort();
  const container = document.getElementById("mujx-classes-container");
  if (container) {
    container.textContent = "";
    const notice = document.createElement("div");
    notice.className = "mujx-notice mujx-notice-info";
    notice.textContent = "Loading classes...";
    container.appendChild(notice);
  }
  clearTimeout(navTimer);
  navTimer = setTimeout(loadClasses, DAY_DEBOUNCE_MS);
}

function shiftDay(delta) {
  const d = new Date(viewDate);
  d.setDate(d.getDate() + delta);
  goToDate(d);
}

async function loadClasses() {
  const container = document.getElementById("mujx-classes-container");
  if (!container) return;

  if (abortCtl) abortCtl.abort();
  abortCtl = new AbortController();
  const ctl = abortCtl;

  container.textContent = "";
  const infoNotice = document.createElement("div");
  infoNotice.className = "mujx-notice mujx-notice-info";
  infoNotice.textContent = "Loading classes...";
  container.appendChild(infoNotice);

  try {
    const res = await slcmRequest("/Student/Academic/GetStudentCalenderEventList", {
      body: {
        Year: "",
        Month: "",
        Type: "agendaDay",
        Dated: apiDate(viewDate),
        PreNext: "3",
      },
    });

    if (ctl.signal.aborted || !container.isConnected) return;
    const list = Array.isArray(res?.data)
      ? res.data.filter((x) => x && typeof x === "object").sort(byStart)
      : [];

    const jobs = renderClasses(container, list, ctl.signal);
    await runLimitedJobs(jobs, MAX_CONCURRENT_DETAILS, ctl.signal);
  } catch (err) {
    if (ctl.signal.aborted || !container.isConnected) return;
    container.textContent = "";
    const dangerNotice = document.createElement("div");
    dangerNotice.className = "mujx-notice mujx-notice-danger";
    dangerNotice.textContent = "Error loading classes. ";
    const retryBtn = document.createElement("button");
    retryBtn.type = "button";
    retryBtn.className = "btn btn-sm btn-outline-danger ml-2";
    retryBtn.style.padding = "1px 6px";
    retryBtn.style.fontSize = "11px";
    retryBtn.textContent = "Retry";
    retryBtn.addEventListener("click", loadClasses);
    dangerNotice.appendChild(retryBtn);
    container.appendChild(dangerNotice);
  }
}

function renderClasses(container, list, signal) {
  container.textContent = "";
  if (!list.length) {
    const secNotice = document.createElement("div");
    secNotice.className = "mujx-notice mujx-notice-secondary";
    secNotice.textContent = "No classes scheduled for this date.";
    container.appendChild(secNotice);
    return [];
  }

  const wrap = document.createElement("div");
  wrap.className = "mf-list";
  const jobs = [];

  list.forEach((item) => {
    const s = classifyEventColor(item.eventColorCode);
    const card = document.createElement("div");
    card.className = "mf-card";
    card.style.setProperty("--c", s.color);

    const time = timeRange(item);
    if (time) {
      const timeEl = document.createElement("div");
      timeEl.className = "mf-time";
      timeEl.textContent = time;
      card.appendChild(timeEl);
    }

    const titleEl = document.createElement("div");
    titleEl.className = "mf-title";
    titleEl.textContent = item.Description || item.title || "";
    card.appendChild(titleEl);

    const statusEl = document.createElement("div");
    statusEl.className = "mf-status";
    setStatus(statusEl, s);
    card.appendChild(statusEl);
    wrap.appendChild(card);

    const eventId = item.EntryNo || item.id;
    if (!eventId || !s.detail) return;

    if (attCache.has(eventId)) {
      applyAttendanceBadge(card, statusEl, attCache.get(eventId));
      return;
    }

    jobs.push(async () => {
      try {
        const d = await slcmRequest("/Student/Academic/GetEventDetailStudent", {
          body: { EventID: String(eventId) },
        });
        if (signal?.aborted || !card.isConnected) return;
        const type = d?.data?.AttendanceType?.trim?.() || "";
        if (!type) return;
        attCache.set(eventId, type);
        applyAttendanceBadge(card, statusEl, type);
      } catch {}
    });
  });

  container.appendChild(wrap);
  return jobs;
}

function setStatus(statusEl, s) {
  statusEl.textContent = s.label;
  statusEl.style.color = s.color;
  statusEl.style.fontWeight = s.bold ? "500" : "normal";
}

function applyAttendanceBadge(card, statusEl, type) {
  statusEl.innerHTML = `<strong>${escapeHtml(type)}</strong>`;
  const t = type.toLowerCase();
  const tint = t.includes("absent")
    ? "#e53935"
    : t.includes("not considered")
    ? "#2196f3"
    : t.includes("present")
    ? "#22c55e"
    : null;

  if (tint) {
    statusEl.style.color = tint;
    card.style.setProperty("--c", tint);
  }
}

// ---------- Summary Mounting & Logic ----------
function mountSummary(col9, ev) {
  if (!ev) return null;
  let box = document.getElementById("mujx-summary-container");
  if (box) return box.querySelector("#mujx-summary-body");

  box = document.createElement("div");
  box.id = "mujx-summary-container";
  box.setAttribute(INJECT_ATTR, "summary-box");

  const h6 = document.createElement("h6");
  h6.textContent = "Attendance Summary";
  box.appendChild(h6);
  box.appendChild(document.createElement("hr"));

  const body = document.createElement("div");
  body.id = "mujx-summary-body";
  box.appendChild(body);

  const anchor = findEventsHeader(col9) || ev.parentElement;
  if (!anchor || !anchor.parentElement) return null;
  anchor.parentElement.insertBefore(box, anchor);

  const infoNotice = document.createElement("div");
  infoNotice.className = "mujx-notice mujx-notice-info";
  infoNotice.textContent = "Loading attendance...";
  body.appendChild(infoNotice);

  return body;
}

function hidePortalEvents(col9, ev) {
  const header = findEventsHeader(col9);
  if (header) {
    header.classList.add("mujx-hidden");
    const next = header.nextElementSibling;
    if (next && next.tagName === "HR") next.classList.add("mujx-hidden");
  }
  if (ev && ev.parentElement) ev.parentElement.classList.add("mujx-hidden");
}

async function loadSummary(col9, ev) {
  const body = mountSummary(col9, ev);
  if (!body) return;

  try {
    const res = await slcmRequest("/Student/Academic/GetAttendanceSummaryList", {
      body: { StudentCode: "" },
    });

    if (!body.isConnected) return;
    if (renderSummaryTable(body, res?.data)) {
      hidePortalEvents(col9, ev);
    }
  } catch {
    if (!body.isConnected) return;
    body.textContent = "";
    const dangerNotice = document.createElement("div");
    dangerNotice.className = "mujx-notice mujx-notice-danger";
    dangerNotice.textContent = "Error loading attendance.";
    body.appendChild(dangerNotice);
  }
}

function renderSummaryTable(body, data) {
  body.textContent = "";
  const ok = data && data.IsSuccessfull === true && Array.isArray(data.AttendanceSummaryList);
  const kind = ok ? data.ErrorMessage : null;

  if (!ok || (kind !== "UPCOMING" && kind !== "CLOSED")) {
    const secNotice = document.createElement("div");
    secNotice.className = "mujx-notice mujx-notice-secondary";
    secNotice.textContent =
      data && data.ErrorMessage === "OPEN"
        ? "The attendance summary is closed for now."
        : "No attendance data available.";
    body.appendChild(secNotice);
    return false;
  }

  const full = kind === "UPCOMING";
  const rows = data.AttendanceSummaryList.slice();
  if (full) {
    rows.sort((a, b) => (parseFloat(b.Percentage) || 0) - (parseFloat(a.Percentage) || 0));
  }

  const table = document.createElement("table");
  table.className = "table table-striped table-bordered table-hover mujx-table";

  const thead = document.createElement("thead");
  const trHead = document.createElement("tr");
  const heads = full
    ? [
        ["S. No.", 1],
        ["Course Name", 0],
        ["Present", 1],
        ["Absent", 1],
        ["Total", 1],
        ["%", 1],
      ]
    : [
        ["S. No.", 1],
        ["Course Name", 0],
        ["Status", 0],
      ];

  heads.forEach(([title, center]) => {
    const th = document.createElement("th");
    if (center) th.className = "mujx-c";
    th.textContent = title;
    trHead.appendChild(th);
  });
  thead.appendChild(trHead);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  rows.forEach((it, i) => {
    const tr = document.createElement("tr");

    // S. No.
    const tdNum = document.createElement("td");
    tdNum.className = "mujx-c";
    tdNum.textContent = String(i + 1);
    tr.appendChild(tdNum);

    // Course Name
    const tdName = document.createElement("td");
    tdName.textContent = it.CourseID ?? "";
    tr.appendChild(tdName);

    if (full) {
      const tdP = document.createElement("td");
      tdP.className = "mujx-c";
      tdP.textContent = String(it.Present ?? 0);
      tr.appendChild(tdP);

      const tdA = document.createElement("td");
      tdA.className = "mujx-c";
      tdA.textContent = String(it.Absent ?? 0);
      tr.appendChild(tdA);

      const tdT = document.createElement("td");
      tdT.className = "mujx-c";
      tdT.textContent = String(it.Total ?? 0);
      tr.appendChild(tdT);

      const tdPct = document.createElement("td");
      tdPct.className = "mujx-c";
      tdPct.appendChild(makePctPill(it.Percentage));
      tr.appendChild(tdPct);
    } else {
      const tdStatus = document.createElement("td");
      tdStatus.textContent = it.Status ?? "";
      tr.appendChild(tdStatus);
    }

    tbody.appendChild(tr);
  });
  table.appendChild(tbody);

  if (full) {
    const below75 = rows.filter(
      (it) => !isNaN(parseFloat(it.Percentage)) && parseFloat(it.Percentage) < 75,
    );
    if (below75.length) {
      const banner = document.createElement("div");
      banner.className = "mujx-low-att-banner";
      banner.innerHTML = `<strong>⚠️ ${below75.length} course${below75.length > 1 ? "s" : ""} below 75%</strong> — attend urgently to avoid debarment risk.`;
      body.appendChild(banner);
    }
  }

  body.appendChild(table);
  return true;
}

function makePctPill(value) {
  const n = parseFloat(value);
  const cls = isNaN(n) ? "" : n < MIN_ATTENDANCE ? "mujx-bad" : n < MIN_ATTENDANCE + 5 ? "mujx-warn" : "mujx-ok";
  const pill = document.createElement("span");
  pill.className = `mujx-pill ${cls}`;
  pill.textContent = value != null && value !== "" ? String(value) : "–";
  return pill;
}

// ---------- Helper Utilities ----------
function classifyEventColor(raw) {
  let c = String(raw || "").replace("!important", "").trim().toLowerCase();
  if (!/^#[0-9a-f]{3,8}$/.test(c)) c = "#6c6c6c";
  switch (c) {
    case "#3d9400":
      return { color: c, bold: true, label: "Attendance Marked", detail: true };
    case "#820c0c":
      return { color: c, bold: true, label: "Rescheduled", detail: false };
    case "#800000":
      return { color: c, bold: true, label: "Cancelled", detail: false };
    case "#6c6c6c":
    case "#808080":
      return { color: "#6c6c6c", bold: false, label: "Pending / Not Marked", detail: false };
    default:
      return { color: c, bold: true, label: "Scheduled Event", detail: true };
  }
}

const pad = (n) => String(n).padStart(2, "0");
const apiDate = (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
const sameDay = (a, b) => a.toDateString() === b.toDateString();
const fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

function parseDate(v) {
  if (v == null || v === "") return NaN;
  const m = /\/Date\((-?\d+)/.exec(String(v));
  return m ? Number(m[1]) : Date.parse(v);
}

function startTs(item) {
  const v = parseDate(item && item.StartDate);
  return isNaN(v) ? Infinity : v;
}

function byStart(a, b) {
  const x = startTs(a);
  const y = startTs(b);
  return x === y ? 0 : x < y ? -1 : 1;
}

function timeRange(item) {
  const s = parseDate(item.StartDate);
  const e = parseDate(item.EndDate);
  if (isNaN(s)) return "";
  return isNaN(e) ? fmtTime(s) : `${fmtTime(s)} – ${fmtTime(e)}`;
}

async function runLimitedJobs(jobs, limit, signal) {
  let i = 0;
  const worker = async () => {
    while (!signal?.aborted && i < jobs.length) {
      const job = jobs[i++];
      try {
        await job();
      } catch {}
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, jobs.length) }, worker));
}

function cleanupDashboard() {
  document.getElementById("mujx-dash-bar")?.remove();
  document.getElementById("mujx-timetable")?.remove();
  document.getElementById("mujx-summary-container")?.remove();
  document.querySelectorAll(".mujx-hidden").forEach((el) => el.classList.remove("mujx-hidden"));
}
