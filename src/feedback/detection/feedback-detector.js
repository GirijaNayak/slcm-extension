/**
 * Feedback Page Detector
 *
 * Detects whether the current page is an active Feedback Questionnaire,
 * a Feedback Course List, or an unrelated page.
 * Extracts course name, faculty name, course code, session, and submission controls.
 */

export function detectFeedbackPage(doc = document, href = location.href) {
  if (!doc) return { available: false, kind: "none" };

  const url = new URL(href);
  const path = url.pathname.toLowerCase();
  const text = (doc.body?.textContent || "").toLowerCase();

  // 1. Check for Active Questionnaire
  // A questionnaire has question items, radio groups/buttons, and a submission button
  const hasRadioOrOptions = Boolean(
    doc.querySelector('input[type="radio"]') ||
    doc.querySelector('select[name*="feedback" i], select[name*="question" i], select[name*="rating" i], select[id*="ddl" i]') ||
    doc.querySelector('.btn-group[data-toggle="buttons"], .kt-radio, .radio-inline')
  );

  const hasSubmitButton = Boolean(findSubmitButton(doc));

  const isQuestionnaireUrl =
    path.includes("feedback") ||
    path.includes("studentfeedback") ||
    path.includes("coursefeedback") ||
    url.search.toLowerCase().includes("feedback");

  const hasQuestionnaireHeadings =
    text.includes("questionnaire") ||
    text.includes("preparation for lectures") ||
    text.includes("regularity in taking classes") ||
    text.includes("student feedback") ||
    text.includes("course feedback") ||
    text.includes("faculty feedback");

  if (hasRadioOrOptions && (isQuestionnaireUrl || hasQuestionnaireHeadings)) {
    const metadata = extractQuestionnaireMetadata(doc);
    const submitBtn = findSubmitButton(doc);
    return {
      available: true,
      kind: "questionnaire",
      metadata,
      submitButton: submitBtn,
    };
  }

  // 2. Check for Feedback Course List Page
  // Lists registered courses and their feedback status (Pending / Completed)
  const listData = parseFeedbackListPage(doc);
  if (listData.available) {
    return {
      available: true,
      kind: "list",
      courses: listData.courses,
      academicSession: listData.academicSession,
    };
  }

  // 3. Fallback: If URL indicates feedback but form hasn't fully rendered or is a list with 0 courses
  if (isQuestionnaireUrl) {
    return {
      available: true,
      kind: "unknown_feedback",
      metadata: extractQuestionnaireMetadata(doc),
      submitButton: findSubmitButton(doc),
    };
  }

  return { available: false, kind: "none" };
}

/**
 * Extracts Course Name, Faculty Name, Course Code, and Academic Session
 * from the active questionnaire DOM.
 */
