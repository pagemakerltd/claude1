const enabledEl = document.getElementById("enabled");

chrome.storage.sync.get({ petEnabled: true }, (s) => {
  enabledEl.checked = s.petEnabled !== false;
});

enabledEl.addEventListener("change", () => {
  chrome.storage.sync.set({ petEnabled: enabledEl.checked });
});
