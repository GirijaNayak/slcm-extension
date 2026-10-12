import { DEFAULT_PREFERENCES, STORAGE_KEYS } from "../shared/constants.js";

export async function loadPreferences() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.preferences);
  return mergePrefs(DEFAULT_PREFERENCES, stored[STORAGE_KEYS.preferences] || {});
}

export async function savePreferences(patch) {
  const current = await loadPreferences();
  const next = mergePrefs(current, patch);
  await chrome.storage.local.set({ [STORAGE_KEYS.preferences]: next });
  return next;
}

export async function resetPreferences() {
  await chrome.storage.local.set({ [STORAGE_KEYS.preferences]: DEFAULT_PREFERENCES });
  return DEFAULT_PREFERENCES;
}

function mergePrefs(base, patch) {
  return {
    ...base,
    ...patch,
    features: { ...base.features, ...(patch.features || {}) },
    assumedInternalWeights: {
      ...base.assumedInternalWeights,
      ...(patch.assumedInternalWeights || {}),
    },
    absoluteGradeBoundaries: patch.absoluteGradeBoundaries ?? base.absoluteGradeBoundaries,
  };
}
