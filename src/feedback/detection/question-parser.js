/**
 * Dynamic Questionnaire Parser
 *
 * Scans the complete DOM across all questionnaire sections to identify:
 * - YES/NO radio inputs, styled labels, and button groups
 * - Dropdown selects (course satisfaction, relevance)
 * - Rating scale groups (e.g. 1 to 5)
 * - Comments / suggestions textareas
 * - Mandatory flags and live answered states
 *
 * Works across multi-table ASP.NET / Metronic SLCM views without early termination.
 */

export function parseQuestionnaire(doc = document) {
  const sections = [];
  const allQuestions = [];
  const processedElements = new Set();
  const processedControls = new Set();
  const seenQuestionTexts = new Set();

  // Strategy 1: Table-based questionnaires across ALL sections
  const tables = Array.from(doc.querySelectorAll("table"));

  for (let tIdx = 0; tIdx < tables.length; tIdx++) {
    const table = tables[tIdx];

    // Check if table contains feedback controls
    const hasControls = Boolean(
      table.querySelector('input[type="radio"]') ||
      table.querySelector("select") ||
      table.querySelector("textarea") ||
      table.querySelector("button, .btn, label.btn")
    );
    if (!hasControls) continue;

    // Skip outer container tables that contain nested tables with controls (e.g. dtmain)
    const nestedTablesWithControls = Array.from(table.querySelectorAll("table")).filter((t) =>
      t.querySelector('input[type="radio"], select, textarea, button, .btn')
    );
    if (nestedTablesWithControls.length > 0) continue;

    // Determine default section title for this table
    let currentSectionTitle =
      findPrecedingSectionHeading(table) ||
      `Questionnaire Section ${sections.length + 1}`;

    // Extract table column headers (e.g. ["sr no", "particulars", "yes", "no"])
    const tableHeaders = extractTableHeaders(table);

    const rows = Array.from(table.rows);
    let sectionQuestions = [];

    for (let rIdx = 0; rIdx < rows.length; rIdx++) {
      const row = rows[rIdx];
      if (processedElements.has(row)) continue;

      // Check if row is an internal section header
      if (isSectionHeaderRow(row)) {
        if (sectionQuestions.length > 0) {
          sections.push({ title: currentSectionTitle, questions: sectionQuestions });
          sectionQuestions = [];
        }
        const extractedTitle = extractSectionTitle(row);
        if (extractedTitle) currentSectionTitle = extractedTitle;
        continue;
      }

      // Check if row is a question row
      const question = parseQuestionRow(
        row,
        allQuestions.length,
        currentSectionTitle,
        tableHeaders
      );

      if (question) {
        // Prevent duplicate questions from malformed tables
        const dedupKey = `${question.sectionTitle}::${question.questionText}`.toLowerCase();
        if (!seenQuestionTexts.has(dedupKey)) {
          seenQuestionTexts.add(dedupKey);
          processedElements.add(row);
          row.querySelectorAll('input, select, textarea').forEach((el) => processedControls.add(el));
          sectionQuestions.push(question);
          allQuestions.push(question);
        }
      }
    }

    if (sectionQuestions.length > 0) {
      sections.push({ title: currentSectionTitle, questions: sectionQuestions });
    }
  }

  // Strategy 2: Div / Card / Panel / Form-group based questionnaires
  // Processes containers that are not already part of parsed tables
  const containers = Array.from(
    doc.querySelectorAll(
      ".kt-portlet, .card, .panel, .form-group, .question-card, .feedback-item"
    )
  );

  let currentContainerSectionTitle = "Feedback Questions";
  let containerQuestions = [];

  containers.forEach((container, idx) => {
    // If container contains a table, it is a structural wrapper around tables, not a single question
    if (container.querySelector("table")) return;

    // Skip if container is inside an already processed table
    if (container.closest("table") && processedElements.has(container.closest("table"))) {
      return;
    }
    if (processedElements.has(container)) return;

    // Skip if all or any inputs inside container have already been processed
    const containerInputs = Array.from(container.querySelectorAll("input, select, textarea"));
    if (containerInputs.some((el) => processedControls.has(el))) return;

    // Check for section heading
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

  // Strategy 3: Standalone comments / suggestions textarea if not already part of parsed questions
  const commentsQuestion = findStandaloneCommentsField(doc, allQuestions);
  if (commentsQuestion) {
    allQuestions.push(commentsQuestion);
    sections.push({
      title: "Comments & Suggestions",
      questions: [commentsQuestion],
    });
  }

  try {
    if (typeof window !== "undefined") {
      window.__mujx_questionnaire = allQuestions;
    }
  } catch (_) {}

  return {
    sections,
    questions: allQuestions,
    totalQuestions: allQuestions.length,
    mandatoryQuestions: allQuestions.filter((q) => q.isMandatory),
  };
}

/**
 * Extracts table column headers (from <thead> or the first row with <th> cells)
 */
function extractTableHeaders(table) {
  const headerRow =
    table.querySelector("thead tr") ||
    Array.from(table.rows).find((r) => r.querySelectorAll("th").length > 0) ||
    table.rows[0];

  if (!headerRow) return [];
  return Array.from(headerRow.cells).map((cell) =>
    (cell.textContent || "").trim().toLowerCase()
  );
}

/**
 * Searches backwards in DOM for a section heading preceding a table
 */
function findPrecedingSectionHeading(table) {
  if (!table) return null;

  // 1. Table caption
  const caption = table.querySelector("caption");
  if (caption && caption.textContent.trim().length > 3) {
    return cleanSectionTitle(caption.textContent);
  }

  // 2. Preceding sibling elements
  let prev = table.previousElementSibling;
  while (prev) {
    if (
      /^H[1-6]$/i.test(prev.tagName) ||
      prev.matches?.(
        ".section-title, .kt-portlet__head-title, .panel-title, .card-title, .card-header, legend"
      )
    ) {
      const txt = (prev.textContent || "").trim();
      if (
        txt.length >= 3 &&
        !txt.toLowerCase().includes("feedback form") &&
        !txt.toLowerCase().includes("student details")
      ) {
        return cleanSectionTitle(txt);
      }
    }

    const inner = prev.querySelector?.(
      "h1, h2, h3, h4, h5, h6, .card-title, .kt-portlet__head-title, .section-title, strong"
    );
    if (inner) {
      const txt = (inner.textContent || "").trim();
      if (
        txt.length >= 3 &&
        !txt.toLowerCase().includes("feedback form") &&
        !txt.toLowerCase().includes("student details")
      ) {
        return cleanSectionTitle(txt);
      }
    }
    prev = prev.previousElementSibling;
  }

  // 3. Parent table row preceding sibling (e.g. SLCM nested table layout)
  const parentRow = table.closest("tr");
  if (parentRow && parentRow.previousElementSibling) {
    const prevRowText = (parentRow.previousElementSibling.textContent || "").trim();
    if (
      prevRowText.length >= 3 &&
      !prevRowText.toLowerCase().includes("feedback form") &&
      !prevRowText.toLowerCase().includes("student details")
    ) {
      return cleanSectionTitle(prevRowText);
    }
  }

  // 4. Parent card / portlet container heading
  const parentCard = table.closest(".card, .kt-portlet, .panel, .box, fieldset");
  if (parentCard) {
    const head = parentCard.querySelector(
      ".card-header, .kt-portlet__head, .panel-heading, legend, h3, h4, h5"
    );
    if (head) {
      const txt = (head.textContent || "").trim();
      if (
        txt.length >= 3 &&
        !txt.toLowerCase().includes("feedback form") &&
        !txt.toLowerCase().includes("student details")
      ) {
        return cleanSectionTitle(txt);
      }
    }
  }

  return null;
}

/**
 * Checks if a table row is a section header (colspan across table or th heading)
 */
function isSectionHeaderRow(row) {
  if (!row.cells || row.cells.length === 0) return false;

  // Single cell spanning columns
  if (row.cells.length === 1 && (row.cells[0].colSpan > 1 || row.cells[0].tagName === "TH")) {
    return true;
  }

  const th = row.querySelector("th");
  if (th && th.colSpan > 1) return true;

  const bg = (row.style?.background || row.className || "").toLowerCase();
  if (
    bg.includes("header") ||
    bg.includes("title") ||
    bg.includes("primary") ||
    bg.includes("info") ||
    bg.includes("section")
  ) {
    if (!row.querySelector('input[type="radio"], select, textarea')) {
      return true;
    }
  }

  // If text is short and has bold tags without input controls
  if (!row.querySelector('input[type="radio"], select, textarea, button, .btn')) {
    const text = (row.textContent || "").trim();
    if (
      text.length > 4 &&
      text.length < 130 &&
      (row.querySelector("strong, b") || row.cells.length <= 2)
    ) {
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
  return title
    .replace(/^(\d+[\.\)]|section\s+\d+[:\-]|\*)\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Parses a table row into a structured Question object
 */
export function parseQuestionRow(row, index, sectionTitle, tableHeaders = []) {
  const cells = Array.from(row.cells || []);
  if (cells.length < 1) return null;

  // Skip rows that contain nested tables (e.g. wrapper rows in dtmain)
  if (row.querySelector("table")) return null;

  // If all cells in the row are <th> and have no input controls, it's a table header row
  const hasInputs = Boolean(row.querySelector('input, select, textarea, button, .btn'));
  if (row.querySelectorAll("th").length === cells.length && !hasInputs) {
    return null;
  }

  // Locate question text:
  // Check for a label that is NOT a button/checkbox label first (standard in SLCM: <label style="width:700px">Question</label>)
  let rawQuestionText = "";
  const qLabel = row.querySelector("label:not(.btn)");
  if (
    qLabel &&
    !qLabel.querySelector("select, input, button") &&
    qLabel.textContent.trim().length > 3
  ) {
    rawQuestionText = qLabel.textContent.trim();
  } else if (
    cells.length >= 3 &&
    /^\s*(\d+|[a-z])[\.\)]?\s*$/i.test(cells[0].textContent.trim())
  ) {
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

  // Don't treat column headers as questions
  const lower = rawQuestionText.toLowerCase();
  if (
    lower === "questions" ||
    lower === "parameters" ||
    lower === "sr. no." ||
    lower === "s.no." ||
    lower === "particulars" ||
    lower === "description" ||
    lower === "sl.no."
  ) {
    return null;
  }

  const cleanText = cleanQuestionText(rawQuestionText);
  const isMandatory =
    rawQuestionText.includes("*") || row.querySelector(".required, [required]") !== null;

  // 1. Detect YES/NO Radio Inputs
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
          noLabel: pair.noLabel,
        },
      };
    }
  }

  // 2. Detect Rating Radios (e.g. 1 to 5)
  if (radios.length >= 3) {
    const radioItems = radios.map((r, i) => {
      const label = findRadioLabel(r, row) || String(i + 1);
      return {
        element: r,
        label,
        value: r.value || label,
        isChecked: r.checked,
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
        options: radioItems,
      },
    };
  }

  // 3. Detect Dropdown (<select>)
  const select = row.querySelector("select");
  if (select) {
    const options = Array.from(select.options).map((opt) => ({
      text: opt.textContent.trim(),
      value: opt.value,
      isSelected: opt.selected,
    }));

    const validOptions = options.filter(
      (o) =>
        o.value !== "" &&
        !o.text.startsWith("--") &&
        !o.text.toLowerCase().includes("select") &&
        !o.text.toLowerCase().includes("choose")
    );

    const isAnswered =
      select.value !== "" &&
      !select.options[select.selectedIndex]?.text.startsWith("--") &&
      !select.options[select.selectedIndex]?.text.toLowerCase().includes("select");

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
        options: validOptions,
      },
    };
  }

  // 4. Detect Textarea (Comments)
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
        textareaElement: textarea,
      },
    };
  }

  // 5. Detect Custom Button Groups (e.g. YES/NO Buttons without native radio tags)
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
          noLabel: noBtn.tagName === "LABEL" ? noBtn : null,
        },
      };
    }
  }

  return null;
}

