import assert from "node:assert/strict";
import test from "node:test";
import { normalizeQuestionText, matchAnswer, pickBestDropdownOption } from "../src/feedback/engine/answer-matcher.js";
import { checkQuestionState, validateQuestionnaire } from "../src/feedback/engine/form-validator.js";
import { fillEntireForm, resetCurrentForm } from "../src/feedback/engine/form-filler.js";
import { extractQuestionnaireMetadata, findSubmitButton } from "../src/feedback/detection/feedback-detector.js";
import { cleanQuestionText, parseQuestionnaire, parseQuestionRow, identifyYesNoRadios, identifyYesNoButtons } from "../src/feedback/detection/question-parser.js";

test("normalizeQuestionText cleans and standardizes question strings", () => {
  assert.equal(
    normalizeQuestionText("1. Preparation for lectures and organization of topics?"),
    "preparation for lectures and organization of topics"
  );
  assert.equal(
    normalizeQuestionText("Q2: Regularity in taking classes & optimum utilization of time*"),
    "regularity in taking classes optimum utilization of time"
  );
  assert.equal(
    normalizeQuestionText("  (a) Handles classes regularly.  "),
    "handles classes regularly"
  );
});

test("cleanQuestionText removes leading question numbers and asterisks", () => {
  assert.equal(
    cleanQuestionText("1. Includes learning outcomes in teaching *"),
    "Includes learning outcomes in teaching"
  );
  assert.equal(
    cleanQuestionText("Parameter 4: Quality of assignments"),
    "Quality of assignments"
  );
});

test("pickBestDropdownOption selects highest positive agreement or top numeric rating", () => {
  const options1 = [
    { text: "--Select--", value: "" },
    { text: "Strongly Disagree", value: "1" },
    { text: "Disagree", value: "2" },
    { text: "Neutral", value: "3" },
    { text: "Agree", value: "4" },
    { text: "Strongly Agree", value: "5" },
  ];
  const best1 = pickBestDropdownOption(options1, "highest_positive");
  assert.equal(best1.text, "Strongly Agree");

  const options2 = [
    { text: "--Choose--", value: "" },
    { text: "Average", value: "avg" },
    { text: "Good", value: "good" },
    { text: "Excellent", value: "exc" },
  ];
  const best2 = pickBestDropdownOption(options2, "highest_positive");
  assert.equal(best2.text, "Excellent");
});

test("matchAnswer respects global preferences and individual overrides", () => {
  const qYesNo = {
    questionText: "Handles classes regularly",
    type: "yes_no",
    controls: {},
  };

  // 1. Default YES
  const match1 = matchAnswer(qYesNo, { defaultYesNo: "YES" });
  assert.equal(match1.targetValue, "YES");
  assert.equal(match1.isOverridden, false);

  // 2. Individual Question Override for this question
  const match2 = matchAnswer(qYesNo, {
    defaultYesNo: "YES",
    overrides: {
      "Handles classes regularly": "NO",
    },
  });
  assert.equal(match2.targetValue, "NO");
  assert.equal(match2.isOverridden, true);

  // 3. Dropdown question matching
  const qDropdown = {
    questionText: "I liked this course",
    type: "dropdown",
    controls: {
      options: [
        { text: "Neutral", value: "3" },
        { text: "Agree", value: "4" },
        { text: "Strongly Agree", value: "5" },
      ],
    },
  };
  const match3 = matchAnswer(qDropdown, { defaultDropdownStrategy: "highest_positive" });
  assert.equal(match3.targetValue, "5");

  // 4. Comment generation
  const qComment = {
    questionText: "Comments and Suggestions",
    type: "comment",
    controls: {},
  };
  const match4 = matchAnswer(qComment, {
    fillComments: true,
    defaultComment: "Great teaching style and well structured lectures.",
  });
  assert.equal(match4.targetValue, "Great teaching style and well structured lectures.");
});

