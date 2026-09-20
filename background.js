const STORAGE_KEY = "blockedUrls";
const WHITELIST_KEY = "whitelistDomains";
const KEYWORD_KEY = "blockedKeywords";
const PENDING_KEY = "pendingUrls";
const DEFAULT_MODE_KEY = "defaultBlockMode";

const MAX_PENDING = 50;
const MAX_LIST_SIZE = 1000;
const TAB_CHECK_COOLDOWN_MS = 800;
const PERSIST_DELAY_MS = 1500;
const TAB_CHECK_CACHE_LIMIT = 200;

const SYSTEM_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
];

const cache = {
  blocked: [],
  whitelist: [],
  keywords: [],
  pending: [],
  indexes: null,
  loaded: false,
  dirty: false,
};

let persistTimer = null;
let cachePromise = null;
const tabCheckCache = new Map();

function isSystemUrl(url) {
  if (!url) return true;
  return SYSTEM_URL_PREFIXES.some((prefix) => url.startsWith(prefix));
}

function normalizeUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    let normalized = parsed.origin + parsed.pathname + parsed.search;
    if (normalized.endsWith("/") && parsed.pathname !== "/") {
      normalized = normalized.slice(0, -1);
    }
    return normalized;
  } catch {
    return url.toLowerCase().replace(/\/$/, "");
  }
}

function toDomainUrl(url) {
  try {
    const parsed = new URL(url);
    parsed.hostname = parsed.hostname.toLowerCase();
    return parsed.origin;
  } catch {
    return url;
  }
}

function normalizeKeyword(keyword) {
  return keyword.trim().toLowerCase();
}

function migrateBlocked(data) {
  if (!data?.length) return [];
  if (typeof data[0] === "string") {
    return data.map((url) => ({ url, mode: "full", hits: 0 }));
  }
  return data.map((entry) => ({
    url: entry.url,
    mode: entry.mode || "full",
    hits: entry.hits || 0,
  }));
}

function migrateWhitelist(data) {
  if (!data?.length) return [];
  if (typeof data[0] === "string") {
    return data.map((url) => ({ url, hits: 0 }));
  }
  return data.map((entry) => ({ url: entry.url, hits: entry.hits || 0 }));
}

function migrateKeywords(data) {
  if (!data?.length) return [];
  if (typeof data[0] === "string") {
    return data.map((keyword) => ({ keyword, hits: 0 }));
  }
  return data.map((entry) => ({ keyword: entry.keyword, hits: entry.hits || 0 }));
}

function normalizePending(data) {
  return (data || []).map((item) => ({
    url: item.url,
    timestamp: item.timestamp || Date.now(),
    hits: item.hits || 0,
  }));
}

function buildIndexes() {
  const whitelistDomains = new Set(cache.whitelist.map((entry) => entry.url));
  const domainBlocks = new Map();
  const fullBlocks = new Map();

  for (const entry of cache.blocked) {
    const key = `${entry.mode}:${entry.url}`;
    if (entry.mode === "domain") {
      domainBlocks.set(entry.url, entry);
    } else {
      fullBlocks.set(entry.url, entry);
    }
  }

  cache.indexes = { whitelistDomains, domainBlocks, fullBlocks };
}

function markDirty() {
  cache.dirty = true;
  schedulePersist();
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    flushCache();
  }, PERSIST_DELAY_MS);
}

async function flushCache() {
  if (!cache.loaded || !cache.dirty) return;

  cache.dirty = false;
  await chrome.storage.local.set({
    [STORAGE_KEY]: cache.blocked,
    [WHITELIST_KEY]: cache.whitelist,
    [KEYWORD_KEY]: cache.keywords,
    [PENDING_KEY]: cache.pending,
  });
}

async function persistNow() {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  cache.dirty = true;
  await flushCache();
}

async function loadCacheInternal() {
  const result = await chrome.storage.local.get([
    STORAGE_KEY,
    WHITELIST_KEY,
    KEYWORD_KEY,
    PENDING_KEY,
  ]);

  cache.blocked = migrateBlocked(result[STORAGE_KEY]);
  cache.whitelist = migrateWhitelist(result[WHITELIST_KEY]);
  cache.keywords = migrateKeywords(result[KEYWORD_KEY]);
  cache.pending = normalizePending(result[PENDING_KEY]);
  cache.pending = sanitizePending(cache.pending);
  cache.loaded = true;
  buildIndexes();

  const needsPersist =
    JSON.stringify(result[STORAGE_KEY]) !== JSON.stringify(cache.blocked) ||
    JSON.stringify(result[WHITELIST_KEY]) !== JSON.stringify(cache.whitelist) ||
    JSON.stringify(result[KEYWORD_KEY]) !== JSON.stringify(cache.keywords) ||
    JSON.stringify(result[PENDING_KEY]) !== JSON.stringify(cache.pending);

  if (needsPersist) {
    markDirty();
  }
}

