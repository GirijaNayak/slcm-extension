import { PAGE_KINDS } from "../shared/constants.js";

export function isLoginPage(doc = document, href = location.href) {
  if (!doc) return false;

  let path = "";
  try {
    path = new URL(href).pathname.toLowerCase();
  } catch {
    path = String(href || "").toLowerCase();
  }

  // 1. If on any authenticated student route or dashboard, it is DEFINITELY NOT a login page!
  if (
    path.startsWith("/student") ||
    path.includes("/home/dashboard") ||
    path.includes("/academic") ||
    path.includes("/examination")
  ) {
    return false;
  }

  // 2. If authenticated portal elements exist (user header, sidebar brand, logout link), it is DEFINITELY NOT a login page!
  if (
    doc.querySelector?.(".kt-header__topbar-username") ||
    doc.querySelector?.(".kt-aside__brand") ||
    doc.querySelector?.(".kt-header") ||
    doc.querySelector?.("#kt_header") ||
    doc.querySelector?.("a[href*='Logout' i]") ||
    doc.querySelector?.("a[href*='logout' i]") ||
    doc.querySelector?.("a[href*='SignOut' i]")
  ) {
    return false;
  }

  // 3. Explicit login / logout URL paths
  if (
    path.includes("/account/login") ||
    path.includes("/home/logout") ||
    path.includes("/account/forgotpassword") ||
    path.includes("/account/externallogin")
  ) {
    return true;
  }

  // 4. Root path or unauthenticated home landing page: check for visible login controls
  if (path === "/" || path === "" || path === "/home/index" || path === "/home") {
    const text = (doc.body?.textContent || "").toLowerCase();
    const hasLoginButton = Boolean(
      doc.querySelector?.("input[type='submit'][value*='Sign In' i]") ||
      doc.querySelector?.("input[type='submit'][value*='Login' i]") ||
      doc.querySelector?.("button[type='submit']") ||
      doc.querySelector?.("form[action*='Login' i]")
    );
    if (
      hasLoginButton ||
      text.includes("welcome to muj portal") ||
      text.includes("sign in") ||
      text.includes("parent login")
    ) {
      return true;
    }
  }

  return false;
}

export function detectPage(doc = document, href = location.href) {
  if (isLoginPage(doc, href)) {
    return { kind: PAGE_KINDS.login, reason: "login-form" };
  }

  const url = new URL(href);
  const path = url.pathname.toLowerCase();
  const title = (doc.title || "").toLowerCase();
  const heading = collectHeadings(doc);
  const body = `${title} ${heading} ${path}`;

  if (matches(body, ["attendance", "attendence"]) || /attendance/.test(path)) {
    return { kind: PAGE_KINDS.attendance, reason: "path-or-heading" };
  }
  if (matches(body, ["internal mark", "internal marks", "sessional", "continuous assessment", "student marks"]) || /internalmark|studentmarks|marksdetail|mark/.test(path)) {
    return { kind: PAGE_KINDS.marks, reason: "path-or-heading" };
  }
  if (matches(body, ["grade card", "grades", "grade sheet", "gradesheet", "sgpa", "cgpa"]) || /grade|cgpaga/.test(path) || (/examination/.test(path) && !/mark/.test(path))) {
    return { kind: PAGE_KINDS.grades, reason: "path-or-heading" };
  }
  if (matches(body, ["time table", "timetable", "calendar", "schedule"]) || /calendar|timetable|time-table/.test(path)) {
    return { kind: PAGE_KINDS.timetable, reason: "path-or-heading" };
  }
  if (
    matches(body, ["dashboard", "student home"]) ||
    /\/student\/?$|\/student\/home|\/home\/dashboard/.test(path)
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
