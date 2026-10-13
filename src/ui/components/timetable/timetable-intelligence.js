import { INJECT_ATTR } from "../../../shared/constants.js";

const TIMETABLE_CSS = `
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

function injectStyles() {
  if (document.getElementById("mujx-tt-styles")) return;
  const s = document.createElement("style");
  s.id = "mujx-tt-styles";
  s.setAttribute(INJECT_ATTR, "tt-styles");
  s.textContent = TIMETABLE_CSS;
  (document.head || document.documentElement).appendChild(s);
}

/**
 * Injects the MAIN-world timetable script if not already loaded by manifest.
 */
function ensureMainWorldTimetable() {
  if (document.getElementById("mujx-main-timetable-script")) return;
  try {
    const s = document.createElement("script");
    s.id = "mujx-main-timetable-script";
    s.src = chrome?.runtime?.getURL?.("src/content/timetable-main.js") || "";
    if (s.src) {
      (document.head || document.documentElement).appendChild(s);
    }
  } catch {}
}

/**
 * Enhances the FullCalendar timetable directly in-place matching MUJ FISH & Image 5.
 */
export function enhanceTimetablePage({ prefs } = {}) {
  const calendarEl = document.getElementById("calendar");
  if (!calendarEl) return () => {};

  injectStyles();
  ensureMainWorldTimetable();

  // Prevent accidental tile drag on student view
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
    true,
  );
}

function cleanupTimetableInjections() {
  document.getElementById("mujx-custom-legends")?.remove();
  document.querySelectorAll(`[${INJECT_ATTR}="tt-legend"]`).forEach((el) => el.remove());
  document.getElementById("slcm-loading-indicator")?.remove();
}
