import { HOST_ROOT_ATTR, INJECT_ATTR, NS } from "../shared/constants.js";

let activePopover = null;
let popoverHost = null;
let popoverShadow = null;
let currentKeyHandler = null;
let currentClickHandler = null;

function getOrCreateHost(theme = "auto") {
  if (popoverHost && document.body.contains(popoverHost)) {
    const wrap = popoverShadow?.querySelector(".mujx-root");
    if (wrap) wrap.setAttribute("data-theme", theme);
    return { host: popoverHost, shadow: popoverShadow };
  }

  popoverHost = document.createElement("div");
  popoverHost.id = `${NS}-popover-host`;
  popoverHost.setAttribute(HOST_ROOT_ATTR, "popover-host");
  popoverHost.setAttribute(INJECT_ATTR, "popover");
  Object.assign(popoverHost.style, {
    position: "fixed",
    top: "0",
    left: "0",
    width: "100%",
    height: "100%",
    pointerEvents: "none",
    zIndex: "2147483645",
  });

  popoverShadow = popoverHost.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("src/ui/styles.css");

  const wrap = document.createElement("div");
  wrap.className = "mujx-root mujx-popover-wrapper";
  wrap.setAttribute("data-theme", theme);
  popoverShadow.append(link, wrap);

  document.documentElement.append(popoverHost);
  return { host: popoverHost, shadow: popoverShadow };
}

/**
 * Open an anchored popover next to anchorEl.
 * Ensures the popover stays within viewport and closes on outside click or Escape.
 */
export function openPopover({
  anchorEl,
  title,
  badge = null,
  contentHtml,
  onMount = null,
  width = 330,
  theme = "auto",
}) {
  closePopover();

  if (!anchorEl || !document.body.contains(anchorEl)) return null;

  const { shadow } = getOrCreateHost(theme);
  const wrap = shadow.querySelector(".mujx-popover-wrapper");

  const popover = document.createElement("div");
  popover.className = "mujx-popover";
  popover.setAttribute("role", "dialog");
  popover.setAttribute("aria-label", title || "Information popover");
  popover.style.width = `${Math.min(width, window.innerWidth - 24)}px`;

  popover.innerHTML = `
    <div class="mujx-popover-head">
      <div class="mujx-popover-title">
        <span>${title || "MUJX Intel"}</span>
        ${badge ? `<span class="mujx-chip ${badge.type || 'safe'}" style="font-size:10.5px; padding:1px 6px;">${badge.text}</span>` : ""}
      </div>
      <button class="mujx-btn secondary mujx-popover-close" type="button" aria-label="Close popover">✕</button>
    </div>
    <div class="mujx-popover-body">
      ${contentHtml}
    </div>
  `;

  wrap.append(popover);

  // Position popover relative to anchor
  positionPopover(popover, anchorEl, width);

  // Attach close button
  const closeBtn = popover.querySelector(".mujx-popover-close");
  closeBtn?.addEventListener("click", (e) => {
    e.stopPropagation();
    closePopover();
  });

  // Execute onMount callback if any
  if (typeof onMount === "function") {
    onMount(popover);
  }

  // Handle outside clicks and Escape
  currentKeyHandler = (e) => {
    if (e.key === "Escape") {
      closePopover();
    }
  };
  window.addEventListener("keydown", currentKeyHandler, { capture: true });

  currentClickHandler = (e) => {
    const path = e.composedPath();
    if (!path.includes(popover) && !path.includes(anchorEl)) {
      closePopover();
    }
  };
  // Delay click listener to avoid immediately closing from the trigger click
  setTimeout(() => {
    window.addEventListener("pointerdown", currentClickHandler, { capture: true });
  }, 10);

  activePopover = popover;
  return popover;
}

function positionPopover(popover, anchorEl, preferredWidth) {
  const rect = anchorEl.getBoundingClientRect();
  const popoverWidth = Math.min(preferredWidth, window.innerWidth - 24);
  popover.style.width = `${popoverWidth}px`;

  // Measure popover height
  const popoverRect = popover.getBoundingClientRect();
  const popoverHeight = popoverRect.height || 260;

  // Horizontal position: center on anchor, clamped to viewport margins
  let left = rect.left + rect.width / 2 - popoverWidth / 2;
  left = Math.max(12, Math.min(window.innerWidth - popoverWidth - 12, left));

  // Vertical position: prefer below, flip above if not enough space below
  const roomBelow = window.innerHeight - rect.bottom - 12;
  const roomAbove = rect.top - 12;
  let top;

  if (roomBelow < popoverHeight && roomAbove > roomBelow) {
    top = Math.max(12, rect.top - popoverHeight - 8);
  } else {
    top = Math.min(window.innerHeight - popoverHeight - 12, rect.bottom + 8);
  }

  popover.style.left = `${Math.round(left)}px`;
  popover.style.top = `${Math.round(top)}px`;
}

export function closePopover() {
  if (activePopover) {
    activePopover.remove();
    activePopover = null;
  }
  if (currentKeyHandler) {
    window.removeEventListener("keydown", currentKeyHandler, { capture: true });
    currentKeyHandler = null;
  }
  if (currentClickHandler) {
    window.removeEventListener("pointerdown", currentClickHandler, { capture: true });
    currentClickHandler = null;
  }
}

export function teardownPopovers() {
  closePopover();
  if (popoverHost) {
    popoverHost.remove();
    popoverHost = null;
    popoverShadow = null;
  }
}
