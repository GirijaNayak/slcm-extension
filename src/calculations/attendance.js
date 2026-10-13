import { roundTo } from "./rounding.js";

export function validateCounts(present, total) {
  const issues = [];
  if (!Number.isFinite(present) || present < 0) issues.push("invalid_present");
  if (!Number.isFinite(total) || total < 0) issues.push("invalid_total");
  if (Number.isFinite(present) && Number.isFinite(total) && present > total) {
    issues.push("present_exceeds_total");
  }
  return issues;
}

export function attendancePercent(present, total) {
  const issues = validateCounts(present, total);
  if (issues.includes("invalid_present") || issues.includes("invalid_total")) {
    return { ok: false, percent: null, issues };
  }
  if (total === 0) {
    return { ok: false, percent: null, issues: [...issues, "zero_total"] };
  }
  return {
    ok: true,
    percent: roundTo((present / total) * 100, 2),
    issues,
  };
}

export function normalizeThreshold(thresholdPercent) {
  if (!Number.isFinite(thresholdPercent)) return null;
  if (thresholdPercent <= 0 || thresholdPercent > 100) return null;
  return thresholdPercent / 100;
}

export function safeSkips(present, total, thresholdPercent) {
  const issues = validateCounts(present, total);
  const t = normalizeThreshold(thresholdPercent);
  if (t === null) return { ok: false, skips: null, issues: [...issues, "invalid_threshold"] };
  if (issues.includes("invalid_present") || issues.includes("invalid_total")) {
    return { ok: false, skips: null, issues };
  }
  if (total === 0) return { ok: false, skips: null, issues: [...issues, "zero_total"] };
  if (present / total < t) return { ok: true, skips: 0, issues, reason: "already_below_threshold" };
  const raw = present / t - total;
  const skips = Math.max(0, Math.floor(raw + 1e-9));
  return { ok: true, skips, issues };
}

export function classesNeeded(present, total, thresholdPercent) {
  const issues = validateCounts(present, total);
  const t = normalizeThreshold(thresholdPercent);
  if (t === null) return { ok: false, needed: null, issues: [...issues, "invalid_threshold"] };
  if (issues.includes("invalid_present") || issues.includes("invalid_total")) {
    return { ok: false, needed: null, issues };
  }
  if (t === 1) {
    if (total === 0) return { ok: true, needed: 1, issues, reason: "perfect_attendance_required" };
    return {
      ok: true,
      needed: present === total ? 0 : null,
      issues,
      reason: present === total ? "already_met" : "impossible_unless_all_present",
    };
  }
  if (total === 0) {
    return { ok: true, needed: 0, issues, reason: "no_classes_yet" };
  }
  if (present / total >= t) return { ok: true, needed: 0, issues, reason: "already_met" };
  const needed = Math.ceil((t * total - present) / (1 - t) - 1e-9);
  return { ok: true, needed: Math.max(0, needed), issues };
}

export function simulateFuture(present, total, attend, miss, thresholdPercent) {
  const issues = validateCounts(present, total);
  if (!Number.isInteger(attend) || attend < 0) issues.push("invalid_attend");
  if (!Number.isInteger(miss) || miss < 0) issues.push("invalid_miss");
  const nextPresent = present + attend;
  const nextTotal = total + attend + miss;
  const percent = attendancePercent(nextPresent, nextTotal);
  const skips = safeSkips(nextPresent, nextTotal, thresholdPercent);
  const needed = classesNeeded(nextPresent, nextTotal, thresholdPercent);
  return {
    ok: percent.ok,
    present: nextPresent,
    total: nextTotal,
    percent: percent.percent,
    safeSkips: skips.skips,
    classesNeeded: needed.needed,
    issues: [...issues, ...percent.issues],
    assumption: "Future classes are hypothetical. Actual scheduling is unknown.",
  };
}

export function consecutiveRecovery(present, total, thresholdPercent) {
  const needed = classesNeeded(present, total, thresholdPercent);
  if (!needed.ok) return needed;
  return {
    ...needed,
    explanation:
      needed.needed === 0
        ? "Threshold already met."
        : `Attend the next ${needed.needed} class${needed.needed === 1 ? "" : "es"} in a row (assuming no additional misses).`,
  };
}

export function classifyStatus(percent, thresholdPercent, borderlineBand = 5) {
  if (!Number.isFinite(percent) || !Number.isFinite(thresholdPercent)) {
    return { code: "unknown", label: "Unknown" };
  }
  if (percent >= thresholdPercent) {
    if (percent < thresholdPercent + borderlineBand) {
      return { code: "borderline", label: "Borderline" };
    }
    return { code: "safe", label: "On track" };
  }
  if (percent >= thresholdPercent - borderlineBand) {
    return { code: "borderline", label: "At risk" };
  }
  return { code: "low", label: "Low" };
}

export function enhanceRecord(record, thresholdPercent, borderlineBand = 5) {
  const present = Number(record.present);
  const total = Number(record.total);
  const percent = attendancePercent(present, total);
  const skips = safeSkips(present, total, thresholdPercent);
  const needed = classesNeeded(present, total, thresholdPercent);
  const status = classifyStatus(percent.percent, thresholdPercent, borderlineBand);
  return {
    ...record,
    percent: percent.percent ?? record.percent ?? null,
    safeSkips: skips.skips,
    classesNeeded: needed.needed,
    status,
    issues: [...new Set([...(percent.issues || []), ...(skips.issues || []), ...(needed.issues || [])])],
  };
}

export function calculateOverallAttendance(records = [], thresholdPercent = 75) {
  let sumPresent = 0;
  let sumTotal = 0;
  let meeting = 0;
  let below = 0;
  let totalSafeSkips = 0;

  for (const r of records) {
    const p = Number(r.present);
    const n = Number(r.total);
    if (!Number.isFinite(p) || !Number.isFinite(n) || n <= 0) continue;
    sumPresent += p;
    sumTotal += n;

    const pct = (p / n) * 100;
    if (pct >= thresholdPercent) {
      meeting++;
      const skips = safeSkips(p, n, thresholdPercent);
      if (skips.ok && skips.skips > 0) {
        totalSafeSkips += skips.skips;
      }
    } else {
      below++;
    }
  }

  const overall = attendancePercent(sumPresent, sumTotal);
  return {
    sumPresent,
    sumTotal,
    overallPercent: overall.percent,
    coursesCount: meeting + below,
    coursesMeeting: meeting,
    coursesBelow: below,
    totalSafeSkips,
    allMeeting: below === 0 && meeting > 0,
  };
}