test("form-validator identifies answered and unanswered questions", () => {
  const mockRadioYes = { checked: true, type: "radio", tagName: "INPUT" };
  const mockRadioNo = { checked: false, type: "radio", tagName: "INPUT" };

  const q1 = {
    id: "q1",
    questionText: "Regularity in taking classes",
    type: "yes_no",
    isMandatory: true,
    controls: { yesElement: mockRadioYes, noElement: mockRadioNo },
  };

  const q2Unanswered = {
    id: "q2",
    questionText: "Quality of assignments",
    type: "yes_no",
    isMandatory: true,
    controls: {
      yesElement: { checked: false, type: "radio", tagName: "INPUT" },
      noElement: { checked: false, type: "radio", tagName: "INPUT" },
    },
  };

  const mockSelect = {
    value: "",
    selectedIndex: 0,
    options: [{ text: "--Select--", value: "" }, { text: "Strongly Agree", value: "5" }],
  };

  const q3DropdownUnanswered = {
    id: "q3",
    questionText: "Course relevance",
    type: "dropdown",
    isMandatory: true,
    controls: { selectElement: mockSelect },
  };

  const validation = validateQuestionnaire([q1, q2Unanswered, q3DropdownUnanswered]);
  assert.equal(validation.total, 3);
  assert.equal(validation.answeredCount, 1);
  assert.equal(validation.unansweredCount, 2);
  assert.equal(validation.completionPercentage, 33);
  assert.equal(validation.isFullyAnswered, false);
  assert.equal(validation.firstUnanswered.id, "q2");
});

test("form-validator accurately computes progress: 5 / 23 (22%)", () => {
  const questions = [];
  for (let i = 1; i <= 23; i++) {
    const isAnswered = i <= 5;
    questions.push({
      id: `q_${i}`,
      questionText: `Question number ${i}`,
      type: "yes_no",
      isMandatory: true,
      controls: {
        yesElement: { checked: isAnswered, type: "radio", tagName: "INPUT" },
        noElement: { checked: false, type: "radio", tagName: "INPUT" },
      },
    });
  }

  const result = validateQuestionnaire(questions);
  assert.equal(result.total, 23);
  assert.equal(result.answeredCount, 5);
  assert.equal(result.unansweredCount, 18);
  assert.equal(result.completionPercentage, 22);
  assert.equal(result.summary, "5 / 23 (22%)");
  assert.equal(result.isFullyAnswered, false);
});

