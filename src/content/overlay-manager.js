import { HOST_ROOT_ATTR, INJECT_ATTR, NS } from "../shared/constants.js";
import { teardownPopovers } from "../ui/popover.js";

const hosts = new Set();
const injected = new Set();

export function createOverlay({ id, placement = "float" }) {
  teardownById(id);

  // STRICT CONSTRAINT: Never create overlays over the main website screen.
  // Only the floating corner launcher button is permitted.
  if (placement !== "float") {
    return { host: null, shadow: null, wrap: document.createElement("div") };
  }

  const host = document.createElement("div");
  host.id = `${NS}-${id}`;
  host.setAttribute(HOST_ROOT_ATTR, id);
  host.setAttribute(INJECT_ATTR, "overlay");
  host.className = `mujx-host mujx-host--${placement}`;
  const shadow = host.attachShadow({ mode: "open" });
  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = chrome.runtime.getURL("src/ui/styles.css");
  const wrap = document.createElement("div");
  wrap.className = "mujx-root";
  wrap.setAttribute("data-theme", "auto");
  shadow.append(link, wrap);
  place(host, placement);
  hosts.add(host);
  injected.add(host);
  return { host, shadow, wrap };
}

export function applyTheme(wrap, theme) {
  wrap?.setAttribute?.("data-theme", theme || "auto");
}

export function injectColumn(table, { key, title, render }) {
  if (!table || table.querySelector(`th[${INJECT_ATTR}="${key}"]`)) return () => {};
  const theadRows = table.querySelectorAll("thead tr");
  const headerRow = theadRows.length ? theadRows[0] : table.rows[0];
  if (!headerRow) return () => {};

  const th = document.createElement("th");
  th.textContent = title;
  th.setAttribute(INJECT_ATTR, key);
  if (theadRows.length > 1) {
    th.setAttribute("rowspan", String(theadRows.length));
  }
  headerRow.append(th);

  const bodyRows = table.tBodies.length
    ? [...table.tBodies].flatMap((body) => [...body.rows])
    : [...table.rows].slice(theadRows.length || 1);

  bodyRows.forEach((row, index) => {
    const td = document.createElement("td");
    td.setAttribute(INJECT_ATTR, key);
    render(td, row, index);
    row.append(td);
  });
  injected.add(th);
  return () => {
    table.querySelectorAll(`[${INJECT_ATTR}="${key}"]`).forEach((node) => node.remove());
  };
}

export function markInjected(node) {
  node.setAttribute(INJECT_ATTR, "true");
  injected.add(node);
  return node;
}

export function teardownAll() {
  teardownPopovers();
  for (const node of injected) {
    node.remove();
  }
  injected.clear();
  hosts.clear();
  document.querySelectorAll(`[${INJECT_ATTR}], [${HOST_ROOT_ATTR}]`).forEach((node) => node.remove());
}

export function teardownById(id) {
  document.getElementById(`${NS}-${id}`)?.remove();
}

function place(host, placement) {
  if (placement === "float") {
    Object.assign(host.style, {
      position: "fixed",
      right: "20px",
      bottom: "76px",
      zIndex: "2147483000",
      pointerEvents: "none",
    });
    document.documentElement.append(host);
  }
}
