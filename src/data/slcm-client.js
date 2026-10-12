import { CANDIDATE_ENDPOINTS } from "../shared/constants.js";
import { logWarn } from "../shared/logger.js";

const inflight = new Map();

export class SessionExpiredError extends Error {
  constructor(path) {
    super("SLCM session expired or login is required.");
    this.name = "SessionExpiredError";
    this.path = path;
  }
}

export async function slcmRequest(path, { method = "POST", body, timeoutMs = 12000, retries = 1 } = {}) {
  const key = `${method}:${path}:${typeof body === "string" ? body : JSON.stringify(body || {})}`;
  if (inflight.has(key)) return inflight.get(key);
  const task = runWithRetry(path, method, body, timeoutMs, retries);
  inflight.set(key, task);
  try {
    return await task;
  } finally {
    inflight.delete(key);
  }
}

async function runWithRetry(path, method, body, timeoutMs, retries) {
  let lastError;
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await once(path, method, body, timeoutMs);
    } catch (error) {
      lastError = error;
      if (error instanceof SessionExpiredError) throw error;
      if (attempt === retries) break;
      await wait(300 * (attempt + 1));
    }
  }
  throw lastError;
}

async function once(path, method, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const token = readAntiForgeryToken();
    const headers = {
      Accept: "application/json, text/plain, */*",
      "X-Requested-With": "XMLHttpRequest",
    };
    let payload = body;
    if (method !== "GET") {
      headers["Content-Type"] = "application/x-www-form-urlencoded; charset=UTF-8";
      const params = new URLSearchParams(body || {});
      if (token && !params.has("__RequestVerificationToken")) {
        params.set("__RequestVerificationToken", token);
      }
      payload = params.toString();
    }
    const response = await fetch(path, {
      method,
      headers,
      body: method === "GET" ? undefined : payload,
      credentials: "include",
      signal: controller.signal,
    });
    if (response.redirected && /login|logout/i.test(response.url)) {
      throw new SessionExpiredError(path);
    }
    const contentType = response.headers.get("content-type") || "";
    const text = await response.text();
    if (/login|sign in/i.test(text) && /password/i.test(text) && text.length > 400) {
      throw new SessionExpiredError(path);
    }
    if (!response.ok) {
      logWarn("request failed", { status: response.status, path });
      const error = new Error(`HTTP ${response.status}`);
      error.status = response.status;
      error.path = path;
      error.bodyPreview = text.slice(0, 80);
      throw error;
    }
    if (contentType.includes("json") || looksJson(text)) {
      return { ok: true, data: JSON.parse(text), path };
    }
    return { ok: true, data: text, path, kind: "html" };
  } finally {
    clearTimeout(timer);
  }
}

export function readAntiForgeryToken() {
  const input = document.querySelector('input[name="__RequestVerificationToken"]');
  return input?.value || "";
}

export async function tryKnownEndpoints() {
  const results = {};
  for (const [name, path] of Object.entries(CANDIDATE_ENDPOINTS)) {
    try {
      results[name] = await slcmRequest(path, { retries: 0 });
    } catch (error) {
      results[name] = {
        ok: false,
        error: error.name,
        status: error.status || null,
        path,
      };
    }
  }
  return results;
}

function looksJson(text) {
  const trimmed = text.trim();
  return trimmed.startsWith("{") || trimmed.startsWith("[");
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
