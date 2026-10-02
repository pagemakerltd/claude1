// ฉีด/ถอด CSS โหมดมืดตามค่าที่เก็บไว้ของโดเมนปัจจุบัน
const STYLE_ID = "dark-mode-toggle-style";
const CSS = `
  html { filter: invert(1) hue-rotate(180deg) !important; background: #fff !important; }
  img, picture, video, canvas, svg image, [style*="background-image"] {
    filter: invert(1) hue-rotate(180deg) !important;
  }
`;

function apply(enabled) {
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

const host = location.hostname;

chrome.storage.sync.get(host, (data) => apply(Boolean(data[host])));

chrome.storage.onChanged.addListener((changes, area) => {
  if (area === "sync" && changes[host]) apply(Boolean(changes[host].newValue));
});
