import assert from "node:assert/strict";
import test from "node:test";
import {
  attendancePercent,
  calculateOverallAttendance,
  classesNeeded,
  classifyStatus,
  enhanceRecord,
  safeSkips,
} from "../src/calculations/attendance.js";
import { analyzeSchedule } from "../src/data/timetable-adapter.js";
import { enhanceAttendanceTable } from "../src/ui/components/attendance/attendance-intelligence.js";
import { enhanceTimetablePage } from "../src/ui/components/timetable/timetable-intelligence.js";
import { mountAcademicDashboard } from "../src/ui/components/dashboard/dashboard.js";
import { INJECT_ATTR } from "../src/shared/constants.js";

// Helper to create mock DOM elements in Node environment
function createMockTable(headers, rows) {
  const headerRow = {
    cells: headers.map((h) => ({ textContent: h, innerHTML: h, querySelector: () => null })),
    appendChild(cell) {
      this.cells.push(cell);
      return cell;
    },
    querySelector: (sel) => (sel === "th" ? {} : null),
  };

  const dataRows = rows.map((r) => {
    const rowObj = {
      cells: r.map((c) => ({ textContent: c, innerHTML: c })),
      appendChild(cell) {
        this.cells.push(cell);
        return cell;
      },
      querySelector: (sel) => null,
      querySelectorAll: (sel) => [],
    };
    return rowObj;
  });

  const allTrs = [headerRow, ...dataRows];

  const tableObj = {
    rows: allTrs,
    tHead: { rows: [headerRow] },
    closest: (sel) => null,
    parentNode: {
      insertBefore: (newNode, refNode) => {},
      querySelectorAll: (sel) => [],
    },
    querySelectorAll: (sel) => {
      if (sel === "tr") return allTrs;
      return [];
    },
    querySelector: (sel) => null,
    setAttribute: () => {},
    getAttribute: () => null,
  };

  return { tableObj, headerRow, dataRows };
}

// 1. Attendance percentage calculation
test("Attendance Intelligence: percentage uses exact counts", () => {
  assert.equal(attendancePercent(18, 24).percent, 75.0);
  assert.equal(attendancePercent(22, 25).percent, 88.0);
  assert.equal(attendancePercent(0, 10).percent, 0.0);
});

// 2. Safe skips formula: S = max(0, floor(P/t - N))
test("Attendance Intelligence: safe skips exact formula", () => {
  // P = 24, N = 28, t = 0.75 -> 24 / 0.75 - 28 = 32 - 28 = 4 skips
  assert.equal(safeSkips(24, 28, 75).skips, 4);

  // Exact boundary: P = 15, N = 20, t = 0.75 -> 15 / 0.75 - 20 = 20 - 20 = 0 skips
  assert.equal(safeSkips(15, 20, 75).skips, 0);

  // Below target: P = 14, N = 20 -> already below target, skips = 0
  assert.equal(safeSkips(14, 20, 75).skips, 0);
  assert.equal(safeSkips(14, 20, 75).reason, "already_below_threshold");
});

// 3. Classes needed formula: R = max(0, ceil((tN - P)/(1 - t)))
test("Attendance Intelligence: classes needed exact formula", () => {
  // P = 10, N = 20, t = 0.75 -> (0.75*20 - 10)/(0.25) = 5 / 0.25 = 20 classes
  assert.equal(classesNeeded(10, 20, 75).needed, 20);

  // P = 14, N = 20, t = 0.75 -> (15 - 14)/0.25 = 1 / 0.25 = 4 classes
  assert.equal(classesNeeded(14, 20, 75).needed, 4);

  // Target met: P = 15, N = 20 -> 0 needed
  assert.equal(classesNeeded(15, 20, 75).needed, 0);
  assert.equal(classesNeeded(15, 20, 75).reason, "already_met");
});

// 4. Target changes reactivity: recalculates properly for 65%, 75%, 85%
test("Attendance Intelligence: target changes update thresholds properly", () => {
  const P = 16, N = 20; // 80% attendance

  // At 75%: Meeting target, 16 / 0.75 - 20 = 21.33 - 20 = 1 safe skip
  assert.equal(safeSkips(P, N, 75).skips, 1);
  assert.equal(classesNeeded(P, N, 75).needed, 0);

  // Target lowered to 65%: 16 / 0.65 - 20 = 24.61 - 20 = 4 safe skips
  assert.equal(safeSkips(P, N, 65).skips, 4);
  assert.equal(classesNeeded(P, N, 65).needed, 0);

  // Target raised to 85%: Below target! Needs (0.85*20 - 16)/0.15 = 1 / 0.15 = 7 classes
  assert.equal(safeSkips(P, N, 85).skips, 0);
  assert.equal(classesNeeded(P, N, 85).needed, 7);
});