export function extractQuestionnaireMetadata(doc = document) {
  let courseName = "";
  let courseCode = "";
  let facultyName = "";
  let academicSession = "";

  // Strategy A: Look for structured labels (Course Name, Subject, Faculty, Teacher, Session)
  const allElements = doc.querySelectorAll("p, span, div, td, th, label, h1, h2, h3, h4, h5, li");
  for (const el of allElements) {
    // Only inspect direct or compact text to avoid giant outer containers
    if (el.children.length > 3) continue;
    const txt = (el.textContent || "").trim();
    if (!txt) continue;

    // Course Name / Subject
    if (!courseName && /^(course|subject)(\s+name)?\s*[:\-]\s*(.+)/i.test(txt)) {
      const match = txt.match(/^(course|subject)(\s+name)?\s*[:\-]\s*(.+)/i);
      if (match && match[3]) courseName = cleanMetaValue(match[3]);
    }

    // Faculty Name / Teacher / Instructor
    if (!facultyName && /^(faculty|teacher|instructor|faculty\s+name|faculty\s+member)\s*[:\-]\s*(.+)/i.test(txt)) {
      const match = txt.match(/^(faculty|teacher|instructor|faculty\s+name|faculty\s+member)\s*[:\-]\s*(.+)/i);
      if (match && match[2]) facultyName = cleanMetaValue(match[2]);
    }

    // Course Code
    if (!courseCode && /^(course\s+code|subject\s+code|code)\s*[:\-]\s*([a-z0-9\-]+)/i.test(txt)) {
      const match = txt.match(/^(course\s+code|subject\s+code|code)\s*[:\-]\s*([a-z0-9\-]+)/i);
      if (match && match[2]) courseCode = match[2].trim().toUpperCase();
    }

    // Academic Session / Semester
    if (!academicSession && /^(academic\s+session|session|semester)\s*[:\-]\s*(.+)/i.test(txt)) {
      const match = txt.match(/^(academic\s+session|session|semester)\s*[:\-]\s*(.+)/i);
      if (match && match[2]) academicSession = cleanMetaValue(match[2]);
    }
  }

  // Strategy B: If course code was embedded in courseName like "Cloud Computing (CS1601)"
  if (courseName && !courseCode) {
    const codeMatch = courseName.match(/\(([A-Z]{2,4}\d{3,4}[A-Z]?)\)/i) || courseName.match(/\[([A-Z]{2,4}\d{3,4}[A-Z]?)\]/i);
    if (codeMatch) {
      courseCode = codeMatch[1].toUpperCase();
      courseName = courseName.replace(codeMatch[0], "").trim();
    }
  }

  // Strategy C: Headings or portlet titles
  if (!courseName) {
    const portletHead = doc.querySelector(".kt-portlet__head-title, .panel-title, .card-title, h3, h2");
    if (portletHead) {
      const hText = (portletHead.textContent || "").trim();
      if (hText && !hText.toLowerCase().includes("feedback") && hText.length < 90) {
        courseName = hText;
      }
    }
  }

  // Strategy D: Dropdown selectors on page (e.g. ddlCourse, ddlSubject)
  if (!courseName) {
    const ddlCourse = doc.querySelector('select[id*="course" i], select[name*="course" i], select[id*="subject" i]');
    if (ddlCourse && ddlCourse.selectedOptions && ddlCourse.selectedOptions[0]) {
      const optText = ddlCourse.selectedOptions[0].textContent.trim();
      if (optText && !optText.startsWith("--")) courseName = optText;
    }
  }

  if (!facultyName) {
    const ddlFaculty = doc.querySelector('select[id*="faculty" i], select[name*="faculty" i], select[id*="teacher" i]');
    if (ddlFaculty && ddlFaculty.selectedOptions && ddlFaculty.selectedOptions[0]) {
      const optText = ddlFaculty.selectedOptions[0].textContent.trim();
      if (optText && !optText.startsWith("--")) facultyName = optText;
    }
  }

  // Fallbacks
  courseName = courseName || "Course Feedback";
  courseCode = courseCode || (courseName !== "Course Feedback" ? courseName.slice(0, 10).toUpperCase().replace(/[^A-Z0-9]/g, "") : "COURSE");
  facultyName = facultyName || "Course Faculty";
  academicSession = academicSession || "Current Academic Session";

  const courseKey = `${courseCode}_${courseName}`.replace(/\s+/g, "_");

  return {
    courseName,
    courseCode,
    facultyName,
    academicSession,
    courseKey,
  };
}

/**
 * Finds the university submission button
 */
export function findSubmitButton(doc = document) {
  // Common submit IDs and selectors in ASP.NET / Metronic SLCM
  const selectors = [
    'input[type="submit"][value*="submit" i]',
    'button[type="submit"]',
    '#btnSubmit',
    '#ButtonSubmit',
    '#submitBtn',
    'button[id*="submit" i]',
    'a[id*="submit" i]',
    'input[id*="submit" i]',
    '.btn-submit',
    '.btn-success[value*="submit" i]',
  ];

  for (const sel of selectors) {
    const btn = doc.querySelector(sel);
    if (btn && isVisible(btn)) return btn;
  }

  // Fallback: search all buttons for text "Submit"
  const allBtns = doc.querySelectorAll('button, input[type="button"], a.btn');
  for (const b of allBtns) {
    const txt = (b.textContent || b.value || "").trim().toLowerCase();
    if (txt === "submit" || txt.includes("submit feedback")) {
      if (isVisible(b)) return b;
    }
  }

  return null;
}

