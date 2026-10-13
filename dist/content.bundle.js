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
  function isLoginPage(doc = document, href = location.href) {
    if (!doc) return false;
    let path = "";
    try {
      path = new URL(href).pathname.toLowerCase();
    } catch {
      path = String(href || "").toLowerCase();
    }
    if (path.startsWith("/student") || path.includes("/home/dashboard") || path.includes("/academic") || path.includes("/examination")) {
      return false;
    }
    if (doc.querySelector?.(".kt-header__topbar-username") || doc.querySelector?.(".kt-aside__brand") || doc.querySelector?.(".kt-header") || doc.querySelector?.("#kt_header") || doc.querySelector?.("a[href*='Logout' i]") || doc.querySelector?.("a[href*='logout' i]") || doc.querySelector?.("a[href*='SignOut' i]")) {
      return false;
    }
    if (path.includes("/account/login") || path.includes("/home/logout") || path.includes("/account/forgotpassword") || path.includes("/account/externallogin")) {
      return true;
    }
    if (path === "/" || path === "" || path === "/home/index" || path === "/home") {
      const text = (doc.body?.textContent || "").toLowerCase();
      const hasLoginButton = Boolean(
        doc.querySelector?.("input[type='submit'][value*='Sign In' i]") || doc.querySelector?.("input[type='submit'][value*='Login' i]") || doc.querySelector?.("button[type='submit']") || doc.querySelector?.("form[action*='Login' i]")
      );
      if (hasLoginButton || text.includes("welcome to muj portal") || text.includes("sign in") || text.includes("parent login")) {
        return true;
      }
    }
    return false;
  }
  function detectPage(doc = document, href = location.href) {
    if (isLoginPage(doc, href)) {
      return { kind: PAGE_KINDS.login, reason: "login-form" };
    }
    const url = new URL(href);
    const path = url.pathname.toLowerCase();
    const title = (doc.title || "").toLowerCase();
    const heading = collectHeadings(doc);
    const body = `${title} ${heading} ${path}`;
    if (matches(body, ["attendance", "attendence"]) || /attendance/.test(path)) {
      return { kind: PAGE_KINDS.attendance, reason: "path-or-heading" };
    }
    if (matches(body, ["internal mark", "internal marks", "sessional", "continuous assessment", "student marks"]) || /internalmark|studentmarks|marksdetail|mark/.test(path)) {
      return { kind: PAGE_KINDS.marks, reason: "path-or-heading" };
    }
    if (matches(body, ["grade card", "grades", "grade sheet", "gradesheet", "sgpa", "cgpa"]) || /grade|cgpaga/.test(path) || /examination/.test(path) && !/mark/.test(path)) {
      return { kind: PAGE_KINDS.grades, reason: "path-or-heading" };
    }
    if (matches(body, ["time table", "timetable", "calendar", "schedule"]) || /calendar|timetable|time-table/.test(path)) {
      return { kind: PAGE_KINDS.timetable, reason: "path-or-heading" };
    }
    if (matches(body, ["dashboard", "student home"]) || /\/student\/?$|\/student\/home|\/home\/dashboard/.test(path)) {
      return { kind: PAGE_KINDS.home, reason: "home" };
    }
    return { kind: PAGE_KINDS.other, reason: "unclassified" };
  }
  function collectHeadings(doc) {
    return [...doc.querySelectorAll("h1,h2,h3,.kt-subheader__title,.page-title,.breadcrumb")].slice(0, 8).map((node) => node.textContent).join(" ").toLowerCase();
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

  // src/shared/theme.js
  function detectIsDarkMode() {
    if (typeof document === "undefined" || typeof window === "undefined") {
      return false;
    }
    const root = document.documentElement;
    const body = document.body;
    if (root?.classList?.contains("dark") || body?.classList?.contains("dark") || root?.classList?.contains("theme-dark") || body?.classList?.contains("theme-dark") || root?.classList?.contains("dark-mode") || body?.classList?.contains("dark-mode") || root?.classList?.contains("dark-theme") || body?.classList?.contains("dark-theme") || root?.classList?.contains("slcm-dark") || body?.classList?.contains("slcm-dark") || root?.getAttribute?.("data-theme") === "dark" || body?.getAttribute?.("data-theme") === "dark" || root?.getAttribute?.("data-color-scheme") === "dark" || body?.getAttribute?.("data-color-scheme") === "dark" || root?.hasAttribute?.("data-darkreader-mode") || body?.hasAttribute?.("data-darkreader-mode")) {
      return true;
    }
    try {
      const checkNodes = [
        body,
        root,
        document.getElementById("kt_body"),
        document.querySelector(".kt-content"),
        document.querySelector(".kt-wrapper"),
        document.querySelector(".kt-page"),
        document.querySelector(".kt-header")
      ];
      for (const el of checkNodes) {
        if (!el) continue;
        const bg = window.getComputedStyle(el).backgroundColor;
        const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
        if (m) {
          const [r, g, b] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
          if (!bg.includes("rgba(0, 0, 0, 0)")) {
            const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
            if (luminance < 140) {
              return true;
            }
          }
        }
      }
    } catch {
    }
    if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
      return true;
    }
    return false;
  }
  function syncThemeAttribute(target = document.documentElement) {
    const isDark = detectIsDarkMode();
    const theme = isDark ? "dark" : "light";
    if (target?.setAttribute) {
      target.setAttribute("data-mujx-theme", theme);
      target.setAttribute("data-theme", theme);
    }
    return theme;
  }
  function watchThemeChanges(onChange) {
    if (typeof window === "undefined") return () => {
    };
    const handler = () => {
      const theme = syncThemeAttribute();
      onChange?.(theme);
    };
    let mql = null;
    if (typeof window.matchMedia === "function") {
      mql = window.matchMedia("(prefers-color-scheme: dark)");
      mql.addEventListener?.("change", handler);
    }
    const obs = new MutationObserver(() => {
      handler();
    });
    if (document.documentElement) {
      obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-darkreader-mode"] });
    }
    if (document.body) {
      obs.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "data-darkreader-mode"] });
    }
    handler();
    return () => {
      mql?.removeEventListener?.("change", handler);
      obs.disconnect();
    };
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
    const isDark = detectIsDarkMode();
    wrap.setAttribute("data-theme", isDark ? "dark" : "light");
    wrap.setAttribute("data-mujx-theme", isDark ? "dark" : "light");
    shadow.append(link, wrap);
    place(host, placement);
    hosts.add(host);
    injected.add(host);
    return { host, shadow, wrap };
  }
  function applyTheme(wrap, theme) {
    const isDark = theme === "dark" || theme !== "light" && detectIsDarkMode();
    const applied = isDark ? "dark" : "light";
    wrap?.setAttribute?.("data-theme", applied);
    wrap?.setAttribute?.("data-mujx-theme", applied);
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
        const result2 = original.apply(this, args);
        notify();
        return result2;
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
  function logWarn(message, meta = {}) {
    console.warn(PREFIX, message, sanitize(meta));
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

  // src/data/slcm-client.js
  var inflight = /* @__PURE__ */ new Map();
  var SessionExpiredError = class extends Error {
    constructor(path) {
      super("SLCM session expired or login is required.");
      this.name = "SessionExpiredError";
      this.path = path;
    }
  };
  async function slcmRequest(path, { method = "POST", body, timeoutMs = 12e3, retries = 1 } = {}) {
    const key = `${method}:${path}:${typeof body === "string" ? body : JSON.stringify(body || {})}`;
    if (inflight.has(key)) return inflight.get(key);
    const task = runWithRetry(path, method, body, timeoutMs, retries);
    inflight.set(key, task);
    try {
      return await task;
    } finally {
      inflight.delete(key);
    }
  }
  async function runWithRetry(path, method, body, timeoutMs, retries) {
    let lastError;
    for (let attempt = 0; attempt <= retries; attempt += 1) {
      try {
        return await once(path, method, body, timeoutMs);
      } catch (error) {
        lastError = error;
        if (error instanceof SessionExpiredError) throw error;
        if (attempt === retries) break;
        await wait(300 * (attempt + 1));
      }
    }
    throw lastError;
  }
  async function once(path, method, body, timeoutMs) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const token = readAntiForgeryToken();
      const headers = {
        Accept: "application/json, text/plain, */*",
        "X-Requested-With": "XMLHttpRequest"
      };
      let payload = body;
      if (method !== "GET") {
        headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
        const params = new URLSearchParams(body || {});
        if (token && !params.has("__RequestVerificationToken")) {
          params.set("__RequestVerificationToken", token);
        }
        payload = params.toString();
      }
      const response = await fetch(path, {
        method,
        headers,
        body: method === "GET" ? void 0 : payload,
        credentials: "include",
        signal: controller.signal
      });
      if (response.redirected && /login|logout/i.test(response.url)) {
        throw new SessionExpiredError(path);
      }
      const contentType = response.headers.get("content-type") || "";
      const text = await response.text();
      if (/login|sign in/i.test(text) && /password/i.test(text) && text.length > 400) {
        throw new SessionExpiredError(path);
      }
      if (!response.ok) {
        logWarn("request failed", { status: response.status, path });
        const error = new Error(`HTTP ${response.status}`);
        error.status = response.status;
        error.path = path;
        error.bodyPreview = text.slice(0, 80);
        throw error;
      }
      if (contentType.includes("json") || looksJson(text)) {
        return { ok: true, data: JSON.parse(text), path };
      }
      return { ok: true, data: text, path, kind: "html" };
    } finally {
      clearTimeout(timer);
    }
  }
  function readAntiForgeryToken() {
    const input = document.querySelector('input[name="__RequestVerificationToken"]');
    return input?.value || "";
  }
  function looksJson(text) {
    const trimmed = text.trim();
    return trimmed.startsWith("{") || trimmed.startsWith("[");
  }
  function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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

  // src/ui/components/attendance/attendance-intelligence.js
  var STORAGE_KEY = "st_customTarget";
  var DEFAULT_TARGET = 75;
  var MIN_TARGET = 1;
  var MAX_TARGET = 99;
  var ROUND_UP_MARGIN = 1;
  var SAVE_DEBOUNCE_MS = 400;
  var CSS = `
  :root, [data-theme="light"] {
    --att-bar-bg: #f3f6f9;
    --att-bar-border: rgba(0, 0, 0, 0.06);
    --att-bar-text: #464457;
    --att-input-bg: #ffffff;
    --att-input-border: #cbd5e1;
    --att-input-color: #212529;
    --att-summary-color: #64748b;
    --att-summary-ok: #166534;
    --att-th-bg: #f3f6f9;
    --att-th-color: #464457;
    --att-td-color: #212529;
    --att-ok-color: #166534;
    --att-need-color: #b42318;
    --att-na-color: #94a3b8;
  }

  @media (prefers-color-scheme: dark) {
    :root {
      --att-bar-bg: rgba(255, 255, 255, 0.06);
      --att-bar-border: rgba(255, 255, 255, 0.1);
      --att-bar-text: #e2e8f0;
      --att-input-bg: rgba(0, 0, 0, 0.35);
      --att-input-border: rgba(255, 255, 255, 0.2);
      --att-input-color: #f1f5f9;
      --att-summary-color: #94a3b8;
      --att-summary-ok: #34d399;
      --att-th-bg: rgba(255, 255, 255, 0.06);
      --att-th-color: #e2e8f0;
      --att-td-color: #cbd5e1;
      --att-ok-color: #34d399;
      --att-need-color: #fb7185;
      --att-na-color: #64748b;
    }
  }

  html.dark, body.dark, [data-theme="dark"], [data-mujx-theme="dark"], html[data-darkreader-mode], body[data-darkreader-mode], html[data-color-scheme="dark"] {
    --att-bar-bg: rgba(255, 255, 255, 0.06) !important;
    --att-bar-border: rgba(255, 255, 255, 0.1) !important;
    --att-bar-text: #e2e8f0 !important;
    --att-input-bg: rgba(0, 0, 0, 0.35) !important;
    --att-input-border: rgba(255, 255, 255, 0.2) !important;
    --att-input-color: #f1f5f9 !important;
    --att-summary-color: #94a3b8 !important;
    --att-summary-ok: #34d399 !important;
    --att-th-bg: rgba(255, 255, 255, 0.06) !important;
    --att-th-color: #e2e8f0 !important;
    --att-td-color: #cbd5e1 !important;
    --att-ok-color: #34d399 !important;
    --att-need-color: #fb7185 !important;
    --att-na-color: #64748b !important;
  }

  #st-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
    margin: 0 0 10px;
    padding: 8px 12px;
    background: var(--att-bar-bg) !important;
    border: 1px solid var(--att-bar-border) !important;
    border-radius: 6px;
    font-size: 13px;
    user-select: none;
    -webkit-user-select: none;
  }
  #st-bar[hidden] { display: none; }
  .st-target {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font-weight: 600;
    color: var(--att-bar-text) !important;
  }
  .st-target input {
    width: 64px;
    padding: 2px 4px;
    text-align: center;
    font-size: 13px;
    border: 1px solid var(--att-input-border) !important;
    border-radius: 4px;
    background: var(--att-input-bg) !important;
    color: var(--att-input-color) !important;
    transition: border-color .15s, box-shadow .15s;
  }
  .st-target input:focus {
    outline: none;
    border-color: #5d78ff !important;
    box-shadow: 0 0 0 2px rgba(93, 120, 255, .2);
  }
  #st-summary {
    color: var(--att-summary-color) !important;
    font-size: 13px;
    font-weight: 600;
    transition: color .2s;
  }
  #st-summary.st-all-ok {
    color: var(--att-summary-ok) !important;
  }
  th.st-th {
    text-align: center;
    background: var(--att-th-bg) !important;
    color: var(--att-th-color) !important;
    font-weight: 600;
    font-size: 13px;
  }
  td.st-td {
    text-align: center;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
    font-size: 13px;
    color: var(--att-td-color) !important;
  }
  td.st-td[data-s="need"] {
    color: var(--att-need-color) !important;
  }
  td.st-td[data-s="ok"] {
    color: var(--att-ok-color) !important;
  }
  td.st-td[data-s="na"] {
    color: var(--att-na-color) !important;
    font-weight: 400;
  }
`;
  function injectStyles() {
    if (document.getElementById("st-styles")) return;
    const s = document.createElement("style");
    s.id = "st-styles";
    s.textContent = CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function calcClassesNeeded(p, n, T) {
    const t = T - ROUND_UP_MARGIN;
    const num = t * n - 100 * p;
    if (num < 0) return 0;
    return Math.floor(num / (100 - t)) + 1;
  }
  function calcSafeSkips(p, n, T) {
    const t = T - ROUND_UP_MARGIN;
    const s = 100 * p - t * n;
    if (s <= 0) return 0;
    if (t <= 0) return Infinity;
    return Math.floor((s - 1) / t);
  }
  function clampTarget(v) {
    const n = parseInt(v, 10);
    if (isNaN(n)) return DEFAULT_TARGET;
    return Math.min(MAX_TARGET, Math.max(MIN_TARGET, n));
  }
  function setText(el, s) {
    s = String(s);
    if (el.textContent !== s) el.textContent = s;
  }
  function setCell(cell, text, state) {
    setText(cell, text);
    if (cell.dataset.s !== state) cell.dataset.s = state;
  }
  function getColumns(tbl) {
    const headRow = tbl.tHead && tbl.tHead.rows[0] || tbl.rows[0];
    if (!headRow) return null;
    const idx = { present: -1, total: -1 };
    for (let i = 0; i < headRow.cells.length; i++) {
      const c = headRow.cells[i];
      if (c.id === "st-classes-needed" || c.id === "st-absences-custom") continue;
      const t = textOf(c).toLowerCase().trim();
      if (t === "present" || t.includes("attended") || t === "total present") idx.present = i;
      else if (t === "total" || t.includes("conducted") || t === "total class") idx.total = i;
    }
    if (idx.present === -1 || idx.total === -1) return null;
    return { headRow, idx };
  }
  function dropOurCells(row) {
    row.querySelectorAll(".st-cn-td, .st-ac-td").forEach((el) => el.remove());
  }
  function removeOurs(tbl) {
    tbl.querySelectorAll("#st-classes-needed, #st-absences-custom, .st-cn-td, .st-ac-td").forEach((el) => el.remove());
  }
  function makeTh(id, text, tip) {
    const th = document.createElement("th");
    th.id = id;
    th.className = "st-th";
    th.title = tip;
    th.textContent = text;
    return th;
  }
  function injectHeaders(headRow) {
    if (!headRow.querySelector("#st-classes-needed")) {
      headRow.appendChild(
        makeTh("st-classes-needed", "Classes Needed", "Consecutive classes you must attend to reach your target")
      );
    }
    if (!headRow.querySelector("#st-absences-custom")) {
      headRow.appendChild(
        makeTh("st-absences-custom", "Safe Skips", "Classes you can miss and still stay at or above your target")
      );
    }
  }
  function ensureCells(row) {
    let cn = row.querySelector(".st-cn-td");
    let ac = row.querySelector(".st-ac-td");
    if (!cn) {
      cn = row.insertCell(-1);
      cn.className = "st-td st-cn-td";
    }
    if (!ac) {
      ac = row.insertCell(-1);
      ac.className = "st-td st-ac-td";
    }
    return { cn, ac };
  }
  function buildBar(currentTarget, onTargetChange) {
    const b = document.createElement("div");
    b.id = "st-bar";
    b.setAttribute(INJECT_ATTR, "att-bar");
    const label = document.createElement("label");
    label.className = "st-target";
    label.appendChild(document.createTextNode("Target attendance"));
    const input = document.createElement("input");
    input.type = "number";
    input.id = "st-custom-target";
    input.value = String(currentTarget);
    input.min = String(MIN_TARGET);
    input.max = String(MAX_TARGET);
    input.step = "1";
    input.inputMode = "numeric";
    input.addEventListener("keydown", (e) => {
      if ([".", "-", "+", "e", "E"].includes(e.key)) e.preventDefault();
      if (e.key === "Enter") input.blur();
    });
    input.addEventListener("input", () => {
      const val = parseInt(input.value, 10);
      if (!isNaN(val) && val >= MIN_TARGET && val <= MAX_TARGET) {
        onTargetChange(val);
      }
    });
    input.addEventListener("blur", () => {
      const val = clampTarget(input.value);
      input.value = String(val);
      onTargetChange(val);
    });
    label.appendChild(input);
    label.appendChild(document.createTextNode("%"));
    const summaryEl = document.createElement("span");
    summaryEl.id = "st-summary";
    b.appendChild(label);
    b.appendChild(summaryEl);
    return { bar: b, input, summaryEl };
  }
  function enhanceAttendanceTable({ table, initialTarget = 75, onTargetChange }) {
    if (!table) return () => {
    };
    syncThemeAttribute(document.documentElement);
    const unwatchTheme = watchThemeChanges(() => {
      syncThemeAttribute(document.documentElement);
    });
    injectStyles();
    let customTarget = clampTarget(initialTarget);
    let userEdited = false;
    let saveTimer = null;
    let bar = null;
    let inputEl = null;
    let summaryEl = null;
    let pending = false;
    function saveTarget(val) {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        try {
          chrome?.storage?.local?.set({
            [STORAGE_KEY]: val,
            attendanceThreshold: val
          });
        } catch {
        }
      }, SAVE_DEBOUNCE_MS);
    }
    function loadTarget() {
      try {
        chrome?.storage?.local?.get([STORAGE_KEY, "attendanceThreshold"], (data) => {
          if (userEdited) return;
          const val = data?.[STORAGE_KEY] ?? data?.attendanceThreshold;
          if (val != null) {
            const v = clampTarget(val);
            if (v !== customTarget) {
              customTarget = v;
              if (inputEl && inputEl.isConnected) inputEl.value = String(v);
              schedule();
            }
          }
        });
      } catch {
      }
    }
    function mountBar() {
      if (bar && bar.isConnected) return;
      if (!bar) {
        const built = buildBar(customTarget, (newVal) => {
          userEdited = true;
          customTarget = newVal;
          saveTarget(newVal);
          onTargetChange?.(newVal);
          schedule();
        });
        bar = built.bar;
        inputEl = built.input;
        summaryEl = built.summaryEl;
      }
      const host = table.closest(".dataTables_wrapper, .table-responsive, .table-scrollable") || table;
      if (host.parentNode) {
        host.parentNode.insertBefore(bar, host);
      }
    }
    function update() {
      const cols = getColumns(table);
      if (!cols) {
        removeOurs(table);
        if (bar) bar.hidden = true;
        return;
      }
      mountBar();
      bar.hidden = false;
      injectHeaders(cols.headRow);
      const { present, total } = cols.idx;
      const minCols = Math.max(present, total);
      let below = 0;
      let counted = 0;
      const rows = table.rows;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row === cols.headRow || row.querySelector("th")) continue;
        if (row.cells.length <= minCols || row.querySelector("td[colspan], td.dataTables_empty")) {
          dropOurCells(row);
          continue;
        }
        const { cn, ac } = ensureCells(row);
        const p = parseInt(textOf(row.cells[present]), 10);
        const n = parseInt(textOf(row.cells[total]), 10);
        if (isNaN(p) || isNaN(n) || n <= 0) {
          setCell(cn, "\u2013", "na");
          setCell(ac, "\u2013", "na");
          continue;
        }
        counted++;
        const needed = calcClassesNeeded(p, n, customTarget);
        const skips = calcSafeSkips(p, n, customTarget);
        if (needed > 0) below++;
        setCell(cn, needed === 0 ? "\u2013" : needed, needed === 0 ? "ok" : "need");
        setCell(ac, skips === Infinity ? "\u221E" : skips > 0 ? skips : "\u2013", skips > 0 ? "ok" : "na");
      }
      if (summaryEl) {
        const allOk = counted > 0 && below === 0;
        summaryEl.classList.toggle("st-all-ok", allOk);
        setText(
          summaryEl,
          counted === 0 ? "" : allOk ? `All courses at or above ${customTarget}%` : `${below} of ${counted} course${counted === 1 ? "" : "s"} below ${customTarget}%`
        );
      }
    }
    const observer = new MutationObserver(schedule);
    function observe() {
      if (table && table.isConnected) {
        observer.observe(table, { childList: true, subtree: true });
      }
    }
    function schedule() {
      if (pending) return;
      pending = true;
      setTimeout(run, 50);
    }
    function run() {
      pending = false;
      observer.disconnect();
      try {
        update();
      } catch (e) {
        console.warn("[MUJX attendance]", e);
      } finally {
        observe();
      }
    }
    loadTarget();
    observe();
    schedule();
    return () => {
      unwatchTheme();
      observer.disconnect();
      removeOurs(table);
      bar?.remove();
    };
  }
  function mountAttendanceSummaryFeature(prefs = {}) {
    let cleanup = null;
    function tryMount() {
      const table = document.getElementById("kt_ViewTable") || document.querySelector("table");
      if (!table) return false;
      const cols = getColumns(table);
      if (!cols) return false;
      if (!cleanup) {
        cleanup = enhanceAttendanceTable({
          table,
          initialTarget: prefs.attendanceThreshold || DEFAULT_TARGET,
          onTargetChange: (t) => {
            prefs.attendanceThreshold = t;
          }
        });
      }
      return true;
    }
    if (tryMount()) return () => cleanup?.();
    const bodyObs = new MutationObserver(() => {
      if (tryMount()) {
        bodyObs.disconnect();
      }
    });
    bodyObs.observe(document.body, { childList: true, subtree: true });
    let tries = 0;
    const poll = setInterval(() => {
      if (tryMount() || ++tries > 25) {
        clearInterval(poll);
        bodyObs.disconnect();
      }
    }, 200);
    return () => {
      clearInterval(poll);
      bodyObs.disconnect();
      cleanup?.();
    };
  }

  // src/ui/components/dashboard/dashboard.js
  var KEY = "mujx_dashboard_enabled";
  var MAX_CONCURRENT_DETAILS = 2;
  var DAY_DEBOUNCE_MS = 250;
  var MIN_ATTENDANCE = 75;
  var attCache = /* @__PURE__ */ new Map();
  var viewDate = /* @__PURE__ */ new Date();
  var abortCtl = null;
  var navTimer = null;
  var dateLabel = null;
  var todayBtn = null;
  var DASHBOARD_CSS = `
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
  function injectStyles2() {
    if (document.getElementById("mujx-dashboard-styles")) return;
    const s = document.createElement("style");
    s.id = "mujx-dashboard-styles";
    s.setAttribute(INJECT_ATTR, "dash-styles");
    s.textContent = DASHBOARD_CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function getColumns2() {
    const ev = document.getElementById("kt_ViewEvent");
    const col9 = ev && (ev.closest(".col-md-9") || ev.closest(".col-lg-9"));
    return { ev, col9, leftCol: col9 ? col9.previousElementSibling : null };
  }
  function findEventsHeader(col9) {
    return Array.from((col9 || document).querySelectorAll("h6")).find(
      (h) => h.textContent.includes("List of Events")
    );
  }
  function mountAcademicDashboard({ container, prefs }) {
    let cleanup = null;
    async function tryMount() {
      const { ev, col9, leftCol } = getColumns2();
      if (!ev && !col9) return false;
      if (!cleanup) {
        syncThemeAttribute(document.documentElement);
        const unwatchTheme = watchThemeChanges(() => {
          syncThemeAttribute(document.documentElement);
        });
        injectStyles2();
        let enabled = true;
        try {
          const stored = await chrome.storage.local.get([KEY]);
          if (stored && stored[KEY] !== void 0) {
            enabled = Boolean(stored[KEY]);
          }
        } catch {
        }
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
    const { ev, col9 } = getColumns2();
    const row = col9 && col9.parentElement;
    const anchor = row || ev && ev.parentElement;
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
  function mountTimetable(leftCol) {
    if (!leftCol) return null;
    if (!leftCol.querySelector("#mujx-timetable")) {
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
    todayBtn.addEventListener("click", () => goToDate(/* @__PURE__ */ new Date()));
    const prevBtn = document.createElement("button");
    prevBtn.type = "button";
    prevBtn.textContent = "\u2039";
    prevBtn.setAttribute("aria-label", "Previous day");
    prevBtn.addEventListener("click", () => shiftDay(-1));
    dateLabel = document.createElement("span");
    dateLabel.className = "mujx-date";
    const nextBtn = document.createElement("button");
    nextBtn.type = "button";
    nextBtn.textContent = "\u203A";
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
    const today = sameDay(viewDate, /* @__PURE__ */ new Date());
    if (dateLabel) {
      dateLabel.textContent = today ? "Today" : viewDate.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
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
          PreNext: "3"
        }
      });
      if (ctl.signal.aborted || !container.isConnected) return;
      const list = Array.isArray(res?.data) ? res.data.filter((x) => x && typeof x === "object").sort(byStart) : [];
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
            body: { EventID: String(eventId) }
          });
          if (signal?.aborted || !card.isConnected) return;
          const type = d?.data?.AttendanceType?.trim?.() || "";
          if (!type) return;
          attCache.set(eventId, type);
          applyAttendanceBadge(card, statusEl, type);
        } catch {
        }
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
    const tint = t.includes("absent") ? "#e53935" : t.includes("not considered") ? "#2196f3" : t.includes("present") ? "#22c55e" : null;
    if (tint) {
      statusEl.style.color = tint;
      card.style.setProperty("--c", tint);
    }
  }
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
        body: { StudentCode: "" }
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
    if (!ok || kind !== "UPCOMING" && kind !== "CLOSED") {
      const secNotice = document.createElement("div");
      secNotice.className = "mujx-notice mujx-notice-secondary";
      secNotice.textContent = data && data.ErrorMessage === "OPEN" ? "The attendance summary is closed for now." : "No attendance data available.";
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
    const heads = full ? [
      ["S. No.", 1],
      ["Course Name", 0],
      ["Present", 1],
      ["Absent", 1],
      ["Total", 1],
      ["%", 1]
    ] : [
      ["S. No.", 1],
      ["Course Name", 0],
      ["Status", 0]
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
      const tdNum = document.createElement("td");
      tdNum.className = "mujx-c";
      tdNum.textContent = String(i + 1);
      tr.appendChild(tdNum);
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
        (it) => !isNaN(parseFloat(it.Percentage)) && parseFloat(it.Percentage) < 75
      );
      if (below75.length) {
        const banner = document.createElement("div");
        banner.className = "mujx-low-att-banner";
        banner.innerHTML = `<strong>\u26A0\uFE0F ${below75.length} course${below75.length > 1 ? "s" : ""} below 75%</strong> \u2014 attend urgently to avoid debarment risk.`;
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
    pill.textContent = value != null && value !== "" ? String(value) : "\u2013";
    return pill;
  }
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
  var pad = (n) => String(n).padStart(2, "0");
  var apiDate = (d) => `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
  var sameDay = (a, b) => a.toDateString() === b.toDateString();
  var fmtTime = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
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
    return isNaN(e) ? fmtTime(s) : `${fmtTime(s)} \u2013 ${fmtTime(e)}`;
  }
  async function runLimitedJobs(jobs, limit, signal) {
    let i = 0;
    const worker = async () => {
      while (!signal?.aborted && i < jobs.length) {
        const job = jobs[i++];
        try {
          await job();
        } catch {
        }
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

  // src/ui/components/timetable/timetable-intelligence.js
  var TIMETABLE_CSS = `
  #slcm-loading-indicator {
    position: fixed;
    right: 76px;
    bottom: calc(16px + env(safe-area-inset-bottom, 0px));
    z-index: 9999;
    opacity: 0;
    pointer-events: none;
    max-width: calc(100vw - 92px);
    padding: 5px 12px;
    border-radius: 14px;
    color: #fff;
    font: 12px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    box-shadow: 0 2px 6px rgba(0,0,0,.25);
    cursor: pointer;
    user-select: none;
    transition: opacity .3s, background .3s;
  }
  #slcm-loading-indicator:hover {
    opacity: 1 !important;
  }
  /* Highlight Today's column */
  #calendar .fc-today {
    background: rgba(93, 120, 255, .07) !important;
  }
  #calendar .fc-today .fc-day-number {
    background: #5d78ff;
    color: #fff;
    border-radius: 50%;
    min-width: 22px;
    height: 22px;
    line-height: 22px;
    display: inline-block;
    text-align: center;
    font-weight: 700;
    padding: 0 2px;
  }
  /* Event styling */
  #calendar .fc-event {
    border-radius: 3px !important;
    font-size: 11px !important;
    line-height: 1.35 !important;
    padding: 2px 4px !important;
    color: #fff !important;
  }
  #calendar .fc-event .fc-title,
  #calendar .fc-event .fc-time {
    color: #fff !important;
  }
  .box-attandance {
    display: inline-block;
    width: 15px;
    height: 15px;
    margin-right: 5px;
    vertical-align: middle;
  }
`;
  function injectStyles3() {
    if (document.getElementById("mujx-tt-styles")) return;
    const s = document.createElement("style");
    s.id = "mujx-tt-styles";
    s.setAttribute(INJECT_ATTR, "tt-styles");
    s.textContent = TIMETABLE_CSS;
    (document.head || document.documentElement).appendChild(s);
  }
  function ensureMainWorldTimetable() {
    if (document.getElementById("mujx-main-timetable-script")) return;
    try {
      const s = document.createElement("script");
      s.id = "mujx-main-timetable-script";
      s.src = chrome?.runtime?.getURL?.("src/content/timetable-main.js") || "";
      if (s.src) {
        (document.head || document.documentElement).appendChild(s);
      }
    } catch {
    }
  }
  function enhanceTimetablePage({ prefs } = {}) {
    const calendarEl = document.getElementById("calendar");
    if (!calendarEl) return () => {
    };
    injectStyles3();
    ensureMainWorldTimetable();
    lockDrag();
    return () => {
      cleanupTimetableInjections();
    };
  }
  function lockDrag() {
    document.addEventListener(
      "mousedown",
      (e) => {
        const t = e.target;
        if (e.button === 0 && t && t.closest && t.closest("#calendar .fc-event")) {
          e.stopPropagation();
        }
      },
      true
    );
  }
  function cleanupTimetableInjections() {
    document.getElementById("mujx-custom-legends")?.remove();
    document.querySelectorAll(`[${INJECT_ATTR}="tt-legend"]`).forEach((el) => el.remove());
    document.getElementById("slcm-loading-indicator")?.remove();
  }

  // src/calculations/provisional-grade.js
  var RELATIVE_GRADING_DISCLAIMER = "Important: SGPA and Grade Prediction Is Only an Estimate. MUJ follows a relative grading system. These predictions use the configured marks thresholds and available assessment data, so your final grades and SGPA may differ from the university's officially declared results. Do not treat the predicted SGPA as your final SGPA.";
  var THEORY_GRADE_THRESHOLDS = Object.freeze([
    { grade: "A+", min: 82, max: Infinity, condition: ">= 82" },
    { grade: "A", min: 72, max: 82, condition: ">= 72 and < 82" },
    { grade: "B", min: 62, max: 72, condition: ">= 62 and < 72" },
    { grade: "C", min: 52, max: 62, condition: ">= 52 and < 62" },
    { grade: "D", min: 42, max: 52, condition: ">= 42 and < 52" },
    { grade: "E", min: 35.000001, max: 42, condition: "> 35 and < 42" },
    { grade: "F", min: -Infinity, max: 35, condition: "< 35" }
  ]);
  var LAB_PBL_GRADE_THRESHOLDS = Object.freeze([
    { grade: "A+", min: 90, max: Infinity, condition: ">= 90" },
    { grade: "A", min: 80, max: 90, condition: ">= 80 and < 90" },
    { grade: "B", min: 70, max: 80, condition: ">= 70 and < 80" },
    { grade: "C", min: 60, max: 70, condition: ">= 60 and < 70" },
    { grade: "D", min: 50, max: 60, condition: ">= 50 and < 60" },
    { grade: "E", min: 35.000001, max: 50, condition: "> 35 and < 50" },
    { grade: "F", min: -Infinity, max: 35, condition: "< 35" }
  ]);
  function classifyCourseType(course = {}) {
    const name = String(course.courseName || course.subject || course.name || "").toUpperCase();
    const code = String(course.courseCode || course.code || "").toUpperCase();
    if (name.includes("PBL") || name.includes("PROJECT BASED LEARNING") || code.includes("PBL") || name.includes("PROJECT-BASED")) {
      return "pbl";
    }
    const hasTheoryComponents = course.mte !== null && course.mte !== void 0 || course.mte1 !== null && course.mte1 !== void 0 || course.cws !== null && course.cws !== void 0;
    const hasPrs = course.prs !== null && course.prs !== void 0;
    if (hasTheoryComponents && !hasPrs) {
      return "theory";
    }
    if (/\b(LAB|LABORATORY|PRACTICAL|WORKSHOP)\b/i.test(name) || code.endsWith("L") || code.endsWith("P") || /(?:103\d|213\d|313\d|323\d)/.test(code) || // MUJ lab course code convention (e.g. CSE1031, CSE2131)
    hasPrs && !hasTheoryComponents) {
      return "lab";
    }
    return "theory";
  }
  function classifyProvisionalGrade(totalMarks, courseType = "theory") {
    const normType = String(courseType || "theory").toLowerCase();
    if (normType !== "theory" && normType !== "lab" && normType !== "pbl") {
      return {
        ok: false,
        grade: null,
        status: "unknown_type",
        totalMarks: null,
        courseType: normType,
        minThreshold: null,
        isBoundaryAmbiguous: false,
        message: `Unknown course type '${courseType}'. Must be 'theory', 'lab', or 'pbl'.`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    if (totalMarks === null || totalMarks === void 0 || totalMarks === "") {
      return {
        ok: false,
        grade: null,
        status: "missing_marks",
        totalMarks: null,
        courseType: normType,
        minThreshold: null,
        isBoundaryAmbiguous: false,
        message: "Marks value is missing or unavailable.",
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const score = Number(totalMarks);
    if (!Number.isFinite(score) || score < 0) {
      return {
        ok: false,
        grade: null,
        status: "invalid_marks",
        totalMarks: score,
        courseType: normType,
        minThreshold: null,
        isBoundaryAmbiguous: false,
        message: `Invalid marks score (${totalMarks}).`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    if (Math.abs(score - 35) < 1e-9) {
      return {
        ok: false,
        grade: null,
        status: "undefined_boundary",
        totalMarks: 35,
        courseType: normType,
        minThreshold: null,
        isBoundaryAmbiguous: true,
        message: "Score is exactly 35 marks. The university specification defines E as 'Above 35' and F as 'Below 35', leaving exactly 35 marks undefined.",
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const isLabOrPbl = normType === "lab" || normType === "pbl";
    if (isLabOrPbl) {
      if (score >= 90) return result("A+", 90, normType, score);
      if (score >= 80) return result("A", 80, normType, score);
      if (score >= 70) return result("B", 70, normType, score);
      if (score >= 60) return result("C", 60, normType, score);
      if (score >= 50) return result("D", 50, normType, score);
      if (score > 35 && score < 50) return result("E", 35.01, normType, score);
      if (score < 35) return result("F", 0, normType, score);
    } else {
      if (score >= 82) return result("A+", 82, normType, score);
      if (score >= 72) return result("A", 72, normType, score);
      if (score >= 62) return result("B", 62, normType, score);
      if (score >= 52) return result("C", 52, normType, score);
      if (score >= 42) return result("D", 42, normType, score);
      if (score > 35 && score < 42) return result("E", 35.01, normType, score);
      if (score < 35) return result("F", 0, normType, score);
    }
    return {
      ok: false,
      grade: null,
      status: "unresolved",
      totalMarks: score,
      courseType: normType,
      minThreshold: null,
      isBoundaryAmbiguous: true,
      message: `Marks value ${score} could not be resolved.`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER
    };
  }
  function result(grade, minThreshold, courseType, score) {
    return {
      ok: true,
      grade,
      status: "resolved",
      totalMarks: score,
      courseType,
      minThreshold,
      isBoundaryAmbiguous: false,
      message: `Score ${score} classifies as provisional grade ${grade} (${courseType}).`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER
    };
  }

  // src/calculations/rounding.js
  function roundTo(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
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

  // src/data/credit-resolver.js
  function inferCourseCredits(courseName = "", courseCode = "", courseType = "theory", isSatisfactory = false) {
    const name = String(courseName || "").toLowerCase();
    const code = String(courseCode || "").toUpperCase();
    if (courseType === "lab" || courseType === "pbl" || isSatisfactory || code === "MEE1007" || name.includes("creativity & innovation") || name.includes("creativity and innovation") || name.includes("pbl") || name.includes("project-based") || name.includes("project based") || code.includes("PBL") || code === "CSE1270" || code === "CSE2170" || code === "CSE2270" || code === "CSE3170" || /\b(lab|laboratory|practical|workshop)\b/i.test(name) || code.endsWith("L") || code.endsWith("P") || /(?:103\d|213\d|313\d|323\d)/.test(code) || /(?:30|31|32|33|34|35|36|37|38|39)$/.test(code)) {
      return 1;
    }
    if (name.includes("technical writing") || code.startsWith("LLC")) {
      return 1;
    }
    if (code === "CSE2201" || // Design and Analysis of Algorithm
    code === "CSE2240" || // Automata and Compiler Design
    code === "MAS1001" || // Calculus & Matrices
    code === "CHY1001" || // Engineering Chemistry
    code === "EEE1002" || // Electrical & Electronics Systems
    code === "PHY1001" || // Engineering Physics
    name.includes("calculus") || name.includes("automata") || name.includes("design and analysis of algorithm")) {
      return 4;
    }
    return 3;
  }

  // src/data/marks-adapter.js
  function extractMarksFromDocument(doc = document) {
    const tables = [...doc.querySelectorAll("table")];
    for (const table of tables) {
      const summary = parseInternalMarksSummaryTable(table);
      if (summary.available && summary.courses.length) {
        return {
          records: summary.courses.map((c) => ({
            subject: c.courseName,
            courseCode: c.courseCode,
            obtained: c.internalSubtotal,
            component: "Internal Subtotal",
            credits: c.credits,
            letter: c.officialGrade,
            ...c
          })),
          summary,
          table,
          source: "internal-marks-summary",
          available: true
        };
      }
    }
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
  function parseInternalMarksSummaryTable(table) {
    if (!table) return { available: false, courses: [], table: null };
    const matrix = tableToMatrix(table);
    const { headers, rows, headerRow, allRows, headerRowIndex } = matrix;
    const map = headerIndexMap(headers);
    const courseIdx = pickIndex(map, ["course name", "course", "subject", "paper name", "paper"]);
    const codeIdx = pickIndex(map, ["course code", "code", "subject code"]);
    const mte1Idx = pickIndex(map, ["mte1", "mte 1", "mid term 1", "midterm 1"]);
    const mte2Idx = pickIndex(map, ["mte2", "mte 2", "mid term 2", "midterm 2"]);
    let mteIdx = -1;
    if (map["mte"] !== void 0) {
      mteIdx = map["mte"];
    } else if (map["mid term"] !== void 0) {
      mteIdx = map["mid term"];
    } else if (map["midterm"] !== void 0) {
      mteIdx = map["midterm"];
    } else if (mte1Idx < 0 && mte2Idx < 0) {
      mteIdx = pickIndex(map, ["mte", "mid term", "midterm"]);
    }
    const cwsIdx = pickIndex(map, ["cws", "class work", "sessional", "sessionals", "cws marks"]);
    const reSessionIdx = pickIndex(map, ["re-session", "resession", "re session"]);
    const prsIdx = pickIndex(map, ["prs", "practical", "lab", "practical marks"]);
    const totalIdx = pickIndex(map, ["total", "total marks", "internal total"]);
    const creditIdx = pickIndex(map, ["credits", "credit", "cr"]);
    const gradeIdx = pickIndex(map, ["grade", "letter grade", "official grade"]);
    const hasMarksColumns = mte1Idx >= 0 || mteIdx >= 0 || cwsIdx >= 0 || prsIdx >= 0 || totalIdx >= 0;
    if (courseIdx < 0 || !hasMarksColumns) {
      return { available: false, courses: [], table };
    }
    const courses = [];
    const seen = /* @__PURE__ */ new Set();
    for (const cells of rows) {
      if (!cells || !cells.length) continue;
      const firstCell = (cells[0] || "").toLowerCase();
      if (firstCell.includes("total") || cells.some((c) => c && c.toLowerCase() === "total")) {
        continue;
      }
      let courseName = (courseIdx >= 0 ? cells[courseIdx] : "") || cells[0] || "";
      let courseCode = (codeIdx >= 0 ? cells[codeIdx] : "") || "";
      if (!courseCode && courseName) {
        const match = courseName.match(/\(([A-Za-z0-9\-\/]{4,12})\)/);
        if (match) {
          courseCode = match[1].trim().toUpperCase();
        }
      }
      if (!courseName && !courseCode) continue;
      const dedupeKey = `${courseCode || courseName}`.toUpperCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      const mte1 = mte1Idx >= 0 ? parseNumber(cells[mte1Idx]) : null;
      const mte2 = mte2Idx >= 0 ? parseNumber(cells[mte2Idx]) : null;
      const mteDirect = mteIdx >= 0 ? parseNumber(cells[mteIdx]) : null;
      const reSession = reSessionIdx >= 0 ? parseNumber(cells[reSessionIdx]) : null;
      const cws = cwsIdx >= 0 ? parseNumber(cells[cwsIdx]) : null;
      const prs = prsIdx >= 0 ? parseNumber(cells[prsIdx]) : null;
      const declaredTotal = totalIdx >= 0 ? parseNumber(cells[totalIdx]) : null;
      const credits = creditIdx >= 0 ? parseNumber(cells[creditIdx]) : null;
      const officialGrade = gradeIdx >= 0 && cells[gradeIdx] ? cells[gradeIdx].trim().toUpperCase() : null;
      let mte = mteDirect;
      if (mte === null) {
        if (mte1 !== null && mte2 !== null) {
          let bestMte1 = mte1;
          let bestMte2 = mte2;
          if (reSession !== null) {
            if (mte1 < mte2) bestMte1 = Math.max(mte1, reSession);
            else bestMte2 = Math.max(mte2, reSession);
          }
          mte = roundTo(bestMte1 + bestMte2, 2);
        } else if (mte1 !== null) {
          mte = reSession !== null ? Math.max(mte1, reSession) : mte1;
        } else if (mte2 !== null) {
          mte = reSession !== null ? Math.max(mte2, reSession) : mte2;
        }
      }
      const courseType = classifyCourseType({ courseName, courseCode, prs, mte, mte1, cws });
      let internalSubtotal = 0;
      if (courseType === "lab" || courseType === "pbl") {
        if (prs !== null) {
          internalSubtotal = prs;
        } else if (mte !== null || cws !== null) {
          internalSubtotal = (mte !== null ? mte : 0) + (cws !== null ? cws : 0);
        } else if (declaredTotal !== null) {
          internalSubtotal = declaredTotal;
        }
      } else {
        internalSubtotal = (mte !== null ? mte : 0) + (cws !== null ? cws : 0);
        if (internalSubtotal === 0 && declaredTotal !== null) {
          internalSubtotal = declaredTotal;
        } else if (internalSubtotal === 0 && prs !== null) {
          internalSubtotal = prs;
        }
      }
      courses.push({
        id: `${courseCode || courseName}`,
        courseCode,
        courseName,
        courseType,
        mte1,
        mte2,
        mte,
        reSession,
        cws,
        prs,
        declaredTotal,
        internalSubtotal: roundTo(internalSubtotal, 2),
        credits: credits !== null ? credits : inferCourseCredits(courseName, courseCode, courseType),
        officialGrade: officialGrade || null
      });
    }
    return {
      available: courses.length > 0,
      table,
      courses,
      headerRow,
      allRows,
      headerRowIndex
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
  function isSatisfactorySubject(course = {}, satisfactoryMap = {}) {
    const code = String(course.courseCode || course.code || course.id || "").trim().toUpperCase();
    const name = String(course.courseName || course.name || course.subject || "").trim().toUpperCase();
    const officialGrade = String(course.officialGrade || course.grade || course.letter || "").trim().toUpperCase();
    if (officialGrade === "S" || officialGrade === "U" || officialGrade === "AP") {
      return true;
    }
    if (satisfactoryMap) {
      if (code && satisfactoryMap[code]) return true;
      if (name && satisfactoryMap[name]) return true;
    }
    if (code === "MEE1007" || name.includes("CREATIVITY & INNOVATION") || name.includes("CREATIVITY AND INNOVATION")) {
      return true;
    }
    return false;
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
    const result2 = calculateSGPA(courses);
    return {
      ok: result2.ok,
      sgpa: result2.sgpa,
      credits: result2.totalCredits,
      gradedCredits: result2.gradedCredits,
      creditPoints: result2.totalWeightedPoints,
      included: result2.courses.map((c) => ({
        ...c,
        letter: c.grade,
        creditPoints: c.weightedPoints
      })),
      issues: result2.warnings
    };
  }

  // src/calculations/ete-required.js
  var THEORY_TARGET_MIN_MARKS = Object.freeze({
    "A+": 82,
    A: 72,
    B: 62,
    C: 52,
    D: 42,
    E: 35.01,
    F: 0
  });
  var DEFAULT_ETE_MAX = 40;
  function calculateRequiredEte({
    targetGrade,
    mte,
    cws = null,
    cwsEstimate = null,
    eteMax = DEFAULT_ETE_MAX,
    courseType = "theory"
  }) {
    const normType = String(courseType || "theory").toLowerCase();
    if (normType !== "theory") {
      return {
        ok: false,
        eligible: false,
        targetGrade,
        targetThreshold: null,
        mte: null,
        cws: null,
        cwsEstimated: false,
        cwsPending: false,
        internalSubtotal: 0,
        requiredETE: null,
        unclampedRequired: null,
        eteMax,
        feasibility: "ineligible",
        percentOfEte: null,
        message: `Course type is '${normType}'. The ETE Target Calculator is enabled exclusively for theory courses (labs and PBL are excluded).`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const normGrade = String(targetGrade || "").trim().toUpperCase();
    if (!(normGrade in THEORY_TARGET_MIN_MARKS)) {
      return {
        ok: false,
        eligible: true,
        targetGrade,
        targetThreshold: null,
        mte: null,
        cws: null,
        cwsEstimated: false,
        cwsPending: false,
        internalSubtotal: 0,
        requiredETE: null,
        unclampedRequired: null,
        eteMax,
        feasibility: "undefined_target",
        percentOfEte: null,
        message: `Unknown target grade '${targetGrade}'. Supported theory target grades: A+, A, B, C, D, E.`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const targetThreshold = THEORY_TARGET_MIN_MARKS[normGrade];
    const mteNum = Number(mte);
    if (!Number.isFinite(mteNum) || mteNum < 0) {
      return {
        ok: false,
        eligible: true,
        targetGrade: normGrade,
        targetThreshold,
        mte: null,
        cws: null,
        cwsEstimated: false,
        cwsPending: false,
        internalSubtotal: 0,
        requiredETE: null,
        unclampedRequired: null,
        eteMax,
        feasibility: "invalid_input",
        percentOfEte: null,
        message: `MTE marks (${mte}) are invalid or missing.`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const isCwsVerified = cws !== null && cws !== void 0 && Number.isFinite(Number(cws)) && Number(cws) >= 0;
    const isCwsEstimated = !isCwsVerified && cwsEstimate !== null && Number.isFinite(Number(cwsEstimate)) && Number(cwsEstimate) >= 0;
    const cwsPending = !isCwsVerified && !isCwsEstimated;
    const effectiveCws = isCwsVerified ? Number(cws) : isCwsEstimated ? Number(cwsEstimate) : 0;
    const internalSubtotal = roundTo(mteNum + effectiveCws, 2);
    if (cwsPending) {
      const requiredWithoutCws = targetThreshold - mteNum;
      return {
        ok: true,
        eligible: true,
        targetGrade: normGrade,
        targetThreshold,
        mte: mteNum,
        cws: null,
        cwsEstimated: false,
        cwsPending: true,
        internalSubtotal: mteNum,
        requiredETE: null,
        unclampedRequired: roundTo(requiredWithoutCws, 2),
        eteMax,
        feasibility: "cws_pending",
        percentOfEte: null,
        message: `CWS marks are pending. Need ${roundTo(requiredWithoutCws, 2)} total marks across (CWS + ETE) to achieve grade ${normGrade}. Enter a CWS estimate to calculate the ETE requirement.`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const unclampedRequired = targetThreshold - internalSubtotal;
    let feasibility = "achievable";
    let displayedRequired = 0;
    let percentOfEte = 0;
    if (unclampedRequired <= 0) {
      feasibility = "already_secured";
      displayedRequired = 0;
      percentOfEte = 0;
    } else if (unclampedRequired > eteMax) {
      feasibility = "impossible";
      displayedRequired = roundTo(unclampedRequired, 2);
      percentOfEte = roundTo(displayedRequired / eteMax * 100, 1);
    } else {
      feasibility = "achievable";
      displayedRequired = roundTo(unclampedRequired, 2);
      percentOfEte = roundTo(displayedRequired / eteMax * 100, 1);
    }
    return {
      ok: true,
      eligible: true,
      targetGrade: normGrade,
      targetThreshold,
      mte: mteNum,
      cws: isCwsVerified ? effectiveCws : null,
      cwsEstimated: isCwsEstimated,
      cwsPending: false,
      internalSubtotal,
      requiredETE: displayedRequired,
      unclampedRequired: roundTo(unclampedRequired, 2),
      eteMax,
      feasibility,
      percentOfEte,
      message: formatMessage(feasibility, displayedRequired, eteMax, normGrade, internalSubtotal, isCwsEstimated),
      disclaimer: RELATIVE_GRADING_DISCLAIMER
    };
  }
  function formatMessage(feasibility, req, max, grade, subtotal, estimated) {
    const estNote = estimated ? " (based on estimated CWS)" : "";
    if (feasibility === "already_secured") {
      return `Grade ${grade} is already secured with current internal marks of ${subtotal}${estNote}! Required ETE: 0/${max}.`;
    }
    if (feasibility === "impossible") {
      return `Grade ${grade} requires ${req}/${max} marks in ETE${estNote}, which exceeds the maximum possible score (${max}).`;
    }
    return `Target ${grade} requires ${req}/${max} marks in ETE (${Math.round(req / max * 100)}%)${estNote}.`;
  }

  // src/ui/components/marks/ete-target-control.js
  var activePopover2 = null;
  function openEteTargetPopover({ anchorEl, course, defaultTarget = "A" }) {
    closeActiveEtePopover();
    let currentTarget = defaultTarget;
    let customCwsEstimate = null;
    const popover = document.createElement("div");
    popover.className = "mujx-ete-popover";
    popover.setAttribute(INJECT_ATTR, "ete-popover");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "End Term Exam Target Calculator");
    document.body.appendChild(popover);
    activePopover2 = popover;
    function render() {
      const calc = calculateRequiredEte({
        targetGrade: currentTarget,
        mte: course.mte,
        cws: course.cws,
        cwsEstimate: customCwsEstimate,
        eteMax: 40,
        courseType: course.courseType || "theory"
      });
      const statusBadgeClass = calc.feasibility === "achievable" ? "safe" : calc.feasibility === "already_secured" ? "safe" : calc.feasibility === "impossible" ? "danger" : "warning";
      const statusLabel = calc.feasibility === "achievable" ? "\u2713 Achievable" : calc.feasibility === "already_secured" ? "\u2605 Target Secured" : calc.feasibility === "impossible" ? "\u2715 Exceeds ETE Max" : calc.feasibility === "cws_pending" ? "\u2139 CWS Pending" : "Unresolved";
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
        <button type="button" data-role="close-popover" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; padding:2px 6px;">\u2715</button>
      </div>

      <!-- Target Grade Selection Buttons -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11px; opacity:0.8; margin-bottom:5px; font-weight:600;">Select Target Grade:</div>
        <div style="display:flex; gap:5px; flex-wrap:wrap;">
          ${["A+", "A", "B", "C", "D", "E"].map(
        (g) => `
                <button type="button" class="mujx-target-chip ${g === currentTarget ? "active" : ""}" data-grade="${g}" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer; border:1px solid ${g === currentTarget ? "var(--mujx-accent, #2dd4bf)" : "rgba(125,125,125,0.3)"}; background:${g === currentTarget ? "rgba(45,212,191,0.22)" : "rgba(255,255,255,0.06)"}; color:${g === currentTarget ? "var(--mujx-accent, #2dd4bf)" : "#e2e8f0"};">
                  ${g}
                </button>
              `
      ).join("")}
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
            ${course.cws !== null ? `<strong>${course.cws} / 30</strong>` : `<span style="color:#f59e0b; font-size:11px;">Pending</span>`}
          </span>
        </div>
        ${course.cws === null ? `
              <div style="margin-top:4px; padding-top:4px; border-top:1px dashed rgba(125,125,125,0.2); display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; opacity:0.8;">CWS Estimate:</span>
                <input type="number" min="0" max="30" placeholder="e.g. 24" value="${customCwsEstimate !== null ? customCwsEstimate : ""}" data-role="cws-estimate-input" style="width:65px; padding:2px 5px; font-size:11px; border-radius:4px; background:rgba(0,0,0,0.4); border:1px solid #0d9488; color:#fff;" />
              </div>
            ` : ""}
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
            ${calc.requiredETE !== null ? calc.requiredETE : "\u2014"}
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
    popover.addEventListener("click", (e) => e.stopPropagation());
    popover.addEventListener("mousedown", (e) => e.stopPropagation());
    render();
    positionPopover2(popover, anchorEl, course);
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
  function closeActiveEtePopover() {
    if (activePopover2) {
      activePopover2._cleanupListeners?.();
      activePopover2.remove();
      activePopover2 = null;
    }
  }
  function positionPopover2(popover, anchorEl, course) {
    if (popover.dataset.positioned === "true" && popover.style.left && popover.style.top) {
      return;
    }
    const targetAnchor = anchorEl && anchorEl.isConnected ? anchorEl : (course?.id ? document.querySelector(`[data-course-id="${course.id}"]`) : null) || anchorEl;
    if (!targetAnchor) return;
    const rect = targetAnchor.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
      return;
    }
    const popoverWidth = 330;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    let left = rect.right + scrollX - popoverWidth;
    if (left < scrollX + 12) {
      left = scrollX + 12;
    }
    const maxLeft = scrollX + window.innerWidth - popoverWidth - 16;
    if (left > maxLeft) {
      left = maxLeft;
    }
    let top = rect.bottom + scrollY + 6;
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

  // src/ui/components/marks/prediction-panel.js
  function enhanceInternalMarksPage({ table, courses, headerRow, allRows, headerRowIndex, satisfactoryMap = {}, initialEteEstimates = {} }) {
    if (!table || !courses || !courses.length) return () => {
    };
    const courseEteEstimates = {};
    courses.forEach((c) => {
      const codeKey = (c.courseCode || "").toUpperCase();
      const idKey = (c.id || "").toUpperCase();
      const nameKey = (c.courseName || "").toUpperCase();
      const savedVal = initialEteEstimates[codeKey] ?? initialEteEstimates[idKey] ?? initialEteEstimates[nameKey] ?? initialEteEstimates[c.id];
      if (savedVal !== void 0 && savedVal !== null && !isNaN(Number(savedVal))) {
        courseEteEstimates[c.id] = Number(savedVal);
      } else {
        courseEteEstimates[c.id] = c.courseType === "theory" ? 28 : 25;
      }
    });
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get(["userCustomEteEstimates"], (res) => {
          const stored = res?.userCustomEteEstimates;
          if (stored && typeof stored === "object") {
            let hasDiff = false;
            courses.forEach((c) => {
              const codeKey = (c.courseCode || "").toUpperCase();
              const idKey = (c.id || "").toUpperCase();
              const nameKey = (c.courseName || "").toUpperCase();
              const val = stored[codeKey] ?? stored[idKey] ?? stored[nameKey] ?? stored[c.id];
              if (val !== void 0 && val !== null && !isNaN(Number(val))) {
                const num = Number(val);
                if (courseEteEstimates[c.id] !== num) {
                  courseEteEstimates[c.id] = num;
                  hasDiff = true;
                }
              }
            });
            if (hasDiff) {
              render();
            }
          }
        });
      }
    } catch (_) {
    }
    const theadRows = table.querySelectorAll("thead tr");
    const actualHeaderRow = headerRow || (theadRows.length ? theadRows[theadRows.length - 1] : table.rows[0]);
    if (!actualHeaderRow) return () => {
    };
    const rowsPool = allRows && allRows.length ? allRows.slice((headerRowIndex ?? 0) + 1) : table.tBodies.length ? [...table.tBodies].flatMap((body) => [...body.rows]) : [...table.rows].slice(1);
    const courseRows = [];
    for (const row of rowsPool) {
      if (row === actualHeaderRow) continue;
      const text = (row.textContent || "").toLowerCase();
      if (text.includes("total")) continue;
      if (row.cells && row.cells.length >= 3) {
        courseRows.push(row);
      }
    }
    document.querySelectorAll(`[${INJECT_ATTR}="marks-banner"]`).forEach((b) => b.remove());
    const banner = document.createElement("div");
    banner.className = "mujx-marks-banner";
    banner.setAttribute(INJECT_ATTR, "marks-banner");
    const insertTarget = table.closest(".table-responsive, .table-scrollable") || table;
    insertTarget.parentNode?.insertBefore(banner, insertTarget);
    const isTh = Boolean(actualHeaderRow.querySelector("th"));
    const hasNativeCreditCol = Array.from(actualHeaderRow.cells).some(
      (c) => c.textContent.trim().toLowerCase().includes("credit") && !c.hasAttribute(INJECT_ATTR)
    );
    let thCredit = null;
    if (!hasNativeCreditCol) {
      thCredit = document.createElement(isTh ? "th" : "td");
      thCredit.textContent = "Credits";
      thCredit.setAttribute(INJECT_ATTR, "marks-credit-col");
      thCredit.title = "Course credits (used for credit-weighted SGPA calculation)";
      thCredit.style.fontWeight = "700";
      thCredit.style.textAlign = "center";
      actualHeaderRow.append(thCredit);
    }
    const thPred = document.createElement(isTh ? "th" : "td");
    thPred.textContent = "Predicted Grade";
    thPred.setAttribute(INJECT_ATTR, "marks-pred-col");
    thPred.title = "Provisional grade based on internal marks + estimated ETE";
    thPred.style.fontWeight = "700";
    thPred.style.textAlign = "center";
    actualHeaderRow.append(thPred);
    const thTarget = document.createElement(isTh ? "th" : "td");
    thTarget.textContent = "ETE Calculator";
    thTarget.setAttribute(INJECT_ATTR, "marks-target-col");
    thTarget.title = "Calculate required ETE score for target grade";
    thTarget.style.fontWeight = "700";
    thTarget.style.textAlign = "center";
    actualHeaderRow.append(thTarget);
    const rowInjections = [];
    courseRows.forEach((row, i) => {
      if (i >= courses.length) return;
      const course = courses[i];
      let tdCredit = null;
      if (!hasNativeCreditCol) {
        tdCredit = document.createElement("td");
        tdCredit.setAttribute(INJECT_ATTR, "marks-credit-col");
        tdCredit.style.textAlign = "center";
        row.append(tdCredit);
      }
      const tdPred = document.createElement("td");
      tdPred.setAttribute(INJECT_ATTR, "marks-pred-col");
      tdPred.style.textAlign = "center";
      tdPred.style.fontWeight = "600";
      row.append(tdPred);
      const tdTarget = document.createElement("td");
      tdTarget.setAttribute(INJECT_ATTR, "marks-target-col");
      tdTarget.style.textAlign = "center";
      row.append(tdTarget);
      rowInjections.push({ row, index: i, course, tdPred, tdTarget, tdCredit });
    });
    function render() {
      const predictedCourseList = courses.map((course) => {
        const isSatisfactory = isSatisfactorySubject(course, satisfactoryMap);
        if (isSatisfactory) {
          const totalMarks = course.internalSubtotal !== null && course.internalSubtotal !== void 0 ? course.internalSubtotal : course.declaredTotal ?? course.prs ?? 0;
          const isPass = totalMarks >= 35;
          const provGrade = isPass ? "S" : "U";
          return {
            ...course,
            isSatisfactory: true,
            estimatedEte: 0,
            projectedTotal: totalMarks,
            provisionalGrade: provGrade,
            provisionalStatus: isPass ? "pass" : "fail",
            grade: provGrade,
            letter: provGrade,
            excludeFromGpa: true
          };
        }
        const estimatedEte = courseEteEstimates[course.id] ?? (course.courseType === "theory" ? 28 : 25);
        const projectedTotal = course.internalSubtotal + estimatedEte;
        const provisional = classifyProvisionalGrade(projectedTotal, course.courseType);
        return {
          ...course,
          isSatisfactory: false,
          estimatedEte,
          projectedTotal,
          provisionalGrade: provisional.grade,
          provisionalStatus: provisional.status,
          grade: provisional.grade,
          letter: provisional.grade
        };
      });
      const sgpaResult = calculateSGPA(predictedCourseList);
      const sgpaText = sgpaResult.ok && sgpaResult.sgpa !== null ? sgpaResult.sgpa.toFixed(2) : "\u2014";
      banner.innerHTML = `
      <!-- Prominent Relative-Grading Disclaimer -->
      <div class="mujx-disclaimer-card" style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.35); border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:11.5px; line-height:1.45; color:#fde68a;">
        <div style="font-weight:700; display:flex; align-items:center; gap:6px; color:#f59e0b; margin-bottom:3px; font-size:12px;">
          <span>\u26A0\uFE0F</span>
          <span>Important: SGPA and Grade Prediction Is Only an Estimate</span>
        </div>
        <div>
          MUJ follows a <strong>relative grading system</strong>. These predictions use the configured marks thresholds and available internal assessment data, so your final grades and SGPA may differ from the university's officially declared results. Do not treat the predicted SGPA as your final SGPA.
        </div>
      </div>

      <!-- Main Prediction Strip -->
      <div class="mujx-grade-banner-main" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div class="mujx-grade-sgpa-pill" style="background:#1e1e2d; border:1px solid #2d2d3f; border-radius:8px; padding:8px 16px; box-shadow:0 1px 3px rgba(0,0,0,0.35); display:flex; flex-direction:column; align-items:flex-start;">
          <span class="mujx-grade-sgpa-label" style="font-size:10px; font-weight:600; color:#94a3b8; letter-spacing:0.05em; text-transform:uppercase;">PREDICTED SGPA (FORECAST)</span>
          <span class="mujx-grade-sgpa-value" style="font-size:24px; font-weight:800; color:#f1f5f9; line-height:1.15;">${sgpaText}</span>
        </div>

        <div class="mujx-grade-stats" style="display:flex; gap:16px; flex-wrap:wrap;">
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.totalCredits}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Total Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.evaluatedCount} / ${courses.length}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Predicted Courses</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.totalWeightedPoints}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Total Points (\u03A3 Ci\xD7Gi)</span>
          </div>
        </div>

      </div>
    `;
      rowInjections.forEach(({ course, tdPred, tdTarget, tdCredit }) => {
        const predCourse = predictedCourseList.find((p) => p.id === course.id);
        const estEte = courseEteEstimates[course.id];
        const provGrade = predCourse?.provisionalGrade || "\u2014";
        const totalScore = predCourse?.projectedTotal;
        if (tdCredit) {
          const isSat = Boolean(predCourse?.isSatisfactory);
          const defaultCr = course.courseType === "lab" || course.courseType === "pbl" || isSat ? 1 : 3;
          const crVal = course.credits ?? defaultCr;
          const existingSelect = tdCredit.querySelector("select");
          if (existingSelect) {
            if (document.activeElement !== existingSelect && Number(existingSelect.value) !== crVal) {
              existingSelect.value = String(crVal);
            }
          } else {
            tdCredit.innerHTML = `
            <select class="mujx-credit-dropdown" style="padding:2px 5px; font-size:11px; border-radius:4px; background:rgba(0,0,0,0.3); border:1px solid rgba(13,148,136,0.4); color:inherit; font-weight:700; cursor:pointer;" title="Adjust course credits">
              <option value="1" ${crVal === 1 ? "selected" : ""}>1</option>
              <option value="2" ${crVal === 2 ? "selected" : ""}>2</option>
              <option value="3" ${crVal === 3 ? "selected" : ""}>3</option>
              <option value="4" ${crVal === 4 ? "selected" : ""}>4</option>
              <option value="0" ${crVal === 0 ? "selected" : ""}>0</option>
            </select>
          `;
            tdCredit.querySelector("select")?.addEventListener("change", (e) => {
              const newCr = Number(e.target.value);
              course.credits = newCr;
              try {
                if (typeof chrome !== "undefined" && chrome.storage?.local) {
                  const codeKey = (course.courseCode || "").toUpperCase();
                  const idKey = (course.id || "").toUpperCase();
                  const nameKey = (course.courseName || "").toUpperCase();
                  chrome.storage.local.get(["userCustomCredits", "courseCredits"], (res) => {
                    const userCreds = res?.userCustomCredits || {};
                    const courseCreds = res?.courseCredits || {};
                    if (codeKey) {
                      userCreds[codeKey] = newCr;
                      courseCreds[codeKey] = newCr;
                    }
                    if (idKey) {
                      userCreds[idKey] = newCr;
                      courseCreds[idKey] = newCr;
                    }
                    if (nameKey) {
                      userCreds[nameKey] = newCr;
                      courseCreds[nameKey] = newCr;
                    }
                    chrome.storage.local.set({
                      userCustomCredits: userCreds,
                      courseCredits: courseCreds
                    });
                  });
                }
              } catch (_) {
              }
              render();
            });
          }
        }
        if (predCourse?.isSatisfactory) {
          const isPass = (predCourse?.projectedTotal ?? 0) >= 35;
          const sGrade = isPass ? "S" : "U";
          const sColor = isPass ? "#10b981" : "#ef4444";
          tdPred.innerHTML = `
          <div style="display:flex; justify-content:center; align-items:center;">
            <span style="font-size:14px; font-weight:800; color:${sColor};">${sGrade}</span>
          </div>
        `;
        } else {
          const existingInput = tdPred.querySelector(`[data-course-ete="${course.id}"]`);
          const gradeSpan = tdPred.querySelector(`[data-role="prov-grade"]`);
          const scoreSpan = tdPred.querySelector(`[data-role="total-score"]`);
          if (existingInput && gradeSpan && scoreSpan) {
            gradeSpan.textContent = provGrade;
            scoreSpan.textContent = `(${totalScore}/100)`;
            if (document.activeElement !== existingInput && existingInput.value !== String(estEte)) {
              existingInput.value = estEte !== void 0 && estEte !== null ? String(estEte) : "";
            }
          } else {
            tdPred.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
              <div style="display:inline-flex; align-items:center; gap:4px;">
                <span data-role="prov-grade" style="font-size:13px; font-weight:800; color:var(--mujx-accent, #2dd4bf);">${provGrade}</span>
                <span data-role="total-score" style="font-size:10px; opacity:0.7;">(${totalScore}/100)</span>
              </div>
              <div style="font-size:10.5px; opacity:0.7; display:flex; align-items:center; gap:2px;">
                <span>ETE:</span>
                <input type="number" min="0" max="40" value="${estEte}" data-course-ete="${course.id}" data-mujx="course-ete-input" style="width:38px; padding:1px 3px; font-size:10px; border-radius:3px; background:rgba(0,0,0,0.3); border:1px solid rgba(13,148,136,0.5); color:#fff; text-align:center;" />
              </div>
            </div>
          `;
            const rowEteInput = tdPred.querySelector(`[data-course-ete="${course.id}"]`);
            let eteSaveTimer = null;
            const saveScoreToStorage = (val, immediate = false) => {
              try {
                if (typeof chrome !== "undefined" && chrome.storage?.local) {
                  const codeKey = (course.courseCode || "").toUpperCase();
                  const idKey = (course.id || "").toUpperCase();
                  const nameKey = (course.courseName || "").toUpperCase();
                  if (initialEteEstimates) {
                    if (codeKey) initialEteEstimates[codeKey] = val;
                    if (idKey) initialEteEstimates[idKey] = val;
                    if (nameKey) initialEteEstimates[nameKey] = val;
                    initialEteEstimates[course.id] = val;
                  }
                  const commit = () => {
                    chrome.storage.local.get(["userCustomEteEstimates"], (res) => {
                      const userEte = res?.userCustomEteEstimates || {};
                      if (codeKey) userEte[codeKey] = val;
                      if (idKey) userEte[idKey] = val;
                      if (nameKey) userEte[nameKey] = val;
                      userEte[course.id] = val;
                      chrome.storage.local.set({
                        userCustomEteEstimates: userEte
                      });
                    });
                  };
                  if (eteSaveTimer) clearTimeout(eteSaveTimer);
                  if (immediate) {
                    commit();
                  } else {
                    eteSaveTimer = setTimeout(commit, 250);
                  }
                }
              } catch (_) {
              }
            };
            const handleEteInput = (valStr, isFinal) => {
              if (valStr === "" || valStr === null || valStr === void 0) {
                if (isFinal) {
                  courseEteEstimates[course.id] = 0;
                  rowEteInput.value = "0";
                  saveScoreToStorage(0, true);
                  render();
                }
                return;
              }
              const val = Number(valStr);
              if (!Number.isFinite(val) || val < 0) return;
              const clamped = Math.min(val, 40);
              if (isFinal && clamped !== val) {
                rowEteInput.value = String(clamped);
              }
              courseEteEstimates[course.id] = clamped;
              saveScoreToStorage(clamped, isFinal);
              render();
            };
            rowEteInput?.addEventListener("input", (e) => {
              handleEteInput(e.target.value, false);
            });
            rowEteInput?.addEventListener("change", (e) => {
              handleEteInput(e.target.value, true);
            });
            rowEteInput?.addEventListener("blur", (e) => {
              handleEteInput(e.target.value, true);
            });
          }
        }
        if (!tdTarget.hasChildNodes()) {
          if (predCourse?.isSatisfactory) {
            tdTarget.innerHTML = `<span style="font-size:10.5px; opacity:0.4;">\u2014</span>`;
          } else if (course.courseType === "theory") {
            tdTarget.innerHTML = `
            <button type="button" class="mujx-ete-target-btn" data-course-id="${course.id}" style="padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; background:#1e1e2d; border:1px solid #2d2d3f; color:#f1f5f9; box-shadow:0 1px 3px rgba(0,0,0,0.25); cursor:pointer; white-space:nowrap;">
              ETE Target
            </button>
          `;
            const btn = tdTarget.querySelector(`[data-course-id="${course.id}"]`);
            btn?.addEventListener("click", (e) => {
              e.stopPropagation();
              openEteTargetPopover({ anchorEl: btn, course });
            });
          } else {
            tdTarget.innerHTML = `<span style="font-size:10.5px; opacity:0.5;">Lab / PBL</span>`;
          }
        }
      });
    }
    render();
    return () => {
      banner.remove();
      thCredit?.remove();
      thPred.remove();
      thTarget.remove();
      rowInjections.forEach(({ tdPred, tdTarget, tdCredit }) => {
        tdCredit?.remove();
        tdPred.remove();
        tdTarget.remove();
      });
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
    const today = events.filter((event) => sameDay2(event.startDate, now) && event.endDate);
    const gaps = [];
    for (let i = 0; i < today.length - 1; i += 1) {
      const minutes = (today[i + 1].startDate - today[i].endDate) / 6e4;
      if (minutes >= 15) {
        gaps.push({ after: today[i], before: today[i + 1], minutes: Math.round(minutes) });
      }
    }
    return gaps;
  }
  function sameDay2(a, b) {
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
    if (isLoginPage(document, location.href)) {
      logInfo("login page detected, bypassing extension");
      const unobserve = observePath(() => {
        if (!isLoginPage(document, location.href)) {
          unobserve();
          boot();
        }
      });
      return;
    }
    window[BOOT_FLAG] = true;
    await mount();
    cleanups.push(observePath(() => remount()));
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area === "local") {
        const keys = Object.keys(changes);
        const isPrefChange = keys.some((k) => k === "preferences" || k === "theme");
        if (isPrefChange) remount();
      }
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
      if (isLoginPage(document, location.href)) {
        logInfo("skipping login page in mount");
        return;
      }
      const prefs = await loadPreferences();
      const page = detectPage();
      logInfo("page detected", { kind: page.kind, reason: page.reason });
      if (page.kind === PAGE_KINDS.login) return;
      syncThemeAttribute(document.documentElement);
      cleanups.push(watchThemeChanges(() => syncThemeAttribute(document.documentElement)));
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
      const hasMarksTableInDOM = () => {
        const tables = document.querySelectorAll("table");
        for (const t of tables) {
          const text = (t.textContent || "").toLowerCase();
          if ((text.includes("mte") || text.includes("cws") || text.includes("prs") || text.includes("internal mark")) && (text.includes("course") || text.includes("subject"))) {
            return true;
          }
        }
        return false;
      };
      const isGradesPage = page.kind === PAGE_KINDS.grades || location.pathname.toLowerCase().includes("grade") || location.pathname.toLowerCase().includes("cgpaga") || location.pathname.toLowerCase().includes("examination") || hasGradeTableInDOM();
      const isMarksPage = page.kind === PAGE_KINDS.marks || location.pathname.toLowerCase().includes("mark") || location.pathname.toLowerCase().includes("internalmark") || hasMarksTableInDOM();
      const isHomePage = page.kind === PAGE_KINDS.home || location.pathname.toLowerCase().includes("dashboard") || Boolean(document.getElementById("kt_ViewEvent"));
      const isTimetablePage = page.kind === PAGE_KINDS.timetable || location.pathname.toLowerCase().includes("timetable") || Boolean(document.getElementById("calendar"));
      const isAttendancePage = page.kind === PAGE_KINDS.attendance || location.pathname.toLowerCase().includes("attendance");
      if (prefs.features.homePanel && isHomePage) {
        const dashCleanup = await mountAcademicDashboard({ container: document.body, prefs });
        cleanups.push(dashCleanup);
      }
      if (prefs.features.attendance && !isGradesPage && !isMarksPage) {
        if (isAttendancePage || document.getElementById("kt_ViewTable")) {
          const attCleanup = mountAttendanceSummaryFeature(prefs);
          cleanups.push(attCleanup);
        } else if (attendance.available && attendance.table) {
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
        }
        if (attendance.available && attendance.table) {
          cleanups.push(
            observeTable(attendance.table, () => {
              attendance = extractAttendanceFromDocument();
              remount();
            })
          );
        }
        if (attendance.records?.length) {
          const enhanced = attendance.records.map(
            (r) => enhanceRecord(r, prefs.attendanceThreshold, prefs.borderlineBand)
          );
          await recordAlertsIfAny(enhanced, snapshotChanged, marksChanged);
        }
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
        const marksObserver = new MutationObserver((mutations) => {
          const hasExternalChanges = mutations.some((m) => {
            const target = m.target;
            return !(target?.hasAttribute?.(INJECT_ATTR) || target?.closest?.(`[${INJECT_ATTR}]`));
          });
          if (hasExternalChanges) {
            enhanceMarksTableInline(marks, prefs);
          }
        });
        marksObserver.observe(document.body, { childList: true, subtree: true });
        cleanups.push(() => marksObserver.disconnect());
        const onMarksInteraction = (e) => {
          if (e.target.closest(`[${INJECT_ATTR}], .mujx-ete-popover`)) return;
          const isInteractive = e.target.closest("button, input[type=submit], input[type=button], select, a, input");
          if (isInteractive) {
            setTimeout(() => enhanceMarksTableInline(marks, prefs), 100);
            setTimeout(() => enhanceMarksTableInline(marks, prefs), 350);
            setTimeout(() => enhanceMarksTableInline(marks, prefs), 800);
            setTimeout(() => enhanceMarksTableInline(marks, prefs), 1600);
          }
        };
        document.addEventListener("click", onMarksInteraction, true);
        document.addEventListener("change", onMarksInteraction, true);
        cleanups.push(() => {
          document.removeEventListener("click", onMarksInteraction, true);
          document.removeEventListener("change", onMarksInteraction, true);
        });
      }
      if (prefs.features.timetable) {
        if (isTimetablePage) {
          const ttCleanup = enhanceTimetablePage({ prefs });
          cleanups.push(ttCleanup);
        } else {
          highlightActiveTimetableSlot(timetable.events);
        }
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
      const summary = parseInternalMarksSummaryTable(table);
      if (summary.available && summary.courses.length) {
        const dataSig = summary.courses.map((c) => `${c.id}:${c.internalSubtotal}:${c.mte}:${c.cws}:${c.prs}:${c.credits}`).join(";");
        if (table.getAttribute("data-mujx-marks-sig") === dataSig && table.querySelector(`[${INJECT_ATTR}="marks-pred-col"]`)) {
          continue;
        }
        table.querySelectorAll(`[${INJECT_ATTR}]`).forEach((el) => el.remove());
        table.closest(".table-responsive, .table-scrollable")?.parentNode?.querySelectorAll?.(`[${INJECT_ATTR}="marks-banner"]`)?.forEach((el) => el.remove());
        table.parentNode?.querySelectorAll?.(`[${INJECT_ATTR}="marks-banner"]`)?.forEach((el) => el.remove());
        document.querySelectorAll(`[${INJECT_ATTR}="marks-banner"]`).forEach((el) => el.remove());
        table.setAttribute("data-mujx-marks-sig", dataSig);
        const cleanup = enhanceInternalMarksPage({
          table,
          courses: summary.courses,
          headerRow: summary.headerRow,
          allRows: summary.allRows,
          headerRowIndex: summary.headerRowIndex
        });
        cleanups.push(cleanup);
        continue;
      }
      if (text.includes("mark") || text.includes("component") || text.includes("obtained")) {
        if (table.querySelector(`[${INJECT_ATTR}="marks-weight-intel"]`)) continue;
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
