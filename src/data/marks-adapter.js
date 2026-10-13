import { headerIndexMap, parseNumber, pickIndex, tableToMatrix } from "../shared/dom.js";
import { normalizeMarkRow } from "./normalizers.js";
import { classifyCourseType } from "../calculations/provisional-grade.js";
import { roundTo } from "../calculations/rounding.js";
import { inferCourseCredits } from "./credit-resolver.js";

export function extractMarksFromDocument(doc = document) {
  const tables = [...doc.querySelectorAll("table")];
  
  // 1. Try summary table first (InternalMarkForStudent / StudentMarksDetail)
  for (const table of tables) {
    const summary = parseInternalMarksSummaryTable(table);
    if (summary.available && summary.courses.length) {
      return {
        records: summary.courses.map((c) => ({
          subject: c.courseName,
          courseCode: c.courseCode,
          obtained: c.internalSubtotal,
          component: "Internal Subtotal",
          credits: c.credits,
          letter: c.officialGrade,
          ...c,
        })),
        summary,
        table,
        source: "internal-marks-summary",
        available: true,
      };
    }
  }

  // 2. Fallback to component-wise assessment marks tables
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

/**
 * Parses the horizontal course-wise marks table on /Student/Academic/InternalMarkForStudent
 * with columns: Course Name, MTE1, MTE2, CWS, RE-SESSION, PRS, Total, Credits, Grade.
 */
export function parseInternalMarksSummaryTable(table) {
  if (!table) return { available: false, courses: [], table: null };
  const matrix = tableToMatrix(table);
  const { headers, rows, headerRow, allRows, headerRowIndex } = matrix;
  const map = headerIndexMap(headers);

  const courseIdx = pickIndex(map, ["course name", "course", "subject", "paper name", "paper"]);
  const codeIdx = pickIndex(map, ["course code", "code", "subject code"]);
  const mte1Idx = pickIndex(map, ["mte1", "mte 1", "mid term 1", "midterm 1"]);
  const mte2Idx = pickIndex(map, ["mte2", "mte 2", "mid term 2", "midterm 2"]);
  let mteIdx = -1;
  if (map["mte"] !== undefined) {
    mteIdx = map["mte"];
  } else if (map["mid term"] !== undefined) {
    mteIdx = map["mid term"];
  } else if (map["midterm"] !== undefined) {
    mteIdx = map["midterm"];
  } else if (mte1Idx < 0 && mte2Idx < 0) {
    mteIdx = pickIndex(map, ["mte", "mid term", "midterm"]);
  }
  const cwsIdx = pickIndex(map, ["cws", "class work", "sessional", "sessionals", "cws marks"]);
  const reSessionIdx = pickIndex(map, ["re-session", "resession", "re session"]);
  const prsIdx = pickIndex(map, ["prs", "practical", "lab", "practical marks"]);
  const totalIdx = pickIndex(map, ["total", "total marks", "internal total"]);
  const creditIdx = pickIndex(map, ["credits", "credit", "cr"]);
  const gradeIdx = pickIndex(map, ["grade", "letter grade", "official grade"]);

  // Must have at least course and one assessment column (mte, cws, prs, or total)
  const hasMarksColumns = mte1Idx >= 0 || mteIdx >= 0 || cwsIdx >= 0 || prsIdx >= 0 || totalIdx >= 0;
  if (courseIdx < 0 || !hasMarksColumns) {
    return { available: false, courses: [], table };
  }

  const courses = [];
  const seen = new Set();

  for (const cells of rows) {
    if (!cells || !cells.length) continue;
    const firstCell = (cells[0] || "").toLowerCase();
    if (firstCell.includes("total") || cells.some((c) => c && c.toLowerCase() === "total")) {
      continue;
    }

    let courseName = (courseIdx >= 0 ? cells[courseIdx] : "") || cells[0] || "";
    let courseCode = (codeIdx >= 0 ? cells[codeIdx] : "") || "";
    if (!courseCode && courseName) {
      const match = courseName.match(/\(([A-Za-z0-9\-\/]{4,12})\)/);
      if (match) {
        courseCode = match[1].trim().toUpperCase();
      }
    }
    if (!courseName && !courseCode) continue;

    const dedupeKey = `${courseCode || courseName}`.toUpperCase();
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);

    const mte1 = mte1Idx >= 0 ? parseNumber(cells[mte1Idx]) : null;
    const mte2 = mte2Idx >= 0 ? parseNumber(cells[mte2Idx]) : null;
    const mteDirect = mteIdx >= 0 ? parseNumber(cells[mteIdx]) : null;
    const reSession = reSessionIdx >= 0 ? parseNumber(cells[reSessionIdx]) : null;
    const cws = cwsIdx >= 0 ? parseNumber(cells[cwsIdx]) : null;
    const prs = prsIdx >= 0 ? parseNumber(cells[prsIdx]) : null;
    const declaredTotal = totalIdx >= 0 ? parseNumber(cells[totalIdx]) : null;
    const credits = creditIdx >= 0 ? parseNumber(cells[creditIdx]) : null;
    const officialGrade = gradeIdx >= 0 && cells[gradeIdx] ? cells[gradeIdx].trim().toUpperCase() : null;

    // Resolve MTE score
    let mte = mteDirect;
    if (mte === null) {
      if (mte1 !== null && mte2 !== null) {
        let bestMte1 = mte1;
        let bestMte2 = mte2;
        if (reSession !== null) {
          if (mte1 < mte2) bestMte1 = Math.max(mte1, reSession);
          else bestMte2 = Math.max(mte2, reSession);
        }
        mte = roundTo(bestMte1 + bestMte2, 2);
      } else if (mte1 !== null) {
        mte = reSession !== null ? Math.max(mte1, reSession) : mte1;
      } else if (mte2 !== null) {
        mte = reSession !== null ? Math.max(mte2, reSession) : mte2;
      }
    }

    const courseType = classifyCourseType({ courseName, courseCode, prs, mte, mte1, cws });

    // Internal subtotal
    let internalSubtotal = 0;
    if (courseType === "lab" || courseType === "pbl") {
      if (prs !== null) {
        internalSubtotal = prs;
      } else if (mte !== null || cws !== null) {
        internalSubtotal = (mte !== null ? mte : 0) + (cws !== null ? cws : 0);
      } else if (declaredTotal !== null) {
        internalSubtotal = declaredTotal;
      }
    } else {
      internalSubtotal = (mte !== null ? mte : 0) + (cws !== null ? cws : 0);
      if (internalSubtotal === 0 && declaredTotal !== null) {
        internalSubtotal = declaredTotal;
      } else if (internalSubtotal === 0 && prs !== null) {
        internalSubtotal = prs;
      }
    }

    courses.push({
      id: `${courseCode || courseName}`,
      courseCode,
      courseName,
      courseType,
      mte1,
      mte2,
      mte,
      reSession,
      cws,
      prs,
      declaredTotal,
      internalSubtotal: roundTo(internalSubtotal, 2),
      credits: credits !== null ? credits : inferCourseCredits(courseName, courseCode, courseType),
      officialGrade: officialGrade || null,
    });
  }

  return {
    available: courses.length > 0,
    table,
    courses,
    headerRow,
    allRows,
    headerRowIndex,
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

