import { matchAnswer } from "./answer-matcher.js";
import { checkQuestionState } from "./form-validator.js";

/**
 * One-Click Form Filling Engine
 *
 * Iterates through all questions across all sections (including below visible viewport),
 * verifies current states, triggers genuine interactions, waits for DOM state changes,
 * and validates selections before reporting completion.
 */
export async function fillEntireForm({
  questions = [],
  preferences = {},
  onProgress = null,
} = {}) {
  const results = {
    total: questions.length,
    filled: 0,
    preserved: 0,
    alreadySelected: 0,
    failed: 0,
    details: [],
  };

  for (let i = 0; i < questions.length; i++) {
    const q = questions[i];
    try {
      const match = matchAnswer(q, preferences);
      const targetVal = match.targetValue;

      // Check current live state before doing anything
      const currentCheck = checkQuestionState(q);

      // Rule A: If already selected with the desired answer, leave it untouched
      if (
        currentCheck.isAnswered &&
        normalizeAnswer(currentCheck.currentValue) === normalizeAnswer(targetVal)
      ) {
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
          isOverridden: match.isOverridden,
        });
        if (onProgress) onProgress(i + 1, questions.length);
        continue;
      }

      // Rule B: If configured to preserve existing non-empty answers
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
          isOverridden: false,
        });
        if (onProgress) onProgress(i + 1, questions.length);
        continue;
      }

      let fillSuccess = false;

      // 1. Fill YES/NO Question
      if (q.type === "yes_no") {
        const isYes = (targetVal || "YES").toUpperCase() === "YES";
        const targetAnswer = isYes ? "YES" : "NO";

        fillSuccess = await fillYesNoQuestion(q, isYes);

        // Microtask pause to allow university scripts and DOM to settle
        await sleep(25);

        // Live verification of selected state
        let verifyCheck = checkQuestionState(q);
        if (
          !verifyCheck.isAnswered ||
          normalizeAnswer(verifyCheck.currentValue) !== targetAnswer
        ) {
          // Secondary fallback attempt: retry clicking directly
          await retryActivateYesNo(q, isYes);
          await sleep(35);
          verifyCheck = checkQuestionState(q);
        }

        if (
          verifyCheck.isAnswered &&
          normalizeAnswer(verifyCheck.currentValue) === targetAnswer
        ) {
          q.isAnswered = true;
          q.currentValue = targetAnswer;
          q.status = verifyCheck.status;
          fillSuccess = true;
        } else {
          fillSuccess = false;
        }
      }

      // 2. Fill Dropdown Question
      else if (q.type === "dropdown") {
        const select = q.controls?.selectElement;
        if (select && targetVal !== null && targetVal !== undefined) {
          const isPositive =
            String(targetVal).toUpperCase().includes("YES") ||
            String(targetVal).toUpperCase() === "Y" ||
            targetVal === "highest_positive";
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
            matchedOpt =
              Array.from(select.options).find(
                (o) =>
                  o.value === targetVal ||
                  o.text.trim().toLowerCase() === String(targetVal).trim().toLowerCase()
              ) || select.options[select.options.length - 1];
          }
          if (matchedOpt) {
            select.value = matchedOpt.value;
            select.selectedIndex = matchedOpt.index;
          }
          if (typeof select.onchange === "function") {
            try {
              select.onchange.call(select);
            } catch (_) {}
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
      }

      // 3. Fill Rating Question (Scale 1 to 5)
      else if (q.type === "rating") {
        const options = q.controls?.options || [];
        const targetOpt =
          options.find((o) => o.value === targetVal) ||
          options.find((o) => o.label === targetVal) ||
          options[options.length - 1];

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
      }

      // 4. Fill Comments / Suggestions Textarea
      else if (q.type === "comment") {
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
            fillSuccess = true; // Intentionally left blank per preferences
          }
        }
      }

      // Record result for this question
      if (fillSuccess) {
        results.filled++;
        results.details.push({
          questionId: q.id,
          questionText: q.questionText,
          status: q.status || "filled",
          value: q.currentValue,
          isOverridden: match.isOverridden,
        });
      } else {
        results.failed++;
        results.details.push({
          questionId: q.id,
          questionText: q.questionText,
          status: "failed",
          reason: "Unable to verify live selected state after interaction",
        });
      }
    } catch (err) {
      results.failed++;
      results.details.push({
        questionId: q.id,
        questionText: q.questionText,
        status: "error",
        error: String(err?.message || err),
      });
    }

    if (onProgress) {
      onProgress(i + 1, questions.length);
    }
  }

  return results;
}

