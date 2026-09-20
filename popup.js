const PAGE_SIZE = 8;
const PENDING_PAGE_SIZE = 5;

const state = {
  activeTab: "domain",
  pages: { domain: 1, full: 1, keyword: 1, whitelist: 1, pending: 1 },
  summary: {
    domainCount: 0,
    urlCount: 0,
    keywordCount: 0,
    whitelistCount: 0,
    pendingCount: 0,
  },
};

const elements = {
  count: document.getElementById("count"),
  pendingList: document.getElementById("pendingList"),
  pendingEmpty: document.getElementById("pendingEmpty"),
  pendingPager: document.getElementById("pendingPager"),
  clearPending: document.getElementById("clearPending"),
  domainList: document.getElementById("domainList"),
  domainEmpty: document.getElementById("domainEmpty"),
  domainPager: document.getElementById("domainPager"),
  domainCount: document.getElementById("domainCount"),
  urlList: document.getElementById("urlList"),
  urlEmpty: document.getElementById("urlEmpty"),
  urlPager: document.getElementById("urlPager"),
  urlCount: document.getElementById("urlCount"),
  keywordList: document.getElementById("keywordList"),
  keywordEmpty: document.getElementById("keywordEmpty"),
  keywordPager: document.getElementById("keywordPager"),
  keywordCount: document.getElementById("keywordCount"),
  keywordForm: document.getElementById("keywordForm"),
  keywordInput: document.getElementById("keywordInput"),
  whitelistList: document.getElementById("whitelistList"),
  whitelistEmpty: document.getElementById("whitelistEmpty"),
  whitelistPager: document.getElementById("whitelistPager"),
  whitelistCount: document.getElementById("whitelistCount"),
  tabButtons: document.querySelectorAll(".tabs__btn"),
  tabPanels: document.querySelectorAll(".tab-panel"),
};

const TAB_CONFIG = {
  domain: {
    list: elements.domainList,
    empty: elements.domainEmpty,
    pager: elements.domainPager,
    type: "domain",
  },
  full: {
    list: elements.urlList,
    empty: elements.urlEmpty,
    pager: elements.urlPager,
    type: "full",
  },
  keyword: {
    list: elements.keywordList,
    empty: elements.keywordEmpty,
    pager: elements.keywordPager,
    type: "keyword",
  },
  whitelist: {
    list: elements.whitelistList,
    empty: elements.whitelistEmpty,
    pager: elements.whitelistPager,
    type: "whitelist",
  },
};

function sendMessage(message) {
  return new Promise((resolve) => {
    chrome.runtime.sendMessage(message, (response) => {
      if (chrome.runtime.lastError) {
        resolve(null);
        return;
      }
      resolve(response);
    });
  });
}

function clampPage(pageKey, total, pageSize = PAGE_SIZE) {
  state.pages[pageKey] = Math.min(
    state.pages[pageKey],
    Math.max(1, Math.ceil(total / pageSize) || 1)
  );
}

function renderPager(container, pageKey, pagination, onPageChange) {
  container.innerHTML = "";

  if (!pagination || pagination.total === 0) return;

  const fragment = document.createDocumentFragment();

  const prevBtn = document.createElement("button");
  prevBtn.className = "pager__btn";
  prevBtn.type = "button";
  prevBtn.textContent = "‹";
  prevBtn.disabled = pagination.page <= 1;
  prevBtn.addEventListener("click", () => {
    state.pages[pageKey] = pagination.page - 1;
    onPageChange();
  });

  const info = document.createElement("span");
  info.className = "pager__info";
  info.textContent = `${pagination.page} / ${pagination.totalPages} (${pagination.total} item)`;

  const nextBtn = document.createElement("button");
  nextBtn.className = "pager__btn";
  nextBtn.type = "button";
  nextBtn.textContent = "›";
  nextBtn.disabled = pagination.page >= pagination.totalPages;
  nextBtn.addEventListener("click", () => {
    state.pages[pageKey] = pagination.page + 1;
    onPageChange();
  });

  fragment.appendChild(prevBtn);
  fragment.appendChild(info);
  fragment.appendChild(nextBtn);
  container.appendChild(fragment);
}

