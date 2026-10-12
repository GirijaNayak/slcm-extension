import { headerIndexMap, parseNumber, pickIndex, tableToMatrix } from "../shared/dom.js";
import { normalizeMarkRow } from "./normalizers.js";

export function extractMarksFromDocument(doc = document) {
  const tables = [...doc.querySelectorAll("table")];
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
    available: true,
  };
}

export function parseMarksTable(table) {
  const { headers, rows } = tableToMatrix(table);
  const map = headerIndexMap(headers);
  const obtainedIdx = pickIndex(map, ["obtained", "marks obtained", "marks", "score"]);
  const maxIdx = pickIndex(map, ["max", "maximum", "total marks", "max marks"]);
  if (obtainedIdx < 0 && maxIdx < 0) return { records: [], table, available: false };
  const subject = nearbyHeading(table);
  const records = rows.map((cells, index) =>
    normalizeMarkRow({
      id: `${subject}-${index}`,
      subject,
      component: cells[pickIndex(map, ["assessment", "exam", "component", "type", "particulars"])] || cells[0],
      obtained: parseNumber(cells[obtainedIdx]),
      maximum: parseNumber(cells[maxIdx]),
      weight: parseNumber(cells[pickIndex(map, ["weight", "weightage"])]),
      credits: parseNumber(cells[pickIndex(map, ["credit", "credits"])]),
      letter: cells[pickIndex(map, ["grade"])] || null,
      source: "dom",
    }),
  );
  return { records, table, subject, available: records.length > 0 };
}

export function groupMarksBySubject(records) {
  const groups = new Map();
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
