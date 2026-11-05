/**
 * Smart Answer Matcher
 *
 * Matches questions against student preferences and individual question overrides.
 * Uses question text normalization and fuzzy option scoring.
 */

/**
 * Normalizes question text for robust cross-semester comparison
 */
export function normalizeQuestionText(text) {
  if (!text) return "";
  return text
    .trim()
    .toLowerCase()
    .replace(/^(\(?\d+[\.\)]|\(?[a-z0-9]+\)[\.\)]?|q\d+[:\-]|question\s*\d+[:\-]|parameter\s*\d+[:\-])\s*/i, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Determines the target answer for a question based on user preferences and overrides
 */
export function matchAnswer(question, preferences = {}) {
  const normQ = normalizeQuestionText(question.questionText);
  const overrides = preferences.overrides || {};

  // 1. Check for individual question override
  for (const [rawKey, overrideVal] of Object.entries(overrides)) {
    const normKey = normalizeQuestionText(rawKey);
    if (normKey === normQ || (normKey.length > 8 && (normQ.includes(normKey) || normKey.includes(normQ)))) {
      return {
        targetValue: overrideVal,
        confidence: "high",
        isOverridden: true,
        reason: `Matched custom override for "${rawKey}"`,
      };
    }
  }

  // 2. Handle YES/NO Questions
  if (question.type === "yes_no") {
    const defaultAnswer = (preferences.defaultYesNo || "YES").toUpperCase();
    return {
      targetValue: defaultAnswer === "NO" ? "NO" : "YES",
      confidence: "high",
      isOverridden: false,
      reason: "Global default YES/NO preference",
    };
  }

  // 3. Handle Dropdown Questions
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
          reason: `Matched custom dropdown preference "${customValue}"`,
        };
      }
    }

    // Default strategy: select highest positive rating or highest agreement
    const scoredOption = pickBestDropdownOption(options, strategy);
    if (scoredOption) {
      return {
        targetValue: scoredOption.value,
        matchedOption: scoredOption,
        confidence: "high",
        isOverridden: false,
        reason: "Highest positive agreement strategy",
      };
    }

    return {
      targetValue: options[0]?.value || null,
      matchedOption: options[0] || null,
      confidence: "medium",
      isOverridden: false,
      reason: "First available option fallback",
    };
  }

  // 4. Handle Rating Scales
  if (question.type === "rating") {
    const options = question.controls?.options || [];
    // Pick the highest rating option (e.g. 5 out of 5)
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
      reason: "Highest rating scale preference",
    };
  }

  // 5. Handle Comments / Suggestions
  if (question.type === "comment") {
    if (preferences.fillComments === false) {
      return {
        targetValue: "",
        confidence: "high",
        isOverridden: false,
        reason: "Comments disabled in preferences",
      };
    }

    const defaultComment =
      preferences.defaultComment ||
      "The course was well structured and classes were conducted regularly with clear explanations.";

    return {
      targetValue: defaultComment,
      confidence: "high",
      isOverridden: false,
      reason: "Default constructive comment",
    };
  }

  return {
    targetValue: null,
    confidence: "low",
    isOverridden: false,
    reason: "Unknown question type",
  };
}

/**
 * Ranks dropdown options based on positive sentiment / agreement
 */
export function pickBestDropdownOption(options, strategy = "highest_positive") {
  if (!options || options.length === 0) return null;

  const positivityScores = [
    { patterns: ["strongly agree", "highly satisfied", "completely satisfied", "very high", "excellent"], score: 100 },
    { patterns: ["agree", "satisfied", "high", "good", "very good"], score: 80 },
    { patterns: ["neutral", "moderate", "average", "fair"], score: 50 },
    { patterns: ["disagree", "dissatisfied", "low", "poor"], score: 20 },
    { patterns: ["strongly disagree", "highly dissatisfied", "very low"], score: 0 },
  ];

  let bestOption = null;
  let maxScore = -1;

  for (const opt of options) {
    const text = (opt.text || "").toLowerCase().trim();
    if (!text || text.startsWith("--") || text.includes("select")) continue;

    // Check if numeric (1 to 5)
    const num = parseFloat(opt.value || text);
    if (!isNaN(num) && num >= 1 && num <= 10) {
      const score = num * 10;
      if (score > maxScore) {
        maxScore = score;
        bestOption = opt;
      }
      continue;
    }

    // Match textual sentiment
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

  // If no sentiment matched, pick first valid non-placeholder option
  return bestOption || options.find((o) => o.value !== "" && !o.text.startsWith("--")) || options[0];
}
