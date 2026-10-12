(() => {
  // src/shared/constants.js
  var NS = "mujx";
  var BOOT_FLAG = "__MUJX_BOOTED";
  var HOST_ROOT_ATTR = "data-mujx-root";
  var INJECT_ATTR = "data-mujx";
  var DEFAULT_PREFERENCES = Object.freeze({
    features: {
      attendance: true,
      marks: true,
      sgpa: true,
      cgpaPredictor: true,
      targetCgpa: true,
      timetable: true,
      notifications: true,
      homePanel: true
    },
    attendanceThreshold: 75,
    borderlineBand: 5,
    theme: "auto",
    autoRefreshMinutes: 0,
    showTheoryPracticalSplit: true,
    gradeCap: 10,
    assumedInternalWeights: {
      source: "muj-exam-handbook-2023-24",
      note: "MTE 30 / CWS 30 / ETE 40 except Faculty of Design. Used only when the portal does not expose weights.",
      mte: 30,
      cws: 30,
      ete: 40
    },
    absoluteGradeBoundaries: []
  });
  var MUJ_GRADE_POINTS = Object.freeze({
    "A+": 10,
    A: 9,
    B: 8,
    C: 7,
    D: 6,
    E: 5,
    AP: 0,
    F: 0,
    I: 0,
    DT: 0,
    S: 0,
    U: 0
  });
  var MUJ_NON_EVALUATIVE_GRADES = Object.freeze(["S", "U", "AP"]);
  var CANDIDATE_ENDPOINTS = Object.freeze({
    attendanceSummary: "/Student/Academic/GetAttendanceSummaryList",
    gradesForFaculty: "/Student/Academic/GetGradesForFaculty",
    eventDetail: "/Student/Academic/GetEventDetailStudent",
    calendarEvents: "/Student/Academic/GetStudentCalenderEventList"
  });
  var PAGE_KINDS = Object.freeze({
    login: "login",
    home: "home",
    attendance: "attendance",
    marks: "marks",
    grades: "grades",
    timetable: "timetable",
    other: "other"
  });
  var STORAGE_KEYS = Object.freeze({
    preferences: "mujx.preferences",
    cache: "mujx.cache",
    notifications: "mujx.notifications",
    dismissed: "mujx.dismissed",
    timetableSnapshot: "mujx.timetableSnapshot",
    hubState: "mujx.hubState"
  });

  // src/content/page-detector.js
  function detectPage(doc = document, href = location.href) {
    const url = new URL(href);
    const path = url.pathname.toLowerCase();
    const title = (doc.title || "").toLowerCase();
    const heading = collectHeadings(doc);
    const body = `${title} ${heading} ${path}`;
    if (/\/home\/logout|\/account\/login|signin|student login/.test(body) && findPasswordField(doc)) {
      return { kind: PAGE_KINDS.login, reason: "login-form" };
    }
    if (matches(body, ["attendance", "attendence"]) || /attendance/.test(path)) {
      return { kind: PAGE_KINDS.attendance, reason: "path-or-heading" };
    }
    if (matches(body, ["internal mark", "internal marks", "sessional", "continuous assessment"])) {
      return { kind: PAGE_KINDS.marks, reason: "path-or-heading" };
    }
    if (matches(body, ["grade card", "grades", "grade sheet", "gradesheet", "sgpa", "cgpa", "examination"]) || /grade|cgpaga|examination/.test(path)) {
      return { kind: PAGE_KINDS.grades, reason: "path-or-heading" };
    }
    if (matches(body, ["time table", "timetable", "calendar", "schedule"]) || /calendar|timetable|time-table/.test(path)) {
      return { kind: PAGE_KINDS.timetable, reason: "path-or-heading" };
    }
    if (matches(body, ["dashboard", "student home", "welcome"]) || /\/student\/?$|\/home\/index|\/student\/home/.test(path)) {
      return { kind: PAGE_KINDS.home, reason: "home" };
    }
    return { kind: PAGE_KINDS.other, reason: "unclassified" };
  }
  function collectHeadings(doc) {
    return [...doc.querySelectorAll("h1,h2,h3,.kt-subheader__title,.page-title,.breadcrumb")].slice(0, 8).map((node) => node.textContent).join(" ").toLowerCase();
  }
  function findPasswordField(doc) {
    return Boolean(doc.querySelector('input[type="password"]'));
  }
  function matches(text, needles) {
    return needles.some((needle) => text.includes(needle));
  }

  // src/ui/popover.js
  var activePopover = null;
  var popoverHost = null;
  var popoverShadow = null;
  var currentKeyHandler = null;
  var currentClickHandler = null;
  function getOrCreateHost(theme = "auto") {
    if (popoverHost && document.body.contains(popoverHost)) {
      const wrap2 = popoverShadow?.querySelector(".mujx-root");
      if (wrap2) wrap2.setAttribute("data-theme", theme);
      return { host: popoverHost, shadow: popoverShadow };
    }
    popoverHost = document.createElement("div");
    popoverHost.id = `${NS}-popover-host`;
    popoverHost.setAttribute(HOST_ROOT_ATTR, "popover-host");
    popoverHost.setAttribute(INJECT_ATTR, "popover");
    Object.assign(popoverHost.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "100%",
      height: "100%",
      pointerEvents: "none",
      zIndex: "2147483645"
    });
    popoverShadow = popoverHost.attachShadow({ mode: "open" });
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("src/ui/styles.css");
    const wrap = document.createElement("div");
    wrap.className = "mujx-root mujx-popover-wrapper";
    wrap.setAttribute("data-theme", theme);
    popoverShadow.append(link, wrap);
    document.documentElement.append(popoverHost);
    return { host: popoverHost, shadow: popoverShadow };
  }
  function openPopover({
    anchorEl,
    title,
    badge = null,
    contentHtml,
    onMount = null,
    width = 330,
    theme = "auto"
  }) {
    closePopover();
    if (!anchorEl || !document.body.contains(anchorEl)) return null;
    const { shadow } = getOrCreateHost(theme);
    const wrap = shadow.querySelector(".mujx-popover-wrapper");
    const popover = document.createElement("div");
    popover.className = "mujx-popover";
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", title || "Information popover");
    popover.style.width = `${Math.min(width, window.innerWidth - 24)}px`;
    popover.innerHTML = `
    <div class="mujx-popover-head">
      <div class="mujx-popover-title">
        <span>${title || "MUJX Intel"}</span>
        ${badge ? `<span class="mujx-chip ${badge.type || "safe"}" style="font-size:10.5px; padding:1px 6px;">${badge.text}</span>` : ""}
      </div>
      <button class="mujx-btn secondary mujx-popover-close" type="button" aria-label="Close popover">\u2715</button>
    </div>
    <div class="mujx-popover-body">
      ${contentHtml}
    </div>
  `;
    wrap.append(popover);
    positionPopover(popover, anchorEl, width);
    const closeBtn = popover.querySelector(".mujx-popover-close");
    closeBtn?.addEventListener("click", (e) => {
      e.stopPropagation();
      closePopover();
    });
    if (typeof onMount === "function") {
      onMount(popover);
    }
    currentKeyHandler = (e) => {
      if (e.key === "Escape") {
        closePopover();
      }
    };
    window.addEventListener("keydown", currentKeyHandler, { capture: true });
    currentClickHandler = (e) => {
      const path = e.composedPath();
      if (!path.includes(popover) && !path.includes(anchorEl)) {
        closePopover();
      }
    };
    setTimeout(() => {
      window.addEventListener("pointerdown", currentClickHandler, { capture: true });
    }, 10);
    activePopover = popover;
    return popover;
  }
  function positionPopover(popover, anchorEl, preferredWidth) {
    const rect = anchorEl.getBoundingClientRect();
    const popoverWidth = Math.min(preferredWidth, window.innerWidth - 24);
    popover.style.width = `${popoverWidth}px`;
    const popoverRect = popover.getBoundingClientRect();
    const popoverHeight = popoverRect.height || 260;
    let left = rect.left + rect.width / 2 - popoverWidth / 2;
    left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, left));
    const roomBelow = window.innerHeight - rect.bottom - 12;
    const roomAbove = rect.top - 12;
    let top;
    if (roomBelow < popoverHeight && roomAbove > roomBelow) {
      top = Math.max(12, rect.top - popoverHeight - 8);
    } else {
      top = Math.min(window.innerHeight - popoverHeight - 12, rect.bottom + 8);
    }
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
  }
  function closePopover() {
    if (activePopover) {
      activePopover.remove();
      activePopover = null;
    }
    if (currentKeyHandler) {
      window.removeEventListener("keydown", currentKeyHandler, { capture: true });
      currentKeyHandler = null;
    }
    if (currentClickHandler) {
      window.removeEventListener("pointerdown", currentClickHandler, { capture: true });
      currentClickHandler = null;
    }
  }
  function teardownPopovers() {
    closePopover();
    if (popoverHost) {
      popoverHost.remove();
      popoverHost = null;
      popoverShadow = null;
    }
  }

  // src/content/overlay-manager.js
  var hosts = /* @__PURE__ */ new Set();
  var injected = /* @__PURE__ */ new Set();
  function createOverlay({ id, placement = "float" }) {
    teardownById(id);
    if (placement !== "float") {
      return { host: null, shadow: null, wrap: document.createElement("div") };
    }
    const host = document.createElement("div");
    host.id = `${NS}-${id}`;
    host.setAttribute(HOST_ROOT_ATTR, id);
    host.setAttribute(INJECT_ATTR, "overlay");
    host.className = `mujx-host mujx-host--${placement}`;
    const shadow = host.attachShadow({ mode: "open" });
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = chrome.runtime.getURL("src/ui/styles.css");
    const wrap = document.createElement("div");
    wrap.className = "mujx-root";
    wrap.setAttribute("data-theme", "auto");
    shadow.append(link, wrap);
    place(host, placement);
    hosts.add(host);
    injected.add(host);
    return { host, shadow, wrap };
  }
  function applyTheme(wrap, theme) {
    wrap?.setAttribute?.("data-theme", theme || "auto");
  }
  function injectColumn(table, { key, title, render }) {
    if (!table || table.querySelector(`th[${INJECT_ATTR}="${key}"]`)) return () => {
    };
    const theadRows = table.querySelectorAll("thead tr");
    const headerRow = theadRows.length ? theadRows[0] : table.rows[0];
    if (!headerRow) return () => {
    };
    const th = document.createElement("th");
    th.textContent = title;
    th.setAttribute(INJECT_ATTR, key);
    if (theadRows.length > 1) {
      th.setAttribute("rowspan", String(theadRows.length));
    }
    headerRow.append(th);
    const bodyRows = table.tBodies.length ? [...table.tBodies].flatMap((body) => [...body.rows]) : [...table.rows].slice(theadRows.length || 1);
    bodyRows.forEach((row, index) => {
      const td = document.createElement("td");
      td.setAttribute(INJECT_ATTR, key);
      render(td, row, index);
      row.append(td);
    });
    injected.add(th);
    return () => {
      table.querySelectorAll(`[${INJECT_ATTR}="${key}"]`).forEach((node) => node.remove());
    };
  }
  function teardownAll() {
    teardownPopovers();
    for (const node of injected) {
      node.remove();
    }
    injected.clear();
    hosts.clear();
    document.querySelectorAll(`[${INJECT_ATTR}], [${HOST_ROOT_ATTR}]`).forEach((node) => node.remove());
  }
  function teardownById(id) {
    document.getElementById(`${NS}-${id}`)?.remove();
  }
  function place(host, placement) {
    if (placement === "float") {
      Object.assign(host.style, {
        position: "fixed",
        right: "20px",
        bottom: "76px",
        zIndex: "2147483000",
        pointerEvents: "none"
      });
      document.documentElement.append(host);
    }
  }

  // src/content/observers.js
  function observeTable(table, onChange, { debounceMs = 180 } = {}) {
    if (!table) return () => {
    };
    let timer = 0;
    const observer = new MutationObserver((mutations) => {
      const meaningful = mutations.some((mutation) => {
        const nodes = [...mutation.addedNodes, ...mutation.removedNodes, mutation.target];
        return nodes.some((node) => node?.nodeType === 1 && !node.hasAttribute?.("data-mujx") && !node.closest?.("[data-mujx]"));
      });
      if (!meaningful) return;
      clearTimeout(timer);
      timer = setTimeout(onChange, debounceMs);
    });
    observer.observe(table, { childList: true, subtree: true, characterData: true });
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }
  function observePath(onChange) {
    let last = location.href;
    const notify = () => {
      if (location.href === last) return;
      last = location.href;
      onChange(last);
    };
    const wrap = (method) => {
      const original = history[method];
      history[method] = function patched(...args) {
        const result = original.apply(this, args);
        notify();
        return result;
      };
      return original;
    };
    const push = wrap("pushState");
    const replace = wrap("replaceState");
    window.addEventListener("popstate", notify);
    const poll = setInterval(notify, 1500);
    return () => {
      history.pushState = push;
      history.replaceState = replace;
      window.removeEventListener("popstate", notify);
      clearInterval(poll);
    };
  }

  // src/storage/preferences.js
  async function loadPreferences() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.preferences);
    return mergePrefs(DEFAULT_PREFERENCES, stored[STORAGE_KEYS.preferences] || {});
  }
  async function savePreferences(patch) {
    const current = await loadPreferences();
    const next = mergePrefs(current, patch);
    await chrome.storage.local.set({ [STORAGE_KEYS.preferences]: next });
    return next;
  }
  function mergePrefs(base, patch) {
    return {
      ...base,
      ...patch,
      features: { ...base.features, ...patch.features || {} },
      assumedInternalWeights: {
        ...base.assumedInternalWeights,
        ...patch.assumedInternalWeights || {}
      },
      absoluteGradeBoundaries: patch.absoluteGradeBoundaries ?? base.absoluteGradeBoundaries
    };
  }

  // src/storage/cache.js
  var MAX_NOTIFICATIONS = 40;
  async function loadCache() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.cache);
    return stored[STORAGE_KEYS.cache] || { updatedAt: null, attendance: null, marks: null, grades: null, timetable: null };
  }
  async function saveCache(partial) {
    const current = await loadCache();
    const next = { ...current, ...partial, updatedAt: (/* @__PURE__ */ new Date()).toISOString() };
    await chrome.storage.local.set({ [STORAGE_KEYS.cache]: next });
    return next;
  }
  async function resetCache() {
    await chrome.storage.local.remove([
      STORAGE_KEYS.cache,
      STORAGE_KEYS.notifications,
      STORAGE_KEYS.dismissed,
      STORAGE_KEYS.timetableSnapshot
    ]);
  }
  async function loadNotifications() {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.notifications, STORAGE_KEYS.dismissed]);
    return {
      items: stored[STORAGE_KEYS.notifications] || [],
      dismissed: stored[STORAGE_KEYS.dismissed] || []
    };
  }
  async function recordNotifications(incoming) {
    const { items, dismissed } = await loadNotifications();
    const dismissedSet = new Set(dismissed);
    const existingIds = new Set(items.map((item) => item.id));
    const merged = [...items];
    for (const item of incoming) {
      if (dismissedSet.has(item.id) || existingIds.has(item.id)) continue;
      merged.unshift(item);
      existingIds.add(item.id);
    }
    const trimmed = merged.slice(0, MAX_NOTIFICATIONS);
    await chrome.storage.local.set({ [STORAGE_KEYS.notifications]: trimmed });
    return trimmed;
  }
  async function dismissNotification(id) {
    const { items, dismissed } = await loadNotifications();
    const nextItems = items.filter((item) => item.id !== id);
    const nextDismissed = [.../* @__PURE__ */ new Set([...dismissed, id])].slice(-200);
    await chrome.storage.local.set({
      [STORAGE_KEYS.notifications]: nextItems,
      [STORAGE_KEYS.dismissed]: nextDismissed
    });
    return nextItems;
  }
  async function loadTimetableSnapshot() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.timetableSnapshot);
    return stored[STORAGE_KEYS.timetableSnapshot] || null;
  }
  async function saveTimetableSnapshot(snapshot) {
    await chrome.storage.local.set({ [STORAGE_KEYS.timetableSnapshot]: snapshot });
    return snapshot;
  }

  // src/shared/dom.js
  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function normalizeHeader(text) {
    return String(text ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 %./-]+/g, "").trim();
  }
  function textOf(node) {
    return (node?.textContent || "").replace(/\s+/g, " ").trim();
  }
  function parseNumber(value) {
    if (value === null || value === void 0 || value === "") return null;
    const cleaned = String(value).replace(/[% ,]/g, "").trim();
    if (!cleaned || cleaned === "-" || cleaned === "NA" || cleaned === "N/A") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  function headerIndexMap(headers) {
    const map = {};
    headers.forEach((header, index) => {
      map[normalizeHeader(header)] = index;
    });
    return map;
  }
  function pickIndex(map, aliases) {
    for (const alias of aliases) {
      const key = normalizeHeader(alias);
      if (key in map) return map[key];
    }
    for (const [key, index] of Object.entries(map)) {
      if (aliases.some((alias) => key.includes(normalizeHeader(alias)))) return index;
    }
    return -1;
  }
  function tableToMatrix(table) {
    if (!table) return { headers: [], rows: [], table, headerRow: null, headerRowIndex: -1, allRows: [] };
    const allRows = [...table.querySelectorAll("tr")];
    if (!allRows.length) return { headers: [], rows: [], table, headerRow: null, headerRowIndex: -1, allRows: [] };
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(allRows.length, 5); i++) {
      const cells = [...allRows[i].children];
      const texts = cells.map(textOf).map((t) => t.toLowerCase());
      const matchCount = texts.filter(
        (t) => t.includes("course") || t.includes("grade") || t.includes("credit") || t.includes("subject") || t.includes("present") || t.includes("total") || t.includes("session") || t.includes("s. no") || t === "s.no." || t === "s.no" || t === "s. no."
      ).length;
      if (matchCount >= 2) {
        headerRowIndex = i;
        break;
      }
    }
    if (headerRowIndex === -1) {
      const theadTr = table.querySelector("thead tr");
      if (theadTr) {
        headerRowIndex = allRows.indexOf(theadTr);
      } else {
        const thRow = allRows.find((r) => r.querySelector("th"));
        if (thRow) {
          headerRowIndex = allRows.indexOf(thRow);
        }
      }
    }
    if (headerRowIndex === -1) headerRowIndex = 0;
    const headerRow = allRows[headerRowIndex];
    const headers = [...headerRow.children].map(textOf);
    const rows = allRows.slice(headerRowIndex + 1).map((row) => [...row.children].map(textOf)).filter((cells) => cells.some(Boolean));
    return { headers, rows, table, headerRow, headerRowIndex, allRows };
  }

  // src/data/normalizers.js
  function normalizeAttendanceRow(raw) {
    const present = firstNumber(raw, ["present", "Present", "PresentCount", "TotalPresent"]);
    const total = firstNumber(raw, ["total", "Total", "TotalClass", "TotalClasses", "Conducted"]);
    const absent = firstNumber(raw, ["absent", "Absent", "AbsentCount"]);
    const percent = firstNumber(raw, ["percent", "Percentage", "AttendancePercentage"]);
    const theoryPresent = firstNumber(raw, ["theoryPresent", "TheoryPresent"]);
    const theoryTotal = firstNumber(raw, ["theoryTotal", "TheoryTotal"]);
    const practicalPresent = firstNumber(raw, ["practicalPresent", "PracticalPresent"]);
    const practicalTotal = firstNumber(raw, ["practicalTotal", "PracticalTotal"]);
    return {
      id: String(raw.id ?? raw.CourseCode ?? raw.SubjectCode ?? raw.courseCode ?? raw.subject ?? cryptoRandom()),
      courseCode: raw.courseCode ?? raw.CourseCode ?? raw.SubjectCode ?? "",
      subject: raw.subject ?? raw.CourseName ?? raw.SubjectName ?? raw.name ?? "Untitled course",
      present: present ?? (total !== null && absent !== null ? total - absent : null),
      absent: absent ?? (total !== null && present !== null ? total - present : null),
      total,
      percent,
      theoryPresent,
      theoryTotal,
      practicalPresent,
      practicalTotal,
      source: raw.source || "unknown"
    };
  }
  function normalizeMarkRow(raw) {
    return {
      id: String(raw.id ?? raw.AssessmentId ?? raw.Component ?? cryptoRandom()),
      courseCode: raw.courseCode ?? raw.CourseCode ?? "",
      subject: raw.subject ?? raw.CourseName ?? raw.SubjectName ?? "",
      component: raw.component ?? raw.AssessmentName ?? raw.ExamType ?? raw.name ?? "Assessment",
      obtained: firstNumber(raw, ["obtained", "MarksObtained", "ObtainedMarks", "Marks"]),
      maximum: firstNumber(raw, ["maximum", "MaxMarks", "TotalMarks"]),
      weight: firstNumber(raw, ["weight", "Weightage", "Weight"]),
      credits: firstNumber(raw, ["credits", "Credits", "Credit"]),
      letter: raw.letter ?? raw.Grade ?? raw.OfficialGrade ?? null,
      source: raw.source || "unknown"
    };
  }
  function normalizeGradeRow(raw) {
    const sessionVal = raw.session ?? raw.AcademicSession ?? raw.academicSession ?? raw.semester ?? raw.Semester ?? raw.SemesterName ?? null;
    return {
      id: String(raw.id ?? raw.CourseCode ?? cryptoRandom()),
      courseCode: raw.courseCode ?? raw.CourseCode ?? "",
      subject: raw.subject ?? raw.CourseName ?? "",
      credits: firstNumber(raw, ["credits", "Credits", "Credit"]),
      letter: raw.letter ?? raw.Grade ?? raw.GradeLetter ?? null,
      gradePoints: firstNumber(raw, ["gradePoints", "GradePoint", "GP"]),
      semester: sessionVal,
      session: sessionVal,
      excludeFromGpa: Boolean(raw.excludeFromGpa),
      source: raw.source || "unknown"
    };
  }
  function normalizeEvent(raw) {
    return {
      id: String(raw.id ?? raw.EventId ?? cryptoRandom()),
      title: raw.title ?? raw.EventName ?? raw.SubjectName ?? raw.CourseName ?? "Event",
      courseCode: raw.courseCode ?? raw.CourseCode ?? "",
      start: raw.start ?? raw.StartDate ?? raw.StartTime ?? raw.FromTime ?? null,
      end: raw.end ?? raw.EndDate ?? raw.EndTime ?? raw.ToTime ?? null,
      room: raw.room ?? raw.RoomNo ?? raw.Venue ?? raw.Location ?? "",
      type: raw.type ?? raw.EventType ?? raw.SlotType ?? "",
      cancelled: Boolean(raw.cancelled ?? raw.IsCancelled),
      source: raw.source || "unknown"
    };
  }
  function fingerprint(value) {
    const json = JSON.stringify(value);
    let hash = 0;
    for (let i = 0; i < json.length; i += 1) {
      hash = hash * 31 + json.charCodeAt(i) | 0;
    }
    return String(hash);
  }
  function firstNumber(raw, keys) {
    for (const key of keys) {
      if (raw[key] !== void 0 && raw[key] !== null && raw[key] !== "") {
        const n = parseNumber(raw[key]);
        if (n !== null) return n;
      }
    }
    return null;
  }
  function cryptoRandom() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `row-${Math.random().toString(16).slice(2)}`;
  }

  // src/shared/logger.js
  var PREFIX = "[MUJX]";
  function logInfo(message, meta = {}) {
    console.info(PREFIX, message, sanitize(meta));
  }
  function logError(message, meta = {}) {
    console.error(PREFIX, message, sanitize(meta));
  }
  function sanitize(meta) {
    const allowed = {};
    for (const [key, value] of Object.entries(meta)) {
      if (["status", "path", "kind", "code", "timeout", "retry"].includes(key)) {
        allowed[key] = value;
      }
    }
    return allowed;
  }

  // src/data/attendance-adapter.js
  var HEADER_ALIASES = {
    subject: ["subject", "course name", "course", "paper name"],
    courseCode: ["code", "course code", "subject code"],
    present: ["present", "attended", "total present"],
    absent: ["absent"],
    total: ["total", "conducted", "total class", "classes"],
    percent: ["percent", "percentage", "%"],
    theoryPresent: ["theory present"],
    theoryTotal: ["theory total"],
    practicalPresent: ["practical present", "lab present"],
    practicalTotal: ["practical total", "lab total"]
  };
  function extractAttendanceFromDocument(doc = document) {
    const tables = [...doc.querySelectorAll("table")];
    for (const table of tables) {
      const parsed = parseAttendanceTable(table);
      if (parsed.records.length) return parsed;
    }
    return { records: [], source: "dom", available: false, reason: "no_attendance_table" };
  }
  function parseAttendanceTable(table) {
    if (!table) return { records: [], table: null, available: false };
    const tableText = (table.textContent || "").toLowerCase();
    if (tableText.includes("cgpa") || tableText.includes("sgpa") || tableText.includes("grade sheet") || tableText.includes("academic session") || tableText.includes("internal marks") || tableText.includes("fee receipt") || tableText.includes("exam schedule")) {
      if (!tableText.includes("attendance") && !tableText.includes("conducted") && !tableText.includes("present")) {
        return { records: [], table, source: "dom", available: false };
      }
    }
    const { headers, rows } = tableToMatrix(table);
    const map = headerIndexMap(headers);
    const presentIdx = pickIndex(map, HEADER_ALIASES.present);
    const totalIdx = pickIndex(map, HEADER_ALIASES.total);
    const percentIdx = pickIndex(map, HEADER_ALIASES.percent);
    if (presentIdx < 0 || totalIdx < 0 && percentIdx < 0) {
      return { records: [], table, source: "dom", available: false };
    }
    const records = rows.map(
      (cells) => normalizeAttendanceRow({
        subject: cells[pickIndex(map, HEADER_ALIASES.subject)] || cells[1] || cells[0],
        courseCode: cells[pickIndex(map, HEADER_ALIASES.courseCode)] || "",
        present: parseNumber(cells[presentIdx]),
        absent: parseNumber(cells[pickIndex(map, HEADER_ALIASES.absent)]),
        total: parseNumber(cells[totalIdx]),
        percent: parseNumber(cells[percentIdx]),
        theoryPresent: parseNumber(cells[pickIndex(map, HEADER_ALIASES.theoryPresent)]),
        theoryTotal: parseNumber(cells[pickIndex(map, HEADER_ALIASES.theoryTotal)]),
        practicalPresent: parseNumber(cells[pickIndex(map, HEADER_ALIASES.practicalPresent)]),
        practicalTotal: parseNumber(cells[pickIndex(map, HEADER_ALIASES.practicalTotal)]),
        source: "dom"
      })
    );
    return { records, table, source: "dom", available: records.length > 0 };
  }

  // src/data/marks-adapter.js
  function extractMarksFromDocument(doc = document) {
    const tables = [...doc.querySelectorAll("table")];
    const found = [];
    for (const table of tables) {
      const parsed = parseMarksTable(table);
      if (parsed.records.length) found.push(parsed);
    }
    if (!found.length) return { records: [], groups: [], source: "dom", available: false };
    return {
      records: found.flatMap((item) => item.records),
      groups: found,
      source: "dom",
      available: true
    };
  }
  function parseMarksTable(table) {
    const { headers, rows } = tableToMatrix(table);
    const map = headerIndexMap(headers);
    const obtainedIdx = pickIndex(map, ["obtained", "marks obtained", "marks", "score"]);
    const maxIdx = pickIndex(map, ["max", "maximum", "total marks", "max marks"]);
    if (obtainedIdx < 0 && maxIdx < 0) return { records: [], table, available: false };
    const subject = nearbyHeading(table);
    const records = rows.map(
      (cells, index) => normalizeMarkRow({
        id: `${subject}-${index}`,
        subject,
        component: cells[pickIndex(map, ["assessment", "exam", "component", "type", "particulars"])] || cells[0],
        obtained: parseNumber(cells[obtainedIdx]),
        maximum: parseNumber(cells[maxIdx]),
        weight: parseNumber(cells[pickIndex(map, ["weight", "weightage"])]),
        credits: parseNumber(cells[pickIndex(map, ["credit", "credits"])]),
        letter: cells[pickIndex(map, ["grade"])] || null,
        source: "dom"
      })
    );
    return { records, table, subject, available: records.length > 0 };
  }
  function groupMarksBySubject(records) {
    const groups = /* @__PURE__ */ new Map();
    for (const record of records) {
      const key = record.subject || record.courseCode || "Course";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(record);
    }
    return [...groups.entries()].map(([subject, items]) => ({ subject, items }));
  }
  function nearbyHeading(table) {
    let node = table.previousElementSibling;
    for (let i = 0; i < 4 && node; i += 1) {
      const text = node.textContent?.trim();
      if (text && text.length < 80) return text;
      node = node.previousElementSibling;
    }
    return table.closest(".card, .kt-portlet, .portlet")?.querySelector("h1,h2,h3,h4,.card-title,.kt-portlet__head-title")?.textContent?.trim() || "Course";
  }

  // src/data/grades-adapter.js
  function extractGradesFromDocument(doc = document) {
    const tables = [...doc.querySelectorAll("table")];
    for (const table of tables) {
      const cgpaTable = parseCgpaSummaryTable(table);
      if (cgpaTable) {
        return {
          records: [],
          table,
          source: "cgpa-summary-table",
          available: true,
          summary: cgpaTable
        };
      }
    }
    for (const table of tables) {
      const parsed = parseGradesTable(table);
      if (parsed.records.length) return parsed;
    }
    const summary = extractCgpaSummary(doc);
    return { records: [], source: "dom", available: false, summary };
  }
  function parseCgpaSummaryTable(table) {
    const text = (table.textContent || "").toLowerCase();
    if (!text.includes("cgpa") || !text.includes("student") && !text.includes("registration")) {
      return null;
    }
    const rows = [...table.querySelectorAll("tr")];
    let cgpaColIdx = -1;
    let totalColIdx = -1;
    for (const row of rows) {
      const cells = [...row.children];
      cells.forEach((cell, idx) => {
        const t = cell.textContent.trim().toLowerCase();
        if (t === "cgpa") cgpaColIdx = idx;
        if (t === "total" || t.includes("total credit")) totalColIdx = idx;
      });
      if (cgpaColIdx >= 0) break;
    }
    for (const row of rows) {
      const cells = [...row.children];
      if (cells.length < 5) continue;
      const texts = cells.map((c) => c.textContent.trim());
      const regNo = texts.find((t) => /^\d{8,12}$/.test(t));
      if (regNo) {
        const cgpa = cgpaColIdx >= 0 ? parseNumber(texts[cgpaColIdx]) : parseNumber(texts[3]);
        const credits = totalColIdx >= 0 ? parseNumber(texts[totalColIdx]) : parseNumber(texts[4]);
        const semesters = [];
        const startIdx = Math.max(cgpaColIdx, totalColIdx) + 1;
        for (let i = startIdx; i < texts.length - 1; i += 2) {
          const sgpa = parseNumber(texts[i]);
          const semCredits = parseNumber(texts[i + 1]);
          if (sgpa !== null && semCredits !== null && semCredits > 0) {
            semesters.push({ sgpa, credits: semCredits });
          }
        }
        return {
          table,
          studentRow: row,
          cgpa,
          completedCredits: credits,
          semesters,
          available: cgpa !== null
        };
      }
    }
    return null;
  }
  function parseGradesTable(table) {
    const matrix = tableToMatrix(table);
    const { headers, rows, headerRow, allRows, headerRowIndex } = matrix;
    const map = headerIndexMap(headers);
    const letterIdx = pickIndex(map, ["grade", "letter", "lg"]);
    const creditIdx = pickIndex(map, ["credit", "credits", "cr"]);
    const subjectIdx = pickIndex(map, ["course name", "course", "subject", "paper name", "paper"]);
    const codeIdx = pickIndex(map, ["course code", "code", "subject code"]);
    const sessionIdx = pickIndex(map, ["academic session", "session"]);
    if (letterIdx < 0 || creditIdx < 0) return { records: [], table, available: false };
    const records = [];
    let totalCreditsFromFooter = null;
    for (const cells of rows) {
      if (!cells || !cells.length) continue;
      const firstNonEmpty = cells.find((c) => c && c.trim().length > 0) || "";
      if (firstNonEmpty.toLowerCase().includes("total") || cells.some((c) => c.toLowerCase() === "total")) {
        const nums = cells.map(parseNumber).filter((n) => n !== null);
        if (nums.length) totalCreditsFromFooter = nums[nums.length - 1];
        continue;
      }
      const cr = parseNumber(cells[creditIdx]);
      const rawLetter = cells[letterIdx] ? cells[letterIdx].trim().toUpperCase() : null;
      const subject = (subjectIdx >= 0 ? cells[subjectIdx] : "") || cells[2] || cells[1] || "";
      const courseCode = (codeIdx >= 0 ? cells[codeIdx] : "") || cells[1] || "";
      const session = sessionIdx >= 0 ? cells[sessionIdx] : "";
      if (cr === null && !rawLetter) continue;
      records.push(
        normalizeGradeRow({
          subject,
          courseCode,
          credits: cr,
          letter: rawLetter,
          session,
          source: "dom"
        })
      );
    }
    const detectedSession = records.find((r) => r.session)?.session || records.find((r) => r.semester)?.semester || null;
    return {
      records,
      table,
      source: "dom",
      available: records.length > 0,
      totalCreditsFromFooter,
      headerRow,
      allRows,
      headerRowIndex,
      session: detectedSession
    };
  }
  function extractCgpaSummary(doc = document) {
    const text = doc.body?.innerText || "";
    const cgpa = matchNumber(text, /c\.?g\.?p\.?a\.?\s*[:\-is]*\s*([0-9]+(?:\.[0-9]+)?)/i);
    const sgpa = matchNumber(text, /s\.?g\.?p\.?a\.?\s*[:\-is]*\s*([0-9]+(?:\.[0-9]+)?)/i);
    const credits = matchNumber(text, /((?:total|earned|completed)\s+credits?)\s*[:\-]*\s*([0-9]+(?:\.[0-9]+)?)/i, 2);
    return {
      cgpa,
      sgpa,
      completedCredits: credits,
      source: "dom-text",
      available: cgpa !== null || credits !== null
    };
  }
  function matchNumber(text, regex, group = 1) {
    const match = text.match(regex);
    if (!match) return null;
    const n = Number(match[group]);
    return Number.isFinite(n) ? n : null;
  }

  // src/calculations/grade-points.js
  var MUJ_GRADE_POINT_MAP = Object.freeze({
    "A+": 10,
    A: 9,
    B: 8,
    C: 7,
    D: 6,
    E: 5,
    F: 0,
    I: 0,
    DT: 0,
    S: null,
    U: null,
    AP: null,
    W: null
  });
  var NON_EVALUATIVE_GRADES = Object.freeze(["S", "U", "AP", "W"]);
  function normalizeGrade(grade) {
    if (grade === null || grade === void 0) return "";
    return String(grade).trim().toUpperCase();
  }
  function getGradePoint(grade, customMap = MUJ_GRADE_POINT_MAP) {
    const key = normalizeGrade(grade);
    if (!key) return void 0;
    if (Object.prototype.hasOwnProperty.call(customMap, key)) {
      return customMap[key];
    }
    return void 0;
  }
  function isNonEvaluativeGrade(grade) {
    const key = normalizeGrade(grade);
    return NON_EVALUATIVE_GRADES.includes(key);
  }

  // src/calculations/rounding.js
  function roundTo(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  // src/calculations/sgpa.js
  function gradePointForLetter(letter, table = MUJ_GRADE_POINT_MAP) {
    const gp = getGradePoint(letter, table);
    return typeof gp === "number" ? gp : null;
  }
  function calculateSGPA(rawCourses = [], optionsOrMap = {}) {
    const options = optionsOrMap && typeof optionsOrMap === "object" && !optionsOrMap.gradePointMap && optionsOrMap["A"] !== void 0 ? { gradePointMap: optionsOrMap } : optionsOrMap || {};
    const gradePointMap = options.gradePointMap || MUJ_GRADE_POINT_MAP;
    const expectedTotalCredits = options.expectedTotalCredits ?? null;
    const detectedSemester = options.semester || null;
    const warnings = [];
    const warningDetails = [];
    const processedCourses = [];
    const seenCourseKeys = /* @__PURE__ */ new Set();
    let totalCredits = 0;
    let gradedCredits = 0;
    let totalWeightedPoints = 0;
    let hasIncompleteData = false;
    for (const raw of rawCourses) {
      if (!raw) continue;
      const courseCode = String(raw.courseCode || raw.CourseCode || raw.code || "").trim();
      const courseName = String(raw.courseName || raw.CourseName || raw.subject || raw.paper || "").trim();
      const rawCredits = raw.credits !== void 0 ? raw.credits : raw.Credits;
      const rawGrade = raw.grade ?? raw.letter ?? raw.Grade ?? raw.OfficialGrade ?? null;
      const session = String(raw.session || raw.academicSession || raw.AcademicSession || raw.semester || "").trim();
      const dedupeKey = `${courseCode.toUpperCase() || courseName.toUpperCase()}::${session.toUpperCase()}`;
      if (courseCode && seenCourseKeys.has(dedupeKey)) {
        continue;
      }
      if (courseCode) {
        seenCourseKeys.add(dedupeKey);
      }
      const isCreditValid = rawCredits !== null && rawCredits !== void 0 && String(rawCredits).trim() !== "" && Number.isFinite(Number(rawCredits)) && Number(rawCredits) >= 0;
      const credit = isCreditValid ? Number(rawCredits) : null;
      if (!isCreditValid) {
        hasIncompleteData = true;
        if (!warnings.includes("invalid_credits")) warnings.push("invalid_credits");
        warningDetails.push({
          code: "invalid_credits",
          courseCode,
          message: `Course ${courseCode || courseName || "Unknown"} has invalid credits (${rawCredits}).`
        });
        processedCourses.push({
          courseCode,
          courseName,
          credits: null,
          rawCredits,
          grade: rawGrade,
          gradePoints: null,
          weightedPoints: 0,
          excludedFromGpa: true,
          status: "invalid_credits",
          session
        });
        continue;
      }
      totalCredits += credit;
      if (rawGrade === null || rawGrade === void 0 || String(rawGrade).trim() === "") {
        hasIncompleteData = true;
        if (!warnings.includes("missing_grade")) warnings.push("missing_grade");
        warningDetails.push({
          code: "missing_grade",
          courseCode,
          message: `Course ${courseCode || courseName || "Unknown"} is missing a letter grade.`
        });
        processedCourses.push({
          courseCode,
          courseName,
          credits: credit,
          rawCredits,
          grade: null,
          gradePoints: null,
          weightedPoints: 0,
          excludedFromGpa: true,
          status: "missing_grade",
          session
        });
        continue;
      }
      const normGrade = normalizeGrade(rawGrade);
      const isNonEval = raw.excludeFromGpa || isNonEvaluativeGrade(normGrade);
      if (isNonEval) {
        processedCourses.push({
          courseCode,
          courseName,
          credits: credit,
          rawCredits,
          grade: normGrade,
          gradePoints: null,
          weightedPoints: 0,
          excludedFromGpa: true,
          isSatisfactory: normGrade === "S",
          status: "non_evaluative",
          session
        });
        continue;
      }
      const gradePoint = getGradePoint(normGrade, gradePointMap);
      if (gradePoint === void 0) {
        hasIncompleteData = true;
        if (!warnings.includes("unknown_grade")) warnings.push("unknown_grade");
        warningDetails.push({
          code: "unknown_grade",
          courseCode,
          grade: normGrade,
          message: `Course ${courseCode || courseName || "Unknown"} has unsupported grade '${normGrade}'.`
        });
        processedCourses.push({
          courseCode,
          courseName,
          credits: credit,
          rawCredits,
          grade: normGrade,
          gradePoints: null,
          weightedPoints: 0,
          excludedFromGpa: false,
          status: "unknown_grade",
          session
        });
        continue;
      }
      const courseWeightedPoints = credit * gradePoint;
      gradedCredits += credit;
      totalWeightedPoints += courseWeightedPoints;
      processedCourses.push({
        courseCode,
        courseName,
        credits: credit,
        rawCredits,
        grade: normGrade,
        gradePoints: gradePoint,
        weightedPoints: courseWeightedPoints,
        excludedFromGpa: false,
        status: "valid",
        session
      });
    }
    if (expectedTotalCredits !== null && Number.isFinite(expectedTotalCredits)) {
      if (Math.abs(totalCredits - expectedTotalCredits) > 0.01) {
        warnings.push("credit_mismatch");
        warningDetails.push({
          code: "credit_mismatch",
          message: `Calculated credits (${roundTo(totalCredits, 2)}) do not match table footer total (${expectedTotalCredits}).`
        });
      }
    }
    let status = "complete";
    if (processedCourses.length === 0 || totalCredits === 0 || gradedCredits === 0) {
      status = "incomplete";
      if (processedCourses.length === 0 && !warnings.includes("empty_courses")) warnings.push("empty_courses");
      if (gradedCredits === 0 && !warnings.includes("zero_credits")) warnings.push("zero_credits");
    } else if (hasIncompleteData) {
      status = "incomplete";
    }
    const rawSgpa = gradedCredits > 0 ? totalWeightedPoints / gradedCredits : null;
    const roundedSgpa = rawSgpa !== null ? roundTo(rawSgpa, 2) : null;
    const formula = "SGPA = \u03A3(Ci \xD7 Gi) / \u03A3Ci";
    const substitutedFormula = gradedCredits > 0 ? `SGPA = ${roundTo(totalWeightedPoints, 4)} / ${gradedCredits} = ${roundedSgpa}` : "SGPA = N/A (0 graded credits)";
    return {
      ok: status === "complete" && roundedSgpa !== null,
      sgpa: roundedSgpa,
      rawSgpa,
      totalCredits: roundTo(totalCredits, 2),
      gradedCredits: roundTo(gradedCredits, 2),
      totalWeightedPoints: roundTo(totalWeightedPoints, 4),
      courses: processedCourses,
      includedCourses: processedCourses,
      evaluatedCount: processedCourses.filter((c) => c.status === "valid").length,
      totalCount: processedCourses.length,
      status,
      warnings,
      warningDetails,
      issues: warnings,
      // backwards compatibility
      semester: detectedSemester,
      formula,
      substitutedFormula
    };
  }
  function computeSgpa(courses) {
    const result = calculateSGPA(courses);
    return {
      ok: result.ok,
      sgpa: result.sgpa,
      credits: result.totalCredits,
      gradedCredits: result.gradedCredits,
      creditPoints: result.totalWeightedPoints,
      included: result.courses.map((c) => ({
        ...c,
        letter: c.grade,
        creditPoints: c.weightedPoints
      })),
      issues: result.warnings
    };
  }

  // src/data/semester-adapter.js
  function extractSemesterContext(doc = document) {
    const grades = extractGradesFromDocument(doc);
    const summary = grades.summary || extractCgpaSummary(doc);
    const sgpa = grades.records.length ? computeSgpa(grades.records) : null;
    return {
      currentCgpa: summary.cgpa,
      completedCredits: summary.completedCredits ?? sgpa?.credits ?? null,
      currentSgpa: summary.sgpa ?? sgpa?.sgpa ?? null,
      courses: grades.records,
      source: grades.available ? "grades-table" : summary.available ? "summary-text" : "none",
      available: Boolean(summary.cgpa || summary.completedCredits || grades.records.length)
    };
  }

  // src/data/timetable-adapter.js
  function extractTimetableFromDocument(doc = document) {
    const events = [
      ...extractFromCalendarCells(doc),
      ...extractFromTables(doc)
    ];
    return {
      events,
      source: "dom",
      available: events.length > 0,
      fingerprint: fingerprint(events.map((event) => [event.title, event.start, event.end, event.room]))
    };
  }
  function analyzeSchedule(events, now = /* @__PURE__ */ new Date()) {
    const parsed = events.map((event) => ({ ...event, startDate: parseWhen(event.start), endDate: parseWhen(event.end) })).filter((event) => event.startDate).sort((a, b) => a.startDate - b.startDate);
    const current = parsed.find((event) => event.endDate && event.startDate <= now && now <= event.endDate);
    const upcoming = parsed.find((event) => event.startDate > now);
    const conflicts = findConflicts(parsed);
    const gaps = findGaps(parsed, now);
    return { current, upcoming, conflicts, gaps, parsed };
  }
  function extractFromCalendarCells(doc) {
    const cells = [...doc.querySelectorAll(".fc-event, .fc-timegrid-event, [data-event], .calendar-event")];
    return cells.map(
      (node) => normalizeEvent({
        title: textOf(node.querySelector(".fc-event-title, .title")) || textOf(node),
        start: node.getAttribute("data-start") || node.getAttribute("data-date") || "",
        end: node.getAttribute("data-end") || "",
        room: node.getAttribute("data-room") || "",
        source: "dom-calendar"
      })
    ).filter((event) => event.title && event.title !== "Event");
  }
  function extractFromTables(doc) {
    const events = [];
    for (const table of doc.querySelectorAll("table")) {
      const headers = [...table.querySelectorAll("th")].map((th) => textOf(th).toLowerCase());
      if (!headers.some((header) => /time|period|slot/.test(header))) continue;
      for (const row of table.querySelectorAll("tbody tr")) {
        const cells = [...row.cells].map((cell) => textOf(cell));
        if (cells.filter(Boolean).length < 2) continue;
        events.push(
          normalizeEvent({
            title: cells[1] || cells[0],
            start: cells.find((cell) => /\d{1,2}:\d{2}/.test(cell)) || "",
            room: cells.find((cell) => /lab|lt|room|block/i.test(cell)) || "",
            source: "dom-table"
          })
        );
      }
    }
    return events;
  }
  function parseWhen(value) {
    if (!value) return null;
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date;
    const match = String(value).match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!match) return null;
    const now = /* @__PURE__ */ new Date();
    let hours = Number(match[1]);
    const minutes = Number(match[2]);
    const ampm = match[3]?.toLowerCase();
    if (ampm === "pm" && hours < 12) hours += 12;
    if (ampm === "am" && hours === 12) hours = 0;
    now.setHours(hours, minutes, 0, 0);
    return now;
  }
  function findConflicts(events) {
    const conflicts = [];
    for (let i = 0; i < events.length; i += 1) {
      for (let j = i + 1; j < events.length; j += 1) {
        const a = events[i];
        const b = events[j];
        if (!a.endDate || !b.endDate) continue;
        if (a.startDate < b.endDate && b.startDate < a.endDate) {
          conflicts.push({ a, b });
        }
      }
    }
    return conflicts;
  }
  function findGaps(events, now) {
    const today = events.filter((event) => sameDay(event.startDate, now) && event.endDate);
    const gaps = [];
    for (let i = 0; i < today.length - 1; i += 1) {
      const minutes = (today[i + 1].startDate - today[i].endDate) / 6e4;
      if (minutes >= 15) {
        gaps.push({ after: today[i], before: today[i + 1], minutes: Math.round(minutes) });
      }
    }
    return gaps;
  }
  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  // src/ui/components/grades/grade-sheet.js
  function enhanceGradeSheet({
    table,
    records,
    totalCreditsFromFooter,
    headerRow,
    allRows,
    headerRowIndex,
    session
  }) {
    if (!table || !records || !records.length) return () => {
    };
    if (table.querySelector(`[${INJECT_ATTR}="grade-points"]`)) {
      return () => {
      };
    }
    const officialRecords = records.map((r) => ({ ...r }));
    let workingRecords = records.map((r) => ({ ...r }));
    let isPredictMode = false;
    let isBreakdownOpen = false;
    const theadRows = table.querySelectorAll("thead tr");
    const actualHeaderRow = headerRow || (theadRows.length ? theadRows[theadRows.length - 1] : table.rows[0]);
    if (!actualHeaderRow) return () => {
    };
    const rowsPool = allRows && allRows.length ? allRows.slice((headerRowIndex ?? 0) + 1) : table.tBodies.length ? [...table.tBodies].flatMap((body) => [...body.rows]) : [...table.rows].slice(1);
    const courseRows = [];
    let totalRow = null;
    for (const row of rowsPool) {
      if (row === actualHeaderRow) continue;
      const text = (row.textContent || "").toLowerCase();
      if (text.includes("total")) {
        totalRow = row;
      } else if (row.cells && row.cells.length >= 3) {
        courseRows.push(row);
      }
    }
    document.querySelectorAll(`[${INJECT_ATTR}="grade-banner"]`).forEach((b) => b.remove());
    const container = document.createElement("div");
    container.className = "mujx-grade-banner";
    container.setAttribute(INJECT_ATTR, "grade-banner");
    const insertTarget = table.closest(".table-responsive, .table-scrollable") || table;
    insertTarget.parentNode?.insertBefore(container, insertTarget);
    const isTh = Boolean(actualHeaderRow.querySelector("th"));
    const thGp = document.createElement(isTh ? "th" : "td");
    thGp.textContent = "Pts (Gi)";
    thGp.setAttribute(INJECT_ATTR, "grade-points");
    thGp.title = "Grade Points corresponding to letter grade";
    thGp.style.fontWeight = "700";
    thGp.style.textAlign = "center";
    actualHeaderRow.append(thGp);
    const thCp = document.createElement(isTh ? "th" : "td");
    thCp.textContent = "Ci \xD7 Gi";
    thCp.setAttribute(INJECT_ATTR, "credit-points");
    thCp.title = "Credit Points = Course Credits \xD7 Grade Points (MUJ Formula)";
    thCp.style.fontWeight = "700";
    thCp.style.textAlign = "center";
    actualHeaderRow.append(thCp);
    const tdCells = [];
    courseRows.forEach((row, i) => {
      const tdGp = document.createElement("td");
      tdGp.setAttribute(INJECT_ATTR, "grade-points");
      tdGp.style.textAlign = "center";
      tdGp.style.fontWeight = "600";
      row.append(tdGp);
      const tdCp = document.createElement("td");
      tdCp.setAttribute(INJECT_ATTR, "credit-points");
      tdCp.style.textAlign = "center";
      tdCp.style.fontWeight = "600";
      row.append(tdCp);
      tdCells.push({ row, index: i, tdGp, tdCp });
    });
    let totalTdGp = null;
    let totalTdCp = null;
    if (totalRow) {
      totalTdGp = document.createElement("td");
      totalTdGp.setAttribute(INJECT_ATTR, "grade-points");
      totalTdGp.style.textAlign = "center";
      totalRow.append(totalTdGp);
      totalTdCp = document.createElement("td");
      totalTdCp.setAttribute(INJECT_ATTR, "credit-points");
      totalTdCp.style.textAlign = "center";
      totalRow.append(totalTdCp);
    }
    const originalGradeCells = courseRows.map((row) => {
      const cells = [...row.cells].filter((c) => !c.hasAttribute(INJECT_ATTR));
      return cells[cells.length - 1];
    });
    const originalGradeHtmls = originalGradeCells.map((c) => c?.innerHTML || "");
    const detectedSession = session || records.find((r) => r.session)?.session || records.find((r) => r.semester)?.semester || detectSemesterFromDOM(table.ownerDocument || document) || "Semester not identified";
    function render() {
      const calculation = calculateSGPA(workingRecords, {
        expectedTotalCredits: totalCreditsFromFooter,
        semester: detectedSession
      });
      const isModified = workingRecords.some((r, i) => r.letter !== officialRecords[i].letter);
      const sgpaText = calculation.sgpa !== null ? calculation.sgpa.toFixed(2) : "\u2014";
      const statusLabel = calculation.status === "complete" ? "\u2713 Complete" : calculation.status === "provisional" ? "Provisional" : "\u26A0 Incomplete";
      const hasCreditMismatch = calculation.warnings.includes("credit_mismatch");
      const nonEvalCourses = calculation.courses.filter((c) => c.status === "non_evaluative");
      container.innerHTML = `
      <!-- 1. Compact Summary Strip -->
      <div class="mujx-grade-banner-main">
        <div class="mujx-grade-sgpa-pill">
          <span class="mujx-grade-sgpa-label">
            ${isModified ? "PREDICTED SGPA" : "OFFICIAL SGPA"}
            ${detectedSession ? `\xB7 ${escapeHtml(detectedSession)}` : ""}
          </span>
          <span class="mujx-grade-sgpa-value">${sgpaText}</span>
        </div>

        <div class="mujx-grade-stats">
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalCredits}</span>
            <span class="mujx-stat-lbl">Total Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.gradedCredits}</span>
            <span class="mujx-stat-lbl">Graded Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalWeightedPoints}</span>
            <span class="mujx-stat-lbl">Points (\u03A3 Ci\xD7Gi)</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalCount}</span>
            <span class="mujx-stat-lbl">Courses</span>
          </div>
        </div>

        <div class="mujx-grade-actions">
          <span class="mujx-chip ${calculation.status === "complete" ? "safe" : "danger"}" style="font-size:11px; padding:3px 8px;">
            ${statusLabel}
          </span>
          <button type="button" class="mujx-calc-toggle-btn" data-role="toggle-breakdown" style="padding:6px 11px; font-size:11.5px; border-radius:6px; cursor:pointer; background:rgba(13, 148, 136, 0.15); border:1px solid rgba(13, 148, 136, 0.4); color:inherit; font-weight:600;">
            ${isBreakdownOpen ? "\u2715 Hide calculation" : "\u{1F50D} View calculation"}
          </button>
          <button type="button" class="mujx-pred-btn ${isPredictMode ? "active" : ""}" data-role="toggle-pred" style="padding:6px 12px; font-size:11.5px;">
            ${isPredictMode ? "\u2713 Done Simulating" : "\u{1F3AF} Predict SGPA"}
          </button>
          <button type="button" class="mujx-reset-btn" data-role="reset-pred" ${isModified ? "" : "hidden"} style="padding:6px 10px; font-size:11.5px;">
            \u21BA Reset Official
          </button>
        </div>
      </div>

      <!-- Warnings / Discrepancy Alert -->
      ${hasCreditMismatch ? `<div class="mujx-warning-strip" style="background:rgba(245, 158, 11, 0.12); border:1px solid rgba(245, 158, 11, 0.35); border-radius:6px; padding:6px 12px; font-size:12px; color:#d97706; display:flex; align-items:center; gap:8px;">
              <span>\u26A0\uFE0F</span>
              <span><strong>Credit Discrepancy:</strong> Sum of parsed course credits (${calculation.totalCredits}) does not match the table footer Total (${totalCreditsFromFooter}). Both values are preserved.</span>
            </div>` : ""}

      <!-- 2. Course-wise Expandable Breakdown Section (shown when View calculation is clicked) -->
      <div class="mujx-grade-breakdown" data-role="breakdown-section" ${isBreakdownOpen ? "" : "hidden"} style="background:rgba(0,0,0,0.22); border:1px solid rgba(125,125,125,0.25); border-radius:8px; padding:12px 14px; margin-top:6px; box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-weight:700; font-size:13px; color:var(--mujx-accent, #2dd4bf);">
            Course-Wise Calculation Breakdown (${escapeHtml(detectedSession)})
          </div>
          <div style="font-size:11px; opacity:0.75;">
            Formula: <strong>SGPA = \u03A3(Ci \xD7 Gi) / \u03A3Ci</strong>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table class="mujx-breakdown-table" style="width:100%; border-collapse:collapse; font-size:11.5px; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid rgba(125,125,125,0.3); opacity:0.85;">
                <th style="padding:4px 8px;">Course Code</th>
                <th style="padding:4px 8px;">Course Name</th>
                <th style="padding:4px 8px; text-align:center;">Credits (Ci)</th>
                <th style="padding:4px 8px; text-align:center;">Grade</th>
                <th style="padding:4px 8px; text-align:center;">Grade Points (Gi)</th>
                <th style="padding:4px 8px; text-align:right;">Weighted (Ci \xD7 Gi)</th>
              </tr>
            </thead>
            <tbody>
              ${calculation.courses.map((c) => {
        const isNonEval = c.status === "non_evaluative";
        const isBad = c.status === "invalid_credits" || c.status === "unknown_grade" || c.status === "missing_grade";
        const gpText = isNonEval ? "\u2014" : isBad ? "Unresolved" : c.gradePoints !== null ? c.gradePoints : "\u2014";
        const wpText = isNonEval ? `<span style="opacity:0.7; font-size:11px;">Satisfactory (Audit)</span>` : isBad ? `<span style="color:#ef4444;">Flagged</span>` : c.weightedPoints;
        return `
                    <tr style="border-bottom:1px solid rgba(125,125,125,0.12);">
                      <td style="padding:4px 8px; font-weight:600;">${escapeHtml(c.courseCode || "\u2014")}</td>
                      <td style="padding:4px 8px;">${escapeHtml(c.courseName || "\u2014")}</td>
                      <td style="padding:4px 8px; text-align:center;">${c.credits !== null ? c.credits : "\u2014"}</td>
                      <td style="padding:4px 8px; text-align:center; font-weight:700;">${escapeHtml(c.grade || "\u2014")}</td>
                      <td style="padding:4px 8px; text-align:center;">${gpText}</td>
                      <td style="padding:4px 8px; text-align:right; font-weight:600;">${wpText}</td>
                    </tr>
                  `;
      }).join("")}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid rgba(125,125,125,0.4); font-weight:700;">
                <td colspan="2" style="padding:6px 8px;">Totals (Evaluated: ${calculation.evaluatedCount} / Total: ${calculation.totalCount} courses)</td>
                <td style="padding:6px 8px; text-align:center;">${calculation.totalCredits} (Graded: ${calculation.gradedCredits})</td>
                <td colspan="2" style="padding:6px 8px; text-align:right;">Total Weighted Points (\u03A3 Ci\xD7Gi):</td>
                <td style="padding:6px 8px; text-align:right; color:var(--mujx-accent, #2dd4bf);">${calculation.totalWeightedPoints}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="margin-top:10px; padding-top:8px; border-top:1px dashed rgba(125,125,125,0.25); display:flex; flex-direction:column; gap:4px; font-size:11.5px;">
          <div>
            <strong>Substituted Identity:</strong>
            <code>${escapeHtml(calculation.substitutedFormula)}</code>
          </div>
          ${nonEvalCourses.length ? `<div style="opacity:0.85; color:#0d9488;">
                  \u2139\uFE0F <strong>Non-Evaluative Courses:</strong> ${nonEvalCourses.map((c) => `${escapeHtml(c.courseCode)} (${c.credits} cr, Grade '${escapeHtml(c.grade)}')`).join(", ")} fulfill degree requirements but do not carry grade points and are excluded from the GPA credit divisor per MUJ regulations.
                </div>` : ""}
        </div>
      </div>
    `;
      container.querySelector("[data-role=toggle-breakdown]")?.addEventListener("click", () => {
        isBreakdownOpen = !isBreakdownOpen;
        const bSec = container.querySelector("[data-role=breakdown-section]");
        if (bSec) bSec.hidden = !isBreakdownOpen;
        const tBtn = container.querySelector("[data-role=toggle-breakdown]");
        if (tBtn) tBtn.textContent = isBreakdownOpen ? "\u2715 Hide calculation" : "\u{1F50D} View calculation";
      });
      container.querySelector("[data-role=toggle-pred]")?.addEventListener("click", () => {
        isPredictMode = !isPredictMode;
        updateGradeCells();
        render();
      });
      container.querySelector("[data-role=reset-pred]")?.addEventListener("click", () => {
        workingRecords = officialRecords.map((r) => ({ ...r }));
        updateGradeCells();
        render();
      });
      tdCells.forEach(({ index, tdGp, tdCp }) => {
        const rec = workingRecords[index];
        const inc = calculation.courses.find((_, i) => i === index) || {};
        const gp = inc.gradePoints;
        const cp = inc.weightedPoints;
        if (inc.status === "non_evaluative") {
          tdGp.innerHTML = `<span style="opacity:0.75; font-size:11.5px;">Satisfactory</span>`;
          tdCp.innerHTML = `<span style="opacity:0.6;">\u2014</span>`;
        } else if (gp !== null && gp !== void 0) {
          tdGp.textContent = String(gp);
          tdCp.textContent = String(cp);
        } else {
          tdGp.textContent = "\u2014";
          tdCp.textContent = "\u2014";
        }
      });
      if (totalRow) {
        if (totalTdGp) {
          totalTdGp.innerHTML = `<span style="font-size:11px; opacity:0.8;">Total Points:</span>`;
        }
        if (totalTdCp) {
          totalTdCp.innerHTML = `
          <div style="font-weight:700;">${calculation.totalWeightedPoints}</div>
          <div class="mujx-sgpa-table-badge" style="margin-top:2px;">SGPA: ${sgpaText}</div>
        `;
        }
      }
    }
    function updateGradeCells() {
      originalGradeCells.forEach((cell, i) => {
        if (!cell) return;
        if (isPredictMode) {
          const curLetter = workingRecords[i].letter || "";
          const options = ["A+", "A", "B", "C", "D", "E", "F", "S"];
          cell.innerHTML = `
          <select class="mujx-grade-select" data-grade-idx="${i}">
            ${options.map(
            (opt) => `<option value="${opt}" ${opt === curLetter ? "selected" : ""}>${opt}${opt === "S" ? " (Satisfactory)" : ` (${gradePointForLetter(opt)})`}</option>`
          ).join("")}
          </select>
        `;
          const select = cell.querySelector("select");
          select?.addEventListener("change", (e) => {
            workingRecords[i].letter = e.target.value;
            render();
          });
        } else {
          cell.innerHTML = originalGradeHtmls[i];
        }
      });
    }
    render();
    return () => {
      container.remove();
      thGp.remove();
      thCp.remove();
      tdCells.forEach(({ tdGp, tdCp }) => {
        tdGp.remove();
        tdCp.remove();
      });
      totalTdGp?.remove();
      totalTdCp?.remove();
      originalGradeCells.forEach((cell, i) => {
        if (cell) cell.innerHTML = originalGradeHtmls[i];
      });
    };
  }
  function detectSemesterFromDOM(doc = document) {
    const selects = doc.querySelectorAll("select");
    for (const sel of selects) {
      const selectedOption = sel.options[sel.selectedIndex];
      if (selectedOption) {
        const text = selectedOption.textContent.trim();
        if (/^(?:sem|semester|[ivx]+|\d+)/i.test(text)) {
          return `Semester ${text}`;
        }
      }
    }
    const breadcrumbs = doc.querySelectorAll(".breadcrumb, .page-title, h1, h2, h3, h4");
    for (const el of breadcrumbs) {
      const text = el.textContent.trim();
      const match = text.match(/(JAN-MAY\s*\d{4}|JUL-NOV\s*\d{4}|Semester\s*[\dIVX]+)/i);
      if (match) return match[1].toUpperCase();
    }
    return null;
  }

  // src/calculations/target-cgpa.js
  function planTargetCgpa({
    currentCgpa,
    completedCredits,
    targetCgpa,
    remainingCredits,
    remainingSemesters = [],
    gradeCap = 10
  }) {
    const issues = [];
    if (!Number.isFinite(currentCgpa) || currentCgpa < 0) issues.push("invalid_cgpa");
    if (!Number.isFinite(completedCredits) || completedCredits < 0) issues.push("invalid_completed_credits");
    if (!Number.isFinite(targetCgpa) || targetCgpa < 0) issues.push("invalid_target");
    if (!Number.isFinite(remainingCredits) || remainingCredits < 0) issues.push("invalid_remaining_credits");
    if (!Number.isFinite(gradeCap) || gradeCap <= 0) issues.push("invalid_grade_cap");
    if (issues.length) return { ok: false, issues };
    const totalCredits = completedCredits + remainingCredits;
    const currentPoints = currentCgpa * completedCredits;
    const maxPoints = currentPoints + remainingCredits * gradeCap;
    const maxCgpa = totalCredits > 0 ? roundTo(maxPoints / totalCredits, 2) : currentCgpa;
    const minPoints = currentPoints;
    const minCgpa = totalCredits > 0 ? roundTo(minPoints / totalCredits, 2) : currentCgpa;
    if (remainingCredits === 0) {
      const met = roundTo(currentCgpa, 2) >= roundTo(targetCgpa, 2);
      return {
        ok: true,
        requiredAverageSgpa: null,
        feasible: met,
        reason: met ? "already_met" : "no_remaining_credits",
        maxCgpa: roundTo(currentCgpa, 2),
        minCgpa: roundTo(currentCgpa, 2),
        explanation: met ? "No remaining credits. The current CGPA already meets the target." : "No remaining credits, so CGPA cannot change.",
        issues,
        bySemester: []
      };
    }
    const requiredAverageSgpa = (targetCgpa * totalCredits - currentPoints) / remainingCredits;
    const roundedRequired = roundTo(requiredAverageSgpa, 2);
    const feasible = requiredAverageSgpa <= gradeCap + 1e-9 && requiredAverageSgpa >= 0;
    let reason = "feasible";
    if (requiredAverageSgpa > gradeCap) reason = "impossible_above_cap";
    if (requiredAverageSgpa < 0) reason = "already_above_target";
    const bySemester = distributeRequired(remainingSemesters, requiredAverageSgpa, remainingCredits, gradeCap);
    return {
      ok: true,
      requiredAverageSgpa: roundedRequired,
      feasible: feasible || reason === "already_above_target",
      reason,
      maxCgpa,
      minCgpa,
      totalCredits: roundTo(totalCredits, 2),
      remainingCredits: roundTo(remainingCredits, 2),
      bySemester,
      explanation: buildExplanation({
        targetCgpa,
        currentCgpa,
        completedCredits,
        remainingCredits,
        requiredAverageSgpa: roundedRequired,
        gradeCap,
        reason,
        maxCgpa
      }),
      issues
    };
  }
  function distributeRequired(semesters, requiredAverage, remainingCredits, gradeCap) {
    if (!semesters?.length) {
      return [
        {
          label: "Remaining work",
          credits: roundTo(remainingCredits, 2),
          requiredSgpa: roundTo(requiredAverage, 2)
        }
      ];
    }
    return semesters.map((semester, index) => ({
      label: semester.label || `Remaining ${index + 1}`,
      credits: roundTo(Number(semester.credits) || 0, 2),
      requiredSgpa: roundTo(Math.min(gradeCap, Math.max(0, requiredAverage)), 2),
      note: "Equal-SGPA plan. Different semester loads still use the credit-weighted required average."
    }));
  }
  function buildExplanation({
    targetCgpa,
    currentCgpa,
    completedCredits,
    remainingCredits,
    requiredAverageSgpa,
    gradeCap,
    reason,
    maxCgpa
  }) {
    const formula = `Required SGPA = [Target CGPA \xD7 (Completed + Remaining) \u2212 Current CGPA \xD7 Completed] / Remaining = ${requiredAverageSgpa}`;
    if (reason === "impossible_above_cap") {
      return `${formula}. This exceeds the grade cap of ${gradeCap}. Maximum achievable CGPA under these credits is ${maxCgpa}.`;
    }
    if (reason === "already_above_target") {
      return `${formula}. The target is already at or below the current trajectory; any non-negative remaining performance keeps you above it only if the required average is not forced negative. Current CGPA is ${currentCgpa}.`;
    }
    return `${formula}. This is a credit-weighted plan, not a simple average of semester GPAs.`;
  }

  // src/calculations/attendance.js
  function validateCounts(present, total) {
    const issues = [];
    if (!Number.isFinite(present) || present < 0) issues.push("invalid_present");
    if (!Number.isFinite(total) || total < 0) issues.push("invalid_total");
    if (Number.isFinite(present) && Number.isFinite(total) && present > total) {
      issues.push("present_exceeds_total");
    }
    return issues;
  }
  function attendancePercent(present, total) {
    const issues = validateCounts(present, total);
    if (issues.includes("invalid_present") || issues.includes("invalid_total")) {
      return { ok: false, percent: null, issues };
    }
    if (total === 0) {
      return { ok: false, percent: null, issues: [...issues, "zero_total"] };
    }
    return {
      ok: true,
      percent: roundTo(present / total * 100, 2),
      issues
    };
  }
  function normalizeThreshold(thresholdPercent) {
    if (!Number.isFinite(thresholdPercent)) return null;
    if (thresholdPercent <= 0 || thresholdPercent > 100) return null;
    return thresholdPercent / 100;
  }
  function safeSkips(present, total, thresholdPercent) {
    const issues = validateCounts(present, total);
    const t = normalizeThreshold(thresholdPercent);
    if (t === null) return { ok: false, skips: null, issues: [...issues, "invalid_threshold"] };
    if (issues.includes("invalid_present") || issues.includes("invalid_total")) {
      return { ok: false, skips: null, issues };
    }
    if (total === 0) return { ok: false, skips: null, issues: [...issues, "zero_total"] };
    if (present / total < t) return { ok: true, skips: 0, issues, reason: "already_below_threshold" };
    const raw = present / t - total;
    const skips = Math.max(0, Math.floor(raw + 1e-9));
    return { ok: true, skips, issues };
  }
  function classesNeeded(present, total, thresholdPercent) {
    const issues = validateCounts(present, total);
    const t = normalizeThreshold(thresholdPercent);
    if (t === null) return { ok: false, needed: null, issues: [...issues, "invalid_threshold"] };
    if (issues.includes("invalid_present") || issues.includes("invalid_total")) {
      return { ok: false, needed: null, issues };
    }
    if (t === 1) {
      if (total === 0) return { ok: true, needed: 1, issues, reason: "perfect_attendance_required" };
      return {
        ok: true,
        needed: present === total ? 0 : null,
        issues,
        reason: present === total ? "already_met" : "impossible_unless_all_present"
      };
    }
    if (total === 0) {
      return { ok: true, needed: 0, issues, reason: "no_classes_yet" };
    }
    if (present / total >= t) return { ok: true, needed: 0, issues, reason: "already_met" };
    const needed = Math.ceil((t * total - present) / (1 - t) - 1e-9);
    return { ok: true, needed: Math.max(0, needed), issues };
  }
  function simulateFuture(present, total, attend, miss, thresholdPercent) {
    const issues = validateCounts(present, total);
    if (!Number.isInteger(attend) || attend < 0) issues.push("invalid_attend");
    if (!Number.isInteger(miss) || miss < 0) issues.push("invalid_miss");
    const nextPresent = present + attend;
    const nextTotal = total + attend + miss;
    const percent = attendancePercent(nextPresent, nextTotal);
    const skips = safeSkips(nextPresent, nextTotal, thresholdPercent);
    const needed = classesNeeded(nextPresent, nextTotal, thresholdPercent);
    return {
      ok: percent.ok,
      present: nextPresent,
      total: nextTotal,
      percent: percent.percent,
      safeSkips: skips.skips,
      classesNeeded: needed.needed,
      issues: [...issues, ...percent.issues],
      assumption: "Future classes are hypothetical. Actual scheduling is unknown."
    };
  }
  function consecutiveRecovery(present, total, thresholdPercent) {
    const needed = classesNeeded(present, total, thresholdPercent);
    if (!needed.ok) return needed;
    return {
      ...needed,
      explanation: needed.needed === 0 ? "Threshold already met." : `Attend the next ${needed.needed} class${needed.needed === 1 ? "" : "es"} in a row (assuming no additional misses).`
    };
  }
  function classifyStatus(percent, thresholdPercent, borderlineBand = 5) {
    if (!Number.isFinite(percent) || !Number.isFinite(thresholdPercent)) {
      return { code: "unknown", label: "Unknown" };
    }
    if (percent >= thresholdPercent) {
      if (percent < thresholdPercent + borderlineBand) {
        return { code: "borderline", label: "Borderline" };
      }
      return { code: "safe", label: "On track" };
    }
    if (percent >= thresholdPercent - borderlineBand) {
      return { code: "borderline", label: "At risk" };
    }
    return { code: "low", label: "Low" };
  }
  function enhanceRecord(record, thresholdPercent, borderlineBand = 5) {
    const present = Number(record.present);
    const total = Number(record.total);
    const percent = attendancePercent(present, total);
    const skips = safeSkips(present, total, thresholdPercent);
    const needed = classesNeeded(present, total, thresholdPercent);
    const status = classifyStatus(percent.percent, thresholdPercent, borderlineBand);
    return {
      ...record,
      percent: percent.percent ?? record.percent ?? null,
      safeSkips: skips.skips,
      classesNeeded: needed.needed,
      status,
      issues: [.../* @__PURE__ */ new Set([...percent.issues || [], ...skips.issues || [], ...needed.issues || []])]
    };
  }

  // src/ui/components/attendance/panel.js
  function renderAttendancePanel({ records, threshold, borderlineBand, wrap }) {
    const enhanced = records.map((record) => enhanceRecord(record, threshold, borderlineBand));
    const safeCourses = enhanced.filter((r) => r.status.code === "safe");
    const borderlineCourses = enhanced.filter((r) => r.status.code === "borderline");
    const lowCourses = enhanced.filter((r) => r.status.code === "low");
    const sumPresent = records.reduce((acc, r) => acc + (Number(r.present) || 0), 0);
    const sumTotal = records.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
    const overall = attendancePercent(sumPresent, sumTotal);
    wrap.innerHTML = `
    <div style="padding:4px 0;">
      <h3 class="mujx-title" style="font-size:15px; margin-bottom:6px;">Attendance Summary & What-If Simulation</h3>
      <p class="mujx-sub" style="font-size:12px; margin-bottom:12px;">
        Overall: <strong>${overall.percent !== null ? `${overall.percent}%` : "\u2014"}</strong> (${sumPresent}/${sumTotal} classes) \xB7 
        <span style="color:var(--mujx-ok);">${safeCourses.length} Safe</span> \xB7 
        <span style="color:var(--mujx-warn);">${borderlineCourses.length} At Risk</span> \xB7 
        <span style="color:var(--mujx-bad);">${lowCourses.length} Critical</span>
      </p>

      <div class="mujx-row" style="margin-bottom:12px;">
        <label class="mujx-sub">Subject
          <select class="mujx-select" data-role="sim-subject">
            <option value="__all__">All Courses (${enhanced.length})</option>
            ${enhanced.map((r, i) => `<option value="${i}">${escapeHtml(r.subject)} (${r.percent}%)</option>`).join("")}
          </select>
        </label>
        <label class="mujx-sub">Classes to attend
          <input class="mujx-input" type="number" min="0" max="60" value="0" data-role="sim-attend" style="width:75px;">
        </label>
        <label class="mujx-sub">Classes to miss
          <input class="mujx-input" type="number" min="0" max="60" value="1" data-role="sim-miss" style="width:75px;">
        </label>
      </div>

      <div data-role="sim-out"></div>
    </div>
  `;
    const subSelect = wrap.querySelector("[data-role=sim-subject]");
    const attendInput = wrap.querySelector("[data-role=sim-attend]");
    const missInput = wrap.querySelector("[data-role=sim-miss]");
    const outEl = wrap.querySelector("[data-role=sim-out]");
    const updateSimulation = () => {
      const attend = Math.max(0, Math.floor(Number(attendInput.value) || 0));
      const miss = Math.max(0, Math.floor(Number(missInput.value) || 0));
      const selVal = subSelect.value;
      const subjectsToSimulate = selVal === "__all__" ? enhanced : [enhanced[Number(selVal)]].filter(Boolean);
      const rows = subjectsToSimulate.map((record) => {
        const sim = simulateFuture(Number(record.present) || 0, Number(record.total) || 0, attend, miss, threshold);
        const newStatus = classifyStatus(sim.percent, threshold, borderlineBand);
        return `
        <tr>
          <td><strong>${escapeHtml(record.subject)}</strong></td>
          <td>${record.percent ?? "\u2014"}%</td>
          <td>${sim.present} / ${sim.total}</td>
          <td><strong style="color:${sim.percent >= threshold ? "var(--mujx-ok)" : "var(--mujx-bad)"}">${sim.percent ?? "\u2014"}%</strong></td>
          <td><span class="mujx-chip ${newStatus.code}">${escapeHtml(newStatus.label)}</span></td>
          <td>${sim.safeSkips > 0 ? `<span class="mujx-skips-badge">+${sim.safeSkips} safe</span>` : `<span class="mujx-needed-badge">Need ${sim.classesNeeded}</span>`}</td>
        </tr>
      `;
      });
      outEl.innerHTML = `
      <table class="mujx-table">
        <thead>
          <tr>
            <th>Course</th>
            <th>Current %</th>
            <th>Projected</th>
            <th>Projected %</th>
            <th>Status</th>
            <th>Skips / Needed</th>
          </tr>
        </thead>
        <tbody>
          ${rows.join("")}
        </tbody>
      </table>
      <p class="mujx-note" style="margin-top:6px;">* Simulated trajectory assuming you attend next ${attend} and miss next ${miss} classes.</p>
    `;
    };
    subSelect?.addEventListener("change", updateSimulation);
    attendInput?.addEventListener("input", updateSimulation);
    missInput?.addEventListener("input", updateSimulation);
    updateSimulation();
    return enhanced;
  }
  function renderAttendanceCell(td, record, threshold, borderlineBand) {
    const enhanced = enhanceRecord(record, threshold, borderlineBand);
    const recovery = consecutiveRecovery(record.present, record.total, threshold);
    const status = enhanced.status || classifyStatus(enhanced.percent, threshold, borderlineBand);
    let splitHtml = "";
    if (record.theoryTotal || record.practicalTotal) {
      const parts = [];
      if (record.theoryTotal) {
        const tPct = record.theoryPresent !== null ? Math.round(record.theoryPresent / record.theoryTotal * 100) : null;
        parts.push(`Theory: ${tPct !== null ? `${tPct}%` : "\u2014"}`);
      }
      if (record.practicalTotal) {
        const pPct = record.practicalPresent !== null ? Math.round(record.practicalPresent / record.practicalTotal * 100) : null;
        parts.push(`Lab: ${pPct !== null ? `${pPct}%` : "\u2014"}`);
      }
      if (parts.length) {
        splitHtml = `<div class="mujx-intel-sub" style="font-size:10.5px; color:#64748b;">${parts.join(" \xB7 ")}</div>`;
      }
    }
    const tooltip = enhanced.safeSkips > 0 ? `Safe Skips: ${enhanced.safeSkips} | Attended: ${record.present}/${record.total} (${enhanced.percent}%) | Target: ${threshold}%` : enhanced.classesNeeded > 0 ? `Recovery: Need ${enhanced.classesNeeded} consecutive classes | Attended: ${record.present}/${record.total} (${enhanced.percent}%)` : `At ${threshold}% Cutoff`;
    td.innerHTML = `
    <div class="mujx-intel-cell" title="${escapeHtml(tooltip)}">
      <div class="mujx-intel-top" style="display:flex; align-items:center; gap:6px;">
        <span class="mujx-chip ${status.code}" style="font-size:11px; padding:1px 7px;">${escapeHtml(status.label)}</span>
        ${enhanced.safeSkips > 0 ? `<span class="mujx-skips-badge" style="font-size:11px; font-weight:700;">+${enhanced.safeSkips} skip${enhanced.safeSkips === 1 ? "" : "s"}</span>` : enhanced.classesNeeded > 0 ? `<span class="mujx-needed-badge" style="font-size:11px; font-weight:700;">Need ${enhanced.classesNeeded}</span>` : `<span class="mujx-skips-badge" style="background:#f1f5f9; color:#475569; font-size:11px;">At cutoff</span>`}
      </div>
      <div class="mujx-intel-sub" style="font-size:11px; color:#64748b;">${escapeHtml(recovery.explanation || "")}</div>
      ${splitHtml}
    </div>
  `;
  }

  // src/calculations/marks.js
  function sumAssessments(assessments) {
    const issues = [];
    let obtained = 0;
    let maximum = 0;
    let counted = 0;
    for (const item of assessments || []) {
      const score = toScore(item.obtained);
      const max = toScore(item.maximum);
      if (score === null && item.obtained !== 0) {
        issues.push("missing_score");
        continue;
      }
      if (max === null || max <= 0) {
        issues.push("invalid_maximum");
        continue;
      }
      if (score < 0) {
        issues.push("negative_score");
        continue;
      }
      obtained += score;
      maximum += max;
      counted += 1;
    }
    return {
      ok: counted > 0,
      obtained: roundTo(obtained, 2),
      maximum: roundTo(maximum, 2),
      percent: maximum > 0 ? roundTo(obtained / maximum * 100, 2) : null,
      counted,
      issues
    };
  }
  function weightedTotal(components) {
    const issues = [];
    let weighted = 0;
    let weightSum = 0;
    for (const component of components || []) {
      const score = toScore(component.obtained);
      const max = toScore(component.maximum);
      const weight = toScore(component.weight);
      if (score === null || max === null || max <= 0 || weight === null || weight < 0) {
        issues.push("invalid_component");
        continue;
      }
      weighted += score / max * weight;
      weightSum += weight;
    }
    return {
      ok: weightSum > 0,
      weighted: roundTo(weighted, 2),
      weightSum: roundTo(weightSum, 2),
      issues
    };
  }
  function requiredScore({ obtained, remainingMax, targetTotal, currentMax = 0 }) {
    const issues = [];
    if (![obtained, remainingMax, targetTotal].every(Number.isFinite)) {
      return { ok: false, required: null, issues: ["invalid_input"] };
    }
    if (remainingMax < 0) issues.push("invalid_remaining");
    const already = obtained + currentMax;
    if (remainingMax === 0) {
      return {
        ok: true,
        required: null,
        alreadyMet: already >= targetTotal,
        impossible: already < targetTotal,
        issues
      };
    }
    const required = targetTotal - obtained;
    return {
      ok: true,
      required: roundTo(required, 2),
      alreadyMet: required <= 0,
      impossible: required > remainingMax,
      percentOfRemaining: remainingMax > 0 ? roundTo(Math.max(required, 0) / remainingMax * 100, 2) : null,
      issues
    };
  }
  function applyHypothetical(official, hypothetical) {
    const merged = (official || []).map((item) => {
      const override = (hypothetical || []).find((row) => row.id === item.id);
      if (!override || override.obtained === "" || override.obtained === null || override.obtained === void 0) {
        return { ...item, source: "official" };
      }
      return {
        ...item,
        obtained: toScore(override.obtained),
        source: "simulated"
      };
    });
    return merged;
  }
  function toScore(value) {
    if (value === null || value === void 0 || value === "") return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }

  // src/ui/components/marks/panel.js
  var DEFAULT_GRADE_TARGETS = [
    { label: "Grade A+ (90%)", minPct: 90 },
    { label: "Grade A (80%)", minPct: 80 },
    { label: "Grade B (70%)", minPct: 70 },
    { label: "Grade C (60%)", minPct: 60 },
    { label: "Grade D (50%)", minPct: 50 },
    { label: "Pass Floor (40%)", minPct: 40 }
  ];
  function renderMarksPanel({ records, wrap, weights, creditsBySubject = {}, startExpanded = false }) {
    const groups = groupMarksBySubject(records);
    const groupState = groups.map((group) => ({
      credits: creditsBySubject[group.subject] || 3,
      targetMinPct: 70,
      // Default target Grade B
      eteMax: 40
    }));
    wrap.innerHTML = `
    <div class="mujx-inline-bar" aria-label="Marks intelligence bar">
      <div class="mujx-inline-bar-left">
        <span class="mujx-kicker"><span class="mujx-kicker-dot"></span> MUJX Intel</span>
        <strong style="color:var(--mujx-accent);">Estimated SGPA: <span data-role="inline-sgpa-val">\u2014</span></strong>
        <span class="mujx-sub" style="margin:0;">(${groups.length} subjects tracked)</span>
        <span class="mujx-chip safe" style="font-size:11px; padding:1px 7px;">Credit-Weighted</span>
      </div>
      <div class="mujx-inline-bar-right">
        <button class="mujx-btn secondary" type="button" data-role="toggle-marks-btn" style="padding:4px 9px; font-size:11.5px;">
          \u{1F52E} What-If Simulator <span data-role="marks-chevron">${startExpanded ? "\u25B4" : "\u25BE"}</span>
        </button>
      </div>
    </div>

    <section class="mujx-card" data-role="marks-container" aria-label="Marks and SGPA predictor" style="margin-top:0; margin-bottom:16px;" ${startExpanded ? "" : "hidden"}>
      <div class="mujx-head">
        <div>
          <div class="mujx-kicker"><span class="mujx-kicker-dot"></span> Marks & SGPA Predictor</div>
          <h2 class="mujx-title" style="font-size:16px;">Course Assessment & SGPA Estimation</h2>
          <p class="mujx-sub">Official marks are preserved in the portal. Enter what-if scores below to simulate your final course grade and SGPA.</p>
        </div>
        <button class="mujx-btn secondary" type="button" data-role="reset-all" style="padding:5px 10px; font-size:12px;">\u21BA Reset</button>
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
            <b data-role="sgpa-val" style="font-size:22px; color:var(--mujx-accent); display:block;">\u2014</b>
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
        chevron.textContent = "\u25B4";
      } else {
        marksContainer.setAttribute("hidden", "");
        chevron.textContent = "\u25BE";
      }
    });
    const paintGroups = () => {
      container.innerHTML = groups.map((group, gi) => {
        const official = sumAssessments(group.items);
        const state = groupState[gi];
        return `
          <article class="mujx-card" style="margin: 10px 0; padding: 12px 14px; background:var(--mujx-surface);" data-gi="${gi}">
            <div class="mujx-head" style="margin-bottom:8px;">
              <div>
                <strong style="font-size:14px; color:var(--mujx-ink);">${escapeHtml(group.subject)}</strong>
                <div class="mujx-sub" style="font-size:11.5px;">Recorded: <strong>${official.obtained ?? "\u2014"} / ${official.maximum ?? "\u2014"}</strong> (${official.percent !== null ? `${official.percent}%` : "\u2014"})</div>
              </div>
              <div class="mujx-row" style="align-items:center;">
                <label class="mujx-sub" style="font-size:11.5px;">Credits:
                  <input class="mujx-input" data-role="group-credits" data-gi="${gi}" type="number" min="1" max="10" step="0.5" value="${escapeHtml(state.credits)}" style="width:55px; padding:4px 6px;">
                </label>
                <button type="button" class="mujx-btn secondary" data-role="inspect-assumptions-btn" data-gi="${gi}" style="padding:4px 8px; font-size:11px;">\u{1F50D} Inspect Assumptions</button>
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
                ${group.items.map((item, ii) => {
          const weight = item.weight ?? inferWeight(item.component, weights);
          return `
                      <tr>
                        <td><strong>${escapeHtml(item.component)}</strong></td>
                        <td>${item.obtained !== null ? `${item.obtained} / ${item.maximum}` : "Not uploaded"}</td>
                        <td>${weight !== null ? `${weight}%` : "\u2014"}</td>
                        <td>
                          <input class="mujx-input" data-role="what-if-score" data-gi="${gi}" data-ii="${ii}" type="number" min="0" max="${item.maximum || 100}" step="0.5" placeholder="${item.obtained !== null ? item.obtained : "Enter"}" style="width:80px; padding:4px 7px;">
                        </td>
                      </tr>
                    `;
        }).join("")}
              </tbody>
            </table>

            <!-- Target Grade Planning for this subject -->
            <div class="mujx-sim" style="margin-top:8px; padding-top:8px;">
              <div class="mujx-row" style="justify-content:space-between; align-items:center;">
                <div class="mujx-row" style="align-items:center;">
                  <label class="mujx-sub" style="font-weight:600; font-size:12px;">Target Goal:
                    <select class="mujx-select" data-role="target-select" data-gi="${gi}" style="padding:4px 8px; font-size:12px;">
                      ${DEFAULT_GRADE_TARGETS.map(
          (t) => `<option value="${t.minPct}" ${state.targetMinPct === t.minPct ? "selected" : ""}>${t.label}</option>`
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
      }).join("");
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
            maximum: item.maximum || inferWeight(item.component, weights)
          }))
        );
        const targetScoreVal = state.targetMinPct;
        const internalEarned = weighted.ok ? weighted.weighted : total.obtained || 0;
        const eteRemaining = state.eteMax;
        const reqAnalysis = requiredScore({
          obtained: internalEarned,
          remainingMax: eteRemaining,
          targetTotal: targetScoreVal
        });
        const targetEl = container.querySelector(`[data-role="target-analysis-${gi}"]`);
        if (targetEl) {
          if (reqAnalysis.alreadyMet) {
            targetEl.innerHTML = `<button type="button" class="mujx-chip safe interactive" data-gi="${gi}" data-role="chip-inspect">\u2713 Target Secured (${internalEarned.toFixed(1)} pts)</button>`;
          } else if (reqAnalysis.impossible) {
            targetEl.innerHTML = `<button type="button" class="mujx-chip low interactive" data-gi="${gi}" data-role="chip-inspect">\u26A0\uFE0F Need ${reqAnalysis.required} / ${eteRemaining} in ETE</button>`;
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
          Obtained so far: <strong>${total.obtained ?? "\u2014"} / ${total.maximum ?? "\u2014"}</strong>
          ${weighted.ok ? `\xB7 Weighted: <strong>${weighted.weighted} / ${weighted.weightSum}</strong>` : ""}
        `;
        }
        const estimatedTotalPct = weighted.ok ? weighted.weighted / weighted.weightSum * 100 : total.percent;
        if (estimatedTotalPct !== null) {
          const pts = Math.min(10, Math.max(0, Math.round(estimatedTotalPct / 10)));
          courseEstimates.push({
            subject: group.subject,
            credits: state.credits,
            gradePoints: pts
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
        sgpaValEl.textContent = "\u2014";
        if (inlineSgpaValEl) inlineSgpaValEl.textContent = "\u2014";
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
        Target: <strong>${state.targetMinPct}%</strong> \xB7 ETE Max: <strong>${state.eteMax} marks</strong>
      </div>

      <div class="mujx-formula-box">
        <strong>Institutional Evaluation Scheme:</strong><br>
        MTE: ${weights.mte}% | CWS: ${weights.cws}% | ETE: ${weights.ete}%<br>
        <span style="font-size:10.5px; color:var(--mujx-muted);">Source: MUJ Examination Handbook 2023-24</span>
      </div>

      ${reqAnalysis ? `<div style="margin:8px 0; font-size:12px;">
              ${reqAnalysis.alreadyMet ? '<span class="mujx-chip safe">\u2713 Target Secured</span> Already earned enough marks!' : reqAnalysis.impossible ? `<span class="mujx-chip low">\u26A0\uFE0F Mathematically Impossible</span> Need ${reqAnalysis.required} marks out of ${state.eteMax} in ETE.` : `<span class="mujx-chip borderline">Target Achievable</span> Need <strong>${reqAnalysis.required}</strong> marks (${reqAnalysis.percentOfRemaining}%) in ETE.`}
            </div>` : ""}

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
      width: 320
    });
  }
  function inferWeight(component, weights) {
    const name = String(component || "").toLowerCase();
    if (name.includes("mid") || name.includes("mte")) return weights.mte;
    if (name.includes("cws") || name.includes("sessional") || name.includes("internal") || name.includes("assignment") || name.includes("quiz")) return weights.cws;
    if (name.includes("end") || name.includes("ete") || name.includes("term")) return weights.ete;
    return null;
  }

  // src/calculations/cgpa.js
  function computeCgpa({ currentCgpa, completedCredits, semesters }) {
    const issues = [];
    if (!Number.isFinite(currentCgpa) || currentCgpa < 0) issues.push("invalid_cgpa");
    if (!Number.isFinite(completedCredits) || completedCredits < 0) issues.push("invalid_completed_credits");
    if (issues.length) {
      return { ok: false, projected: [], issues };
    }
    let points = currentCgpa * completedCredits;
    let credits = completedCredits;
    const projected = [
      {
        label: "Current",
        sgpa: currentCgpa,
        semesterCredits: 0,
        cumulativeCredits: roundTo(credits, 2),
        cgpa: roundTo(currentCgpa, 2),
        source: "official-or-entered"
      }
    ];
    (semesters || []).forEach((semester, index) => {
      const sgpa = Number(semester.sgpa);
      const semesterCredits = Number(semester.credits);
      if (!Number.isFinite(sgpa) || sgpa < 0) {
        issues.push("invalid_semester_sgpa");
        return;
      }
      if (!Number.isFinite(semesterCredits) || semesterCredits < 0) {
        issues.push("invalid_semester_credits");
        return;
      }
      points += sgpa * semesterCredits;
      credits += semesterCredits;
      projected.push({
        label: semester.label || `Semester ${index + 1}`,
        sgpa: roundTo(sgpa, 2),
        semesterCredits: roundTo(semesterCredits, 2),
        cumulativeCredits: roundTo(credits, 2),
        cgpa: credits > 0 ? roundTo(points / credits, 2) : null,
        source: "simulated"
      });
    });
    return {
      ok: true,
      projected,
      finalCgpa: projected[projected.length - 1]?.cgpa ?? null,
      totalCredits: roundTo(credits, 2),
      issues,
      formula: "CGPA = \u03A3(SGPA_i \xD7 Credits_i) / \u03A3(Credits_i), matching MUJ credit-weighted GPA."
    };
  }

  // src/ui/charts.js
  function progressionChart(points, {
    secondaryPoints = null,
    primaryName = "Scenario A",
    secondaryName = "Scenario B",
    width = 460,
    height = 180,
    colorA = "#0d9488",
    colorB = "#6366f1"
  } = {}) {
    const allValues = [
      ...points.map((p) => p.y),
      ...secondaryPoints ? secondaryPoints.map((p) => p.y) : []
    ].filter(Number.isFinite);
    if (!allValues.length) {
      return `<div class="mujx-empty">Not enough numeric points to render progression chart.</div>`;
    }
    const rawMin = Math.min(...allValues);
    const rawMax = Math.max(...allValues);
    const minY = Math.max(0, Math.floor(rawMin * 10 - 2) / 10);
    const maxY = Math.min(10, Math.ceil(rawMax * 10 + 2) / 10);
    const ySpan = Math.max(maxY - minY, 0.2);
    const padLeft = 38;
    const padRight = 20;
    const padTop = 22;
    const padBottom = 32;
    const plotW = width - padLeft - padRight;
    const plotH = height - padTop - padBottom;
    const toCoords = (pts) => {
      return pts.map((pt, i) => {
        const x = pts.length === 1 ? padLeft + plotW / 2 : padLeft + i / (pts.length - 1) * plotW;
        const y = padTop + plotH - (pt.y - minY) / ySpan * plotH;
        return { ...pt, x, y };
      });
    };
    const coordsA = toCoords(points);
    const coordsB = secondaryPoints && secondaryPoints.length ? toCoords(secondaryPoints) : null;
    const gridSteps = 3;
    let gridLines = "";
    for (let s = 0; s <= gridSteps; s++) {
      const val = minY + s / gridSteps * (maxY - minY);
      const yPos = padTop + plotH - s / gridSteps * plotH;
      gridLines += `
      <line x1="${padLeft}" y1="${yPos.toFixed(1)}" x2="${width - padRight}" y2="${yPos.toFixed(1)}" stroke="currentColor" stroke-opacity="0.1" stroke-dasharray="3 3"/>
      <text x="${padLeft - 6}" y="${(yPos + 3.5).toFixed(1)}" text-anchor="end" class="mujx-chart-axis-val">${val.toFixed(1)}</text>
    `;
    }
    const createPath = (coords) => {
      return coords.map((pt, i) => `${i === 0 ? "M" : "L"}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ");
    };
    const createArea = (coords) => {
      const first = coords[0];
      const last = coords[coords.length - 1];
      const bottomY = padTop + plotH;
      return `M${first.x.toFixed(1)} ${bottomY} ` + coords.map((pt) => `L${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`).join(" ") + ` L${last.x.toFixed(1)} ${bottomY} Z`;
    };
    const pathA = createPath(coordsA);
    const areaA = createArea(coordsA);
    const dotsA = coordsA.map((pt) => `
    <g class="mujx-chart-dot-group">
      <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="${colorA}" stroke="#ffffff" stroke-width="2"/>
      <title>${escapeHtml(pt.label)}: CGPA ${Number(pt.y).toFixed(2)} (${escapeHtml(primaryName)})</title>
      <text x="${pt.x.toFixed(1)}" y="${(pt.y - 8).toFixed(1)}" text-anchor="middle" class="mujx-chart-point-val" fill="${colorA}">${Number(pt.y).toFixed(2)}</text>
    </g>
  `).join("");
    let secondarySvg = "";
    if (coordsB && coordsB.length) {
      const pathB = createPath(coordsB);
      const areaB = createArea(coordsB);
      const dotsB = coordsB.map((pt) => `
      <g class="mujx-chart-dot-group">
        <circle cx="${pt.x.toFixed(1)}" cy="${pt.y.toFixed(1)}" r="4.5" fill="${colorB}" stroke="#ffffff" stroke-width="2"/>
        <title>${escapeHtml(pt.label)}: CGPA ${Number(pt.y).toFixed(2)} (${escapeHtml(secondaryName)})</title>
        <text x="${pt.x.toFixed(1)}" y="${(pt.y + 16).toFixed(1)}" text-anchor="middle" class="mujx-chart-point-val" fill="${colorB}">${Number(pt.y).toFixed(2)}</text>
      </g>
    `).join("");
      secondarySvg = `
      <path d="${areaB}" fill="url(#mujx-grad-b)" opacity="0.18"/>
      <path d="${pathB}" fill="none" stroke="${colorB}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="4 3"/>
      ${dotsB}
    `;
    }
    const xLabels = coordsA.map((pt) => `
    <text x="${pt.x.toFixed(1)}" y="${height - 10}" text-anchor="middle" class="mujx-chart-label">${escapeHtml(pt.label)}</text>
  `).join("");
    const legend = secondaryPoints ? `
    <div class="mujx-chart-legend">
      <span class="mujx-legend-item"><span class="mujx-legend-dot" style="background:${colorA}"></span> ${escapeHtml(primaryName)}</span>
      <span class="mujx-legend-item"><span class="mujx-legend-dot" style="background:${colorB}"></span> ${escapeHtml(secondaryName)}</span>
    </div>
  ` : "";
    return `
    <div class="mujx-chart-container">
      ${legend}
      <svg class="mujx-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="CGPA progression trajectory">
        <defs>
          <linearGradient id="mujx-grad-a" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${colorA}" stop-opacity="0.35"/>
            <stop offset="100%" stop-color="${colorA}" stop-opacity="0.0"/>
          </linearGradient>
          <linearGradient id="mujx-grad-b" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stop-color="${colorB}" stop-opacity="0.30"/>
            <stop offset="100%" stop-color="${colorB}" stop-opacity="0.0"/>
          </linearGradient>
        </defs>
        ${gridLines}
        <path d="${areaA}" fill="url(#mujx-grad-a)"/>
        <path d="${pathA}" fill="none" stroke="${colorA}" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>
        ${secondarySvg}
        ${dotsA}
        ${xLabels}
      </svg>
    </div>
  `;
  }

  // src/ui/components/cgpa-predictor/panel.js
  function renderCgpaPredictor({ wrap, seed }) {
    const state = {
      currentCgpa: seed?.currentCgpa ?? (seed?.currentSgpa ?? 8),
      completedCredits: seed?.completedCredits ?? 60,
      scenarioNameA: "Conservative Plan",
      scenarioNameB: "Ambitious Plan",
      semestersA: [
        { label: "Sem 5", sgpa: 8.2, credits: 22 },
        { label: "Sem 6", sgpa: 8.4, credits: 22 },
        { label: "Sem 7", sgpa: 8.5, credits: 20 },
        { label: "Sem 8", sgpa: 9, credits: 16 }
      ],
      semestersB: [
        { label: "Sem 5", sgpa: 9, credits: 22 },
        { label: "Sem 6", sgpa: 9.2, credits: 22 },
        { label: "Sem 7", sgpa: 9.4, credits: 20 },
        { label: "Sem 8", sgpa: 9.5, credits: 16 }
      ]
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
          <button class="mujx-btn secondary" type="button" data-role="reset-btn">\u21BA Reset to Baseline</button>
        </div>

        ${seed?.available ? `<div class="mujx-sim-box" style="margin-bottom:12px; background:var(--mujx-info-bg); border-color:var(--mujx-info-border);">
                <span style="font-size:12px; color:var(--mujx-info);">Prefilled from ${escapeHtml(seed.source)}: Current CGPA <strong>${seed.currentCgpa ?? "\u2014"}</strong> (${seed.completedCredits ?? "\u2014"} credits).</span>
              </div>` : `<div class="mujx-sim-box" style="margin-bottom:12px;">
                <span class="mujx-sub">Enter your verified CGPA and completed credits below to start simulation.</span>
              </div>`}

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
                <b data-role="final-cgpa-a" style="color:#0d9488; font-size:20px;">\u2014</b>
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
                <b data-role="final-cgpa-b" style="color:#6366f1; font-size:20px;">\u2014</b>
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
          * Formula: <code>CGPA = \u03A3(SGPA_i \xD7 Credits_i) / \u03A3(Credits_i)</code>. MUJ assigns letter grades and grade points per course; semesters with higher credit loads carry proportionately higher weight in your cumulative record.
        </p>
      </section>
    `;
      paintInputs();
      recalculate();
    };
    const paintInputs = () => {
      const hostA = wrap.querySelector("[data-role=sem-inputs-a]");
      const hostB = wrap.querySelector("[data-role=sem-inputs-b]");
      hostA.innerHTML = state.semestersA.map(
        (s, i) => `
          <div class="mujx-row" style="margin-bottom:6px; align-items:center;">
            <span style="font-size:12px; font-weight:600; width:52px;">${escapeHtml(s.label)}</span>
            <input class="mujx-input" data-sc="a" data-i="${i}" data-f="sgpa" type="number" step="0.01" min="0" max="10" placeholder="SGPA" value="${s.sgpa}" style="width:72px;">
            <input class="mujx-input" data-sc="a" data-i="${i}" data-f="credits" type="number" step="1" min="1" max="40" placeholder="Credits" value="${s.credits}" style="width:72px;">
            <span class="mujx-sub" style="font-size:11px;">credits</span>
          </div>
        `
      ).join("");
      hostB.innerHTML = state.semestersB.map(
        (s, i) => `
          <div class="mujx-row" style="margin-bottom:6px; align-items:center;">
            <span style="font-size:12px; font-weight:600; width:52px;">${escapeHtml(s.label)}</span>
            <input class="mujx-input" data-sc="b" data-i="${i}" data-f="sgpa" type="number" step="0.01" min="0" max="10" placeholder="SGPA" value="${s.sgpa}" style="width:72px;">
            <input class="mujx-input" data-sc="b" data-i="${i}" data-f="credits" type="number" step="1" min="1" max="40" placeholder="Credits" value="${s.credits}" style="width:72px;">
            <span class="mujx-sub" style="font-size:11px;">credits</span>
          </div>
        `
      ).join("");
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
        const nextNum = state.semestersA.length + 5;
        state.semestersA.push({ label: `Sem ${nextNum}`, sgpa: 8.5, credits: 20 });
        state.semestersB.push({ label: `Sem ${nextNum}`, sgpa: 9, credits: 20 });
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
        state.currentCgpa = seed?.currentCgpa ?? (seed?.currentSgpa ?? 8);
        state.completedCredits = seed?.completedCredits ?? 60;
        paint();
      });
    };
    const recalculate = () => {
      const baseInput = {
        currentCgpa: Number(state.currentCgpa),
        completedCredits: Number(state.completedCredits)
      };
      const resA = computeCgpa({
        ...baseInput,
        semesters: state.semestersA
      });
      const resB = computeCgpa({
        ...baseInput,
        semesters: state.semestersB
      });
      const cgpaAEl = wrap.querySelector("[data-role=final-cgpa-a]");
      const cgpaBEl = wrap.querySelector("[data-role=final-cgpa-b]");
      if (cgpaAEl) cgpaAEl.textContent = resA.ok && resA.finalCgpa !== null ? resA.finalCgpa.toFixed(2) : "\u2014";
      if (cgpaBEl) cgpaBEl.textContent = resB.ok && resB.finalCgpa !== null ? resB.finalCgpa.toFixed(2) : "\u2014";
      const chartSlot = wrap.querySelector("[data-role=chart-slot]");
      if (chartSlot && resA.ok && resB.ok) {
        const pointsA = resA.projected.map((p) => ({ label: p.label, y: p.cgpa }));
        const pointsB = resB.projected.map((p) => ({ label: p.label, y: p.cgpa }));
        chartSlot.innerHTML = progressionChart(pointsA, {
          secondaryPoints: pointsB,
          primaryName: state.scenarioNameA,
          secondaryName: state.scenarioNameB
        });
      }
      const tableSlot = wrap.querySelector("[data-role=table-slot]");
      if (tableSlot && resA.ok && resB.ok) {
        const rows = resA.projected.map((pA, i) => {
          const pB = resB.projected[i] || { cgpa: null, sgpa: null };
          const delta = pA.cgpa !== null && pB.cgpa !== null ? (pB.cgpa - pA.cgpa).toFixed(2) : "\u2014";
          return `
          <tr>
            <td><strong>${escapeHtml(pA.label)}</strong></td>
            <td>${pA.semesterCredits ? `${pA.semesterCredits} cr` : "Initial"}</td>
            <td>${pA.sgpa !== null ? pA.sgpa.toFixed(2) : "\u2014"}</td>
            <td><strong style="color:#0d9488">${pA.cgpa !== null ? pA.cgpa.toFixed(2) : "\u2014"}</strong></td>
            <td>${pB.sgpa !== null ? pB.sgpa.toFixed(2) : "\u2014"}</td>
            <td><strong style="color:#6366f1">${pB.cgpa !== null ? pB.cgpa.toFixed(2) : "\u2014"}</strong></td>
            <td><span class="mujx-chip ${Number(delta) >= 0 ? "safe" : "low"}" style="font-size:11px;">${Number(delta) >= 0 ? `+${delta}` : delta}</span></td>
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

  // src/ui/components/target-cgpa-planner/panel.js
  function renderTargetPlanner({ wrap, seed, gradeCap = 10 }) {
    const state = {
      currentCgpa: seed?.currentCgpa ?? (seed?.currentSgpa ?? 8),
      completedCredits: seed?.completedCredits ?? 60,
      targetCgpa: 8.5,
      remainingSemesters: [
        { label: "Semester 5", credits: 22 },
        { label: "Semester 6", credits: 22 },
        { label: "Semester 7", credits: 20 },
        { label: "Semester 8", credits: 16 }
      ]
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
          <button class="mujx-btn secondary" type="button" data-role="reset-btn">\u21BA Reset</button>
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
          * Mathematical Identity: <code>Required SGPA = [Target CGPA \xD7 (Completed + Remaining) \u2212 Current CGPA \xD7 Completed] / Remaining</code>. Grade cap is ${gradeCap}.0.
        </p>
      </section>
    `;
      paintSemList();
      recalculate();
    };
    const paintSemList = () => {
      const listEl = wrap.querySelector("[data-role=sem-list]");
      listEl.innerHTML = state.remainingSemesters.map(
        (sem, i) => `
          <label class="mujx-sub" style="background:var(--mujx-surface); border:1px solid var(--mujx-line); border-radius:var(--mujx-radius-sm); padding:6px 10px; display:inline-flex; flex-direction:column; gap:2px;">
            <strong>${escapeHtml(sem.label)}</strong>
            <div style="display:flex; align-items:center; gap:4px;">
              <input class="mujx-input" data-sem-idx="${i}" type="number" min="1" max="40" value="${sem.credits}" style="width:60px; padding:3px 6px; font-size:12px;">
              <span style="font-size:11px;">cr</span>
            </div>
          </label>
        `
      ).join("");
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
        state.currentCgpa = seed?.currentCgpa ?? (seed?.currentSgpa ?? 8);
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
        gradeCap
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
        statusChip = `<span class="mujx-chip safe">\u2713 Target Achieved</span>`;
      } else if (plan.reason === "impossible_above_cap") {
        statusClass = "low";
        statusText = `Impossible (> ${gradeCap}.0 cap)`;
        statusChip = `<span class="mujx-chip low">\u2715 Mathematically Impossible</span>`;
      } else if (plan.requiredAverageSgpa > 9) {
        statusClass = "borderline";
        statusText = "High Effort Required (SGPA > 9.0)";
        statusChip = `<span class="mujx-chip borderline">\u26A0\uFE0F High Effort Required</span>`;
      } else {
        statusClass = "safe";
        statusText = "Feasible Target";
        statusChip = `<span class="mujx-chip safe">\u2713 Highly Feasible</span>`;
      }
      outEl.innerHTML = `
      <div class="mujx-card" style="margin:0; background:var(--mujx-bg); border-left: 4px solid var(--mujx-${statusClass === "safe" ? "ok" : statusClass === "borderline" ? "warn" : "bad"});">
        <div class="mujx-head" style="margin-bottom:6px;">
          <div>
            <div style="margin-bottom:4px;">${statusChip}</div>
            <strong style="font-size:15px; color:var(--mujx-ink);">${statusText}</strong>
          </div>
          <div style="text-align:right;">
            <span class="mujx-metric-label">Required Avg SGPA</span>
            <b style="font-size:24px; color:var(--mujx-${statusClass === "safe" ? "ok" : statusClass === "borderline" ? "warn" : "bad"});">
              ${plan.requiredAverageSgpa !== null ? plan.requiredAverageSgpa.toFixed(2) : "\u2014"}
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
        ${plan.bySemester?.length ? `<div style="margin-top:14px;">
                <strong style="font-size:13px;">Semester-by-Semester Recommended Target:</strong>
                <div class="mujx-row" style="margin-top:8px; gap:8px;">
                  ${plan.bySemester.map(
        (sem) => `
                      <div class="mujx-metric" style="flex:1; min-width:120px; background:var(--mujx-surface);">
                        <span class="mujx-metric-label">${escapeHtml(sem.label)} (${sem.credits} cr)</span>
                        <b style="color:var(--mujx-accent); font-size:17px;">SGPA ${sem.requiredSgpa}</b>
                      </div>
                    `
      ).join("")}
                </div>
              </div>` : ""}
      </div>
    `;
    };
    paint();
  }

  // src/ui/components/timetable/panel.js
  function renderTimetablePanel({ wrap, events = [], snapshot, updatedAt, attendanceRecords = [] }) {
    const analysis = analyzeSchedule(events);
    const getSubjectAtt = (title) => {
      if (!title || !attendanceRecords.length) return null;
      const cleanTitle = title.toLowerCase();
      return attendanceRecords.find(
        (r) => cleanTitle.includes((r.subject || "").toLowerCase()) || (r.subject || "").toLowerCase().includes(cleanTitle)
      );
    };
    const currentAtt = analysis.current ? getSubjectAtt(analysis.current.title) : null;
    const upcomingAtt = analysis.upcoming ? getSubjectAtt(analysis.upcoming.title) : null;
    wrap.innerHTML = `
    <div class="mujx-inline-bar" aria-label="Timetable quick bar" style="margin-bottom:12px;">
      <div class="mujx-inline-bar-left">
        <span class="mujx-kicker"><span class="mujx-kicker-dot"></span> Schedule Intel</span>
        <span>
          ${analysis.current ? `<span class="mujx-pulse-dot"></span><strong>Now:</strong> ${escapeHtml(analysis.current.title)}` : "<strong>Now:</strong> Free Period"}
          ${analysis.current?.room ? ` (${escapeHtml(analysis.current.room)})` : ""}
        </span>
        <span style="color:var(--mujx-line-strong);">|</span>
        <span>
          <strong>Next:</strong> ${escapeHtml(analysis.upcoming?.title || "None remaining today")}
          ${analysis.upcoming?.start ? ` at ${escapeHtml(analysis.upcoming.start)}` : ""}
        </span>
        ${analysis.gaps.length ? `<span class="mujx-chip" style="font-size:11px; padding:1px 6px;">\u2615 ${analysis.gaps[0].minutes}m break</span>` : ""}
      </div>
      <div class="mujx-inline-bar-right">
        <span class="mujx-sub" style="font-size:11px; margin:0;">Synced: ${escapeHtml(updatedAt || "Just now")}</span>
        <button class="mujx-btn secondary" type="button" data-role="refresh-tt" style="padding:3px 8px; font-size:11px;">\u21BA Refresh</button>
      </div>
    </div>

    <section class="mujx-card" aria-label="Timetable enhancements" style="margin-top:0;">
      <div class="mujx-head">
        <div>
          <div class="mujx-kicker"><span class="mujx-kicker-dot"></span> Feature E</div>
          <h2 class="mujx-title" style="font-size:16px;">Schedule Intelligence & Snapshot Tracking</h2>
          <p class="mujx-sub">The original portal calendar and table remain fully interactive below. Click any class event for contextual intel.</p>
        </div>
      </div>

      <!-- Live / Next Class Status -->
      <div class="mujx-grid" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
        <!-- Happening Now -->
        <div class="mujx-card" style="margin:0; background:var(--mujx-bg); border-left: 4px solid ${analysis.current ? "var(--mujx-ok)" : "var(--mujx-line-strong)"};">
          <span class="mujx-metric-label">
            ${analysis.current ? '<span class="mujx-pulse-dot"></span> Happening Now' : "Current Status"}
          </span>
          <b style="font-size:15px; margin: 4px 0;">
            ${escapeHtml(analysis.current?.title || "No class in session")}
          </b>
          <div class="mujx-sub">
            ${analysis.current?.room ? `Room: <strong>${escapeHtml(analysis.current.room)}</strong> \xB7 ` : ""}
            ${analysis.current?.start ? `${escapeHtml(analysis.current.start)} - ${escapeHtml(analysis.current.end || "")}` : "Free period"}
          </div>
          ${currentAtt ? `<div style="margin-top:6px;"><span class="mujx-chip ${currentAtt.percent >= 75 ? "safe" : "low"}" style="font-size:10.5px;">Attendance: ${currentAtt.percent}%</span></div>` : ""}
        </div>

        <!-- Up Next -->
        <div class="mujx-card" style="margin:0; background:var(--mujx-bg); border-left: 4px solid var(--mujx-accent);">
          <span class="mujx-metric-label">Up Next Today</span>
          <b style="font-size:15px; margin: 4px 0; color:var(--mujx-accent);">
            ${escapeHtml(analysis.upcoming?.title || "No more classes today")}
          </b>
          <div class="mujx-sub">
            ${analysis.upcoming?.room ? `Room: <strong>${escapeHtml(analysis.upcoming.room)}</strong> \xB7 ` : ""}
            ${analysis.upcoming?.start ? `Starts at ${escapeHtml(analysis.upcoming.start)}` : "All finished"}
          </div>
          ${upcomingAtt ? `<div style="margin-top:6px;"><span class="mujx-chip ${upcomingAtt.percent >= 75 ? "safe" : "low"}" style="font-size:10.5px;">Attendance: ${upcomingAtt.percent}% (${upcomingAtt.safeSkips > 0 ? `+${upcomingAtt.safeSkips} skips safe` : `Need ${upcomingAtt.classesNeeded}`})</span></div>` : ""}
        </div>

        <!-- Schedule Conflicts -->
        <div class="mujx-card" style="margin:0; background:var(--mujx-bg); border-left: 4px solid ${analysis.conflicts.length ? "var(--mujx-bad)" : "var(--mujx-ok)"};">
          <span class="mujx-metric-label">Schedule Health</span>
          <b style="font-size:15px; margin: 4px 0; color: ${analysis.conflicts.length ? "var(--mujx-bad)" : "var(--mujx-ok)"};">
            ${analysis.conflicts.length ? `${analysis.conflicts.length} Overlapping Slot(s)` : "Zero Conflicts Detected"}
          </b>
          <div class="mujx-sub">
            ${events.length} schedule events parsed from page
          </div>
        </div>
      </div>

      <!-- Free Gaps and Breaks -->
      ${analysis.gaps.length ? `<div class="mujx-sim-box" style="margin-top:12px;">
              <strong style="font-size:12.5px;">\u2615 Break & Free Periods:</strong>
              <div class="mujx-row" style="margin-top:6px; gap:8px;">
                ${analysis.gaps.map(
      (g) => `
                    <span class="mujx-chip" style="background:var(--mujx-surface); border:1px solid var(--mujx-line); font-size:11.5px;">
                      <strong>${g.minutes} min break</strong> after ${escapeHtml(g.after?.title || "class")}
                    </span>
                  `
    ).join("")}
              </div>
            </div>` : ""}

      <!-- Conflicts Alert -->
      ${analysis.conflicts.length ? `<div class="mujx-sim-box" style="margin-top:12px; background:var(--mujx-bad-bg); border-color:var(--mujx-bad-border);">
              <strong style="color:var(--mujx-bad); font-size:12.5px;">\u26A0\uFE0F Schedule Conflicts Found:</strong>
              <div class="mujx-sub" style="color:var(--mujx-ink); margin-top:4px;">
                ${analysis.conflicts.map(
      (c) => `<div>Overlap between <strong>${escapeHtml(c.a.title)}</strong> and <strong>${escapeHtml(c.b.title)}</strong> (${escapeHtml(c.a.start || "")} - ${escapeHtml(c.a.end || "")})</div>`
    ).join("")}
              </div>
            </div>` : ""}

      <!-- Snapshot Change Notice -->
      ${snapshot?.changed ? `<div class="mujx-sim-box" style="margin-top:12px; background:var(--mujx-warn-bg); border-color:var(--mujx-warn-border);">
              <strong style="color:var(--mujx-warn); font-size:12.5px;">\u{1F514} Timetable Change Detected:</strong>
              <p class="mujx-sub" style="color:var(--mujx-ink); margin:4px 0 0;">
                The timetable events on this page differ from your previously saved local snapshot. This indicates a schedule modification made by the department. This is detected locally and is not an officially confirmed cancellation notice.
              </p>
            </div>` : ""}

      ${events.length === 0 ? `<p class="mujx-empty">No timetable events could be parsed from the current view. If using FullCalendar, ensure events are visible or switch views.</p>` : ""}
    </section>
  `;
    bindCalendarPopovers(attendanceRecords);
    return wrap.querySelector("[data-role=refresh-tt]");
  }
  function bindCalendarPopovers(attendanceRecords) {
    const getSubjectAtt = (title) => {
      if (!title || !attendanceRecords.length) return null;
      const cleanTitle = title.toLowerCase();
      return attendanceRecords.find(
        (r) => cleanTitle.includes((r.subject || "").toLowerCase()) || (r.subject || "").toLowerCase().includes(cleanTitle)
      );
    };
    const eventNodes = document.querySelectorAll(".fc-event, .fc-timegrid-event, [data-event], .calendar-event");
    eventNodes.forEach((node) => {
      if (node.hasAttribute("data-mujx-popover-bound")) return;
      node.setAttribute("data-mujx-popover-bound", "true");
      node.addEventListener("click", (e) => {
        const title = node.querySelector(".fc-event-title, .title")?.textContent || node.textContent || "Timetable Event";
        const start = node.getAttribute("data-start") || node.getAttribute("data-date") || "";
        const end = node.getAttribute("data-end") || "";
        const room = node.getAttribute("data-room") || "";
        const att = getSubjectAtt(title);
        const content = `
        <div>
          <div style="font-size:13px; font-weight:700; color:var(--mujx-ink); margin-bottom:6px;">
            ${escapeHtml(title.trim())}
          </div>
          <div class="mujx-calc-step">
            <span style="color:var(--mujx-muted);">Time:</span>
            <strong>${escapeHtml(start || "Scheduled")} ${end ? `\u2013 ${escapeHtml(end)}` : ""}</strong>
          </div>
          ${room ? `<div class="mujx-calc-step"><span style="color:var(--mujx-muted);">Room / Venue:</span><strong>${escapeHtml(room)}</strong></div>` : ""}
          ${att ? `<div class="mujx-calc-step">
                  <span style="color:var(--mujx-muted);">Attendance:</span>
                  <span class="mujx-chip ${att.percent >= 75 ? "safe" : "low"}" style="font-size:10.5px;">${att.percent}% (${att.safeSkips > 0 ? `+${att.safeSkips} safe` : `Need ${att.classesNeeded}`})</span>
                </div>` : ""}
          <p class="mujx-note" style="margin-top:8px;">* Extracted from SLCM Timetable. Calendar navigation and details remain intact.</p>
        </div>
      `;
        openPopover({
          anchorEl: node,
          title: "Class Details",
          badge: { text: "Timetable", type: "safe" },
          contentHtml: content,
          width: 310
        });
      });
    });
  }

  // src/ui/components/notifications/panel.js
  function renderNotifications({ wrap, items = [], onDismiss, onClearAll }) {
    wrap.innerHTML = `
    <section class="mujx-card" aria-label="Academic notifications" style="margin:0;">
      <div class="mujx-head">
        <div>
          <div class="mujx-kicker"><span class="mujx-kicker-dot"></span> Feature F</div>
          <h2 class="mujx-title">Academic Alerts</h2>
          <p class="mujx-sub">Client-side notifications stored locally in your browser. Not official push notifications.</p>
        </div>
        ${items.length ? `<button class="mujx-btn secondary" type="button" data-role="clear-all" style="padding:4px 9px; font-size:11px;">Clear All</button>` : ""}
      </div>

      ${items.length ? `<ul class="mujx-list">
              ${items.map((item) => {
      const statusClass = item.status === "warning" ? "low" : item.status === "notice" ? "borderline" : "safe";
      const dateStr = formatTimestamp(item.at);
      return `
                    <li class="mujx-list-item">
                      <div style="flex:1;">
                        <div style="display:flex; align-items:center; gap:8px;">
                          <span class="mujx-chip ${statusClass}" style="font-size:10px; padding:1px 6px;">${escapeHtml(item.status || "info").toUpperCase()}</span>
                          <strong style="font-size:13.5px; color:var(--mujx-ink);">${escapeHtml(item.title)}</strong>
                        </div>
                        <div class="mujx-sub" style="margin-top:3px; color:var(--mujx-ink);">${escapeHtml(item.detail || "")}</div>
                        <div class="mujx-sub" style="font-size:11px; margin-top:3px;">${escapeHtml(dateStr)}</div>
                      </div>
                      <button class="mujx-btn secondary" type="button" data-role="dismiss" data-id="${escapeHtml(item.id)}" style="padding:4px 8px; font-size:11px;">\u2715</button>
                    </li>
                  `;
    }).join("")}
            </ul>` : `<div class="mujx-empty">
              <div style="font-size:24px; margin-bottom:6px;">\u2713</div>
              <strong>No Active Alerts</strong>
              <div class="mujx-sub">You have no low-attendance warnings or detected schedule changes.</div>
            </div>`}
    </section>
  `;
    wrap.querySelectorAll("button[data-role=dismiss]").forEach((button) => {
      button.addEventListener("click", () => {
        onDismiss?.(button.dataset.id);
      });
    });
    wrap.querySelector("[data-role=clear-all]")?.addEventListener("click", () => {
      onClearAll?.();
    });
  }
  function buildAcademicAlerts({ attendance = [], timetableChanged = false, newMarks = false }) {
    const items = [];
    const at = (/* @__PURE__ */ new Date()).toISOString();
    for (const row of attendance) {
      if (row.status?.code === "low") {
        items.push({
          id: `att-low-${row.courseCode || row.subject}`,
          title: `Low Attendance: ${row.subject}`,
          detail: `Current attendance is ${row.percent ?? "\u2014"}%. You need to attend the next ${row.classesNeeded ?? 1} consecutive classes to recover to target threshold.`,
          at,
          status: "warning"
        });
      } else if (row.status?.code === "borderline") {
        items.push({
          id: `att-warn-${row.courseCode || row.subject}`,
          title: `Borderline Attendance: ${row.subject}`,
          detail: `Current attendance is ${row.percent ?? "\u2014"}%. Safe skips remaining: ${row.safeSkips ?? 0}.`,
          at,
          status: "notice"
        });
      }
    }
    if (timetableChanged) {
      items.push({
        id: `tt-${at.slice(0, 13)}`,
        title: "Timetable Schedule Modification",
        detail: "Your current timetable differs from the previous snapshot saved locally. Please verify with the department; this is not an official cancellation notice.",
        at,
        status: "notice"
      });
    }
    if (newMarks) {
      items.push({
        id: `marks-${at.slice(0, 13)}`,
        title: "Internal Marks Updated",
        detail: "A change in your internal marks table was detected since your last visit.",
        at,
        status: "info"
      });
    }
    return items;
  }
  function formatTimestamp(isoString) {
    if (!isoString) return "";
    try {
      const d = new Date(isoString);
      return d.toLocaleString(void 0, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return isoString;
    }
  }

  // src/content/bootstrap.js
  var cleanups = [];
  var activeFloatingTab = "alerts";
  async function boot() {
    if (window[BOOT_FLAG]) return;
    window[BOOT_FLAG] = true;
    await mount();
    cleanups.push(observePath(() => remount()));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") remount();
    });
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
      if (page.kind === PAGE_KINDS.login) return;
      const cache = await loadCache();
      const seed = extractSemesterContext();
      let attendance = extractAttendanceFromDocument();
      const marks = extractMarksFromDocument();
      let timetable = extractTimetableFromDocument();
      const marksFingerprint = marks.available ? fingerprint(marks.records.map((r) => [r.subject, r.component, r.obtained])) : null;
      const marksChanged = Boolean(
        marksFingerprint && cache.marks?.fingerprint && cache.marks.fingerprint !== marksFingerprint
      );
      if (attendance.available) {
        await saveCache({
          attendance: {
            count: attendance.records.length,
            fingerprint: fingerprint(attendance.records.map((r) => [r.courseCode, r.present, r.absent, r.total]))
          }
        });
      }
      if (marks.available) {
        await saveCache({ marks: { count: marks.records.length, fingerprint: marksFingerprint } });
      }
      let snapshotChanged = false;
      if (timetable.available) {
        const previous = await loadTimetableSnapshot();
        snapshotChanged = Boolean(previous && previous.fingerprint && previous.fingerprint !== timetable.fingerprint);
        await saveTimetableSnapshot({ fingerprint: timetable.fingerprint, at: (/* @__PURE__ */ new Date()).toISOString() });
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
      const isGradesPage = page.kind === PAGE_KINDS.grades || location.pathname.toLowerCase().includes("grade") || location.pathname.toLowerCase().includes("cgpaga") || location.pathname.toLowerCase().includes("examination") || hasGradeTableInDOM();
      const isMarksPage = page.kind === PAGE_KINDS.marks;
      if (prefs.features.attendance && !isGradesPage && !isMarksPage && attendance.available && attendance.table) {
        const cleanup = injectColumn(attendance.table, {
          key: "attendance-intel",
          title: "MUJX Intel",
          render: (td, row) => {
            const cells = [...row.cells].map((cell) => cell.textContent);
            const record = attendance.records.find((item) => cells.join(" ").includes(item.subject)) || {
              subject: cells[1] || cells[0],
              present: parseNumber(cells[cells.length - 3]),
              total: parseNumber(cells[cells.length - 2])
            };
            renderAttendanceCell(td, record, prefs.attendanceThreshold, prefs.borderlineBand);
          }
        });
        cleanups.push(cleanup);
        cleanups.push(
          observeTable(attendance.table, () => {
            attendance = extractAttendanceFromDocument();
            remount();
          })
        );
        const enhanced = attendance.records.map(
          (r) => enhanceRecord(r, prefs.attendanceThreshold, prefs.borderlineBand)
        );
        await recordAlertsIfAny(enhanced, snapshotChanged, marksChanged);
      }
      if (isGradesPage) {
        enhanceGradesInline(prefs);
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
      if (prefs.features.marks && isMarksPage) {
        enhanceMarksTableInline(marks, prefs);
      }
      if (prefs.features.timetable) {
        highlightActiveTimetableSlot(timetable.events);
      }
      mountFloatingHub(prefs, seed, snapshotChanged, attendance, marksChanged, timetable, marks);
      if (prefs.autoRefreshMinutes > 0) {
        const timer = setTimeout(() => remount(), prefs.autoRefreshMinutes * 60 * 1e3);
        cleanups.push(() => clearTimeout(timer));
      }
    } catch (error) {
      logError("extension mount failed", { code: error.name });
    }
  }
  function enhanceGradesInline(prefs) {
    const allTables = [
      ...document.querySelectorAll("table"),
      ...[...document.querySelectorAll("iframe")].flatMap((f) => {
        try {
          return [...f.contentDocument?.querySelectorAll("table") || []];
        } catch {
          return [];
        }
      })
    ];
    for (const table of allTables) {
      const text = (table.textContent || "").toLowerCase();
      if (text.includes("grade") && (text.includes("course") || text.includes("credit") || text.includes("session"))) {
        const gradeSheetData = parseGradesTable(table);
        if (gradeSheetData.available && gradeSheetData.records.length) {
          const dataSig = `${gradeSheetData.session || ""}:${gradeSheetData.records.map((r) => `${r.courseCode}-${r.letter}-${r.credits}`).join(";")}`;
          if (table.getAttribute("data-mujx-sig") === dataSig && table.querySelector(`[${INJECT_ATTR}="grade-points"]`)) {
            continue;
          }
          table.querySelectorAll(`[${INJECT_ATTR}]`).forEach((el) => el.remove());
          table.setAttribute("data-mujx-sig", dataSig);
          const cleanup = enhanceGradeSheet({
            table,
            records: gradeSheetData.records,
            totalCreditsFromFooter: gradeSheetData.totalCreditsFromFooter,
            headerRow: gradeSheetData.headerRow,
            allRows: gradeSheetData.allRows,
            headerRowIndex: gradeSheetData.headerRowIndex,
            session: gradeSheetData.session
          });
          cleanups.push(cleanup);
          continue;
        }
      }
      if (text.includes("cgpa") && (text.includes("student") || text.includes("registration"))) {
        if (table.querySelector(`[${INJECT_ATTR}="cgpa-target-intel"]`)) continue;
        const cgpaData = parseCgpaSummaryTable(table);
        if (cgpaData && cgpaData.cgpa !== null) {
          const completedCr = cgpaData.completedCredits || 89;
          const targetGoal = cgpaData.cgpa < 8 ? 8 : cgpaData.cgpa < 8.5 ? 8.5 : 9;
          const plan = planTargetCgpa({
            currentCgpa: cgpaData.cgpa,
            completedCredits: completedCr,
            targetCgpa: targetGoal,
            remainingCredits: 20,
            gradeCap: prefs.gradeCap || 10
          });
          const cleanup = injectColumn(table, {
            key: "cgpa-target-intel",
            title: "MUJX Target Plan",
            render: (td) => {
              const reqText = plan.requiredAverageSgpa !== null ? `Next Sem: ${plan.requiredAverageSgpa.toFixed(2)} SGPA for ${targetGoal.toFixed(1)} CGPA` : `Target ${targetGoal.toFixed(1)} Met`;
              td.innerHTML = `
              <div style="font-size:12px; font-weight:700; color:var(--mujx-accent, #2dd4bf); white-space:nowrap;">
                ${reqText}
              </div>
              <div style="font-size:11px; opacity:0.75;">
                Current: <strong>${cgpaData.cgpa}</strong> (${completedCr} cr)
              </div>
            `;
            }
          });
          cleanups.push(cleanup);
        }
      }
    }
  }
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
          }
        });
        cleanups.push(cleanup);
      }
    }
  }
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
          badge.textContent = "\u25CF Happening Now";
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
      newMarks: marksChanged
    });
    if (alerts.length) await recordNotifications(alerts);
  }
  async function mountFloatingHub(prefs, seed, snapshotChanged, attendance, marksChanged, timetable, marks) {
    const overlay = createOverlay({ id: "float", placement: "float" });
    if (!overlay.host) return;
    applyTheme(overlay.wrap, prefs.theme);
    const enhancedAttendance = (attendance.records || []).map(
      (r) => enhanceRecord(r, prefs.attendanceThreshold, prefs.borderlineBand)
    );
    const alerts = buildAcademicAlerts({
      attendance: enhancedAttendance,
      timetableChanged: snapshotChanged,
      newMarks: marksChanged
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
    }
    overlay.wrap.innerHTML = `
    <div class="mujx-fab-container" style="display:${isHidden ? "none" : "inline-flex"}; align-items:center; gap:4px; pointer-events:auto;">
      <button class="mujx-fab-pill" type="button" data-role="fab-toggle" tabindex="0" role="button" aria-haspopup="dialog" aria-expanded="false" title="MUJX Academic Tools (Click to open sidebar drawer)">
        <span style="font-size:13px">\u2728</span>
        <span data-role="fab-label">MUJX</span>
        <span class="mujx-fab-badge" data-role="fab-badge" ${alertCount === 0 ? "hidden" : ""}>${alertCount}</span>
      </button>
      <button class="mujx-fab-min-btn" type="button" data-role="fab-min" title="Hide floating MUJX widget" style="background:rgba(0,0,0,0.55); border:1px solid rgba(255,255,255,0.25); border-radius:50%; width:20px; height:20px; display:inline-flex; align-items:center; justify-content:center; color:#fff; cursor:pointer; font-size:10px; padding:0;">\u2715</button>
    </div>

    <div class="mujx-drawer" data-role="drawer" role="dialog" aria-label="MUJX Intelligence Hub" hidden>
      <div class="mujx-drawer-head">
        <div class="mujx-drawer-title">
          <span style="font-size:16px;">\u2728</span>
          <span>MUJX Academic Tools</span>
        </div>
        <button class="mujx-btn secondary" type="button" data-role="drawer-close" aria-label="Close hub" style="padding:4px 8px; font-size:12px;">\u2715</button>
      </div>

      <div class="mujx-drawer-tabs" role="tablist">
        <button class="mujx-tab-btn ${activeFloatingTab === "alerts" ? "active" : ""}" type="button" role="tab" data-tab="alerts">
          \u{1F514} Alerts ${alertCount > 0 ? `(${alertCount})` : ""}
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === "attendance" ? "active" : ""}" type="button" role="tab" data-tab="attendance">
          \u{1F4CA} Attendance
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === "marks" ? "active" : ""}" type="button" role="tab" data-tab="marks">
          \u{1F4DD} Marks & SGPA
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === "cgpa" ? "active" : ""}" type="button" role="tab" data-tab="cgpa">
          \u{1F4C8} CGPA Predictor
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === "planner" ? "active" : ""}" type="button" role="tab" data-tab="planner">
          \u{1F3AF} Target Planner
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === "timetable" ? "active" : ""}" type="button" role="tab" data-tab="timetable">
          \u{1F4C5} Timetable
        </button>
        <button class="mujx-tab-btn ${activeFloatingTab === "settings" ? "active" : ""}" type="button" role="tab" data-tab="settings">
          \u2699\uFE0F Settings
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
      } catch {
      }
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
          }
        });
      } else if (activeFloatingTab === "attendance") {
        if (attendance.records?.length) {
          renderAttendancePanel({
            records: attendance.records,
            threshold: prefs.attendanceThreshold,
            borderlineBand: prefs.borderlineBand,
            wrap: body
          });
        } else {
          body.innerHTML = `
          <div class="mujx-empty">
            <div style="font-size:24px; margin-bottom:6px;">\u{1F4CA}</div>
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
            weights: prefs.assumedInternalWeights
          });
        } else {
          body.innerHTML = `
          <div class="mujx-empty">
            <div style="font-size:24px; margin-bottom:6px;">\u{1F4DD}</div>
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
            updatedAt: (/* @__PURE__ */ new Date()).toLocaleTimeString(),
            attendanceRecords: attendance.records
          });
        } else {
          body.innerHTML = `
          <div class="mujx-empty">
            <div style="font-size:24px; margin-bottom:6px;">\u{1F4C5}</div>
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
            <span>Borderline Risk Band (\xB1%)</span>
            <input class="mujx-input" data-pref="borderlineBand" type="number" min="1" max="15" value="${currentPrefs.borderlineBand}" style="width:75px;">
          </label>

          <label class="mujx-sub" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Grade Point Cap</span>
            <input class="mujx-input" data-pref="gradeCap" type="number" min="4" max="10" value="${currentPrefs.gradeCap}" style="width:75px;">
          </label>

          <label class="mujx-sub" style="display:flex; justify-content:space-between; align-items:center;">
            <span>Theme</span>
            <select class="mujx-select" data-pref="theme" style="width:100px;">
              <option value="auto" ${currentPrefs.theme === "auto" ? "selected" : ""}>Auto</option>
              <option value="light" ${currentPrefs.theme === "light" ? "selected" : ""}>Light</option>
              <option value="dark" ${currentPrefs.theme === "dark" ? "selected" : ""}>Dark</option>
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
          theme: newTheme
        });
        statusEl.textContent = "\u2713 Preferences saved successfully.";
        setTimeout(() => remount(), 500);
      });
      resetBtn?.addEventListener("click", async () => {
        await resetCache();
        statusEl.textContent = "\u2713 Cache cleared.";
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
        [STORAGE_KEYS.hubState]: { open: true, lastTab: activeFloatingTab }
      }).catch(() => {
      });
    };
    const closeDrawer = () => {
      drawer.setAttribute("hidden", "");
      toggleBtn.setAttribute("aria-expanded", "false");
      chrome.storage.local.set({
        [STORAGE_KEYS.hubState]: { open: false, lastTab: activeFloatingTab }
      }).catch(() => {
      });
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
          [STORAGE_KEYS.hubState]: { open: true, lastTab: activeFloatingTab }
        }).catch(() => {
        });
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
})();
