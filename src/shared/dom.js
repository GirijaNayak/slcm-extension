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
  if (!table) return { headers: [], rows: [], table, headerRow: null, headerRowIndex: -1, allRows: [] };

  const allRows = [...table.querySelectorAll("tr")];
  if (!allRows.length) return { headers: [], rows: [], table, headerRow: null, headerRowIndex: -1, allRows: [] };

  // Search through the first few rows to locate the real column header row
  let headerRowIndex = -1;
  for (let i = 0; i < Math.min(allRows.length, 5); i++) {
    const cells = [...allRows[i].children];
    const texts = cells.map(textOf).map((t) => t.toLowerCase());
    const matchCount = texts.filter((t) =>
      t.includes("course") ||
      t.includes("grade") ||
      t.includes("credit") ||
      t.includes("subject") ||
      t.includes("present") ||
      t.includes("total") ||
      t.includes("session") ||
      t.includes("s. no") ||
      t === "s.no." ||
      t === "s.no" ||
      t === "s. no."
    ).length;

    // If at least 2 header keywords match, this is definitely the header row
    if (matchCount >= 2) {
      headerRowIndex = i;
      break;
    }
  }

  // Fallback: look for <thead> row or row containing <th> tags
  if (headerRowIndex === -1) {
    const theadTr = table.querySelector("thead tr");
    if (theadTr) {
      headerRowIndex = allRows.indexOf(theadTr);
    } else {
      const thRow = allRows.find((r) => r.querySelector("th"));
      if (thRow) {
        headerRowIndex = allRows.indexOf(thRow);
      }
    }
  }

  if (headerRowIndex === -1) headerRowIndex = 0;

  const headerRow = allRows[headerRowIndex];
  const headers = [...headerRow.children].map(textOf);
  const rows = allRows
    .slice(headerRowIndex + 1)
    .map((row) => [...row.children].map(textOf))
    .filter((cells) => cells.some(Boolean));

  return { headers, rows, table, headerRow, headerRowIndex, allRows };
}
