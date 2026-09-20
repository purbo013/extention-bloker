const PAGE_SIZE = 8;

const state = {
  activeTab: "domain",
  pages: { domain: 1, full: 1, keyword: 1, whitelist: 1 },
  data: { blocked: [], pending: [], whitelist: [], keywords: [] },
};

const elements = {
  count: document.getElementById("count"),
  pendingList: document.getElementById("pendingList"),
  pendingEmpty: document.getElementById("pendingEmpty"),
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

function paginate(items, page) {
  const totalPages = Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * PAGE_SIZE;
  return {
    items: items.slice(start, start + PAGE_SIZE),
    currentPage,
    totalPages,
    total: items.length,
  };
}

function renderPager(container, pageKey, pagination, onPageChange) {
  container.innerHTML = "";

  if (pagination.total === 0) return;

  const info = document.createElement("span");
  info.className = "pager__info";
  info.textContent = `${pagination.currentPage} / ${pagination.totalPages} (${pagination.total} item)`;

  const prevBtn = document.createElement("button");
  prevBtn.className = "pager__btn";
  prevBtn.type = "button";
  prevBtn.textContent = "‹";
  prevBtn.disabled = pagination.currentPage <= 1;
  prevBtn.addEventListener("click", () => {
    state.pages[pageKey] = pagination.currentPage - 1;
    onPageChange();
  });

  const nextBtn = document.createElement("button");
  nextBtn.className = "pager__btn";
  nextBtn.type = "button";
  nextBtn.textContent = "›";
  nextBtn.disabled = pagination.currentPage >= pagination.totalPages;
  nextBtn.addEventListener("click", () => {
    state.pages[pageKey] = pagination.currentPage + 1;
    onPageChange();
  });

  container.appendChild(prevBtn);
  container.appendChild(info);
  container.appendChild(nextBtn);
}

function createRemoveButton(label, onClick) {
  const btn = document.createElement("button");
  btn.className = "list-item__remove";
  btn.type = "button";
  btn.textContent = label;
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

function renderEntryList(listEl, emptyEl, pagerEl, items, pageKey, onRemove) {
  listEl.innerHTML = "";
  const pagination = paginate(items, state.pages[pageKey]);

  if (pagination.total === 0) {
    emptyEl.style.display = "block";
    pagerEl.innerHTML = "";
    return pagination;
  }

  emptyEl.style.display = "none";

  pagination.items.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "list-item";

    const info = document.createElement("div");
    info.className = "list-item__info";

    const urlSpan = document.createElement("span");
    urlSpan.className = "list-item__url";
    urlSpan.textContent = entry.url;
    urlSpan.title = entry.url;

    info.appendChild(urlSpan);
    item.appendChild(info);
    item.appendChild(createRemoveButton("Hapus", () => onRemove(entry)));
    listEl.appendChild(item);
  });

  renderPager(pagerEl, pageKey, pagination, renderAll);
  return pagination;
}

function renderKeywordList() {
  const items = state.data.keywords.map((keyword) => ({ url: keyword }));
  elements.keywordList.innerHTML = "";
  const pagination = paginate(items, state.pages.keyword);

  if (pagination.total === 0) {
    elements.keywordEmpty.style.display = "block";
    elements.keywordPager.innerHTML = "";
    return;
  }

  elements.keywordEmpty.style.display = "none";

  pagination.items.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "list-item";

    const info = document.createElement("div");
    info.className = "list-item__info";

    const keywordSpan = document.createElement("span");
    keywordSpan.className = "list-item__url list-item__keyword";
    keywordSpan.textContent = entry.url;
    keywordSpan.title = entry.url;

    info.appendChild(keywordSpan);
    item.appendChild(info);
    item.appendChild(
      createRemoveButton("Hapus", async () => {
        await sendMessage({ action: "removeKeyword", keyword: entry.url });
        await loadData();
      })
    );
    elements.keywordList.appendChild(item);
  });

  renderPager(elements.keywordPager, "keyword", pagination, renderAll);
}

