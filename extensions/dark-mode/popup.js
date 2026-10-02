const btn = document.getElementById("toggle");
const hostEl = document.getElementById("host");

// ฟังก์ชันนี้ถูกฉีดเข้าไปในหน้าเว็บโดยตรง จึงต้องเป็นฟังก์ชันที่ทำงานได้ด้วยตัวเอง
// (ไม่อ้างถึงตัวแปรภายนอก) และต้องใช้ STYLE_ID/CSS ชุดเดียวกับ content.js
function applyDarkMode(enabled) {
  const STYLE_ID = "dark-mode-toggle-style";
  const CSS = `
    html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }
    img, picture, video, canvas, svg image, [style*="background-image"] {
      filter: invert(1) hue-rotate(180deg) !important;
    }
  `;
  const existing = document.getElementById(STYLE_ID);
  if (enabled && !existing) {
    const style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = CSS;
    (document.head || document.documentElement).appendChild(style);
  } else if (!enabled && existing) {
    existing.remove();
  }
}

function render(enabled) {
  btn.textContent = enabled ? "ปิดโหมดมืด" : "เปิดโหมดมืด";
  btn.classList.toggle("on", enabled);
}

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  let host = "";
  try {
    const url = new URL(tab.url);
    if (/^https?:$/.test(url.protocol)) host = url.hostname;
  } catch {}

  if (!host) {
    hostEl.textContent = "ใช้ไม่ได้กับหน้านี้";
    return;
  }

  hostEl.textContent = host;
  btn.disabled = false;

  chrome.storage.sync.get(host, (data) => {
    let enabled = Boolean(data[host]);
    render(enabled);
    btn.addEventListener("click", () => {
      enabled = !enabled;
      chrome.storage.sync.set({ [host]: enabled });
      // ใช้งานได้ทันทีโดยไม่ต้อง refresh แม้แท็บเปิดค้างก่อนติดตั้ง extension
      chrome.scripting.executeScript({
        target: { tabId: tab.id },
        func: applyDarkMode,
        args: [enabled],
      });
      render(enabled);
    });
  });
});
