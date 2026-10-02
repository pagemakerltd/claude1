const DEFAULTS = { petEnabled: true, petWho: "cat", petFollow: false, petClimb: true, petHome: true, petPlaydate: true };
const $ = (id) => document.getElementById(id);

let who = "cat";

function renderWho() {
  for (const r of document.querySelectorAll('input[name="who"]')) r.checked = r.value === who;
  $("catImg").classList.toggle("off", who === "dog");
  $("dogImg").classList.toggle("off", who === "cat");
  $("addDog").style.display = who === "cat" ? "" : "none";
  $("playTogether").style.display = who === "both" ? "" : "none";
  $("playdate").disabled = who !== "both";
}

chrome.storage.sync.get(DEFAULTS, (s) => {
  who = ["cat", "dog", "both"].includes(s.petWho) ? s.petWho : "cat";
  $("enabled").checked = s.petEnabled !== false;
  $("home").checked = s.petHome !== false;
  $("playdate").checked = s.petPlaydate !== false;
  $("follow").checked = s.petFollow === true;
  $("climb").checked = s.petClimb !== false;
  renderWho();
});

function setWho(v) {
  who = v;
  chrome.storage.sync.set({ petWho: v });
  renderWho();
}

for (const r of document.querySelectorAll('input[name="who"]')) r.addEventListener("change", () => setWho(r.value));
$("addDog").addEventListener("click", () => setWho("both"));

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
