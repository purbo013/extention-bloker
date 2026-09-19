const STORAGE_KEY = "blockedUrls";
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

async function getPendingUrls() {
  const result = await chrome.storage.local.get(PENDING_KEY);
  return result[PENDING_KEY] || [];
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

function isBlocked(tabUrl, blockedList) {
  if (isSystemUrl(tabUrl)) return false;
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

async function capturePendingUrl(url) {
  if (!url || isSystemUrl(url)) return;

  const normalized = normalizeUrl(url);
  const blockedUrls = await getBlockedUrls();

  if (isBlocked(url, blockedUrls)) return;

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

async function clearPendingUrls() {
  await chrome.storage.local.set({ [PENDING_KEY]: [] });
}

async function checkAndCloseTab(tabId, url) {
  if (!url || isSystemUrl(url)) return;

  const blockedUrls = await getBlockedUrls();
  if (isBlocked(url, blockedUrls)) {
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
      id: "block-page-url",
      title: "Blokir URL ini",
      contexts: ["page"],
    });

    chrome.contextMenus.create({
      id: "block-link-url",
      title: "Blokir link ini",
      contexts: ["link"],
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
  let urlToBlock = null;

  if (info.menuItemId === "block-link-url" && info.linkUrl) {
    urlToBlock = info.linkUrl;
  } else if (info.menuItemId === "block-page-url" && info.pageUrl) {
    urlToBlock = info.pageUrl;
  }

  if (!urlToBlock) return;

  await addBlockedUrl(urlToBlock);

  if (tab?.id && tab.url && isBlocked(tab.url, await getBlockedUrls())) {
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
        if (isBlocked(_sender.tab.url, blockedUrls)) {
          chrome.tabs.remove(_sender.tab.id).catch(() => {});
        }
      }
      sendResponse(result);
    });
    return true;
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
