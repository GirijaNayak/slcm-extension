import { escapeHtml } from "../../../shared/dom.js";

export function renderNotifications({ wrap, items = [], onDismiss, onClearAll }) {
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

      ${
        items.length
          ? `<ul class="mujx-list">
              ${items
                .map((item) => {
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
                      <button class="mujx-btn secondary" type="button" data-role="dismiss" data-id="${escapeHtml(item.id)}" style="padding:4px 8px; font-size:11px;">✕</button>
                    </li>
                  `;
                })
                .join("")}
            </ul>`
          : `<div class="mujx-empty">
              <div style="font-size:24px; margin-bottom:6px;">✓</div>
              <strong>No Active Alerts</strong>
              <div class="mujx-sub">You have no low-attendance warnings or detected schedule changes.</div>
            </div>`
      }
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

export function buildAcademicAlerts({ attendance = [], timetableChanged = false, newMarks = false }) {
  const items = [];
  const at = new Date().toISOString();

  // Low attendance alerts (< threshold - band)
  for (const row of attendance) {
    if (row.status?.code === "low") {
      items.push({
        id: `att-low-${row.courseCode || row.subject}`,
        title: `Low Attendance: ${row.subject}`,
        detail: `Current attendance is ${row.percent ?? "—"}%. You need to attend the next ${row.classesNeeded ?? 1} consecutive classes to recover to target threshold.`,
        at,
        status: "warning",
      });
    } else if (row.status?.code === "borderline") {
      items.push({
        id: `att-warn-${row.courseCode || row.subject}`,
        title: `Borderline Attendance: ${row.subject}`,
        detail: `Current attendance is ${row.percent ?? "—"}%. Safe skips remaining: ${row.safeSkips ?? 0}.`,
        at,
        status: "notice",
      });
    }
  }

  // Timetable change detected
  if (timetableChanged) {
    items.push({
      id: `tt-${at.slice(0, 13)}`,
      title: "Timetable Schedule Modification",
      detail: "Your current timetable differs from the previous snapshot saved locally. Please verify with the department; this is not an official cancellation notice.",
      at,
      status: "notice",
    });
  }

  // New marks detected
  if (newMarks) {
    items.push({
      id: `marks-${at.slice(0, 13)}`,
      title: "Internal Marks Updated",
      detail: "A change in your internal marks table was detected since your last visit.",
      at,
      status: "info",
    });
  }

  return items;
}

function formatTimestamp(isoString) {
  if (!isoString) return "";
  try {
    const d = new Date(isoString);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return isoString;
  }
}
