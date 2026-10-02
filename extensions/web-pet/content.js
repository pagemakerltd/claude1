// น้องแมวพิกเซลอยู่บนหน้าเว็บ: เดิน วิ่ง นอน เล่นของเล่น ตามเมาส์ และปีนขึ้นของบนหน้าเว็บได้
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

  // ของเล่น
  const TOY_SIZE = 30;
  const TOY_GAP = 58; // ระยะที่น้องหยุดหน้าของเล่น
  const TOY_EMOJI = { yarn: "🧶", fish: "🐟" };
  const MAX_TOYS = 3;

  // ปีนขึ้นของบนหน้าเว็บ
  const PLATFORM_SELECTOR =
    "h1,h2,h3,h4,h5,img,button,pre,table,figure,video,input,textarea,select,blockquote,aside,header,footer,nav,form,p";
  const PLATFORM_MAX_RISE = 380; // กระโดดขึ้นสูงสุดกี่ px
  const PLATFORM_MAX_REACH = 450; // ห่างในแนวนอนสูงสุดกี่ px
  const HOP_SECONDS = 0.75;
  const HOP_ARC = 70;

  // บ้านของน้อง
  const HOME_W = 112;
  const HOME_H = 100;
  const HOME_DEFAULT_FRAC = 0.88;
  const HOME_NAP_SECONDS = [25, 55];
  const HOME_SVG = `
    <svg viewBox="0 0 120 100" width="${HOME_W}" height="${HOME_H}" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="10" y="44" width="100" height="54" fill="#f3d9a4" stroke="#8a6a3a" stroke-width="3"/>
      <rect x="10" y="62" width="100" height="4" fill="#e3c98f"/>
      <rect x="10" y="78" width="100" height="4" fill="#e3c98f"/>
      <polygon points="0,48 60,6 120,48" fill="#c8553d" stroke="#7a2f2c" stroke-width="3"/>
      <polygon points="14,46 60,13 106,46" fill="#d96a4f"/>
      <circle cx="60" cy="31" r="7" fill="#fff3c4" stroke="#7a2f2c" stroke-width="3" class="win"/>
      <path d="M42 98 V72 a18 18 0 0 1 36 0 V98 Z" fill="#4a3426" stroke="#2b1d14" stroke-width="3"/>
      <g class="sleeper">
        <polygon points="46,86 50,74 58,82" fill="#a8957f"/><polygon points="74,86 70,74 62,82" fill="#a8957f"/>
        <ellipse cx="60" cy="88" rx="15" ry="10" fill="#c9b79e"/>
        <path d="M51 88 q3 3 6 0 M63 88 q3 3 6 0" stroke="#2b1d14" stroke-width="2" fill="none"/>
      </g>
      <ellipse cx="60" cy="99" rx="52" ry="2" fill="rgba(0,0,0,.18)"/>
    </svg>`;

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
      .bubble.actions { pointer-events: auto; }
      .bubble-actions { display: none; gap: 4px; margin-top: 4px; justify-content: center; }
      .bubble.actions .bubble-actions { display: flex; }
      .bubble-actions button { border: 0; border-radius: 8px; padding: 3px 7px; background: #f1f3f4;
        font: 12px system-ui, sans-serif; cursor: pointer; }
      .bubble-actions button:hover { background: #e0e3e6; }
      .pet.hidden { opacity: 0; transition: opacity .35s; }
      .pet.hidden .hit { pointer-events: none; }
      .pet { transition: opacity .35s; }
      .home { position: fixed; left: 0; top: 0; width: ${HOME_W}px; height: ${HOME_H}px;
        pointer-events: auto; cursor: grab; touch-action: none; user-select: none;
        -webkit-user-select: none; will-change: transform; }
      .home.dragging { cursor: grabbing; }
      .home svg { display: block; }
      .home .sleeper { display: none; }
      .home.occupied .sleeper { display: block; }
      .home.occupied .win { fill: #ffd86b; }
      .zzz { position: absolute; left: 70%; top: -4px; font: 700 14px system-ui, sans-serif; color: #3b6fd4;
        opacity: 0; pointer-events: none; }
      .home.occupied .zzz { animation: zzz 2.2s ease-out infinite; }
      .home.occupied .zzz.b { animation-delay: 1.1s; }
      @keyframes zzz {
        0% { transform: translate(0, 10px); opacity: 0; }
        20% { opacity: 1; }
        100% { transform: translate(14px, -22px); opacity: 0; }
      }
      .heart { position: absolute; left: 50%; top: 30%; font-size: 16px; pointer-events: none;
        animation: float 1s ease-out forwards; }
      @keyframes float {
        from { transform: translate(var(--dx), 0); opacity: 1; }
        to { transform: translate(var(--dx), -50px); opacity: 0; }
      }
      .toy { position: fixed; left: 0; top: 0; width: ${TOY_SIZE}px; height: ${TOY_SIZE}px;
        font: ${TOY_SIZE - 4}px/${TOY_SIZE}px system-ui, sans-serif; text-align: center;
        pointer-events: auto; cursor: grab; touch-action: none; user-select: none;
        -webkit-user-select: none; will-change: transform; }
      .toy.dragging { cursor: grabbing; }
    </style>
    <div class="home">${HOME_SVG}<span class="zzz">z</span><span class="zzz b">Z</span></div>
    <div class="pet">
      <div class="bubble"><span class="bubble-text"></span><div class="bubble-actions"></div></div>
      <div class="face"><div class="sprite"></div></div>
      <div class="hit"></div>
    </div>`;

  const pet = shadow.querySelector(".pet");
  const home = shadow.querySelector(".home");
  const bubble = shadow.querySelector(".bubble");
  const bubbleText = shadow.querySelector(".bubble-text");
  const bubbleActions = shadow.querySelector(".bubble-actions");
  const face = shadow.querySelector(".face");
  const sprite = shadow.querySelector(".sprite");
  const hit = shadow.querySelector(".hit");

  // ----- สถานะ -----
  // mode: idle | walk | run | jump | play | sleep | react | drag | fall | land | hop | chase | follow
  //       | gohome | inhome
  let enabled = true;
  let homeEnabled = true;
  let homeFrac = HOME_DEFAULT_FRAC; // ตำแหน่งบ้านเป็นสัดส่วนของความกว้างหน้าจอ
  let homeCenter = -1;
  let panelOpen = false;
  let thinking = false;
  let vx = 0; // ความเร็วแนวนอนตอนถูกโยน
  let throwTargets = []; // ของบนหน้าเว็บที่น้องที่ถูกโยนอาจลงจอดได้
  let followMouse = false;
  let canClimb = true;
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
  let mouseX = -1;
  let panel = null;
  let hop = null; // กำลังกระโดดขึ้นไปบนของ
  let floor = null; // {el, lo, hi, top} เมื่อน้องยืนอยู่บนของบนหน้าเว็บ
  let chase = null; // {toy, dir, deadline}
  const toys = [];

  const groundY = () => window.innerHeight - MARGIN - CELL_PX_H;
  const floorY = () => (floor ? floor.top - CELL_PX_H + MARGIN : groundY());
  const minX = () => (floor ? floor.lo : HIT_W / 2);
  const maxX = () => (floor ? floor.hi : Math.max(HIT_W / 2, window.innerWidth - HIT_W / 2));
  const clampX = (v) => Math.min(Math.max(v, minX()), maxX());
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const range = (n) => Array.from({ length: n }, (_, i) => i);

  const AIRBORNE = new Set(["drag", "fall", "hop"]);

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

  // ----- ท่าทางต่างๆ -----
  function startIdle() {
    mode = "idle";
    if (Math.random() < 0.65) {
      startAnim("idle", [0, 1, 0, 2, 0, 3, 0, 4, 5, 6, 5, 4], 3);
    } else {
      startAnim("blink", [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 3], 3);
    }
  }

  // เปลี่ยนเฉพาะแอนิเมชันเดิน/วิ่งตามทิศทางปัจจุบัน (ไม่แตะ mode)
  function setMoveAnim(kind) {
    const side = dir === 1 ? "right" : "left";
    if (kind === "walk") startAnim(`walk_${side}`, range(6), 9, { flip: false });
    else startAnim(`run_${side}`, range(side === "right" ? 6 : 5), 12, { flip: false });
  }

  function ensureMoveAnim(kind) {
    const sheet = `${kind}_${dir === 1 ? "right" : "left"}`;
    if (!anim || anim.name !== sheet) setMoveAnim(kind);
  }

  function startMove(kind) {
    mode = kind; // "walk" | "run"
    setMoveAnim(kind);
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

  // velX/velY = ความเร็วตอนถูกโยน (px/วินาที) targets = ของบนหน้าเว็บที่ลงจอดได้
  function startFall(velX = 0, velY = 0, targets = []) {
    floor = null;
    hop = null;
    chase = null;
    mode = "fall";
    vx = velX;
    vy = velY;
    throwTargets = targets;
    if (Math.hypot(velX, velY) > 400) {
      if (Math.abs(velX) > 20) dir = velX > 0 ? 1 : -1;
      startAnim("jump", [2, 3, 2, 3], 8); // ท่าลอยกลางอากาศ
    } else {
      startAnim("fall_land", [0], 1);
    }
  }

  function startLand() {
    mode = "land";
    say("เมี๊ยว!", 900);
    startAnim("fall_land", [1, 2, 3, 4], 4, { loop: false, hold: 0.2, onEnd: chooseAction });
  }

  function startDrag() {
    floor = null;
    hop = null;
    chase = null;
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
    say(pick(PHRASES), 4500, true);
    spawnHearts();
  }

  // ----- ข้อความและหัวใจ -----
  function say(text, ms = 1800, withActions = false) {
    bubbleText.textContent = text;
    bubble.classList.add("show");
    bubble.classList.toggle("actions", withActions);
    bubblePersistent = ms === 0;
    clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(hideBubble, ms);
  }

  function hideBubble() {
    clearTimeout(bubbleTimer);
    bubblePersistent = false;
    bubble.classList.remove("show", "actions");
  }

  // ปุ่มลัดในกล่องข้อความ (โผล่มาตอนกดที่น้อง)
  let homeButton = null;
  const BUBBLE_ACTIONS = [
    ["💬 คุย", () => panel && panel.open("chat")],
    ["📝 โน้ต", () => panel && panel.open("notes")],
    ["🌐 เว็บ", () => panel && panel.open("sites")],
    ["🏠 นอน", () => goHome()],
  ];
  for (const [label, fn] of BUBBLE_ACTIONS) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = label;
    b.addEventListener("click", (e) => {
      e.stopPropagation();
      hideBubble();
      fn();
    });
    if (label.includes("นอน")) homeButton = b;
    bubbleActions.appendChild(b);
  }
  // เอาเมาส์วางบนปุ่มอยู่ ไม่ให้กล่องหายไป
  bubble.addEventListener("mouseenter", () => clearTimeout(bubbleTimer));
  bubble.addEventListener("mouseleave", () => {
    if (bubble.classList.contains("actions")) bubbleTimer = setTimeout(hideBubble, 2000);
  });

  // ดันกล่องข้อความไม่ให้ล้นขอบจอ
  function positionBubble() {
    if (!bubble.classList.contains("show")) return;
    const w = bubble.offsetWidth;
    let shift = 0;
    if (x - w / 2 < 8) shift = 8 - (x - w / 2);
    else if (x + w / 2 > window.innerWidth - 8) shift = window.innerWidth - 8 - (x + w / 2);
    bubble.style.transform = `translateX(calc(-50% + ${shift}px))`;
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

  // ----- ของเล่น: โยนไหมพรม / ให้ปลา แล้วน้องวิ่งไปเล่น -----
  function renderToy(t) {
    t.el.style.transform = `translate(${t.x - TOY_SIZE / 2}px, ${t.y}px) rotate(${t.rot}deg)`;
  }

  function removeToy(t) {
    t.alive = false;
    t.el.remove();
    const i = toys.indexOf(t);
    if (i >= 0) toys.splice(i, 1);
  }

  function spawnToy(kind) {
    if (!enabled || !TOY_EMOJI[kind]) return;
    while (toys.length >= MAX_TOYS) removeToy(toys[0]);
    const el = document.createElement("div");
    el.className = "toy";
    el.textContent = TOY_EMOJI[kind];
    shadow.appendChild(el);
    const t = {
      el, kind, alive: true,
      x: rand(0.2, 0.8) * window.innerWidth, y: -TOY_SIZE,
      vx: rand(-90, 90), vy: 0, rot: 0,
      state: "fall", // fall | rest | drag
      removeAt: 0,
    };
    toys.push(t);
    renderToy(t);
    attachToyDrag(t);
  }

  function attachToyDrag(t) {
    let last = null;
    t.el.addEventListener("pointerdown", (e) => {
      t.el.setPointerCapture(e.pointerId);
      t.state = "drag";
      t.el.classList.add("dragging");
      last = { x: e.clientX, y: e.clientY, time: performance.now(), vx: 0, vy: 0 };
    });
    t.el.addEventListener("pointermove", (e) => {
      if (t.state !== "drag" || !last) return;
      const now = performance.now();
      const dt = Math.max(1, now - last.time) / 1000;
      last.vx = (e.clientX - last.x) / dt;
      last.vy = (e.clientY - last.y) / dt;
      last.x = e.clientX;
      last.y = e.clientY;
      last.time = now;
      t.x = e.clientX;
      t.y = e.clientY - TOY_SIZE / 2;
    });
    const release = () => {
      if (t.state !== "drag") return;
      t.el.classList.remove("dragging");
      // โยนต่อด้วยความเร็วล่าสุดของเมาส์ (ถ้าหยุดมือก่อนปล่อย ความเร็วจะเป็นศูนย์)
      const stale = last && performance.now() - last.time > 80;
      t.vx = stale ? 0 : Math.max(-1400, Math.min(1400, last ? last.vx : 0));
      t.vy = stale ? 0 : Math.max(-1400, Math.min(1400, last ? last.vy : 0));
      t.state = "fall";
      last = null;
    };
    t.el.addEventListener("pointerup", release);
    t.el.addEventListener("pointercancel", release);
  }

  function updateToys(dt, now) {
    const floorToy = window.innerHeight - TOY_SIZE - MARGIN;
    for (const t of [...toys]) {
      if (t.removeAt && now > t.removeAt) {
        removeToy(t);
        continue;
      }
      if (t.state === "fall") {
        t.vy += GRAVITY * dt;
        t.x += t.vx * dt;
        t.y += t.vy * dt;
        t.rot += t.vx * dt * 0.8;
        const half = TOY_SIZE / 2;
        if (t.x < half) { t.x = half; t.vx = -t.vx * 0.5; }
        if (t.x > window.innerWidth - half) { t.x = window.innerWidth - half; t.vx = -t.vx * 0.5; }
        if (t.y >= floorToy) {
          t.y = floorToy;
          if (Math.abs(t.vy) > 120) {
            t.vy = -t.vy * 0.45;
            t.vx *= 0.8;
          } else {
            t.vy = 0;
            t.vx *= Math.pow(0.05, dt); // แรงเสียดทาน
            if (Math.abs(t.vx) < 8) {
              t.vx = 0;
              t.state = "rest";
            }
          }
        }
      }
      renderToy(t);
    }
  }

  const restingToy = () => {
    const rest = toys.filter((t) => t.alive && !t.removeAt && t.state === "rest");
    rest.sort((a, b) => Math.abs(a.x - x) - Math.abs(b.x - x));
    return rest[0] || null;
  };

  function startChase(toy) {
    clearTimeout(actionTimer);
    mode = "chase";
    chase = { toy, dir: toy.x >= x ? 1 : -1, deadline: performance.now() + 14000 };
    dir = chase.dir;
    setMoveAnim("run");
  }

  function arriveAtToy(toy) {
    chase = null;
    toy.el.style.opacity = "0";
    toy.removeAt = performance.now() + 3500; // เผื่อถูกขัดจังหวะ จะเก็บของเล่นทิ้งเอง
    if (toy.kind === "yarn") {
      // ภาพท่าเล่นมีไหมพรมวาดอยู่ในเฟรมแล้ว จึงซ่อนของเล่นจริงไว้ระหว่างเล่น
      mode = "play";
      const seq = [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4];
      startAnim("play", seq, 6, {
        loop: false, hold: 0.3,
        onEnd: () => { removeToy(toy); chooseAction(); },
      });
    } else {
      mode = "react";
      startAnim("happy", [0, 1, 2, 1, 2, 1, 2], 6, {
        loop: false, hold: 0.5,
        onEnd: () => { removeToy(toy); chooseAction(); },
      });
      say("อร่อย! 🐟", 1600);
      spawnHearts();
    }
  }

  // ----- ปีนขึ้นของบนหน้าเว็บ (หัวข้อ รูป ปุ่ม ย่อหน้า ฯลฯ) -----
  function platformBounds(el) {
    if (!el.isConnected) return null;
    const r = el.getBoundingClientRect();
    if (r.width < 100 || r.right <= 0 || r.left >= window.innerWidth) return null;
    if (r.top < CELL_PX_H - 20 || r.top > window.innerHeight - 30) return null;
    const lo = Math.max(HIT_W / 2, r.left + 24);
    const hi = Math.min(window.innerWidth - HIT_W / 2, r.right - 24);
    if (hi - lo < 20) return null;
    return { el, lo, hi, top: r.top };
  }

  // ของบนหน้าเว็บที่น้องยืนได้ทั้งหมด (มองเห็นอยู่ และไม่มีอะไรบังขอบบน)
  function listPlatforms() {
    const els = Array.from(document.querySelectorAll(PLATFORM_SELECTOR)).slice(0, 600);
    const out = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 20) continue;
      if (r.top < CELL_PX_H + 8 || r.top > window.innerHeight - 90) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.2) continue;
      const px = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const top = document.elementFromPoint(px, r.top + 3);
      if (!top || !(el === top || el.contains(top))) continue;
      const b = platformBounds(el);
      if (b) out.push({ ...b, left: r.left, right: r.right });
    }
    return out;
  }

  // ของที่น้องกระโดดขึ้นไปได้จากตำแหน่งปัจจุบัน
  function findPlatform() {
    const cands = listPlatforms().filter((p) => {
      if (groundY() + CELL_PX_H - p.top > PLATFORM_MAX_RISE) return false;
      const dx = x < p.left ? p.left - x : x > p.right ? x - p.right : 0;
      return dx <= PLATFORM_MAX_REACH;
    });
    return cands.length ? pick(cands) : null;
  }

  function startHop(p) {
    clearTimeout(actionTimer);
    mode = "hop";
    const tx = Math.min(Math.max(x + rand(-80, 80), p.lo), p.hi);
    hop = { t: 0, x0: x, y0: y, x1: tx, p };
    dir = tx >= x ? 1 : -1;
    startAnim("jump", range(6), 8, { loop: false });
  }

  function finishHop() {
    const p = platformBounds(hop.p.el);
    hop = null;
    if (!p) {
      startFall();
      return;
    }
    floor = p;
    x = clampX(x);
    y = floorY();
    startIdle();
    actionTimer = setTimeout(chooseAction, 1500);
  }

  // ----- บ้านของน้อง: เดินไปนอน กดที่บ้านเพื่อเรียกน้องไปนอน/ปลุก ลากบ้านย้ายที่ได้ -----
  let homeTimer = 0;
  let pendingHome = false;
  let homeTransform = "";

  const homeX = () => Math.min(Math.max(homeFrac * window.innerWidth, HOME_W / 2 + 4), window.innerWidth - HOME_W / 2 - 4);

  function renderHome() {
    if (!homeEnabled) {
      home.style.display = "none";
      return;
    }
    home.style.display = "";
    const t = `translate(${homeX() - HOME_W / 2}px, ${window.innerHeight - HOME_H - MARGIN}px)`;
    if (t !== homeTransform) {
      homeTransform = t;
      home.style.transform = t;
    }
  }

  function startGoHome() {
    clearTimeout(actionTimer);
    chase = null;
    mode = "gohome";
    hideBubble();
  }

  // สั่งให้น้องไปนอนบ้าน (ถ้าอยู่บนของหรือกลางอากาศ ให้ลงพื้นก่อนแล้วค่อยไป)
  function goHome() {
    if (!homeEnabled || mode === "inhome" || mode === "gohome") return;
    if (floor || AIRBORNE.has(mode)) {
      pendingHome = true;
      if (floor && !AIRBORNE.has(mode)) startFall();
      return;
    }
    startGoHome();
  }

  function enterHome() {
    mode = "inhome";
    x = homeX();
    startAnim("sit_lie", [5, 6], 1.2);
    pet.classList.add("hidden");
    home.classList.add("occupied");
    clearTimeout(homeTimer);
    homeTimer = setTimeout(exitHome, rand(HOME_NAP_SECONDS[0], HOME_NAP_SECONDS[1]) * 1000);
  }

  function exitHome() {
    if (mode !== "inhome") return;
    clearTimeout(homeTimer);
    pet.classList.remove("hidden");
    home.classList.remove("occupied");
    x = homeX();
    y = groundY();
    mode = "react";
    startAnim("happy", [0, 1, 2, 1, 2], 6, { loop: false, hold: 0.3, onEnd: chooseAction });
    say(pick(["หาวว~ ตื่นแล้ว", "นอนอิ่มแล้ว ✨", "เมี๊ยว~"]), 1500);
  }

  let homeDrag = null;
  home.addEventListener("pointerdown", (e) => {
    home.setPointerCapture(e.pointerId);
    homeDrag = { off: e.clientX - homeX(), px: e.clientX, moved: false };
  });
  home.addEventListener("pointermove", (e) => {
    if (!homeDrag) return;
    if (!homeDrag.moved) {
      if (Math.abs(e.clientX - homeDrag.px) < DRAG_THRESHOLD) return;
      homeDrag.moved = true;
      home.classList.add("dragging");
    }
    homeFrac = Math.min(1, Math.max(0, (e.clientX - homeDrag.off) / window.innerWidth));
  });
  home.addEventListener("pointerup", () => {
    if (!homeDrag) return;
    const moved = homeDrag.moved;
    homeDrag = null;
    home.classList.remove("dragging");
    if (moved) {
      try { chrome.storage.sync.set({ petHomeX: homeFrac }); } catch { /* ไม่เป็นไร */ }
    } else if (mode === "inhome") {
      exitHome(); // กดที่บ้านตอนน้องนอนอยู่ = ปลุก
    } else {
      goHome(); // กดตอนบ้านว่าง = เรียกน้องไปนอน
    }
  });
  home.addEventListener("pointercancel", () => {
    homeDrag = null;
    home.classList.remove("dragging");
  });

  // ----- เลือกท่าทางถัดไปแบบสุ่ม -----
  function chooseAction() {
    clearTimeout(actionTimer);
    if (!enabled || thinking || mode === "inhome") return;
    if (bubblePersistent) hideBubble();

    // แผงเปิดอยู่ น้องนั่งรอเฉยๆ ไม่เดินหนีไปไหน
    if (panelOpen) {
      startIdle();
      actionTimer = setTimeout(chooseAction, 4000);
      return;
    }

    if (pendingHome && homeEnabled && !floor) {
      pendingHome = false;
      startGoHome();
      return;
    }

    // มีของเล่นวางอยู่ ต้องไปเล่นก่อน (ถ้าอยู่บนของ ให้กระโดดลงมาก่อน)
    const toy = restingToy();
    if (toy) {
      if (floor) startFall();
      else startChase(toy);
      return;
    }

    // ตามเมาส์
    if (followMouse && !floor && mouseX >= 0 && Math.abs(mouseX - x) > 140 && Math.random() < 0.7) {
      mode = "follow";
      actionTimer = setTimeout(chooseAction, rand(4, 7) * 1000);
      return;
    }

    const r = Math.random();
    let loopSeconds = rand(2.5, 5.5);

    if (floor) {
      // อยู่บนของ: เดินไปมา นั่ง นอน หรือกระโดดลง
      if (r < 0.4) {
        dir = Math.random() < 0.5 ? -1 : 1;
        startMove("walk");
      } else if (r < 0.6) {
        startIdle();
      } else if (r < 0.78) {
        startSleep();
        loopSeconds = rand(5, 9);
      } else if (r < 0.88) {
        startPlay();
        return;
      } else {
        startFall();
        return;
      }
      actionTimer = setTimeout(chooseAction, loopSeconds * 1000);
      return;
    }

    if (canClimb && r < 0.1) {
      const p = findPlatform();
      if (p) {
        startHop(p);
        return;
      }
    }

    const q = Math.random();
    if (q >= 0.62 && q < 0.74 && homeEnabled && Math.random() < 0.75) {
      startGoHome(); // อยากนอน ไปนอนที่บ้าน
      return;
    }
    if (q < 0.38) {
      dir = Math.random() < 0.5 ? -1 : 1;
      startMove("walk");
    } else if (q < 0.5) {
      startIdle();
    } else if (q < 0.62) {
      dir = Math.random() < 0.5 ? -1 : 1;
      startMove("run");
      loopSeconds = rand(1.2, 2.4);
    } else if (q < 0.74) {
      startSleep();
      loopSeconds = rand(5, 9);
    } else if (q < 0.86) {
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
    updateToys(dt, time);

    // ตรวจว่าของที่น้องยืนอยู่ยังอยู่ที่เดิมไหม (เช่น หน้าเว็บเลื่อน หรือของหายไป)
    if (floor) {
      const p = platformBounds(floor.el);
      if (p) floor = p;
      else if (!AIRBORNE.has(mode)) startFall();
    }

    if (mode === "walk" || mode === "run") {
      x += dir * (mode === "run" ? RUN_SPEED : WALK_SPEED) * dt;
      if (x <= minX() || x >= maxX()) {
        x = clampX(x);
        dir = -dir;
        startMove(mode); // สลับไปใช้แถบภาพอีกด้าน
      }
    } else if (mode === "jump") {
      x = clampX(x + dir * JUMP_SPEED * dt);
    } else if (mode === "chase") {
      const toy = chase.toy;
      if (!toy.alive || time > chase.deadline) {
        if (toy.alive) removeToy(toy);
        chase = null;
        chooseAction();
      } else {
        const want = clampX(toy.x - chase.dir * TOY_GAP);
        const dx = want - x;
        if (Math.abs(dx) < 10) {
          arriveAtToy(toy);
        } else {
          dir = dx > 0 ? 1 : -1;
          ensureMoveAnim("run");
          x += dir * Math.min(RUN_SPEED * dt, Math.abs(dx));
        }
      }
    } else if (mode === "follow") {
      const dx = mouseX - x;
      if (mouseX < 0 || Math.abs(dx) < 90) {
        startIdle();
      } else {
        dir = dx > 0 ? 1 : -1;
        const kind = Math.abs(dx) > 350 ? "run" : "walk";
        ensureMoveAnim(kind);
        x = clampX(x + dir * (kind === "run" ? RUN_SPEED : WALK_SPEED) * dt);
      }
    } else if (mode === "hop") {
      hop.t += dt;
      const k = Math.min(1, hop.t / HOP_SECONDS);
      const target = platformBounds(hop.p.el);
      const y1 = (target ? target.top : hop.p.top) - CELL_PX_H + MARGIN;
      x = hop.x0 + (hop.x1 - hop.x0) * k;
      y = hop.y0 + (y1 - hop.y0) * k - 4 * HOP_ARC * k * (1 - k);
      if (k >= 1) finishHop();
    } else if (mode === "gohome") {
      const dx = homeX() - x;
      if (Math.abs(dx) < 8) {
        enterHome();
      } else {
        dir = dx > 0 ? 1 : -1;
        const kind = Math.abs(dx) > 200 ? "run" : "walk";
        ensureMoveAnim(kind);
        x += dir * Math.min((kind === "run" ? RUN_SPEED : WALK_SPEED) * dt, Math.abs(dx));
      }
    } else if (mode === "inhome") {
      x = homeX();
      if (restingToy()) exitHome(); // มีของเล่นวางอยู่ ตื่นมาเล่น
    } else if (mode === "fall") {
      const prevFeet = y + CELL_PX_H - MARGIN;
      vy += GRAVITY * dt;
      y += vy * dt;
      x += vx * dt;
      vx *= Math.pow(0.7, dt);
      const lo = HIT_W / 2;
      const hi = Math.max(lo, window.innerWidth - HIT_W / 2);
      if (x < lo) { x = lo; vx = -vx * 0.4; }
      if (x > hi) { x = hi; vx = -vx * 0.4; }
      if (y < 0) { y = 0; vy = Math.abs(vy) * 0.35; } // ชนเพดานจอ ไม่ให้น้องลอยหลุดจอ
      // ถูกโยนลงมาตรงของบนหน้าเว็บ → ลงจอดบนนั้น
      const feet = y + CELL_PX_H - MARGIN;
      if (vy > 0 && throwTargets.length) {
        for (const t of throwTargets) {
          if (prevFeet <= t.top + 4 && feet >= t.top && x >= t.left + 10 && x <= t.right - 10) {
            const p = platformBounds(t.el);
            if (p) {
              floor = p;
              x = clampX(x);
              y = floorY();
              vy = 0;
              vx = 0;
              throwTargets = [];
              startLand();
              break;
            }
          }
        }
      }
      if (mode === "fall" && y >= groundY()) {
        y = groundY();
        vy = 0;
        vx = 0;
        throwTargets = [];
        startLand();
      }
    }

    if (!AIRBORNE.has(mode)) y = floorY();

    // น้องไม่ได้ยุ่งอยู่กับอย่างอื่น และมีของเล่นวางอยู่ → ไปเล่น
    if (mode === "idle" || mode === "walk" || mode === "run" || mode === "sleep" || mode === "follow") {
      const toy = restingToy();
      if (toy) {
        if (floor) startFall();
        else startChase(toy);
      }
    }
    renderHome();
    positionBubble();
    render();
    rafId = requestAnimationFrame(frame);
  }

  function start() {
    if (host.isConnected) return;
    floor = null;
    x = Math.min(Math.max(x, HIT_W / 2), Math.max(HIT_W / 2, window.innerWidth - HIT_W / 2));
    y = groundY();
    document.documentElement.appendChild(host);
    startIdle();
    renderHome();
    render();
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
    actionTimer = setTimeout(chooseAction, 1200);
    greetOnce();
  }

  // เว็บที่จำไว้: ทักทายตอนกลับมา
  let greeted = false;
  function greetOnce() {
    if (greeted || typeof WebPetPanel === "undefined") return;
    greeted = true;
    setTimeout(async () => {
      try {
        const v = await WebPetPanel.visit();
        if (!v || !enabled || !host.isConnected) return;
        const notes = v.notes ? ` · 📝 ${v.notes} โน้ต` : "";
        say(`กลับมาที่ ${v.site.title || v.site.host} อีกแล้ว! (ครั้งที่ ${v.site.visits})${notes}`, 4500, true);
      } catch {
        // อ่านข้อมูลไม่ได้ (เช่น extension ถูก reload) — ข้ามไป
      }
    }, 1800);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    clearTimeout(actionTimer);
    clearTimeout(bubbleTimer);
    clearTimeout(homeTimer);
    for (const t of [...toys]) removeToy(t);
    chase = null;
    hop = null;
    floor = null;
    pendingHome = false;
    thinking = false;
    panelOpen = false;
    if (panel) panel.close();
    pet.classList.remove("hidden");
    home.classList.remove("occupied");
    host.remove();
  }

  // ----- ปฏิสัมพันธ์: กด / ลาก -----
  let pointerStart = null;
  let dragSamples = []; // ตำแหน่งเมาส์ช่วงสั้นๆ ไว้คำนวณความเร็วตอนโยน

  hit.addEventListener("pointerdown", (e) => {
    hit.setPointerCapture(e.pointerId);
    dragSamples = [];
    pointerStart = { px: e.clientX, py: e.clientY, offX: e.clientX - x, offY: e.clientY - y, moved: false };
  });

  // ความเร็วเมาส์ (px/วินาที) จากตัวอย่างล่าสุด ถ้าหยุดมือก่อนปล่อยจะได้ศูนย์
  function releaseVelocity() {
    const now = performance.now();
    const recent = dragSamples.filter((s) => now - s.t < 120);
    dragSamples = [];
    if (recent.length < 2 || now - recent[recent.length - 1].t > 90) return { vx: 0, vy: 0 };
    const a = recent[0];
    const b = recent[recent.length - 1];
    const dt = Math.max(0.016, (b.t - a.t) / 1000);
    const cap = (v) => Math.max(-1500, Math.min(1500, v));
    return { vx: cap((b.x - a.x) / dt), vy: cap((b.y - a.y) / dt) };
  }

  hit.addEventListener("pointermove", (e) => {
    if (!pointerStart) return;
    if (!pointerStart.moved) {
      if (Math.hypot(e.clientX - pointerStart.px, e.clientY - pointerStart.py) < DRAG_THRESHOLD) return;
      pointerStart.moved = true;
      clearTimeout(actionTimer);
      hideBubble();
      startDrag();
    }
    x = Math.min(Math.max(HIT_W / 2, e.clientX - pointerStart.offX), Math.max(HIT_W / 2, window.innerWidth - HIT_W / 2));
    y = Math.min(Math.max(0, e.clientY - pointerStart.offY), groundY());
    dragSamples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
    if (dragSamples.length > 12) dragSamples.shift();
  });

  hit.addEventListener("pointerup", () => {
    if (!pointerStart) return;
    const wasDrag = pointerStart.moved;
    pointerStart = null;
    if (wasDrag) {
      // ปล่อยตอนเมาส์กำลังเคลื่อนที่ = โยนน้อง ถ้าตรงกับของบนหน้าเว็บ น้องจะลงจอดบนนั้น
      const v = releaseVelocity();
      startFall(v.vx, v.vy, Math.hypot(v.vx, v.vy) > 150 ? listPlatforms() : []);
      return;
    }
    clearTimeout(actionTimer);
    chase = null;
    startReact();
  });

  hit.addEventListener("pointercancel", () => {
    if (pointerStart?.moved) startFall();
    pointerStart = null;
  });

  window.addEventListener("resize", () => {
    x = Math.min(Math.max(x, HIT_W / 2), Math.max(HIT_W / 2, window.innerWidth - HIT_W / 2));
    if (!floor && !AIRBORNE.has(mode)) {
      if (y > groundY()) y = groundY();
      else if (y < groundY()) {
        vy = 0;
        startFall();
      }
    }
  });

  document.addEventListener(
    "mousemove",
    (e) => {
      mouseX = e.clientX;
    },
    { passive: true }
  );

  // ----- แผงโน้ต / เว็บที่จำไว้ / แชท -----
  if (typeof WebPetPanel !== "undefined") {
    panel = WebPetPanel.create(shadow, {
      onOpenChange(open) {
        panelOpen = open;
        if (open) hideBubble();
        if (open && !AIRBORNE.has(mode) && mode !== "inhome") {
          clearTimeout(actionTimer);
          startIdle();
          actionTimer = setTimeout(chooseAction, 4000);
        } else if (!open) {
          clearTimeout(actionTimer);
          actionTimer = setTimeout(chooseAction, 600);
        }
      },
      onThinking(on) {
        thinking = on;
        if (on) {
          clearTimeout(actionTimer);
          if (!AIRBORNE.has(mode) && mode !== "inhome") {
            mode = "think";
            startAnim("special", [1, 1], 1); // ท่าสงสัย ?
          }
        } else if (mode === "think") {
          chooseAction();
        }
      },
      onReply() {
        if (AIRBORNE.has(mode) || mode === "inhome") return;
        clearTimeout(actionTimer);
        mode = "react";
        startAnim("happy", [0, 1, 2, 1, 2], 6, { loop: false, hold: 0.3, onEnd: chooseAction });
        spawnHearts();
      },
      onNoteSaved() {
        say("จดให้แล้วนะ 📝", 1500);
        spawnHearts();
      },
    });
  }

  // โหลดภาพทุกแถบล่วงหน้า กันภาพกระพริบตอนเปลี่ยนท่า
  for (const name of Object.keys(FRAME_COUNT)) new Image().src = sheetUrl(name);

  // ----- ตั้งค่า (เก็บแบบ global ใช้ร่วมกันทุกเว็บ) และคำสั่งจาก popup -----
  const DEFAULTS = { petEnabled: true, petFollow: false, petClimb: true, petHome: true, petHomeX: HOME_DEFAULT_FRAC };

  function applySettings(s) {
    followMouse = s.petFollow === true;
    canClimb = s.petClimb !== false;
    homeEnabled = s.petHome !== false;
    if (typeof s.petHomeX === "number" && !homeDrag) homeFrac = Math.min(1, Math.max(0, s.petHomeX));
    if (homeButton) homeButton.style.display = homeEnabled ? "" : "none";
    if (!homeEnabled) {
      pendingHome = false;
      if (mode === "inhome") exitHome();
      else if (mode === "gohome") chooseAction();
    }
    if (!canClimb && floor) startFall();
    enabled = s.petEnabled !== false;
    if (enabled) start();
    else stop();
  }

  try {
    chrome.storage.sync.get(DEFAULTS, applySettings);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      chrome.storage.sync.get(DEFAULTS, applySettings);
    });
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || !enabled) return;
      if (msg.type === "pet-toy") spawnToy(msg.kind);
      else if (msg.type === "pet-open" && panel) panel.open(msg.tab || "chat");
      else if (msg.type === "pet-gohome") goHome();
      else return;
      sendResponse({ ok: true }); // ไม่ตอบกลับ popup จะเห็น lastError
    });
  } catch {
    // extension ถูก reload ขณะหน้าเปิดค้าง — ไม่ต้องทำอะไร
  }
})();