/**
 * Parses the Feedback List Page showing courses and their pending/completed status
 */
export function parseFeedbackListPage(doc = document) {
  const tables = doc.querySelectorAll("table");
  for (const table of tables) {
    const text = (table.textContent || "").toLowerCase();
    if (
      (text.includes("course") || text.includes("subject")) &&
      (text.includes("feedback") || text.includes("status") || text.includes("action") || text.includes("pending"))
    ) {
      const rows = Array.from(table.rows);
      if (rows.length < 2) continue;

      // Identify header row
      let headerRowIndex = 0;
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        if (rows[i].querySelectorAll("th").length > 0) {
          headerRowIndex = i;
          break;
        }
      }

      const headers = Array.from(rows[headerRowIndex].cells).map((c) =>
        (c.textContent || "").trim().toLowerCase()
      );

      const courseIdx = headers.findIndex((h) => h.includes("course") || h.includes("subject"));
      const codeIdx = headers.findIndex((h) => h.includes("code"));
      const facultyIdx = headers.findIndex((h) => h.includes("faculty") || h.includes("teacher"));
      const statusIdx = headers.findIndex((h) => h.includes("status"));
      const actionIdx = headers.findIndex((h) => h.includes("action") || h.includes("feedback"));

      const courses = [];
      for (let i = headerRowIndex + 1; i < rows.length; i++) {
        const row = rows[i];
        if (row.cells.length < 2) continue;

        let courseName = courseIdx !== -1 ? (row.cells[courseIdx]?.textContent || "").trim() : "";
        let courseCode = codeIdx !== -1 ? (row.cells[codeIdx]?.textContent || "").trim() : "";
        const faculty = facultyIdx !== -1 ? (row.cells[facultyIdx]?.textContent || "").trim() : "";
        const statusText = statusIdx !== -1 ? (row.cells[statusIdx]?.textContent || "").trim() : "";
        const actionEl = actionIdx !== -1 ? row.cells[actionIdx]?.querySelector("a, button, input") : row.querySelector("a, button");

        // Normalize course name and code
        if (!courseCode && courseName) {
          const match = courseName.match(/\(([A-Z]{2,4}\d{3,4}[A-Z]?)\)/i);
          if (match) {
            courseCode = match[1].toUpperCase();
            courseName = courseName.replace(match[0], "").trim();
          }
        }

        const isCompleted =
          /completed|submitted|given|done|yes/i.test(statusText) ||
          (actionEl && /view|details/i.test(actionEl.textContent || ""));

        const status = isCompleted ? "Completed" : "Pending";

        if (courseName || courseCode) {
          courses.push({
            id: courseCode || `CRS_${i}`,
            courseCode: courseCode || "—",
            courseName: courseName || "Untitled Course",
            faculty: faculty || "—",
            status,
            actionUrl: actionEl?.getAttribute?.("href") || null,
            rowElement: row,
          });
        }
      }

      if (courses.length > 0) {
        return {
          available: true,
          courses,
          academicSession: extractSessionFromPage(doc),
        };
      }
    }
  }

  return { available: false, courses: [] };
}

function extractSessionFromPage(doc) {
  const text = (doc.body?.textContent || "");
  const match = text.match(/(?:academic\s+session|session)\s*[:\-]\s*([a-z0-9\-\s/]+)/i);
  return match ? match[1].trim() : "Current Academic Session";
}

function cleanMetaValue(val) {
  return val
    .replace(/^[:\-]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function isVisible(el) {
  if (!el) return false;
  return !(el.offsetWidth === 0 && el.offsetHeight === 0) && window.getComputedStyle(el).display !== "none";
}