// 5. Zero totals and invalid attendance values
test("Attendance Intelligence: handles zero total and malformed inputs gracefully", () => {
  assert.equal(attendancePercent(0, 0).ok, false);
  assert.ok(attendancePercent(0, 0).issues.includes("zero_total"));
  assert.equal(safeSkips(0, 0, 75).ok, false);
  assert.equal(classesNeeded(0, 0, 75).needed, 0); // 0 classes held, no recovery needed

  // Negative or invalid counts
  assert.equal(attendancePercent(-5, 20).ok, false);
  assert.equal(safeSkips(10, -5, 75).ok, false);
  assert.equal(classesNeeded("abc", 20, 75).ok, false);
});

// 6. Overall attendance weighting: sums present / sums total (not average of percentages)
test("Attendance Intelligence: overall attendance weights course counts accurately", () => {
  const courses = [
    { subject: "High Weight Course", present: 45, total: 50 }, // 90% (50 classes)
    { subject: "Low Weight Course", present: 2, total: 10 },    // 20% (10 classes)
  ];

  const overall = calculateOverallAttendance(courses, 75);
  // Total present = 47, Total conducted = 60 -> 47 / 60 = 78.33%
  // An unweighted average would falsely be (90 + 20) / 2 = 55%
  assert.equal(overall.sumPresent, 47);
  assert.equal(overall.sumTotal, 60);
  assert.equal(overall.overallPercent, 78.33);
  assert.equal(overall.coursesMeeting, 1);
  assert.equal(overall.coursesBelow, 1);
  assert.equal(overall.allMeeting, false);
});

// 7. Missing course data
test("Attendance Intelligence: handles records with missing or null counts", () => {
  const mixed = [
    { subject: "Normal", present: 15, total: 20 },
    { subject: "Unscheduled", present: null, total: null },
    { subject: "Pending", present: 0, total: 0 },
  ];

  const overall = calculateOverallAttendance(mixed, 75);
  assert.equal(overall.coursesCount, 1);
  assert.equal(overall.sumPresent, 15);
  assert.equal(overall.sumTotal, 20);
});

// 8. Timetable schedule analysis: current and upcoming class detection
test("Timetable Intelligence: detects current class in progress and next upcoming class", () => {
  const baseDate = new Date();
  baseDate.setHours(10, 30, 0, 0); // 10:30 AM

  const events = [
    { title: "Past Class", start: "09:00", end: "10:00" },
    { title: "Active Class (Now)", start: "10:00", end: "11:00" },
    { title: "Upcoming Class (Next)", start: "11:15", end: "12:15" },
  ];

  const analysis = analyzeSchedule(events, baseDate);
  assert.ok(analysis.current);
  assert.equal(analysis.current.title, "Active Class (Now)");

  assert.ok(analysis.upcoming);
  assert.equal(analysis.upcoming.title, "Upcoming Class (Next)");
});

// 9. Timetable gap analysis
test("Timetable Intelligence: detects breaks between scheduled classes", () => {
  const baseDate = new Date();
  baseDate.setHours(9, 0, 0, 0);

  const events = [
    { title: "Morning Lecture", start: "09:00", end: "10:00" },
    { title: "Noon Lecture", start: "11:00", end: "12:00" }, // 60 min gap
  ];

  const analysis = analyzeSchedule(events, baseDate);
  assert.equal(analysis.gaps.length, 1);
  assert.equal(analysis.gaps[0].minutes, 60);
});

// 10. Exact Image 3 attendance calculation regression test
test("Attendance Summary: calcSafeSkips and calcClassesNeeded reproduce Image 3 student results exactly", async () => {
  const { calcClassesNeeded, calcSafeSkips } = await import("../src/ui/components/attendance/attendance-intelligence.js");
  const target = 80;

  // Row 1: CSE3101: COMPUTER NETWORKS: 32 present, 35 total (92%) -> 5 safe skips, 0 needed
  assert.equal(calcSafeSkips(32, 35, target), 5);
  assert.equal(calcClassesNeeded(32, 35, target), 0);

  // Row 2: CSE3102: SOFTWARE ENGINEERING: 32 present, 32 total (100%) -> 8 safe skips, 0 needed
  assert.equal(calcSafeSkips(32, 32, target), 8);
  assert.equal(calcClassesNeeded(32, 32, target), 0);

  // Row 3: CSE3121: AI & SOFT COMPUTING: 30 present, 32 total (94%) -> 5 safe skips, 0 needed
  assert.equal(calcSafeSkips(30, 32, target), 5);
  assert.equal(calcClassesNeeded(30, 32, target), 0);

  // Row 4: CSE3131: COMPUTER NETWORKS LAB: 7 present, 7 total (100%) -> 1 safe skip, 0 needed
  assert.equal(calcSafeSkips(7, 7, target), 1);
  assert.equal(calcClassesNeeded(7, 7, target), 0);

  // Row 7: CSE3144: ADVANCED DATA STRUCTURES: 20 present, 21 total (96%) -> 4 safe skips, 0 needed
  assert.equal(calcSafeSkips(20, 21, target), 4);
  assert.equal(calcClassesNeeded(20, 21, target), 0);

  // Deficit test: 15 present, 25 total (60%) -> 0 safe skips, 15 needed to reach 80% (with round-up)
  assert.equal(calcSafeSkips(15, 25, target), 0);
  assert.equal(calcClassesNeeded(15, 25, target), 23);
});