async function ensureCache() {
  if (cache.loaded) return;

  if (!cachePromise) {
    cachePromise = loadCacheInternal().finally(() => {
      cachePromise = null;
    });
  }

  await cachePromise;
}

function sanitizePending(pending) {
  const whitelistDomains = new Set(cache.whitelist.map((entry) => entry.url));
  return pending.filter((item) => !whitelistDomains.has(toDomainUrl(item.url)));
}

function shouldSkipTabCheck(tabId, url) {
  const normalized = normalizeUrl(url);
  const key = `${tabId}:${normalized}`;
  const now = Date.now();
  const lastAt = tabCheckCache.get(key);

  if (lastAt && now - lastAt < TAB_CHECK_COOLDOWN_MS) {
    return true;
  }

  tabCheckCache.set(key, now);

  if (tabCheckCache.size > TAB_CHECK_CACHE_LIMIT) {
    const cutoff = now - TAB_CHECK_COOLDOWN_MS * 2;
    for (const [entryKey, entryAt] of tabCheckCache) {
      if (entryAt < cutoff) tabCheckCache.delete(entryKey);
    }
  }

  return false;
}

function findMatchingKeywords(tabUrl) {
  const haystack = normalizeUrl(tabUrl).toLowerCase();
  const matches = [];

  for (const entry of cache.keywords) {
    if (haystack.includes(entry.keyword)) {
      matches.push(entry);
    }
  }

  return matches;
}

function findMatchingBlockedEntry(tabUrl) {
  const normalized = normalizeUrl(tabUrl);
  const domain = toDomainUrl(tabUrl);
  const { domainBlocks, fullBlocks } = cache.indexes;

  if (domainBlocks.has(domain)) {
    return domainBlocks.get(domain);
  }

  if (fullBlocks.has(normalized)) {
    return fullBlocks.get(normalized);
  }

  return null;
}

function isWhitelisted(tabUrl) {
  if (isSystemUrl(tabUrl)) return true;
  return cache.indexes.whitelistDomains.has(toDomainUrl(tabUrl));
}

function isBlocked(tabUrl) {
  if (isSystemUrl(tabUrl)) return false;
  if (findMatchingKeywords(tabUrl).length > 0) return true;
  if (isWhitelisted(tabUrl)) return false;
  return Boolean(findMatchingBlockedEntry(tabUrl));
}

function incrementHit(entry) {
  entry.hits = (entry.hits || 0) + 1;
  markDirty();
}

function recordBlockHits(url) {
  const matchingKeywords = findMatchingKeywords(url);
  if (matchingKeywords.length) {
    for (const entry of matchingKeywords) {
      incrementHit(entry);
    }
    return;
  }

  const matchingEntry = findMatchingBlockedEntry(url);
  if (matchingEntry) {
    incrementHit(matchingEntry);
  }
}

function getPendingHits(url) {
  const normalized = normalizeUrl(url);
  const item = cache.pending.find((entry) => entry.url === normalized);
  return item?.hits || 0;
}

async function getDefaultBlockMode() {
  await ensureCache();
  const result = await chrome.storage.local.get(DEFAULT_MODE_KEY);
  return result[DEFAULT_MODE_KEY] || "domain";
}

async function setDefaultBlockMode(mode) {
  await chrome.storage.local.set({ [DEFAULT_MODE_KEY]: mode });
}

function entryValue(url, mode) {
  return mode === "domain" ? toDomainUrl(url) : normalizeUrl(url);
}

async function addBlockedUrl(url, mode) {
  await ensureCache();
  const blockMode = mode || (await getDefaultBlockMode());
  const value = entryValue(url, blockMode);
  const inheritedHits = getPendingHits(url);

  const existing = cache.blocked.find(
    (entry) => entry.url === value && entry.mode === blockMode
  );

  if (existing) {
    return { added: false, url: value, mode: blockMode, hits: existing.hits || 0 };
  }

  if (cache.blocked.length >= MAX_LIST_SIZE) {
    return { added: false, error: "limit", url: value, mode: blockMode };
  }

  cache.blocked.push({ url: value, mode: blockMode, hits: inheritedHits });
  buildIndexes();
  removePendingUrl(url, false);
  await persistNow();
  return { added: true, url: value, mode: blockMode, hits: inheritedHits };
}

async function removeBlockedUrl(url, mode) {
  await ensureCache();
  cache.blocked = cache.blocked.filter(
    (entry) => !(entry.url === url && entry.mode === mode)
  );
  buildIndexes();
  await persistNow();
}

