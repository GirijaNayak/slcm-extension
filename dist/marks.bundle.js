(() => {
  // src/shared/dom.js
  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }
  function normalizeHeader(text) {
    return String(text ?? "").toLowerCase().replace(/\s+/g, " ").replace(/[^a-z0-9 %./-]+/g, "").trim();
  }
  function textOf(node) {
    return (node?.textContent || "").replace(/\s+/g, " ").trim();
  }
  function parseNumber(value) {
    if (value === null || value === void 0 || value === "") return null;
    const cleaned = String(value).replace(/[% ,]/g, "").trim();
    if (!cleaned || cleaned === "-" || cleaned === "NA" || cleaned === "N/A") return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  function headerIndexMap(headers) {
    const map = {};
    headers.forEach((header, index) => {
      map[normalizeHeader(header)] = index;
    });
    return map;
  }
  function pickIndex(map, aliases) {
    for (const alias of aliases) {
      const key = normalizeHeader(alias);
      if (key in map) return map[key];
    }
    for (const [key, index] of Object.entries(map)) {
      if (aliases.some((alias) => key.includes(normalizeHeader(alias)))) return index;
    }
    return -1;
  }
  function tableToMatrix(table) {
    if (!table) return { headers: [], rows: [], table, headerRow: null, headerRowIndex: -1, allRows: [] };
    const allRows = [...table.querySelectorAll("tr")];
    if (!allRows.length) return { headers: [], rows: [], table, headerRow: null, headerRowIndex: -1, allRows: [] };
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(allRows.length, 5); i++) {
      const cells = [...allRows[i].children];
      const texts = cells.map(textOf).map((t) => t.toLowerCase());
      const matchCount = texts.filter(
        (t) => t.includes("course") || t.includes("grade") || t.includes("credit") || t.includes("subject") || t.includes("present") || t.includes("total") || t.includes("session") || t.includes("s. no") || t === "s.no." || t === "s.no" || t === "s. no."
      ).length;
      if (matchCount >= 2) {
        headerRowIndex = i;
        break;
      }
    }
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
    const rows = allRows.slice(headerRowIndex + 1).map((row) => [...row.children].map(textOf)).filter((cells) => cells.some(Boolean));
    return { headers, rows, table, headerRow, headerRowIndex, allRows };
  }

  // src/data/normalizers.js
  function normalizeGradeRow(raw) {
    const sessionVal = raw.session ?? raw.AcademicSession ?? raw.academicSession ?? raw.semester ?? raw.Semester ?? raw.SemesterName ?? null;
    return {
      id: String(raw.id ?? raw.CourseCode ?? cryptoRandom()),
      courseCode: raw.courseCode ?? raw.CourseCode ?? "",
      subject: raw.subject ?? raw.CourseName ?? "",
      credits: firstNumber(raw, ["credits", "Credits", "Credit"]),
      letter: raw.letter ?? raw.Grade ?? raw.GradeLetter ?? null,
      gradePoints: firstNumber(raw, ["gradePoints", "GradePoint", "GP"]),
      semester: sessionVal,
      session: sessionVal,
      excludeFromGpa: Boolean(raw.excludeFromGpa),
      source: raw.source || "unknown"
    };
  }
  function firstNumber(raw, keys) {
    for (const key of keys) {
      if (raw[key] !== void 0 && raw[key] !== null && raw[key] !== "") {
        const n = parseNumber(raw[key]);
        if (n !== null) return n;
      }
    }
    return null;
  }
  function cryptoRandom() {
    if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
    return `row-${Math.random().toString(16).slice(2)}`;
  }

  // src/calculations/provisional-grade.js
  var RELATIVE_GRADING_DISCLAIMER = "Important: SGPA and Grade Prediction Is Only an Estimate. MUJ follows a relative grading system. These predictions use the configured marks thresholds and available assessment data, so your final grades and SGPA may differ from the university's officially declared results. Do not treat the predicted SGPA as your final SGPA.";
  var THEORY_GRADE_THRESHOLDS = Object.freeze([
    { grade: "A+", min: 82, max: Infinity, condition: ">= 82" },
    { grade: "A", min: 72, max: 82, condition: ">= 72 and < 82" },
    { grade: "B", min: 62, max: 72, condition: ">= 62 and < 72" },
    { grade: "C", min: 52, max: 62, condition: ">= 52 and < 62" },
    { grade: "D", min: 42, max: 52, condition: ">= 42 and < 52" },
    { grade: "E", min: 35.000001, max: 42, condition: "> 35 and < 42" },
    { grade: "F", min: -Infinity, max: 35, condition: "< 35" }
  ]);
  var LAB_PBL_GRADE_THRESHOLDS = Object.freeze([
    { grade: "A+", min: 90, max: Infinity, condition: ">= 90" },
    { grade: "A", min: 80, max: 90, condition: ">= 80 and < 90" },
    { grade: "B", min: 70, max: 80, condition: ">= 70 and < 80" },
    { grade: "C", min: 60, max: 70, condition: ">= 60 and < 70" },
    { grade: "D", min: 50, max: 60, condition: ">= 50 and < 60" },
    { grade: "E", min: 35.000001, max: 50, condition: "> 35 and < 50" },
    { grade: "F", min: -Infinity, max: 35, condition: "< 35" }
  ]);
  function classifyCourseType(course = {}) {
    const name = String(course.courseName || course.subject || course.name || "").toUpperCase();
    const code = String(course.courseCode || course.code || "").toUpperCase();
    if (name.includes("PBL") || name.includes("PROJECT BASED LEARNING") || code.includes("PBL") || name.includes("PROJECT-BASED")) {
      return "pbl";
    }
    const hasTheoryComponents = course.mte !== null && course.mte !== void 0 || course.mte1 !== null && course.mte1 !== void 0 || course.cws !== null && course.cws !== void 0;
    const hasPrs = course.prs !== null && course.prs !== void 0;
    if (hasTheoryComponents && !hasPrs) {
      return "theory";
    }
    if (/\b(LAB|LABORATORY|PRACTICAL|WORKSHOP)\b/i.test(name) || code.endsWith("L") || code.endsWith("P") || /(?:103\d|213\d|313\d|323\d)/.test(code) || // MUJ lab course code convention (e.g. CSE1031, CSE2131)
    hasPrs && !hasTheoryComponents) {
      return "lab";
    }
    return "theory";
  }
  function classifyProvisionalGrade(totalMarks, courseType = "theory") {
    const normType = String(courseType || "theory").toLowerCase();
    if (normType !== "theory" && normType !== "lab" && normType !== "pbl") {
      return {
        ok: false,
        grade: null,
        status: "unknown_type",
        totalMarks: null,
        courseType: normType,
        minThreshold: null,
        isBoundaryAmbiguous: false,
        message: `Unknown course type '${courseType}'. Must be 'theory', 'lab', or 'pbl'.`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    if (totalMarks === null || totalMarks === void 0 || totalMarks === "") {
      return {
        ok: false,
        grade: null,
        status: "missing_marks",
        totalMarks: null,
        courseType: normType,
        minThreshold: null,
        isBoundaryAmbiguous: false,
        message: "Marks value is missing or unavailable.",
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const score = Number(totalMarks);
    if (!Number.isFinite(score) || score < 0) {
      return {
        ok: false,
        grade: null,
        status: "invalid_marks",
        totalMarks: score,
        courseType: normType,
        minThreshold: null,
        isBoundaryAmbiguous: false,
        message: `Invalid marks score (${totalMarks}).`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    if (Math.abs(score - 35) < 1e-9) {
      return {
        ok: false,
        grade: null,
        status: "undefined_boundary",
        totalMarks: 35,
        courseType: normType,
        minThreshold: null,
        isBoundaryAmbiguous: true,
        message: "Score is exactly 35 marks. The university specification defines E as 'Above 35' and F as 'Below 35', leaving exactly 35 marks undefined.",
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const isLabOrPbl = normType === "lab" || normType === "pbl";
    if (isLabOrPbl) {
      if (score >= 90) return result("A+", 90, normType, score);
      if (score >= 80) return result("A", 80, normType, score);
      if (score >= 70) return result("B", 70, normType, score);
      if (score >= 60) return result("C", 60, normType, score);
      if (score >= 50) return result("D", 50, normType, score);
      if (score > 35 && score < 50) return result("E", 35.01, normType, score);
      if (score < 35) return result("F", 0, normType, score);
    } else {
      if (score >= 82) return result("A+", 82, normType, score);
      if (score >= 72) return result("A", 72, normType, score);
      if (score >= 62) return result("B", 62, normType, score);
      if (score >= 52) return result("C", 52, normType, score);
      if (score >= 42) return result("D", 42, normType, score);
      if (score > 35 && score < 42) return result("E", 35.01, normType, score);
      if (score < 35) return result("F", 0, normType, score);
    }
    return {
      ok: false,
      grade: null,
      status: "unresolved",
      totalMarks: score,
      courseType: normType,
      minThreshold: null,
      isBoundaryAmbiguous: true,
      message: `Marks value ${score} could not be resolved.`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER
    };
  }
  function result(grade, minThreshold, courseType, score) {
    return {
      ok: true,
      grade,
      status: "resolved",
      totalMarks: score,
      courseType,
      minThreshold,
      isBoundaryAmbiguous: false,
      message: `Score ${score} classifies as provisional grade ${grade} (${courseType}).`,
      disclaimer: RELATIVE_GRADING_DISCLAIMER
    };
  }

  // src/calculations/rounding.js
  function roundTo(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  // src/shared/constants.js
  var INJECT_ATTR = "data-mujx";
  var DEFAULT_PREFERENCES = Object.freeze({
    features: {
      attendance: true,
      marks: true,
      sgpa: true,
      cgpaPredictor: true,
      targetCgpa: true,
      timetable: true,
      notifications: true,
      homePanel: true
    },
    attendanceThreshold: 75,
    borderlineBand: 5,
    theme: "auto",
    autoRefreshMinutes: 0,
    showTheoryPracticalSplit: true,
    gradeCap: 10,
    assumedInternalWeights: {
      source: "muj-exam-handbook-2023-24",
      note: "MTE 30 / CWS 30 / ETE 40 except Faculty of Design. Used only when the portal does not expose weights.",
      mte: 30,
      cws: 30,
      ete: 40
    },
    absoluteGradeBoundaries: []
  });
  var MUJ_GRADE_POINTS = Object.freeze({
    "A+": 10,
    A: 9,
    B: 8,
    C: 7,
    D: 6,
    E: 5,
    AP: 0,
    F: 0,
    I: 0,
    DT: 0,
    S: 0,
    U: 0
  });
  var MUJ_NON_EVALUATIVE_GRADES = Object.freeze(["S", "U", "AP"]);
  var CANDIDATE_ENDPOINTS = Object.freeze({
    attendanceSummary: "/Student/Academic/GetAttendanceSummaryList",
    gradesForFaculty: "/Student/Academic/GetGradesForFaculty",
    eventDetail: "/Student/Academic/GetEventDetailStudent",
    calendarEvents: "/Student/Academic/GetStudentCalenderEventList"
  });
  var PAGE_KINDS = Object.freeze({
    login: "login",
    home: "home",
    attendance: "attendance",
    marks: "marks",
    grades: "grades",
    timetable: "timetable",
    other: "other"
  });
  var STORAGE_KEYS = Object.freeze({
    preferences: "mujx.preferences",
    cache: "mujx.cache",
    notifications: "mujx.notifications",
    dismissed: "mujx.dismissed",
    timetableSnapshot: "mujx.timetableSnapshot",
    hubState: "mujx.hubState"
  });

  // src/data/grades-adapter.js
  function parseGradesTable(table) {
    const matrix = tableToMatrix(table);
    const { headers, rows, headerRow, allRows, headerRowIndex } = matrix;
    const map = headerIndexMap(headers);
    const letterIdx = pickIndex(map, ["grade", "letter", "lg"]);
    const creditIdx = pickIndex(map, ["credit", "credits", "cr"]);
    const subjectIdx = pickIndex(map, ["course name", "course", "subject", "paper name", "paper"]);
    const codeIdx = pickIndex(map, ["course code", "code", "subject code"]);
    const sessionIdx = pickIndex(map, ["academic session", "session"]);
    if (letterIdx < 0 || creditIdx < 0) return { records: [], table, available: false };
    const records = [];
    let totalCreditsFromFooter = null;
    for (const cells of rows) {
      if (!cells || !cells.length) continue;
      const firstNonEmpty = cells.find((c) => c && c.trim().length > 0) || "";
      if (firstNonEmpty.toLowerCase().includes("total") || cells.some((c) => c.toLowerCase() === "total")) {
        const nums = cells.map(parseNumber).filter((n) => n !== null);
        if (nums.length) totalCreditsFromFooter = nums[nums.length - 1];
        continue;
      }
      const cr = parseNumber(cells[creditIdx]);
      const rawLetter = cells[letterIdx] ? cells[letterIdx].trim().toUpperCase() : null;
      const subject = (subjectIdx >= 0 ? cells[subjectIdx] : "") || cells[2] || cells[1] || "";
      const courseCode = (codeIdx >= 0 ? cells[codeIdx] : "") || cells[1] || "";
      const session = sessionIdx >= 0 ? cells[sessionIdx] : "";
      if (cr === null && !rawLetter) continue;
      records.push(
        normalizeGradeRow({
          subject,
          courseCode,
          credits: cr,
          letter: rawLetter,
          session,
          source: "dom"
        })
      );
    }
    const detectedSession = records.find((r) => r.session)?.session || records.find((r) => r.semester)?.semester || null;
    return {
      records,
      table,
      source: "dom",
      available: records.length > 0,
      totalCreditsFromFooter,
      headerRow,
      allRows,
      headerRowIndex,
      session: detectedSession
    };
  }

  // src/data/credit-resolver.js
  function inferCourseCredits(courseName = "", courseCode = "", courseType = "theory", isSatisfactory = false) {
    const name = String(courseName || "").toLowerCase();
    const code = String(courseCode || "").toUpperCase();
    if (courseType === "lab" || courseType === "pbl" || isSatisfactory || code === "MEE1007" || name.includes("creativity & innovation") || name.includes("creativity and innovation") || name.includes("pbl") || name.includes("project-based") || name.includes("project based") || code.includes("PBL") || code === "CSE1270" || code === "CSE2170" || code === "CSE2270" || code === "CSE3170" || /\b(lab|laboratory|practical|workshop)\b/i.test(name) || code.endsWith("L") || code.endsWith("P") || /(?:103\d|213\d|313\d|323\d)/.test(code) || /(?:30|31|32|33|34|35|36|37|38|39)$/.test(code)) {
      return 1;
    }
    if (name.includes("technical writing") || code.startsWith("LLC")) {
      return 1;
    }
    if (code === "CSE2201" || // Design and Analysis of Algorithm
    code === "CSE2240" || // Automata and Compiler Design
    code === "MAS1001" || // Calculus & Matrices
    code === "CHY1001" || // Engineering Chemistry
    code === "EEE1002" || // Electrical & Electronics Systems
    code === "PHY1001" || // Engineering Physics
    name.includes("calculus") || name.includes("automata") || name.includes("design and analysis of algorithm")) {
      return 4;
    }
    return 3;
  }
  async function resolveAllCredits(sem = "") {
    const merged = {};
    const userCustom = {};
    const satisfactory = {
      MEE1007: true
    };
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const stored = await new Promise(
          (res) => chrome.storage.local.get(["userCustomCredits", "courseCredits", "satisfactoryCourses", "subjectGrades"], (d) => res(d || {}))
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
    } catch (_) {
    }
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
    } catch (_) {
    }
    try {
      const res = await fetch("/Student/Academic/GetAttendanceSummaryList", {
        method: "POST",
        credentials: "same-origin",
        headers: { "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" },
        body: new URLSearchParams({ StudentCode: "" }).toString()
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
    } catch (_) {
    }
    try {
      const res = await fetch("/Student/Academic/GetGradesForFaculty", {
        method: "POST",
        credentials: "same-origin",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
          "X-Requested-With": "XMLHttpRequest"
        },
        body: new URLSearchParams({ Enrollment: "", Semester: sem || "" }).toString()
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
    } catch (_) {
    }
    Object.assign(merged, userCustom);
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
    } catch (_) {
    }
    merged.__satisfactory = satisfactory;
    merged.__userCustom = userCustom;
    return merged;
  }

  // src/data/marks-adapter.js
  function parseInternalMarksSummaryTable(table) {
    if (!table) return { available: false, courses: [], table: null };
    const matrix = tableToMatrix(table);
    const { headers, rows, headerRow, allRows, headerRowIndex } = matrix;
    const map = headerIndexMap(headers);
    const courseIdx = pickIndex(map, ["course name", "course", "subject", "paper name", "paper"]);
    const codeIdx = pickIndex(map, ["course code", "code", "subject code"]);
    const mte1Idx = pickIndex(map, ["mte1", "mte 1", "mid term 1", "midterm 1"]);
    const mte2Idx = pickIndex(map, ["mte2", "mte 2", "mid term 2", "midterm 2"]);
    let mteIdx = -1;
    if (map["mte"] !== void 0) {
      mteIdx = map["mte"];
    } else if (map["mid term"] !== void 0) {
      mteIdx = map["mid term"];
    } else if (map["midterm"] !== void 0) {
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
    const hasMarksColumns = mte1Idx >= 0 || mteIdx >= 0 || cwsIdx >= 0 || prsIdx >= 0 || totalIdx >= 0;
    if (courseIdx < 0 || !hasMarksColumns) {
      return { available: false, courses: [], table };
    }
    const courses = [];
    const seen = /* @__PURE__ */ new Set();
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
        officialGrade: officialGrade || null
      });
    }
    return {
      available: courses.length > 0,
      table,
      courses,
      headerRow,
      allRows,
      headerRowIndex
    };
  }

  // src/calculations/grade-points.js
  var MUJ_GRADE_POINT_MAP = Object.freeze({
    "A+": 10,
    A: 9,
    B: 8,
    C: 7,
    D: 6,
    E: 5,
    F: 0,
    I: 0,
    DT: 0,
    S: null,
    U: null,
    AP: null,
    W: null
  });
  var NON_EVALUATIVE_GRADES = Object.freeze(["S", "U", "AP", "W"]);
  function normalizeGrade(grade) {
    if (grade === null || grade === void 0) return "";
    return String(grade).trim().toUpperCase();
  }
  function getGradePoint(grade, customMap = MUJ_GRADE_POINT_MAP) {
    const key = normalizeGrade(grade);
    if (!key) return void 0;
    if (Object.prototype.hasOwnProperty.call(customMap, key)) {
      return customMap[key];
    }
    return void 0;
  }
  function isNonEvaluativeGrade(grade) {
    const key = normalizeGrade(grade);
    return NON_EVALUATIVE_GRADES.includes(key);
  }
  function isSatisfactorySubject(course = {}, satisfactoryMap = {}) {
    const code = String(course.courseCode || course.code || course.id || "").trim().toUpperCase();
    const name = String(course.courseName || course.name || course.subject || "").trim().toUpperCase();
    const officialGrade = String(course.officialGrade || course.grade || course.letter || "").trim().toUpperCase();
    if (officialGrade === "S" || officialGrade === "U" || officialGrade === "AP") {
      return true;
    }
    if (satisfactoryMap) {
      if (code && satisfactoryMap[code]) return true;
      if (name && satisfactoryMap[name]) return true;
    }
    if (code === "MEE1007" || name.includes("CREATIVITY & INNOVATION") || name.includes("CREATIVITY AND INNOVATION")) {
      return true;
    }
    return false;
  }

  // src/calculations/sgpa.js
  function calculateSGPA(rawCourses = [], optionsOrMap = {}) {
    const options = optionsOrMap && typeof optionsOrMap === "object" && !optionsOrMap.gradePointMap && optionsOrMap["A"] !== void 0 ? { gradePointMap: optionsOrMap } : optionsOrMap || {};
    const gradePointMap = options.gradePointMap || MUJ_GRADE_POINT_MAP;
    const expectedTotalCredits = options.expectedTotalCredits ?? null;
    const detectedSemester = options.semester || null;
    const warnings = [];
    const warningDetails = [];
    const processedCourses = [];
    const seenCourseKeys = /* @__PURE__ */ new Set();
    let totalCredits = 0;
    let gradedCredits = 0;
    let totalWeightedPoints = 0;
    let hasIncompleteData = false;
    for (const raw of rawCourses) {
      if (!raw) continue;
      const courseCode = String(raw.courseCode || raw.CourseCode || raw.code || "").trim();
      const courseName = String(raw.courseName || raw.CourseName || raw.subject || raw.paper || "").trim();
      const rawCredits = raw.credits !== void 0 ? raw.credits : raw.Credits;
      const rawGrade = raw.grade ?? raw.letter ?? raw.Grade ?? raw.OfficialGrade ?? null;
      const session = String(raw.session || raw.academicSession || raw.AcademicSession || raw.semester || "").trim();
      const dedupeKey = `${courseCode.toUpperCase() || courseName.toUpperCase()}::${session.toUpperCase()}`;
      if (courseCode && seenCourseKeys.has(dedupeKey)) {
        continue;
      }
      if (courseCode) {
        seenCourseKeys.add(dedupeKey);
      }
      const isCreditValid = rawCredits !== null && rawCredits !== void 0 && String(rawCredits).trim() !== "" && Number.isFinite(Number(rawCredits)) && Number(rawCredits) >= 0;
      const credit = isCreditValid ? Number(rawCredits) : null;
      if (!isCreditValid) {
        hasIncompleteData = true;
        if (!warnings.includes("invalid_credits")) warnings.push("invalid_credits");
        warningDetails.push({
          code: "invalid_credits",
          courseCode,
          message: `Course ${courseCode || courseName || "Unknown"} has invalid credits (${rawCredits}).`
        });
        processedCourses.push({
          courseCode,
          courseName,
          credits: null,
          rawCredits,
          grade: rawGrade,
          gradePoints: null,
          weightedPoints: 0,
          excludedFromGpa: true,
          status: "invalid_credits",
          session
        });
        continue;
      }
      totalCredits += credit;
      if (rawGrade === null || rawGrade === void 0 || String(rawGrade).trim() === "") {
        hasIncompleteData = true;
        if (!warnings.includes("missing_grade")) warnings.push("missing_grade");
        warningDetails.push({
          code: "missing_grade",
          courseCode,
          message: `Course ${courseCode || courseName || "Unknown"} is missing a letter grade.`
        });
        processedCourses.push({
          courseCode,
          courseName,
          credits: credit,
          rawCredits,
          grade: null,
          gradePoints: null,
          weightedPoints: 0,
          excludedFromGpa: true,
          status: "missing_grade",
          session
        });
        continue;
      }
      const normGrade = normalizeGrade(rawGrade);
      const isNonEval = raw.excludeFromGpa || isNonEvaluativeGrade(normGrade);
      if (isNonEval) {
        processedCourses.push({
          courseCode,
          courseName,
          credits: credit,
          rawCredits,
          grade: normGrade,
          gradePoints: null,
          weightedPoints: 0,
          excludedFromGpa: true,
          isSatisfactory: normGrade === "S",
          status: "non_evaluative",
          session
        });
        continue;
      }
      const gradePoint = getGradePoint(normGrade, gradePointMap);
      if (gradePoint === void 0) {
        hasIncompleteData = true;
        if (!warnings.includes("unknown_grade")) warnings.push("unknown_grade");
        warningDetails.push({
          code: "unknown_grade",
          courseCode,
          grade: normGrade,
          message: `Course ${courseCode || courseName || "Unknown"} has unsupported grade '${normGrade}'.`
        });
        processedCourses.push({
          courseCode,
          courseName,
          credits: credit,
          rawCredits,
          grade: normGrade,
          gradePoints: null,
          weightedPoints: 0,
          excludedFromGpa: false,
          status: "unknown_grade",
          session
        });
        continue;
      }
      const courseWeightedPoints = credit * gradePoint;
      gradedCredits += credit;
      totalWeightedPoints += courseWeightedPoints;
      processedCourses.push({
        courseCode,
        courseName,
        credits: credit,
        rawCredits,
        grade: normGrade,
        gradePoints: gradePoint,
        weightedPoints: courseWeightedPoints,
        excludedFromGpa: false,
        status: "valid",
        session
      });
    }
    if (expectedTotalCredits !== null && Number.isFinite(expectedTotalCredits)) {
      if (Math.abs(totalCredits - expectedTotalCredits) > 0.01) {
        warnings.push("credit_mismatch");
        warningDetails.push({
          code: "credit_mismatch",
          message: `Calculated credits (${roundTo(totalCredits, 2)}) do not match table footer total (${expectedTotalCredits}).`
        });
      }
    }
    let status = "complete";
    if (processedCourses.length === 0 || totalCredits === 0 || gradedCredits === 0) {
      status = "incomplete";
      if (processedCourses.length === 0 && !warnings.includes("empty_courses")) warnings.push("empty_courses");
      if (gradedCredits === 0 && !warnings.includes("zero_credits")) warnings.push("zero_credits");
    } else if (hasIncompleteData) {
      status = "incomplete";
    }
    const rawSgpa = gradedCredits > 0 ? totalWeightedPoints / gradedCredits : null;
    const roundedSgpa = rawSgpa !== null ? roundTo(rawSgpa, 2) : null;
    const formula = "SGPA = \u03A3(Ci \xD7 Gi) / \u03A3Ci";
    const substitutedFormula = gradedCredits > 0 ? `SGPA = ${roundTo(totalWeightedPoints, 4)} / ${gradedCredits} = ${roundedSgpa}` : "SGPA = N/A (0 graded credits)";
    return {
      ok: status === "complete" && roundedSgpa !== null,
      sgpa: roundedSgpa,
      rawSgpa,
      totalCredits: roundTo(totalCredits, 2),
      gradedCredits: roundTo(gradedCredits, 2),
      totalWeightedPoints: roundTo(totalWeightedPoints, 4),
      courses: processedCourses,
      includedCourses: processedCourses,
      evaluatedCount: processedCourses.filter((c) => c.status === "valid").length,
      totalCount: processedCourses.length,
      status,
      warnings,
      warningDetails,
      issues: warnings,
      // backwards compatibility
      semester: detectedSemester,
      formula,
      substitutedFormula
    };
  }

  // src/calculations/ete-required.js
  var THEORY_TARGET_MIN_MARKS = Object.freeze({
    "A+": 82,
    A: 72,
    B: 62,
    C: 52,
    D: 42,
    E: 35.01,
    F: 0
  });
  var DEFAULT_ETE_MAX = 40;
  function calculateRequiredEte({
    targetGrade,
    mte,
    cws = null,
    cwsEstimate = null,
    eteMax = DEFAULT_ETE_MAX,
    courseType = "theory"
  }) {
    const normType = String(courseType || "theory").toLowerCase();
    if (normType !== "theory") {
      return {
        ok: false,
        eligible: false,
        targetGrade,
        targetThreshold: null,
        mte: null,
        cws: null,
        cwsEstimated: false,
        cwsPending: false,
        internalSubtotal: 0,
        requiredETE: null,
        unclampedRequired: null,
        eteMax,
        feasibility: "ineligible",
        percentOfEte: null,
        message: `Course type is '${normType}'. The ETE Target Calculator is enabled exclusively for theory courses (labs and PBL are excluded).`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const normGrade = String(targetGrade || "").trim().toUpperCase();
    if (!(normGrade in THEORY_TARGET_MIN_MARKS)) {
      return {
        ok: false,
        eligible: true,
        targetGrade,
        targetThreshold: null,
        mte: null,
        cws: null,
        cwsEstimated: false,
        cwsPending: false,
        internalSubtotal: 0,
        requiredETE: null,
        unclampedRequired: null,
        eteMax,
        feasibility: "undefined_target",
        percentOfEte: null,
        message: `Unknown target grade '${targetGrade}'. Supported theory target grades: A+, A, B, C, D, E.`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const targetThreshold = THEORY_TARGET_MIN_MARKS[normGrade];
    const mteNum = Number(mte);
    if (!Number.isFinite(mteNum) || mteNum < 0) {
      return {
        ok: false,
        eligible: true,
        targetGrade: normGrade,
        targetThreshold,
        mte: null,
        cws: null,
        cwsEstimated: false,
        cwsPending: false,
        internalSubtotal: 0,
        requiredETE: null,
        unclampedRequired: null,
        eteMax,
        feasibility: "invalid_input",
        percentOfEte: null,
        message: `MTE marks (${mte}) are invalid or missing.`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const isCwsVerified = cws !== null && cws !== void 0 && Number.isFinite(Number(cws)) && Number(cws) >= 0;
    const isCwsEstimated = !isCwsVerified && cwsEstimate !== null && Number.isFinite(Number(cwsEstimate)) && Number(cwsEstimate) >= 0;
    const cwsPending = !isCwsVerified && !isCwsEstimated;
    const effectiveCws = isCwsVerified ? Number(cws) : isCwsEstimated ? Number(cwsEstimate) : 0;
    const internalSubtotal = roundTo(mteNum + effectiveCws, 2);
    if (cwsPending) {
      const requiredWithoutCws = targetThreshold - mteNum;
      return {
        ok: true,
        eligible: true,
        targetGrade: normGrade,
        targetThreshold,
        mte: mteNum,
        cws: null,
        cwsEstimated: false,
        cwsPending: true,
        internalSubtotal: mteNum,
        requiredETE: null,
        unclampedRequired: roundTo(requiredWithoutCws, 2),
        eteMax,
        feasibility: "cws_pending",
        percentOfEte: null,
        message: `CWS marks are pending. Need ${roundTo(requiredWithoutCws, 2)} total marks across (CWS + ETE) to achieve grade ${normGrade}. Enter a CWS estimate to calculate the ETE requirement.`,
        disclaimer: RELATIVE_GRADING_DISCLAIMER
      };
    }
    const unclampedRequired = targetThreshold - internalSubtotal;
    let feasibility = "achievable";
    let displayedRequired = 0;
    let percentOfEte = 0;
    if (unclampedRequired <= 0) {
      feasibility = "already_secured";
      displayedRequired = 0;
      percentOfEte = 0;
    } else if (unclampedRequired > eteMax) {
      feasibility = "impossible";
      displayedRequired = roundTo(unclampedRequired, 2);
      percentOfEte = roundTo(displayedRequired / eteMax * 100, 1);
    } else {
      feasibility = "achievable";
      displayedRequired = roundTo(unclampedRequired, 2);
      percentOfEte = roundTo(displayedRequired / eteMax * 100, 1);
    }
    return {
      ok: true,
      eligible: true,
      targetGrade: normGrade,
      targetThreshold,
      mte: mteNum,
      cws: isCwsVerified ? effectiveCws : null,
      cwsEstimated: isCwsEstimated,
      cwsPending: false,
      internalSubtotal,
      requiredETE: displayedRequired,
      unclampedRequired: roundTo(unclampedRequired, 2),
      eteMax,
      feasibility,
      percentOfEte,
      message: formatMessage(feasibility, displayedRequired, eteMax, normGrade, internalSubtotal, isCwsEstimated),
      disclaimer: RELATIVE_GRADING_DISCLAIMER
    };
  }
  function formatMessage(feasibility, req, max, grade, subtotal, estimated) {
    const estNote = estimated ? " (based on estimated CWS)" : "";
    if (feasibility === "already_secured") {
      return `Grade ${grade} is already secured with current internal marks of ${subtotal}${estNote}! Required ETE: 0/${max}.`;
    }
    if (feasibility === "impossible") {
      return `Grade ${grade} requires ${req}/${max} marks in ETE${estNote}, which exceeds the maximum possible score (${max}).`;
    }
    return `Target ${grade} requires ${req}/${max} marks in ETE (${Math.round(req / max * 100)}%)${estNote}.`;
  }

  // src/ui/components/marks/ete-target-control.js
  var activePopover = null;
  function openEteTargetPopover({ anchorEl, course, defaultTarget = "A" }) {
    closeActiveEtePopover();
    let currentTarget = defaultTarget;
    let customCwsEstimate = null;
    const popover = document.createElement("div");
    popover.className = "mujx-ete-popover";
    popover.setAttribute(INJECT_ATTR, "ete-popover");
    popover.setAttribute("role", "dialog");
    popover.setAttribute("aria-label", "End Term Exam Target Calculator");
    document.body.appendChild(popover);
    activePopover = popover;
    function render() {
      const calc = calculateRequiredEte({
        targetGrade: currentTarget,
        mte: course.mte,
        cws: course.cws,
        cwsEstimate: customCwsEstimate,
        eteMax: 40,
        courseType: course.courseType || "theory"
      });
      const statusBadgeClass = calc.feasibility === "achievable" ? "safe" : calc.feasibility === "already_secured" ? "safe" : calc.feasibility === "impossible" ? "danger" : "warning";
      const statusLabel = calc.feasibility === "achievable" ? "\u2713 Achievable" : calc.feasibility === "already_secured" ? "\u2605 Target Secured" : calc.feasibility === "impossible" ? "\u2715 Exceeds ETE Max" : calc.feasibility === "cws_pending" ? "\u2139 CWS Pending" : "Unresolved";
      popover.innerHTML = `
      <div class="mujx-popover-header" style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px; border-bottom:1px solid rgba(125,125,125,0.25); padding-bottom:8px;">
        <div>
          <div style="font-size:10px; text-transform:uppercase; font-weight:700; color:var(--mujx-accent, #2dd4bf); letter-spacing:0.04em;">
            ETE Target Calculator
          </div>
          <div style="font-weight:700; font-size:13px; color:#ffffff; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(course.courseName)}">
            ${escapeHtml(course.courseName)}
          </div>
        </div>
        <button type="button" data-role="close-popover" style="background:none; border:none; color:#94a3b8; cursor:pointer; font-size:14px; padding:2px 6px;">\u2715</button>
      </div>

      <!-- Target Grade Selection Buttons -->
      <div style="margin-bottom:12px;">
        <div style="font-size:11px; opacity:0.8; margin-bottom:5px; font-weight:600;">Select Target Grade:</div>
        <div style="display:flex; gap:5px; flex-wrap:wrap;">
          ${["A+", "A", "B", "C", "D", "E"].map(
        (g) => `
                <button type="button" class="mujx-target-chip ${g === currentTarget ? "active" : ""}" data-grade="${g}" style="padding:4px 10px; font-size:11px; font-weight:700; border-radius:5px; cursor:pointer; border:1px solid ${g === currentTarget ? "var(--mujx-accent, #2dd4bf)" : "rgba(125,125,125,0.3)"}; background:${g === currentTarget ? "rgba(45,212,191,0.22)" : "rgba(255,255,255,0.06)"}; color:${g === currentTarget ? "var(--mujx-accent, #2dd4bf)" : "#e2e8f0"};">
                  ${g}
                </button>
              `
      ).join("")}
        </div>
      </div>

      <!-- Internal Marks Breakdown -->
      <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(125,125,125,0.2); border-radius:6px; padding:8px 10px; margin-bottom:10px; font-size:11.5px; display:flex; flex-direction:column; gap:4px;">
        <div style="display:flex; justify-content:space-between;">
          <span style="opacity:0.75;">Mid Term (MTE):</span>
          <strong>${course.mte !== null ? `${course.mte} / 30` : "Not graded"}</strong>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <span style="opacity:0.75;">Sessionals (CWS):</span>
          <span>
            ${course.cws !== null ? `<strong>${course.cws} / 30</strong>` : `<span style="color:#f59e0b; font-size:11px;">Pending</span>`}
          </span>
        </div>
        ${course.cws === null ? `
              <div style="margin-top:4px; padding-top:4px; border-top:1px dashed rgba(125,125,125,0.2); display:flex; justify-content:space-between; align-items:center;">
                <span style="font-size:11px; opacity:0.8;">CWS Estimate:</span>
                <input type="number" min="0" max="30" placeholder="e.g. 24" value="${customCwsEstimate !== null ? customCwsEstimate : ""}" data-role="cws-estimate-input" style="width:65px; padding:2px 5px; font-size:11px; border-radius:4px; background:rgba(0,0,0,0.4); border:1px solid #0d9488; color:#fff;" />
              </div>
            ` : ""}
        <div style="display:flex; justify-content:space-between; margin-top:2px; border-top:1px solid rgba(125,125,125,0.2); padding-top:4px;">
          <span>Internal Subtotal:</span>
          <strong style="color:var(--mujx-accent, #2dd4bf);">${calc.internalSubtotal}</strong>
        </div>
      </div>

      <!-- Result Card -->
      <div style="background:${calc.feasibility === "impossible" ? "rgba(244,63,94,0.12)" : "rgba(13,148,136,0.14)"}; border:1px solid ${calc.feasibility === "impossible" ? "rgba(244,63,94,0.35)" : "rgba(13,148,136,0.35)"}; border-radius:8px; padding:10px 12px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <span style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em;">Required in ETE</span>
          <span class="mujx-chip ${statusBadgeClass}" style="font-size:10.5px; padding:2px 6px;">${statusLabel}</span>
        </div>

        <div style="display:flex; align-items:baseline; gap:8px;">
          <span style="font-size:24px; font-weight:800; color:${calc.feasibility === "impossible" ? "#f43f5e" : "#2dd4bf"};">
            ${calc.requiredETE !== null ? calc.requiredETE : "\u2014"}
          </span>
          <span style="font-size:13px; opacity:0.75;">/ ${calc.eteMax} marks</span>
          ${calc.percentOfEte !== null ? `<span style="font-size:11.5px; opacity:0.8;">(${calc.percentOfEte}%)</span>` : ""}
        </div>

        <div style="font-size:11px; opacity:0.85; margin-top:6px; line-height:1.35;">
          ${escapeHtml(calc.message)}
        </div>
      </div>

      <!-- Disclaimer Footer -->
      <div style="font-size:10px; opacity:0.65; line-height:1.3; border-top:1px dashed rgba(125,125,125,0.25); padding-top:6px;">
        Assumes standard additive structure (MTE 30 + CWS 30 + ETE 40). Target thresholds are based on specified provisional boundaries. Official relative grading cohort cutoffs may vary.
      </div>
    `;
      popover.querySelectorAll("[data-grade]").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          e.preventDefault();
          currentTarget = btn.dataset.grade;
          render();
        });
      });
      popover.querySelector("[data-role=close-popover]")?.addEventListener("click", (e) => {
        e.stopPropagation();
        e.preventDefault();
        closeActiveEtePopover();
      });
      const cwsInput = popover.querySelector("[data-role=cws-estimate-input]");
      cwsInput?.addEventListener("input", (e) => {
        e.stopPropagation();
        const val = Number(e.target.value);
        customCwsEstimate = Number.isFinite(val) && val >= 0 ? val : null;
        render();
      });
    }
    popover.addEventListener("click", (e) => e.stopPropagation());
    popover.addEventListener("mousedown", (e) => e.stopPropagation());
    render();
    positionPopover(popover, anchorEl, course);
    const onKeydown = (e) => {
      if (e.key === "Escape") closeActiveEtePopover();
    };
    const onPointerDown = (e) => {
      if (!popover.contains(e.target) && !anchorEl.contains(e.target)) {
        closeActiveEtePopover();
      }
    };
    window.addEventListener("keydown", onKeydown);
    setTimeout(() => window.addEventListener("pointerdown", onPointerDown), 10);
    popover._cleanupListeners = () => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }
  function closeActiveEtePopover() {
    if (activePopover) {
      activePopover._cleanupListeners?.();
      activePopover.remove();
      activePopover = null;
    }
  }
  function positionPopover(popover, anchorEl, course) {
    if (popover.dataset.positioned === "true" && popover.style.left && popover.style.top) {
      return;
    }
    const targetAnchor = anchorEl && anchorEl.isConnected ? anchorEl : (course?.id ? document.querySelector(`[data-course-id="${course.id}"]`) : null) || anchorEl;
    if (!targetAnchor) return;
    const rect = targetAnchor.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0 && rect.top === 0 && rect.left === 0) {
      return;
    }
    const popoverWidth = 330;
    const scrollX = window.scrollX || window.pageXOffset || 0;
    const scrollY = window.scrollY || window.pageYOffset || 0;
    let left = rect.right + scrollX - popoverWidth;
    if (left < scrollX + 12) {
      left = scrollX + 12;
    }
    const maxLeft = scrollX + window.innerWidth - popoverWidth - 16;
    if (left > maxLeft) {
      left = maxLeft;
    }
    let top = rect.bottom + scrollY + 6;
    const popoverHeight = popover.offsetHeight || 370;
    if (rect.bottom + popoverHeight + 12 > window.innerHeight && rect.top - popoverHeight - 6 > 0) {
      top = rect.top + scrollY - popoverHeight - 6;
    }
    popover.style.position = "absolute";
    popover.style.left = `${Math.round(left)}px`;
    popover.style.top = `${Math.round(top)}px`;
    popover.style.width = `${popoverWidth}px`;
    popover.style.zIndex = "99999";
    popover.style.background = "#181b20";
    popover.style.color = "#f1f5f9";
    popover.style.border = "1px solid rgba(13, 148, 136, 0.4)";
    popover.style.borderRadius = "10px";
    popover.style.padding = "14px";
    popover.style.boxShadow = "0 10px 25px -5px rgba(0, 0, 0, 0.6), 0 8px 10px -6px rgba(0, 0, 0, 0.6)";
    popover.style.boxSizing = "border-box";
    popover.dataset.positioned = "true";
  }

  // src/ui/components/marks/prediction-panel.js
  function enhanceInternalMarksPage({ table, courses, headerRow, allRows, headerRowIndex, satisfactoryMap = {}, initialEteEstimates = {} }) {
    if (!table || !courses || !courses.length) return () => {
    };
    const courseEteEstimates = {};
    courses.forEach((c) => {
      const codeKey = (c.courseCode || "").toUpperCase();
      const idKey = (c.id || "").toUpperCase();
      const nameKey = (c.courseName || "").toUpperCase();
      const savedVal = initialEteEstimates[codeKey] ?? initialEteEstimates[idKey] ?? initialEteEstimates[nameKey] ?? initialEteEstimates[c.id];
      if (savedVal !== void 0 && savedVal !== null && !isNaN(Number(savedVal))) {
        courseEteEstimates[c.id] = Number(savedVal);
      } else {
        courseEteEstimates[c.id] = c.courseType === "theory" ? 28 : 25;
      }
    });
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        chrome.storage.local.get(["userCustomEteEstimates"], (res) => {
          const stored = res?.userCustomEteEstimates;
          if (stored && typeof stored === "object") {
            let hasDiff = false;
            courses.forEach((c) => {
              const codeKey = (c.courseCode || "").toUpperCase();
              const idKey = (c.id || "").toUpperCase();
              const nameKey = (c.courseName || "").toUpperCase();
              const val = stored[codeKey] ?? stored[idKey] ?? stored[nameKey] ?? stored[c.id];
              if (val !== void 0 && val !== null && !isNaN(Number(val))) {
                const num = Number(val);
                if (courseEteEstimates[c.id] !== num) {
                  courseEteEstimates[c.id] = num;
                  hasDiff = true;
                }
              }
            });
            if (hasDiff) {
              render();
            }
          }
        });
      }
    } catch (_) {
    }
    const theadRows = table.querySelectorAll("thead tr");
    const actualHeaderRow = headerRow || (theadRows.length ? theadRows[theadRows.length - 1] : table.rows[0]);
    if (!actualHeaderRow) return () => {
    };
    const rowsPool = allRows && allRows.length ? allRows.slice((headerRowIndex ?? 0) + 1) : table.tBodies.length ? [...table.tBodies].flatMap((body) => [...body.rows]) : [...table.rows].slice(1);
    const courseRows = [];
    for (const row of rowsPool) {
      if (row === actualHeaderRow) continue;
      const text = (row.textContent || "").toLowerCase();
      if (text.includes("total")) continue;
      if (row.cells && row.cells.length >= 3) {
        courseRows.push(row);
      }
    }
    document.querySelectorAll(`[${INJECT_ATTR}="marks-banner"]`).forEach((b) => b.remove());
    const banner = document.createElement("div");
    banner.className = "mujx-marks-banner";
    banner.setAttribute(INJECT_ATTR, "marks-banner");
    const insertTarget = table.closest(".table-responsive, .table-scrollable") || table;
    insertTarget.parentNode?.insertBefore(banner, insertTarget);
    const isTh = Boolean(actualHeaderRow.querySelector("th"));
    const hasNativeCreditCol = Array.from(actualHeaderRow.cells).some(
      (c) => c.textContent.trim().toLowerCase().includes("credit") && !c.hasAttribute(INJECT_ATTR)
    );
    let thCredit = null;
    if (!hasNativeCreditCol) {
      thCredit = document.createElement(isTh ? "th" : "td");
      thCredit.textContent = "Credits";
      thCredit.setAttribute(INJECT_ATTR, "marks-credit-col");
      thCredit.title = "Course credits (used for credit-weighted SGPA calculation)";
      thCredit.style.fontWeight = "700";
      thCredit.style.textAlign = "center";
      actualHeaderRow.append(thCredit);
    }
    const thPred = document.createElement(isTh ? "th" : "td");
    thPred.textContent = "Predicted Grade";
    thPred.setAttribute(INJECT_ATTR, "marks-pred-col");
    thPred.title = "Provisional grade based on internal marks + estimated ETE";
    thPred.style.fontWeight = "700";
    thPred.style.textAlign = "center";
    actualHeaderRow.append(thPred);
    const thTarget = document.createElement(isTh ? "th" : "td");
    thTarget.textContent = "ETE Calculator";
    thTarget.setAttribute(INJECT_ATTR, "marks-target-col");
    thTarget.title = "Calculate required ETE score for target grade";
    thTarget.style.fontWeight = "700";
    thTarget.style.textAlign = "center";
    actualHeaderRow.append(thTarget);
    const rowInjections = [];
    courseRows.forEach((row, i) => {
      if (i >= courses.length) return;
      const course = courses[i];
      let tdCredit = null;
      if (!hasNativeCreditCol) {
        tdCredit = document.createElement("td");
        tdCredit.setAttribute(INJECT_ATTR, "marks-credit-col");
        tdCredit.style.textAlign = "center";
        row.append(tdCredit);
      }
      const tdPred = document.createElement("td");
      tdPred.setAttribute(INJECT_ATTR, "marks-pred-col");
      tdPred.style.textAlign = "center";
      tdPred.style.fontWeight = "600";
      row.append(tdPred);
      const tdTarget = document.createElement("td");
      tdTarget.setAttribute(INJECT_ATTR, "marks-target-col");
      tdTarget.style.textAlign = "center";
      row.append(tdTarget);
      rowInjections.push({ row, index: i, course, tdPred, tdTarget, tdCredit });
    });
    function render() {
      const predictedCourseList = courses.map((course) => {
        const isSatisfactory = isSatisfactorySubject(course, satisfactoryMap);
        if (isSatisfactory) {
          const totalMarks = course.internalSubtotal !== null && course.internalSubtotal !== void 0 ? course.internalSubtotal : course.declaredTotal ?? course.prs ?? 0;
          const isPass = totalMarks >= 35;
          const provGrade = isPass ? "S" : "U";
          return {
            ...course,
            isSatisfactory: true,
            estimatedEte: 0,
            projectedTotal: totalMarks,
            provisionalGrade: provGrade,
            provisionalStatus: isPass ? "pass" : "fail",
            grade: provGrade,
            letter: provGrade,
            excludeFromGpa: true
          };
        }
        const estimatedEte = courseEteEstimates[course.id] ?? (course.courseType === "theory" ? 28 : 25);
        const projectedTotal = course.internalSubtotal + estimatedEte;
        const provisional = classifyProvisionalGrade(projectedTotal, course.courseType);
        return {
          ...course,
          isSatisfactory: false,
          estimatedEte,
          projectedTotal,
          provisionalGrade: provisional.grade,
          provisionalStatus: provisional.status,
          grade: provisional.grade,
          letter: provisional.grade
        };
      });
      const sgpaResult = calculateSGPA(predictedCourseList);
      const sgpaText = sgpaResult.ok && sgpaResult.sgpa !== null ? sgpaResult.sgpa.toFixed(2) : "\u2014";
      banner.innerHTML = `
      <!-- Prominent Relative-Grading Disclaimer -->
      <div class="mujx-disclaimer-card" style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.35); border-radius:8px; padding:10px 14px; margin-bottom:12px; font-size:11.5px; line-height:1.45; color:#fde68a;">
        <div style="font-weight:700; display:flex; align-items:center; gap:6px; color:#f59e0b; margin-bottom:3px; font-size:12px;">
          <span>\u26A0\uFE0F</span>
          <span>Important: SGPA and Grade Prediction Is Only an Estimate</span>
        </div>
        <div>
          MUJ follows a <strong>relative grading system</strong>. These predictions use the configured marks thresholds and available internal assessment data, so your final grades and SGPA may differ from the university's officially declared results. Do not treat the predicted SGPA as your final SGPA.
        </div>
      </div>

      <!-- Main Prediction Strip -->
      <div class="mujx-grade-banner-main" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
        <div class="mujx-grade-sgpa-pill" style="background:#1e1e2d; border:1px solid #2d2d3f; border-radius:8px; padding:8px 16px; box-shadow:0 1px 3px rgba(0,0,0,0.35); display:flex; flex-direction:column; align-items:flex-start;">
          <span class="mujx-grade-sgpa-label" style="font-size:10px; font-weight:600; color:#94a3b8; letter-spacing:0.05em; text-transform:uppercase;">PREDICTED SGPA (FORECAST)</span>
          <span class="mujx-grade-sgpa-value" style="font-size:24px; font-weight:800; color:#f1f5f9; line-height:1.15;">${sgpaText}</span>
        </div>

        <div class="mujx-grade-stats" style="display:flex; gap:16px; flex-wrap:wrap;">
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.totalCredits}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Total Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.evaluatedCount} / ${courses.length}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Predicted Courses</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num" style="color:#f1f5f9; font-size:17px; font-weight:700;">${sgpaResult.totalWeightedPoints}</span>
            <span class="mujx-stat-lbl" style="color:#94a3b8; font-size:11px;">Total Points (\u03A3 Ci\xD7Gi)</span>
          </div>
        </div>

      </div>
    `;
      rowInjections.forEach(({ course, tdPred, tdTarget, tdCredit }) => {
        const predCourse = predictedCourseList.find((p) => p.id === course.id);
        const estEte = courseEteEstimates[course.id];
        const provGrade = predCourse?.provisionalGrade || "\u2014";
        const totalScore = predCourse?.projectedTotal;
        if (tdCredit) {
          const isSat = Boolean(predCourse?.isSatisfactory);
          const defaultCr = course.courseType === "lab" || course.courseType === "pbl" || isSat ? 1 : 3;
          const crVal = course.credits ?? defaultCr;
          const existingSelect = tdCredit.querySelector("select");
          if (existingSelect) {
            if (document.activeElement !== existingSelect && Number(existingSelect.value) !== crVal) {
              existingSelect.value = String(crVal);
            }
          } else {
            tdCredit.innerHTML = `
            <select class="mujx-credit-dropdown" style="padding:2px 5px; font-size:11px; border-radius:4px; background:rgba(0,0,0,0.3); border:1px solid rgba(13,148,136,0.4); color:inherit; font-weight:700; cursor:pointer;" title="Adjust course credits">
              <option value="1" ${crVal === 1 ? "selected" : ""}>1</option>
              <option value="2" ${crVal === 2 ? "selected" : ""}>2</option>
              <option value="3" ${crVal === 3 ? "selected" : ""}>3</option>
              <option value="4" ${crVal === 4 ? "selected" : ""}>4</option>
              <option value="0" ${crVal === 0 ? "selected" : ""}>0</option>
            </select>
          `;
            tdCredit.querySelector("select")?.addEventListener("change", (e) => {
              const newCr = Number(e.target.value);
              course.credits = newCr;
              try {
                if (typeof chrome !== "undefined" && chrome.storage?.local) {
                  const codeKey = (course.courseCode || "").toUpperCase();
                  const idKey = (course.id || "").toUpperCase();
                  const nameKey = (course.courseName || "").toUpperCase();
                  chrome.storage.local.get(["userCustomCredits", "courseCredits"], (res) => {
                    const userCreds = res?.userCustomCredits || {};
                    const courseCreds = res?.courseCredits || {};
                    if (codeKey) {
                      userCreds[codeKey] = newCr;
                      courseCreds[codeKey] = newCr;
                    }
                    if (idKey) {
                      userCreds[idKey] = newCr;
                      courseCreds[idKey] = newCr;
                    }
                    if (nameKey) {
                      userCreds[nameKey] = newCr;
                      courseCreds[nameKey] = newCr;
                    }
                    chrome.storage.local.set({
                      userCustomCredits: userCreds,
                      courseCredits: courseCreds
                    });
                  });
                }
              } catch (_) {
              }
              render();
            });
          }
        }
        if (predCourse?.isSatisfactory) {
          const isPass = (predCourse?.projectedTotal ?? 0) >= 35;
          const sGrade = isPass ? "S" : "U";
          const sColor = isPass ? "#10b981" : "#ef4444";
          tdPred.innerHTML = `
          <div style="display:flex; justify-content:center; align-items:center;">
            <span style="font-size:14px; font-weight:800; color:${sColor};">${sGrade}</span>
          </div>
        `;
        } else {
          const existingInput = tdPred.querySelector(`[data-course-ete="${course.id}"]`);
          const gradeSpan = tdPred.querySelector(`[data-role="prov-grade"]`);
          const scoreSpan = tdPred.querySelector(`[data-role="total-score"]`);
          if (existingInput && gradeSpan && scoreSpan) {
            gradeSpan.textContent = provGrade;
            scoreSpan.textContent = `(${totalScore}/100)`;
            if (document.activeElement !== existingInput && existingInput.value !== String(estEte)) {
              existingInput.value = estEte !== void 0 && estEte !== null ? String(estEte) : "";
            }
          } else {
            tdPred.innerHTML = `
            <div style="display:flex; flex-direction:column; align-items:center; gap:2px;">
              <div style="display:inline-flex; align-items:center; gap:4px;">
                <span data-role="prov-grade" style="font-size:13px; font-weight:800; color:var(--mujx-accent, #2dd4bf);">${provGrade}</span>
                <span data-role="total-score" style="font-size:10px; opacity:0.7;">(${totalScore}/100)</span>
              </div>
              <div style="font-size:10.5px; opacity:0.7; display:flex; align-items:center; gap:2px;">
                <span>ETE:</span>
                <input type="number" min="0" max="40" value="${estEte}" data-course-ete="${course.id}" data-mujx="course-ete-input" style="width:38px; padding:1px 3px; font-size:10px; border-radius:3px; background:rgba(0,0,0,0.3); border:1px solid rgba(13,148,136,0.5); color:#fff; text-align:center;" />
              </div>
            </div>
          `;
            const rowEteInput = tdPred.querySelector(`[data-course-ete="${course.id}"]`);
            let eteSaveTimer = null;
            const saveScoreToStorage = (val, immediate = false) => {
              try {
                if (typeof chrome !== "undefined" && chrome.storage?.local) {
                  const codeKey = (course.courseCode || "").toUpperCase();
                  const idKey = (course.id || "").toUpperCase();
                  const nameKey = (course.courseName || "").toUpperCase();
                  if (initialEteEstimates) {
                    if (codeKey) initialEteEstimates[codeKey] = val;
                    if (idKey) initialEteEstimates[idKey] = val;
                    if (nameKey) initialEteEstimates[nameKey] = val;
                    initialEteEstimates[course.id] = val;
                  }
                  const commit = () => {
                    chrome.storage.local.get(["userCustomEteEstimates"], (res) => {
                      const userEte = res?.userCustomEteEstimates || {};
                      if (codeKey) userEte[codeKey] = val;
                      if (idKey) userEte[idKey] = val;
                      if (nameKey) userEte[nameKey] = val;
                      userEte[course.id] = val;
                      chrome.storage.local.set({
                        userCustomEteEstimates: userEte
                      });
                    });
                  };
                  if (eteSaveTimer) clearTimeout(eteSaveTimer);
                  if (immediate) {
                    commit();
                  } else {
                    eteSaveTimer = setTimeout(commit, 250);
                  }
                }
              } catch (_) {
              }
            };
            const handleEteInput = (valStr, isFinal) => {
              if (valStr === "" || valStr === null || valStr === void 0) {
                if (isFinal) {
                  courseEteEstimates[course.id] = 0;
                  rowEteInput.value = "0";
                  saveScoreToStorage(0, true);
                  render();
                }
                return;
              }
              const val = Number(valStr);
              if (!Number.isFinite(val) || val < 0) return;
              const clamped = Math.min(val, 40);
              if (isFinal && clamped !== val) {
                rowEteInput.value = String(clamped);
              }
              courseEteEstimates[course.id] = clamped;
              saveScoreToStorage(clamped, isFinal);
              render();
            };
            rowEteInput?.addEventListener("input", (e) => {
              handleEteInput(e.target.value, false);
            });
            rowEteInput?.addEventListener("change", (e) => {
              handleEteInput(e.target.value, true);
            });
            rowEteInput?.addEventListener("blur", (e) => {
              handleEteInput(e.target.value, true);
            });
          }
        }
        if (!tdTarget.hasChildNodes()) {
          if (predCourse?.isSatisfactory) {
            tdTarget.innerHTML = `<span style="font-size:10.5px; opacity:0.4;">\u2014</span>`;
          } else if (course.courseType === "theory") {
            tdTarget.innerHTML = `
            <button type="button" class="mujx-ete-target-btn" data-course-id="${course.id}" style="padding:4px 10px; font-size:11px; font-weight:600; border-radius:6px; background:#1e1e2d; border:1px solid #2d2d3f; color:#f1f5f9; box-shadow:0 1px 3px rgba(0,0,0,0.25); cursor:pointer; white-space:nowrap;">
              ETE Target
            </button>
          `;
            const btn = tdTarget.querySelector(`[data-course-id="${course.id}"]`);
            btn?.addEventListener("click", (e) => {
              e.stopPropagation();
              openEteTargetPopover({ anchorEl: btn, course });
            });
          } else {
            tdTarget.innerHTML = `<span style="font-size:10.5px; opacity:0.5;">Lab / PBL</span>`;
          }
        }
      });
    }
    render();
    return () => {
      banner.remove();
      thCredit?.remove();
      thPred.remove();
      thTarget.remove();
      rowInjections.forEach(({ tdPred, tdTarget, tdCredit }) => {
        tdCredit?.remove();
        tdPred.remove();
        tdTarget.remove();
      });
    };
  }

  // src/content/marks-entry.js
  (() => {
    "use strict";
    if (window.__mujxMarksLoaded) return;
    window.__mujxMarksLoaded = true;
    const knownSatisfactoryMap = { MEE1007: true };
    const storedUserCustomCredits = {};
    const storedCourseCredits = {};
    const storedUserCustomEte = {};
    async function loadStorageCache() {
      try {
        if (typeof chrome !== "undefined" && chrome.storage?.local) {
          const stored = await new Promise(
            (res) => chrome.storage.local.get(
              ["userCustomCredits", "courseCredits", "satisfactoryCourses", "subjectGrades", "userCustomEteEstimates"],
              (d) => res(d || {})
            )
          );
          if (stored?.courseCredits) Object.assign(storedCourseCredits, stored.courseCredits);
          if (stored?.userCustomCredits) Object.assign(storedUserCustomCredits, stored.userCustomCredits);
          if (stored?.userCustomEteEstimates) Object.assign(storedUserCustomEte, stored.userCustomEteEstimates);
          if (stored?.satisfactoryCourses) Object.assign(knownSatisfactoryMap, stored.satisfactoryCourses);
          if (stored?.subjectGrades) {
            Object.entries(stored.subjectGrades).forEach(([k, g]) => {
              if (g === "S" || g === "U" || g === "AP") knownSatisfactoryMap[k] = true;
            });
          }
        }
      } catch (_) {
      }
    }
    async function runMarksEnhancer() {
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const summary = parseInternalMarksSummaryTable(table);
        if (summary.available && summary.courses.length) {
          const sem = document.getElementById("ddlSemester")?.value || "";
          await loadStorageCache();
          applyCredits(summary.courses, storedCourseCredits, storedUserCustomCredits, knownSatisfactoryMap);
          renderMarks(table, summary, knownSatisfactoryMap);
          try {
            const resolvedMap = await resolveAllCredits(sem);
            if (resolvedMap?.__satisfactory) {
              Object.assign(knownSatisfactoryMap, resolvedMap.__satisfactory);
            }
            if (resolvedMap?.__userCustom) {
              Object.assign(storedUserCustomCredits, resolvedMap.__userCustom);
            }
            applyCredits(summary.courses, resolvedMap, storedUserCustomCredits, knownSatisfactoryMap);
            const activeEl = document.activeElement;
            const isTyping = activeEl && activeEl.tagName === "INPUT" && table.contains(activeEl);
            if (!isTyping) {
              renderMarks(table, summary, knownSatisfactoryMap, true);
            }
          } catch (_) {
          }
          break;
        }
      }
    }
    function applyCredits(courses, credMap = {}, userCustomMap = {}, satisfactoryMap = {}) {
      let changed = false;
      courses.forEach((c) => {
        const codeKey = (c.courseCode || "").toUpperCase();
        const idKey = (c.id || "").toUpperCase();
        const nameKey = (c.courseName || "").toUpperCase();
        const isSat = isSatisfactorySubject(c, satisfactoryMap);
        const isLabOrPblOrSat = c.courseType === "lab" || c.courseType === "pbl" || isSat;
        const userVal = userCustomMap[codeKey] ?? userCustomMap[idKey] ?? userCustomMap[nameKey];
        if (userVal !== void 0 && userVal !== null && !isNaN(Number(userVal))) {
          const num = Number(userVal);
          if (c.credits !== num) {
            c.credits = num;
            changed = true;
          }
          return;
        }
        if (isLabOrPblOrSat) {
          if (c.credits !== 1) {
            c.credits = 1;
            changed = true;
          }
          return;
        }
        const mapVal = credMap[codeKey] ?? credMap[idKey] ?? credMap[nameKey];
        if (mapVal !== void 0 && mapVal !== null && !isNaN(Number(mapVal))) {
          const val = Number(mapVal);
          if (c.credits !== val) {
            c.credits = val;
            changed = true;
          }
          return;
        }
        const inferred = inferCourseCredits(c.courseName, c.courseCode, c.courseType, isSat);
        if (c.credits !== inferred) {
          c.credits = inferred;
          changed = true;
        }
      });
      return changed;
    }
    function renderMarks(table, summary, satisfactoryMap = {}, force = false) {
      const dataSig = summary.courses.map((c) => `${c.id}:${c.internalSubtotal}:${c.mte}:${c.cws}:${c.prs}:${c.credits}:${Boolean(satisfactoryMap[c.courseCode || c.id])}`).join(";");
      if (!force && table.getAttribute("data-mujx-marks-sig") === dataSig && table.querySelector(`[${INJECT_ATTR}="marks-pred-col"]`)) {
        return;
      }
      table.querySelectorAll(`[${INJECT_ATTR}]`).forEach((el) => el.remove());
      table.closest(".table-responsive, .table-scrollable")?.parentNode?.querySelectorAll?.(`[${INJECT_ATTR}="marks-banner"]`)?.forEach((el) => el.remove());
      table.parentNode?.querySelectorAll?.(`[${INJECT_ATTR}="marks-banner"]`)?.forEach((el) => el.remove());
      document.querySelectorAll(`[${INJECT_ATTR}="marks-banner"]`).forEach((el) => el.remove());
      table.setAttribute("data-mujx-marks-sig", dataSig);
      enhanceInternalMarksPage({
        table,
        courses: summary.courses,
        headerRow: summary.headerRow,
        allRows: summary.allRows,
        headerRowIndex: summary.headerRowIndex,
        satisfactoryMap,
        initialEteEstimates: storedUserCustomEte
      });
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runMarksEnhancer, { once: true });
    } else {
      runMarksEnhancer();
    }
    document.addEventListener("click", (e) => {
      if (e.target.closest(`[${INJECT_ATTR}], .mujx-ete-popover`)) return;
      const btn = e.target.closest("button, input[type=submit], input[type=button], a");
      if (btn) {
        setTimeout(runMarksEnhancer, 150);
        setTimeout(runMarksEnhancer, 500);
        setTimeout(runMarksEnhancer, 1e3);
      }
    }, true);
    document.addEventListener("change", (e) => {
      if (e.target.closest(`[${INJECT_ATTR}], .mujx-ete-popover`)) return;
      if (e.target.closest("select")) {
        setTimeout(runMarksEnhancer, 150);
        setTimeout(runMarksEnhancer, 500);
      }
    }, true);
  })();
})();