/**
 * Parses container-based questions (non-table)
 */
export function parseQuestionContainer(container, index, sectionTitle) {
  const labelEl = container.querySelector(
    "label, .question-text, .control-label, .card-title, strong"
  );
  if (!labelEl) return null;

  const rawText = labelEl.textContent.trim();
  if (rawText.length < 3) return null;

  const cleanText = cleanQuestionText(rawText);
  const isMandatory =
    rawText.includes("*") || container.querySelector(".required, [required]") !== null;

  // Radio inputs
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
          noLabel: pair.noLabel,
        },
      };
    }
  }

  // Buttons
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
          noLabel: noBtn.tagName === "LABEL" ? noBtn : null,
        },
      };
    }
  }

  // Dropdown
  const select = container.querySelector("select");
  if (select) {
    const options = Array.from(select.options).filter(
      (o) =>
        o.value !== "" &&
        !o.text.startsWith("--") &&
        !o.text.toLowerCase().includes("select") &&
        !o.text.toLowerCase().includes("choose")
    );
    const isAnswered =
      select.value !== "" && !select.options[select.selectedIndex]?.text.startsWith("--");
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
        options,
      },
    };
  }

  // Textarea
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
        textareaElement: textarea,
      },
    };
  }

  return null;
}

/**
 * Searches for standalone comments textarea on page
 */