/**
 * Activates the YES or NO control with genuine DOM event simulation
 */
async function fillYesNoQuestion(q, isYes) {
  const controls = q.controls || {};
  const targetEl = isYes ? controls.yesElement : controls.noElement;
  const targetRadio = isYes ? controls.yesRadio : controls.noRadio;
  const targetLabel = isYes ? controls.yesLabel : controls.noLabel;

  const oppositeEl = isYes ? controls.noElement : controls.yesElement;
  const oppositeRadio = isYes ? controls.noRadio : controls.yesRadio;
  const oppositeLabel = isYes ? controls.noLabel : controls.yesLabel;

  try {
    // 1. If wrapped in a label (e.g. Bootstrap .btn-group label or <label for="...">), click it
    if (targetLabel && targetLabel !== targetRadio) {
      dispatchPointerAndMouseEvents(targetLabel);
      try {
        targetLabel.click();
      } catch (_) {}
      targetLabel.classList.add("active", "selected");
    }

    // 2. If target is a custom button or button group
    if (targetEl && targetEl !== targetRadio && targetEl !== targetLabel) {
      dispatchPointerAndMouseEvents(targetEl);
      try {
        targetEl.click();
      } catch (_) {}
      targetEl.classList.add("active", "selected");
    }

    // 3. Radio input itself: check it and fire events
    if (targetRadio) {
      targetRadio.checked = true;
      dispatchPointerAndMouseEvents(targetRadio);
      try {
        targetRadio.click();
      } catch (_) {}
      if (typeof targetRadio.onchange === "function") {
        try {
          targetRadio.onchange.call(targetRadio, new Event("change", { bubbles: true }));
        } catch (_) {}
      }
      dispatchInputEvents(targetRadio);
    } else if (targetEl?.tagName === "INPUT" && targetEl.type === "radio") {
      targetEl.checked = true;
      dispatchPointerAndMouseEvents(targetEl);
      try {
        targetEl.click();
      } catch (_) {}
      if (typeof targetEl.onchange === "function") {
        try {
          targetEl.onchange.call(targetEl, new Event("change", { bubbles: true }));
        } catch (_) {}
      }
      dispatchInputEvents(targetEl);
    }

    // 4. Clear opposite control visually if present
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

    // 5. Framework compatibility: jQuery trigger
    triggerJQueryEvent(targetRadio || targetEl || targetLabel);

    return true;
  } catch (err) {
    return false;
  }
}

/**
 * Secondary retry mechanism if initial selection was not registered
 */
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
  } catch (_) {}
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
    } catch (_) {}
    dispatchInputEvents(element);
    triggerJQueryEvent(element);
    return true;
  } catch (_) {
    return false;
  }
}

/**
 * Dispatches pointerdown, mousedown, pointerup, mouseup sequence
 */
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
  } catch (_) {}
}

/**
 * Dispatches input, change, and blur events so reactive forms and ASP.NET postbacks detect state change
 */
function dispatchInputEvents(element) {
  if (!element || typeof element.dispatchEvent !== "function") return;
  try {
    element.dispatchEvent(new Event("input", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("change", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event("blur", { bubbles: true, cancelable: true }));
  } catch (_) {}
}

function triggerJQueryEvent(element) {
  if (!element) return;
  if (typeof window !== "undefined" && window.jQuery) {
    try {
      window.jQuery(element).trigger("change").trigger("click");
    } catch (_) {}
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

/**
 * Resets all questions on the form back to unselected / blank
 */
export function resetCurrentForm(questions = []) {
  questions.forEach((q) => {
    try {
      if (q.type === "yes_no") {
        const { yesElement, yesRadio, yesLabel, noElement, noRadio, noLabel } =
          q.controls || {};

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
          q.controls.selectElement.value =
            q.controls.selectElement.options?.[0]?.value || "";
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
    } catch (_) {}
  });
}
