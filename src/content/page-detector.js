import { PAGE_KINDS } from "../shared/constants.js";

export function detectPage(doc = document, href = location.href) {
  const url = new URL(href);
  const path = url.pathname.toLowerCase();
  const title = (doc.title || "").toLowerCase();
  const heading = collectHeadings(doc);
  const body = `${title} ${heading} ${path}`;

  if (/\/home\/logout|\/account\/login|signin|student login/.test(body) && findPasswordField(doc)) {
    return { kind: PAGE_KINDS.login, reason: "login-form" };
  }
  if (matches(body, ["attendance", "attendence"]) || /attendance/.test(path)) {
    return { kind: PAGE_KINDS.attendance, reason: "path-or-heading" };
  }
  if (matches(body, ["internal mark", "internal marks", "sessional", "continuous assessment"])) {
    return { kind: PAGE_KINDS.marks, reason: "path-or-heading" };
  }
  if (matches(body, ["grade card", "grades", "grade sheet", "gradesheet", "sgpa", "cgpa", "examination"]) || /grade|cgpaga|examination/.test(path)) {
    return { kind: PAGE_KINDS.grades, reason: "path-or-heading" };
  }
  if (matches(body, ["time table", "timetable", "calendar", "schedule"]) || /calendar|timetable|time-table/.test(path)) {
    return { kind: PAGE_KINDS.timetable, reason: "path-or-heading" };
  }
  if (
    matches(body, ["dashboard", "student home", "welcome"]) ||
    /\/student\/?$|\/home\/index|\/student\/home/.test(path)
  ) {
    return { kind: PAGE_KINDS.home, reason: "home" };
  }
  return { kind: PAGE_KINDS.other, reason: "unclassified" };
}

function collectHeadings(doc) {
  return [...doc.querySelectorAll("h1,h2,h3,.kt-subheader__title,.page-title,.breadcrumb")]
    .slice(0, 8)
    .map((node) => node.textContent)
    .join(" ")
    .toLowerCase();
}

function findPasswordField(doc) {
  return Boolean(doc.querySelector('input[type="password"]'));
}

function matches(text, needles) {
  return needles.some((needle) => text.includes(needle));
}
