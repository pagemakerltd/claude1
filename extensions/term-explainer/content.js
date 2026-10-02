// แสดง tooltip อธิบายศัพท์เมื่อผู้ใช้ไฮไลต์ข้อความในหน้าเว็บ
(() => {
  if (window.__termExplainerLoaded) return;
  window.__termExplainerLoaded = true;

  const MAX_CHARS = 80;
  const MAX_WORDS = 8;
  const CONTEXT_CHARS = 400;

  const MESSAGES = {
    "no-key": "ยังไม่ได้ตั้งค่า API key — คลิกขวาที่ไอคอน extension → ตัวเลือก (Options)",
    "bad-key": "API key ไม่ถูกต้อง ตรวจสอบในหน้าตัวเลือกของ extension",
    "rate-limit": "เรียกใช้บ่อยเกินไป ลองใหม่อีกครั้งในอีกสักครู่",
    network: "เชื่อมต่อ Claude API ไม่ได้",
    refusal: "ไม่สามารถอธิบายคำนี้ได้",
    empty: "ไม่ได้รับคำตอบ ลองใหม่อีกครั้ง",
    api: "เกิดข้อผิดพลาดจาก API",
  };

  // ใช้ Shadow DOM เพื่อไม่ให้ CSS ของเว็บมากระทบ tooltip
  const host = document.createElement("div");
  host.style.cssText = "all: initial; position: fixed; z-index: 2147483647; top: 0; left: 0;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      .tip { position: fixed; max-width: 320px; box-sizing: border-box; padding: 10px 12px;
        background: #202124; color: #fff; border-radius: 8px; font: 13px/1.5 system-ui, sans-serif;
        box-shadow: 0 4px 16px rgba(0,0,0,.35); display: none; }
      .term { font-weight: 700; color: #f5b400; margin-bottom: 4px; word-break: break-word; }
      .body { white-space: pre-wrap; word-break: break-word; }
      .body.muted { color: #bbb; }
    </style>
    <div class="tip"><div class="term"></div><div class="body"></div></div>`;
  const tip = shadow.querySelector(".tip");
  const termEl = shadow.querySelector(".term");
  const bodyEl = shadow.querySelector(".body");
  document.documentElement.appendChild(host);

  let requestId = 0;

  function hide() {
    requestId++; // ทำให้คำตอบที่ยังค้างอยู่ถูกทิ้ง
    tip.style.display = "none";
  }

  function show(rect, term, text, muted) {
    termEl.textContent = term;
    bodyEl.textContent = text;
    bodyEl.classList.toggle("muted", Boolean(muted));
    tip.style.display = "block";

    const margin = 8;
    const { width, height } = tip.getBoundingClientRect();
    let left = Math.min(Math.max(margin, rect.left), window.innerWidth - width - margin);
    let top = rect.bottom + margin;
    if (top + height > window.innerHeight - margin) top = Math.max(margin, rect.top - height - margin);
    tip.style.left = `${left}px`;
    tip.style.top = `${top}px`;
  }

  function surroundingText(range) {
    let node = range.commonAncestorContainer;
    if (node.nodeType === Node.TEXT_NODE) node = node.parentElement;
    const text = (node?.innerText || node?.textContent || "").replace(/\s+/g, " ").trim();
    return text.slice(0, CONTEXT_CHARS);
  }

  function isTermLike(text) {
    return (
      text.length > 1 &&
      text.length <= MAX_CHARS &&
      text.split(/\s+/).length <= MAX_WORDS &&
      !/^https?:\/\//i.test(text)
    );
  }

  document.addEventListener("mouseup", (e) => {
    if (e.composedPath().includes(host)) return; // คลิกใน tooltip เอง

    // รอให้ browser อัปเดต selection ก่อน
    setTimeout(async () => {
      const sel = window.getSelection();
      const term = sel ? sel.toString().trim().replace(/\s+/g, " ") : "";
      if (!sel || sel.rangeCount === 0 || !isTermLike(term)) {
        hide();
        return;
      }

      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const id = ++requestId;
      show(rect, term, "กำลังค้นหา...", true);

      let result;
      try {
        result = await chrome.runtime.sendMessage({
          type: "explain",
          term,
          context: surroundingText(range),
        });
      } catch {
        result = { error: "network" }; // เช่น extension ถูก reload ขณะหน้าเปิดค้าง
      }
      if (id !== requestId) return; // ผู้ใช้เลือกคำอื่นไปแล้ว

      if (result?.text) show(rect, term, result.text, false);
      else show(rect, term, MESSAGES[result?.error] || MESSAGES.api, true);
    }, 0);
  });

  document.addEventListener("mousedown", (e) => {
    if (!e.composedPath().includes(host)) hide();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") hide();
  });
  document.addEventListener("scroll", hide, { passive: true });
})();