function createRemoveButton(onClick) {
  const btn = document.createElement("button");
  btn.className = "list-item__remove";
  btn.type = "button";
  btn.title = "Hapus";
  btn.setAttribute("aria-label", "Hapus");
  btn.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14ZM10 11v6M14 11v6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  btn.addEventListener("click", onClick);
  return btn;
}

function createActionButton(label, className, onClick) {
  const btn = document.createElement("button");
  btn.className = `btn ${className}`;
  btn.type = "button";
  btn.textContent = label;
  btn.addEventListener("click", onClick);
  return btn;
}

function createHitsBadge(hits) {
  const badge = document.createElement("span");
  badge.className = "list-item__hits";
  badge.textContent = String(hits || 0);
  badge.title = `Terdeteksi ${hits || 0} kali`;
  return badge;
}

function renderSummary() {
  const { domainCount, urlCount, keywordCount, whitelistCount } = state.summary;

  elements.domainCount.textContent = String(domainCount);
  elements.urlCount.textContent = String(urlCount);
  elements.keywordCount.textContent = String(keywordCount);
  elements.whitelistCount.textContent = String(whitelistCount);
  elements.count.textContent = `${domainCount} domain · ${urlCount} URL · ${keywordCount} kata · ${whitelistCount} whitelist`;
}

async function fetchList(type, page, pageSize = PAGE_SIZE) {
  return sendMessage({
    action: "getList",
    type,
    page,
    pageSize,
  });
}

function renderStandardList(config, pageKey, getLabel, onRemove) {
  const { list, empty, pager, type } = config;

  return fetchList(type, state.pages[pageKey]).then((result) => {
    list.innerHTML = "";

    if (!result || result.total === 0) {
      empty.style.display = "block";
      pager.innerHTML = "";
      return;
    }

    empty.style.display = "none";
    clampPage(pageKey, result.total);
    const fragment = document.createDocumentFragment();

    result.items.forEach((entry) => {
      const item = document.createElement("li");
      item.className = "list-item";

      const info = document.createElement("div");
      info.className = "list-item__info";

      const label = document.createElement("span");
      label.className = pageKey === "keyword" ? "list-item__url list-item__keyword" : "list-item__url";
      const text = getLabel(entry);
      label.textContent = text;
      label.title = text;

      info.appendChild(label);
      item.appendChild(info);
      item.appendChild(createHitsBadge(entry.hits));
      item.appendChild(createRemoveButton(() => onRemove(entry)));
      fragment.appendChild(item);
    });

    list.appendChild(fragment);
    renderPager(pager, pageKey, result, () => renderActiveViews(false));
  });
}

async function renderPendingList() {
  const result = await fetchList("pending", state.pages.pending, PENDING_PAGE_SIZE);
  elements.pendingList.innerHTML = "";
  elements.pendingList.classList.remove("pending-list--filled");

  if (!result || result.total === 0) {
    elements.pendingEmpty.style.display = "block";
    elements.clearPending.style.display = "none";
    elements.pendingPager.innerHTML = "";
    return;
  }

  elements.pendingEmpty.style.display = "none";
  elements.clearPending.style.display = "inline";
  elements.pendingList.classList.add("pending-list--filled");
  clampPage("pending", result.total, PENDING_PAGE_SIZE);

  const fragment = document.createDocumentFragment();

  result.items.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "list-item list-item--pending";

    const info = document.createElement("div");
    info.className = "list-item__info";

    const urlSpan = document.createElement("span");
    urlSpan.className = "list-item__url";
    urlSpan.textContent = entry.url;
    urlSpan.title = entry.url;
    info.appendChild(urlSpan);

    item.appendChild(info);
    item.appendChild(createHitsBadge(entry.hits));

    const actions = document.createElement("div");
    actions.className = "list-item__actions";

    actions.appendChild(
      createActionButton("Domain", "btn--block", async () => {
        await sendMessage({ action: "addBlocked", url: entry.url, mode: "domain" });
        await refreshAll();
      })
    );
    actions.appendChild(
      createActionButton("URL", "btn--block", async () => {
        await sendMessage({ action: "addBlocked", url: entry.url, mode: "full" });
        await refreshAll();
      })
    );
    actions.appendChild(
      createActionButton("Allow", "btn--whitelist", async () => {
        await sendMessage({ action: "addWhitelist", url: entry.url });
        await refreshAll();
      })
    );
    actions.appendChild(
      createActionButton("×", "btn--dismiss", async () => {
        await sendMessage({ action: "removePending", url: entry.url });
        await refreshAll();
      })
    );

    item.appendChild(actions);
    fragment.appendChild(item);
  });

  elements.pendingList.appendChild(fragment);
  renderPager(elements.pendingPager, "pending", result, () => renderActiveViews(false));
}

