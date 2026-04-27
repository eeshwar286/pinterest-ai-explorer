// content.js
// Pinterest AI Explorer — floating bubble + suggestions panel.

(function () {
  const STATE = {
    currentQuery: "",
    suggestions: [],
    loading: false,
    open: false,
    usedFallback: false,
  };

  // ---------- URL / query detection ----------
  function getQueryFromUrl() {
    try {
      const url = new URL(window.location.href);
      if (!url.pathname.includes("/search/")) return "";
      return url.searchParams.get("q") || "";
    } catch {
      return "";
    }
  }

  function watchUrl(onChange) {
    let last = location.href;
    const check = () => {
      if (location.href !== last) {
        last = location.href;
        onChange();
      }
    };
    setInterval(check, 600);
    window.addEventListener("popstate", onChange);
  }

  // ---------- storage: last 3 queries ----------
  function getRecentQueries() {
    return new Promise((resolve) => {
      chrome.storage.local.get(["recent_queries"], (res) => {
        resolve(res.recent_queries || []);
      });
    });
  }
  function pushRecentQuery(q) {
    chrome.storage.local.get(["recent_queries"], (res) => {
      const list = res.recent_queries || [];
      const next = [q, ...list.filter((x) => x !== q)].slice(0, 3);
      chrome.storage.local.set({ recent_queries: next });
    });
  }

  // ---------- UI ----------
  let rootEl, bubbleEl, panelEl, listEl, headerEl;

  function buildUI() {
    rootEl = document.createElement("div");
    rootEl.id = "pae-root";

    panelEl = document.createElement("div");
    panelEl.id = "pae-panel";
    panelEl.className = "pae-panel pae-hidden";

    headerEl = document.createElement("div");
    headerEl.className = "pae-header";
    headerEl.innerHTML = `
      <div class="pae-title">AI Suggestions</div>
      <div class="pae-sub" id="pae-sub">—</div>
    `;

    listEl = document.createElement("div");
    listEl.className = "pae-list";

    panelEl.appendChild(headerEl);
    panelEl.appendChild(listEl);

    bubbleEl = document.createElement("button");
    bubbleEl.id = "pae-bubble";
    bubbleEl.className = "pae-bubble";
    bubbleEl.title = "Pinterest AI Explorer";
    bubbleEl.innerHTML = `<span class="pae-bubble-icon">✨</span>`;

    rootEl.appendChild(panelEl);
    rootEl.appendChild(bubbleEl);
    document.body.appendChild(rootEl);

    bubbleEl.addEventListener("click", (e) => {
      // Ignore click that ends a drag
      if (bubbleEl.dataset.dragged === "1") {
        bubbleEl.dataset.dragged = "0";
        return;
      }
      togglePanel();
    });

    makeDraggable(rootEl, bubbleEl);
  }

  function togglePanel() {
    STATE.open = !STATE.open;
    panelEl.classList.toggle("pae-hidden", !STATE.open);
    if (STATE.open) {
      // Refresh on open if we have a query but no suggestions
      if (STATE.currentQuery && !STATE.suggestions.length && !STATE.loading) {
        loadSuggestions();
      }
    }
  }

  function renderHeader() {
    const sub = document.getElementById("pae-sub");
    if (!sub) return;
    if (STATE.loading) {
      sub.textContent = "Thinking…";
    } else if (!STATE.currentQuery) {
      sub.textContent = "Search on Pinterest to get ideas";
    } else {
      const tag = STATE.usedFallback ? " (offline)" : "";
      let txt = `for "${STATE.currentQuery}"${tag}`;
      if (STATE.usedFallback && STATE.error) txt += ` — ${STATE.error}`;
      sub.textContent = txt;
    }
  }

  function renderList() {
    listEl.innerHTML = "";

    if (STATE.loading) {
      const s = document.createElement("div");
      s.className = "pae-spinner";
      s.innerHTML = `<div class="pae-dot"></div><div class="pae-dot"></div><div class="pae-dot"></div>`;
      listEl.appendChild(s);
      return;
    }

    if (!STATE.currentQuery) {
      const empty = document.createElement("div");
      empty.className = "pae-empty";
      empty.textContent = "Run a Pinterest search to see suggestions here.";
      listEl.appendChild(empty);
      return;
    }

    if (!STATE.suggestions.length) {
      const empty = document.createElement("div");
      empty.className = "pae-empty";
      empty.textContent = "No suggestions yet.";
      listEl.appendChild(empty);
      return;
    }

    STATE.suggestions.forEach((text) => {
      const item = document.createElement("button");
      item.className = "pae-item";
      item.textContent = text;
      item.addEventListener("click", () => onPickSuggestion(text));
      listEl.appendChild(item);
    });
  }

  function render() {
    renderHeader();
    renderList();
  }

  // ---------- draggable ----------
  function makeDraggable(container, handle) {
    let startX = 0,
      startY = 0,
      origRight = 24,
      origBottom = 24,
      dragging = false,
      moved = false;

    handle.addEventListener("mousedown", (e) => {
      dragging = true;
      moved = false;
      startX = e.clientX;
      startY = e.clientY;
      const rect = container.getBoundingClientRect();
      origRight = window.innerWidth - rect.right;
      origBottom = window.innerHeight - rect.bottom;
      e.preventDefault();
    });

    window.addEventListener("mousemove", (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) + Math.abs(dy) > 4) moved = true;
      const newRight = Math.max(8, origRight - dx);
      const newBottom = Math.max(8, origBottom - dy);
      container.style.right = newRight + "px";
      container.style.bottom = newBottom + "px";
    });

    window.addEventListener("mouseup", () => {
      if (dragging && moved) {
        handle.dataset.dragged = "1";
      }
      dragging = false;
    });
  }

  // ---------- suggestions flow ----------
  async function loadSuggestions() {
    const q = STATE.currentQuery;
    if (!q) {
      STATE.suggestions = [];
      render();
      return;
    }
    STATE.loading = true;
    STATE.suggestions = [];
    render();

    const recent = await getRecentQueries();
    const { suggestions, usedFallback, error } = await window.PAE_Api.getSuggestions(
      q,
      recent.filter((x) => x !== q)
    );

    STATE.suggestions = suggestions;
    STATE.usedFallback = usedFallback;
    STATE.error = error || "";
    STATE.loading = false;
    pushRecentQuery(q);
    render();
  }

  // ---------- pick suggestion: copy + fill search bar ----------
  function findPinterestSearchInput() {
    // Try several selectors Pinterest has used
    const selectors = [
      'input[name="searchBoxInput"]',
      'input[data-test-id="search-box-input"]',
      'input[placeholder*="Search" i]',
      'header input[type="text"]',
      'input[role="combobox"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    return null;
  }

  function setNativeInputValue(input, value) {
    const proto = Object.getPrototypeOf(input);
    const setter = Object.getOwnPropertyDescriptor(proto, "value")?.set;
    if (setter) setter.call(input, value);
    else input.value = value;
  }

  async function onPickSuggestion(text) {
    // 1. Copy to clipboard
    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      console.warn("[PAE] Clipboard failed:", err);
    }

    // 2. Fill Pinterest search bar
    const input = findPinterestSearchInput();
    if (input) {
      input.focus();
      setNativeInputValue(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    } else {
      // Fallback: navigate directly to search URL
      const url = `https://www.pinterest.com/search/pins/?q=${encodeURIComponent(
        text
      )}`;
      window.location.href = url;
    }
  }

  // ---------- init ----------
  // Debounced trigger so rapid URL changes (typing in search) don't spam Gemini.
  let debounceTimer = null;
  function scheduleLoad() {
    if (debounceTimer) clearTimeout(debounceTimer);
    const delay = window.PAE_Config?.DEBOUNCE_MS ?? 500;
    debounceTimer = setTimeout(() => {
      debounceTimer = null;
      loadSuggestions();
    }, delay);
  }

  function onUrlMaybeChanged() {
    const q = getQueryFromUrl();
    if (q !== STATE.currentQuery) {
      STATE.currentQuery = q;
      STATE.suggestions = [];
      render();
      if (q) scheduleLoad();
    }
  }

  function init() {
    if (document.getElementById("pae-root")) return;
    buildUI();
    STATE.currentQuery = getQueryFromUrl();
    render();
    if (STATE.currentQuery) scheduleLoad();
    watchUrl(onUrlMaybeChanged);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
