// ตัวละครเดินไปมาบนขอบล่างของหน้าเว็บ กดแล้วกระโดด ลากแล้วย้ายได้
(() => {
  if (window.__webPetLoaded) return;
  window.__webPetLoaded = true;

  const SIZE = 44;
  const MARGIN = 6;
  const SPEED = 60; // px ต่อวินาที
  const GRAVITY = 1800;
  const DRAG_THRESHOLD = 5;
  const PHRASES = [
    "สวัสดี! 👋",
    "วันนี้เป็นไงบ้าง?",
    "จั๊กจี้นะ~",
    "พักสายตาหน่อยมั้ย? 👀",
    "ดื่มน้ำหรือยัง? 💧",
    "ทำได้ดีมากเลย ✨",
    "อยากเล่นด้วยจัง",
    "ลากฉันไปไหนก็ได้นะ",
    "ยืดเส้นยืดสายหน่อยนะ 🙆",
  ];

  let enabled = true;
  let character = "🐱";

  // Shadow DOM กัน CSS ของเว็บมากระทบ และตัวละครไม่บังการคลิกส่วนอื่นของหน้า
  const host = document.createElement("div");
  host.style.cssText =
    "all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      .pet { position: fixed; left: 0; top: 0; width: ${SIZE}px; height: ${SIZE}px;
        pointer-events: auto; cursor: grab; touch-action: none; user-select: none;
        -webkit-user-select: none; will-change: transform; }
      .pet.dragging { cursor: grabbing; }
      .sprite { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center;
        font-size: ${SIZE - 6}px; line-height: 1; transform-origin: 50% 100%;
        filter: drop-shadow(0 2px 2px rgba(0,0,0,.25)); }
      .face { display: block; }
      .walking .sprite { animation: bob .36s ease-in-out infinite; }
      .sleeping .sprite { transform: scale(.92) rotate(-8deg); opacity: .85; }
      .dragging .sprite { transform: rotate(8deg) scale(1.1); }
      .jump .sprite { animation: jump .5s ease-out; }
      @keyframes bob {
        0%, 100% { transform: translateY(0) rotate(-6deg); }
        50% { transform: translateY(-4px) rotate(6deg); }
      }
      @keyframes jump {
        0% { transform: translateY(0) scale(1.1, .85); }
        40% { transform: translateY(-34px) scale(.92, 1.1); }
        100% { transform: translateY(0) scale(1); }
      }
      .bubble { position: absolute; bottom: ${SIZE + 4}px; left: 50%; transform: translateX(-50%);
        padding: 5px 10px; background: #fff; color: #202124; border-radius: 10px;
        font: 12px/1.4 system-ui, sans-serif; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,.25); pointer-events: none; display: none; }
      .bubble.show { display: block; }
      .heart { position: absolute; left: 50%; top: 0; font-size: 16px; pointer-events: none;
        animation: float 1s ease-out forwards; }
      @keyframes float {
        from { transform: translate(var(--dx), 0); opacity: 1; }
        to { transform: translate(var(--dx), -50px); opacity: 0; }
      }
    </style>
    <div class="pet"><div class="bubble"></div><div class="sprite"><span class="face"></span></div></div>`;

  const pet = shadow.querySelector(".pet");
  const bubble = shadow.querySelector(".bubble");
  const sprite = shadow.querySelector(".sprite");
  const face = shadow.querySelector(".face");

  // สถานะ: walk | idle | sleep | drag | fall
  let mode = "idle";
  let dir = 1;
  let x = 40;
  let y = 0;
  let vy = 0;
  let rafId = 0;
  let lastTime = 0;
  let actionTimer = 0;
  let bubbleTimer = 0;

  const ground = () => window.innerHeight - SIZE - MARGIN;
  const maxX = () => Math.max(0, window.innerWidth - SIZE);

  function render() {
    pet.style.transform = `translate(${x}px, ${y}px)`;
    face.style.transform = `scaleX(${dir})`;
    pet.classList.toggle("walking", mode === "walk");
    pet.classList.toggle("sleeping", mode === "sleep");
    pet.classList.toggle("dragging", mode === "drag");
  }

  function say(text, ms = 1800) {
    bubble.textContent = text;
    bubble.classList.add("show");
    clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(() => bubble.classList.remove("show"), ms);
  }

  function hideBubble() {
    clearTimeout(bubbleTimer);
    bubble.classList.remove("show");
  }

  function spawnHearts() {
    for (let i = 0; i < 3; i++) {
      const h = document.createElement("span");
      h.className = "heart";
      h.textContent = "💖";
      h.style.setProperty("--dx", `${(Math.random() - 0.5) * 40 - 8}px`);
      h.style.animationDelay = `${i * 0.12}s`;
      pet.appendChild(h);
      h.addEventListener("animationend", () => h.remove());
    }
  }

  // รอสักครู่ก่อนเลือกท่าทางถัดไป เพื่อไม่ให้ทับข้อความที่กำลังพูดอยู่
  function chooseActionLater(ms) {
    clearTimeout(actionTimer);
    actionTimer = setTimeout(chooseAction, ms);
  }

  function chooseAction() {
    clearTimeout(actionTimer);
    if (!enabled) return;
    if (mode === "walk" || mode === "idle" || mode === "sleep") {
      const r = Math.random();
      if (r < 0.55) {
        mode = "walk";
        dir = Math.random() < 0.5 ? -1 : 1;
        hideBubble();
      } else if (r < 0.8) {
        mode = "idle";
        hideBubble();
      } else {
        mode = "sleep";
        say("💤", 0);
      }
      render();
    }
    actionTimer = setTimeout(chooseAction, 2000 + Math.random() * 3500);
  }

  function frame(time) {
    const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
    lastTime = time;

    if (mode === "walk") {
      x += dir * SPEED * dt;
      if (x <= 0) { x = 0; dir = 1; }
      else if (x >= maxX()) { x = maxX(); dir = -1; }
    } else if (mode === "fall") {
      vy += GRAVITY * dt;
      y += vy * dt;
      if (y >= ground()) {
        y = ground();
        vy = 0;
        mode = "idle";
        say("ฟุ่บ!", 900);
        chooseActionLater(1500);
      }
    }
    render();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (host.isConnected) return;
    x = Math.min(x, maxX());
    y = ground();
    mode = "idle";
    document.documentElement.appendChild(host);
    render();
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
    chooseAction();
  }

  function stop() {
    cancelAnimationFrame(rafId);
    clearTimeout(actionTimer);
    clearTimeout(bubbleTimer);
    host.remove();
  }

  // ----- ปฏิสัมพันธ์: กด / ลาก -----
  let pointerStart = null;

  pet.addEventListener("pointerdown", (e) => {
    pet.setPointerCapture(e.pointerId);
    pointerStart = { px: e.clientX, py: e.clientY, offX: e.clientX - x, offY: e.clientY - y, moved: false };
  });

  pet.addEventListener("pointermove", (e) => {
    if (!pointerStart) return;
    if (!pointerStart.moved) {
      if (Math.hypot(e.clientX - pointerStart.px, e.clientY - pointerStart.py) < DRAG_THRESHOLD) return;
      pointerStart.moved = true;
      mode = "drag";
      hideBubble();
    }
    x = Math.min(Math.max(0, e.clientX - pointerStart.offX), maxX());
    y = Math.min(Math.max(0, e.clientY - pointerStart.offY), ground());
  });

  pet.addEventListener("pointerup", () => {
    if (!pointerStart) return;
    const wasDrag = pointerStart.moved;
    pointerStart = null;
    if (wasDrag) {
      mode = "fall";
      vy = 0;
      return;
    }
    // คลิกธรรมดา: ปลุก กระโดด พูด และปล่อยหัวใจ
    if (mode === "sleep") mode = "idle";
    sprite.classList.remove("jump");
    void sprite.offsetWidth; // รีสตาร์ท animation
    sprite.classList.add("jump");
    say(PHRASES[Math.floor(Math.random() * PHRASES.length)]);
    spawnHearts();
    render();
    chooseActionLater(2500);
  });

  pet.addEventListener("pointercancel", () => {
    if (pointerStart?.moved) { mode = "fall"; vy = 0; }
    pointerStart = null;
  });

  sprite.addEventListener("animationend", (e) => {
    if (e.animationName === "jump") sprite.classList.remove("jump");
  });

  window.addEventListener("resize", () => {
    x = Math.min(x, maxX());
    if (mode !== "drag" && y !== ground()) {
      if (y > ground()) y = ground();
      else if (mode !== "fall") { mode = "fall"; vy = 0; }
    }
  });

  // ----- ตั้งค่า (เก็บแบบ global ใช้ร่วมกันทุกเว็บ) -----
  function applySettings(s) {
    enabled = s.petEnabled !== false;
    character = s.petCharacter || "🐱";
    face.textContent = character;
    if (enabled) start();
    else stop();
  }

  try {
    chrome.storage.sync.get({ petEnabled: true, petCharacter: "🐱" }, applySettings);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      chrome.storage.sync.get({ petEnabled: true, petCharacter: "🐱" }, applySettings);
    });
  } catch {
    // extension ถูก reload ขณะหน้าเปิดค้าง — ไม่ต้องทำอะไร
  }
})();
