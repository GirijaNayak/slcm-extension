export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function normalizeHeader(text) {
  return String(text ?? "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/[^a-z0-9 %./-]+/g, "")
    .trim();
}

export function textOf(node) {
  return (node?.textContent || "").replace(/\s+/g, " ").trim();
}

export function parseNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const cleaned = String(value).replace(/[% ,]/g, "").trim();
  if (!cleaned || cleaned === "-" || cleaned === "NA" || cleaned === "N/A") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

export function headerIndexMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    map[normalizeHeader(header)] = index;
  });
  return map;
}

export function pickIndex(map, aliases) {
  for (const alias of aliases) {
    const key = normalizeHeader(alias);
    if (key in map) return map[key];
  }
  for (const [key, index] of Object.entries(map)) {
    if (aliases.some((alias) => key.includes(normalizeHeader(alias)))) return index;
  }
  return -1;
}

export function tableToMatrix(table) {
  if (!table) return { headers: [], rows: [] };
  const headerCells = table.querySelectorAll("thead th, tr:first-child th");
  const headers = [...headerCells].map((cell) => textOf(cell));
  const bodyRows = table.tBodies.length
    ? [...table.tBodies].flatMap((body) => [...body.rows])
    : [...table.rows].slice(headers.length ? 1 : 0);
  const rows = bodyRows
    .map((row) => [...row.cells].map((cell) => textOf(cell)))
    .filter((cells) => cells.some(Boolean));
  return { headers, rows, table };
}
