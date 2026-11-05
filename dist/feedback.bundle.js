(() => {
  // src/feedback/detection/feedback-detector.js
  function detectFeedbackPage(doc = document, href = location.href) {
    if (!doc) return { available: false, kind: "none" };
    const url = new URL(href);
    const path = url.pathname.toLowerCase();
    const text = (doc.body?.textContent || "").toLowerCase();
    const hasRadioOrOptions = Boolean(
      doc.querySelector('input[type="radio"]') || doc.querySelector('select[name*="feedback" i], select[name*="question" i], select[name*="rating" i], select[id*="ddl" i]') || doc.querySelector('.btn-group[data-toggle="buttons"], .kt-radio, .radio-inline')
    );
    const hasSubmitButton = Boolean(findSubmitButton(doc));
    const isQuestionnaireUrl = path.includes("feedback") || path.includes("studentfeedback") || path.includes("coursefeedback") || url.search.toLowerCase().includes("feedback");
    const hasQuestionnaireHeadings = text.includes("questionnaire") || text.includes("preparation for lectures") || text.includes("regularity in taking classes") || text.includes("student feedback") || text.includes("course feedback") || text.includes("faculty feedback");
    if (hasRadioOrOptions && (isQuestionnaireUrl || hasQuestionnaireHeadings)) {
      const metadata = extractQuestionnaireMetadata(doc);
      const submitBtn = findSubmitButton(doc);
      return {
        available: true,
        kind: "questionnaire",
        metadata,
        submitButton: submitBtn
      };
    }
    const listData = parseFeedbackListPage(doc);
    if (listData.available) {
      return {
        available: true,
        kind: "list",
        courses: listData.courses,
        academicSession: listData.academicSession
      };
    }
    if (isQuestionnaireUrl) {
      return {
        available: true,
        kind: "unknown_feedback",
        metadata: extractQuestionnaireMetadata(doc),
        submitButton: findSubmitButton(doc)
      };
    }
    return { available: false, kind: "none" };
  }
  function extractQuestionnaireMetadata(doc = document) {
    let courseName = "";
    let courseCode = "";
    let facultyName = "";
    let academicSession = "";
    const allElements = doc.querySelectorAll("p, span, div, td, th, label, h1, h2, h3, h4, h5, li");
    for (const el of allElements) {
      if (el.children.length > 3) continue;
      const txt = (el.textContent || "").trim();
      if (!txt) continue;
      if (!courseName && /^(course|subject)(\s+name)?\s*[:\-]\s*(.+)/i.test(txt)) {
        const match = txt.match(/^(course|subject)(\s+name)?\s*[:\-]\s*(.+)/i);
        if (match && match[3]) courseName = cleanMetaValue(match[3]);
      }
      if (!facultyName && /^(faculty|teacher|instructor|faculty\s+name|faculty\s+member)\s*[:\-]\s*(.+)/i.test(txt)) {
        const match = txt.match(/^(faculty|teacher|instructor|faculty\s+name|faculty\s+member)\s*[:\-]\s*(.+)/i);
        if (match && match[2]) facultyName = cleanMetaValue(match[2]);
      }
      if (!courseCode && /^(course\s+code|subject\s+code|code)\s*[:\-]\s*([a-z0-9\-]+)/i.test(txt)) {
        const match = txt.match(/^(course\s+code|subject\s+code|code)\s*[:\-]\s*([a-z0-9\-]+)/i);
        if (match && match[2]) courseCode = match[2].trim().toUpperCase();
      }
      if (!academicSession && /^(academic\s+session|session|semester)\s*[:\-]\s*(.+)/i.test(txt)) {
        const match = txt.match(/^(academic\s+session|session|semester)\s*[:\-]\s*(.+)/i);
        if (match && match[2]) academicSession = cleanMetaValue(match[2]);
      }
    }
    if (courseName && !courseCode) {
      const codeMatch = courseName.match(/\(([A-Z]{2,4}\d{3,4}[A-Z]?)\)/i) || courseName.match(/\[([A-Z]{2,4}\d{3,4}[A-Z]?)\]/i);
      if (codeMatch) {
        courseCode = codeMatch[1].toUpperCase();
        courseName = courseName.replace(codeMatch[0], "").trim();
      }
    }
    if (!courseName) {
      const portletHead = doc.querySelector(".kt-portlet__head-title, .panel-title, .card-title, h3, h2");
      if (portletHead) {
        const hText = (portletHead.textContent || "").trim();
        if (hText && !hText.toLowerCase().includes("feedback") && hText.length < 90) {
          courseName = hText;
        }
      }
    }
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
      courseKey
    };
  }
  function findSubmitButton(doc = document) {
    const selectors = [
      'input[type="submit"][value*="submit" i]',
      'button[type="submit"]',
      "#btnSubmit",
      "#ButtonSubmit",
      "#submitBtn",
      'button[id*="submit" i]',
      'a[id*="submit" i]',
      'input[id*="submit" i]',
      ".btn-submit",
      '.btn-success[value*="submit" i]'
    ];
    for (const sel of selectors) {
      const btn = doc.querySelector(sel);
      if (btn && isVisible(btn)) return btn;
    }
    const allBtns = doc.querySelectorAll('button, input[type="button"], a.btn');
    for (const b of allBtns) {
      const txt = (b.textContent || b.value || "").trim().toLowerCase();
      if (txt === "submit" || txt.includes("submit feedback")) {
        if (isVisible(b)) return b;
      }
    }
    return null;
  }
  function parseFeedbackListPage(doc = document) {
    const tables = doc.querySelectorAll("table");
    for (const table of tables) {
      const text = (table.textContent || "").toLowerCase();
      if ((text.includes("course") || text.includes("subject")) && (text.includes("feedback") || text.includes("status") || text.includes("action") || text.includes("pending"))) {
        const rows = Array.from(table.rows);
        if (rows.length < 2) continue;
        let headerRowIndex = 0;
        for (let i = 0; i < Math.min(3, rows.length); i++) {
          if (rows[i].querySelectorAll("th").length > 0) {
            headerRowIndex = i;
            break;
          }
        }
        const headers = Array.from(rows[headerRowIndex].cells).map(
          (c) => (c.textContent || "").trim().toLowerCase()
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
          if (!courseCode && courseName) {
            const match = courseName.match(/\(([A-Z]{2,4}\d{3,4}[A-Z]?)\)/i);
            if (match) {
              courseCode = match[1].toUpperCase();
              courseName = courseName.replace(match[0], "").trim();
            }
          }
          const isCompleted = /completed|submitted|given|done|yes/i.test(statusText) || actionEl && /view|details/i.test(actionEl.textContent || "");
          const status = isCompleted ? "Completed" : "Pending";
          if (courseName || courseCode) {
            courses.push({
              id: courseCode || `CRS_${i}`,
              courseCode: courseCode || "\u2014",
              courseName: courseName || "Untitled Course",
              faculty: faculty || "\u2014",
              status,
              actionUrl: actionEl?.getAttribute?.("href") || null,
              rowElement: row
            });
          }
        }
        if (courses.length > 0) {
          return {
            available: true,
            courses,
            academicSession: extractSessionFromPage(doc)
          };
        }
      }
    }
    return { available: false, courses: [] };
  }
  function extractSessionFromPage(doc) {
    const text = doc.body?.textContent || "";
    const match = text.match(/(?:academic\s+session|session)\s*[:\-]\s*([a-z0-9\-\s/]+)/i);
    return match ? match[1].trim() : "Current Academic Session";
  }
  function cleanMetaValue(val) {
    return val.replace(/^[:\-]\s*/, "").replace(/\s+/g, " ").trim();
  }
  function isVisible(el) {
    if (!el) return false;
    return !(el.offsetWidth === 0 && el.offsetHeight === 0) && window.getComputedStyle(el).display !== "none";
  }

  // src/feedback/detection/question-parser.js
  function parseQuestionnaire(doc = document) {
    const sections = [];
    const allQuestions = [];
    const processedElements = /* @__PURE__ */ new Set();
    const processedControls = /* @__PURE__ */ new Set();
    const seenQuestionTexts = /* @__PURE__ */ new Set();
    const tables = Array.from(doc.querySelectorAll("table"));
    for (let tIdx = 0; tIdx < tables.length; tIdx++) {
      const table = tables[tIdx];
      const hasControls = Boolean(
        table.querySelector('input[type="radio"]') || table.querySelector("select") || table.querySelector("textarea") || table.querySelector("button, .btn, label.btn")
      );
      if (!hasControls) continue;
      const nestedTablesWithControls = Array.from(table.querySelectorAll("table")).filter(
        (t) => t.querySelector('input[type="radio"], select, textarea, button, .btn')
      );
      if (nestedTablesWithControls.length > 0) continue;
      let currentSectionTitle = findPrecedingSectionHeading(table) || `Questionnaire Section ${sections.length + 1}`;
      const tableHeaders = extractTableHeaders(table);
      const rows = Array.from(table.rows);
      let sectionQuestions = [];
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const row = rows[rIdx];
        if (processedElements.has(row)) continue;
        if (isSectionHeaderRow(row)) {
          if (sectionQuestions.length > 0) {
            sections.push({ title: currentSectionTitle, questions: sectionQuestions });
            sectionQuestions = [];
          }
          const extractedTitle = extractSectionTitle(row);
          if (extractedTitle) currentSectionTitle = extractedTitle;
          continue;
        }
        const question = parseQuestionRow(
          row,
          allQuestions.length,
          currentSectionTitle,
          tableHeaders
        );
        if (question) {
          const dedupKey = `${question.sectionTitle}::${question.questionText}`.toLowerCase();
          if (!seenQuestionTexts.has(dedupKey)) {
            seenQuestionTexts.add(dedupKey);
            processedElements.add(row);
            row.querySelectorAll("input, select, textarea").forEach((el) => processedControls.add(el));
            sectionQuestions.push(question);
            allQuestions.push(question);
          }
        }
      }
      if (sectionQuestions.length > 0) {
        sections.push({ title: currentSectionTitle, questions: sectionQuestions });
      }
    }
    const containers = Array.from(
      doc.querySelectorAll(
        ".kt-portlet, .card, .panel, .form-group, .question-card, .feedback-item"
      )
    );
    let currentContainerSectionTitle = "Feedback Questions";
    let containerQuestions = [];
    containers.forEach((container, idx) => {
      if (container.querySelector("table")) return;
      if (container.closest("table") && processedElements.has(container.closest("table"))) {
        return;
      }
      if (processedElements.has(container)) return;
      const containerInputs = Array.from(container.querySelectorAll("input, select, textarea"));
      if (containerInputs.some((el) => processedControls.has(el))) return;
      const headingEl = container.querySelector(
        ".kt-portlet__head-title, .panel-title, .card-header, h3, h4, h5, .section-title"
      );
      if (headingEl && headingEl.textContent.trim().length > 3) {
        const hText = headingEl.textContent.trim();
        if (!hText.toLowerCase().includes("feedback form")) {
          if (containerQuestions.length > 0) {
            sections.push({ title: currentContainerSectionTitle, questions: containerQuestions });
            containerQuestions = [];
          }
          currentContainerSectionTitle = cleanSectionTitle(hText);
        }
      }
      const q = parseQuestionContainer(
        container,
        allQuestions.length,
        currentContainerSectionTitle
      );
      if (q) {
        const dedupKey = `${q.sectionTitle}::${q.questionText}`.toLowerCase();
        if (!seenQuestionTexts.has(dedupKey)) {
          seenQuestionTexts.add(dedupKey);
          processedElements.add(container);
          containerInputs.forEach((el) => processedControls.add(el));
          containerQuestions.push(q);
          allQuestions.push(q);
        }
      }
    });
    if (containerQuestions.length > 0) {
      sections.push({ title: currentContainerSectionTitle, questions: containerQuestions });
    }
    const commentsQuestion = findStandaloneCommentsField(doc, allQuestions);
    if (commentsQuestion) {
      allQuestions.push(commentsQuestion);
      sections.push({
        title: "Comments & Suggestions",
        questions: [commentsQuestion]
      });
    }
    try {
      if (typeof window !== "undefined") {
        window.__mujx_questionnaire = allQuestions;
      }
    } catch (_) {
    }
    return {
      sections,
      questions: allQuestions,
      totalQuestions: allQuestions.length,
      mandatoryQuestions: allQuestions.filter((q) => q.isMandatory)
    };
  }
  function extractTableHeaders(table) {
    const headerRow = table.querySelector("thead tr") || Array.from(table.rows).find((r) => r.querySelectorAll("th").length > 0) || table.rows[0];
    if (!headerRow) return [];
    return Array.from(headerRow.cells).map(
      (cell) => (cell.textContent || "").trim().toLowerCase()
    );
  }
  function findPrecedingSectionHeading(table) {
    if (!table) return null;
    const caption = table.querySelector("caption");
    if (caption && caption.textContent.trim().length > 3) {
      return cleanSectionTitle(caption.textContent);
    }
    let prev = table.previousElementSibling;
    while (prev) {
      if (/^H[1-6]$/i.test(prev.tagName) || prev.matches?.(
        ".section-title, .kt-portlet__head-title, .panel-title, .card-title, .card-header, legend"
      )) {
        const txt = (prev.textContent || "").trim();
        if (txt.length >= 3 && !txt.toLowerCase().includes("feedback form") && !txt.toLowerCase().includes("student details")) {
          return cleanSectionTitle(txt);
        }
      }
      const inner = prev.querySelector?.(
        "h1, h2, h3, h4, h5, h6, .card-title, .kt-portlet__head-title, .section-title, strong"
      );
      if (inner) {
        const txt = (inner.textContent || "").trim();
        if (txt.length >= 3 && !txt.toLowerCase().includes("feedback form") && !txt.toLowerCase().includes("student details")) {
          return cleanSectionTitle(txt);
        }
      }
      prev = prev.previousElementSibling;
    }
    const parentRow = table.closest("tr");
    if (parentRow && parentRow.previousElementSibling) {
      const prevRowText = (parentRow.previousElementSibling.textContent || "").trim();
      if (prevRowText.length >= 3 && !prevRowText.toLowerCase().includes("feedback form") && !prevRowText.toLowerCase().includes("student details")) {
        return cleanSectionTitle(prevRowText);
      }
    }
    const parentCard = table.closest(".card, .kt-portlet, .panel, .box, fieldset");
    if (parentCard) {
      const head = parentCard.querySelector(
        ".card-header, .kt-portlet__head, .panel-heading, legend, h3, h4, h5"
      );
      if (head) {
        const txt = (head.textContent || "").trim();
        if (txt.length >= 3 && !txt.toLowerCase().includes("feedback form") && !txt.toLowerCase().includes("student details")) {
          return cleanSectionTitle(txt);
        }
      }
    }
    return null;
  }
  function isSectionHeaderRow(row) {
    if (!row.cells || row.cells.length === 0) return false;
    if (row.cells.length === 1 && (row.cells[0].colSpan > 1 || row.cells[0].tagName === "TH")) {
      return true;
    }
    const th = row.querySelector("th");
    if (th && th.colSpan > 1) return true;
    const bg = (row.style?.background || row.className || "").toLowerCase();
    if (bg.includes("header") || bg.includes("title") || bg.includes("primary") || bg.includes("info") || bg.includes("section")) {
      if (!row.querySelector('input[type="radio"], select, textarea')) {
        return true;
      }
    }
    if (!row.querySelector('input[type="radio"], select, textarea, button, .btn')) {
      const text = (row.textContent || "").trim();
      if (text.length > 4 && text.length < 130 && (row.querySelector("strong, b") || row.cells.length <= 2)) {
        return true;
      }
    }
    return false;
  }
  function extractSectionTitle(row) {
    const text = (row.textContent || "").trim();
    return cleanSectionTitle(text);
  }
  function cleanSectionTitle(title) {
    return title.replace(/^(\d+[\.\)]|section\s+\d+[:\-]|\*)\s*/i, "").replace(/\s+/g, " ").trim();
  }
  function parseQuestionRow(row, index, sectionTitle, tableHeaders = []) {
    const cells = Array.from(row.cells || []);
    if (cells.length < 1) return null;
    if (row.querySelector("table")) return null;
    const hasInputs = Boolean(row.querySelector("input, select, textarea, button, .btn"));
    if (row.querySelectorAll("th").length === cells.length && !hasInputs) {
      return null;
    }
    let rawQuestionText = "";
    const qLabel = row.querySelector("label:not(.btn)");
    if (qLabel && !qLabel.querySelector("select, input, button") && qLabel.textContent.trim().length > 3) {
      rawQuestionText = qLabel.textContent.trim();
    } else if (cells.length >= 3 && /^\s*(\d+|[a-z])[\.\)]?\s*$/i.test(cells[0].textContent.trim())) {
      const textCell = cells[1];
      rawQuestionText = (textCell.textContent || "").trim();
    } else if (cells.length >= 2) {
      rawQuestionText = (cells[0].textContent || "").trim();
    } else if (cells.length === 1) {
      if (row.querySelector("select")) {
        rawQuestionText = sectionTitle;
      } else {
        try {
          const cloned = cells[0].cloneNode(true);
          cloned.querySelectorAll("label.btn, button, input, select, textarea, script, style").forEach((el) => el.remove());
          rawQuestionText = cloned.textContent.trim() || cells[0].textContent.trim();
        } catch (_) {
          rawQuestionText = cells[0].textContent.trim();
        }
      }
    }
    if (!rawQuestionText || rawQuestionText.length < 3) return null;
    const lower = rawQuestionText.toLowerCase();
    if (lower === "questions" || lower === "parameters" || lower === "sr. no." || lower === "s.no." || lower === "particulars" || lower === "description" || lower === "sl.no.") {
      return null;
    }
    const cleanText = cleanQuestionText(rawQuestionText);
    const isMandatory = rawQuestionText.includes("*") || row.querySelector(".required, [required]") !== null;
    const radios = Array.from(row.querySelectorAll('input[type="radio"]'));
    if (radios.length === 2) {
      const pair = identifyYesNoRadios(radios, row, tableHeaders);
      if (pair.yesRadio && pair.noRadio) {
        const isYesChecked = pair.yesRadio.checked || isButtonActive(pair.yesElement);
        const isNoChecked = pair.noRadio.checked || isButtonActive(pair.noElement);
        const isAnswered = isYesChecked || isNoChecked;
        const currentValue = isYesChecked ? "YES" : isNoChecked ? "NO" : null;
        return {
          id: pair.yesRadio.name || pair.yesRadio.id || `q_row_${index}`,
          index,
          sectionTitle,
          questionText: cleanText,
          rawText: rawQuestionText,
          type: "yes_no",
          isMandatory,
          isAnswered,
          currentValue,
          element: row,
          controls: {
            type: "yes_no",
            yesElement: pair.yesElement,
            yesRadio: pair.yesRadio,
            yesLabel: pair.yesLabel,
            noElement: pair.noElement,
            noRadio: pair.noRadio,
            noLabel: pair.noLabel
          }
        };
      }
    }
    if (radios.length >= 3) {
      const radioItems = radios.map((r, i) => {
        const label = findRadioLabel(r, row) || String(i + 1);
        return {
          element: r,
          label,
          value: r.value || label,
          isChecked: r.checked
        };
      });
      const checked = radioItems.find((r) => r.isChecked);
      return {
        id: radios[0].name || `q_row_${index}`,
        index,
        sectionTitle,
        questionText: cleanText,
        rawText: rawQuestionText,
        type: "rating",
        isMandatory,
        isAnswered: Boolean(checked),
        currentValue: checked ? checked.label : null,
        element: row,
        controls: {
          type: "rating",
          options: radioItems
        }
      };
    }
    const select = row.querySelector("select");
    if (select) {
      const options = Array.from(select.options).map((opt) => ({
        text: opt.textContent.trim(),
        value: opt.value,
        isSelected: opt.selected
      }));
      const validOptions = options.filter(
        (o) => o.value !== "" && !o.text.startsWith("--") && !o.text.toLowerCase().includes("select") && !o.text.toLowerCase().includes("choose")
      );
      const isAnswered = select.value !== "" && !select.options[select.selectedIndex]?.text.startsWith("--") && !select.options[select.selectedIndex]?.text.toLowerCase().includes("select");
      return {
        id: select.name || select.id || `q_row_${index}`,
        index,
        sectionTitle,
        questionText: cleanText,
        rawText: rawQuestionText,
        type: "dropdown",
        isMandatory,
        isAnswered,
        currentValue: isAnswered ? select.options[select.selectedIndex]?.text : null,
        element: row,
        controls: {
          type: "dropdown",
          selectElement: select,
          options: validOptions
        }
      };
    }
    const textarea = row.querySelector("textarea");
    if (textarea) {
      const isAnswered = textarea.value.trim().length > 0;
      return {
        id: textarea.name || textarea.id || `q_row_${index}`,
        index,
        sectionTitle,
        questionText: cleanText || "Comments / Suggestions",
        rawText: rawQuestionText,
        type: "comment",
        isMandatory,
        isAnswered,
        currentValue: textarea.value.trim(),
        element: row,
        controls: {
          type: "comment",
          textareaElement: textarea
        }
      };
    }
    const buttons = Array.from(
      row.querySelectorAll("button, .btn, label.btn, a.btn, input[type='button']")
    );
    if (buttons.length === 2) {
      const { yesBtn, noBtn } = identifyYesNoButtons(buttons, row, tableHeaders);
      if (yesBtn && noBtn) {
        const isYesActive = isButtonActive(yesBtn);
        const isNoActive = isButtonActive(noBtn);
        const isAnswered = isYesActive || isNoActive;
        const currentValue = isYesActive ? "YES" : isNoActive ? "NO" : null;
        return {
          id: yesBtn.id || yesBtn.name || `q_btn_${index}`,
          index,
          sectionTitle,
          questionText: cleanText,
          rawText: rawQuestionText,
          type: "yes_no",
          isMandatory,
          isAnswered,
          currentValue,
          element: row,
          controls: {
            type: "yes_no",
            yesElement: yesBtn,
            yesRadio: yesBtn.querySelector?.('input[type="radio"]') || null,
            yesLabel: yesBtn.tagName === "LABEL" ? yesBtn : null,
            noElement: noBtn,
            noRadio: noBtn.querySelector?.('input[type="radio"]') || null,
            noLabel: noBtn.tagName === "LABEL" ? noBtn : null
          }
        };
      }
    }
    return null;
  }
  function parseQuestionContainer(container, index, sectionTitle) {
    const labelEl = container.querySelector(
      "label, .question-text, .control-label, .card-title, strong"
    );
    if (!labelEl) return null;
    const rawText = labelEl.textContent.trim();
    if (rawText.length < 3) return null;
    const cleanText = cleanQuestionText(rawText);
    const isMandatory = rawText.includes("*") || container.querySelector(".required, [required]") !== null;
    const radios = Array.from(container.querySelectorAll('input[type="radio"]'));
    if (radios.length === 2) {
      const pair = identifyYesNoRadios(radios, container);
      if (pair.yesRadio && pair.noRadio) {
        const isYesChecked = pair.yesRadio.checked || isButtonActive(pair.yesElement);
        const isNoChecked = pair.noRadio.checked || isButtonActive(pair.noElement);
        const isAnswered = isYesChecked || isNoChecked;
        const currentValue = isYesChecked ? "YES" : isNoChecked ? "NO" : null;
        return {
          id: pair.yesRadio.name || pair.yesRadio.id || `q_card_${index}`,
          index,
          sectionTitle,
          questionText: cleanText,
          rawText,
          type: "yes_no",
          isMandatory,
          isAnswered,
          currentValue,
          element: container,
          controls: {
            type: "yes_no",
            yesElement: pair.yesElement,
            yesRadio: pair.yesRadio,
            yesLabel: pair.yesLabel,
            noElement: pair.noElement,
            noRadio: pair.noRadio,
            noLabel: pair.noLabel
          }
        };
      }
    }
    const buttons = Array.from(
      container.querySelectorAll("button, .btn, label.btn, a.btn, input[type='button']")
    );
    if (buttons.length === 2 && radios.length === 0) {
      const { yesBtn, noBtn } = identifyYesNoButtons(buttons, container);
      if (yesBtn && noBtn) {
        const isYesActive = isButtonActive(yesBtn);
        const isNoActive = isButtonActive(noBtn);
        const isAnswered = isYesActive || isNoActive;
        const currentValue = isYesActive ? "YES" : isNoActive ? "NO" : null;
        return {
          id: yesBtn.id || yesBtn.name || `q_card_btn_${index}`,
          index,
          sectionTitle,
          questionText: cleanText,
          rawText,
          type: "yes_no",
          isMandatory,
          isAnswered,
          currentValue,
          element: container,
          controls: {
            type: "yes_no",
            yesElement: yesBtn,
            yesRadio: null,
            yesLabel: yesBtn.tagName === "LABEL" ? yesBtn : null,
            noElement: noBtn,
            noRadio: null,
            noLabel: noBtn.tagName === "LABEL" ? noBtn : null
          }
        };
      }
    }
    const select = container.querySelector("select");
    if (select) {
      const options = Array.from(select.options).filter(
        (o) => o.value !== "" && !o.text.startsWith("--") && !o.text.toLowerCase().includes("select") && !o.text.toLowerCase().includes("choose")
      );
      const isAnswered = select.value !== "" && !select.options[select.selectedIndex]?.text.startsWith("--");
      return {
        id: select.name || select.id || `q_card_${index}`,
        index,
        sectionTitle,
        questionText: cleanText,
        rawText,
        type: "dropdown",
        isMandatory,
        isAnswered,
        currentValue: isAnswered ? select.options[select.selectedIndex]?.text : null,
        element: container,
        controls: {
          type: "dropdown",
          selectElement: select,
          options
        }
      };
    }
    const textarea = container.querySelector("textarea");
    if (textarea) {
      return {
        id: textarea.name || textarea.id || `q_card_${index}`,
        index,
        sectionTitle,
        questionText: cleanText,
        rawText,
        type: "comment",
        isMandatory,
        isAnswered: textarea.value.trim().length > 0,
        currentValue: textarea.value.trim(),
        element: container,
        controls: {
          type: "comment",
          textareaElement: textarea
        }
      };
    }
    return null;
  }
  function findStandaloneCommentsField(doc, existingQuestions) {
    const existingTextareas = new Set(
      existingQuestions.filter((q) => q.type === "comment").map((q) => q.controls.textareaElement)
    );
    const textareas = doc.querySelectorAll("textarea");
    for (const ta of textareas) {
      if (existingTextareas.has(ta)) continue;
      const nameOrId = (ta.name || ta.id || ta.placeholder || "").toLowerCase();
      const parentText = (ta.closest(".form-group, td, div")?.textContent || "").toLowerCase();
      if (nameOrId.includes("comment") || nameOrId.includes("suggestion") || nameOrId.includes("feedback") || nameOrId.includes("remark") || parentText.includes("comment") || parentText.includes("suggestion") || parentText.includes("remark")) {
        return {
          id: ta.name || ta.id || "feedback_comments",
          index: existingQuestions.length,
          sectionTitle: "Comments & Suggestions",
          questionText: "Any other suggestions / comments for course improvement",
          rawText: "Comments",
          type: "comment",
          isMandatory: false,
          isAnswered: ta.value.trim().length > 0,
          currentValue: ta.value.trim(),
          element: ta.closest(".form-group, tr, div") || ta,
          controls: {
            type: "comment",
            textareaElement: ta
          }
        };
      }
    }
    return null;
  }
  function identifyYesNoRadios(radios, container, tableHeaders = []) {
    let yesRadio = null;
    let noRadio = null;
    radios.forEach((r) => {
      const val = (r.value || "").trim().toLowerCase();
      const label = (findRadioLabel(r, container) || "").toLowerCase();
      const cell = r.closest?.("td, th");
      const cellIdx = cell ? cell.cellIndex : -1;
      const headerText = cellIdx >= 0 && tableHeaders[cellIdx] ? tableHeaders[cellIdx] : "";
      const cellText = (cell?.textContent || "").toLowerCase();
      const hasYesCheck = Boolean(r.classList?.contains?.("yescheck"));
      const isYes = hasYesCheck || val === "yes" || val === "y" || val === "1" || val === "true" || label.includes("yes") || label === "y" || headerText.includes("yes") || cellText.includes("yes");
      const isNo = !hasYesCheck && radios.some((x) => x.classList?.contains?.("yescheck")) || val === "no" || val === "n" || val === "0" || val === "false" || label.includes("no") || label === "n" || headerText.includes("no") || cellText.includes("no");
      if (isYes && !isNo) {
        yesRadio = r;
      } else if (isNo && !isYes) {
        noRadio = r;
      }
    });
    if (!yesRadio || !noRadio) {
      if (!yesRadio && !noRadio) {
        yesRadio = radios[0];
        noRadio = radios[1];
      } else if (yesRadio && !noRadio) {
        noRadio = radios.find((r) => r !== yesRadio) || null;
      } else if (noRadio && !yesRadio) {
        yesRadio = radios.find((r) => r !== noRadio) || null;
      }
    }
    const yesLabel = yesRadio ? yesRadio.closest?.("label") || (yesRadio.id && container.querySelector ? container.querySelector(`label[for="${yesRadio.id}"]`) : null) : null;
    const noLabel = noRadio ? noRadio.closest?.("label") || (noRadio.id && container.querySelector ? container.querySelector(`label[for="${noRadio.id}"]`) : null) : null;
    return {
      yesRadio,
      noRadio,
      yesLabel,
      noLabel,
      yesElement: yesLabel || yesRadio,
      noElement: noLabel || noRadio
    };
  }
  function identifyYesNoButtons(buttons, container, tableHeaders = []) {
    let yesBtn = null;
    let noBtn = null;
    buttons.forEach((b) => {
      const text = (b.textContent || b.value || b.getAttribute?.("aria-label") || "").trim().toLowerCase();
      const cell = b.closest?.("td, th");
      const cellIdx = cell ? cell.cellIndex : -1;
      const headerText = cellIdx >= 0 && tableHeaders[cellIdx] ? tableHeaders[cellIdx] : "";
      const isYes = text === "yes" || text.startsWith("yes") || text === "y" || text.includes("agree") || b.classList?.contains("btn-success") || b.classList?.contains("yes-btn") || headerText.includes("yes");
      const isNo = text === "no" || text.startsWith("no") || text === "n" || text.includes("disagree") || b.classList?.contains("btn-danger") || b.classList?.contains("no-btn") || headerText.includes("no");
      if (isYes && !isNo) {
        yesBtn = b;
      } else if (isNo && !isYes) {
        noBtn = b;
      }
    });
    if (!yesBtn || !noBtn) {
      if (!yesBtn && !noBtn && buttons.length >= 2) {
        yesBtn = buttons[0];
        noBtn = buttons[1];
      } else if (yesBtn && !noBtn) {
        noBtn = buttons.find((b) => b !== yesBtn) || null;
      } else if (noBtn && !yesBtn) {
        yesBtn = buttons.find((b) => b !== noBtn) || null;
      }
    }
    return { yesBtn, noBtn };
  }
  function findRadioLabel(radio, container) {
    if (radio.id && container && typeof container.querySelector === "function") {
      const lbl = container.querySelector(`label[for="${radio.id}"]`);
      if (lbl) return (lbl.textContent || "").trim();
    }
    try {
      const parentLabel = typeof radio.closest === "function" ? radio.closest("label") : null;
      if (parentLabel && (parentLabel.tagName === "LABEL" || parentLabel.classList?.contains?.("btn"))) {
        return (parentLabel.textContent || "").trim();
      }
    } catch (_) {
    }
    const next = radio.nextSibling;
    if (next && (next.nodeType === 3 || next.nodeType === 1)) {
      return (next.textContent || "").trim();
    }
    return null;
  }
  function isButtonActive(btn) {
    if (!btn) return false;
    if (btn.tagName === "INPUT" && (btn.type === "radio" || btn.type === "checkbox")) {
      return btn.checked;
    }
    const hasClass = (c) => {
      try {
        if (typeof btn.classList?.contains === "function") return btn.classList.contains(c);
      } catch (_) {
      }
      const cls = (btn.className || "").toLowerCase();
      return cls.includes(c);
    };
    const ariaPressed = btn.getAttribute?.("aria-pressed");
    const ariaChecked = btn.getAttribute?.("aria-checked");
    const nestedChecked = Boolean(btn.querySelector?.('input[type="radio"]:checked'));
    return hasClass("active") || hasClass("selected") || hasClass("checked") || hasClass("btn-success") && !hasClass("outline") && !hasClass("btn-outline-success") || hasClass("btn-danger") && !hasClass("outline") && !hasClass("btn-outline-danger") || hasClass("btn-primary") && !hasClass("outline") && !hasClass("btn-outline-primary") || ariaPressed === "true" || ariaChecked === "true" || nestedChecked;
  }
  function cleanQuestionText(text) {
    return text.replace(/^(\d+[\.\)]|[a-z][\.\)]|q\d+[:\-]|question\s*\d+[:\-]|parameter\s*\d+[:\-])\s*/i, "").replace(/\*/g, "").replace(/\s+/g, " ").trim();
  }

  // src/feedback/engine/answer-matcher.js
  function normalizeQuestionText(text) {
    if (!text) return "";
    return text.trim().toLowerCase().replace(/^(\(?\d+[\.\)]|\(?[a-z0-9]+\)[\.\)]?|q\d+[:\-]|question\s*\d+[:\-]|parameter\s*\d+[:\-])\s*/i, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();
  }
  function matchAnswer(question, preferences = {}) {
    const normQ = normalizeQuestionText(question.questionText);
    const overrides = preferences.overrides || {};
    for (const [rawKey, overrideVal] of Object.entries(overrides)) {
      const normKey = normalizeQuestionText(rawKey);
      if (normKey === normQ || normKey.length > 8 && (normQ.includes(normKey) || normKey.includes(normQ))) {
        return {
          targetValue: overrideVal,
          confidence: "high",
          isOverridden: true,
          reason: `Matched custom override for "${rawKey}"`
        };
      }
    }
    if (question.type === "yes_no") {
      const defaultAnswer = (preferences.defaultYesNo || "YES").toUpperCase();
      return {
        targetValue: defaultAnswer === "NO" ? "NO" : "YES",
        confidence: "high",
        isOverridden: false,
        reason: "Global default YES/NO preference"
      };
    }
    if (question.type === "dropdown") {
      const options = question.controls?.options || [];
      const strategy = preferences.defaultDropdownStrategy || "highest_positive";
      const customValue = preferences.defaultDropdownValue;
      if (customValue) {
        const exactMatch = options.find(
          (o) => o.text.toLowerCase() === customValue.toLowerCase() || o.value === customValue
        );
        if (exactMatch) {
          return {
            targetValue: exactMatch.value,
            matchedOption: exactMatch,
            confidence: "high",
            isOverridden: false,
            reason: `Matched custom dropdown preference "${customValue}"`
          };
        }
      }
      const scoredOption = pickBestDropdownOption(options, strategy);
      if (scoredOption) {
        return {
          targetValue: scoredOption.value,
          matchedOption: scoredOption,
          confidence: "high",
          isOverridden: false,
          reason: "Highest positive agreement strategy"
        };
      }
      return {
        targetValue: options[0]?.value || null,
        matchedOption: options[0] || null,
        confidence: "medium",
        isOverridden: false,
        reason: "First available option fallback"
      };
    }
    if (question.type === "rating") {
      const options = question.controls?.options || [];
      let bestOption = options[options.length - 1];
      for (const opt of options) {
        const num = parseInt(opt.label || opt.value, 10);
        if (num === 5) {
          bestOption = opt;
          break;
        }
      }
      return {
        targetValue: bestOption?.value || "5",
        matchedOption: bestOption,
        confidence: "high",
        isOverridden: false,
        reason: "Highest rating scale preference"
      };
    }
    if (question.type === "comment") {
      if (preferences.fillComments === false) {
        return {
          targetValue: "",
          confidence: "high",
          isOverridden: false,
          reason: "Comments disabled in preferences"
        };
      }
      const defaultComment = preferences.defaultComment || "The course was well structured and classes were conducted regularly with clear explanations.";
      return {
        targetValue: defaultComment,
        confidence: "high",
        isOverridden: false,
        reason: "Default constructive comment"
      };
    }
    return {
      targetValue: null,
      confidence: "low",
      isOverridden: false,
      reason: "Unknown question type"
    };
  }
  function pickBestDropdownOption(options, strategy = "highest_positive") {
    if (!options || options.length === 0) return null;
    const positivityScores = [
      { patterns: ["strongly agree", "highly satisfied", "completely satisfied", "very high", "excellent"], score: 100 },
      { patterns: ["agree", "satisfied", "high", "good", "very good"], score: 80 },
      { patterns: ["neutral", "moderate", "average", "fair"], score: 50 },
      { patterns: ["disagree", "dissatisfied", "low", "poor"], score: 20 },
      { patterns: ["strongly disagree", "highly dissatisfied", "very low"], score: 0 }
    ];
    let bestOption = null;
    let maxScore = -1;
    for (const opt of options) {
      const text = (opt.text || "").toLowerCase().trim();
      if (!text || text.startsWith("--") || text.includes("select")) continue;
      const num = parseFloat(opt.value || text);
      if (!isNaN(num) && num >= 1 && num <= 10) {
        const score = num * 10;
        if (score > maxScore) {
          maxScore = score;
          bestOption = opt;
        }
        continue;
      }
      for (const rule of positivityScores) {
        if (rule.patterns.some((p) => text.includes(p))) {
          if (rule.score > maxScore) {
            maxScore = rule.score;
            bestOption = opt;
          }
          break;
        }
      }
    }
    return bestOption || options.find((o) => o.value !== "" && !o.text.startsWith("--")) || options[0];
  }

  // src/feedback/engine/form-validator.js
  function validateQuestionnaire(questions = []) {
    if (!questions || questions.length === 0) {
      return {
        total: 0,
        answeredCount: 0,
        answeredYesCount: 0,
        answeredNoCount: 0,
        unansweredCount: 0,
        failedCount: 0,
        completionPercentage: 0,
        unansweredList: [],
        failedList: [],
        isFullyAnswered: false,
        firstUnanswered: null,
        summary: "0 / 0 (0%)"
      };
    }
    const unansweredList = [];
    const failedList = [];
    let answeredCount = 0;
    let answeredYesCount = 0;
    let answeredNoCount = 0;
    for (const q of questions) {
      const check = checkQuestionState(q);
      q.isAnswered = check.isAnswered;
      q.currentValue = check.currentValue;
      q.status = check.status;
      q.verificationReason = check.reason || null;
      if (check.isAnswered) {
        answeredCount++;
        if (check.status === "answered_yes") answeredYesCount++;
        if (check.status === "answered_no") answeredNoCount++;
      } else {
        if (check.status === "failed") {
          failedList.push({ ...q, reason: check.reason });
        }
        if (q.isMandatory || q.type !== "comment") {
          unansweredList.push({
            ...q,
            reason: check.reason
          });
        }
      }
    }
    const total = questions.length;
    const unansweredCount = unansweredList.length;
    const failedCount = failedList.length;
    const completionPercentage = total > 0 ? Math.round(answeredCount / total * 100) : 0;
    const isFullyAnswered = unansweredCount === 0 && total > 0;
    return {
      total,
      answeredCount,
      answeredYesCount,
      answeredNoCount,
      unansweredCount,
      failedCount,
      completionPercentage,
      unansweredList,
      failedList,
      isFullyAnswered,
      firstUnanswered: unansweredList[0] || failedList[0] || null,
      summary: `${answeredCount} / ${total} (${completionPercentage}%)`
    };
  }
  function checkQuestionState(question) {
    if (!question) {
      return {
        isAnswered: false,
        status: "unmatched",
        currentValue: null,
        reason: "Question object is null or undefined"
      };
    }
    if (question.type === "yes_no") {
      const { yesElement, yesRadio, yesLabel, noElement, noRadio, noLabel } = question.controls || {};
      const isYes = Boolean(yesRadio && yesRadio.checked) || isElementActive(yesElement) || isElementActive(yesLabel);
      const isNo = Boolean(noRadio && noRadio.checked) || isElementActive(noElement) || isElementActive(noLabel);
      if (isYes && !isNo) {
        return {
          isAnswered: true,
          status: "answered_yes",
          currentValue: "YES"
        };
      }
      if (isNo && !isYes) {
        return {
          isAnswered: true,
          status: "answered_no",
          currentValue: "NO"
        };
      }
      if (isYes && isNo) {
        if (yesRadio && yesRadio.checked && (!noRadio || !noRadio.checked)) {
          return { isAnswered: true, status: "answered_yes", currentValue: "YES" };
        }
        if (noRadio && noRadio.checked && (!yesRadio || !yesRadio.checked)) {
          return { isAnswered: true, status: "answered_no", currentValue: "NO" };
        }
        return {
          isAnswered: true,
          status: "answered_yes",
          currentValue: "YES",
          reason: "Both YES and NO controls flagged active; defaulted to YES"
        };
      }
      return {
        isAnswered: false,
        status: "unanswered",
        currentValue: null,
        reason: "Neither YES nor NO selected"
      };
    }
    if (question.type === "dropdown") {
      const select = question.controls?.selectElement;
      if (!select) {
        return {
          isAnswered: false,
          status: "failed",
          currentValue: null,
          reason: "Select DOM element missing"
        };
      }
      const val = (select.value || "").trim();
      const selectedOpt = select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
      const text = (selectedOpt?.textContent || "").trim();
      if (val !== "" && !text.startsWith("--") && !text.toLowerCase().includes("select") && !text.toLowerCase().includes("choose")) {
        return {
          isAnswered: true,
          status: "answered",
          currentValue: text || val
        };
      }
      return {
        isAnswered: false,
        status: "unanswered",
        currentValue: null,
        reason: "No valid dropdown option chosen"
      };
    }
    if (question.type === "rating") {
      const options = question.controls?.options || [];
      const checked = options.find(
        (o) => o.element && (o.element.checked || isElementActive(o.element))
      );
      if (checked) {
        return {
          isAnswered: true,
          status: "answered",
          currentValue: checked.label || checked.value
        };
      }
      return {
        isAnswered: false,
        status: "unanswered",
        currentValue: null,
        reason: "No rating score selected"
      };
    }
    if (question.type === "comment") {
      const ta = question.controls?.textareaElement;
      if (!ta) {
        return { isAnswered: false, status: "unmatched", currentValue: "" };
      }
      const val = (ta.value || "").trim();
      if (val.length > 0) {
        return {
          isAnswered: true,
          status: "answered",
          currentValue: val
        };
      }
      if (question.isMandatory) {
        return {
          isAnswered: false,
          status: "unanswered",
          currentValue: "",
          reason: "Mandatory comment field is empty"
        };
      }
      return {
        isAnswered: false,
        status: "unanswered",
        isOptional: true,
        currentValue: "",
        reason: "Optional comment not provided"
      };
    }
    return {
      isAnswered: false,
      status: "unmatched",
      currentValue: null,
      reason: "Unknown question structure"
    };
  }
  function isElementActive(el) {
    if (!el) return false;
    if (el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox")) {
      return el.checked;
    }
    const hasClass = (c) => {
      try {
        if (typeof el.classList?.contains === "function") return el.classList.contains(c);
      } catch (_) {
      }
      const cls = (el.className || "").toLowerCase();
      return cls.includes(c);
    };
    const ariaPressed = el.getAttribute?.("aria-pressed");
    const ariaChecked = el.getAttribute?.("aria-checked");
    const nestedChecked = Boolean(
      el.querySelector?.('input[type="radio"]:checked, input[type="checkbox"]:checked')
    );
    return hasClass("active") || hasClass("selected") || hasClass("checked") || hasClass("btn-success") && !hasClass("outline") && !hasClass("btn-outline-success") || hasClass("btn-danger") && !hasClass("outline") && !hasClass("btn-outline-danger") || hasClass("btn-primary") && !hasClass("outline") && !hasClass("btn-outline-primary") || ariaPressed === "true" || ariaChecked === "true" || nestedChecked;
  }
  function scrollToQuestion(question) {
    if (!question?.element) return;
    const el = question.element;
    try {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    } catch (_) {
      try {
        el.scrollIntoView();
      } catch (_2) {
      }
    }
    el.classList.add("mujx-highlight-unanswered");
    setTimeout(() => {
      el.classList.remove("mujx-highlight-unanswered");
    }, 2800);
    const focusable = el.querySelector("input, select, textarea, button");
    if (focusable) {
      try {
        focusable.focus({ preventScroll: true });
      } catch (_) {
      }
    }
  }

  // src/feedback/engine/form-filler.js
  async function fillEntireForm({
    questions = [],
    preferences = {},
    onProgress = null
  } = {}) {
    const results = {
      total: questions.length,
      filled: 0,
      preserved: 0,
      alreadySelected: 0,
      failed: 0,
      details: []
    };
    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      try {
        const match = matchAnswer(q, preferences);
        const targetVal = match.targetValue;
        const currentCheck = checkQuestionState(q);
        if (currentCheck.isAnswered && normalizeAnswer(currentCheck.currentValue) === normalizeAnswer(targetVal)) {
          results.preserved++;
          results.alreadySelected++;
          q.isAnswered = true;
          q.currentValue = currentCheck.currentValue;
          q.status = currentCheck.status;
          results.details.push({
            questionId: q.id,
            questionText: q.questionText,
            status: "already_selected",
            value: q.currentValue,
            isOverridden: match.isOverridden
          });
          if (onProgress) onProgress(i + 1, questions.length);
          continue;
        }
        if (currentCheck.isAnswered && preferences.preserveExistingAnswers) {
          results.preserved++;
          q.isAnswered = true;
          q.currentValue = currentCheck.currentValue;
          q.status = currentCheck.status;
          results.details.push({
            questionId: q.id,
            questionText: q.questionText,
            status: "preserved",
            value: q.currentValue,
            isOverridden: false
          });
          if (onProgress) onProgress(i + 1, questions.length);
          continue;
        }
        let fillSuccess = false;
        if (q.type === "yes_no") {
          const isYes = (targetVal || "YES").toUpperCase() === "YES";
          const targetAnswer = isYes ? "YES" : "NO";
          fillSuccess = await fillYesNoQuestion(q, isYes);
          await sleep(25);
          let verifyCheck = checkQuestionState(q);
          if (!verifyCheck.isAnswered || normalizeAnswer(verifyCheck.currentValue) !== targetAnswer) {
            await retryActivateYesNo(q, isYes);
            await sleep(35);
            verifyCheck = checkQuestionState(q);
          }
          if (verifyCheck.isAnswered && normalizeAnswer(verifyCheck.currentValue) === targetAnswer) {
            q.isAnswered = true;
            q.currentValue = targetAnswer;
            q.status = verifyCheck.status;
            fillSuccess = true;
          } else {
            fillSuccess = false;
          }
        } else if (q.type === "dropdown") {
          const select = q.controls?.selectElement;
          if (select && targetVal !== null && targetVal !== void 0) {
            const isPositive = String(targetVal).toUpperCase().includes("YES") || String(targetVal).toUpperCase() === "Y" || targetVal === "highest_positive";
            let matchedOpt = null;
            if (isPositive) {
              matchedOpt = Array.from(select.options).find(
                (o) => o.value === "Y" || o.text.toLowerCase().includes("yes")
              );
            } else {
              matchedOpt = Array.from(select.options).find(
                (o) => o.value === "N" || o.text.toLowerCase().includes("no")
              );
            }
            if (!matchedOpt) {
              matchedOpt = Array.from(select.options).find(
                (o) => o.value === targetVal || o.text.trim().toLowerCase() === String(targetVal).trim().toLowerCase()
              ) || select.options[select.options.length - 1];
            }
            if (matchedOpt) {
              select.value = matchedOpt.value;
              select.selectedIndex = matchedOpt.index;
            }
            if (typeof select.onchange === "function") {
              try {
                select.onchange.call(select);
              } catch (_) {
              }
            }
            dispatchInputEvents(select);
            await sleep(20);
            const verifyCheck = checkQuestionState(q);
            if (verifyCheck.isAnswered) {
              q.isAnswered = true;
              q.currentValue = select.options[select.selectedIndex]?.text || targetVal;
              q.status = "answered";
              fillSuccess = true;
            }
          }
        } else if (q.type === "rating") {
          const options = q.controls?.options || [];
          const targetOpt = options.find((o) => o.value === targetVal) || options.find((o) => o.label === targetVal) || options[options.length - 1];
          if (targetOpt?.element) {
            fillSuccess = triggerGenericClick(targetOpt.element);
            await sleep(20);
            const verifyCheck = checkQuestionState(q);
            if (verifyCheck.isAnswered) {
              q.isAnswered = true;
              q.currentValue = targetOpt.label;
              q.status = "answered";
              fillSuccess = true;
            }
          }
        } else if (q.type === "comment") {
          const ta = q.controls?.textareaElement;
          if (ta) {
            const hasExisting = ta.value.trim().length > 0;
            if (hasExisting && preferences.preserveExistingComments) {
              results.preserved++;
              q.isAnswered = true;
              q.currentValue = ta.value.trim();
              q.status = "answered";
              fillSuccess = true;
            } else if (targetVal) {
              ta.value = targetVal;
              dispatchInputEvents(ta);
              await sleep(15);
              q.isAnswered = true;
              q.currentValue = targetVal;
              q.status = "answered";
              fillSuccess = true;
            } else {
              fillSuccess = true;
            }
          }
        }
        if (fillSuccess) {
          results.filled++;
          results.details.push({
            questionId: q.id,
            questionText: q.questionText,
            status: q.status || "filled",
            value: q.currentValue,
            isOverridden: match.isOverridden
          });
        } else {
          results.failed++;
          results.details.push({
            questionId: q.id,
            questionText: q.questionText,
            status: "failed",
            reason: "Unable to verify live selected state after interaction"
          });
        }
      } catch (err) {
        results.failed++;
        results.details.push({
          questionId: q.id,
          questionText: q.questionText,
          status: "error",
          error: String(err?.message || err)
        });
      }
      if (onProgress) {
        onProgress(i + 1, questions.length);
      }
    }
    return results;
  }
  async function fillYesNoQuestion(q, isYes) {
    const controls = q.controls || {};
    const targetEl = isYes ? controls.yesElement : controls.noElement;
    const targetRadio = isYes ? controls.yesRadio : controls.noRadio;
    const targetLabel = isYes ? controls.yesLabel : controls.noLabel;
    const oppositeEl = isYes ? controls.noElement : controls.yesElement;
    const oppositeRadio = isYes ? controls.noRadio : controls.yesRadio;
    const oppositeLabel = isYes ? controls.noLabel : controls.yesLabel;
    try {
      if (targetLabel && targetLabel !== targetRadio) {
        dispatchPointerAndMouseEvents(targetLabel);
        try {
          targetLabel.click();
        } catch (_) {
        }
        targetLabel.classList.add("active", "selected");
      }
      if (targetEl && targetEl !== targetRadio && targetEl !== targetLabel) {
        dispatchPointerAndMouseEvents(targetEl);
        try {
          targetEl.click();
        } catch (_) {
        }
        targetEl.classList.add("active", "selected");
      }
      if (targetRadio) {
        targetRadio.checked = true;
        dispatchPointerAndMouseEvents(targetRadio);
        try {
          targetRadio.click();
        } catch (_) {
        }
        if (typeof targetRadio.onchange === "function") {
          try {
            targetRadio.onchange.call(targetRadio, new Event("change", { bubbles: true }));
          } catch (_) {
          }
        }
        dispatchInputEvents(targetRadio);
      } else if (targetEl?.tagName === "INPUT" && targetEl.type === "radio") {
        targetEl.checked = true;
        dispatchPointerAndMouseEvents(targetEl);
        try {
          targetEl.click();
        } catch (_) {
        }
        if (typeof targetEl.onchange === "function") {
          try {
            targetEl.onchange.call(targetEl, new Event("change", { bubbles: true }));
          } catch (_) {
          }
        }
        dispatchInputEvents(targetEl);
      }
      if (oppositeRadio && oppositeRadio.checked) {
        oppositeRadio.checked = false;
        dispatchInputEvents(oppositeRadio);
      }
      if (oppositeLabel?.classList) {
        oppositeLabel.classList.remove("active", "selected");
      }
      if (oppositeEl?.classList) {
        oppositeEl.classList.remove("active", "selected");
      }
      triggerJQueryEvent(targetRadio || targetEl || targetLabel);
      return true;
    } catch (err) {
      return false;
    }
  }
  async function retryActivateYesNo(q, isYes) {
    const controls = q.controls || {};
    const targetRadio = isYes ? controls.yesRadio : controls.noRadio;
    const targetEl = isYes ? controls.yesElement : controls.noElement;
    const targetLabel = isYes ? controls.yesLabel : controls.noLabel;
    try {
      if (targetRadio) {
        targetRadio.checked = true;
        targetRadio.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        dispatchInputEvents(targetRadio);
      }
      if (targetEl && targetEl !== targetRadio) {
        targetEl.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        targetEl.classList.add("active", "selected");
      }
      if (targetLabel && targetLabel !== targetRadio && targetLabel !== targetEl) {
        targetLabel.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
        targetLabel.classList.add("active", "selected");
      }
      triggerJQueryEvent(targetRadio || targetEl);
    } catch (_) {
    }
  }
  function triggerGenericClick(element) {
    if (!element) return false;
    try {
      if (element.tagName === "INPUT" && element.type === "radio") {
        element.checked = true;
      }
      dispatchPointerAndMouseEvents(element);
      try {
        element.click();
      } catch (_) {
      }
      dispatchInputEvents(element);
      triggerJQueryEvent(element);
      return true;
    } catch (_) {
      return false;
    }
  }
  function dispatchPointerAndMouseEvents(element) {
    if (!element || typeof element.dispatchEvent !== "function") return;
    try {
      const opts = { bubbles: true, cancelable: true, view: window };
      if (typeof PointerEvent !== "undefined") {
        element.dispatchEvent(new PointerEvent("pointerdown", opts));
        element.dispatchEvent(new PointerEvent("pointerup", opts));
      }
      if (typeof MouseEvent !== "undefined") {
        element.dispatchEvent(new MouseEvent("mousedown", opts));
        element.dispatchEvent(new MouseEvent("mouseup", opts));
      }
    } catch (_) {
    }
  }
  function dispatchInputEvents(element) {
    if (!element || typeof element.dispatchEvent !== "function") return;
    try {
      element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
      element.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
    } catch (_) {
    }
  }
  function triggerJQueryEvent(element) {
    if (!element) return;
    if (typeof window !== "undefined" && window.jQuery) {
      try {
        window.jQuery(element).trigger("change").trigger("click");
      } catch (_) {
      }
    }
  }
  function normalizeAnswer(val) {
    if (!val) return "";
    const s = String(val).trim().toUpperCase();
    if (s === "YES" || s === "Y" || s === "1" || s === "TRUE") return "YES";
    if (s === "NO" || s === "N" || s === "0" || s === "FALSE") return "NO";
    return s;
  }
  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
  function resetCurrentForm(questions = []) {
    questions.forEach((q) => {
      try {
        if (q.type === "yes_no") {
          const { yesElement, yesRadio, yesLabel, noElement, noRadio, noLabel } = q.controls || {};
          if (yesRadio) {
            yesRadio.checked = false;
            dispatchInputEvents(yesRadio);
          }
          if (noRadio) {
            noRadio.checked = false;
            dispatchInputEvents(noRadio);
          }
          if (yesElement?.classList) {
            yesElement.classList.remove("active", "selected", "btn-success", "checked");
          }
          if (noElement?.classList) {
            noElement.classList.remove("active", "selected", "btn-danger", "checked");
          }
          if (yesLabel?.classList) {
            yesLabel.classList.remove("active", "selected");
          }
          if (noLabel?.classList) {
            noLabel.classList.remove("active", "selected");
          }
        } else if (q.type === "dropdown") {
          if (q.controls?.selectElement) {
            q.controls.selectElement.selectedIndex = 0;
            q.controls.selectElement.value = q.controls.selectElement.options?.[0]?.value || "";
            dispatchInputEvents(q.controls.selectElement);
          }
        } else if (q.type === "rating") {
          (q.controls?.options || []).forEach((o) => {
            if (o.element) {
              o.element.checked = false;
              o.element.classList?.remove("active", "selected");
              dispatchInputEvents(o.element);
            }
          });
        } else if (q.type === "comment") {
          if (q.controls?.textareaElement) {
            q.controls.textareaElement.value = "";
            dispatchInputEvents(q.controls.textareaElement);
          }
        }
        q.isAnswered = false;
        q.currentValue = null;
        q.status = "unanswered";
      } catch (_) {
      }
    });
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
      homePanel: true,
      feedbackAssistant: true
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
  var DEFAULT_FEEDBACK_PREFERENCES = Object.freeze({
    defaultYesNo: "YES",
    // "YES" or "NO"
    defaultDropdownStrategy: "highest_positive",
    // "highest_positive" (Strongly Agree / Agree / 5-star) or exact text
    defaultComment: "The course was well structured and classes were conducted regularly with clear explanations.",
    fillComments: true,
    preserveExistingComments: true,
    preserveExistingAnswers: false,
    overrides: {}
    // normalized question text -> answer ("YES", "NO", "Strongly Agree", etc.)
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
    feedback: "feedback",
    other: "other"
  });
  var STORAGE_KEYS = Object.freeze({
    preferences: "mujx.preferences",
    cache: "mujx.cache",
    notifications: "mujx.notifications",
    dismissed: "mujx.dismissed",
    timetableSnapshot: "mujx.timetableSnapshot",
    hubState: "mujx.hubState",
    feedbackPreferences: "mujx.feedbackPreferences",
    feedbackDrafts: "mujx.feedbackDrafts",
    feedbackTracker: "mujx.feedbackTracker"
  });

  // src/shared/logger.js
  var PREFIX = "[MUJX]";
  function logInfo(message, meta = {}) {
    console.info(PREFIX, message, sanitize(meta));
  }
  function logError(message, meta = {}) {
    console.error(PREFIX, message, sanitize(meta));
  }
  function sanitize(meta) {
    const allowed = {};
    for (const [key, value] of Object.entries(meta)) {
      if (["status", "path", "kind", "code", "timeout", "retry"].includes(key)) {
        allowed[key] = value;
      }
    }
    return allowed;
  }

  // src/feedback/storage/feedback-storage.js
  async function loadFeedbackPreferences() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const data = await chrome.storage.local.get(STORAGE_KEYS.feedbackPreferences);
        const stored = data?.[STORAGE_KEYS.feedbackPreferences];
        if (stored && typeof stored === "object") {
          return {
            ...DEFAULT_FEEDBACK_PREFERENCES,
            ...stored,
            overrides: {
              ...DEFAULT_FEEDBACK_PREFERENCES.overrides || {},
              ...stored.overrides || {}
            }
          };
        }
      }
    } catch (err) {
      logError("failed to load feedback preferences", err);
    }
    return { ...DEFAULT_FEEDBACK_PREFERENCES, overrides: { ...DEFAULT_FEEDBACK_PREFERENCES.overrides } };
  }
  async function saveFeedbackPreferences(prefs) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        await chrome.storage.local.set({
          [STORAGE_KEYS.feedbackPreferences]: prefs
        });
        logInfo("saved feedback preferences", prefs);
        return true;
      }
    } catch (err) {
      logError("failed to save feedback preferences", err);
    }
    return false;
  }
  async function resetFeedbackPreferences() {
    return saveFeedbackPreferences({ ...DEFAULT_FEEDBACK_PREFERENCES });
  }
  async function loadFeedbackDraft(courseKey, session = "current") {
    if (!courseKey) return null;
    const key = `${courseKey}_${session}`.toUpperCase();
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const data = await chrome.storage.local.get(STORAGE_KEYS.feedbackDrafts);
        const drafts = data?.[STORAGE_KEYS.feedbackDrafts] || {};
        return drafts[key] || null;
      }
    } catch (err) {
      logError("failed to load feedback draft", err);
    }
    return null;
  }
  async function saveFeedbackDraft(courseKey, session = "current", answers = {}) {
    if (!courseKey) return false;
    const key = `${courseKey}_${session}`.toUpperCase();
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const data = await chrome.storage.local.get(STORAGE_KEYS.feedbackDrafts);
        const drafts = data?.[STORAGE_KEYS.feedbackDrafts] || {};
        drafts[key] = {
          courseKey,
          session,
          answers,
          updatedAt: (/* @__PURE__ */ new Date()).toISOString()
        };
        await chrome.storage.local.set({ [STORAGE_KEYS.feedbackDrafts]: drafts });
        return true;
      }
    } catch (err) {
      logError("failed to save feedback draft", err);
    }
    return false;
  }
  async function loadFeedbackTracker() {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const data = await chrome.storage.local.get(STORAGE_KEYS.feedbackTracker);
        return data?.[STORAGE_KEYS.feedbackTracker] || { courses: [], lastUpdated: null };
      }
    } catch (err) {
      logError("failed to load feedback tracker", err);
    }
    return { courses: [], lastUpdated: null };
  }
  async function saveFeedbackTracker(tracker) {
    try {
      if (typeof chrome !== "undefined" && chrome.storage?.local) {
        const payload = {
          courses: tracker.courses || [],
          lastUpdated: (/* @__PURE__ */ new Date()).toISOString()
        };
        await chrome.storage.local.set({ [STORAGE_KEYS.feedbackTracker]: payload });
        return true;
      }
    } catch (err) {
      logError("failed to save feedback tracker", err);
    }
    return false;
  }
  async function updateCourseStatus(courseKey, status) {
    if (!courseKey) return;
    const tracker = await loadFeedbackTracker();
    const normKey = courseKey.trim().toUpperCase();
    let found = false;
    tracker.courses = tracker.courses.map((c) => {
      const cKey = (c.courseCode || c.courseName || "").trim().toUpperCase();
      if (cKey === normKey || c.id === normKey) {
        found = true;
        return { ...c, status, completedAt: status === "Completed" ? (/* @__PURE__ */ new Date()).toISOString() : c.completedAt };
      }
      return c;
    });
    if (!found) {
      tracker.courses.push({
        courseCode: courseKey,
        status,
        completedAt: status === "Completed" ? (/* @__PURE__ */ new Date()).toISOString() : null
      });
    }
    await saveFeedbackTracker(tracker);
  }

  // src/shared/dom.js
  function escapeHtml(value) {
    return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
  }

  // src/feedback/ui/feedback-preferences-modal.js
  async function openFeedbackPreferencesModal({ onSaved = null } = {}) {
    closeExistingModal();
    const currentPrefs = await loadFeedbackPreferences();
    const backdrop = document.createElement("div");
    backdrop.className = "mujx-modal-backdrop";
    backdrop.setAttribute(INJECT_ATTR, "feedback-prefs-modal");
    backdrop.innerHTML = `
    <div class="mujx-modal-card" role="dialog" aria-label="Feedback Preferences">
      <div class="mujx-modal-head">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">\u2699\uFE0F</span>
          <div>
            <h3 style="margin:0; font-size:15px; font-weight:700; color:var(--mujx-ink, #fff);">Feedback Preferences</h3>
            <span style="font-size:11px; opacity:0.75;">Configure one-click answer defaults &amp; question overrides</span>
          </div>
        </div>
        <button type="button" data-role="close-btn" class="mujx-modal-close" style="background:none; border:none; color:var(--mujx-muted, #94a3b8); font-size:16px; cursor:pointer; padding:4px 8px;">\u2715</button>
      </div>

      <div class="mujx-modal-body" style="max-height:65vh; overflow-y:auto; padding:16px 20px; display:flex; flex-direction:column; gap:16px;">
        
        <!-- Global YES/NO Preference -->
        <div class="mujx-form-group">
          <label style="font-size:12px; font-weight:700; display:block; margin-bottom:6px;">Default YES/NO Selection</label>
          <div style="display:flex; gap:10px;">
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">
              <input type="radio" name="mujx_pref_yesno" value="YES" ${currentPrefs.defaultYesNo === "YES" ? "checked" : ""}>
              <span>YES (Recommended for regular classes &amp; positive reviews)</span>
            </label>
            <label style="display:inline-flex; align-items:center; gap:6px; cursor:pointer; font-size:13px;">
              <input type="radio" name="mujx_pref_yesno" value="NO" ${currentPrefs.defaultYesNo === "NO" ? "checked" : ""}>
              <span>NO</span>
            </label>
          </div>
        </div>

        <!-- Dropdown Preference Strategy -->
        <div class="mujx-form-group">
          <label style="font-size:12px; font-weight:700; display:block; margin-bottom:6px;">Default Dropdown &amp; Rating Strategy</label>
          <select id="mujx_pref_dropdown" class="mujx-select" style="width:100%; padding:7px 10px; border-radius:6px; background:#121826; border:1px solid #2d2d3f; color:#f1f5f9; font-size:12.5px;">
            <option value="highest_positive" ${currentPrefs.defaultDropdownStrategy === "highest_positive" ? "selected" : ""}>Highest Positive Agreement (Strongly Agree / 5 Stars)</option>
            <option value="agree" ${currentPrefs.defaultDropdownStrategy === "agree" ? "selected" : ""}>Moderate Agreement (Agree / 4 Stars)</option>
          </select>
          <span style="font-size:10.5px; opacity:0.7; margin-top:4px; display:block;">Automatically selects the most constructive response for course relevance, satisfaction, and rating scales.</span>
        </div>

        <!-- Comments & Suggestions Textarea Preference -->
        <div class="mujx-form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label style="font-size:12px; font-weight:700;">Default Comment / Suggestions</label>
            <label style="font-size:11px; display:inline-flex; align-items:center; gap:4px; cursor:pointer;">
              <input type="checkbox" id="mujx_pref_fill_comments" ${currentPrefs.fillComments ? "checked" : ""}>
              <span>Fill Comments Field</span>
            </label>
          </div>
          <textarea id="mujx_pref_comment_text" rows="3" style="width:100%; padding:8px 10px; border-radius:6px; background:#121826; border:1px solid #2d2d3f; color:#f1f5f9; font-size:12px; resize:vertical;">${escapeHtml(currentPrefs.defaultComment || "")}</textarea>
        </div>

        <!-- Preservation Toggles -->
        <div class="mujx-form-group" style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:10px 14px; display:flex; flex-direction:column; gap:8px;">
          <label style="font-size:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="mujx_pref_preserve_answers" ${currentPrefs.preserveExistingAnswers ? "checked" : ""}>
            <span>Preserve already-answered questions (Do not overwrite)</span>
          </label>
          <label style="font-size:12px; display:inline-flex; align-items:center; gap:8px; cursor:pointer;">
            <input type="checkbox" id="mujx_pref_preserve_comments" ${currentPrefs.preserveExistingComments ? "checked" : ""}>
            <span>Preserve manually written comments (Never overwrite student notes)</span>
          </label>
        </div>

        <!-- Question Overrides Section -->
        <div class="mujx-form-group">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <label style="font-size:12px; font-weight:700;">Individual Question Overrides</label>
            <span style="font-size:10.5px; opacity:0.7;">Override answers for specific questions</span>
          </div>

          <div id="mujx_overrides_list" style="display:flex; flex-direction:column; gap:6px; margin-bottom:8px;">
            ${renderOverridesList(currentPrefs.overrides)}
          </div>

          <!-- Add New Override -->
          <div style="display:flex; gap:6px; align-items:center; background:#121826; padding:8px; border-radius:6px; border:1px dashed #2d2d3f;">
            <input type="text" id="mujx_new_override_q" placeholder="e.g. Effective time management during class" style="flex:1; padding:5px 8px; font-size:11.5px; background:none; border:1px solid #2d2d3f; border-radius:4px; color:#fff;" />
            <select id="mujx_new_override_val" style="padding:5px 8px; font-size:11.5px; background:#1e1e2d; border:1px solid #2d2d3f; border-radius:4px; color:#fff;">
              <option value="YES">YES</option>
              <option value="NO">NO</option>
              <option value="Strongly Agree">Strongly Agree</option>
              <option value="Agree">Agree</option>
              <option value="Neutral">Neutral</option>
              <option value="Disagree">Disagree</option>
            </select>
            <button type="button" id="mujx_add_override_btn" style="padding:5px 10px; font-size:11.5px; font-weight:700; background:var(--mujx-accent, #0d9488); border:none; border-radius:4px; color:#fff; cursor:pointer;">+ Add</button>
          </div>
        </div>

      </div>

      <div class="mujx-modal-foot" style="padding:14px 20px; border-top:1px solid #2d2d3f; display:flex; justify-content:space-between; align-items:center; background:#121826;">
        <button type="button" id="mujx_reset_defaults_btn" style="background:none; border:none; color:#f43f5e; font-size:12px; cursor:pointer; text-decoration:underline;">Reset to Defaults</button>
        <div style="display:flex; gap:8px;">
          <button type="button" data-role="close-btn" style="padding:7px 14px; font-size:12px; font-weight:600; border-radius:6px; background:#2d2d3f; border:none; color:#fff; cursor:pointer;">Cancel</button>
          <button type="button" id="mujx_save_prefs_btn" style="padding:7px 16px; font-size:12px; font-weight:700; border-radius:6px; background:var(--mujx-accent, #0d9488); border:none; color:#fff; cursor:pointer; box-shadow:0 2px 6px rgba(13,148,136,0.3);">Save Preferences</button>
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(backdrop);
    const workingOverrides = { ...currentPrefs.overrides || {} };
    backdrop.querySelectorAll('[data-role="close-btn"]').forEach((btn) => {
      btn.addEventListener("click", closeExistingModal);
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) closeExistingModal();
    });
    const addBtn = backdrop.querySelector("#mujx_add_override_btn");
    const newQInput = backdrop.querySelector("#mujx_new_override_q");
    const newValSelect = backdrop.querySelector("#mujx_new_override_val");
    const listEl = backdrop.querySelector("#mujx_overrides_list");
    addBtn.addEventListener("click", () => {
      const qText = (newQInput.value || "").trim();
      const qVal = newValSelect.value;
      if (qText) {
        workingOverrides[qText] = qVal;
        newQInput.value = "";
        listEl.innerHTML = renderOverridesList(workingOverrides);
        attachRemoveListeners(listEl, workingOverrides);
      }
    });
    attachRemoveListeners(listEl, workingOverrides);
    backdrop.querySelector("#mujx_reset_defaults_btn")?.addEventListener("click", async () => {
      if (confirm("Reset all feedback answer preferences back to defaults?")) {
        await resetFeedbackPreferences();
        closeExistingModal();
        if (onSaved) onSaved();
      }
    });
    backdrop.querySelector("#mujx_save_prefs_btn")?.addEventListener("click", async () => {
      const yesNoChoice = backdrop.querySelector('input[name="mujx_pref_yesno"]:checked')?.value || "YES";
      const dropdownStrategy = backdrop.querySelector("#mujx_pref_dropdown")?.value || "highest_positive";
      const fillComments = Boolean(backdrop.querySelector("#mujx_pref_fill_comments")?.checked);
      const commentText = backdrop.querySelector("#mujx_pref_comment_text")?.value || "";
      const preserveAnswers = Boolean(backdrop.querySelector("#mujx_pref_preserve_answers")?.checked);
      const preserveComments = Boolean(backdrop.querySelector("#mujx_pref_preserve_comments")?.checked);
      const updated = {
        defaultYesNo: yesNoChoice,
        defaultDropdownStrategy: dropdownStrategy,
        fillComments,
        defaultComment: commentText,
        preserveExistingAnswers: preserveAnswers,
        preserveExistingComments: preserveComments,
        overrides: workingOverrides
      };
      await saveFeedbackPreferences(updated);
      closeExistingModal();
      if (onSaved) onSaved(updated);
    });
  }
  function renderOverridesList(overrides) {
    const entries = Object.entries(overrides || {});
    if (entries.length === 0) {
      return `<div style="font-size:11px; opacity:0.5; font-style:italic;">No question overrides configured.</div>`;
    }
    return entries.map(
      ([q, val]) => `
      <div style="display:flex; justify-content:space-between; align-items:center; background:#121826; padding:5px 8px; border-radius:4px; font-size:11.5px; border:1px solid #2d2d3f;">
        <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:280px;" title="${escapeHtml(q)}">${escapeHtml(q)}</span>
        <div style="display:flex; align-items:center; gap:6px;">
          <span style="font-weight:700; color:var(--mujx-accent, #2dd4bf); font-size:10.5px;">${escapeHtml(val)}</span>
          <button type="button" data-del-override="${escapeHtml(q)}" style="background:none; border:none; color:#f43f5e; cursor:pointer; font-size:12px;">\u2715</button>
        </div>
      </div>
    `
    ).join("");
  }
  function attachRemoveListeners(listEl, workingOverrides) {
    listEl.querySelectorAll("[data-del-override]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const k = btn.dataset.delOverride;
        delete workingOverrides[k];
        listEl.innerHTML = renderOverridesList(workingOverrides);
        attachRemoveListeners(listEl, workingOverrides);
      });
    });
  }
  function closeExistingModal() {
    document.querySelectorAll(`[${INJECT_ATTR}="feedback-prefs-modal"]`).forEach((el) => el.remove());
  }

  // src/feedback/ui/feedback-report-modal.js
  function openFeedbackReportModal({
    validationResult,
    submitButton = null,
    onClose = null
  } = {}) {
    closeExistingModal2();
    const {
      total,
      answeredCount,
      unansweredCount,
      completionPercentage,
      unansweredList,
      isFullyAnswered,
      firstUnanswered
    } = validationResult;
    const backdrop = document.createElement("div");
    backdrop.className = "mujx-modal-backdrop";
    backdrop.setAttribute(INJECT_ATTR, "feedback-report-modal");
    const statusColor = isFullyAnswered ? "#10b981" : "#f59e0b";
    const statusBadge = isFullyAnswered ? "\u2713 Ready for Review" : "\u26A0\uFE0F Incomplete";
    backdrop.innerHTML = `
    <div class="mujx-modal-card" role="dialog" aria-label="Feedback Completion Report" style="max-width:520px;">
      <div class="mujx-modal-head" style="border-bottom:1px solid #2d2d3f; padding:14px 20px; display:flex; justify-content:space-between; align-items:center;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="font-size:18px;">${isFullyAnswered ? "\u2705" : "\u{1F4CB}"}</span>
          <div>
            <h3 style="margin:0; font-size:15px; font-weight:700; color:#fff;">Feedback Completion Report</h3>
            <span style="font-size:11px; opacity:0.75;">Live questionnaire verification status</span>
          </div>
        </div>
        <button type="button" data-role="close-btn" style="background:none; border:none; color:#94a3b8; font-size:16px; cursor:pointer; padding:4px 8px;">\u2715</button>
      </div>

      <div class="mujx-modal-body" style="padding:18px 20px; display:flex; flex-direction:column; gap:16px; max-height:65vh; overflow-y:auto;">
        
        <!-- Top Stats Card -->
        <div style="background:#121826; border:1px solid #2d2d3f; border-radius:10px; padding:14px 18px; display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:0.04em; color:#94a3b8;">Status</div>
            <div style="font-size:16px; font-weight:800; color:${statusColor}; margin-top:2px;">${statusBadge}</div>
          </div>
          <div style="display:flex; gap:18px; text-align:right;">
            <div>
              <div style="font-size:18px; font-weight:800; color:#fff;">${answeredCount} / ${total}</div>
              <div style="font-size:10.5px; opacity:0.7;">Answered</div>
            </div>
            <div>
              <div style="font-size:18px; font-weight:800; color:${unansweredCount === 0 ? "#10b981" : "#f43f5e"};">${unansweredCount}</div>
              <div style="font-size:10.5px; opacity:0.7;">Unanswered</div>
            </div>
            <div>
              <div style="font-size:18px; font-weight:800; color:var(--mujx-accent, #2dd4bf);">${completionPercentage}%</div>
              <div style="font-size:10.5px; opacity:0.7;">Completion</div>
            </div>
          </div>
        </div>

        ${isFullyAnswered ? `
          <!-- Fully Answered Advisory -->
          <div style="background:rgba(16,185,129,0.1); border:1px solid rgba(16,185,129,0.3); border-radius:8px; padding:12px 14px; font-size:12px; line-height:1.45; color:#a7f3d0;">
            <div style="font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:12.5px; color:#34d399;">
              <span>\u{1F389}</span>
              <span>All Mandatory Questions Have Been Populated</span>
            </div>
            <div>
              Every question section has been verified. In accordance with university integrity policies, <strong>MUJX does not auto-submit feedback</strong>. Please review your answers before submitting.
            </div>
          </div>
        ` : `
          <!-- Incomplete Questions Warning -->
          <div style="background:rgba(245,158,11,0.1); border:1px solid rgba(245,158,11,0.3); border-radius:8px; padding:12px 14px; font-size:12px; line-height:1.45; color:#fde68a;">
            <div style="font-weight:700; display:flex; align-items:center; gap:6px; margin-bottom:4px; font-size:12.5px; color:#fbbf24;">
              <span>\u26A0\uFE0F</span>
              <span>${unansweredCount} Question(s) Still Require Your Attention</span>
            </div>
            <div>
              The questions below were not completed or require manual selection before the university portal will accept your submission.
            </div>
          </div>

          <!-- Unanswered Questions List -->
          <div style="display:flex; flex-direction:column; gap:8px;">
            <div style="font-size:12px; font-weight:700; color:#fff;">Unanswered Questions:</div>
            ${unansweredList.map(
      (q, idx) => `
              <div style="background:#121826; border:1px solid #2d2d3f; border-radius:6px; padding:8px 12px; display:flex; justify-content:space-between; align-items:center; gap:10px;">
                <div style="flex:1; min-width:0;">
                  <div style="font-size:10px; opacity:0.6; text-transform:uppercase;">${escapeHtml(q.sectionTitle || "Question")}</div>
                  <div style="font-size:12px; font-weight:600; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(q.questionText)}">
                    ${idx + 1}. ${escapeHtml(q.questionText)}
                  </div>
                  <div style="font-size:10.5px; color:#f87171; margin-top:2px;">${escapeHtml(q.reason || "Unanswered")}</div>
                </div>
                <button type="button" data-jump-idx="${idx}" style="padding:4px 8px; font-size:11px; font-weight:600; border-radius:4px; background:rgba(45,212,191,0.15); border:1px solid rgba(45,212,191,0.4); color:var(--mujx-accent, #2dd4bf); cursor:pointer; white-space:nowrap;">
                  Jump to \u2197
                </button>
              </div>
            `
    ).join("")}
          </div>
        `}

      </div>

      <div class="mujx-modal-foot" style="padding:14px 20px; border-top:1px solid #2d2d3f; display:flex; justify-content:space-between; align-items:center; background:#121826;">
        ${!isFullyAnswered && firstUnanswered ? `
          <button type="button" id="mujx_jump_first_btn" style="padding:8px 14px; font-size:12px; font-weight:700; border-radius:6px; background:#f59e0b; border:none; color:#000; cursor:pointer;">
            \u2197 Go to First Unanswered Question
          </button>
        ` : `<div></div>`}

        <div style="display:flex; gap:8px;">
          <button type="button" data-role="close-btn" style="padding:8px 14px; font-size:12px; font-weight:600; border-radius:6px; background:#2d2d3f; border:none; color:#fff; cursor:pointer;">Close</button>
          
          ${isFullyAnswered && submitButton ? `
            <button type="button" id="mujx_scroll_submit_btn" style="padding:8px 16px; font-size:12px; font-weight:700; border-radius:6px; background:var(--mujx-accent, #0d9488); border:none; color:#fff; cursor:pointer; box-shadow:0 2px 6px rgba(13,148,136,0.3);">
              Scroll to Submit Button \u2B07
            </button>
          ` : ""}
        </div>
      </div>
    </div>
  `;
    document.body.appendChild(backdrop);
    backdrop.querySelectorAll('[data-role="close-btn"]').forEach((btn) => {
      btn.addEventListener("click", () => {
        closeExistingModal2();
        if (onClose) onClose();
      });
    });
    backdrop.addEventListener("click", (e) => {
      if (e.target === backdrop) {
        closeExistingModal2();
        if (onClose) onClose();
      }
    });
    backdrop.querySelector("#mujx_jump_first_btn")?.addEventListener("click", () => {
      closeExistingModal2();
      if (firstUnanswered) {
        scrollToQuestion(firstUnanswered);
      }
    });
    backdrop.querySelectorAll("[data-jump-idx]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const idx = parseInt(btn.dataset.jumpIdx, 10);
        const q = unansweredList[idx];
        if (q) {
          closeExistingModal2();
          scrollToQuestion(q);
        }
      });
    });
    backdrop.querySelector("#mujx_scroll_submit_btn")?.addEventListener("click", () => {
      closeExistingModal2();
      if (submitButton) {
        submitButton.scrollIntoView({ behavior: "smooth", block: "center" });
        submitButton.classList.add("mujx-highlight-unanswered");
        setTimeout(() => {
          submitButton.classList.remove("mujx-highlight-unanswered");
        }, 2500);
        try {
          submitButton.focus({ preventScroll: true });
        } catch (_) {
        }
      }
    });
  }
  function closeExistingModal2() {
    document.querySelectorAll(`[${INJECT_ATTR}="feedback-report-modal"]`).forEach((el) => el.remove());
  }

  // src/feedback/ui/feedback-assistant.js
  async function mountFeedbackAssistant({
    doc = document,
    metadata = {},
    questions = [],
    submitButton = null
  } = {}) {
    document.querySelectorAll(`[${INJECT_ATTR}="feedback-assistant"]`).forEach((el) => el.remove());
    const { courseName, courseCode, facultyName, academicSession, courseKey } = metadata;
    let preferences = await loadFeedbackPreferences();
    let isMinimized = false;
    let isFilling = false;
    let lastFillSummary = null;
    let validation = validateQuestionnaire(questions);
    const savedDraft = await loadFeedbackDraft(courseKey, academicSession);
    const container = document.createElement("div");
    container.className = "mujx-feedback-assistant";
    container.setAttribute(INJECT_ATTR, "feedback-assistant");
    container.style.position = "fixed";
    container.style.right = "20px";
    container.style.bottom = "20px";
    container.style.zIndex = "2147483640";
    container.style.fontFamily = "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif";
    document.body.appendChild(container);
    function render() {
      validation = validateQuestionnaire(questions);
      const {
        total,
        answeredCount,
        unansweredCount,
        failedCount,
        completionPercentage,
        isFullyAnswered
      } = validation;
      if (isMinimized) {
        container.innerHTML = `
        <button type="button" data-role="expand-btn" class="mujx-feedback-min-pill" style="display:inline-flex; align-items:center; gap:8px; padding:10px 18px; border-radius:9999px; background:linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color:#fff; font-size:12.5px; font-weight:700; border:none; box-shadow:0 10px 25px -4px rgba(13,148,136,0.5); cursor:pointer; user-select:none;">
          <span>\u26A1</span>
          <span>Feedback Assistant (${answeredCount}/${total} - ${completionPercentage}%)</span>
        </button>
      `;
        container.querySelector('[data-role="expand-btn"]').addEventListener("click", () => {
          isMinimized = false;
          render();
        });
        return;
      }
      container.innerHTML = `
      <div class="mujx-feedback-card" style="width:390px; max-width:calc(100vw - 32px); background:#1e1e2d; border:1px solid #2d2d3f; border-radius:14px; box-shadow:0 20px 30px -10px rgba(0,0,0,0.5), 0 8px 12px -4px rgba(0,0,0,0.3); overflow:hidden; color:#f1f5f9; display:flex; flex-direction:column; animation:mujx-slide-up 0.2s ease;">
        
        <!-- Header -->
        <div style="padding:12px 16px; background:#121826; border-bottom:1px solid #2d2d3f; display:flex; justify-content:space-between; align-items:center;">
          <div style="display:flex; align-items:center; gap:8px;">
            <div style="width:22px; height:22px; border-radius:5px; background:linear-gradient(135deg, #0d9488, #2dd4bf); display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:800; color:#fff;">
              MX
            </div>
            <div>
              <div style="font-size:13px; font-weight:700; color:#fff; display:flex; align-items:center; gap:6px;">
                <span>Feedback Assistant</span>
                <span style="font-size:9.5px; padding:1px 5px; border-radius:4px; background:${isFullyAnswered ? "rgba(16,185,129,0.2)" : "rgba(45,212,191,0.2)"}; color:${isFullyAnswered ? "#34d399" : "#2dd4bf"}; font-weight:700;">
                  ${isFullyAnswered ? "VERIFIED 100%" : "READY"}
                </span>
              </div>
            </div>
          </div>
          <button type="button" data-role="minimize-btn" title="Minimize panel" style="background:none; border:none; color:#94a3b8; font-size:15px; cursor:pointer; padding:2px 6px;">\u2014</button>
        </div>

        <!-- Course Metadata Strip -->
        <div style="padding:10px 16px; background:rgba(255,255,255,0.02); border-bottom:1px solid rgba(255,255,255,0.05); display:flex; justify-content:space-between; align-items:center;">
          <div style="min-width:0; flex:1;">
            <div style="font-size:12.5px; font-weight:700; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(courseName)}">
              ${escapeHtml(courseName)}
            </div>
            <div style="font-size:11px; color:#94a3b8; margin-top:1px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${escapeHtml(facultyName)}">
              ${escapeHtml(facultyName)}
            </div>
          </div>
          <span style="font-size:10px; font-weight:700; background:#2d2d3f; color:#94a3b8; padding:2px 6px; border-radius:4px; margin-left:8px; white-space:nowrap;">
            ${escapeHtml(courseCode)}
          </span>
        </div>

        <!-- Progress Bar & Stats -->
        <div style="padding:12px 16px 10px 16px; display:flex; flex-direction:column; gap:8px;">
          <div style="display:flex; justify-content:space-between; align-items:baseline; font-size:11.5px;">
            <span style="color:#94a3b8;">Questionnaire Progress</span>
            <span style="font-weight:700; color:${isFullyAnswered ? "#34d399" : "#f1f5f9"}; font-variant-numeric:tabular-nums;">
              ${answeredCount} / ${total} (${completionPercentage}%)
            </span>
          </div>

          <!-- Progress Bar Track -->
          <div style="height:6px; background:#121826; border-radius:9999px; overflow:hidden; border:1px solid rgba(255,255,255,0.06);">
            <div style="height:100%; width:${completionPercentage}%; background:${isFullyAnswered ? "linear-gradient(90deg, #10b981, #34d399)" : "linear-gradient(90deg, #0d9488, #2dd4bf)"}; border-radius:9999px; transition:width 0.25s ease;"></div>
          </div>

          ${savedDraft && answeredCount === 0 ? `
            <div style="background:rgba(45,212,191,0.08); border:1px dashed rgba(45,212,191,0.3); border-radius:6px; padding:6px 10px; font-size:11px; display:flex; justify-content:space-between; align-items:center;">
              <span style="color:#99f6e4;">Saved draft found for this course.</span>
              <button type="button" id="mujx_restore_draft_btn" style="background:none; border:none; color:var(--mujx-accent, #2dd4bf); font-weight:700; cursor:pointer; text-decoration:underline;">Restore</button>
            </div>
          ` : ""}
        </div>

        <!-- Post-Fill Detailed Summary Block -->
        ${lastFillSummary ? `
          <div style="margin:0 16px 10px 16px; padding:10px 12px; background:rgba(0,0,0,0.3); border:1px solid ${lastFillSummary.isFullyAnswered ? "rgba(16,185,129,0.35)" : "rgba(239,68,68,0.35)"}; border-radius:8px;">
            <div style="font-size:12px; font-weight:700; color:${lastFillSummary.isFullyAnswered ? "#34d399" : "#fbbf24"}; display:flex; align-items:center; justify-content:space-between;">
              <span>Feedback Filling Complete</span>
              <span style="font-size:9.5px; font-weight:700; padding:1px 6px; border-radius:4px; background:${lastFillSummary.isFullyAnswered ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}; color:${lastFillSummary.isFullyAnswered ? "#34d399" : "#fbbf24"};">
                ${lastFillSummary.isFullyAnswered ? "ALL VERIFIED" : "ATTENTION"}
              </span>
            </div>

            <div style="margin-top:8px; font-size:11px; display:grid; grid-template-columns:1fr 1fr; gap:4px 10px; color:#cbd5e1;">
              <div>Total Questions: <strong style="color:#fff;">${lastFillSummary.total}</strong></div>
              <div>Successfully Answered: <strong style="color:#34d399;">${lastFillSummary.successfullyAnswered}</strong></div>
              <div>Unanswered: <strong style="color:${lastFillSummary.unanswered > 0 ? "#f87171" : "#94a3b8"};">${lastFillSummary.unanswered}</strong></div>
              <div>Failed: <strong style="color:${lastFillSummary.failed > 0 ? "#ef4444" : "#94a3b8"};">${lastFillSummary.failed}</strong></div>
            </div>

            <div style="margin-top:8px; font-size:11px; font-weight:600; color:${lastFillSummary.isFullyAnswered ? "#34d399" : "#fbbf24"};">
              Status: ${lastFillSummary.isFullyAnswered ? "Ready for Review." : "Some questions require manual attention."}
            </div>

            ${(!lastFillSummary.isFullyAnswered || lastFillSummary.failed > 0 || lastFillSummary.unanswered > 0) && validation.firstUnanswered ? `
              <button type="button" id="mujx_goto_first_unanswered_btn" style="margin-top:8px; width:100%; padding:6px 10px; font-size:11px; font-weight:700; background:#dc2626; color:#fff; border:none; border-radius:6px; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:6px;">
                <span>\u{1F3AF} Navigate to First Incomplete Question</span>
              </button>
            ` : ""}
          </div>
        ` : ""}

        <!-- Main One-Click Action -->
        <div style="padding:0 16px 12px 16px;">
          <button type="button" id="mujx_fill_all_btn" ${isFilling ? "disabled" : ""} style="width:100%; padding:10px 14px; font-size:13px; font-weight:700; border-radius:8px; border:none; background:linear-gradient(135deg, #0d9488 0%, #0f766e 100%); color:#fff; cursor:${isFilling ? "wait" : "pointer"}; box-shadow:0 4px 12px rgba(13,148,136,0.35); display:flex; align-items:center; justify-content:center; gap:8px; transition:transform 0.1s ease;">
            <span>${isFilling ? "\u23F3" : "\u26A1"}</span>
            <span>${isFilling ? "Filling Questionnaire..." : "Fill Entire Form (One-Click)"}</span>
          </button>
        </div>

        <!-- Secondary Action Buttons -->
        <div style="padding:0 16px 14px 16px; display:flex; gap:6px; justify-content:space-between;">
          <button type="button" id="mujx_open_prefs_btn" title="Edit answer preferences" style="flex:1; padding:6px 8px; font-size:11px; font-weight:600; background:#121826; border:1px solid #2d2d3f; border-radius:6px; color:#e2e8f0; cursor:pointer; text-align:center;">
            \u2699\uFE0F Prefs
          </button>
          <button type="button" id="mujx_reset_form_btn" title="Reset all answers" style="flex:1; padding:6px 8px; font-size:11px; font-weight:600; background:#121826; border:1px solid #2d2d3f; border-radius:6px; color:#e2e8f0; cursor:pointer; text-align:center;">
            \u{1F504} Reset
          </button>
          <button type="button" id="mujx_open_report_btn" title="Check completion report" style="flex:1; padding:6px 8px; font-size:11px; font-weight:600; background:#121826; border:1px solid #2d2d3f; border-radius:6px; color:#e2e8f0; cursor:pointer; text-align:center;">
            \u{1F4CB} Report
          </button>
          ${submitButton ? `
            <button type="button" id="mujx_jump_submit_btn" title="Scroll down to submit button" style="flex:1; padding:6px 8px; font-size:11px; font-weight:600; background:#121826; border:1px solid #2d2d3f; border-radius:6px; color:#2dd4bf; cursor:pointer; text-align:center;">
              \u{1F4E4} Submit
            </button>
          ` : ""}
        </div>

        <!-- Footer Advisory -->
        <div style="padding:8px 16px; background:#121826; border-top:1px solid #2d2d3f; font-size:10px; color:#94a3b8; display:flex; justify-content:space-between; align-items:center;">
          <span>Student review required before manual submit</span>
          <span style="color:#2dd4bf; font-weight:600;">MUJX</span>
        </div>

      </div>
    `;
      attachListeners();
    }
    function attachListeners() {
      container.querySelector('[data-role="minimize-btn"]')?.addEventListener("click", () => {
        isMinimized = true;
        render();
      });
      container.querySelector("#mujx_fill_all_btn")?.addEventListener("click", async () => {
        if (isFilling) return;
        isFilling = true;
        render();
        preferences = await loadFeedbackPreferences();
        const fillResult = await fillEntireForm({
          questions,
          preferences
        });
        validation = validateQuestionnaire(questions);
        lastFillSummary = {
          total: validation.total,
          successfullyAnswered: validation.answeredCount,
          unanswered: validation.unansweredCount,
          failed: fillResult.failed,
          isFullyAnswered: validation.isFullyAnswered
        };
        saveCurrentAnswersAsDraft();
        isFilling = false;
        render();
        if (!validation.isFullyAnswered || fillResult.failed > 0) {
          openFeedbackReportModal({ validationResult: validation, submitButton });
        }
      });
      container.querySelector("#mujx_goto_first_unanswered_btn")?.addEventListener("click", () => {
        validation = validateQuestionnaire(questions);
        if (validation.firstUnanswered) {
          scrollToQuestion(validation.firstUnanswered);
        }
      });
      container.querySelector("#mujx_open_prefs_btn")?.addEventListener("click", () => {
        openFeedbackPreferencesModal({
          onSaved: async (updated) => {
            if (updated) preferences = updated;
            render();
          }
        });
      });
      container.querySelector("#mujx_reset_form_btn")?.addEventListener("click", () => {
        if (confirm("Clear all answers on this feedback questionnaire?")) {
          resetCurrentForm(questions);
          lastFillSummary = null;
          render();
        }
      });
      container.querySelector("#mujx_open_report_btn")?.addEventListener("click", () => {
        validation = validateQuestionnaire(questions);
        openFeedbackReportModal({ validationResult: validation, submitButton });
      });
      container.querySelector("#mujx_jump_submit_btn")?.addEventListener("click", () => {
        if (submitButton) {
          submitButton.scrollIntoView({ behavior: "smooth", block: "center" });
          submitButton.classList.add("mujx-highlight-unanswered");
          setTimeout(() => {
            submitButton.classList.remove("mujx-highlight-unanswered");
          }, 2500);
        }
      });
      container.querySelector("#mujx_restore_draft_btn")?.addEventListener("click", () => {
        if (savedDraft?.answers) {
          restoreDraftAnswers(savedDraft.answers);
          render();
        }
      });
    }
    function saveCurrentAnswersAsDraft() {
      const answersMap = {};
      questions.forEach((q) => {
        if (q.isAnswered && q.currentValue !== null) {
          answersMap[q.id] = q.currentValue;
        }
      });
      saveFeedbackDraft(courseKey, academicSession, answersMap);
    }
    function restoreDraftAnswers(answersMap) {
      questions.forEach((q) => {
        const savedVal = answersMap[q.id];
        if (savedVal !== void 0) {
          if (q.type === "yes_no") {
            const isYes = String(savedVal).toUpperCase() === "YES";
            const el = isYes ? q.controls.yesElement : q.controls.noElement;
            const radio = isYes ? q.controls.yesRadio : q.controls.noRadio;
            if (radio) {
              radio.checked = true;
            }
            if (el) {
              try {
                el.click();
              } catch (_) {
              }
              el.classList?.add("active", "selected");
            }
          } else if (q.type === "dropdown") {
            const select = q.controls.selectElement;
            if (select) {
              select.value = savedVal;
              select.dispatchEvent(new Event("change", { bubbles: true }));
            }
          } else if (q.type === "comment") {
            const ta = q.controls.textareaElement;
            if (ta) {
              ta.value = savedVal;
              ta.dispatchEvent(new Event("input", { bubbles: true }));
            }
          }
          q.isAnswered = true;
          q.currentValue = savedVal;
        }
      });
    }
    const observer = new MutationObserver(() => {
      if (!isFilling) {
        const v = validateQuestionnaire(questions);
        if (v.answeredCount !== validation.answeredCount || v.total !== validation.total) {
          saveCurrentAnswersAsDraft();
          render();
        }
      }
    });
    try {
      observer.observe(doc.body || doc, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["class", "checked", "aria-pressed", "aria-checked"]
      });
    } catch (_) {
      try {
        observer.observe(doc, { childList: true, subtree: true });
      } catch (_2) {
      }
    }
    doc.addEventListener("change", (e) => {
      if (e.target.closest?.(`[${INJECT_ATTR}]`)) return;
      if (e.target.matches?.("input[type=radio], select, textarea")) {
        saveCurrentAnswersAsDraft();
        render();
      }
    });
    if (submitButton) {
      submitButton.addEventListener("click", () => {
        updateCourseStatus(courseKey, "Completed");
      });
    }
    render();
    return () => {
      observer.disconnect();
      container.remove();
    };
  }

  // src/storage/preferences.js
  async function loadPreferences() {
    const stored = await chrome.storage.local.get(STORAGE_KEYS.preferences);
    return mergePrefs(DEFAULT_PREFERENCES, stored[STORAGE_KEYS.preferences] || {});
  }
  function mergePrefs(base, patch) {
    return {
      ...base,
      ...patch,
      features: { ...base.features, ...patch.features || {} },
      assumedInternalWeights: {
        ...base.assumedInternalWeights,
        ...patch.assumedInternalWeights || {}
      },
      absoluteGradeBoundaries: patch.absoluteGradeBoundaries ?? base.absoluteGradeBoundaries
    };
  }

  // src/content/feedback-entry.js
  (() => {
    "use strict";
    if (window.__mujxFeedbackLoaded) return;
    window.__mujxFeedbackLoaded = true;
    let currentCleanup = null;
    let lastHandledSignature = "";
    async function runFeedbackEnhancer() {
      try {
        const prefs = await loadPreferences();
        if (prefs.features && prefs.features.feedbackAssistant === false) {
          logInfo("feedback assistant disabled in preferences");
          return;
        }
        const detected = detectFeedbackPage(document, location.href);
        if (detected.kind === "questionnaire" || detected.kind === "unknown_feedback") {
          const questionnaire = parseQuestionnaire(document);
          if (questionnaire.questions.length > 0) {
            const sig = `questionnaire_${detected.metadata.courseKey}_${questionnaire.questions.length}`;
            if (sig === lastHandledSignature && document.querySelector(`[${INJECT_ATTR}="feedback-assistant"]`)) {
              return;
            }
            lastHandledSignature = sig;
            if (currentCleanup) currentCleanup();
            currentCleanup = await mountFeedbackAssistant({
              doc: document,
              metadata: detected.metadata,
              questions: questionnaire.questions,
              submitButton: detected.submitButton
            });
            logInfo("mounted feedback assistant", {
              course: detected.metadata.courseName,
              questions: questionnaire.questions.length
            });
            return;
          }
        }
        if (detected.kind === "list" && detected.courses.length > 0) {
          const sig = `list_${detected.courses.map((c) => `${c.id}:${c.status}`).join(";")}`;
          if (sig === lastHandledSignature && document.querySelector(`[${INJECT_ATTR}="feedback-list-banner"]`)) {
            return;
          }
          lastHandledSignature = sig;
          await saveFeedbackTracker({ courses: detected.courses });
          enhanceFeedbackListPage(detected.courses, detected.academicSession);
          logInfo("enhanced feedback list page", { courses: detected.courses.length });
          return;
        }
      } catch (err) {
        logError("error in runFeedbackEnhancer", err);
      }
    }
    function enhanceFeedbackListPage(courses = [], session = "") {
      document.querySelectorAll(`[${INJECT_ATTR}="feedback-list-banner"]`).forEach((el) => el.remove());
      const pendingCourses = courses.filter((c) => c.status === "Pending");
      const completedCourses = courses.filter((c) => c.status === "Completed");
      const allCompleted = pendingCourses.length === 0;
      const banner = document.createElement("div");
      banner.className = "mujx-feedback-list-banner";
      banner.setAttribute(INJECT_ATTR, "feedback-list-banner");
      banner.style.margin = "14px 0";
      banner.style.padding = "14px 18px";
      banner.style.borderRadius = "10px";
      banner.style.background = "#1e1e2d";
      banner.style.border = "1px solid #2d2d3f";
      banner.style.boxShadow = "0 1px 3px rgba(0,0,0,0.35)";
      banner.style.color = "#f1f5f9";
      banner.style.display = "flex";
      banner.style.justifyContent = "space-between";
      banner.style.alignItems = "center";
      banner.style.flexWrap = "wrap";
      banner.style.gap = "12px";
      banner.innerHTML = `
      <div style="display:flex; align-items:center; gap:12px;">
        <div style="width:36px; height:36px; border-radius:8px; background:linear-gradient(135deg, #0d9488, #2dd4bf); display:flex; align-items:center; justify-content:center; font-size:16px;">
          \u26A1
        </div>
        <div>
          <div style="font-size:14px; font-weight:700; color:#fff; display:flex; align-items:center; gap:8px;">
            <span>Course Feedback Status</span>
            <span style="font-size:10px; font-weight:700; padding:2px 7px; border-radius:9999px; background:${allCompleted ? "rgba(16,185,129,0.2)" : "rgba(245,158,11,0.2)"}; color:${allCompleted ? "#34d399" : "#fbbf24"};">
              ${allCompleted ? "ALL COMPLETED" : `${pendingCourses.length} PENDING`}
            </span>
          </div>
          <div style="font-size:11.5px; color:#94a3b8; margin-top:2px;">
            ${session} \u2022 Open any course to activate the One-Click Feedback Assistant
          </div>
        </div>
      </div>

      <div style="display:flex; align-items:center; gap:14px;">
        <div style="display:flex; gap:12px; font-size:12px;">
          <div>
            <span style="font-weight:700; color:#fff;">${courses.length}</span>
            <span style="color:#94a3b8; font-size:11px;">Total</span>
          </div>
          <div>
            <span style="font-weight:700; color:#34d399;">${completedCourses.length}</span>
            <span style="color:#94a3b8; font-size:11px;">Completed</span>
          </div>
          <div>
            <span style="font-weight:700; color:#fbbf24;">${pendingCourses.length}</span>
            <span style="color:#94a3b8; font-size:11px;">Pending</span>
          </div>
        </div>

        ${pendingCourses.length > 0 && pendingCourses[0].actionUrl ? `
          <a href="${pendingCourses[0].actionUrl}" style="text-decoration:none; padding:8px 14px; font-size:12px; font-weight:700; border-radius:6px; background:linear-gradient(135deg, #0d9488, #0f766e); color:#fff; display:inline-flex; align-items:center; gap:6px; box-shadow:0 2px 8px rgba(13,148,136,0.3);">
            <span>Fill Next Pending Course \u2192</span>
          </a>
        ` : ""}
      </div>
    `;
      const target = document.querySelector("table")?.closest(".table-responsive, .table-scrollable") || document.querySelector("table");
      if (target?.parentNode) {
        target.parentNode.insertBefore(banner, target);
      }
    }
    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", runFeedbackEnhancer, { once: true });
    } else {
      runFeedbackEnhancer();
    }
    const observer = new MutationObserver(() => {
      runFeedbackEnhancer();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    window.addEventListener("popstate", () => setTimeout(runFeedbackEnhancer, 200));
    document.addEventListener("click", (e) => {
      if (e.target.closest("a, button, select")) {
        setTimeout(runFeedbackEnhancer, 300);
        setTimeout(runFeedbackEnhancer, 1e3);
      }
    }, true);
  })();
})();