async function addWhitelistDomain(url) {
  await ensureCache();
  const domain = toDomainUrl(url);
  const inheritedHits = getPendingHits(url);
  const existing = cache.whitelist.find((entry) => entry.url === domain);

  if (existing) {
    return { added: false, url: domain, hits: existing.hits || 0 };
  }

  if (cache.whitelist.length >= MAX_LIST_SIZE) {
    return { added: false, error: "limit", url: domain };
  }

  cache.whitelist.push({ url: domain, hits: inheritedHits });
  buildIndexes();
  removePendingByDomain(domain, false);
  await persistNow();
  return { added: true, url: domain, hits: inheritedHits };
}

async function removeWhitelistDomain(domain) {
  await ensureCache();
  cache.whitelist = cache.whitelist.filter((item) => item.url !== domain);
  buildIndexes();
  await persistNow();
}

async function addBlockedKeyword(keyword) {
  await ensureCache();
  const normalized = normalizeKeyword(keyword);
  if (!normalized) {
    return { added: false, keyword: normalized, hits: 0 };
  }

  const existing = cache.keywords.find((entry) => entry.keyword === normalized);
  if (existing) {
    return { added: false, keyword: normalized, hits: existing.hits || 0 };
  }

  if (cache.keywords.length >= MAX_LIST_SIZE) {
    return { added: false, error: "limit", keyword: normalized, hits: 0 };
  }

  cache.keywords.push({ keyword: normalized, hits: 0 });
  await persistNow();
  return { added: true, keyword: normalized, hits: 0 };
}

async function removeBlockedKeyword(keyword) {
  await ensureCache();
  const normalized = normalizeKeyword(keyword);
  cache.keywords = cache.keywords.filter((item) => item.keyword !== normalized);
  await persistNow();
}

function suggestKeywordFromUrl(url) {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    if (parts.length) {
      return decodeURIComponent(parts[parts.length - 1]).slice(0, 50);
    }
  } catch {
    // ignore
  }
  return "";
}

function capturePendingUrl(url) {
  if (!url || isSystemUrl(url)) return;
  if (isBlocked(url)) return;

  if (isWhitelisted(url)) {
    const domain = toDomainUrl(url);
    const entry = cache.whitelist.find((item) => item.url === domain);
    if (entry) incrementHit(entry);
    return;
  }

  const normalized = normalizeUrl(url);
  const existing = cache.pending.find((item) => item.url === normalized);

  if (existing) {
    existing.hits = (existing.hits || 0) + 1;
    existing.timestamp = Date.now();
    cache.pending = [
      existing,
      ...cache.pending.filter((item) => item.url !== normalized),
    ].slice(0, MAX_PENDING);
    markDirty();
    return;
  }

  cache.pending = [
    { url: normalized, timestamp: Date.now(), hits: 1 },
    ...cache.pending.filter((item) => item.url !== normalized),
  ].slice(0, MAX_PENDING);
  markDirty();
}

function removePendingUrl(url, persist = true) {
  const normalized = normalizeUrl(url);
  cache.pending = cache.pending.filter((item) => item.url !== normalized);
  if (persist) {
    markDirty();
  }
}

function removePendingByDomain(domain, persist = true) {
  cache.pending = cache.pending.filter((item) => toDomainUrl(item.url) !== domain);
  if (persist) {
    markDirty();
  }
}

async function clearPendingUrls() {
  await ensureCache();
  cache.pending = [];
  await persistNow();
}

async function checkAndCloseTab(tabId, url) {
  if (!url || isSystemUrl(url)) return;
  if (shouldSkipTabCheck(tabId, url)) return;

  await ensureCache();

  if (isBlocked(url)) {
    recordBlockHits(url);
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab may already be closed
    }
    return;
  }

  capturePendingUrl(url);
}

function getSummary() {
  const domainCount = cache.blocked.filter((entry) => entry.mode === "domain").length;
  const urlCount = cache.blocked.filter((entry) => entry.mode === "full").length;

  return {
    domainCount,
    urlCount,
    keywordCount: cache.keywords.length,
    whitelistCount: cache.whitelist.length,
    pendingCount: cache.pending.length,
  };
}

function getPaginatedList(type, page = 1, pageSize = 8) {
  let items = [];

  if (type === "domain") {
    items = cache.blocked.filter((entry) => entry.mode === "domain");
  } else if (type === "full") {
    items = cache.blocked.filter((entry) => entry.mode === "full");
  } else if (type === "keyword") {
    items = cache.keywords;
  } else if (type === "whitelist") {
    items = cache.whitelist;
  } else if (type === "pending") {
    items = cache.pending;
  }

  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.min(Math.max(page, 1), totalPages);
  const start = (currentPage - 1) * pageSize;

  return {
    items: items.slice(start, start + pageSize),
    total,
    page: currentPage,
    totalPages,
    pageSize,
  };
}

