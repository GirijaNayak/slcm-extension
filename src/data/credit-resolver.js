import { parseGradesTable } from "./grades-adapter.js";

/**
 * Intelligently infers course credits based on standard MUJ course codes,
 * course titles, and course types when explicit credits are unavailable in the DOM.
 */
export function inferCourseCredits(courseName = "", courseCode = "", courseType = "theory") {
  const name = courseName.toLowerCase();
  const code = courseCode.toUpperCase();

  // 1. Project-Based Learning & Non-Standard Credits
  if (name.includes("project-based learning 2") || name.includes("pbl 2") || code === "CSE2270") {
    return 2;
  }
  if (name.includes("project-based learning 1") || name.includes("pbl 1") || code === "CSE1270") {
    return 1;
  }
  if (name.includes("creativity & innovation") || name.includes("creativity and innovation") || code === "MEE1007") {
    return 2;
  }
  if (name.includes("technical writing") || code.startsWith("LLC")) {
    return 1;
  }

  // 2. Labs & Practicals (usually 1 credit)
  if (
    courseType === "lab" ||
    name.includes("lab") ||
    name.includes("practical") ||
    /(?:30|31|32|33|34|35|36|37|38|39)$/.test(code)
  ) {
    return 1;
  }

  // 3. Core 4-credit courses (heavy foundations / core engineering mathematics & theory)
  if (
    code === "CSE2201" || // Design and Analysis of Algorithm
    code === "CSE2240" || // Automata and Compiler Design
    code === "MAS1001" || // Calculus & Matrices
    code === "CHY1001" || // Engineering Chemistry
    code === "EEE1002" || // Electrical & Electronics Systems
    code === "PHY1001" || // Engineering Physics
    name.includes("calculus") ||
    name.includes("automata") ||
    name.includes("design and analysis of algorithm")
  ) {
    return 4;
  }

  // 4. Standard MUJ theory courses (OS, Cryptography, Economics, Marketing, etc.) are 3 credits
  return 3;
}

/**
 * Resolves credits for all courses by cross-referencing:
 * 1. Previously stored / user-customized credits in chrome.storage.local
 * 2. Official Grades page (/Student/Academic/GradesForStudent)
 * 3. Attendance Summary endpoint (/Student/Academic/GetAttendanceSummaryList)
 * 4. Faculty Grades API endpoint (/Student/Academic/GetGradesForFaculty)
 * 5. Rule-based curriculum inference
 */
export async function resolveAllCredits(sem = "") {
  const merged = {};

  // 1. Stored credits from chrome.storage.local
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const stored = await new Promise((res) =>
        chrome.storage.local.get("courseCredits", (d) => res(d?.courseCredits || {}))
      );
      Object.assign(merged, stored);
    }
  } catch (_) {}

  // 2. Fetch past grades from Examination / Grades page (/Student/Academic/GradesForStudent)
  try {
    const res = await fetch("/Student/Academic/GradesForStudent", { credentials: "same-origin" });
    if (res.ok) {
      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, "text/html");
      const table = doc.getElementById("kt_ViewTable") || doc.querySelector("table");
      if (table) {
        const data = parseGradesTable(table);
        data.records.forEach((r) => {
          if (r.courseCode && r.credits) merged[r.courseCode] = r.credits;
        });
      }
    }
  } catch (_) {}

  // 3. Fetch from Attendance Summary (/Student/Academic/GetAttendanceSummaryList)
  try {
    const res = await fetch("/Student/Academic/GetAttendanceSummaryList", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
      body: new URLSearchParams({ StudentCode: "" }).toString(),
    });
    if (res.ok) {
      const d = await res.json();
      const list = d?.AttendanceSummaryList || [];
      list.forEach((it) => {
        const code = (it.CourseCode || it.CourseID || "").match(/\b([A-Z]{2,4}\d{4}[A-Z]?)\b/i)?.[1]?.toUpperCase();
        const cr = Number(it.Credits ?? it.Credit ?? it.TotalCredits);
        if (code && !isNaN(cr) && cr > 0) merged[code] = cr;
      });
    }
  } catch (_) {}

  // 4. Fetch from Faculty Grades API (/Student/Academic/GetGradesForFaculty)
  try {
    const res = await fetch("/Student/Academic/GetGradesForFaculty", {
      method: "POST",
      credentials: "same-origin",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: new URLSearchParams({ Enrollment: "", Semester: sem || "" }).toString(),
    });
    if (res.ok) {
      const d = await res.json();
      const list = d?.InternalMarksList || [];
      list.forEach((item) => {
        const code = (item?.CourseCode || "").trim().toUpperCase();
        const cr = Number(item?.Credits ?? item?.Credit);
        if (code && !isNaN(cr) && cr > 0) merged[code] = cr;
      });
    }
  } catch (_) {}

  // Persist updated credits back to storage
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local && Object.keys(merged).length > 0) {
      chrome.storage.local.get("courseCredits", (res) => {
        const prev = res?.courseCredits || {};
        chrome.storage.local.set({ courseCredits: { ...prev, ...merged } });
      });
    }
  } catch (_) {}

  return merged;
}
