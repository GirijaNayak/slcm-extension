/**
 * Form Validation & State Verification Engine
 *
 * Verifies live DOM elements across all questionnaire sections to confirm:
 * - Specific selection state: answered_yes, answered_no, unanswered, failed
 * - Dropdown value selections
 * - Rating scale option choices
 * - Comments / suggestions input
 * - Live progress calculation: Answered / Total (Percentage)
 */

export function validateQuestionnaire(questions = []) {
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
      summary: "0 / 0 (0%)",
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
      // Mandatory questions or evaluative questions (YES/NO, dropdown, rating)
      if (q.isMandatory || q.type !== "comment") {
        unansweredList.push({
          ...q,
          reason: check.reason,
        });
      }
    }
  }

  const total = questions.length;
  const unansweredCount = unansweredList.length;
  const failedCount = failedList.length;
  const completionPercentage = total > 0 ? Math.round((answeredCount / total) * 100) : 0;
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
    summary: `${answeredCount} / ${total} (${completionPercentage}%)`,
  };
}

/**
 * Checks the live DOM state of a single question
 * Returns status: "answered_yes" | "answered_no" | "answered" | "unanswered" | "failed" | "unmatched"
 */
export function checkQuestionState(question) {
  if (!question) {
    return {
      isAnswered: false,
      status: "unmatched",
      currentValue: null,
      reason: "Question object is null or undefined",
    };
  }

  // 1. YES/NO Check
  if (question.type === "yes_no") {
    const { yesElement, yesRadio, yesLabel, noElement, noRadio, noLabel } =
      question.controls || {};

    const isYes =
      Boolean(yesRadio && yesRadio.checked) ||
      isElementActive(yesElement) ||
      isElementActive(yesLabel);

    const isNo =
      Boolean(noRadio && noRadio.checked) ||
      isElementActive(noElement) ||
      isElementActive(noLabel);

    if (isYes && !isNo) {
      return {
        isAnswered: true,
        status: "answered_yes",
        currentValue: "YES",
      };
    }

    if (isNo && !isYes) {
      return {
        isAnswered: true,
        status: "answered_no",
        currentValue: "NO",
      };
    }

    if (isYes && isNo) {
      // Both flagged active in DOM; check actual radio inputs as tie-breaker
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
        reason: "Both YES and NO controls flagged active; defaulted to YES",
      };
    }

    return {
      isAnswered: false,
      status: "unanswered",
      currentValue: null,
      reason: "Neither YES nor NO selected",
    };
  }

  // 2. Dropdown Check
  if (question.type === "dropdown") {
    const select = question.controls?.selectElement;
    if (!select) {
      return {
        isAnswered: false,
        status: "failed",
        currentValue: null,
        reason: "Select DOM element missing",
      };
    }

    const val = (select.value || "").trim();
    const selectedOpt =
      select.options && select.selectedIndex >= 0 ? select.options[select.selectedIndex] : null;
    const text = (selectedOpt?.textContent || "").trim();

    if (
      val !== "" &&
      !text.startsWith("--") &&
      !text.toLowerCase().includes("select") &&
      !text.toLowerCase().includes("choose")
    ) {
      return {
        isAnswered: true,
        status: "answered",
        currentValue: text || val,
      };
    }

    return {
      isAnswered: false,
      status: "unanswered",
      currentValue: null,
      reason: "No valid dropdown option chosen",
    };
  }

  // 3. Rating Check
  if (question.type === "rating") {
    const options = question.controls?.options || [];
    const checked = options.find(
      (o) => o.element && (o.element.checked || isElementActive(o.element))
    );
    if (checked) {
      return {
        isAnswered: true,
        status: "answered",
        currentValue: checked.label || checked.value,
      };
    }
    return {
      isAnswered: false,
      status: "unanswered",
      currentValue: null,
      reason: "No rating score selected",
    };
  }

  // 4. Comments Check
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
        currentValue: val,
      };
    }
    if (question.isMandatory) {
      return {
        isAnswered: false,
        status: "unanswered",
        currentValue: "",
        reason: "Mandatory comment field is empty",
      };
    }
    return {
      isAnswered: false,
      status: "unanswered",
      isOptional: true,
      currentValue: "",
      reason: "Optional comment not provided",
    };
  }

  return {
    isAnswered: false,
    status: "unmatched",
    currentValue: null,
    reason: "Unknown question structure",
  };
}

/**
 * Checks whether an element is visually or functionally selected
 */
export function isElementActive(el) {
  if (!el) return false;
  if (el.tagName === "INPUT" && (el.type === "radio" || el.type === "checkbox")) {
    return el.checked;
  }

  const hasClass = (c) => {
    try {
      if (typeof el.classList?.contains === "function") return el.classList.contains(c);
    } catch (_) {}
    const cls = (el.className || "").toLowerCase();
    return cls.includes(c);
  };

  const ariaPressed = el.getAttribute?.("aria-pressed");
  const ariaChecked = el.getAttribute?.("aria-checked");
  const nestedChecked = Boolean(
    el.querySelector?.('input[type="radio"]:checked, input[type="checkbox"]:checked')
  );

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

/**
 * Smoothly scrolls to a question and triggers a visual highlight animation
 */
export function scrollToQuestion(question) {
  if (!question?.element) return;

  const el = question.element;
  try {
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  } catch (_) {
    try {
      el.scrollIntoView();
    } catch (_) {}
  }

  // Add temporary pulsing highlight class
  el.classList.add("mujx-highlight-unanswered");
  setTimeout(() => {
    el.classList.remove("mujx-highlight-unanswered");
  }, 2800);

  // Focus the first interactive control
  const focusable = el.querySelector("input, select, textarea, button");
  if (focusable) {
    try {
      focusable.focus({ preventScroll: true });
    } catch (_) {}
  }
}
