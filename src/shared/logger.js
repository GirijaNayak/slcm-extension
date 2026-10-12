const PREFIX = "[MUJX]";

export function logInfo(message, meta = {}) {
  console.info(PREFIX, message, sanitize(meta));
}

export function logWarn(message, meta = {}) {
  console.warn(PREFIX, message, sanitize(meta));
}

export function logError(message, meta = {}) {
  console.error(PREFIX, message, sanitize(meta));
}

function sanitize(meta) {
  const allowed = {};
  for (const [key, value] of Object.entries(meta)) {
    if (["status", "path", "kind", "code", "timeout", "retry"].includes(key)) {
      allowed[key] = value;
    }
  }
  return allowed;
}
