const btn = document.getElementById("toggle");
const hostEl = document.getElementById("host");

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
      render(enabled);
    });
  });
});
