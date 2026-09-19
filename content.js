(function () {
  if (
    location.protocol === "chrome:" ||
    location.protocol === "chrome-extension:" ||
    location.protocol === "edge:" ||
    location.protocol === "about:"
  ) {
    return;
  }

  if (document.getElementById("tab-blocker-fab")) return;

  const button = document.createElement("button");
  button.id = "tab-blocker-fab";
  button.type = "button";
  button.title = "Blokir URL ini";
  button.setAttribute("aria-label", "Blokir URL ini");
  button.textContent = "🚫";

  button.addEventListener("click", () => {
    button.disabled = true;

    chrome.runtime.sendMessage(
      { action: "addBlocked", url: location.href },
      (response) => {
        if (chrome.runtime.lastError) {
          button.disabled = false;
          return;
        }

        button.classList.add("tab-blocker-fab--success");
        button.title = response?.added
          ? "URL ditambahkan ke daftar blokir"
          : "URL sudah ada di daftar blokir";

        setTimeout(() => {
          button.classList.remove("tab-blocker-fab--success");
          button.disabled = false;
          button.title = "Blokir URL ini";
        }, 1000);
      }
    );
  });

  document.documentElement.appendChild(button);
})();
