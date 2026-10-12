import { loadPreferences, resetPreferences, savePreferences } from "../storage/preferences.js";

async function fill() {
  const prefs = await loadPreferences();
  document.getElementById("threshold").value = prefs.attendanceThreshold;
  document.getElementById("band").value = prefs.borderlineBand;
  document.getElementById("cap").value = prefs.gradeCap;

  const weights = prefs.assumedInternalWeights || {};
  document.getElementById("w-mte").value = weights.mte ?? 30;
  document.getElementById("w-cws").value = weights.cws ?? 30;
  document.getElementById("w-ete").value = weights.ete ?? 40;

  document.getElementById("bounds").value = JSON.stringify(prefs.absoluteGradeBoundaries || [], null, 2);
}

document.getElementById("save").addEventListener("click", async () => {
  const msg = document.getElementById("msg");
  try {
    const rawBounds = document.getElementById("bounds").value.trim();
    const absoluteGradeBoundaries = rawBounds ? JSON.parse(rawBounds) : [];
    if (!Array.isArray(absoluteGradeBoundaries)) throw new Error("Boundaries must be a valid JSON array.");

    const mte = Number(document.getElementById("w-mte").value) || 30;
    const cws = Number(document.getElementById("w-cws").value) || 30;
    const ete = Number(document.getElementById("w-ete").value) || 40;

    await savePreferences({
      attendanceThreshold: Math.max(1, Math.min(100, Number(document.getElementById("threshold").value) || 75)),
      borderlineBand: Math.max(0, Math.min(25, Number(document.getElementById("band").value) || 5)),
      gradeCap: Math.max(1, Math.min(10, Number(document.getElementById("cap").value) || 10)),
      assumedInternalWeights: { mte, cws, ete, source: "user-configured" },
      absoluteGradeBoundaries,
    });

    msg.textContent = "✓ Preferences saved successfully.";
    setTimeout(() => {
      msg.textContent = "";
    }, 3000);
  } catch (error) {
    msg.textContent = `Error: ${error.message}`;
  }
});

document.getElementById("reset").addEventListener("click", async () => {
  await resetPreferences();
  await fill();
  const msg = document.getElementById("msg");
  msg.textContent = "✓ Factory defaults restored.";
  setTimeout(() => {
    msg.textContent = "";
  }, 3000);
});

fill();