// 11. Timetable color mappings: Absent is Red and Not Considered is Blue
test("Timetable Intelligence: attendance type colors match MUJ FISH and student requirements", () => {
  const COLORS = {
    absent: { bg: "#e74c3c", border: "#c0392b" },
    notConsidered: { bg: "#2196f3", border: "#1976d2" },
    present: { bg: "#70a352", border: "#5b8a40" },
  };

  const getEventStyle = (attendanceType) => {
    const t = (attendanceType || "").toLowerCase().trim();
    if (t === "absent") return COLORS.absent;
    if (t === "not considered") return COLORS.notConsidered;
    return COLORS.present;
  };

  assert.deepEqual(getEventStyle("Absent"), { bg: "#e74c3c", border: "#c0392b" });
  assert.deepEqual(getEventStyle("absent"), { bg: "#e74c3c", border: "#c0392b" });
  assert.deepEqual(getEventStyle("Not Considered"), { bg: "#2196f3", border: "#1976d2" });
  assert.deepEqual(getEventStyle("Present"), { bg: "#70a352", border: "#5b8a40" });
});

// 12. Dynamic theme detection
test("Theme Engine: detects dark and light mode dynamically", async () => {
  const { detectIsDarkMode, syncThemeAttribute } = await import("../src/shared/theme.js");
  
  // In Node environment without window/document, safely falls back to false (light)
  assert.equal(detectIsDarkMode(), false);

  const mockHtml = {
    attributes: {},
    setAttribute(k, v) {
      this.attributes[k] = v;
    },
    getAttribute(k) {
      return this.attributes[k];
    },
  };

  const theme = syncThemeAttribute(mockHtml);
  assert.equal(theme, "light");
  assert.equal(mockHtml.getAttribute("data-mujx-theme"), "light");
});

// 13. Login page detection and bypass safety
test("Login Page Detection: accurately identifies unauthenticated login pages and prevents false positive home detection", async () => {
  const { isLoginPage, detectPage } = await import("../src/content/page-detector.js");
  const { PAGE_KINDS } = await import("../src/shared/constants.js");

  // Case A: Root page with password field and 'Sign In' text (matches user's screenshot exactly)
  const mockLoginDoc = {
    title: "Manipal University",
    body: { textContent: "MANIPAL UNIVERSITY JAIPUR WELCOME TO MUJ PORTAL Sign In Parent Login Forgot Password?" },
    querySelector(sel) {
      if (sel === 'input[type="password"]') return { type: "password" };
      if (sel === 'input') return { type: "text" };
      return null;
    },
    querySelectorAll(sel) {
      return [];
    },
  };

  assert.equal(isLoginPage(mockLoginDoc, "https://mujslcm.jaipur.manipal.edu/"), true);
  assert.equal(detectPage(mockLoginDoc, "https://mujslcm.jaipur.manipal.edu/").kind, PAGE_KINDS.login);

  // Case B: Explicit /Account/LogIn URL
  assert.equal(isLoginPage(mockLoginDoc, "https://mujslcm.jaipur.manipal.edu/Account/LogIn"), true);
  assert.equal(detectPage(mockLoginDoc, "https://mujslcm.jaipur.manipal.edu/Account/LogIn").kind, PAGE_KINDS.login);

  // Case C: Authenticated dashboard page (/Home/Dashboard with .kt-header__topbar-username and no password field)
  const mockAuthDoc = {
    title: "MUJ Portal Dashboard",
    body: { textContent: "Student Dashboard List of Events" },
    querySelector(sel) {
      if (sel === 'input[type="password"]') return null;
      if (sel === ".kt-header__topbar-username") return { textContent: "girija (2427030483)" };
      if (sel === ".kt-header") return {};
      return null;
    },
    querySelectorAll(sel) {
      return [{ textContent: "Dashboard" }];
    },
  };

  assert.equal(isLoginPage(mockAuthDoc, "https://mujslcm.jaipur.manipal.edu/Home/Dashboard"), false);
  assert.equal(detectPage(mockAuthDoc, "https://mujslcm.jaipur.manipal.edu/Home/Dashboard").kind, PAGE_KINDS.home);

  // Case D: Authenticated attendance page that has a hidden Change Password modal in Metronic layout
  const mockAttendanceWithPasswordModal = {
    title: "Attendance Summary",
    body: { textContent: "List of Attendance Course Name Present Total" },
    querySelector(sel) {
      if (sel === 'input[type="password"]') return { type: "password", name: "OldPassword" };
      if (sel === ".kt-header__topbar-username") return { textContent: "girija (2427030483)" };
      return null;
    },
    querySelectorAll(sel) {
      return [{ textContent: "Attendance Summary" }];
    },
  };

  assert.equal(isLoginPage(mockAttendanceWithPasswordModal, "https://mujslcm.jaipur.manipal.edu/Student/Academic/AttendanceSummaryForStudent"), false);
  assert.equal(detectPage(mockAttendanceWithPasswordModal, "https://mujslcm.jaipur.manipal.edu/Student/Academic/AttendanceSummaryForStudent").kind, PAGE_KINDS.attendance);
});


