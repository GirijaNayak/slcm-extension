import { STORAGE_KEYS } from "../shared/constants.js";

const MAX_NOTIFICATIONS = 40;

export async function loadCache() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.cache);
  return stored[STORAGE_KEYS.cache] || { updatedAt: null, attendance: null, marks: null, grades: null, timetable: null };
}

export async function saveCache(partial) {
  const current = await loadCache();
  const next = { ...current, ...partial, updatedAt: new Date().toISOString() };
  await chrome.storage.local.set({ [STORAGE_KEYS.cache]: next });
  return next;
}

export async function resetCache() {
  await chrome.storage.local.remove([
    STORAGE_KEYS.cache,
    STORAGE_KEYS.notifications,
    STORAGE_KEYS.dismissed,
    STORAGE_KEYS.timetableSnapshot,
  ]);
}

export async function loadNotifications() {
  const stored = await chrome.storage.local.get([STORAGE_KEYS.notifications, STORAGE_KEYS.dismissed]);
  return {
    items: stored[STORAGE_KEYS.notifications] || [],
    dismissed: stored[STORAGE_KEYS.dismissed] || [],
  };
}

export async function recordNotifications(incoming) {
  const { items, dismissed } = await loadNotifications();
  const dismissedSet = new Set(dismissed);
  const existingIds = new Set(items.map((item) => item.id));
  const merged = [...items];
  for (const item of incoming) {
    if (dismissedSet.has(item.id) || existingIds.has(item.id)) continue;
    merged.unshift(item);
    existingIds.add(item.id);
  }
  const trimmed = merged.slice(0, MAX_NOTIFICATIONS);
  await chrome.storage.local.set({ [STORAGE_KEYS.notifications]: trimmed });
  return trimmed;
}

export async function dismissNotification(id) {
  const { items, dismissed } = await loadNotifications();
  const nextItems = items.filter((item) => item.id !== id);
  const nextDismissed = [...new Set([...dismissed, id])].slice(-200);
  await chrome.storage.local.set({
    [STORAGE_KEYS.notifications]: nextItems,
    [STORAGE_KEYS.dismissed]: nextDismissed,
  });
  return nextItems;
}

export async function loadTimetableSnapshot() {
  const stored = await chrome.storage.local.get(STORAGE_KEYS.timetableSnapshot);
  return stored[STORAGE_KEYS.timetableSnapshot] || null;
}

export async function saveTimetableSnapshot(snapshot) {
  await chrome.storage.local.set({ [STORAGE_KEYS.timetableSnapshot]: snapshot });
  return snapshot;
}
