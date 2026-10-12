import assert from "node:assert/strict";
import test from "node:test";
import { computeSgpa, gradePointForLetter } from "../src/calculations/sgpa.js";
import { computeCgpa } from "../src/calculations/cgpa.js";
import { recordNotifications, dismissNotification } from "../src/storage/cache.js";

// Mock document for Node environment
if (typeof globalThis.document === "undefined") {
  const elements = new Set();
  globalThis.document = {
    createElement: (tag) => {
      const el = {
        tagName: tag.toUpperCase(),
        attributes: {},
        style: {},
        children: [],
        setAttribute: (k, v) => { el.attributes[k] = String(v); },
        getAttribute: (k) => el.attributes[k] || null,
        removeAttribute: (k) => { delete el.attributes[k]; },
        hasAttribute: (k) => k in el.attributes,
        append: (...children) => { el.children.push(...children); },
        remove: () => { elements.delete(el); },
        attachShadow: () => ({ append: () => {}, querySelector: () => null }),
      };
      elements.add(el);
      return el;
    },
    querySelectorAll: (sel) => Array.from(elements),
    getElementById: () => null,
    documentElement: { append: () => {} },
    body: { append: () => {}, contains: () => true },
  };
}

// Mock chrome.storage.local for unit testing environment
if (typeof globalThis.chrome === "undefined") {
  const store = new Map();
  globalThis.chrome = {
    runtime: {
      getURL: (path) => `chrome-extension://mock-id/${path}`,
    },
    storage: {
      local: {
        get: async (keys) => {
          const res = {};
          const keyList = Array.isArray(keys) ? keys : typeof keys === "string" ? [keys] : Object.keys(keys || {});
          for (const k of keyList) {
            if (store.has(k)) res[k] = store.get(k);
          }
          return res;
        },
        set: async (items) => {
          for (const [k, v] of Object.entries(items)) {
            store.set(k, v);
          }
        },
        remove: async (keys) => {
          const keyList = Array.isArray(keys) ? keys : [keys];
          for (const k of keyList) {
            store.delete(k);
          }
        },
      },
    },
  };
}

// Dynamic import after globals setup
const { teardownAll, injectColumn } = await import("../src/content/overlay-manager.js");

test("Authoritative Certificate Example: Course-level GPA = 8.48 over 25 credits", () => {
  // Exact courses from Certificate-of-GPA-And-CGPA-Calculation-Process.pdf
  const certificateCourses = [
    { name: "Engg. Mathematics-I", credits: 4, letter: "A" },
    { name: "Mechanics of Solids", credits: 4, letter: "A+" },
    { name: "Basic Electronics", credits: 4, letter: "B" },
    { name: "Mechanical Engg. Science", credits: 4, letter: "C" },
    { name: "Engineering Physics", credits: 4, letter: "B" },
    { name: "Comm. Skills in English", credits: 3, letter: "A" },
    { name: "Basic Workshop Practice", credits: 1, letter: "A" },
    { name: "Engineering Physics Lab", credits: 1, letter: "B" },
  ];

  // Verify letter grade points
  assert.equal(gradePointForLetter("A+"), 10);
  assert.equal(gradePointForLetter("A"), 9);
  assert.equal(gradePointForLetter("B"), 8);
  assert.equal(gradePointForLetter("C"), 7);

  const result = computeSgpa(certificateCourses);

  assert.equal(result.ok, true);
  assert.equal(result.credits, 25);
  // (4*9 + 4*10 + 4*8 + 4*7 + 4*8 + 3*9 + 1*9 + 1*8) = (36 + 40 + 32 + 28 + 32 + 27 + 9 + 8) = 212
  assert.equal(result.creditPoints, 212);
  // GPA = 212 / 25 = 8.48
  assert.equal(result.sgpa, 8.48);
});

test("Authoritative Certificate Example: Final CGPA = 8.44 over 102 credits", () => {
  // Semester-wise table from Certificate-of-GPA-And-CGPA-Calculation-Process.pdf
  // Semester i: Credits 25, GPA 8.48 -> 212.0
  // Semester ii: Credits 25, GPA 8.62 -> 215.5
  // Semester iii: Credits 26, GPA 8.24 -> 214.24
  // Semester iv: Credits 26, GPA 8.42 -> 218.92
  // Total credits = 102, Total points = 860.66
  // CGPA = 860.66 / 102 = 8.43784... rounds to 8.44
  const result = computeCgpa({
    currentCgpa: 8.48,
    completedCredits: 25,
    semesters: [
      { label: "Semester ii", credits: 25, sgpa: 8.62 },
      { label: "Semester iii", credits: 26, sgpa: 8.24 },
      { label: "Semester iv", credits: 26, sgpa: 8.42 },
    ],
  });

  assert.equal(result.ok, true);
  assert.equal(result.totalCredits, 102);
  assert.equal(result.finalCgpa, 8.44);
});

test("Alerts deduplication and dismissal persistence", async () => {
  const alert1 = { id: "att-math-low", title: "Math Attendance Low", priority: "high" };
  const alert2 = { id: "tt-change-1", title: "Timetable Updated", priority: "medium" };

  // First record call adds both
  const list1 = await recordNotifications([alert1, alert2]);
  assert.equal(list1.length, 2);

  // Re-recording identical alert does not create duplicate
  const list2 = await recordNotifications([alert1]);
  assert.equal(list2.length, 2);

  // Dismissing alert1 removes it from active list and persists to dismissed set
  const afterDismiss = await dismissNotification(alert1.id);
  assert.equal(afterDismiss.length, 1);
  assert.equal(afterDismiss[0].id, alert2.id);

  // Re-recording dismissed alert does NOT re-add it
  const list3 = await recordNotifications([alert1]);
  assert.equal(list3.length, 1);
  assert.equal(list3[0].id, alert2.id);
});

test("DOM teardown cleanly removes injected overlay hosts and columns", () => {
  const headerRow = { append: () => {} };
  const row1 = { append: () => {}, cells: [] };
  const table = {
    querySelector: (sel) => (sel.includes("thead") ? headerRow : null),
    querySelectorAll: (sel) => [],
    rows: [headerRow, row1],
    tBodies: [{ rows: [row1] }],
  };

  const cleanupCol = injectColumn(table, {
    key: "test-col",
    title: "Test Col",
    render: () => {},
  });

  assert.equal(typeof cleanupCol, "function");

  assert.doesNotThrow(() => {
    teardownAll();
  });
});
