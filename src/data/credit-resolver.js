import { parseGradesTable } from "./grades-adapter.js";

/**
 * Intelligently infers course credits based on standard MUJ course codes,
 * course titles, and course types when explicit credits are unavailable in the DOM.
 */
export function inferCourseCredits(courseName = "", courseCode = "", courseType = "theory", isSatisfactory = false) {
  const name = String(courseName || "").toLowerCase();
  const code = String(courseCode || "").toUpperCase();

  // 1. All Labs, PBL, and Satisfactory/Unsatisfactory (S/U) courses are preset to 1 credit
  if (
    courseType === "lab" ||
    courseType === "pbl" ||
    isSatisfactory ||
    code === "MEE1007" ||
    name.includes("creativity & innovation") ||
    name.includes("creativity and innovation") ||
    name.includes("pbl") ||
    name.includes("project-based") ||
    name.includes("project based") ||
    code.includes("PBL") ||
    code === "CSE1270" ||
    code === "CSE2170" ||
    code === "CSE2270" ||
    code === "CSE3170" ||
    /\b(lab|laboratory|practical|workshop)\b/i.test(name) ||
    code.endsWith("L") ||
    code.endsWith("P") ||
    /(?:103\d|213\d|313\d|323\d)/.test(code) ||
    /(?:30|31|32|33|34|35|36|37|38|39)$/.test(code)
  ) {
    return 1;
  }

  if (name.includes("technical writing") || code.startsWith("LLC")) {
    return 1;
  }

  // 2. Core 4-credit courses (heavy foundations / core engineering mathematics & theory)
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

  // 3. Standard MUJ theory courses (OS, Cryptography, Economics, Marketing, etc.) are 3 credits
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
  const userCustom = {};
  const satisfactory = {
    MEE1007: true,
  };

  // 1. Stored credits, user custom choices, and satisfactory courses from chrome.storage.local
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const stored = await new Promise((res) =>
        chrome.storage.local.get(["userCustomCredits", "courseCredits", "satisfactoryCourses", "subjectGrades"], (d) => res(d || {}))
      );
      if (stored?.courseCredits) Object.assign(merged, stored.courseCredits);
      if (stored?.userCustomCredits) Object.assign(userCustom, stored.userCustomCredits);
      if (stored?.satisfactoryCourses) Object.assign(satisfactory, stored.satisfactoryCourses);
      if (stored?.subjectGrades) {
        Object.entries(stored.subjectGrades).forEach(([k, g]) => {
          if (g === "S" || g === "U" || g === "AP") satisfactory[k] = true;
        });
      }
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
          if (r.courseCode && (r.letter === "S" || r.letter === "U" || r.letter === "AP")) {
            satisfactory[r.courseCode] = true;
          }
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

  // 5. User custom overrides ALWAYS take highest priority over network values
  Object.assign(merged, userCustom);

  // 6. Persist updated credits and satisfactory courses back to storage
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      if (Object.keys(merged).length > 0) {
        chrome.storage.local.get("courseCredits", (res) => {
          const prev = res?.courseCredits || {};
          chrome.storage.local.set({ courseCredits: { ...prev, ...merged } });
        });
      }
      if (Object.keys(satisfactory).length > 0) {
        chrome.storage.local.get("satisfactoryCourses", (res) => {
          const prev = res?.satisfactoryCourses || {};
          chrome.storage.local.set({ satisfactoryCourses: { ...prev, ...satisfactory } });
        });
      }
    }
  } catch (_) {}

  merged.__satisfactory = satisfactory;
  merged.__userCustom = userCustom;
  return merged;
}
