const STORAGE_KEY = "blockedUrls";
const WHITELIST_KEY = "whitelistDomains";
const KEYWORD_KEY = "blockedKeywords";
const PENDING_KEY = "pendingUrls";
const DEFAULT_MODE_KEY = "defaultBlockMode";
const MAX_PENDING = 30;

const SYSTEM_URL_PREFIXES = [
  "chrome://",
  "chrome-extension://",
  "edge://",
  "about:",
  "devtools://",
];

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

async function getDefaultBlockMode() {
  const result = await chrome.storage.local.get(DEFAULT_MODE_KEY);
  return result[DEFAULT_MODE_KEY] || "domain";
}

async function setDefaultBlockMode(mode) {
  await chrome.storage.local.set({ [DEFAULT_MODE_KEY]: mode });
}

async function getBlockedUrls() {
  const result = await chrome.storage.local.get(STORAGE_KEY);
  const data = result[STORAGE_KEY] || [];

  if (data.length > 0 && typeof data[0] === "string") {
    const migrated = data.map((url) => ({ url, mode: "full" }));
    await chrome.storage.local.set({ [STORAGE_KEY]: migrated });
    return migrated;
  }

  return data;
}

async function getWhitelistDomains() {
  const result = await chrome.storage.local.get(WHITELIST_KEY);
  return result[WHITELIST_KEY] || [];
}

async function getBlockedKeywords() {
  const result = await chrome.storage.local.get(KEYWORD_KEY);
  return result[KEYWORD_KEY] || [];
}

function normalizeKeyword(keyword) {
  return keyword.trim().toLowerCase();
}

