// แผงของน้องแมว: 💬 คุยกับน้อง, 📝 โน้ต, 🌐 เว็บที่จำไว้
// โหลดก่อน content.js (ใช้ global ร่วมกันใน isolated world ของ extension)
var WebPetPanel = (() => {
  const MAX_CHAT_STORED = 40;
  const MAX_CHAT_SENT = 14;
  const MAX_NOTE_CHARS = 2000;

  const CSS = `
    .panel { position: fixed; z-index: 10; right: 16px; bottom: 150px; width: 320px; max-width: calc(100vw - 24px);
      height: 400px; max-height: calc(100vh - 24px); display: none; flex-direction: column;
      background: #fff; color: #202124; border-radius: 14px; overflow: hidden;
      box-shadow: 0 8px 32px rgba(0,0,0,.3); font: 13px/1.5 system-ui, sans-serif;
      pointer-events: auto; box-sizing: border-box; }
    .panel.open { display: flex; }
    .panel * { box-sizing: border-box; }
    .head { display: flex; align-items: center; gap: 4px; padding: 6px 8px; background: #f1f3f4;
      cursor: grab; touch-action: none; user-select: none; -webkit-user-select: none; }
    .tabs { display: flex; gap: 4px; flex: 1; }
    .tabs button, .close { border: 0; border-radius: 8px; padding: 5px 9px; background: transparent;
      font: inherit; cursor: pointer; color: inherit; }
    .tabs button.active { background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,.18); font-weight: 600; }
    .close:hover, .tabs button:hover { background: rgba(0,0,0,.07); }
    .who { display: flex; gap: 2px; }
    .who button { border: 0; border-radius: 8px; padding: 3px 6px; background: transparent; font-size: 16px; cursor: pointer; opacity: .55; }
    .who button.active { background: #fff; opacity: 1; box-shadow: 0 1px 3px rgba(0,0,0,.18); }
    section { display: none; flex: 1; min-height: 0; flex-direction: column; padding: 10px; gap: 8px; }
    section.active { display: flex; }
    .msgs { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; padding-right: 2px; }
    .msg { max-width: 85%; padding: 6px 10px; border-radius: 12px; white-space: pre-wrap; word-break: break-word; }
    .msg.user { align-self: flex-end; background: #1a73e8; color: #fff; border-bottom-right-radius: 4px; }
    .msg.bot { align-self: flex-start; background: #f1f3f4; border-bottom-left-radius: 4px; }
    .msg.err { align-self: flex-start; background: #fce8e6; color: #c5221f; font-size: 12px; }
    .msg.wait { color: #888; }
    .send { display: flex; gap: 6px; }
    .send input { flex: 1; min-width: 0; padding: 7px 10px; border: 1px solid #dadce0; border-radius: 10px; font: inherit; }
    button.primary { border: 0; border-radius: 10px; padding: 7px 12px; background: #1a73e8; color: #fff;
      font: inherit; cursor: pointer; }
    button.primary:disabled { opacity: .5; cursor: default; }
    button.ghost { border: 1px solid #dadce0; border-radius: 10px; padding: 6px 10px; background: #fff;
      font: inherit; cursor: pointer; }
    textarea { width: 100%; min-height: 64px; resize: vertical; padding: 7px 10px; border: 1px solid #dadce0;
      border-radius: 10px; font: inherit; }
    .row { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .row label { display: flex; align-items: center; gap: 6px; font-size: 12px; color: #555; }
    .seg { display: flex; gap: 4px; }
    .seg button { border: 0; border-radius: 8px; padding: 3px 9px; background: #f1f3f4; font: inherit;
      font-size: 12px; cursor: pointer; }
    .seg button.active { background: #e8f0fe; color: #1a73e8; font-weight: 600; }
    ul { list-style: none; margin: 0; padding: 0; flex: 1; min-height: 0; overflow-y: auto; }
    li { padding: 8px 6px; border-bottom: 1px solid #eee; display: flex; gap: 8px; align-items: flex-start; }
    li .body { flex: 1; min-width: 0; }
    li .text { white-space: pre-wrap; word-break: break-word; }
    li .meta { font-size: 11px; color: #888; margin-top: 2px; word-break: break-all; }
    li a { color: #1a73e8; text-decoration: none; }
    li a:hover { text-decoration: underline; }
    li .del { border: 0; background: none; color: #c5221f; cursor: pointer; font-size: 14px; padding: 0 4px; }
    .empty { color: #999; text-align: center; padding: 16px 0; }
    .here { padding: 8px 10px; background: #f8f9fa; border-radius: 10px; font-size: 12px; word-break: break-word; }
  `;

  const store = {
    get: (keys) => new Promise((res) => chrome.storage.local.get(keys, res)),
    set: (obj) => new Promise((res) => chrome.storage.local.set(obj, res)),
  };

  const uid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const fmtDate = (t) => new Date(t).toLocaleDateString("th-TH", { day: "numeric", month: "short" });
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  };

  function pageInfo() {
    return { host: location.hostname, url: location.href, title: document.title || location.hostname };
  }

  // ตอนโหลดหน้า: ถ้าเป็นเว็บที่จำไว้ ให้นับจำนวนครั้งที่กลับมา แล้วคืนข้อมูลไปทักทาย
  async function visit() {
    const page = pageInfo();
    if (!/^https?:$/.test(location.protocol) || !page.host) return null;
    const { petSites = {}, petNotes = [] } = await store.get(["petSites", "petNotes"]);
    const site = petSites[page.host];
    if (!site) return null;
    site.visits = (site.visits || 1) + 1;
    site.lastVisit = Date.now();
    site.title = page.title || site.title;
    await store.set({ petSites });
    return { site, notes: petNotes.filter((n) => n.host === page.host).length };
  }

  function create(shadow, api) {
    const style = document.createElement("style");
    style.textContent = CSS;
    shadow.appendChild(style);

    const panel = el("div", "panel");
    panel.innerHTML = `
      <div class="head">
        <div class="tabs">
          <button data-tab="chat">💬 คุย</button>
          <button data-tab="notes">📝 โน้ต</button>
          <button data-tab="sites">🌐 เว็บ</button>
        </div>
        <div class="who"></div>
        <button class="close" title="ปิด">✕</button>
      </div>
      <section data-pane="chat">
        <div class="msgs"></div>
        <form class="send"><input type="text" maxlength="500" placeholder="พิมพ์คุยกับน้อง..." /><button class="primary">ส่ง</button></form>
      </section>
      <section data-pane="notes">
        <textarea placeholder="จดโน้ตอะไรดี..." maxlength="${MAX_NOTE_CHARS}"></textarea>
        <div class="row">
          <label><input type="checkbox" class="link" checked /> ผูกกับเว็บนี้</label>
          <button class="primary add">บันทึก</button>
        </div>
        <div class="seg"><button data-filter="here">เว็บนี้</button><button data-filter="all">ทั้งหมด</button></div>
        <ul class="note-list"></ul>
      </section>
      <section data-pane="sites">
        <div class="here"></div>
        <button class="ghost toggle"></button>
        <ul class="site-list"></ul>
      </section>`;
    shadow.appendChild(panel);

    const $ = (sel) => panel.querySelector(sel);
    const msgsEl = $(".msgs");
    const sendForm = $(".send");
    const input = $(".send input");
    const sendBtn = $(".send button");

    let tab = "chat";
    let sp = { id: "cat", label: "น้องแมว", emoji: "🐱", welcome: "เมี๊ยว~ มีอะไรอยากคุยกับฉันมั้ย? 🐾", storageKey: "petChat" };
    let avail = [];
    let noteFilter = "here";
    let chat = [];
    let notes = [];
    let sites = {};
    let busy = false;

    // ----- เปิด/ปิด/สลับแท็บ -----
    function setTab(name) {
      tab = name;
      for (const b of panel.querySelectorAll(".tabs button")) b.classList.toggle("active", b.dataset.tab === name);
      for (const s of panel.querySelectorAll("section")) s.classList.toggle("active", s.dataset.pane === name);
      if (name === "chat") {
        renderChat();
        input.focus();
      }
      if (name === "notes") renderNotes();
      if (name === "sites") renderSites();
    }

    async function load() {
      const s = await store.get([sp.storageKey, "petNotes", "petSites"]);
      chat = s[sp.storageKey] || [];
      notes = s.petNotes || [];
      sites = s.petSites || {};
    }

    async function open(name = "chat", info, list) {
      if (info) sp = info;
      avail = list && list.length ? list : [sp];
      await load();
      renderWho();
      panel.classList.add("open");
      setTab(name);
      api.onOpenChange(true);
    }

    // ถ้ามีทั้งหมาและแมว ให้สลับว่าจะคุยกับตัวไหน (โน้ตและเว็บที่จำไว้ใช้ร่วมกัน)
    function renderWho() {
      const box = $(".who");
      box.textContent = "";
      input.placeholder = `พิมพ์คุยกับ${sp.label}...`;
      if (avail.length < 2) return;
      for (const a of avail) {
        const b = el("button", a.id === sp.id ? "active" : "", a.emoji);
        b.title = a.label;
        b.addEventListener("click", async () => {
          if (a.id === sp.id || busy) return;
          const info = api.onSwitchSpecies(a.id);
          if (!info) return;
          sp = info;
          await load();
          renderWho();
          if (tab === "chat") renderChat();
        });
        box.appendChild(b);
      }
    }

    function close() {
      panel.classList.remove("open");
      api.onOpenChange(false);
    }

    const isOpen = () => panel.classList.contains("open");

    for (const b of panel.querySelectorAll(".tabs button")) b.addEventListener("click", () => setTab(b.dataset.tab));
    $(".close").addEventListener("click", close);

    // ไม่ให้แป้นพิมพ์ในแผงไปกระตุ้นปุ่มลัดของเว็บ (เช่น Gmail, YouTube) และ Esc ปิดแผง
    for (const type of ["keydown", "keyup", "keypress"]) {
      panel.addEventListener(type, (e) => {
        e.stopPropagation();
        if (type === "keydown" && e.key === "Escape") close();
      });
    }

    // ลากแผงด้วยแถบหัว
    const head = $(".head");
    let dragging = null;
    head.addEventListener("pointerdown", (e) => {
      if (e.target.closest("button")) return;
      const r = panel.getBoundingClientRect();
      dragging = { dx: e.clientX - r.left, dy: e.clientY - r.top };
      head.setPointerCapture(e.pointerId);
    });
    head.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const w = panel.offsetWidth;
      const h = panel.offsetHeight;
      const left = Math.min(Math.max(0, e.clientX - dragging.dx), window.innerWidth - w);
      const top = Math.min(Math.max(0, e.clientY - dragging.dy), window.innerHeight - h);
      panel.style.left = `${left}px`;
      panel.style.top = `${top}px`;
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });
    head.addEventListener("pointerup", () => (dragging = null));
    head.addEventListener("pointercancel", () => (dragging = null));

    // ----- 💬 แชท -----
    function addMsg(kind, text) {
      const m = el("div", `msg ${kind}`, text);
      msgsEl.appendChild(m);
      msgsEl.scrollTop = msgsEl.scrollHeight;
      return m;
    }

    function renderChat() {
      msgsEl.textContent = "";
      if (chat.length === 0) addMsg("bot", sp.welcome);
      for (const m of chat) addMsg(m.role === "user" ? "user" : "bot", m.text);
    }

    const ERRORS = {
      "no-key": "ยังไม่ได้ตั้งค่า API key — คลิกขวาที่ไอคอน extension → ตัวเลือก (Options)",
      "bad-key": "API key ไม่ถูกต้อง ตรวจสอบในหน้าตัวเลือกของ extension",
      "rate-limit": "ถามถี่เกินไป ลองใหม่อีกครั้งในอีกสักครู่",
      network: "เชื่อมต่อ Claude API ไม่ได้",
      refusal: "น้องตอบเรื่องนี้ไม่ได้",
      empty: "ไม่ได้รับคำตอบ ลองใหม่อีกครั้ง",
      api: "เกิดข้อผิดพลาดจาก API (ลองเช็กชื่อโมเดลในหน้าตัวเลือก)",
    };

    sendForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text || busy) return;
      input.value = "";
      busy = true;
      sendBtn.disabled = true;

      chat.push({ role: "user", text });
      chat = chat.slice(-MAX_CHAT_STORED);
      addMsg("user", text);
      const wait = addMsg("bot wait", "กำลังคิด...");
      api.onThinking(true);

      let result;
      try {
        result = await chrome.runtime.sendMessage({
          type: "pet-chat",
          species: sp.id,
          messages: chat.slice(-MAX_CHAT_SENT),
          page: pageInfo(),
        });
      } catch {
        result = { error: "network" };
      }
      wait.remove();
      busy = false;
      sendBtn.disabled = false;
      api.onThinking(false);

      if (result && result.text) {
        chat.push({ role: "assistant", text: result.text });
        chat = chat.slice(-MAX_CHAT_STORED);
        addMsg("bot", result.text);
        api.onReply(result.text);
      } else {
        addMsg("err", ERRORS[result && result.error] || ERRORS.api);
      }
      store.set({ [sp.storageKey]: chat });
      input.focus();
    });

    // ----- 📝 โน้ต -----
    function renderNotes() {
      const host = location.hostname;
      const hereCount = notes.filter((n) => n.host === host).length;
      for (const b of panel.querySelectorAll(".seg button")) {
        b.classList.toggle("active", b.dataset.filter === noteFilter);
        if (b.dataset.filter === "here") b.textContent = `เว็บนี้ (${hereCount})`;
        if (b.dataset.filter === "all") b.textContent = `ทั้งหมด (${notes.length})`;
      }
      const list = $(".note-list");
      list.textContent = "";
      const shown = (noteFilter === "here" ? notes.filter((n) => n.host === host) : notes)
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt);
      if (shown.length === 0) {
        list.appendChild(el("li", "empty", noteFilter === "here" ? "ยังไม่มีโน้ตของเว็บนี้" : "ยังไม่มีโน้ต"));
        return;
      }
      for (const n of shown) {
        const li = el("li");
        const body = el("div", "body");
        body.appendChild(el("div", "text", n.text));
        const meta = el("div", "meta");
        meta.append(fmtDate(n.createdAt));
        if (n.host) {
          meta.append(" · ");
          const a = el("a", null, n.title || n.host);
          a.href = n.url;
          a.target = "_blank";
          a.rel = "noopener noreferrer";
          meta.appendChild(a);
        }
        body.appendChild(meta);
        const del = el("button", "del", "✕");
        del.title = "ลบโน้ต";
        del.addEventListener("click", async () => {
          notes = notes.filter((x) => x.id !== n.id);
          await store.set({ petNotes: notes });
          renderNotes();
        });
        li.append(body, del);
        list.appendChild(li);
      }
    }

    for (const b of panel.querySelectorAll(".seg button")) {
      b.addEventListener("click", () => {
        noteFilter = b.dataset.filter;
        renderNotes();
      });
    }

    $(".add").addEventListener("click", async () => {
      const ta = $("section[data-pane=notes] textarea");
      const text = ta.value.trim();
      if (!text) return;
      const page = pageInfo();
      const linked = $(".link").checked && /^https?:$/.test(location.protocol);
      notes.push({
        id: uid(),
        text,
        host: linked ? page.host : "",
        url: linked ? page.url : "",
        title: linked ? page.title : "",
        createdAt: Date.now(),
      });
      await store.set({ petNotes: notes });
      ta.value = "";
      noteFilter = linked ? "here" : "all";
      renderNotes();
      api.onNoteSaved();
    });

    // ----- 🌐 เว็บที่จำไว้ -----
    function renderSites() {
      const page = pageInfo();
      const known = sites[page.host];
      const canRemember = /^https?:$/.test(location.protocol) && page.host;
      $(".here").textContent = canRemember
        ? `${page.title}\n${page.host}${known ? ` · กลับมาแล้ว ${known.visits} ครั้ง` : ""}`
        : "หน้านี้จำไม่ได้";
      $(".here").style.whiteSpace = "pre-wrap";
      const toggle = $(".toggle");
      toggle.disabled = !canRemember;
      toggle.textContent = known ? "⭐ ลืมเว็บนี้" : "⭐ จำเว็บนี้ไว้";
      toggle.onclick = async () => {
        if (known) {
          delete sites[page.host];
        } else {
          sites[page.host] = {
            host: page.host,
            url: page.url,
            title: page.title,
            visits: 1,
            savedAt: Date.now(),
            lastVisit: Date.now(),
          };
        }
        await store.set({ petSites: sites });
        renderSites();
      };

      const list = $(".site-list");
      list.textContent = "";
      const all = Object.values(sites).sort((a, b) => b.lastVisit - a.lastVisit);
      if (all.length === 0) {
        list.appendChild(el("li", "empty", "ยังไม่ได้จำเว็บไหนไว้"));
        return;
      }
      for (const s of all) {
        const li = el("li");
        const body = el("div", "body");
        const a = el("a", "text", s.title || s.host);
        a.href = s.url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        body.appendChild(a);
        const count = notes.filter((n) => n.host === s.host).length;
        body.appendChild(
          el("div", "meta", `${s.host} · เข้า ${s.visits} ครั้ง · ล่าสุด ${fmtDate(s.lastVisit)}${count ? ` · 📝 ${count}` : ""}`)
        );
        const del = el("button", "del", "✕");
        del.title = "ลืมเว็บนี้";
        del.addEventListener("click", async () => {
          delete sites[s.host];
          await store.set({ petSites: sites });
          renderSites();
        });
        li.append(body, del);
        list.appendChild(li);
      }
    }

    // แท็บอื่นแก้ข้อมูล → อัปเดตหน้าจอ
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "local" || !isOpen()) return;
      if (changes.petNotes) notes = changes.petNotes.newValue || [];
      if (changes.petSites) sites = changes.petSites.newValue || {};
      if (tab === "notes") renderNotes();
      if (tab === "sites") renderSites();
    });

    return { open, close, isOpen, element: panel };
  }

  return { create, visit };
})();
