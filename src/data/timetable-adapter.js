import { CANDIDATE_ENDPOINTS } from "../shared/constants.js";
import { textOf } from "../shared/dom.js";
import { fingerprint, normalizeEvent } from "./normalizers.js";
import { slcmRequest } from "./slcm-client.js";

export function extractTimetableFromDocument(doc = document) {
  const events = [
    ...extractFromCalendarCells(doc),
    ...extractFromTables(doc),
  ];
  return {
    events,
    source: "dom",
    available: events.length > 0,
    fingerprint: fingerprint(events.map((event) => [event.title, event.start, event.end, event.room])),
  };
}

export async function fetchCalendarEvents() {
  const result = await slcmRequest(CANDIDATE_ENDPOINTS.calendarEvents);
  const list = result.data?.EventList || result.data?.CalenderEventList || result.data?.Data || result.data?.data || [];
  if (!Array.isArray(list)) {
    return { events: [], source: "api", available: false, reason: "unexpected_shape", rawKeys: Object.keys(result.data || {}) };
  }
  const events = list.map((row) => normalizeEvent({ ...row, source: "api" }));
  return {
    events,
    source: "api",
    available: true,
    fingerprint: fingerprint(events.map((event) => [event.title, event.start, event.end, event.room])),
  };
}

export function analyzeSchedule(events, now = new Date()) {
  const parsed = events
    .map((event) => ({ ...event, startDate: parseWhen(event.start), endDate: parseWhen(event.end) }))
    .filter((event) => event.startDate)
    .sort((a, b) => a.startDate - b.startDate);

  const current = parsed.find((event) => event.endDate && event.startDate <= now && now <= event.endDate);
  const upcoming = parsed.find((event) => event.startDate > now);
  const conflicts = findConflicts(parsed);
  const gaps = findGaps(parsed, now);

  return { current, upcoming, conflicts, gaps, parsed };
}

function extractFromCalendarCells(doc) {
  const cells = [...doc.querySelectorAll(".fc-event, .fc-timegrid-event, [data-event], .calendar-event")];
  return cells.map((node) =>
    normalizeEvent({
      title: textOf(node.querySelector(".fc-event-title, .title")) || textOf(node),
      start: node.getAttribute("data-start") || node.getAttribute("data-date") || "",
      end: node.getAttribute("data-end") || "",
      room: node.getAttribute("data-room") || "",
      source: "dom-calendar",
    }),
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
          source: "dom-table",
        }),
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
  const now = new Date();
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
    const minutes = (today[i + 1].startDate - today[i].endDate) / 60000;
    if (minutes >= 15) {
      gaps.push({ after: today[i], before: today[i + 1], minutes: Math.round(minutes) });
    }
  }
  return gaps;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
