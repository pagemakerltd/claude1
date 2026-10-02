const totalEl = document.getElementById("total");
const dupesEl = document.getElementById("dupes");
const cleanBtn = document.getElementById("clean");
const msgEl = document.getElementById("msg");

// ถือว่าเป็นหน้าเดียวกันถ้า URL เหมือนกัน (ไม่นับส่วน #hash)
function normalize(url) {
  try {
    const u = new URL(url);
    u.hash = "";
    return u.href;
  } catch {
    return url;
  }
}

// คืนรายการ id ของแท็บที่ควรปิด โดยเก็บไว้ 1 แท็บต่อ URL
// ลำดับความสำคัญของแท็บที่เก็บ: กำลังใช้งานอยู่ > ปักหมุด > แท็บแรกสุด
function findDuplicates(tabs) {
  const groups = new Map();
  for (const tab of tabs) {
    if (!tab.url) continue;
    const key = normalize(tab.url);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(tab);
  }

  const toClose = [];
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const keep =
      group.find((t) => t.active) || group.find((t) => t.pinned) || group[0];
    for (const t of group) if (t !== keep) toClose.push(t.id);
  }
  return toClose;
}

function refresh() {
  chrome.tabs.query({}, (tabs) => {
    const dupes = findDuplicates(tabs);
    totalEl.textContent = tabs.length;
    dupesEl.textContent = dupes.length;
    cleanBtn.disabled = dupes.length === 0;
  });
}

cleanBtn.addEventListener("click", () => {
  chrome.tabs.query({}, (tabs) => {
    const ids = findDuplicates(tabs);
    chrome.tabs.remove(ids, () => {
      msgEl.textContent = `ปิดแล้ว ${ids.length} แท็บ`;
      refresh();
    });
  });
});

refresh();
