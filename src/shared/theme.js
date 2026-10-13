/**
 * Universal theme detection and synchronization utility.
 * Seamlessly detects whether the page or browser is in dark mode or light mode
 * so all extension components blend into the website background.
 */

export function detectIsDarkMode() {
  if (typeof document === "undefined" || typeof window === "undefined") {
    return false;
  }

  // 1. Explicit classes or attributes on <html> or <body> (Dark Reader, custom dark themes, SLCM skins)
  const root = document.documentElement;
  const body = document.body;

  if (
    root?.classList?.contains("dark") ||
    body?.classList?.contains("dark") ||
    root?.classList?.contains("theme-dark") ||
    body?.classList?.contains("theme-dark") ||
    root?.classList?.contains("dark-mode") ||
    body?.classList?.contains("dark-mode") ||
    root?.classList?.contains("dark-theme") ||
    body?.classList?.contains("dark-theme") ||
    root?.classList?.contains("slcm-dark") ||
    body?.classList?.contains("slcm-dark") ||
    root?.getAttribute?.("data-theme") === "dark" ||
    body?.getAttribute?.("data-theme") === "dark" ||
    root?.getAttribute?.("data-color-scheme") === "dark" ||
    body?.getAttribute?.("data-color-scheme") === "dark" ||
    root?.hasAttribute?.("data-darkreader-mode") ||
    body?.hasAttribute?.("data-darkreader-mode")
  ) {
    return true;
  }

  // 2. Computed background color luminance of body / root / portal containers
  try {
    const checkNodes = [
      body,
      root,
      document.getElementById("kt_body"),
      document.querySelector(".kt-content"),
      document.querySelector(".kt-wrapper"),
      document.querySelector(".kt-page"),
      document.querySelector(".kt-header")
    ];
    for (const el of checkNodes) {
      if (!el) continue;
      const bg = window.getComputedStyle(el).backgroundColor;
      const m = bg.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
      if (m) {
        const [r, g, b] = [parseInt(m[1], 10), parseInt(m[2], 10), parseInt(m[3], 10)];
        // If not completely transparent
        if (!bg.includes("rgba(0, 0, 0, 0)")) {
          const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
          if (luminance < 140) {
            return true;
          }
        }
      }
    }
  } catch {}

  // 3. System preference media query
  if (typeof window.matchMedia === "function" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return true;
  }

  return false;
}

/**
 * Synchronizes the data-theme attribute on target elements or <html>
 */
export function syncThemeAttribute(target = document.documentElement) {
  const isDark = detectIsDarkMode();
  const theme = isDark ? "dark" : "light";
  if (target?.setAttribute) {
    target.setAttribute("data-mujx-theme", theme);
    target.setAttribute("data-theme", theme);
  }
  return theme;
}

/**
 * Listens for system or page theme changes and calls onChange callback
 */
export function watchThemeChanges(onChange) {
  if (typeof window === "undefined") return () => {};

  const handler = () => {
    const theme = syncThemeAttribute();
    onChange?.(theme);
  };

  // Watch system prefers-color-scheme
  let mql = null;
  if (typeof window.matchMedia === "function") {
    mql = window.matchMedia("(prefers-color-scheme: dark)");
    mql.addEventListener?.("change", handler);
  }

  // Watch html/body class or attribute changes
  const obs = new MutationObserver(() => {
    handler();
  });
  if (document.documentElement) {
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-darkreader-mode"] });
  }
  if (document.body) {
    obs.observe(document.body, { attributes: true, attributeFilter: ["class", "data-theme", "data-darkreader-mode"] });
  }

  handler();

  return () => {
    mql?.removeEventListener?.("change", handler);
    obs.disconnect();
  };
}