test("fillEntireForm populates simulated questionnaire in one click and triggers genuine events", async () => {
  const eventsFired = [];

  function createMockElement(type) {
    return {
      tagName: type === "radio" ? "INPUT" : type.toUpperCase(),
      type: type === "radio" ? "radio" : undefined,
      checked: false,
      value: "",
      click() {
        if (this.type === "radio") this.checked = true;
        eventsFired.push({ type: "click", el: this });
      },
      dispatchEvent(e) {
        eventsFired.push({ type: e.type, el: this });
      },
    };
  }

  const yesRadio = createMockElement("radio");
  const noRadio = createMockElement("radio");
  const selectEl = {
    tagName: "SELECT",
    value: "",
    selectedIndex: 0,
    options: [
      { text: "--Select--", value: "" },
      { text: "Strongly Agree", value: "5" },
    ],
    dispatchEvent(e) {
      eventsFired.push({ type: e.type, el: this });
    },
  };
  const commentTa = createMockElement("textarea");

  const questions = [
    {
      id: "q_lectures",
      questionText: "Preparation for lectures and organization of topics",
      type: "yes_no",
      isMandatory: true,
      controls: { yesElement: yesRadio, yesRadio, noElement: noRadio, noRadio },
    },
    {
      id: "q_satisfaction",
      questionText: "I liked this course",
      type: "dropdown",
      isMandatory: true,
      controls: {
        selectElement: selectEl,
        options: [{ text: "Strongly Agree", value: "5" }],
      },
    },
    {
      id: "q_comments",
      questionText: "Any other suggestions",
      type: "comment",
      isMandatory: false,
      controls: { textareaElement: commentTa },
    },
  ];

  const prefs = {
    defaultYesNo: "YES",
    defaultDropdownStrategy: "highest_positive",
    fillComments: true,
    defaultComment: "Excellent course structure.",
    preserveExistingAnswers: false,
    preserveExistingComments: true,
  };

  const fillResult = await fillEntireForm({ questions, preferences: prefs });

  assert.equal(fillResult.total, 3);
  assert.equal(fillResult.filled, 3);
  assert.equal(fillResult.failed, 0);

  // Verify that YES radio was checked
  assert.equal(yesRadio.checked, true);
  // Verify that dropdown value was set to "5"
  assert.equal(selectEl.value, "5");
  // Verify that comments textarea was populated
  assert.equal(commentTa.value, "Excellent course structure.");

  // Verify that input & change events were dispatched
  assert.ok(eventsFired.some((e) => e.type === "click"));
  assert.ok(eventsFired.some((e) => e.type === "change"));
  assert.ok(eventsFired.some((e) => e.type === "input"));

  // Form should now validate as 100% complete
  const validationAfter = validateQuestionnaire(questions);
  assert.equal(validationAfter.isFullyAnswered, true);
  assert.equal(validationAfter.completionPercentage, 100);

  // Test resetCurrentForm
  resetCurrentForm(questions);
  assert.equal(yesRadio.checked, false);
  assert.equal(commentTa.value, "");
  const validationReset = validateQuestionnaire(questions);
  assert.equal(validationReset.completionPercentage, 0);
});

test("fillEntireForm preserves already selected answers without re-clicking", async () => {
  let clickCount = 0;
  const mockRadioYes = {
    tagName: "INPUT",
    type: "radio",
    checked: true,
    click() {
      clickCount++;
    },
    dispatchEvent() {},
  };
  const mockRadioNo = {
    tagName: "INPUT",
    type: "radio",
    checked: false,
    click() {},
    dispatchEvent() {},
  };

  const questions = [
    {
      id: "q_already_yes",
      questionText: "Includes Learning Outcomes in teaching",
      type: "yes_no",
      isMandatory: true,
      controls: {
        yesElement: mockRadioYes,
        yesRadio: mockRadioYes,
        noElement: mockRadioNo,
        noRadio: mockRadioNo,
      },
    },
  ];

  const prefs = {
    defaultYesNo: "YES",
  };

  const result = await fillEntireForm({ questions, preferences: prefs });
  assert.equal(result.alreadySelected, 1);
  assert.equal(result.filled, 0);
  assert.equal(clickCount, 0, "Already-selected answer should not be clicked again");
});

test("identifyYesNoRadios identifies columns using table headers", () => {
  const radio1 = { value: "1", type: "radio", closest: () => ({ cellIndex: 2 }) };
  const radio2 = { value: "0", type: "radio", closest: () => ({ cellIndex: 3 }) };
  const headers = ["sr no", "particulars", "yes", "no"];

  const container = { querySelector: () => null };
  const result = identifyYesNoRadios([radio1, radio2], container, headers);

  assert.equal(result.yesRadio, radio1);
  assert.equal(result.noRadio, radio2);
});