function matchesKeyword(tabUrl, keywords) {
  if (!keywords.length) return false;
  const haystack = normalizeUrl(tabUrl).toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

async function getPendingUrls() {
  const result = await chrome.storage.local.get(PENDING_KEY);
  const pending = result[PENDING_KEY] || [];
  const whitelist = await getWhitelistDomains();
  const filtered = pending.filter((item) => !isWhitelisted(item.url, whitelist));

  if (filtered.length !== pending.length) {
    await chrome.storage.local.set({ [PENDING_KEY]: filtered });
  }

  return filtered;
}

function entryValue(url, mode) {
  return mode === "domain" ? toDomainUrl(url) : normalizeUrl(url);
}

function matchesEntry(tabUrl, entry) {
  const normalized = normalizeUrl(tabUrl);

  if (entry.mode === "domain") {
    return toDomainUrl(tabUrl) === entry.url;
  }

  return normalized === entry.url;
}

function isWhitelisted(tabUrl, whitelist) {
  if (isSystemUrl(tabUrl)) return true;
  const domain = toDomainUrl(tabUrl);
  return whitelist.includes(domain);
}

function isBlocked(tabUrl, blockedList, whitelist, keywords) {
  if (isSystemUrl(tabUrl)) return false;
  if (matchesKeyword(tabUrl, keywords)) return true;
  if (isWhitelisted(tabUrl, whitelist)) return false;
  return blockedList.some((entry) => matchesEntry(tabUrl, entry));
}

async function addBlockedUrl(url, mode) {
  const blockMode = mode || (await getDefaultBlockMode());
  const value = entryValue(url, blockMode);
  const blockedUrls = await getBlockedUrls();

  const exists = blockedUrls.some(
    (entry) => entry.url === value && entry.mode === blockMode
  );

  if (exists) {
    return { added: false, url: value, mode: blockMode };
  }

  blockedUrls.push({ url: value, mode: blockMode });
  await chrome.storage.local.set({ [STORAGE_KEY]: blockedUrls });
  await removePendingUrl(url);
  return { added: true, url: value, mode: blockMode };
}

async function removeBlockedUrl(url, mode) {
  const blockedUrls = await getBlockedUrls();
  const filtered = blockedUrls.filter(
    (entry) => !(entry.url === url && entry.mode === mode)
  );
  await chrome.storage.local.set({ [STORAGE_KEY]: filtered });
}

async function addWhitelistDomain(url) {
  const domain = toDomainUrl(url);
  const whitelist = await getWhitelistDomains();

  if (whitelist.includes(domain)) {
    return { added: false, url: domain };
  }

  whitelist.push(domain);
  await chrome.storage.local.set({ [WHITELIST_KEY]: whitelist });
  await removePendingByDomain(domain);
  return { added: true, url: domain };
}

async function removeWhitelistDomain(domain) {
  const whitelist = await getWhitelistDomains();
  const filtered = whitelist.filter((item) => item !== domain);
  await chrome.storage.local.set({ [WHITELIST_KEY]: filtered });
}

async function addBlockedKeyword(keyword) {
  const normalized = normalizeKeyword(keyword);
  if (!normalized) {
    return { added: false, keyword: normalized };
  }

  const keywords = await getBlockedKeywords();
  if (keywords.includes(normalized)) {
    return { added: false, keyword: normalized };
  }

  keywords.push(normalized);
  await chrome.storage.local.set({ [KEYWORD_KEY]: keywords });
  return { added: true, keyword: normalized };
}

async function removeBlockedKeyword(keyword) {
  const normalized = normalizeKeyword(keyword);
  const keywords = await getBlockedKeywords();
  const filtered = keywords.filter((item) => item !== normalized);
  await chrome.storage.local.set({ [KEYWORD_KEY]: filtered });
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

async function capturePendingUrl(url) {
  if (!url || isSystemUrl(url)) return;

  const whitelist = await getWhitelistDomains();
  const keywords = await getBlockedKeywords();
  const blockedUrls = await getBlockedUrls();

  if (isBlocked(url, blockedUrls, whitelist, keywords)) return;

  if (isWhitelisted(url, whitelist)) return;

  const normalized = normalizeUrl(url);

  const pending = await getPendingUrls();
  const filtered = pending.filter((item) => item.url !== normalized);

  filtered.unshift({ url: normalized, timestamp: Date.now() });

  await chrome.storage.local.set({
    [PENDING_KEY]: filtered.slice(0, MAX_PENDING),
  });
}

async function removePendingUrl(url) {
  const normalized = normalizeUrl(url);
  const pending = await getPendingUrls();
  const filtered = pending.filter((item) => item.url !== normalized);
  await chrome.storage.local.set({ [PENDING_KEY]: filtered });
}

async function removePendingByDomain(domain) {
  const pending = await getPendingUrls();
  const filtered = pending.filter((item) => toDomainUrl(item.url) !== domain);
  await chrome.storage.local.set({ [PENDING_KEY]: filtered });
}

async function clearPendingUrls() {
  await chrome.storage.local.set({ [PENDING_KEY]: [] });
}

async function checkAndCloseTab(tabId, url) {
  if (!url || isSystemUrl(url)) return;

  const blockedUrls = await getBlockedUrls();
  const whitelist = await getWhitelistDomains();
  const keywords = await getBlockedKeywords();

  if (isBlocked(url, blockedUrls, whitelist, keywords)) {
    try {
      await chrome.tabs.remove(tabId);
    } catch {
      // Tab may already be closed
    }
    return;
  }

  await capturePendingUrl(url);
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

chrome.runtime.onInstalled.addListener(() => {
  setupContextMenus();
});

chrome.runtime.onStartup.addListener(() => {
  setupContextMenus();
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

  const updatedBlocked = await getBlockedUrls();
  const updatedWhitelist = await getWhitelistDomains();
  const updatedKeywords = await getBlockedKeywords();

  if (tab?.id && tab.url && isBlocked(tab.url, updatedBlocked, updatedWhitelist, updatedKeywords)) {
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
  if (changeInfo.status !== "loading" && changeInfo.status !== "complete") return;

  const url = changeInfo.url || tab.url || tab.pendingUrl;
  if (url) {
    checkAndCloseTab(tabId, url);
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.action === "addBlocked") {
    addBlockedUrl(message.url, message.mode).then(async (result) => {
      if (_sender.tab?.id && _sender.tab.url) {
        const blockedUrls = await getBlockedUrls();
        const whitelist = await getWhitelistDomains();
        const keywords = await getBlockedKeywords();
        if (isBlocked(_sender.tab.url, blockedUrls, whitelist, keywords)) {
          chrome.tabs.remove(_sender.tab.id).catch(() => {});
        }
      }
      sendResponse(result);
    });
    return true;
  }

  if (message.action === "addKeyword") {
    addBlockedKeyword(message.keyword).then(async (result) => {
      if (_sender.tab?.id && _sender.tab.url) {
        const blockedUrls = await getBlockedUrls();
        const whitelist = await getWhitelistDomains();
        const keywords = await getBlockedKeywords();
        if (isBlocked(_sender.tab.url, blockedUrls, whitelist, keywords)) {
          chrome.tabs.remove(_sender.tab.id).catch(() => {});
        }
      }
      sendResponse(result);
    });
    return true;
  }

  if (message.action === "getKeywords") {
    getBlockedKeywords().then((keywords) => sendResponse({ keywords }));
    return true;
  }

  if (message.action === "removeKeyword") {
    removeBlockedKeyword(message.keyword).then(() =>
      sendResponse({ success: true })
    );
    return true;
  }

  if (message.action === "suggestKeyword") {
    sendResponse({ keyword: suggestKeywordFromUrl(message.url) });
    return false;
  }

  if (message.action === "getBlocked") {
    getBlockedUrls().then((urls) => sendResponse({ urls }));
    return true;
  }

  if (message.action === "removeBlocked") {
    removeBlockedUrl(message.url, message.mode).then(() =>
      sendResponse({ success: true })
    );
    return true;
  }

  if (message.action === "addWhitelist") {
    addWhitelistDomain(message.url).then((result) => sendResponse(result));
    return true;
  }

  if (message.action === "getWhitelist") {
    getWhitelistDomains().then((urls) => sendResponse({ urls }));
    return true;
  }

  if (message.action === "removeWhitelist") {
    removeWhitelistDomain(message.url).then(() =>
      sendResponse({ success: true })
    );
    return true;
  }

  if (message.action === "getPending") {
    getPendingUrls().then((urls) => sendResponse({ urls }));
    return true;
  }

  if (message.action === "removePending") {
    removePendingUrl(message.url).then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === "clearPending") {
    clearPendingUrls().then(() => sendResponse({ success: true }));
    return true;
  }

  if (message.action === "getDefaultMode") {
    getDefaultBlockMode().then((mode) => sendResponse({ mode }));
    return true;
  }

  if (message.action === "setDefaultMode") {
    setDefaultBlockMode(message.mode).then(() =>
      sendResponse({ success: true })
    );
    return true;
  }
});
