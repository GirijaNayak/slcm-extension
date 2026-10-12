import { logInfo } from "../shared/logger.js";

chrome.runtime.onInstalled.addListener(() => {
  logInfo("installed", { kind: "service-worker" });
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message?.type === "mujx.ping") {
    sendResponse({ ok: true, tab: sender.tab?.id || null });
  }
  return false;
});
