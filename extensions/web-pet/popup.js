const DEFAULTS = { petEnabled: true, petFollow: false, petClimb: true, petHome: true };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (s) => {
  $("enabled").checked = s.petEnabled !== false;
  $("home").checked = s.petHome !== false;
  $("follow").checked = s.petFollow === true;
  $("climb").checked = s.petClimb !== false;
});

$("enabled").addEventListener("change", (e) => chrome.storage.sync.set({ petEnabled: e.target.checked }));
$("home").addEventListener("change", (e) => chrome.storage.sync.set({ petHome: e.target.checked }));
$("follow").addEventListener("change", (e) => chrome.storage.sync.set({ petFollow: e.target.checked }));
$("climb").addEventListener("change", (e) => chrome.storage.sync.set({ petClimb: e.target.checked }));

// ส่งคำสั่งไปที่น้องในแท็บปัจจุบัน (ต้องมี content script ทำงานอยู่ในหน้านั้น)
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

$("yarn").addEventListener("click", () => sendToPet({ type: "pet-toy", kind: "yarn" }));
$("fish").addEventListener("click", () => sendToPet({ type: "pet-toy", kind: "fish" }));
$("chat").addEventListener("click", () => sendToPet({ type: "pet-open", tab: "chat" }));
$("notes").addEventListener("click", () => sendToPet({ type: "pet-open", tab: "notes" }));
$("sites").addEventListener("click", () => sendToPet({ type: "pet-open", tab: "sites" }));
$("gohome").addEventListener("click", () => sendToPet({ type: "pet-gohome" }));
$("options").addEventListener("click", (e) => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});
