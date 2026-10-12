import { headerIndexMap, pickIndex, tableToMatrix } from "../shared/dom.js";
import { parseNumber } from "../shared/dom.js";
import { CANDIDATE_ENDPOINTS } from "../shared/constants.js";
import { normalizeAttendanceRow } from "./normalizers.js";
import { slcmRequest } from "./slcm-client.js";

const HEADER_ALIASES = {
  subject: ["subject", "course name", "course", "paper name"],
  courseCode: ["code", "course code", "subject code"],
  present: ["present", "attended", "total present"],
  absent: ["absent"],
  total: ["total", "conducted", "total class", "classes"],
  percent: ["percent", "percentage", "%"],
  theoryPresent: ["theory present"],
  theoryTotal: ["theory total"],
  practicalPresent: ["practical present", "lab present"],
  practicalTotal: ["practical total", "lab total"],
};

export function extractAttendanceFromDocument(doc = document) {
  const tables = [...doc.querySelectorAll("table")];
  for (const table of tables) {
    const parsed = parseAttendanceTable(table);
    if (parsed.records.length) return parsed;
  }
  return { records: [], source: "dom", available: false, reason: "no_attendance_table" };
}

export function parseAttendanceTable(table) {
  const { headers, rows } = tableToMatrix(table);
  const map = headerIndexMap(headers);
  const presentIdx = pickIndex(map, HEADER_ALIASES.present);
  const totalIdx = pickIndex(map, HEADER_ALIASES.total);
  const percentIdx = pickIndex(map, HEADER_ALIASES.percent);
  if (presentIdx < 0 && totalIdx < 0 && percentIdx < 0) {
    return { records: [], table, source: "dom", available: false };
  }
  const records = rows.map((cells) =>
    normalizeAttendanceRow({
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
      source: "dom",
    }),
  );
  return { records, table, source: "dom", available: records.length > 0 };
}

export async function fetchAttendanceSummary() {
  const result = await slcmRequest(CANDIDATE_ENDPOINTS.attendanceSummary);
  const list =
    result.data?.AttendanceSummaryList ||
    result.data?.attendanceSummaryList ||
    result.data?.Data ||
    result.data?.data ||
    [];
  if (!Array.isArray(list)) {
    return { records: [], source: "api", available: false, reason: "unexpected_shape", rawKeys: Object.keys(result.data || {}) };
  }
  return {
    records: list.map((row) => normalizeAttendanceRow({ ...row, source: "api" })),
    source: "api",
    available: true,
  };
}
