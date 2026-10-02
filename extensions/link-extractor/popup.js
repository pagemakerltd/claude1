const $ = (id) => document.getElementById(id);
const extractBtn = $("extract");
const highlightBtn = $("highlight");
const filterEl = $("filter");
const countEl = $("count");
const listEl = $("list");
const copyBtn = $("copy");
const csvBtn = $("csv");

let tabId = null;
let links = [];

// ฟังก์ชันที่ฉีดเข้าไปในหน้าเว็บ ต้องทำงานได้ด้วยตัวเอง (ไม่อ้างตัวแปรภายนอก)
function collectLinks() {
  const seen = new Set();
  const out = [];
  for (const a of document.querySelectorAll("a[href]")) {
    if (!/^https?:$/.test(a.protocol) || seen.has(a.href)) continue;
    seen.add(a.href);
    const text = (a.innerText || a.getAttribute("aria-label") || a.title || "")
      .trim()
      .replace(/\s+/g, " ");
    out.push({ text, href: a.href });
  }
  return out;
}

function toggleHighlight() {
  const ID = "link-extractor-highlight";
  const existing = document.getElementById(ID);
  if (existing) {
    existing.remove();
    return false;
  }
  const style = document.createElement("style");
  style.id = ID;
  style.textContent =
    "a[href] { background: #fff176 !important; color: #000 !important;" +
    " outline: 2px solid #f5b400 !important; }";
  document.head.appendChild(style);
  return true;
}

function visibleLinks() {
  const q = filterEl.value.trim().toLowerCase();
  if (!q) return links;
  return links.filter(
    (l) => l.href.toLowerCase().includes(q) || l.text.toLowerCase().includes(q)
  );
}

function render() {
  const shown = visibleLinks();
  listEl.textContent = "";
  for (const l of shown) {
    const li = document.createElement("li");
    const t = document.createElement("div");
    t.className = "text";
    t.textContent = l.text || "(ไม่มีข้อความ)";
    const u = document.createElement("div");
    u.className = "url";
    u.textContent = l.href;
    u.title = l.href;
    li.append(t, u);
    listEl.append(li);
  }
  countEl.textContent = `แสดง ${shown.length} จาก ${links.length} ลิงก์`;
  copyBtn.disabled = csvBtn.disabled = shown.length === 0;
}

function csvCell(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

extractBtn.addEventListener("click", async () => {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: collectLinks,
  });
  links = res.result || [];
  filterEl.disabled = false;
  render();
});

highlightBtn.addEventListener("click", async () => {
  const [res] = await chrome.scripting.executeScript({
    target: { tabId },
    func: toggleHighlight,
  });
  highlightBtn.classList.toggle("active", res.result);
});

filterEl.addEventListener("input", render);

copyBtn.addEventListener("click", async () => {
  await navigator.clipboard.writeText(visibleLinks().map((l) => l.href).join("\n"));
  copyBtn.textContent = "Copy แล้ว ✓";
  setTimeout(() => (copyBtn.textContent = "Copy"), 1200);
});

csvBtn.addEventListener("click", () => {
  const rows = [["text", "url"], ...visibleLinks().map((l) => [l.text, l.href])];
  // BOM ทำให้ Excel อ่านภาษาไทยได้ถูกต้อง
  const blob = new Blob(["﻿" + rows.map((r) => r.map(csvCell).join(",")).join("\r\n")], {
    type: "text/csv;charset=utf-8",
  });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "links.csv";
  a.click();
  URL.revokeObjectURL(a.href);
});

chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
  if (tab && /^https?:/.test(tab.url || "")) {
    tabId = tab.id;
    extractBtn.disabled = highlightBtn.disabled = false;
    countEl.textContent = "กด “ดึงลิงก์” เพื่อเริ่ม";
  } else {
    countEl.textContent = "ใช้ไม่ได้กับหน้านี้";
  }
});
