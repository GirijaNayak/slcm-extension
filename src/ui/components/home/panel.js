import { attendancePercent, enhanceRecord } from "../../../calculations/attendance.js";
import { analyzeSchedule } from "../../../data/timetable-adapter.js";
import { escapeHtml } from "../../../shared/dom.js";

export function renderHomePanel({ wrap, attendance = [], events = [], threshold, borderlineBand }) {
  const enhanced = attendance.map((row) => enhanceRecord(row, threshold, borderlineBand));
  const lowCourses = enhanced.filter((r) => r.status.code === "low");
  const borderlineCourses = enhanced.filter((r) => r.status.code === "borderline");
  const safeCourses = enhanced.filter((r) => r.status.code === "safe");

  const sumPresent = attendance.reduce((acc, r) => acc + (Number(r.present) || 0), 0);
  const sumTotal = attendance.reduce((acc, r) => acc + (Number(r.total) || 0), 0);
  const overall = attendancePercent(sumPresent, sumTotal);

  const schedule = analyzeSchedule(events);

  wrap.innerHTML = `
    <section class="mujx-card" aria-label="SLCM home extras" style="background:var(--mujx-surface); border-left: 4px solid var(--mujx-accent);">
      <div class="mujx-head" style="margin-bottom:12px;">
        <div>
          <div class="mujx-kicker"><span class="mujx-kicker-dot"></span> Academic Overview</div>
          <h2 class="mujx-title">Today at a Glance</h2>
          <p class="mujx-sub">In-place summary card. Your original university notices and dashboard widgets remain intact below.</p>
        </div>
      </div>

      <div class="mujx-grid" style="grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));">
        <div class="mujx-metric">
          <span class="mujx-metric-label">Overall Attendance</span>
          <b style="color:${overall.percent >= threshold ? 'var(--mujx-ok)' : 'var(--mujx-bad)'}">${overall.percent !== null ? `${overall.percent}%` : "—"}</b>
          <span class="mujx-sub" style="font-size:11px">${attendance.length} courses tracked</span>
        </div>
        <div class="mujx-metric">
          <span class="mujx-metric-label">Attendance Health</span>
          <b style="color:${lowCourses.length ? 'var(--mujx-bad)' : 'var(--mujx-ok)'}">${lowCourses.length ? `${lowCourses.length} at risk` : 'All On Track'}</b>
          <span class="mujx-sub" style="font-size:11px">${safeCourses.length} safe · ${borderlineCourses.length} borderline</span>
        </div>
        <div class="mujx-metric">
          <span class="mujx-metric-label">Happening Now</span>
          <b style="font-size:15px; color:var(--mujx-ink);">
            ${schedule.current ? `<span class="mujx-pulse-dot"></span> ${escapeHtml(schedule.current.title)}` : 'Free period'}
          </b>
          <span class="mujx-sub" style="font-size:11px">${schedule.current?.room ? `Room ${escapeHtml(schedule.current.room)}` : "No active session"}</span>
        </div>
        <div class="mujx-metric">
          <span class="mujx-metric-label">Up Next Today</span>
          <b style="font-size:15px; color:var(--mujx-accent);">${escapeHtml(schedule.upcoming?.title || "Finished for today")}</b>
          <span class="mujx-sub" style="font-size:11px">${schedule.upcoming?.room ? `Room ${escapeHtml(schedule.upcoming.room)} · ` : ""}${schedule.upcoming?.start || "No class"}</span>
        </div>
      </div>

      ${
        lowCourses.length
          ? `<div class="mujx-sim-box" style="margin-top:10px; background:var(--mujx-bad-bg); border-color:var(--mujx-bad-border);">
              <strong style="color:var(--mujx-bad); font-size:12.5px;">⚠️ Attendance Warning:</strong>
              <div class="mujx-sub" style="color:var(--mujx-ink); margin-top:3px;">
                ${lowCourses.map((r) => `<strong>${escapeHtml(r.subject)}</strong> (${r.percent}% · need ${r.classesNeeded} classes)`).join(" · ")}
              </div>
            </div>`
          : ""
      }

      <div class="mujx-row" style="margin-top:14px; gap:8px;">
        <span class="mujx-sub" style="font-weight:600; font-size:12px;">Quick Portal Navigation:</span>
        <a class="mujx-btn secondary" href="/Student/Academic/Attendance" style="text-decoration:none; font-size:12px; padding:5px 10px;">📊 Attendance</a>
        <a class="mujx-btn secondary" href="/Student/Academic/GetInternalMarks" style="text-decoration:none; font-size:12px; padding:5px 10px;">📝 Internal Marks</a>
        <a class="mujx-btn secondary" href="/Student/Academic/TimeTable" style="text-decoration:none; font-size:12px; padding:5px 10px;">📅 Timetable</a>
        <a class="mujx-btn secondary" href="/Student/Academic/GetGradesForFaculty" style="text-decoration:none; font-size:12px; padding:5px 10px;">🎓 Grade Card</a>
      </div>
    </section>
  `;
}
