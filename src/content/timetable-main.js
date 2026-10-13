// Runs in the PAGE's world ("world": "MAIN" in the manifest) because it needs window.jQuery + fullCalendar.
// MAIN-world scripts cannot use chrome.storage directly, so results are cached in memory + the tab's sessionStorage.
(function () {
  'use strict';
  if (window.__mujxTimetableLoaded) return; // guard against double injection
  window.__mujxTimetableLoaded = true;

  const LOG = '[MUJX timetable]';
  const LIST_URL_PART = 'GetStudentCalenderEventList';
  const DETAIL_PART = 'GetEventDetailStudent';
  const DETAIL_URL = '/Student/Academic/' + DETAIL_PART;

  // keys are lower-case attendance types
  const COLORS = {
    'absent': { bg: '#e74c3c', border: '#c0392b', label: 'Absent' },
    'not considered': { bg: '#2196f3', border: '#1976d2', label: 'Not Considered' }
  };

  const CONCURRENCY = 3; // parallel detail requests
  const TIMEOUT_MS = 15000;
  const PAINT_MS = 120;
  const RECENT_MS = 24 * 3600e3;
  const UNMARKED_MS = 7 * 24 * 3600e3;
  const RECHECK_MS = 5 * 60e3;
  const RETRY_AFTER_FAIL_MS = 30e3;
  const SHOW_DELAY_MS = 700;
  const DUP_MS = 300;
  const FETCH_START_CAP_MS = 4000;
  const LOCK_DRAG = true;
  const STORE_PREFIX = 'mujx_att_v2_';
  const STORE_MAX_AGE_MS = 14 * 24 * 3600e3;

  const cache = new Map(); // id -> { type, ts }
  const inflight = new Map(); // id -> jqXHR
  const failedAt = new Map();
  const seenOtherTypes = new Set();
  let queue = [];
  let active = 0;
  let scanning = false;
  let canFetch = document.readyState === 'complete';
  let paintTimer = null;
  let saveTimer = null;
  let storeKey = null;
  let view = { key: null, ids: [], idSet: new Set(), n: 0, startedAt: 0, manual: false, events: 0 };

  // ---------- helpers ----------
  const jq = () => window.jQuery;

  function calendar() {
    const j = jq();
    if (!j) return null;
    const cal = j('#calendar');
    return cal.length && cal.hasClass('fc') && typeof cal.fullCalendar === 'function' ? cal : null;
  }

  function getEventId(e) {
    return e.id != null ? e.id : e.EntryNo;
  }

  function startDate(ev) {
    const s = ev && ev.start;
    if (!s) return null;
    let d = null;
    if (s instanceof Date) d = s;
    else if (typeof s === 'string') d = new Date(s);
    else if (typeof s.format === 'function') d = new Date(s.format('YYYY-MM-DDTHH:mm:ss'));
    return d && !isNaN(d.getTime()) ? d : null;
  }

  function extractType(resp) {
    const t = resp && (resp.AttendanceType ||
      (resp.data && resp.data.AttendanceType) ||
      (resp.Result && resp.Result.AttendanceType));
    return t == null ? '' : String(t).trim();
  }

  function hash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return (h >>> 0).toString(36);
  }

  function userTag() {
    const el = document.querySelector('.kt-header__topbar-username');
    const digits = el ? el.textContent.replace(/\D/g, '') : '';
    return digits ? hash(digits) : '';
  }

  // ---------- cache ----------
  function loadCache() {
    try {
      sessionStorage.removeItem('mujfish_att_v1');
      const tag = userTag();
      if (!tag) return;
      storeKey = STORE_PREFIX + tag;
      const raw = sessionStorage.getItem(storeKey) || sessionStorage.getItem('mujfish_att_v2_' + tag);
      if (!raw) return;
      const obj = JSON.parse(raw);
      const now = Date.now();
      Object.keys(obj).forEach(id => {
        const r = obj[id];
        if (r && typeof r.ts === 'number' && now - r.ts < STORE_MAX_AGE_MS && !cache.has(id)) {
          cache.set(id, { type: String(r.t || ''), ts: r.ts });
        }
      });
    } catch (e) { /* ignore */ }
  }

  function saveSoon() {
    if (saveTimer || !storeKey) return;
    saveTimer = setTimeout(() => {
      saveTimer = null;
      try {
        const obj = {};
        cache.forEach((r, id) => { obj[id] = { t: r.type, ts: r.ts }; });
        sessionStorage.setItem(storeKey, JSON.stringify(obj));
      } catch (e) { /* storage full: memory cache still works */ }
    }, 800);
  }

  function remember(id, type) {
    cache.set(String(id), { type, ts: Date.now() });
    saveSoon();
    const k = type.toLowerCase();
    if (type && !COLORS[k] && k !== 'present' && !seenOtherTypes.has(k)) {
      seenOtherTypes.add(k);
      console.info(LOG, 'Unhandled attendance type:', type);
    }
  }

  function isFresh(rec, st) {
    if (!rec) return false;
    const age = st ? Date.now() - st.getTime() : 0;
    const mayChange = !st || age < RECENT_MS || (!rec.type && age < UNMARKED_MS);
    return !mayChange || (Date.now() - rec.ts) < RECHECK_MS;
  }

  function applyColor(ev, type) {
    const want = COLORS[(type || '').toLowerCase()];
    if (want) {
      if (ev.backgroundColor === want.bg && ev.borderColor === want.border) return false;
      if (ev._mujxBase === undefined) ev._mujxBase = { bg: ev.backgroundColor, border: ev.borderColor };
      ev.backgroundColor = want.bg;
      ev.borderColor = want.border;
      ev.textColor = '#ffffff';
      return true;
    }
    const base = ev._mujxBase;
    if (!base) return false;
    ev.backgroundColor = base.bg;
    ev.borderColor = base.border;
    ev._mujxBase = undefined;
    return true;
  }

  // ---------- painting ----------
  const scroller = () => document.querySelector('#calendar .fc-time-grid-container') ||
    document.querySelector('#calendar .fc-scroller');

  function paint() {
    paintTimer = null;
    try {
      const cal = calendar();
      if (!cal) return;
      const events = cal.fullCalendar('clientEvents') || [];
      let changed = false;
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const id = getEventId(ev);
        const rec = id != null ? cache.get(String(id)) : null;
        if (rec && applyColor(ev, rec.type)) changed = true;
      }
      if (!changed) return;

      const before = scroller();
      const top = before ? before.scrollTop : 0;
      cal.fullCalendar('rerenderEvents');
      const after = scroller();
      if (after && after.scrollTop !== top) after.scrollTop = top;
    } catch (e) {
      console.warn(LOG, 'paint failed', e);
    }
  }

  function schedulePaint() {
    if (!paintTimer) paintTimer = setTimeout(paint, PAINT_MS);
  }

  function flushPaint() {
    if (paintTimer) { clearTimeout(paintTimer); paintTimer = null; }
    paint();
  }

  // ---------- status chip ----------
  const chip = { el: null, fade: null, showTimer: null, state: '', text: '' };

  function injectStyle() {
    if (document.getElementById('mujx-tt-style')) return;
    const st = document.createElement('style');
    st.id = 'mujx-tt-style';
    st.textContent =
      '#dvLoader{display:none!important}' +
      '#slcm-loading-indicator{position:fixed;right:76px;bottom:calc(16px + env(safe-area-inset-bottom,0px));z-index:9999;opacity:0;pointer-events:none;' +
      'max-width:calc(100vw - 92px);padding:5px 12px;border-radius:14px;color:#fff;' +
      'font:12px/1.4 Poppins,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.25);cursor:pointer;' +
      'user-select:none;transition:opacity .3s,background .3s}' +
      '#slcm-loading-indicator:hover{opacity:1!important}' +
      '#calendar .fc-today{background:rgba(93,120,255,.07)!important}' +
      '#calendar .fc-today .fc-day-number{background:#5d78ff;color:#fff;border-radius:50%;' +
      'min-width:22px;height:22px;line-height:22px;display:inline-block;text-align:center;' +
      'font-weight:700;padding:0 2px}' +
      '#calendar .fc-event{border-radius:3px!important;font-size:11px!important;line-height:1.35!important;padding:2px 4px!important;color:#fff!important;}' +
      '#calendar .fc-event .fc-title,#calendar .fc-event .fc-time{color:#fff!important;}' +
      '#st-custom-legends, #mujx-custom-legends{color:inherit!important;}';
    (document.head || document.documentElement).appendChild(st);
  }

  function chipEl() {
    if (chip.el) return chip.el;
    injectStyle();
    const d = document.createElement('div');
    d.id = 'slcm-loading-indicator';
    d.setAttribute('role', 'status');
    d.setAttribute('aria-live', 'polite');
    d.addEventListener('click', forceRefresh);
    (document.body || document.documentElement).appendChild(d);
    chip.el = d;
    return d;
  }

  function setChip(state, text, bg, fadeMs, title) {
    const el = chipEl();
    if (title) el.title = title;
    if (chip.state === state && chip.text === text) return;
    chip.state = state;
    chip.text = text;
    clearTimeout(chip.fade);
    el.textContent = text;
    el.style.background = bg;
    el.style.pointerEvents = 'auto';
    el.style.cursor = state === 'busy' ? 'default' : 'pointer';
    el.style.opacity = '1';
    if (fadeMs) chip.fade = setTimeout(() => { el.style.opacity = '0.5'; }, fadeMs);
  }

  function hideChip() {
    clearTimeout(chip.fade);
    clearTimeout(chip.showTimer);
    chip.showTimer = null;
    chip.state = '';
    chip.text = '';
    if (chip.el) {
      chip.el.style.opacity = '0';
      chip.el.style.pointerEvents = 'none';
    }
  }

  function showOk() {
    const t = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    setChip('ok', 'Attendance up to date', '#27ae60', 2500, 'Checked ' + t + ' \u00b7 click to re-check');
  }

  function pendingForView() {
    let n = queue.length;
    inflight.forEach((x, id) => { if (view.idSet.has(id)) n++; });
    return n;
  }

  function updateChip() {
    if (view.key === null) { hideChip(); return; }

    if (view.events === 0) {
      setChip('empty', 'No classes scheduled here', '#95a5a6', 2500, 'No timetable data found for this view');
      return;
    }
    if (!view.ids.length) { hideChip(); return; }

    const pending = pendingForView();
    let unknown = 0, failed = 0;
    for (let i = 0; i < view.ids.length; i++) {
      const id = view.ids[i];
      if (cache.has(id)) continue;
      if (failedAt.has(id)) failed++; else unknown++;
    }

    if (pending > 0) {
      if (unknown === 0 && !view.manual) {
        if (chip.state === 'busy') showOk();
        return;
      }
      const wait = view.manual ? 0 : SHOW_DELAY_MS - (Date.now() - view.startedAt);
      if (wait > 0) {
        if (!chip.showTimer) chip.showTimer = setTimeout(() => { chip.showTimer = null; updateChip(); }, wait);
        return;
      }
      const total = Math.max(view.n, 1);
      const done = view.manual ? total - pending : total - unknown;
      setChip('busy', 'Updating attendance\u2026 ' + Math.max(done, 0) + '/' + total, '#34495e');
      return;
    }

    clearTimeout(chip.showTimer);
    chip.showTimer = null;
    view.manual = false;

    if (failed > 0) {
      setChip('warn', '\u26a0 ' + failed + (failed > 1 ? ' classes' : ' class') +
        ' couldn\u2019t be checked \u00b7 click to retry', '#e67e22', 0, 'Click to retry');
      return;
    }
    showOk();
  }

  function forceRefresh() {
    if (pendingForView() > 0 || !view.ids.length) return;
    const failedIds = view.ids.filter(id => failedAt.has(id));
    view.manual = true;
    view.n = failedIds.length || view.ids.length;
    scan(failedIds.length ? 'failed' : true);
  }

  // ---------- fetching ----------
  function fetchOne(id) {
    inflight.set(id, null);
    let xhr;
    try {
      xhr = jq().ajax({
        type: 'POST',
        url: DETAIL_URL,
        dataType: 'json',
        data: { EventID: id },
        timeout: TIMEOUT_MS,
        global: false
      });
    } catch (e) {
      inflight.delete(id);
      active--;
      failedAt.set(id, Date.now());
      return;
    }
    if (xhr.state() === 'pending') inflight.set(id, xhr);

    xhr.done(resp => {
      try { remember(id, extractType(resp)); failedAt.delete(id); schedulePaint(); }
      catch (e) { failedAt.set(id, Date.now()); }
    })
      .fail((x, status) => { if (status !== 'abort') failedAt.set(id, Date.now()); })
      .always(() => {
        inflight.delete(id);
        active--;
        if (scanning) return;
        if (!queue.length && active === 0) flushPaint();
        pump();
      });
  }

  function pump() {
    if (canFetch && !document.hidden) {
      while (active < CONCURRENCY && queue.length) {
        const id = queue.shift();
        if (inflight.has(id)) continue;
        active++;
        fetchOne(id);
      }
    }
    updateChip();
  }

  // ---------- scanning calendar ----------
  function scan(mode) {
    const cal = calendar();
    if (!cal) return;
    const force = mode === true;
    const retry = mode === 'failed';
    scanning = true;
    try {
      const events = cal.fullCalendar('clientEvents') || [];
      const now = Date.now();
      const ids = [];
      const need = [];

      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        const raw = getEventId(ev);
        if (raw == null) continue;
        const id = String(raw);
        const st = startDate(ev);
        if (st && st.getTime() > now) continue; // future class
        ids.push(id);

        if (force || retry) failedAt.delete(id);
        if (inflight.has(id)) continue;
        if (!force) {
          if (isFresh(cache.get(id), st)) continue;
          if ((failedAt.get(id) || 0) + RETRY_AFTER_FAIL_MS > now) continue;
        }
        need.push({ id, t: st ? st.getTime() : 0 });
      }

      const key = ids.slice().sort().join(',');
      if (key !== view.key) {
        const idSet = new Set(ids);
        queue = [];
        Array.from(inflight.keys()).forEach(id => {
          const x = inflight.get(id);
          if (!idSet.has(id) && x && x.abort) { try { x.abort(); } catch (e) { /* ignore */ } }
        });
        view = {
          key, ids, idSet,
          n: ids.filter(id => !cache.has(id)).length,
          startedAt: Date.now(), manual: false, events: events.length
        };
        hideChip();
      } else {
        view.events = events.length;
      }

      need.sort((a, b) => b.t - a.t);
      queue = need.map(n => n.id);

      paint();
    } finally {
      scanning = false;
    }
    pump();
  }

  function learnFromPageRequest(xhr, settings) {
    try {
      const data = settings && typeof settings.data === 'string' ? settings.data : '';
      const id = new URLSearchParams(data).get('EventID');
      if (!id) return;
      remember(id, extractType(JSON.parse(xhr.responseText)));
      failedAt.delete(String(id));
      schedulePaint();
      updateChip();
    } catch (e) { /* ignore */ }
  }

  // ---------- legend ----------
  function injectLegend() {
    if (document.getElementById('mujx-custom-legends')) return;
    const calEl = document.getElementById('calendar');
    if (!calEl) return;

    const make = (c, text) => {
      const col = document.createElement('div');
      col.className = 'col-lg-2';
      const wrap = document.createElement('div');
      wrap.className = 'mt-5';
      const box = document.createElement('span');
      box.className = 'box-attandance';
      box.style.cssText = 'background:' + c.bg + ';border:1px solid ' + c.border + ';';
      wrap.append(box, text);
      col.appendChild(wrap);
      return col;
    };

    const absent = make(COLORS['absent'], 'Signifies the class is marked Absent');
    const notConsidered = make(COLORS['not considered'], 'Signifies the class is Not Considered');

    const anchor = document.querySelector('.box-reschedule');
    const anchorCol = anchor && anchor.closest('.col-lg-2');
    if (anchorCol) {
      absent.id = 'mujx-custom-legends';
      anchorCol.after(absent, notConsidered);
    } else {
      const row = document.createElement('div');
      row.id = 'mujx-custom-legends';
      row.className = 'row';
      row.append(absent, notConsidered);
      calEl.before(row);
    }
  }

  function lockDrag() {
    if (!LOCK_DRAG) return;
    document.addEventListener('mousedown', function (e) {
      const t = e.target;
      if (e.button === 0 && t && t.closest && t.closest('#calendar .fc-event')) e.stopPropagation();
    }, true);
  }

  // ---------- boot ----------
  function waitForJQuery(tries) {
    if (jq() && typeof jq()(document).ajaxSuccess === 'function') { hook(); return; }
    if (tries > 150) { console.warn(LOG, 'jQuery never appeared'); return; }
    setTimeout(() => waitForJQuery(tries + 1), 200);
  }

  function quietAbort(xhr) {
    const realAlert = window.alert;
    window.alert = function () { };
    try { xhr.abort(); } catch (e) { /* ignore */ } finally { window.alert = realAlert; }
  }

  function hook() {
    const j = jq();

    let last = { key: '', t: 0, xhr: null };
    j.ajaxPrefilter(function (options, originalOptions, jqXHR) {
      if (!options.url || options.url.indexOf(LIST_URL_PART) === -1) return;
      const key = String(options.data || '');
      const now = Date.now();
      if (key === last.key && now - last.t < DUP_MS) { quietAbort(jqXHR); return; }
      if (last.xhr && last.xhr.readyState !== 4) quietAbort(last.xhr);
      last = { key, t: now, xhr: jqXHR };
    });

    j(document).ajaxSuccess(function (event, xhr, settings) {
      try {
        const url = (settings && settings.url) || '';
        if (url.indexOf(LIST_URL_PART) !== -1) scan(false);
        else if (url.indexOf(DETAIL_PART) !== -1) learnFromPageRequest(xhr, settings);
      } catch (e) {
        console.warn(LOG, 'ajaxSuccess handler failed', e);
      }
    });

    let tries = 0;
    let setUp = false;
    (function poll() {
      const cal = calendar();
      if (cal) {
        if (!setUp) { setUp = true; injectLegend(); lockDrag(); }
        const events = cal.fullCalendar('clientEvents') || [];
        if (events.length) { scan(false); return; }
      }
      if (++tries < 35) setTimeout(poll, 300);
    })();
  }

  if (!canFetch) {
    const go = () => { if (canFetch) return; canFetch = true; pump(); };
    window.addEventListener('load', () => setTimeout(go, 0), { once: true });
    setTimeout(go, FETCH_START_CAP_MS);
  }

  document.addEventListener('visibilitychange', () => { if (!document.hidden) pump(); });
  loadCache();
  if (!storeKey && document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadCache, { once: true });
  }
  waitForJQuery(0);
})();
