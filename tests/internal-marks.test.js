import assert from "node:assert/strict";
import test from "node:test";
import { parseInternalMarksSummaryTable } from "../src/data/marks-adapter.js";
import { classifyCourseType } from "../src/calculations/provisional-grade.js";

// Mock helper to build an HTML table element with rows and cells
function createMockTable(headers, rows) {
  const trElements = [
    {
      children: headers.map((h) => ({ textContent: h, innerHTML: h })),
      querySelectorAll: () => [],
      querySelector: () => null,
    },
    ...rows.map((row) => ({
      children: row.map((c) => ({ textContent: c, innerHTML: c })),
      querySelectorAll: () => [],
      querySelector: () => null,
    })),
  ];

  return {
    rows: trElements,
    tBodies: [],
    querySelectorAll: (sel) => (sel === "tr" ? trElements : []),
    querySelector: () => null,
    getAttribute: () => null,
    setAttribute: () => {},
  };
}

test("parseInternalMarksSummaryTable extracts course data accurately", () => {
  const headers = ["Course Name", "MTE1", "MTE2", "CWS", "RE-SESSION", "PRS", "Total", "Credits", "Grade"];
  const rows = [
    ["DATA STRUCTURES", "12.00", "13.00", "25.00", "-", "-", "50.00", "4", "-"],
    ["DATA STRUCTURES LAB", "-", "-", "-", "-", "28.00", "28.00", "1", "-"],
    ["DISCRETE MATHEMATICS", "14.00", "11.00", "22.50", "13.00", "-", "49.50", "4", "-"],
    ["TOTAL", "26.00", "24.00", "47.50", "-", "28.00", "127.50", "9", "-"],
  ];

  const table = createMockTable(headers, rows);
  const result = parseInternalMarksSummaryTable(table);

  assert.equal(result.available, true);
  assert.equal(result.courses.length, 3); // Excludes Total row

  const ds = result.courses[0];
  assert.equal(ds.courseName, "DATA STRUCTURES");
  assert.equal(ds.courseType, "theory");
  assert.equal(ds.mte, 25); // 12 + 13
  assert.equal(ds.cws, 25);
  assert.equal(ds.internalSubtotal, 50);
  assert.equal(ds.credits, 4);

  const lab = result.courses[1];
  assert.equal(lab.courseName, "DATA STRUCTURES LAB");
  assert.equal(lab.courseType, "lab");
  assert.equal(lab.prs, 28);
  assert.equal(lab.internalSubtotal, 28);
  assert.equal(lab.credits, 1);

  const dm = result.courses[2];
  assert.equal(dm.courseName, "DISCRETE MATHEMATICS");
  // MTE1 = 14, MTE2 = 11, RE-SESSION = 13. Best replaces MTE2: 14 + 13 = 27
  assert.equal(dm.mte, 27);
  assert.equal(dm.cws, 22.5);
  assert.equal(dm.internalSubtotal, 49.5);
});

test("parseInternalMarksSummaryTable handles 0.00 score without converting to null", () => {
  const headers = ["Course Name", "MTE1", "MTE2", "CWS", "RE-SESSION", "PRS", "Total", "Credits", "Grade"];
  const rows = [
    ["OPERATING SYSTEMS", "0.00", "15.00", "20.00", "-", "-", "35.00", "4", "-"],
  ];

  const table = createMockTable(headers, rows);
  const result = parseInternalMarksSummaryTable(table);

  assert.equal(result.available, true);
  const os = result.courses[0];
  assert.equal(os.mte1, 0);
  assert.equal(os.mte, 15);
  assert.equal(os.internalSubtotal, 35);
});

test("parseInternalMarksSummaryTable ignores tables without internal marks columns", () => {
  const headers = ["S. No.", "Course Code", "Course Name", "Credits", "Grade"];
  const rows = [
    ["1", "CS101", "Introduction to Computing", "4", "A"],
  ];

  const table = createMockTable(headers, rows);
  const result = parseInternalMarksSummaryTable(table);

  assert.equal(result.available, false);
  assert.equal(result.courses.length, 0);
});