function findStandaloneCommentsField(doc, existingQuestions) {
  const existingTextareas = new Set(
    existingQuestions
      .filter((q) => q.type === "comment")
      .map((q) => q.controls.textareaElement)
  );

  const textareas = doc.querySelectorAll("textarea");
  for (const ta of textareas) {
    if (existingTextareas.has(ta)) continue;
    const nameOrId = (ta.name || ta.id || ta.placeholder || "").toLowerCase();
    const parentText = (ta.closest(".form-group, td, div")?.textContent || "").toLowerCase();

    if (
      nameOrId.includes("comment") ||
      nameOrId.includes("suggestion") ||
      nameOrId.includes("feedback") ||
      nameOrId.includes("remark") ||
      parentText.includes("comment") ||
      parentText.includes("suggestion") ||
      parentText.includes("remark")
    ) {
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
          textareaElement: ta,
        },
      };
    }
  }

  return null;
}

/**
 * Identifies YES and NO radios from a pair with table header awareness
 */
export function identifyYesNoRadios(radios, container, tableHeaders = []) {
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
    const isYes =
      hasYesCheck ||
      val === "yes" ||
      val === "y" ||
      val === "1" ||
      val === "true" ||
      label.includes("yes") ||
      label === "y" ||
      headerText.includes("yes") ||
      cellText.includes("yes");

    const isNo =
      (!hasYesCheck && radios.some((x) => x.classList?.contains?.("yescheck"))) ||
      val === "no" ||
      val === "n" ||
      val === "0" ||
      val === "false" ||
      label.includes("no") ||
      label === "n" ||
      headerText.includes("no") ||
      cellText.includes("no");

    if (isYes && !isNo) {
      yesRadio = r;
    } else if (isNo && !isYes) {
      noRadio = r;
    }
  });

  // Fallback: If not explicitly labeled, first radio is typically Yes, second is No
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

  const yesLabel = yesRadio
    ? yesRadio.closest?.("label") ||
      (yesRadio.id && container.querySelector ? container.querySelector(`label[for="${yesRadio.id}"]`) : null)
    : null;

  const noLabel = noRadio
    ? noRadio.closest?.("label") ||
      (noRadio.id && container.querySelector ? container.querySelector(`label[for="${noRadio.id}"]`) : null)
    : null;

  return {
    yesRadio,
    noRadio,
    yesLabel,
    noLabel,
    yesElement: yesLabel || yesRadio,
    noElement: noLabel || noRadio,
  };
}