test("parseQuestionnaire iterates through ALL tables across multiple sections", () => {
  function createRow(text, qNum) {
    const rYes = { type: "radio", checked: false, value: "1", name: `r_${qNum}` };
    const rNo = { type: "radio", checked: false, value: "0", name: `r_${qNum}` };
    return {
      cells: [
        { textContent: String(qNum) },
        { textContent: text },
        { textContent: "YES", cellIndex: 2 },
        { textContent: "NO", cellIndex: 3 },
      ],
      querySelectorAll(sel) {
        if (sel === 'input[type="radio"]') return [rYes, rNo];
        if (sel === "th") return [];
        return [];
      },
      querySelector(sel) {
        if (sel === 'input[type="radio"]') return rYes;
        return null;
      },
    };
  }

  // Create 4 tables representing 4 questionnaire sections with total 23 questions
  function createTable(sectionName, startNum, count) {
    const rows = [];
    // Header row
    rows.push({
      cells: [
        { textContent: "Sr. No." },
        { textContent: "Parameter" },
        { textContent: "YES" },
        { textContent: "NO" },
      ],
      querySelectorAll(sel) {
        return sel === "th" ? [{}, {}, {}, {}] : [];
      },
      querySelector: () => null,
    });

    for (let i = 0; i < count; i++) {
      rows.push(createRow(`${sectionName} Question ${i + 1}`, startNum + i));
    }

    return {
      rows,
      querySelectorAll(sel) {
        if (sel === 'input[type="radio"]') return rows.slice(1).flatMap((r) => r.querySelectorAll('input[type="radio"]'));
        return [];
      },
      querySelector(sel) {
        if (sel === 'input[type="radio"]') return {};
        if (sel === "thead tr") return rows[0];
        return null;
      },
      previousElementSibling: {
        tagName: "H4",
        textContent: sectionName,
        matches: (s) => s.includes(".section-title") || s.includes("H4"),
      },
    };
  }

  const table1 = createTable("Preparation for lectures", 1, 5);
  const table2 = createTable("Regularity in taking classes", 6, 6);
  const table3 = createTable("Quality of assignments", 12, 6);
  const table4 = createTable("Teaching methodology", 18, 6);

  const mockDoc = {
    querySelectorAll(sel) {
      if (sel === "table") return [table1, table2, table3, table4];
      if (sel.includes(".kt-portlet")) return [];
      if (sel === "textarea") return [];
      return [];
    },
    querySelector: () => null,
  };

  const parsed = parseQuestionnaire(mockDoc);
  assert.equal(parsed.totalQuestions, 23, "All 23 questions across all 4 tables must be parsed");
  assert.equal(parsed.sections.length, 4, "All 4 sections must be recognized");
  assert.equal(parsed.sections[0].title, "Preparation for lectures");
  assert.equal(parsed.sections[1].title, "Regularity in taking classes");
  assert.equal(parsed.sections[2].title, "Quality of assignments");
  assert.equal(parsed.sections[3].title, "Teaching methodology");
});

test("fillEntireForm with 23 multi-section questions and mixed preferences verifies all live states", async () => {
  const questions = [];

  for (let i = 1; i <= 23; i++) {
    const radioYes = {
      tagName: "INPUT",
      type: "radio",
      checked: false,
      click() {
        this.checked = true;
      },
      dispatchEvent() {},
    };
    const radioNo = {
      tagName: "INPUT",
      type: "radio",
      checked: false,
      click() {
        this.checked = true;
      },
      dispatchEvent() {},
    };

    questions.push({
      id: `q_${i}`,
      questionText: i === 7 ? "Punctual in evaluating tests and assignments" : `Question number ${i}`,
      type: "yes_no",
      isMandatory: true,
      controls: {
        yesElement: radioYes,
        yesRadio: radioYes,
        noElement: radioNo,
        noRadio: radioNo,
      },
    });
  }

  // Preference: default YES, but question 7 overridden to NO
  const prefs = {
    defaultYesNo: "YES",
    overrides: {
      "Punctual in evaluating tests and assignments": "NO",
    },
  };

  const fillResult = await fillEntireForm({ questions, preferences: prefs });

  assert.equal(fillResult.total, 23);
  assert.equal(fillResult.filled, 23);
  assert.equal(fillResult.failed, 0);

  // Live state verification across all 23 questions
  const validation = validateQuestionnaire(questions);
  assert.equal(validation.total, 23);
  assert.equal(validation.answeredCount, 23);
  assert.equal(validation.unansweredCount, 0);
  assert.equal(validation.failedCount, 0);
  assert.equal(validation.completionPercentage, 100);
  assert.equal(validation.isFullyAnswered, true);
  assert.equal(validation.answeredYesCount, 22);
  assert.equal(validation.answeredNoCount, 1);
  assert.equal(validation.summary, "23 / 23 (100%)");

  // Verify that question 7 specifically got NO
  assert.equal(questions[6].controls.noRadio.checked, true);
  assert.equal(questions[6].controls.yesRadio.checked, false);
  assert.equal(questions[6].currentValue, "NO");

  // Verify other questions got YES
  assert.equal(questions[0].controls.yesRadio.checked, true);
  assert.equal(questions[0].currentValue, "YES");
});

