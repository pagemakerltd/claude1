const DEFAULTS = { petEnabled: true, petFollow: false, petClimb: true };
const $ = (id) => document.getElementById(id);

chrome.storage.sync.get(DEFAULTS, (s) => {
  $("enabled").checked = s.petEnabled !== false;
  $("follow").checked = s.petFollow === true;
  $("climb").checked = s.petClimb !== false;
});

$("enabled").addEventListener("change", (e) => chrome.storage.sync.set({ petEnabled: e.target.checked }));
$("follow").addEventListener("change", (e) => chrome.storage.sync.set({ petFollow: e.target.checked }));
$("climb").addEventListener("change", (e) => chrome.storage.sync.set({ petClimb: e.target.checked }));

// ส่งของเล่นไปที่แท็บปัจจุบัน (ต้องมี content script ทำงานอยู่ในหน้านั้น)
function giveToy(kind) {
  $("msg").textContent = "";
  chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
    if (!tab) return;
    chrome.tabs.sendMessage(tab.id, { type: "pet-toy", kind }, () => {
      if (chrome.runtime.lastError) {
        $("msg").textContent = "ใช้ไม่ได้กับหน้านี้ (ลอง refresh หน้าเว็บก่อน)";
      } else {
        window.close();
      }
    });
  });
}

$("yarn").addEventListener("click", () => giveToy("yarn"));
$("fish").addEventListener("click", () => giveToy("fish"));