function renderPendingList() {
  const urls = state.data.pending;
  elements.pendingList.innerHTML = "";

  if (urls.length === 0) {
    elements.pendingEmpty.style.display = "block";
    elements.clearPending.style.display = "none";
    return;
  }

  elements.pendingEmpty.style.display = "none";
  elements.clearPending.style.display = "inline";

  urls.slice(0, 10).forEach((entry) => {
    const item = document.createElement("li");
    item.className = "list-item list-item--pending";

    const info = document.createElement("div");
    info.className = "list-item__info";

    const urlSpan = document.createElement("span");
    urlSpan.className = "list-item__url";
    urlSpan.textContent = entry.url;
    urlSpan.title = entry.url;
    info.appendChild(urlSpan);

    const actions = document.createElement("div");
    actions.className = "list-item__actions";

    actions.appendChild(
      createActionButton("Domain", "btn--block", async () => {
        await sendMessage({ action: "addBlocked", url: entry.url, mode: "domain" });
        await loadData();
      })
    );
    actions.appendChild(
      createActionButton("URL", "btn--block", async () => {
        await sendMessage({ action: "addBlocked", url: entry.url, mode: "full" });
        await loadData();
      })
    );
    actions.appendChild(
      createActionButton("Kata", "btn--keyword", async () => {
        const suggested = await sendMessage({
          action: "suggestKeyword",
          url: entry.url,
        });
        const keyword = prompt("Kata kunci untuk diblokir:", suggested?.keyword || "");
        if (!keyword) return;
        await sendMessage({ action: "addKeyword", keyword });
        await loadData();
      })
    );
    actions.appendChild(
      createActionButton("White", "btn--whitelist", async () => {
        await sendMessage({ action: "addWhitelist", url: entry.url });
        await loadData();
      })
    );
    actions.appendChild(
      createActionButton("×", "btn--dismiss", async () => {
        await sendMessage({ action: "removePending", url: entry.url });
        await loadData();
      })
    );

    item.appendChild(info);
    item.appendChild(actions);
    elements.pendingList.appendChild(item);
  });
}

function renderAll() {
  const domainItems = state.data.blocked.filter((e) => e.mode === "domain");
  const urlItems = state.data.blocked.filter((e) => e.mode === "full");
  const whitelistItems = state.data.whitelist.map((url) => ({ url }));

  elements.domainCount.textContent = String(domainItems.length);
  elements.urlCount.textContent = String(urlItems.length);
  elements.keywordCount.textContent = String(state.data.keywords.length);
  elements.whitelistCount.textContent = String(whitelistItems.length);

  elements.count.textContent = `${domainItems.length} domain · ${urlItems.length} URL · ${state.data.keywords.length} kata · ${whitelistItems.length} whitelist`;

  renderEntryList(
    elements.domainList,
    elements.domainEmpty,
    elements.domainPager,
    domainItems,
    "domain",
    async (entry) => {
      await sendMessage({ action: "removeBlocked", url: entry.url, mode: "domain" });
      await loadData();
    }
  );

  renderEntryList(
    elements.urlList,
    elements.urlEmpty,
    elements.urlPager,
    urlItems,
    "full",
    async (entry) => {
      await sendMessage({ action: "removeBlocked", url: entry.url, mode: "full" });
      await loadData();
    }
  );

  renderKeywordList();

  renderEntryList(
    elements.whitelistList,
    elements.whitelistEmpty,
    elements.whitelistPager,
    whitelistItems,
    "whitelist",
    async (entry) => {
      await sendMessage({ action: "removeWhitelist", url: entry.url });
      await loadData();
    }
  );

  renderPendingList();
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
}

function clampPage(pageKey, total) {
  state.pages[pageKey] = Math.min(
    state.pages[pageKey],
    Math.max(1, Math.ceil(total / PAGE_SIZE))
  );
}

async function loadData() {
  const [blocked, pending, whitelist, keywords] = await Promise.all([
    sendMessage({ action: "getBlocked" }),
    sendMessage({ action: "getPending" }),
    sendMessage({ action: "getWhitelist" }),
    sendMessage({ action: "getKeywords" }),
  ]);

  state.data.blocked = blocked?.urls || [];
  state.data.pending = pending?.urls || [];
  state.data.whitelist = whitelist?.urls || [];
  state.data.keywords = keywords?.keywords || [];

  clampPage("domain", state.data.blocked.filter((e) => e.mode === "domain").length);
  clampPage("full", state.data.blocked.filter((e) => e.mode === "full").length);
  clampPage("keyword", state.data.keywords.length);
  clampPage("whitelist", state.data.whitelist.length);

  renderAll();
}

elements.tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

elements.clearPending.addEventListener("click", async () => {
  await sendMessage({ action: "clearPending" });
  await loadData();
});

elements.keywordForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const keyword = elements.keywordInput.value.trim();
  if (!keyword) return;

  await sendMessage({ action: "addKeyword", keyword });
  elements.keywordInput.value = "";
  await loadData();
});

loadData();
