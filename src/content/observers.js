export function observeTable(table, onChange, { debounceMs = 180 } = {}) {
  if (!table) return () => {};
  let timer = 0;
  const observer = new MutationObserver((mutations) => {
    const meaningful = mutations.some((mutation) => {
      const nodes = [...mutation.addedNodes, ...mutation.removedNodes, mutation.target];
      return nodes.some((node) => node?.nodeType === 1 && !node.hasAttribute?.("data-mujx") && !node.closest?.("[data-mujx]"));
    });
    if (!meaningful) return;
    clearTimeout(timer);
    timer = setTimeout(onChange, debounceMs);
  });
  observer.observe(table, { childList: true, subtree: true, characterData: true });
  return () => {
    clearTimeout(timer);
    observer.disconnect();
  };
}

export function observePath(onChange) {
  let last = location.href;
  const notify = () => {
    if (location.href === last) return;
    last = location.href;
    onChange(last);
  };
  const wrap = (method) => {
    const original = history[method];
    history[method] = function patched(...args) {
      const result = original.apply(this, args);
      notify();
      return result;
    };
    return original;
  };
  const push = wrap("pushState");
  const replace = wrap("replaceState");
  window.addEventListener("popstate", notify);
  const poll = setInterval(notify, 1500);
  return () => {
    history.pushState = push;
    history.replaceState = replace;
    window.removeEventListener("popstate", notify);
    clearInterval(poll);
  };
}