/**
 * Identifies YES and NO buttons with table header awareness
 */
export function identifyYesNoButtons(buttons, container, tableHeaders = []) {
  let yesBtn = null;
  let noBtn = null;

  buttons.forEach((b) => {
    const text = (b.textContent || b.value || b.getAttribute?.("aria-label") || "").trim().toLowerCase();
    const cell = b.closest?.("td, th");
    const cellIdx = cell ? cell.cellIndex : -1;
    const headerText = cellIdx >= 0 && tableHeaders[cellIdx] ? tableHeaders[cellIdx] : "";

    const isYes =
      text === "yes" ||
      text.startsWith("yes") ||
      text === "y" ||
      text.includes("agree") ||
      b.classList?.contains("btn-success") ||
      b.classList?.contains("yes-btn") ||
      headerText.includes("yes");

    const isNo =
      text === "no" ||
      text.startsWith("no") ||
      text === "n" ||
      text.includes("disagree") ||
      b.classList?.contains("btn-danger") ||
      b.classList?.contains("no-btn") ||
      headerText.includes("no");

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
  } catch (_) {}
  const next = radio.nextSibling;
  if (next && (next.nodeType === 3 || next.nodeType === 1)) {
    return (next.textContent || "").trim();
  }
  return null;
}

export function isButtonActive(btn) {
  if (!btn) return false;
  if (btn.tagName === "INPUT" && (btn.type === "radio" || btn.type === "checkbox")) {
    return btn.checked;
  }

  const hasClass = (c) => {
    try {
      if (typeof btn.classList?.contains === "function") return btn.classList.contains(c);
    } catch (_) {}
    const cls = (btn.className || "").toLowerCase();
    return cls.includes(c);
  };

  const ariaPressed = btn.getAttribute?.("aria-pressed");
  const ariaChecked = btn.getAttribute?.("aria-checked");
  const nestedChecked = Boolean(btn.querySelector?.('input[type="radio"]:checked'));

  return (
    hasClass("active") ||
    hasClass("selected") ||
    hasClass("checked") ||
    (hasClass("btn-success") && !hasClass("outline") && !hasClass("btn-outline-success")) ||
    (hasClass("btn-danger") && !hasClass("outline") && !hasClass("btn-outline-danger")) ||
    (hasClass("btn-primary") && !hasClass("outline") && !hasClass("btn-outline-primary")) ||
    ariaPressed === "true" ||
    ariaChecked === "true" ||
    nestedChecked
  );
}

export function cleanQuestionText(text) {
  return text
    .replace(/^(\d+[\.\)]|[a-z][\.\)]|q\d+[:\-]|question\s*\d+[:\-]|parameter\s*\d+[:\-])\s*/i, "")
    .replace(/\*/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
