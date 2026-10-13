(() => {
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

  // src/calculations/rounding.js
  function roundTo(value, digits = 2) {
    if (!Number.isFinite(value)) return null;
    const factor = 10 ** digits;
    return Math.round((value + Number.EPSILON) * factor) / factor;
  }

  // src/calculations/sgpa.js
  function gradePointForLetter(letter, table = MUJ_GRADE_POINT_MAP) {
    const gp = getGradePoint(letter, table);
    return typeof gp === "number" ? gp : null;
  }
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

  // src/ui/components/grades/grade-sheet.js
  function enhanceGradeSheet({
    table,
    records,
    totalCreditsFromFooter,
    headerRow,
    allRows,
    headerRowIndex,
    session
  }) {
    if (!table || !records || !records.length) return () => {
    };
    if (table.querySelector(`[${INJECT_ATTR}="grade-points"]`)) {
      return () => {
      };
    }
    const officialRecords = records.map((r) => ({ ...r }));
    let workingRecords = records.map((r) => ({ ...r }));
    let isPredictMode = false;
    let isBreakdownOpen = false;
    const theadRows = table.querySelectorAll("thead tr");
    const actualHeaderRow = headerRow || (theadRows.length ? theadRows[theadRows.length - 1] : table.rows[0]);
    if (!actualHeaderRow) return () => {
    };
    const rowsPool = allRows && allRows.length ? allRows.slice((headerRowIndex ?? 0) + 1) : table.tBodies.length ? [...table.tBodies].flatMap((body) => [...body.rows]) : [...table.rows].slice(1);
    const courseRows = [];
    let totalRow = null;
    for (const row of rowsPool) {
      if (row === actualHeaderRow) continue;
      const text = (row.textContent || "").toLowerCase();
      if (text.includes("total")) {
        totalRow = row;
      } else if (row.cells && row.cells.length >= 3) {
        courseRows.push(row);
      }
    }
    document.querySelectorAll(`[${INJECT_ATTR}="grade-banner"]`).forEach((b) => b.remove());
    const container = document.createElement("div");
    container.className = "mujx-grade-banner";
    container.setAttribute(INJECT_ATTR, "grade-banner");
    const insertTarget = table.closest(".table-responsive, .table-scrollable") || table;
    insertTarget.parentNode?.insertBefore(container, insertTarget);
    const isTh = Boolean(actualHeaderRow.querySelector("th"));
    const thGp = document.createElement(isTh ? "th" : "td");
    thGp.textContent = "Pts (Gi)";
    thGp.setAttribute(INJECT_ATTR, "grade-points");
    thGp.title = "Grade Points corresponding to letter grade";
    thGp.style.fontWeight = "700";
    thGp.style.textAlign = "center";
    actualHeaderRow.append(thGp);
    const thCp = document.createElement(isTh ? "th" : "td");
    thCp.textContent = "Ci \xD7 Gi";
    thCp.setAttribute(INJECT_ATTR, "credit-points");
    thCp.title = "Credit Points = Course Credits \xD7 Grade Points (MUJ Formula)";
    thCp.style.fontWeight = "700";
    thCp.style.textAlign = "center";
    actualHeaderRow.append(thCp);
    const tdCells = [];
    courseRows.forEach((row, i) => {
      const tdGp = document.createElement("td");
      tdGp.setAttribute(INJECT_ATTR, "grade-points");
      tdGp.style.textAlign = "center";
      tdGp.style.fontWeight = "600";
      row.append(tdGp);
      const tdCp = document.createElement("td");
      tdCp.setAttribute(INJECT_ATTR, "credit-points");
      tdCp.style.textAlign = "center";
      tdCp.style.fontWeight = "600";
      row.append(tdCp);
      tdCells.push({ row, index: i, tdGp, tdCp });
    });
    let totalTdGp = null;
    let totalTdCp = null;
    if (totalRow) {
      totalTdGp = document.createElement("td");
      totalTdGp.setAttribute(INJECT_ATTR, "grade-points");
      totalTdGp.style.textAlign = "center";
      totalRow.append(totalTdGp);
      totalTdCp = document.createElement("td");
      totalTdCp.setAttribute(INJECT_ATTR, "credit-points");
      totalTdCp.style.textAlign = "center";
      totalRow.append(totalTdCp);
    }
    const originalGradeCells = courseRows.map((row) => {
      const cells = [...row.cells].filter((c) => !c.hasAttribute(INJECT_ATTR));
      return cells[cells.length - 1];
    });
    const originalGradeHtmls = originalGradeCells.map((c) => c?.innerHTML || "");
    const detectedSession = session || records.find((r) => r.session)?.session || records.find((r) => r.semester)?.semester || detectSemesterFromDOM(table.ownerDocument || document) || "Semester not identified";
    function render() {
      const calculation = calculateSGPA(workingRecords, {
        expectedTotalCredits: totalCreditsFromFooter,
        semester: detectedSession
      });
      const isModified = workingRecords.some((r, i) => r.letter !== officialRecords[i].letter);
      const sgpaText = calculation.sgpa !== null ? calculation.sgpa.toFixed(2) : "\u2014";
      const statusLabel = calculation.status === "complete" ? "\u2713 Complete" : calculation.status === "provisional" ? "Provisional" : "\u26A0 Incomplete";
      const hasCreditMismatch = calculation.warnings.includes("credit_mismatch");
      const nonEvalCourses = calculation.courses.filter((c) => c.status === "non_evaluative");
      container.innerHTML = `
      <!-- 1. Compact Summary Strip -->
      <div class="mujx-grade-banner-main">
        <div class="mujx-grade-sgpa-pill">
          <span class="mujx-grade-sgpa-label">
            ${isModified ? "PREDICTED SGPA" : "OFFICIAL SGPA"}
            ${detectedSession ? `\xB7 ${escapeHtml(detectedSession)}` : ""}
          </span>
          <span class="mujx-grade-sgpa-value">${sgpaText}</span>
        </div>

        <div class="mujx-grade-stats">
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalCredits}</span>
            <span class="mujx-stat-lbl">Total Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.gradedCredits}</span>
            <span class="mujx-stat-lbl">Graded Credits</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalWeightedPoints}</span>
            <span class="mujx-stat-lbl">Points (\u03A3 Ci\xD7Gi)</span>
          </div>
          <div class="mujx-grade-stat-item">
            <span class="mujx-stat-num">${calculation.totalCount}</span>
            <span class="mujx-stat-lbl">Courses</span>
          </div>
        </div>

        <div class="mujx-grade-actions">
          <span class="mujx-chip ${calculation.status === "complete" ? "safe" : "danger"}" style="font-size:11px; padding:3px 8px;">
            ${statusLabel}
          </span>
          <button type="button" class="mujx-calc-toggle-btn" data-role="toggle-breakdown" style="padding:6px 11px; font-size:11.5px; border-radius:6px; cursor:pointer; background:rgba(13, 148, 136, 0.15); border:1px solid rgba(13, 148, 136, 0.4); color:inherit; font-weight:600;">
            ${isBreakdownOpen ? "\u2715 Hide calculation" : "\u{1F50D} View calculation"}
          </button>
          <button type="button" class="mujx-pred-btn ${isPredictMode ? "active" : ""}" data-role="toggle-pred" style="padding:6px 12px; font-size:11.5px;">
            ${isPredictMode ? "\u2713 Done Simulating" : "\u{1F3AF} Predict SGPA"}
          </button>
          <button type="button" class="mujx-reset-btn" data-role="reset-pred" ${isModified ? "" : "hidden"} style="padding:6px 10px; font-size:11.5px;">
            \u21BA Reset Official
          </button>
        </div>
      </div>

      <!-- Warnings / Discrepancy Alert -->
      ${hasCreditMismatch ? `<div class="mujx-warning-strip" style="background:rgba(245, 158, 11, 0.12); border:1px solid rgba(245, 158, 11, 0.35); border-radius:6px; padding:6px 12px; font-size:12px; color:#d97706; display:flex; align-items:center; gap:8px;">
              <span>\u26A0\uFE0F</span>
              <span><strong>Credit Discrepancy:</strong> Sum of parsed course credits (${calculation.totalCredits}) does not match the table footer Total (${totalCreditsFromFooter}). Both values are preserved.</span>
            </div>` : ""}

      <!-- 2. Course-wise Expandable Breakdown Section (shown when View calculation is clicked) -->
      <div class="mujx-grade-breakdown" data-role="breakdown-section" ${isBreakdownOpen ? "" : "hidden"} style="background:rgba(0,0,0,0.22); border:1px solid rgba(125,125,125,0.25); border-radius:8px; padding:12px 14px; margin-top:6px; box-sizing:border-box;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
          <div style="font-weight:700; font-size:13px; color:var(--mujx-accent, #2dd4bf);">
            Course-Wise Calculation Breakdown (${escapeHtml(detectedSession)})
          </div>
          <div style="font-size:11px; opacity:0.75;">
            Formula: <strong>SGPA = \u03A3(Ci \xD7 Gi) / \u03A3Ci</strong>
          </div>
        </div>

        <div style="overflow-x:auto;">
          <table class="mujx-breakdown-table" style="width:100%; border-collapse:collapse; font-size:11.5px; text-align:left;">
            <thead>
              <tr style="border-bottom:1px solid rgba(125,125,125,0.3); opacity:0.85;">
                <th style="padding:4px 8px;">Course Code</th>
                <th style="padding:4px 8px;">Course Name</th>
                <th style="padding:4px 8px; text-align:center;">Credits (Ci)</th>
                <th style="padding:4px 8px; text-align:center;">Grade</th>
                <th style="padding:4px 8px; text-align:center;">Grade Points (Gi)</th>
                <th style="padding:4px 8px; text-align:right;">Weighted (Ci \xD7 Gi)</th>
              </tr>
            </thead>
            <tbody>
              ${calculation.courses.map((c) => {
        const isNonEval = c.status === "non_evaluative";
        const isBad = c.status === "invalid_credits" || c.status === "unknown_grade" || c.status === "missing_grade";
        const gpText = isNonEval ? "\u2014" : isBad ? "Unresolved" : c.gradePoints !== null ? c.gradePoints : "\u2014";
        const wpText = isNonEval ? `<span style="opacity:0.7; font-size:11px;">Satisfactory (Audit)</span>` : isBad ? `<span style="color:#ef4444;">Flagged</span>` : c.weightedPoints;
        return `
                    <tr style="border-bottom:1px solid rgba(125,125,125,0.12);">
                      <td style="padding:4px 8px; font-weight:600;">${escapeHtml(c.courseCode || "\u2014")}</td>
                      <td style="padding:4px 8px;">${escapeHtml(c.courseName || "\u2014")}</td>
                      <td style="padding:4px 8px; text-align:center;">${c.credits !== null ? c.credits : "\u2014"}</td>
                      <td style="padding:4px 8px; text-align:center; font-weight:700;">${escapeHtml(c.grade || "\u2014")}</td>
                      <td style="padding:4px 8px; text-align:center;">${gpText}</td>
                      <td style="padding:4px 8px; text-align:right; font-weight:600;">${wpText}</td>
                    </tr>
                  `;
      }).join("")}
            </tbody>
            <tfoot>
              <tr style="border-top:2px solid rgba(125,125,125,0.4); font-weight:700;">
                <td colspan="2" style="padding:6px 8px;">Totals (Evaluated: ${calculation.evaluatedCount} / Total: ${calculation.totalCount} courses)</td>
                <td style="padding:6px 8px; text-align:center;">${calculation.totalCredits} (Graded: ${calculation.gradedCredits})</td>
                <td colspan="2" style="padding:6px 8px; text-align:right;">Total Weighted Points (\u03A3 Ci\xD7Gi):</td>
                <td style="padding:6px 8px; text-align:right; color:var(--mujx-accent, #2dd4bf);">${calculation.totalWeightedPoints}</td>
              </tr>
            </tfoot>
          </table>
        </div>

        <div style="margin-top:10px; padding-top:8px; border-top:1px dashed rgba(125,125,125,0.25); display:flex; flex-direction:column; gap:4px; font-size:11.5px;">
          <div>
            <strong>Substituted Identity:</strong>
            <code>${escapeHtml(calculation.substitutedFormula)}</code>
          </div>
          ${nonEvalCourses.length ? `<div style="opacity:0.85; color:#0d9488;">
                  \u2139\uFE0F <strong>Non-Evaluative Courses:</strong> ${nonEvalCourses.map((c) => `${escapeHtml(c.courseCode)} (${c.credits} cr, Grade '${escapeHtml(c.grade)}')`).join(", ")} fulfill degree requirements but do not carry grade points and are excluded from the GPA credit divisor per MUJ regulations.
                </div>` : ""}
        </div>
      </div>
    `;
      container.querySelector("[data-role=toggle-breakdown]")?.addEventListener("click", () => {
        isBreakdownOpen = !isBreakdownOpen;
        const bSec = container.querySelector("[data-role=breakdown-section]");
        if (bSec) bSec.hidden = !isBreakdownOpen;
        const tBtn = container.querySelector("[data-role=toggle-breakdown]");
        if (tBtn) tBtn.textContent = isBreakdownOpen ? "\u2715 Hide calculation" : "\u{1F50D} View calculation";
      });
      container.querySelector("[data-role=toggle-pred]")?.addEventListener("click", () => {
        isPredictMode = !isPredictMode;
        updateGradeCells();
        render();
      });
      container.querySelector("[data-role=reset-pred]")?.addEventListener("click", () => {
        workingRecords = officialRecords.map((r) => ({ ...r }));
        updateGradeCells();
        render();
      });
      tdCells.forEach(({ index, tdGp, tdCp }) => {
        const rec = workingRecords[index];
        const inc = calculation.courses.find((_, i) => i === index) || {};
        const gp = inc.gradePoints;
        const cp = inc.weightedPoints;
        if (inc.status === "non_evaluative") {
          tdGp.innerHTML = `<span style="opacity:0.75; font-size:11.5px;">Satisfactory</span>`;
          tdCp.innerHTML = `<span style="opacity:0.6;">\u2014</span>`;
        } else if (gp !== null && gp !== void 0) {
          tdGp.textContent = String(gp);
          tdCp.textContent = String(cp);
        } else {
          tdGp.textContent = "\u2014";
          tdCp.textContent = "\u2014";
        }
      });
      if (totalRow) {
        if (totalTdGp) {
          totalTdGp.innerHTML = `<span style="font-size:11px; opacity:0.8;">Total Points:</span>`;
        }
        if (totalTdCp) {
          totalTdCp.innerHTML = `
          <div style="font-weight:700;">${calculation.totalWeightedPoints}</div>
          <div class="mujx-sgpa-table-badge" style="margin-top:2px;">SGPA: ${sgpaText}</div>
        `;
        }
      }
    }
    function updateGradeCells() {
      originalGradeCells.forEach((cell, i) => {
        if (!cell) return;
        if (isPredictMode) {
          const curLetter = workingRecords[i].letter || "";
          const options = ["A+", "A", "B", "C", "D", "E", "F", "S"];
          cell.innerHTML = `
          <select class="mujx-grade-select" data-grade-idx="${i}">
            ${options.map(
            (opt) => `<option value="${opt}" ${opt === curLetter ? "selected" : ""}>${opt}${opt === "S" ? " (Satisfactory)" : ` (${gradePointForLetter(opt)})`}</option>`
          ).join("")}
          </select>
        `;
          const select = cell.querySelector("select");
          select?.addEventListener("change", (e) => {
            workingRecords[i].letter = e.target.value;
            render();
          });
        } else {
          cell.innerHTML = originalGradeHtmls[i];
        }
      });
    }
    render();
    return () => {
      container.remove();
      thGp.remove();
      thCp.remove();
      tdCells.forEach(({ tdGp, tdCp }) => {
        tdGp.remove();
        tdCp.remove();
      });
      totalTdGp?.remove();
      totalTdCp?.remove();
      originalGradeCells.forEach((cell, i) => {
        if (cell) cell.innerHTML = originalGradeHtmls[i];
      });
    };
  }
  function detectSemesterFromDOM(doc = document) {
    const selects = doc.querySelectorAll("select");
    for (const sel of selects) {
      const selectedOption = sel.options[sel.selectedIndex];
      if (selectedOption) {
        const text = selectedOption.textContent.trim();
        if (/^(?:sem|semester|[ivx]+|\d+)/i.test(text)) {
          return `Semester ${text}`;
        }
      }
    }
    const breadcrumbs = doc.querySelectorAll(".breadcrumb, .page-title, h1, h2, h3, h4");
    for (const el of breadcrumbs) {
      const text = el.textContent.trim();
      const match = text.match(/(JAN-MAY\s*\d{4}|JUL-NOV\s*\d{4}|Semester\s*[\dIVX]+)/i);
      if (match) return match[1].toUpperCase();
    }
    return null;
  }

  // src/content/grades-entry.js
  (() => {
    "use strict";
    if (window.__mujxGradesLoaded) return;
    window.__mujxGradesLoaded = true;
    function runGradesEnhancer() {
      const tables = document.querySelectorAll("table");
      for (const table of tables) {
        const text = (table.textContent || "").toLowerCase();
        if (text.includes("grade") && (text.includes("course") || text.includes("credit") || text.includes("session"))) {
          const gradeSheetData = parseGradesTable(table);
          if (gradeSheetData.available && gradeSheetData.records.length) {
            const dataSig = `${gradeSheetData.session || ""}:${gradeSheetData.records.map((r) => `${r.courseCode}-${r.letter}-${r.credits}`).join(";")}`;
            if (table.getAttribute("data-mujx-sig") === dataSig && table.querySelector(`[${INJECT_ATTR}="grade-points"]`)) {
              continue;
            }
            table.querySelectorAll(`[${INJECT_ATTR}]`).forEach((el) => el.remove());
            document.querySelectorAll(`[${INJECT_ATTR}="grade-banner"]`).forEach((el) => el.remove());
            table.setAttribute("data-mujx-sig", dataSig);
            enhanceGradeSheet({
              table,
              records: gradeSheetData.records,
              totalCreditsFromFooter: gradeSheetData.totalCreditsFromFooter,
              headerRow: gradeSheetData.headerRow,
              allRows: gradeSheetData.allRows,
              headerRowIndex: gradeSheetData.headerRowIndex,
              session: gradeSheetData.session
            });
            try {
              const gradesMap = {};
              const creditsMap = {};
              const satisfactoryMap = {};
              gradeSheetData.records.forEach((r) => {
                if (r.courseCode) {
                  if (r.letter) gradesMap[r.courseCode] = r.letter;
                  if (r.credits) creditsMap[r.courseCode] = r.credits;
                  if (r.letter === "S" || r.letter === "U" || r.letter === "AP") {
                    satisfactoryMap[r.courseCode] = true;
                  }
                }
              });
              if (typeof chrome !== "undefined" && chrome.storage?.local) {
                chrome.storage.local.get(["subjectGrades", "courseCredits", "satisfactoryCourses"], (res) => {
                  const prevG = res?.subjectGrades || {};
                  const prevC = res?.courseCredits || {};
                  const prevS = res?.satisfactoryCourses || {};
                  chrome.storage.local.set({
                    subjectGrades: { ...prevG, ...gradesMap },
                    courseCredits: { ...prevC, ...creditsMap },
                    satisfactoryCourses: { ...prevS, ...satisfactoryMap }
                  });
                });
              }
            } catch (_) {
            }
            break;
          }
        }
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runGradesEnhancer, { once: true });
    } else {
      runGradesEnhancer();
    }
    document.addEventListener("click", (e) => {
      const btn = e.target.closest("button, input[type=submit], input[type=button], a");
      if (btn) {
        setTimeout(runGradesEnhancer, 150);
        setTimeout(runGradesEnhancer, 500);
        setTimeout(runGradesEnhancer, 1e3);
      }
    }, true);
    document.addEventListener("change", (e) => {
      if (e.target.closest("select")) {
        setTimeout(runGradesEnhancer, 150);
        setTimeout(runGradesEnhancer, 500);
      }
    }, true);
  })();
})();
