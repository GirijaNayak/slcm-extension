import { loadPreferences, savePreferences } from "../storage/preferences.js";
import { loadCache, resetCache } from "../storage/cache.js";

const statusEl = document.getElementById("status");

async function init() {
  const prefs = await loadPreferences();
  const cache = await loadCache();

  document.querySelectorAll("[data-feature]").forEach((input) => {
    input.checked = Boolean(prefs.features[input.dataset.feature]);
    input.addEventListener("change", async () => {
      await savePreferences({ features: { [input.dataset.feature]: input.checked } });
    });
  });

  const threshold = document.getElementById("threshold");
  const theme = document.getElementById("theme");
  const refresh = document.getElementById("refresh");

  threshold.value = prefs.attendanceThreshold;
  theme.value = prefs.theme;
  refresh.value = prefs.autoRefreshMinutes;

  threshold.addEventListener("change", () =>
    savePreferences({ attendanceThreshold: Math.max(1, Math.min(100, Number(threshold.value) || 75)) }),
  );
  theme.addEventListener("change", () => savePreferences({ theme: theme.value }));
  refresh.addEventListener("change", () =>
    savePreferences({ autoRefreshMinutes: Math.max(0, Number(refresh.value) || 0) }),
  );

  if (cache.updatedAt) {
    const d = new Date(cache.updatedAt);
    statusEl.innerHTML = `
      <strong>Connected to SLCM Session</strong><br>
      Last synced: ${d.toLocaleDateString()} at ${d.toLocaleTimeString()}.
    `;
  } else {
    statusEl.innerHTML = `
      <strong>No Local Academic Cache Yet</strong><br>
      Log in to <a href="https://mujslcm.jaipur.manipal.edu" target="_blank" style="color:var(--accent)">MUJ SLCM</a> to activate enhancements.
    `;
  }
}

document.getElementById("cache").addEventListener("click", async () => {
  await resetCache();
  statusEl.innerHTML = `<strong>Local cache cleared.</strong> Data will re-sync upon your next SLCM visit.`;
});

document.getElementById("options").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

init();
