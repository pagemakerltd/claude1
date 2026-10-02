// น้องแมวพิกเซลเดินไปมาบนขอบล่างของหน้าเว็บ กดแล้วมีปฏิกิริยา ลากแล้วย้ายได้
(() => {
  if (window.__webPetLoaded) return;
  window.__webPetLoaded = true;

  // ----- ภาพแอนิเมชัน (แถบภาพ images/cat/<ชื่อ>.png เรียงเฟรมต่อกันในแนวนอน) -----
  const CELL_W = 234;
  const CELL_H = 141;
  const SCALE = 0.8; // ขนาดที่แสดงเทียบกับภาพต้นฉบับ
  const FRAME_COUNT = {
    idle: 7, blink: 4, happy: 3, walk_right: 7, walk_left: 7, run_right: 6, run_left: 5,
    jump: 6, fall_land: 5, play: 5, special: 4, sit_lie: 8, emote: 11,
  };

  const CELL_PX_W = CELL_W * SCALE;
  const CELL_PX_H = CELL_H * SCALE;
  const HIT_W = 80; // พื้นที่ที่กด/ลากได้ (ตรงกับตัวแมว ไม่ใช่ทั้งช่องภาพ)
  const HIT_H = 74;
  const MARGIN = 2;
  const WALK_SPEED = 55; // px ต่อวินาที
  const RUN_SPEED = 150;
  const JUMP_SPEED = 80;
  const GRAVITY = 1800;
  const DRAG_THRESHOLD = 5;

  const PHRASES = [
    "เมี๊ยว~",
    "ลูบหัวหน่อยสิ",
    "หิวแล้วนะ 🐟",
    "จั๊กจี้~",
    "พักสายตาหน่อยมั้ย? 👀",
    "ดื่มน้ำหรือยัง? 💧",
    "อยากเล่นด้วยจัง",
    "ลากฉันไปไหนก็ได้นะ",
    "ยืดเส้นยืดสายหน่อยนะ 🙆",
  ];

  const urlCache = {};
  const sheetUrl = (name) => (urlCache[name] ||= chrome.runtime.getURL(`images/cat/${name}.png`));

  // Shadow DOM กัน CSS ของเว็บมากระทบ และน้องไม่บังการคลิกส่วนอื่นของหน้า
  const host = document.createElement("div");
  host.style.cssText =
    "all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      .pet { position: fixed; left: 0; top: 0; width: ${CELL_PX_W}px; height: ${CELL_PX_H}px;
        pointer-events: none; will-change: transform; user-select: none; -webkit-user-select: none; }
      .face { position: absolute; inset: 0; }
      .sprite { position: absolute; inset: 0; background-repeat: no-repeat; }
      .hit { position: absolute; left: 50%; bottom: 0; width: ${HIT_W}px; height: ${HIT_H}px;
        transform: translateX(-50%); pointer-events: auto; cursor: grab; touch-action: none; }
      .hit.dragging { cursor: grabbing; }
      .bubble { position: absolute; bottom: ${CELL_PX_H + 2}px; left: 50%; transform: translateX(-50%);
        padding: 5px 10px; background: #fff; color: #202124; border-radius: 10px;
        font: 12px/1.4 system-ui, sans-serif; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,.25); pointer-events: none; display: none; }
      .bubble.show { display: block; }
      .heart { position: absolute; left: 50%; top: 30%; font-size: 16px; pointer-events: none;
        animation: float 1s ease-out forwards; }
      @keyframes float {
        from { transform: translate(var(--dx), 0); opacity: 1; }
        to { transform: translate(var(--dx), -50px); opacity: 0; }
      }
    </style>
    <div class="pet">
      <div class="bubble"></div>
      <div class="face"><div class="sprite"></div></div>
      <div class="hit"></div>
    </div>`;

  const pet = shadow.querySelector(".pet");
  const bubble = shadow.querySelector(".bubble");
  const face = shadow.querySelector(".face");
  const sprite = shadow.querySelector(".sprite");
  const hit = shadow.querySelector(".hit");

  // ----- สถานะ -----
  // mode: idle | walk | run | jump | play | sleep | react | drag | fall | land
  let enabled = true;
  let mode = "idle";
  let dir = 1; // 1 = ขวา, -1 = ซ้าย
  let x = 120; // กึ่งกลางตัวแมว (แนวนอน)
  let y = 0; // ขอบบนของช่องภาพ
  let vy = 0;
  let rafId = 0;
  let lastTime = 0;
  let actionTimer = 0;
  let bubbleTimer = 0;
  let bubblePersistent = false;

  const groundY = () => window.innerHeight - MARGIN - CELL_PX_H;
  const minX = () => HIT_W / 2;
  const maxX = () => Math.max(minX(), window.innerWidth - HIT_W / 2);
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  // ----- ระบบแอนิเมชัน -----
  let anim = null;
  let shownSheet = "";
  let shownFrame = -1;

  function showFrame(name, index) {
    if (name !== shownSheet) {
      shownSheet = name;
      shownFrame = -1;
      sprite.style.backgroundImage = `url("${sheetUrl(name)}")`;
      sprite.style.backgroundSize = `${CELL_PX_W * FRAME_COUNT[name]}px ${CELL_PX_H}px`;
    }
    if (index !== shownFrame) {
      shownFrame = index;
      sprite.style.backgroundPosition = `${-index * CELL_PX_W}px 0`;
    }
  }

  // seq = ลำดับเฟรม, fps = ความเร็ว, opts: loop, hold (ค้างเฟรมสุดท้ายกี่วินาที), flip, onEnd
  function startAnim(name, seq, fps, opts = {}) {
    anim = {
      name, seq, fps,
      t: 0,
      loop: opts.loop !== false,
      hold: opts.hold || 0,
      flip: opts.flip !== false, // false = แถบภาพมีแยกซ้าย/ขวาอยู่แล้ว ไม่ต้องกลับด้าน
      onEnd: opts.onEnd || null,
      finished: false,
    };
    showFrame(name, seq[0]);
  }

  function tickAnim(dt) {
    if (!anim) return;
    anim.t += dt;
    const raw = Math.floor(anim.t * anim.fps);
    let i;
    if (anim.loop) {
      i = raw % anim.seq.length;
    } else {
      i = Math.min(raw, anim.seq.length - 1);
      if (!anim.finished && anim.t >= anim.seq.length / anim.fps + anim.hold) {
        anim.finished = true;
        if (anim.onEnd) anim.onEnd();
      }
    }
    if (anim) showFrame(anim.name, anim.seq[i]);
  }

  const range = (n) => Array.from({ length: n }, (_, i) => i);

  // ----- ท่าทางต่างๆ -----
  function startIdle() {
    mode = "idle";
    if (Math.random() < 0.65) {
      startAnim("idle", [0, 1, 0, 2, 0, 3, 0, 4, 5, 6, 5, 4], 3);
    } else {
      startAnim("blink", [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 3], 3);
    }
  }

  function startMove(kind) {
    mode = kind; // "walk" | "run"
    const side = dir === 1 ? "right" : "left";
    if (kind === "walk") {
      startAnim(`walk_${side}`, range(6), 9, { flip: false });
    } else {
      startAnim(`run_${side}`, range(side === "right" ? 6 : 5), 12, { flip: false });
    }
  }

  function startSleep() {
    mode = "sleep";
    startAnim("sit_lie", [5, 6], 1.2);
  }

  function startJump() {
    mode = "jump";
    startAnim("jump", range(6), 8, { loop: false, hold: 0.2, onEnd: chooseAction });
  }

  function startPlay() {
    mode = "play";
    const seq = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4];
    startAnim("play", seq, 6, { loop: false, hold: 0.3, onEnd: chooseAction });
  }

  function startFall() {
    mode = "fall";
    startAnim("fall_land", [0], 1);
  }

  function startLand() {
    mode = "land";
    say("เมี๊ยว!", 900);
    startAnim("fall_land", [1, 2, 3, 4], 4, { loop: false, hold: 0.2, onEnd: chooseAction });
  }

  function startDrag() {
    mode = "drag";
    startAnim("fall_land", [0], 1);
  }

  function startReact() {
    mode = "react";
    const r = Math.random();
    if (r < 0.4) {
      startAnim("happy", [0, 1, 2, 1, 2], 6, { loop: false, hold: 0.5, onEnd: chooseAction });
    } else if (r < 0.65) {
      startAnim("special", [2, 2, 2], 3, { loop: false, hold: 0.4, onEnd: chooseAction });
    } else {
      startAnim("emote", [pick([2, 3, 4, 8, 10]), 3], 1.5, { loop: false, hold: 0.3, onEnd: chooseAction });
    }
    say(pick(PHRASES));
    spawnHearts();
  }

  // ----- ข้อความและหัวใจ -----
  function say(text, ms = 1800) {
    bubble.textContent = text;
    bubble.classList.add("show");
    bubblePersistent = ms === 0;
    clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(() => bubble.classList.remove("show"), ms);
  }

  function hideBubble() {
    clearTimeout(bubbleTimer);
    bubblePersistent = false;
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

  // ----- เลือกท่าทางถัดไปแบบสุ่ม -----
  function chooseAction() {
    clearTimeout(actionTimer);
    if (!enabled) return;
    if (bubblePersistent) hideBubble();

    const r = Math.random();
    let loopSeconds = rand(2.5, 5.5);
    if (r < 0.38) {
      dir = Math.random() < 0.5 ? -1 : 1;
      startMove("walk");
    } else if (r < 0.5) {
      startIdle();
    } else if (r < 0.62) {
      dir = Math.random() < 0.5 ? -1 : 1;
      startMove("run");
      loopSeconds = rand(1.2, 2.4);
    } else if (r < 0.74) {
      startSleep();
      loopSeconds = rand(5, 9);
    } else if (r < 0.86) {
      startPlay(); // จบเองแล้วเรียก chooseAction ต่อ
      return;
    } else {
      dir = Math.random() < 0.5 ? -1 : 1;
      startJump(); // จบเองแล้วเรียก chooseAction ต่อ
      return;
    }
    actionTimer = setTimeout(chooseAction, loopSeconds * 1000);
  }

  // ----- วงจรหลัก -----
  function render() {
    pet.style.transform = `translate(${x - CELL_PX_W / 2}px, ${y}px)`;
    face.style.transform = anim && anim.flip && dir === -1 ? "scaleX(-1)" : "";
    hit.classList.toggle("dragging", mode === "drag");
  }

  function frame(time) {
    const dt = Math.min(0.05, (time - lastTime) / 1000 || 0);
    lastTime = time;
    tickAnim(dt);

    if (mode === "walk" || mode === "run") {
      x += dir * (mode === "run" ? RUN_SPEED : WALK_SPEED) * dt;
      if (x <= minX() || x >= maxX()) {
        x = Math.min(Math.max(x, minX()), maxX());
        dir = -dir;
        startMove(mode); // สลับไปใช้แถบภาพอีกด้าน
      }
    } else if (mode === "jump") {
      x = Math.min(Math.max(x + dir * JUMP_SPEED * dt, minX()), maxX());
    } else if (mode === "fall") {
      vy += GRAVITY * dt;
      y += vy * dt;
      if (y >= groundY()) {
        y = groundY();
        vy = 0;
        startLand();
      }
    }
    render();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (host.isConnected) return;
    x = Math.min(Math.max(x, minX()), maxX());
    y = groundY();
    document.documentElement.appendChild(host);
    startIdle();
    render();
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
    actionTimer = setTimeout(chooseAction, 1200);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    clearTimeout(actionTimer);
    clearTimeout(bubbleTimer);
    host.remove();
  }

  // ----- ปฏิสัมพันธ์: กด / ลาก -----
  let pointerStart = null;

  hit.addEventListener("pointerdown", (e) => {
    hit.setPointerCapture(e.pointerId);
    pointerStart = { px: e.clientX, py: e.clientY, offX: e.clientX - x, offY: e.clientY - y, moved: false };
  });

  hit.addEventListener("pointermove", (e) => {
    if (!pointerStart) return;
    if (!pointerStart.moved) {
      if (Math.hypot(e.clientX - pointerStart.px, e.clientY - pointerStart.py) < DRAG_THRESHOLD) return;
      pointerStart.moved = true;
      clearTimeout(actionTimer);
      hideBubble();
      startDrag();
    }
    x = Math.min(Math.max(minX(), e.clientX - pointerStart.offX), maxX());
    y = Math.min(Math.max(0, e.clientY - pointerStart.offY), groundY());
  });

  hit.addEventListener("pointerup", () => {
    if (!pointerStart) return;
    const wasDrag = pointerStart.moved;
    pointerStart = null;
    if (wasDrag) {
      vy = 0;
      startFall();
      return;
    }
    clearTimeout(actionTimer);
    startReact();
  });

  hit.addEventListener("pointercancel", () => {
    if (pointerStart?.moved) {
      vy = 0;
      startFall();
    }
    pointerStart = null;
  });

  window.addEventListener("resize", () => {
    x = Math.min(Math.max(x, minX()), maxX());
    if (mode !== "drag" && mode !== "fall") {
      if (y > groundY()) y = groundY();
      else if (y < groundY()) {
        vy = 0;
        startFall();
      }
    }
  });

  // โหลดภาพทุกแถบล่วงหน้า กันภาพกระพริบตอนเปลี่ยนท่า
  for (const name of Object.keys(FRAME_COUNT)) new Image().src = sheetUrl(name);

  // ----- ตั้งค่า (เก็บแบบ global ใช้ร่วมกันทุกเว็บ) -----
  function applySettings(s) {
    enabled = s.petEnabled !== false;
    if (enabled) start();
    else stop();
  }

  try {
    chrome.storage.sync.get({ petEnabled: true }, applySettings);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      chrome.storage.sync.get({ petEnabled: true }, applySettings);
    });
  } catch {
    // extension ถูก reload ขณะหน้าเปิดค้าง — ไม่ต้องทำอะไร
  }
})();
