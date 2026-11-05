import { STORAGE_KEYS, DEFAULT_FEEDBACK_PREFERENCES } from "../../shared/constants.js";
import { logError, logInfo } from "../../shared/logger.js";

/**
 * Loads student feedback preferences from chrome.storage.local
 * Falls back to DEFAULT_FEEDBACK_PREFERENCES if none are stored.
 */
export async function loadFeedbackPreferences() {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_KEYS.feedbackPreferences);
      const stored = data?.[STORAGE_KEYS.feedbackPreferences];
      if (stored && typeof stored === "object") {
        return {
          ...DEFAULT_FEEDBACK_PREFERENCES,
          ...stored,
          overrides: {
            ...(DEFAULT_FEEDBACK_PREFERENCES.overrides || {}),
            ...(stored.overrides || {}),
          },
        };
      }
    }
  } catch (err) {
    logError("failed to load feedback preferences", err);
  }
  return { ...DEFAULT_FEEDBACK_PREFERENCES, overrides: { ...DEFAULT_FEEDBACK_PREFERENCES.overrides } };
}

/**
 * Saves feedback preferences to chrome.storage.local
 */
export async function saveFeedbackPreferences(prefs) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.feedbackPreferences]: prefs,
      });
      logInfo("saved feedback preferences", prefs);
      return true;
    }
  } catch (err) {
    logError("failed to save feedback preferences", err);
  }
  return false;
}

/**
 * Restores feedback preferences back to default
 */
export async function resetFeedbackPreferences() {
  return saveFeedbackPreferences({ ...DEFAULT_FEEDBACK_PREFERENCES });
}

/**
 * Loads feedback draft for a specific course & session
 */
export async function loadFeedbackDraft(courseKey, session = "current") {
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

/**
 * Saves feedback draft for a specific course & session
 */
export async function saveFeedbackDraft(courseKey, session = "current", answers = {}) {
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
        updatedAt: new Date().toISOString(),
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.feedbackDrafts]: drafts });
      return true;
    }
  } catch (err) {
    logError("failed to save feedback draft", err);
  }
  return false;
}

/**
 * Clears feedback draft for a specific course & session
 */
export async function clearFeedbackDraft(courseKey, session = "current") {
  if (!courseKey) return false;
  const key = `${courseKey}_${session}`.toUpperCase();
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const data = await chrome.storage.local.get(STORAGE_KEYS.feedbackDrafts);
      const drafts = data?.[STORAGE_KEYS.feedbackDrafts] || {};
      if (drafts[key]) {
        delete drafts[key];
        await chrome.storage.local.set({ [STORAGE_KEYS.feedbackDrafts]: drafts });
      }
      return true;
    }
  } catch (err) {
    logError("failed to clear feedback draft", err);
  }
  return false;
}

/**
 * Loads tracked courses and their completion status
 */
export async function loadFeedbackTracker() {
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

/**
 * Saves tracked courses and their completion status
 */
export async function saveFeedbackTracker(tracker) {
  try {
    if (typeof chrome !== "undefined" && chrome.storage?.local) {
      const payload = {
        courses: tracker.courses || [],
        lastUpdated: new Date().toISOString(),
      };
      await chrome.storage.local.set({ [STORAGE_KEYS.feedbackTracker]: payload });
      return true;
    }
  } catch (err) {
    logError("failed to save feedback tracker", err);
  }
  return false;
}

/**
 * Updates a single course's status in the feedback tracker
 */
export async function updateCourseStatus(courseKey, status) {
  if (!courseKey) return;
  const tracker = await loadFeedbackTracker();
  const normKey = courseKey.trim().toUpperCase();
  let found = false;
  tracker.courses = tracker.courses.map((c) => {
    const cKey = (c.courseCode || c.courseName || "").trim().toUpperCase();
    if (cKey === normKey || c.id === normKey) {
      found = true;
      return { ...c, status, completedAt: status === "Completed" ? new Date().toISOString() : c.completedAt };
    }
    return c;
  });
  if (!found) {
    tracker.courses.push({
      courseCode: courseKey,
      status,
      completedAt: status === "Completed" ? new Date().toISOString() : null,
    });
  }
  await saveFeedbackTracker(tracker);
}
