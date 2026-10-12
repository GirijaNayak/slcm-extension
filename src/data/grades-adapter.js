import { CANDIDATE_ENDPOINTS } from "../shared/constants.js";
import { headerIndexMap, parseNumber, pickIndex, tableToMatrix } from "../shared/dom.js";
import { normalizeGradeRow } from "./normalizers.js";
import { slcmRequest } from "./slcm-client.js";

export function extractGradesFromDocument(doc = document) {
  const tables = [...doc.querySelectorAll("table")];
  // Check for multi-semester CGPA table first (e.g. CGPAGPAForStudent)
  for (const table of tables) {
    const cgpaTable = parseCgpaSummaryTable(table);
    if (cgpaTable) {
      return {
        records: [],
        table,
        source: "cgpa-summary-table",
        available: true,
        summary: cgpaTable,
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

export function parseCgpaSummaryTable(table) {
  const text = (table.textContent || "").toLowerCase();
  if (!text.includes("cgpa") || (!text.includes("student") && !text.includes("registration"))) {
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
        available: cgpa !== null,
      };
    }
  }
  return null;
}

export function parseGradesTable(table) {
  const { headers, rows } = tableToMatrix(table);
  const map = headerIndexMap(headers);
  const letterIdx = pickIndex(map, ["grade", "letter", "lg"]);
  const creditIdx = pickIndex(map, ["credit", "credits", "cr"]);
  if (letterIdx < 0 && creditIdx < 0) return { records: [], table, available: false };
  const records = rows.map((cells) =>
    normalizeGradeRow({
      subject: cells[pickIndex(map, ["course", "subject", "paper"])] || cells[1] || cells[0],
      courseCode: cells[pickIndex(map, ["code", "course code"])] || "",
      credits: parseNumber(cells[creditIdx]),
      letter: cells[letterIdx] || null,
      gradePoints: parseNumber(cells[pickIndex(map, ["grade point", "gp", "points"])]),
      source: "dom",
    }),
  );
  return { records, table, source: "dom", available: records.length > 0, summary: null };
}

export function extractCgpaSummary(doc = document) {
  const text = doc.body?.innerText || "";
  const cgpa = matchNumber(text, /c\.?g\.?p\.?a\.?\s*[:\-is]*\s*([0-9]+(?:\.[0-9]+)?)/i);
  const sgpa = matchNumber(text, /s\.?g\.?p\.?a\.?\s*[:\-is]*\s*([0-9]+(?:\.[0-9]+)?)/i);
  const credits = matchNumber(text, /((?:total|earned|completed)\s+credits?)\s*[:\-]*\s*([0-9]+(?:\.[0-9]+)?)/i, 2);
  return {
    cgpa,
    sgpa,
    completedCredits: credits,
    source: "dom-text",
    available: cgpa !== null || credits !== null,
  };
}

export async function fetchGradesPayload() {
  const result = await slcmRequest(CANDIDATE_ENDPOINTS.gradesForFaculty);
  const list = result.data?.GradeList || result.data?.Data || result.data?.data || [];
  if (!Array.isArray(list)) {
    return { records: [], source: "api", available: false, reason: "unexpected_shape", rawKeys: Object.keys(result.data || {}) };
  }
  return {
    records: list.map((row) => normalizeGradeRow({ ...row, source: "api" })),
    source: "api",
    available: true,
  };
}

function matchNumber(text, regex, group = 1) {
  const match = text.match(regex);
  if (!match) return null;
  const n = Number(match[group]);
  return Number.isFinite(n) ? n : null;
}