test("Custom button-based YES/NO controls are parsed, filled, and verified", async () => {
  const classListYes = new Set(["btn", "btn-outline-success"]);
  const classListNo = new Set(["btn", "btn-outline-danger"]);

  const btnYes = {
    tagName: "BUTTON",
    textContent: "YES",
    className: "btn btn-outline-success",
    classList: {
      contains: (c) => classListYes.has(c),
      add: (c) => classListYes.add(c),
      remove: (c) => classListYes.delete(c),
    },
    click() {
      classListYes.add("active");
    },
    dispatchEvent() {},
    getAttribute: () => null,
  };

  const btnNo = {
    tagName: "BUTTON",
    textContent: "NO",
    className: "btn btn-outline-danger",
    classList: {
      contains: (c) => classListNo.has(c),
      add: (c) => classListNo.add(c),
      remove: (c) => classListNo.delete(c),
    },
    click() {
      classListNo.add("active");
    },
    dispatchEvent() {},
    getAttribute: () => null,
  };

  const row = {
    cells: [
      { textContent: "1" },
      { textContent: "Complements theory with practical examples" },
      { textContent: "" },
    ],
    querySelectorAll(sel) {
      if (sel === 'input[type="radio"]') return [];
      if (sel.includes("button")) return [btnYes, btnNo];
      if (sel === "th") return [];
      return [];
    },
    querySelector: () => null,
  };

  const q = parseQuestionRow(row, 0, "Teaching Evaluation");
  assert.ok(q);
  assert.equal(q.questionText, "Complements theory with practical examples");
  assert.equal(q.type, "yes_no");
  assert.equal(q.controls.yesElement, btnYes);
  assert.equal(q.controls.noElement, btnNo);

  // Fill the question
  const fillResult = await fillEntireForm({
    questions: [q],
    preferences: { defaultYesNo: "YES" },
  });

  assert.equal(fillResult.filled, 1);
  assert.equal(fillResult.failed, 0);
  assert.equal(q.currentValue, "YES");
  assert.equal(q.isAnswered, true);

  const validation = validateQuestionnaire([q]);
  assert.equal(validation.answeredCount, 1);
  assert.equal(validation.completionPercentage, 100);
  assert.equal(validation.isFullyAnswered, true);
});

test("extractQuestionnaireMetadata extracts course, code, and faculty accurately", () => {
  const mockDoc = {
    querySelectorAll(sel) {
      if (sel === "p, span, div, td, th, label, h1, h2, h3, h4, h5, li") {
        return [
          { children: [], textContent: "Course Name: Cloud Infrastructures & Virtualization (CS1601)" },
          { children: [], textContent: "Faculty Name: Dr. Ankit Sharma" },
          { children: [], textContent: "Academic Session: 2025-26 Odd Semester" },
        ];
      }
      return [];
    },
    querySelector: () => null,
  };

  const meta = extractQuestionnaireMetadata(mockDoc);
  assert.equal(meta.courseName, "Cloud Infrastructures & Virtualization");
  assert.equal(meta.courseCode, "CS1601");
  assert.equal(meta.facultyName, "Dr. Ankit Sharma");
  assert.equal(meta.academicSession, "2025-26 Odd Semester");
});
