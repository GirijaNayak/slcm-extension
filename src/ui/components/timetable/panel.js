import { analyzeSchedule } from "../../../data/timetable-adapter.js";
import { escapeHtml } from "../../../shared/dom.js";
import { openPopover } from "../../popover.js";

export function renderTimetablePanel({ wrap, events = [], snapshot, updatedAt, attendanceRecords = [] }) {
  const analysis = analyzeSchedule(events);

  // Link attendance info if available
  const getSubjectAtt = (title) => {
    if (!title || !attendanceRecords.length) return null;
    const cleanTitle = title.toLowerCase();
    return attendanceRecords.find(
      (r) => cleanTitle.includes((r.subject || "").toLowerCase()) || (r.subject || "").toLowerCase().includes(cleanTitle),
    );
  };

  const currentAtt = analysis.current ? getSubjectAtt(analysis.current.title) : null;
  const upcomingAtt = analysis.upcoming ? getSubjectAtt(analysis.upcoming.title) : null;

  wrap.innerHTML = `
    <div class="mujx-inline-bar" aria-label="Timetable quick bar" style="margin-bottom:12px;">
      <div class="mujx-inline-bar-left">
        <span class="mujx-kicker"><span class="mujx-kicker-dot"></span> Schedule Intel</span>
        <span>
          ${analysis.current ? `<span class="mujx-pulse-dot"></span><strong>Now:</strong> ${escapeHtml(analysis.current.title)}` : '<strong>Now:</strong> Free Period'}
          ${analysis.current?.room ? ` (${escapeHtml(analysis.current.room)})` : ''}
        </span>
        <span style="color:var(--mujx-line-strong);">|</span>
        <span>
          <strong>Next:</strong> ${escapeHtml(analysis.upcoming?.title || "None remaining today")}
          ${analysis.upcoming?.start ? ` at ${escapeHtml(analysis.upcoming.start)}` : ''}
        </span>
        ${analysis.gaps.length ? `<span class="mujx-chip" style="font-size:11px; padding:1px 6px;">☕ ${analysis.gaps[0].minutes}m break</span>` : ''}
      </div>
      <div class="mujx-inline-bar-right">
        <span class="mujx-sub" style="font-size:11px; margin:0;">Synced: ${escapeHtml(updatedAt || "Just now")}</span>
        <button class="mujx-btn secondary" type="button" data-role="refresh-tt" style="padding:3px 8px; font-size:11px;">↺ Refresh</button>
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
        <div class="mujx-card" style="margin:0; background:var(--mujx-bg); border-left: 4px solid ${analysis.current ? 'var(--mujx-ok)' : 'var(--mujx-line-strong)'};">
          <span class="mujx-metric-label">
            ${analysis.current ? '<span class="mujx-pulse-dot"></span> Happening Now' : 'Current Status'}
          </span>
          <b style="font-size:15px; margin: 4px 0;">
            ${escapeHtml(analysis.current?.title || "No class in session")}
          </b>
          <div class="mujx-sub">
            ${analysis.current?.room ? `Room: <strong>${escapeHtml(analysis.current.room)}</strong> · ` : ""}
            ${analysis.current?.start ? `${escapeHtml(analysis.current.start)} - ${escapeHtml(analysis.current.end || "")}` : "Free period"}
          </div>
          ${
            currentAtt
              ? `<div style="margin-top:6px;"><span class="mujx-chip ${currentAtt.percent >= 75 ? 'safe' : 'low'}" style="font-size:10.5px;">Attendance: ${currentAtt.percent}%</span></div>`
              : ""
          }
        </div>

        <!-- Up Next -->
        <div class="mujx-card" style="margin:0; background:var(--mujx-bg); border-left: 4px solid var(--mujx-accent);">
          <span class="mujx-metric-label">Up Next Today</span>
          <b style="font-size:15px; margin: 4px 0; color:var(--mujx-accent);">
            ${escapeHtml(analysis.upcoming?.title || "No more classes today")}
          </b>
          <div class="mujx-sub">
            ${analysis.upcoming?.room ? `Room: <strong>${escapeHtml(analysis.upcoming.room)}</strong> · ` : ""}
            ${analysis.upcoming?.start ? `Starts at ${escapeHtml(analysis.upcoming.start)}` : "All finished"}
          </div>
          ${
            upcomingAtt
              ? `<div style="margin-top:6px;"><span class="mujx-chip ${upcomingAtt.percent >= 75 ? 'safe' : 'low'}" style="font-size:10.5px;">Attendance: ${upcomingAtt.percent}% (${upcomingAtt.safeSkips > 0 ? `+${upcomingAtt.safeSkips} skips safe` : `Need ${upcomingAtt.classesNeeded}`})</span></div>`
              : ""
          }
        </div>

        <!-- Schedule Conflicts -->
        <div class="mujx-card" style="margin:0; background:var(--mujx-bg); border-left: 4px solid ${analysis.conflicts.length ? 'var(--mujx-bad)' : 'var(--mujx-ok)'};">
          <span class="mujx-metric-label">Schedule Health</span>
          <b style="font-size:15px; margin: 4px 0; color: ${analysis.conflicts.length ? 'var(--mujx-bad)' : 'var(--mujx-ok)'};">
            ${analysis.conflicts.length ? `${analysis.conflicts.length} Overlapping Slot(s)` : "Zero Conflicts Detected"}
          </b>
          <div class="mujx-sub">
            ${events.length} schedule events parsed from page
          </div>
        </div>
      </div>

      <!-- Free Gaps and Breaks -->
      ${
        analysis.gaps.length
          ? `<div class="mujx-sim-box" style="margin-top:12px;">
              <strong style="font-size:12.5px;">☕ Break & Free Periods:</strong>
              <div class="mujx-row" style="margin-top:6px; gap:8px;">
                ${analysis.gaps
                  .map(
                    (g) => `
                    <span class="mujx-chip" style="background:var(--mujx-surface); border:1px solid var(--mujx-line); font-size:11.5px;">
                      <strong>${g.minutes} min break</strong> after ${escapeHtml(g.after?.title || "class")}
                    </span>
                  `,
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }

      <!-- Conflicts Alert -->
      ${
        analysis.conflicts.length
          ? `<div class="mujx-sim-box" style="margin-top:12px; background:var(--mujx-bad-bg); border-color:var(--mujx-bad-border);">
              <strong style="color:var(--mujx-bad); font-size:12.5px;">⚠️ Schedule Conflicts Found:</strong>
              <div class="mujx-sub" style="color:var(--mujx-ink); margin-top:4px;">
                ${analysis.conflicts
                  .map(
                    (c) =>
                      `<div>Overlap between <strong>${escapeHtml(c.a.title)}</strong> and <strong>${escapeHtml(c.b.title)}</strong> (${escapeHtml(c.a.start || "")} - ${escapeHtml(c.a.end || "")})</div>`,
                  )
                  .join("")}
              </div>
            </div>`
          : ""
      }

      <!-- Snapshot Change Notice -->
      ${
        snapshot?.changed
          ? `<div class="mujx-sim-box" style="margin-top:12px; background:var(--mujx-warn-bg); border-color:var(--mujx-warn-border);">
              <strong style="color:var(--mujx-warn); font-size:12.5px;">🔔 Timetable Change Detected:</strong>
              <p class="mujx-sub" style="color:var(--mujx-ink); margin:4px 0 0;">
                The timetable events on this page differ from your previously saved local snapshot. This indicates a schedule modification made by the department. This is detected locally and is not an officially confirmed cancellation notice.
              </p>
            </div>`
          : ""
      }

      ${
        events.length === 0
          ? `<p class="mujx-empty">No timetable events could be parsed from the current view. If using FullCalendar, ensure events are visible or switch views.</p>`
          : ""
      }
    </section>
  `;

  // Bind popovers to existing calendar and timetable DOM elements
  bindCalendarPopovers(attendanceRecords);

  return wrap.querySelector("[data-role=refresh-tt]");
}

function bindCalendarPopovers(attendanceRecords) {
  const getSubjectAtt = (title) => {
    if (!title || !attendanceRecords.length) return null;
    const cleanTitle = title.toLowerCase();
    return attendanceRecords.find(
      (r) => cleanTitle.includes((r.subject || "").toLowerCase()) || (r.subject || "").toLowerCase().includes(cleanTitle),
    );
  };

  const eventNodes = document.querySelectorAll(".fc-event, .fc-timegrid-event, [data-event], .calendar-event");
  eventNodes.forEach((node) => {
    if (node.hasAttribute("data-mujx-popover-bound")) return;
    node.setAttribute("data-mujx-popover-bound", "true");

    node.addEventListener("click", (e) => {
      // Don't break original click behavior, but show popover if clicked
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
            <strong>${escapeHtml(start || "Scheduled")} ${end ? `– ${escapeHtml(end)}` : ''}</strong>
          </div>
          ${room ? `<div class="mujx-calc-step"><span style="color:var(--mujx-muted);">Room / Venue:</span><strong>${escapeHtml(room)}</strong></div>` : ''}
          ${
            att
              ? `<div class="mujx-calc-step">
                  <span style="color:var(--mujx-muted);">Attendance:</span>
                  <span class="mujx-chip ${att.percent >= 75 ? 'safe' : 'low'}" style="font-size:10.5px;">${att.percent}% (${att.safeSkips > 0 ? `+${att.safeSkips} safe` : `Need ${att.classesNeeded}`})</span>
                </div>`
              : ''
          }
          <p class="mujx-note" style="margin-top:8px;">* Extracted from SLCM Timetable. Calendar navigation and details remain intact.</p>
        </div>
      `;

      openPopover({
        anchorEl: node,
        title: "Class Details",
        badge: { text: "Timetable", type: "safe" },
        contentHtml: content,
        width: 310,
      });
    });
  });
}
