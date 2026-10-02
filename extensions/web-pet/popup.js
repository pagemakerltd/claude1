const CHARACTERS = ["🐱", "🐶", "🐰", "🐥", "🐼", "🦊", "🐹", "🐧"];

const enabledEl = document.getElementById("enabled");
const grid = document.getElementById("grid");

function renderSelected(current) {
  for (const btn of grid.children) btn.classList.toggle("selected", btn.textContent === current);
}

chrome.storage.sync.get({ petEnabled: true, petCharacter: "🐱" }, (s) => {
  enabledEl.checked = s.petEnabled !== false;

  for (const c of CHARACTERS) {
    const btn = document.createElement("button");
    btn.textContent = c;
    btn.title = "เลือกตัวละครนี้";
    btn.addEventListener("click", () => {
      chrome.storage.sync.set({ petCharacter: c });
      renderSelected(c);
    });
    grid.append(btn);
  }
  renderSelected(s.petCharacter);
});

enabledEl.addEventListener("change", () => {
  chrome.storage.sync.set({ petEnabled: enabledEl.checked });
});