async function renderActiveTab() {
  const config = TAB_CONFIG[state.activeTab];
  if (!config) return;

  if (state.activeTab === "keyword") {
    await renderStandardList(
      config,
      "keyword",
      (entry) => entry.keyword,
      async (entry) => {
        await sendMessage({ action: "removeKeyword", keyword: entry.keyword });
        await refreshAll();
      }
    );
    return;
  }

  if (state.activeTab === "domain") {
    await renderStandardList(
      config,
      "domain",
      (entry) => entry.url,
      async (entry) => {
        await sendMessage({ action: "removeBlocked", url: entry.url, mode: "domain" });
        await refreshAll();
      }
    );
    return;
  }

  if (state.activeTab === "full") {
    await renderStandardList(
      config,
      "full",
      (entry) => entry.url,
      async (entry) => {
        await sendMessage({ action: "removeBlocked", url: entry.url, mode: "full" });
        await refreshAll();
      }
    );
    return;
  }

  if (state.activeTab === "whitelist") {
    await renderStandardList(
      config,
      "whitelist",
      (entry) => entry.url,
      async (entry) => {
        await sendMessage({ action: "removeWhitelist", url: entry.url });
        await refreshAll();
      }
    );
  }
}

async function renderActiveViews(includeSummary = true) {
  if (includeSummary) {
    const summary = await sendMessage({ action: "getSummary" });
    if (summary) {
      state.summary = summary;
      renderSummary();
    }
  }

  await Promise.all([renderPendingList(), renderActiveTab()]);
}

function switchTab(tabName) {
  state.activeTab = tabName;

  elements.tabButtons.forEach((btn) => {
    const isActive = btn.dataset.tab === tabName;
    btn.classList.toggle("tabs__btn--active", isActive);
    btn.setAttribute("aria-selected", String(isActive));
  });

  elements.tabPanels.forEach((panel) => {
    panel.classList.toggle("tab-panel--active", panel.dataset.panel === tabName);
  });

  renderActiveTab();
}

async function refreshAll() {
  const summary = await sendMessage({ action: "getSummary" });
  if (summary) {
    state.summary = summary;
    clampPage("domain", summary.domainCount);
    clampPage("full", summary.urlCount);
    clampPage("keyword", summary.keywordCount);
    clampPage("whitelist", summary.whitelistCount);
    clampPage("pending", summary.pendingCount, PENDING_PAGE_SIZE);
    renderSummary();
  }

  await renderActiveViews(false);
}

elements.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

elements.clearPending.addEventListener("click", async () => {
  await sendMessage({ action: "clearPending" });
  state.pages.pending = 1;
  await refreshAll();
});

elements.keywordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const keyword = elements.keywordInput.value.trim();
  if (!keyword) return;

  await sendMessage({ action: "addKeyword", keyword });
  elements.keywordInput.value = "";
  await refreshAll();
});

const appVersionEl = document.getElementById("appVersion");
if (appVersionEl) {
  appVersionEl.textContent = `v${chrome.runtime.getManifest().version}`;
}

renderActiveViews();
