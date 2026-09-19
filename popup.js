const listEl = document.getElementById("list");
const emptyEl = document.getElementById("empty");
const countEl = document.getElementById("count");
const pendingListEl = document.getElementById("pendingList");
const pendingEmptyEl = document.getElementById("pendingEmpty");
const clearPendingBtn = document.getElementById("clearPending");
const modeHintEl = document.getElementById("modeHint");
const modeRadios = document.querySelectorAll('input[name="blockMode"]');

const MODE_HINTS = {
  domain: "Semua halaman di domain yang sama akan diblokir.",
  full: "Hanya URL yang sama persis yang akan diblokir.",
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

function getSelectedMode() {
  const checked = document.querySelector('input[name="blockMode"]:checked');
  return checked?.value || "domain";
}

function createBadge(mode) {
  const badge = document.createElement("span");
  badge.className = `badge badge--${mode}`;
  badge.textContent = mode === "domain" ? "Domain" : "URL Penuh";
  return badge;
}

function renderBlockedList(urls) {
  listEl.innerHTML = "";

  if (urls.length === 0) {
    emptyEl.style.display = "block";
    countEl.textContent = "0 URL terblokir";
    return;
  }

  emptyEl.style.display = "none";
  countEl.textContent = `${urls.length} URL terblokir`;

  urls.forEach((entry) => {
    const item = document.createElement("li");
    item.className = "list-item";

    const info = document.createElement("div");
    info.className = "list-item__info";

    const urlSpan = document.createElement("span");
    urlSpan.className = "list-item__url";
    urlSpan.textContent = entry.url;
    urlSpan.title = entry.url;

    info.appendChild(urlSpan);
    info.appendChild(createBadge(entry.mode));

    const removeBtn = document.createElement("button");
    removeBtn.className = "list-item__remove";
    removeBtn.type = "button";
    removeBtn.textContent = "Hapus";
    removeBtn.addEventListener("click", async () => {
      await sendMessage({
        action: "removeBlocked",
        url: entry.url,
        mode: entry.mode,
      });
      loadAll();
    });

    item.appendChild(info);
    item.appendChild(removeBtn);
    listEl.appendChild(item);
  });
}

function renderPendingList(urls) {
  pendingListEl.innerHTML = "";

  if (urls.length === 0) {
    pendingEmptyEl.style.display = "block";
    clearPendingBtn.style.display = "none";
    return;
  }

  pendingEmptyEl.style.display = "none";
  clearPendingBtn.style.display = "inline";

  urls.forEach((entry) => {
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

    const blockBtn = document.createElement("button");
    blockBtn.className = "btn btn--block";
    blockBtn.type = "button";
    blockBtn.textContent = "Blokir";
    blockBtn.addEventListener("click", async () => {
      const mode = getSelectedMode();
      await sendMessage({ action: "addBlocked", url: entry.url, mode });
      loadAll();
    });

    const dismissBtn = document.createElement("button");
    dismissBtn.className = "btn btn--dismiss";
    dismissBtn.type = "button";
    dismissBtn.textContent = "Abaikan";
    dismissBtn.addEventListener("click", async () => {
      await sendMessage({ action: "removePending", url: entry.url });
      loadAll();
    });

    actions.appendChild(blockBtn);
    actions.appendChild(dismissBtn);

    item.appendChild(info);
    item.appendChild(actions);
    pendingListEl.appendChild(item);
  });
}

async function loadDefaultMode() {
  const response = await sendMessage({ action: "getDefaultMode" });
  const mode = response?.mode || "domain";

  modeRadios.forEach((radio) => {
    radio.checked = radio.value === mode;
  });

  modeHintEl.textContent = MODE_HINTS[mode];
}

async function loadAll() {
  const [blocked, pending] = await Promise.all([
    sendMessage({ action: "getBlocked" }),
    sendMessage({ action: "getPending" }),
  ]);

  renderBlockedList(blocked?.urls || []);
  renderPendingList(pending?.urls || []);
}

modeRadios.forEach((radio) => {
  radio.addEventListener("change", async () => {
    const mode = getSelectedMode();
    modeHintEl.textContent = MODE_HINTS[mode];
    await sendMessage({ action: "setDefaultMode", mode });
  });
});

clearPendingBtn.addEventListener("click", async () => {
  await sendMessage({ action: "clearPending" });
  loadAll();
});

loadDefaultMode().then(loadAll);