function setupContextMenus() {
  chrome.contextMenus.removeAll(() => {
    chrome.contextMenus.create({
      id: "block-page-domain",
      title: "Blokir domain ini",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "block-page-url",
      title: "Blokir URL ini",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "whitelist-page-domain",
      title: "Whitelist domain ini",
      contexts: ["page"],
    });
    chrome.contextMenus.create({
      id: "block-link-url",
      title: "Blokir URL link ini",
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: "whitelist-link-domain",
      title: "Whitelist domain link ini",
      contexts: ["link"],
    });
    chrome.contextMenus.create({
      id: "block-selection-keyword",
      title: "Blokir kata terpilih",
      contexts: ["selection"],
    });
  });
}

chrome.runtime.onInstalled.addListener(async () => {
  setupContextMenus();
  await ensureCache();
});

chrome.runtime.onStartup.addListener(async () => {
  setupContextMenus();
  await ensureCache();
});

chrome.tabs.onRemoved.addListener((tabId) => {
  for (const key of tabCheckCache.keys()) {
    if (key.startsWith(`${tabId}:`)) {
      tabCheckCache.delete(key);
    }
  }
});

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId === "block-page-domain" && info.pageUrl) {
    await addBlockedUrl(info.pageUrl, "domain");
  } else if (info.menuItemId === "block-page-url" && info.pageUrl) {
    await addBlockedUrl(info.pageUrl, "full");
  } else if (info.menuItemId === "whitelist-page-domain" && info.pageUrl) {
    await addWhitelistDomain(info.pageUrl);
  } else if (info.menuItemId === "block-link-url" && info.linkUrl) {
    await addBlockedUrl(info.linkUrl, "full");
  } else if (info.menuItemId === "whitelist-link-domain" && info.linkUrl) {
    await addWhitelistDomain(info.linkUrl);
  } else if (info.menuItemId === "block-selection-keyword" && info.selectionText) {
    await addBlockedKeyword(info.selectionText);
  } else {
    return;
  }

  await ensureCache();
  if (tab?.id && tab.url && isBlocked(tab.url)) {
    try {
      await chrome.tabs.remove(tab.id);
    } catch {
      // Tab may already be closed
    }
  }
});

chrome.tabs.onCreated.addListener((tab) => {
  if (tab.id && tab.pendingUrl) {
    checkAndCloseTab(tab.id, tab.pendingUrl);
  } else if (tab.id && tab.url) {
    checkAndCloseTab(tab.id, tab.url);
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== "complete") return;

  const url = changeInfo.url || tab.url || tab.pendingUrl;
  if (url) {
    checkAndCloseTab(tabId, url);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  const handle = async () => {
    await ensureCache();

    switch (message.action) {
      case "getSummary":
        return getSummary();

      case "getList":
        return getPaginatedList(message.type, message.page, message.pageSize);

      case "addBlocked": {
        const result = await addBlockedUrl(message.url, message.mode);
        if (_sender.tab?.id && _sender.tab.url && isBlocked(_sender.tab.url)) {
          chrome.tabs.remove(_sender.tab.id).catch(() => {});
        }
        return result;
      }

      case "addKeyword": {
        const result = await addBlockedKeyword(message.keyword);
        if (_sender.tab?.id && _sender.tab.url && isBlocked(_sender.tab.url)) {
          chrome.tabs.remove(_sender.tab.id).catch(() => {});
        }
        return result;
      }

      case "removeBlocked":
        await removeBlockedUrl(message.url, message.mode);
        return { success: true };

      case "addWhitelist":
        return addWhitelistDomain(message.url);

      case "removeWhitelist":
        await removeWhitelistDomain(message.url);
        return { success: true };

      case "removeKeyword":
        await removeBlockedKeyword(message.keyword);
        return { success: true };

      case "removePending":
        removePendingUrl(message.url);
        await persistNow();
        return { success: true };

      case "clearPending":
        await clearPendingUrls();
        return { success: true };

      case "suggestKeyword":
        return { keyword: suggestKeywordFromUrl(message.url) };

      case "getDefaultMode":
        return { mode: await getDefaultBlockMode() };

      case "setDefaultMode":
        await setDefaultBlockMode(message.mode);
        return { success: true };

      default:
        return null;
    }
  };

  handle()
    .then((response) => sendResponse(response))
    .catch(() => sendResponse(null));

  return true;
});
