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
      .toy { position: fixed; left: 0; top: 0; width: ${TOY_SIZE}px; height: ${TOY_SIZE}px;
        font: ${TOY_SIZE - 4}px/${TOY_SIZE}px system-ui, sans-serif; text-align: center;
        pointer-events: auto; cursor: grab; touch-action: none; user-select: none;
        -webkit-user-select: none; will-change: transform; }
      .toy.dragging { cursor: grabbing; }
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
  // mode: idle | walk | run | jump | play | sleep | react | drag | fall | land | hop | chase | follow
  let enabled = true;
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

  function startFall() {
    floor = null;
    hop = null;
    mode = "fall";
    startAnim("fall_land", [0], 1);
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

  function findPlatform() {
    const els = Array.from(document.querySelectorAll(PLATFORM_SELECTOR)).slice(0, 600);
    const cands = [];
    for (const el of els) {
      const r = el.getBoundingClientRect();
      if (r.width < 120 || r.height < 20) continue;
      if (r.top < CELL_PX_H + 8 || r.top > window.innerHeight - 90) continue;
      if (groundY() + CELL_PX_H - r.top > PLATFORM_MAX_RISE) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.2) continue;
      const dx = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (dx > PLATFORM_MAX_REACH) continue;
      // ต้องไม่มีอะไรบังขอบบนของมัน
      const px = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
      const top = document.elementFromPoint(px, r.top + 3);
      if (!top || !(el === top || el.contains(top))) continue;
      const b = platformBounds(el);
      if (b) cands.push(b);
    }
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

  // ----- เลือกท่าทางถัดไปแบบสุ่ม -----
  function chooseAction() {
    clearTimeout(actionTimer);
    if (!enabled) return;
    if (bubblePersistent) hideBubble();

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

  const AIRBORNE = new Set(["drag", "fall", "hop"]);

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
    } else if (mode === "fall") {
      vy += GRAVITY * dt;
      y += vy * dt;
      if (y >= groundY()) {
        y = groundY();
        vy = 0;
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
    render();
    lastTime = performance.now();
    rafId = requestAnimationFrame(frame);
    actionTimer = setTimeout(chooseAction, 1200);
  }

  function stop() {
    cancelAnimationFrame(rafId);
    clearTimeout(actionTimer);
    clearTimeout(bubbleTimer);
    for (const t of [...toys]) removeToy(t);
    chase = null;
    hop = null;
    floor = null;
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
    x = Math.min(Math.max(HIT_W / 2, e.clientX - pointerStart.offX), Math.max(HIT_W / 2, window.innerWidth - HIT_W / 2));
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
    chase = null;
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

  // โหลดภาพทุกแถบล่วงหน้า กันภาพกระพริบตอนเปลี่ยนท่า
  for (const name of Object.keys(FRAME_COUNT)) new Image().src = sheetUrl(name);

  // ----- ตั้งค่า (เก็บแบบ global ใช้ร่วมกันทุกเว็บ) และคำสั่งจาก popup -----
  const DEFAULTS = { petEnabled: true, petFollow: false, petClimb: true };

  function applySettings(s) {
    followMouse = s.petFollow === true;
    canClimb = s.petClimb !== false;
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
      if (msg && msg.type === "pet-toy") {
        spawnToy(msg.kind);
        sendResponse({ ok: true }); // ไม่ตอบกลับ popup จะเห็น lastError
      }
    });
  } catch {
    // extension ถูก reload ขณะหน้าเปิดค้าง — ไม่ต้องทำอะไร
  }
})();
