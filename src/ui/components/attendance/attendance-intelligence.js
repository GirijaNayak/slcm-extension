import { INJECT_ATTR } from "../../../shared/constants.js";
import { textOf } from "../../../shared/dom.js";
import { syncThemeAttribute, watchThemeChanges } from "../../../shared/theme.js";

const STORAGE_KEY = "st_customTarget";
const DEFAULT_TARGET = 75;
const MIN_TARGET = 1;
const MAX_TARGET = 99;
const ROUND_UP_MARGIN = 1; // portal rounds % up: target T is met when % > T-1
const SAVE_DEBOUNCE_MS = 400;

const CSS = `
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

// Exact SLCM integer formulas matching MUJ FISH
export function calcClassesNeeded(p, n, T) {
  const t = T - ROUND_UP_MARGIN;
  const num = t * n - 100 * p;
  if (num < 0) return 0;
  return Math.floor(num / (100 - t)) + 1;
}

export function calcSafeSkips(p, n, T) {
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
  const headRow = (tbl.tHead && tbl.tHead.rows[0]) || tbl.rows[0];
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

/**
 * Robust Attendance Intelligence controller that mounts on #kt_ViewTable
 * or any attendance table, supports DataTables AJAX refreshes via MutationObserver,
 * and seamlessly matches Image 3.
 */
export function enhanceAttendanceTable({ table, initialTarget = 75, onTargetChange }) {
  if (!table) return () => {};

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
          attendanceThreshold: val,
        });
      } catch {}
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
    } catch {}
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
        setCell(cn, "–", "na");
        setCell(ac, "–", "na");
        continue;
      }

      counted++;
      const needed = calcClassesNeeded(p, n, customTarget);
      const skips = calcSafeSkips(p, n, customTarget);
      if (needed > 0) below++;

      setCell(cn, needed === 0 ? "–" : needed, needed === 0 ? "ok" : "need");
      setCell(ac, skips === Infinity ? "∞" : skips > 0 ? skips : "–", skips > 0 ? "ok" : "na");
    }

    if (summaryEl) {
      const allOk = counted > 0 && below === 0;
      summaryEl.classList.toggle("st-all-ok", allOk);
      setText(
        summaryEl,
        counted === 0
          ? ""
          : allOk
          ? `All courses at or above ${customTarget}%`
          : `${below} of ${counted} course${counted === 1 ? "" : "s"} below ${customTarget}%`
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

/**
 * Automatically locates #kt_ViewTable on Attendance Summary page and initializes intelligence.
 */
export function mountAttendanceSummaryFeature(prefs = {}) {
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
        },
      });
    }
    return true;
  }

  if (tryMount()) return () => cleanup?.();

  // If table is still loading via DataTables / AJAX, observe body until it appears
  const bodyObs = new MutationObserver(() => {
    if (tryMount()) {
      bodyObs.disconnect();
    }
  });
  bodyObs.observe(document.body, { childList: true, subtree: true });

  // Fallback poll
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
