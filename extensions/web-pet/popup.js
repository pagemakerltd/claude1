const DEFAULTS = { petEnabled: true, petPets: null, petWho: "cat", petFollow: false, petClimb: true, petHome: true, petPlaydate: true };
const $ = (id) => document.getElementById(id);

const PET_IDS = ["cat", "dog", "pluto", "happy"];
let pets = ["cat"];

function renderPets() {
  for (const box of document.querySelectorAll("input[data-pet]")) box.checked = pets.includes(box.dataset.pet);
  $("playTogether").style.display = pets.length >= 2 ? "" : "none";
  $("playdate").disabled = pets.length < 2;
}

// ค่าเก่า (petWho) ยังอ่านได้: cat | dog | both
function idsFrom(s) {
  if (Array.isArray(s.petPets)) return s.petPets.filter((id) => PET_IDS.includes(id));
  if (s.petWho === "dog") return ["dog"];
  if (s.petWho === "both") return ["cat", "dog"];
  return ["cat"];
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  pets = idsFrom(s);
  $("enabled").checked = s.petEnabled !== false;
  $("home").checked = s.petHome !== false;
  $("playdate").checked = s.petPlaydate !== false;
  $("follow").checked = s.petFollow === true;
  $("climb").checked = s.petClimb !== false;
  renderPets();
});

for (const box of document.querySelectorAll("input[data-pet]")) {
  box.addEventListener("change", () => {
    pets = PET_IDS.filter((id) => document.querySelector(`input[data-pet="${id}"]`).checked);
    chrome.storage.sync.set({ petPets: pets });
    renderPets();
  });
}

$("enabled").addEventListener("change", (e) => chrome.storage.sync.set({ petEnabled: e.target.checked }));
$("home").addEventListener("change", (e) => chrome.storage.sync.set({ petHome: e.target.checked }));
$("playdate").addEventListener("change", (e) => chrome.storage.sync.set({ petPlaydate: e.target.checked }));
$("follow").addEventListener("change", (e) => chrome.storage.sync.set({ petFollow: e.target.checked }));
$("climb").addEventListener("change", (e) => chrome.storage.sync.set({ petClimb: e.target.checked }));

// ส่งคำสั่งไปที่สัตว์เลี้ยงในแท็บปัจจุบัน (ต้องมี content script ทำงานอยู่ในหน้านั้น)
function sendToPet(message) {
  $("msg").textContent = "";
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, message, () => {
      if (chrome.runtime.lastError) {
        $("msg").textContent = "ใช้ไม่ได้กับหน้านี้ (ลอง refresh หน้าเว็บก่อน)";
      } else {
        window.close();
      }
    });
  });
}

for (const kind of ["yarn", "fish", "bone", "ball"]) {
  $(kind).addEventListener("click", () => sendToPet({ type: "pet-toy", kind }));
}
$("chat").addEventListener("click", () => sendToPet({ type: "pet-open", tab: "chat" }));
$("notes").addEventListener("click", () => sendToPet({ type: "pet-open", tab: "notes" }));
$("sites").addEventListener("click", () => sendToPet({ type: "pet-open", tab: "sites" }));
$("gohome").addEventListener("click", () => sendToPet({ type: "pet-gohome" }));
$("playTogether").addEventListener("click", () => sendToPet({ type: "pet-play" }));
$("options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
