// สัตว์เลี้ยงพิกเซล (แมว / หมา) อยู่บนหน้าเว็บ: เดิน วิ่ง นอน เล่นของเล่น ตามเมาส์ ปีนของ เล่นด้วยกัน ฯลฯ
// ต้องโหลดหลัง species.js และ panel.js
(() => {
  if (window.__webPetLoaded) return;
  window.__webPetLoaded = true;

  const SP = WebPetSpecies;

  const MARGIN = 2;
  const WALK_SPEED = 55; // px ต่อวินาที
  const RUN_SPEED = 150;
  const JUMP_SPEED = 80;
  const GRAVITY = 1800;
  const DRAG_THRESHOLD = 5;

  // ของเล่น
  const TOY_SIZE = 30;
  const TOY_GAP = 58; // ระยะที่สัตว์เลี้ยงหยุดหน้าของเล่น
  const TOY_EMOJI = { yarn: "🧶", fish: "🐟", bone: "🦴", ball: "🎾" };
  const MAX_TOYS = 3;

  // ปีนขึ้นของบนหน้าเว็บ
  const PLATFORM_SELECTOR =
    "h1,h2,h3,h4,h5,img,button,pre,table,figure,video,input,textarea,select,blockquote,aside,header,footer,nav,form,p";
  const PLATFORM_MAX_RISE = 380; // กระโดดขึ้นสูงสุดกี่ px
  const PLATFORM_MAX_REACH = 450; // ห่างในแนวนอนสูงสุดกี่ px
  const HOP_SECONDS = 0.75;
  const HOP_ARC = 70;

  const HOME_NAP_SECONDS = [25, 55];

  // เล่นด้วยกัน (หมา + แมว)
  const APPROACH_GAP = 74; // ระยะที่หมาหยุดหน้าแมวตอนเข้าไปชวน
  const TAG_ROUNDS = 3; // จำนวนครั้งที่สลับกันวิ่งไล่
  const TAG_MAX_SECONDS = 16;
  const CUDDLE_SECONDS = 5.5;
  const DUO_SEQUENCE = [1, 3, 4, 0, 1, 2]; // เฟรมของฉากหมากับแมวอยู่ด้วยกัน (แถบ interact)

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const sign = (v) => (v >= 0 ? 1 : -1);
  const AIRBORNE = new Set(["drag", "fall", "hop"]);

  // ----- สถานะรวมของทุกตัว -----
  const W = {
    pets: [],
    toys: [],
    panel: null,
    panelPet: null,
    mouseX: -1,
    enabled: true,
    follow: false,
    climb: true,
    home: true,
    playdate: true,
    social: null,
    duo: null,
    rafId: 0,
    lastTime: 0,
    socialTimer: 0,
    greeted: false,
    running: false,
  };

  // Shadow DOM กัน CSS ของเว็บมากระทบ และสัตว์เลี้ยงไม่บังการคลิกส่วนอื่นของหน้า
  const host = document.createElement("div");
  host.style.cssText =
    "all: initial; position: fixed; left: 0; top: 0; width: 0; height: 0; z-index: 2147483647; pointer-events: none;";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      .pet { position: fixed; left: 0; top: 0; z-index: 3; pointer-events: none; will-change: transform;
        user-select: none; -webkit-user-select: none; transition: opacity .35s; }
      .pet.hidden { opacity: 0; }
      .pet.hidden .hit { pointer-events: none; }
      .face { position: absolute; inset: 0; }
      .sprite { position: absolute; inset: 0; background-repeat: no-repeat; }
      .hit { position: absolute; left: 50%; bottom: 0; transform: translateX(-50%);
        pointer-events: auto; cursor: grab; touch-action: none; }
      .hit.dragging { cursor: grabbing; }
      .bubble { position: absolute; left: 50%; transform: translateX(-50%);
        padding: 5px 10px; background: #fff; color: #202124; border-radius: 10px;
        font: 12px/1.4 system-ui, sans-serif; white-space: nowrap;
        box-shadow: 0 2px 8px rgba(0,0,0,.25); pointer-events: none; display: none; }
      .bubble.show { display: block; }
      .bubble.actions { pointer-events: auto; }
      .bubble-actions { display: none; gap: 4px; margin-top: 4px; justify-content: center; flex-wrap: wrap;
        max-width: 250px; white-space: normal; }
      .bubble.actions .bubble-actions { display: flex; }
      .bubble-actions button { border: 0; border-radius: 8px; padding: 3px 7px; background: #f1f3f4;
        font: 12px system-ui, sans-serif; cursor: pointer; white-space: nowrap; }
      .bubble-actions button:hover { background: #e0e3e6; }
      .home { position: fixed; left: 0; top: 0; z-index: 1; pointer-events: auto; cursor: grab;
        touch-action: none; user-select: none; -webkit-user-select: none; will-change: transform; }
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
      .toy { position: fixed; left: 0; top: 0; z-index: 5; width: ${TOY_SIZE}px; height: ${TOY_SIZE}px;
        font: ${TOY_SIZE - 4}px/${TOY_SIZE}px system-ui, sans-serif; text-align: center;
        pointer-events: auto; cursor: grab; touch-action: none; user-select: none;
        -webkit-user-select: none; will-change: transform; }
      .toy.dragging { cursor: grabbing; }
      .duo { position: fixed; left: 0; top: 0; z-index: 4; pointer-events: none; will-change: transform; }
      .duo .sprite { position: absolute; inset: 0; background-repeat: no-repeat; }
    </style>`;

  // ======================================================================
  //  Pet: สัตว์เลี้ยง 1 ตัว (แมวหรือหมา) มีสถานะ แอนิเมชัน และพฤติกรรมของตัวเอง
  // ======================================================================
  class Pet {
    constructor(sp, x) {
      this.sp = sp;
      this.cw = sp.cell[0] * sp.scale;
      this.ch = sp.cell[1] * sp.scale;
      this.hitW = sp.hit[0];
      this.hitH = sp.hit[1];
      this.homeW = sp.home.w;
      this.homeH = sp.home.h;
      this.homeFrac = sp.home.defaultFrac;
      this.homeTransform = "";
      // mode: idle | walk | run | jump | play | sleep | react | drag | fall | land | hop | chase
      //       | follow | gohome | inhome | think | social
      this.mode = "idle";
      this.dir = 1; // 1 = ขวา, -1 = ซ้าย
      this.x = x; // กึ่งกลางตัวสัตว์ (แนวนอน)
      this.vx = 0;
      this.vy = 0;
      this.anim = null;
      this.shownSheet = "";
      this.shownFrame = -1;
      this.actionTimer = 0;
      this.bubbleTimer = 0;
      this.homeTimer = 0;
      this.bubblePersistent = false;
      this.hop = null; // กำลังกระโดดขึ้นไปบนของ
      this.floor = null; // {el, lo, hi, top} เมื่อยืนอยู่บนของบนหน้าเว็บ
      this.chase = null; // {toy, dir, deadline}
      this.goal = null; // เป้าหมายตอนเล่นด้วยกัน {getX, kind, tol, speedMul, onArrive}
      this.throwTargets = [];
      this.pendingHome = false;
      this.dragSamples = [];
      this.pointerStart = null;
      this.homeDrag = null;
      this.panelOpen = false;
      this.thinking = false;
      this.build();
      this.y = this.groundY();
    }

    // ---------- สร้าง DOM ----------
    build() {
      const sp = this.sp;
      this.homeEl = document.createElement("div");
      this.homeEl.className = "home";
      this.homeEl.style.width = `${this.homeW}px`;
      this.homeEl.style.height = `${this.homeH}px`;
      this.homeEl.innerHTML = `${sp.home.svg}<span class="zzz">z</span><span class="zzz b">Z</span>`;

      this.root = document.createElement("div");
      this.root.className = "pet";
      this.root.style.width = `${this.cw}px`;
      this.root.style.height = `${this.ch}px`;
      this.root.innerHTML = `
        <div class="bubble"><span class="bubble-text"></span><div class="bubble-actions"></div></div>
        <div class="face"><div class="sprite"></div></div>
        <div class="hit"></div>`;
      this.bubble = this.root.querySelector(".bubble");
      this.bubbleText = this.root.querySelector(".bubble-text");
      this.bubbleActions = this.root.querySelector(".bubble-actions");
      this.face = this.root.querySelector(".face");
      this.sprite = this.root.querySelector(".sprite");
      this.hit = this.root.querySelector(".hit");
      this.hit.style.width = `${this.hitW}px`;
      this.hit.style.height = `${this.hitH}px`;
      this.bubble.style.bottom = `${this.ch + 2}px`;

      shadow.appendChild(this.homeEl);
      shadow.appendChild(this.root);
      this.attachPointer();
      this.attachHome();

      // เอาเมาส์วางบนปุ่มอยู่ ไม่ให้กล่องหายไป
      this.bubble.addEventListener("mouseenter", () => clearTimeout(this.bubbleTimer));
      this.bubble.addEventListener("mouseleave", () => {
        if (this.bubble.classList.contains("actions")) this.bubbleTimer = setTimeout(() => this.hideBubble(), 2000);
      });
    }

    destroy() {
      clearTimeout(this.actionTimer);
      clearTimeout(this.bubbleTimer);
      clearTimeout(this.homeTimer);
      this.root.remove();
      this.homeEl.remove();
    }

    // ---------- ตำแหน่ง ----------
    groundY() { return window.innerHeight - MARGIN - this.ch; }
    floorY() { return this.floor ? this.floor.top - this.ch + MARGIN : this.groundY(); }
    minX() { return this.floor ? this.floor.lo : this.hitW / 2; }
    maxX() { return this.floor ? this.floor.hi : Math.max(this.hitW / 2, window.innerWidth - this.hitW / 2); }
    clampX(v) { return Math.min(Math.max(v, this.minX()), this.maxX()); }
    screenClampX(v) { return Math.min(Math.max(v, this.hitW / 2), Math.max(this.hitW / 2, window.innerWidth - this.hitW / 2)); }

    // ---------- ระบบแอนิเมชัน ----------
    sheetUrl(name) {
      return chrome.runtime.getURL(`${this.sp.dir}/${name}.png`);
    }

    showFrame(name, index) {
      if (name !== this.shownSheet) {
        this.shownSheet = name;
        this.shownFrame = -1;
        this.sprite.style.backgroundImage = `url("${this.sheetUrl(name)}")`;
        this.sprite.style.backgroundSize = `${this.cw * this.sp.sheets[name]}px ${this.ch}px`;
      }
      if (index !== this.shownFrame) {
        this.shownFrame = index;
        this.sprite.style.backgroundPosition = `${-index * this.cw}px 0`;
      }
    }

    // seq = ลำดับเฟรม, fps = ความเร็ว, opts: loop, hold (ค้างเฟรมสุดท้ายกี่วินาที), flip, onEnd
    startAnim(name, seq, fps, opts = {}) {
      this.anim = {
        name, seq, fps,
        t: 0,
        loop: opts.loop !== false,
        hold: opts.hold || 0,
        flip: opts.flip !== false, // false = แถบภาพมีแยกซ้าย/ขวาอยู่แล้ว ไม่ต้องกลับด้าน
        onEnd: opts.onEnd || null,
        finished: false,
      };
      this.showFrame(name, seq[0]);
    }

    // เล่นท่าตามชื่อที่กำหนดไว้ในข้อมูลของสัตว์ชนิดนั้น
    playAnim(key, opts = {}) {
      const spec = this.sp.anims[key];
      this.startAnim(spec.sheet, spec.seq, spec.fps, { flip: spec.flip, ...opts });
    }

    // เล่นท่าจาก spec ที่ได้มาตรงๆ (เช่น ปฏิกิริยาสุ่ม ท่าตอนเล่นของเล่น)
    playSpec(spec, opts = {}) {
      this.startAnim(spec.sheet, spec.seq, spec.fps, { flip: spec.flip, hold: spec.hold, ...opts });
    }

    tickAnim(dt) {
      const a = this.anim;
      if (!a) return;
      a.t += dt;
      const raw = Math.floor(a.t * a.fps);
      let i;
      if (a.loop) {
        i = raw % a.seq.length;
      } else {
        i = Math.min(raw, a.seq.length - 1);
        if (!a.finished && a.t >= a.seq.length / a.fps + a.hold) {
          a.finished = true;
          if (a.onEnd) a.onEnd();
        }
      }
      if (this.anim) this.showFrame(this.anim.name, this.anim.seq[i]);
    }

    // ---------- ท่าทางต่างๆ ----------
    startIdle() {
      this.mode = "idle";
      this.goal = null;
      this.playAnim(Math.random() < 0.65 ? "idleA" : "idleB");
    }

    setMoveAnim(kind) {
      this.playAnim(`${kind}${this.dir === 1 ? "Right" : "Left"}`);
    }

    ensureMoveAnim(kind) {
      const spec = this.sp.anims[`${kind}${this.dir === 1 ? "Right" : "Left"}`];
      if (!this.anim || this.anim.name !== spec.sheet) this.setMoveAnim(kind);
    }

    startMove(kind) {
      this.mode = kind; // "walk" | "run"
      this.setMoveAnim(kind);
    }

    startSleep() {
      this.mode = "sleep";
      this.playAnim("sleep");
    }

    startJump() {
      this.mode = "jump";
      this.playAnim("jump", { loop: false, hold: 0.2, onEnd: () => this.chooseAction() });
    }

    startPlay() {
      this.mode = "play";
      this.playAnim("play", { loop: false, hold: 0.3, onEnd: () => this.chooseAction() });
    }

    // velX/velY = ความเร็วตอนถูกโยน (px/วินาที) targets = ของบนหน้าเว็บที่ลงจอดได้
    startFall(velX = 0, velY = 0, targets = []) {
      this.releaseToy();
      this.floor = null;
      this.hop = null;
      this.chase = null;
      this.goal = null;
      this.mode = "fall";
      this.vx = velX;
      this.vy = velY;
      this.throwTargets = targets;
      if (Math.hypot(velX, velY) > 400) {
        if (Math.abs(velX) > 20) this.dir = sign(velX);
        this.playAnim("fly"); // ท่าลอยกลางอากาศ
      } else {
        this.playAnim("tumble");
      }
    }

    startLand() {
      this.mode = "land";
      this.say(this.sp.landSay, 900);
      this.playAnim("land", { loop: false, hold: 0.2, onEnd: () => this.chooseAction() });
    }

    startDrag() {
      cancelSocial();
      clearTimeout(this.actionTimer); // cancelSocial อาจตั้งเวลาเลือกท่าใหม่ไว้ ต้องล้างทิ้ง
      this.releaseToy();
      this.floor = null;
      this.hop = null;
      this.chase = null;
      this.goal = null;
      this.mode = "drag";
      this.playAnim("tumble");
    }

    startReact() {
      cancelSocial();
      clearTimeout(this.actionTimer);
      this.mode = "react";
      this.goal = null;
      this.playSpec(this.sp.reaction(), { loop: false, onEnd: () => this.chooseAction() });
      this.say(pick(this.sp.phrases), 4500, true);
      this.spawnHearts();
    }

    // ---------- ข้อความและหัวใจ ----------
    say(text, ms = 1800, withActions = false) {
      this.bubbleText.textContent = text;
      if (withActions) this.refreshActions();
      this.bubble.classList.add("show");
      this.bubble.classList.toggle("actions", withActions);
      this.bubblePersistent = ms === 0;
      clearTimeout(this.bubbleTimer);
      if (ms) this.bubbleTimer = setTimeout(() => this.hideBubble(), ms);
    }

    hideBubble() {
      clearTimeout(this.bubbleTimer);
      this.bubblePersistent = false;
      this.bubble.classList.remove("show", "actions");
    }

    // ปุ่มลัดในกล่องข้อความ (โผล่มาตอนกดที่สัตว์เลี้ยง) ปรับตามสถานะตอนนั้น
    refreshActions() {
      const items = [
        ["💬 คุย", () => openPanel(this, "chat")],
        ["📝 โน้ต", () => openPanel(this, "notes")],
        ["🌐 เว็บ", () => openPanel(this, "sites")],
      ];
      if (W.home) items.push(["🏠 นอน", () => this.goHome()]);
      const hasCat = W.pets.some((p) => p.sp.id === "cat");
      const hasDog = W.pets.some((p) => p.sp.id === "dog");
      if (hasCat && hasDog) items.push(["🤝 เล่นด้วยกัน", () => startPlaydate(true)]);
      if (!hasDog) items.push(["🐶 เรียกน้องหมา", () => setWho("both")]);
      if (!hasCat) items.push(["🐱 เรียกน้องแมว", () => setWho("both")]);
      this.bubbleActions.textContent = "";
      for (const [label, fn] of items) {
        const b = document.createElement("button");
        b.type = "button";
        b.textContent = label;
        b.addEventListener("click", (e) => {
          e.stopPropagation();
          this.hideBubble();
          fn();
        });
        this.bubbleActions.appendChild(b);
      }
    }

    // ดันกล่องข้อความไม่ให้ล้นขอบจอ
    positionBubble() {
      if (!this.bubble.classList.contains("show")) return;
      const w = this.bubble.offsetWidth;
      let shift = 0;
      if (this.x - w / 2 < 8) shift = 8 - (this.x - w / 2);
      else if (this.x + w / 2 > window.innerWidth - 8) shift = window.innerWidth - 8 - (this.x + w / 2);
      this.bubble.style.transform = `translateX(calc(-50% + ${shift}px))`;
    }

    spawnHearts(parent = this.root) {
      for (let i = 0; i < 3; i++) {
        const h = document.createElement("span");
        h.className = "heart";
        h.textContent = "💖";
        h.style.setProperty("--dx", `${(Math.random() - 0.5) * 40 - 8}px`);
        h.style.animationDelay = `${i * 0.12}s`;
        parent.appendChild(h);
        h.addEventListener("animationend", () => h.remove());
      }
    }

    // ---------- ของเล่น ----------
    restingToy() {
      const likes = this.sp.likes;
      const rest = W.toys.filter(
        (t) => t.alive && !t.removeAt && t.state === "rest" && likes.includes(t.kind) && (!t.claimedBy || t.claimedBy === this)
      );
      rest.sort((a, b) => Math.abs(a.x - this.x) - Math.abs(b.x - this.x));
      return rest[0] || null;
    }

    releaseToy() {
      if (this.chase && this.chase.toy.claimedBy === this) this.chase.toy.claimedBy = null;
    }

    startChase(toy) {
      clearTimeout(this.actionTimer);
      this.mode = "chase";
      toy.claimedBy = this;
      this.chase = { toy, dir: toy.x >= this.x ? 1 : -1, deadline: performance.now() + 14000 };
      this.dir = this.chase.dir;
      this.setMoveAnim("run");
    }

    arriveAtToy(toy) {
      this.chase = null;
      toy.el.style.opacity = "0";
      toy.removeAt = performance.now() + 3500; // เผื่อถูกขัดจังหวะ จะเก็บของเล่นทิ้งเอง
      const { spec, say } = this.sp.toyAnim(toy.kind);
      this.mode = "play";
      // ภาพท่าเล่นของบางตัวมีของเล่นวาดอยู่ในเฟรมแล้ว จึงซ่อนของเล่นจริงไว้ระหว่างเล่น
      this.playSpec(spec, {
        loop: false,
        onEnd: () => {
          removeToy(toy);
          this.chooseAction();
        },
      });
      if (say) {
        this.say(say, 1600);
        this.spawnHearts();
      }
    }

    // ---------- ปีนขึ้นของบนหน้าเว็บ (หัวข้อ รูป ปุ่ม ย่อหน้า ฯลฯ) ----------
    platformBounds(el) {
      if (!el.isConnected) return null;
      const r = el.getBoundingClientRect();
      if (r.width < 100 || r.right <= 0 || r.left >= window.innerWidth) return null;
      if (r.top < this.ch - 20 || r.top > window.innerHeight - 30) return null;
      const lo = Math.max(this.hitW / 2, r.left + 24);
      const hi = Math.min(window.innerWidth - this.hitW / 2, r.right - 24);
      if (hi - lo < 20) return null;
      return { el, lo, hi, top: r.top };
    }

    // ของบนหน้าเว็บที่ยืนได้ทั้งหมด (มองเห็นอยู่ และไม่มีอะไรบังขอบบน)
    listPlatforms() {
      const els = Array.from(document.querySelectorAll(PLATFORM_SELECTOR)).slice(0, 600);
      const out = [];
      for (const el of els) {
        const r = el.getBoundingClientRect();
        if (r.width < 120 || r.height < 20) continue;
        if (r.top < this.ch + 8 || r.top > window.innerHeight - 90) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === "hidden" || cs.display === "none" || Number(cs.opacity) < 0.2) continue;
        const px = Math.min(Math.max(r.left + r.width / 2, 0), window.innerWidth - 1);
        const top = document.elementFromPoint(px, r.top + 3);
        if (!top || !(el === top || el.contains(top))) continue;
        const b = this.platformBounds(el);
        if (b) out.push({ ...b, left: r.left, right: r.right });
      }
      return out;
    }

    // ของที่กระโดดขึ้นไปได้จากตำแหน่งปัจจุบัน
    findPlatform() {
      const cands = this.listPlatforms().filter((p) => {
        if (this.groundY() + this.ch - p.top > PLATFORM_MAX_RISE) return false;
        const dx = this.x < p.left ? p.left - this.x : this.x > p.right ? this.x - p.right : 0;
        return dx <= PLATFORM_MAX_REACH;
      });
      return cands.length ? pick(cands) : null;
    }

    startHop(p) {
      clearTimeout(this.actionTimer);
      this.mode = "hop";
      const tx = Math.min(Math.max(this.x + rand(-80, 80), p.lo), p.hi);
      this.hop = { t: 0, x0: this.x, y0: this.y, x1: tx, p };
      this.dir = sign(tx - this.x);
      this.playAnim("jump", { loop: false });
    }

    finishHop() {
      const p = this.platformBounds(this.hop.p.el);
      this.hop = null;
      if (!p) {
        this.startFall();
        return;
      }
      this.floor = p;
      this.x = this.clampX(this.x);
      this.y = this.floorY();
      this.startIdle();
      this.actionTimer = setTimeout(() => this.chooseAction(), 1500);
    }

    // ---------- บ้าน: เดินไปนอน กดที่บ้านเพื่อเรียก/ปลุก ลากบ้านย้ายที่ได้ ----------
    homeX() {
      return Math.min(
        Math.max(this.homeFrac * window.innerWidth, this.homeW / 2 + 4),
        window.innerWidth - this.homeW / 2 - 4
      );
    }

    renderHome() {
      if (!W.home) {
        this.homeEl.style.display = "none";
        return;
      }
      this.homeEl.style.display = "";
      const t = `translate(${this.homeX() - this.homeW / 2}px, ${window.innerHeight - this.homeH - MARGIN}px)`;
      if (t !== this.homeTransform) {
        this.homeTransform = t;
        this.homeEl.style.transform = t;
      }
    }

    startGoHome() {
      clearTimeout(this.actionTimer);
      this.chase = null;
      this.releaseToy();
      this.mode = "gohome";
      this.hideBubble();
    }

    // สั่งให้ไปนอนบ้าน (ถ้าอยู่บนของหรือกลางอากาศ ให้ลงพื้นก่อนแล้วค่อยไป)
    goHome() {
      if (!W.home || this.mode === "inhome" || this.mode === "gohome") return;
      cancelSocial();
      if (this.floor || AIRBORNE.has(this.mode)) {
        this.pendingHome = true;
        if (this.floor && !AIRBORNE.has(this.mode)) this.startFall();
        return;
      }
      this.startGoHome();
    }

    enterHome() {
      this.mode = "inhome";
      this.x = this.homeX();
      this.playAnim("sleep");
      this.root.classList.add("hidden");
      this.homeEl.classList.add("occupied");
      clearTimeout(this.homeTimer);
      this.homeTimer = setTimeout(() => this.exitHome(), rand(HOME_NAP_SECONDS[0], HOME_NAP_SECONDS[1]) * 1000);
    }

    exitHome() {
      if (this.mode !== "inhome") return;
      clearTimeout(this.homeTimer);
      this.root.classList.remove("hidden");
      this.homeEl.classList.remove("occupied");
      this.x = this.homeX();
      this.y = this.groundY();
      this.mode = "react";
      this.playAnim("happy", { loop: false, hold: 0.3, onEnd: () => this.chooseAction() });
      this.say(pick(this.sp.wakeSay), 1500);
    }

    attachHome() {
      const el = this.homeEl;
      el.addEventListener("pointerdown", (e) => {
        el.setPointerCapture(e.pointerId);
        this.homeDrag = { off: e.clientX - this.homeX(), px: e.clientX, moved: false };
      });
      el.addEventListener("pointermove", (e) => {
        const d = this.homeDrag;
        if (!d) return;
        if (!d.moved) {
          if (Math.abs(e.clientX - d.px) < DRAG_THRESHOLD) return;
          d.moved = true;
          el.classList.add("dragging");
        }
        this.homeFrac = Math.min(1, Math.max(0, (e.clientX - d.off) / window.innerWidth));
      });
      el.addEventListener("pointerup", () => {
        const d = this.homeDrag;
        if (!d) return;
        this.homeDrag = null;
        el.classList.remove("dragging");
        if (d.moved) {
          try { chrome.storage.sync.set({ [this.sp.home.key]: this.homeFrac }); } catch { /* ไม่เป็นไร */ }
        } else if (this.mode === "inhome") {
          this.exitHome(); // กดที่บ้านตอนนอนอยู่ = ปลุก
        } else {
          this.goHome(); // กดตอนบ้านว่าง = เรียกไปนอน
        }
      });
      el.addEventListener("pointercancel", () => {
        this.homeDrag = null;
        el.classList.remove("dragging");
      });
    }

    // ---------- เลือกท่าทางถัดไปแบบสุ่ม ----------
    chooseAction() {
      clearTimeout(this.actionTimer);
      if (!W.running || this.thinking || this.mode === "inhome" || this.mode === "social") return;
      if (this.bubblePersistent) this.hideBubble();

      // แผงเปิดอยู่ นั่งรอเฉยๆ ไม่เดินหนีไปไหน
      if (this.panelOpen) {
        this.startIdle();
        this.actionTimer = setTimeout(() => this.chooseAction(), 4000);
        return;
      }

      if (this.pendingHome && W.home && !this.floor) {
        this.pendingHome = false;
        this.startGoHome();
        return;
      }

      // มีของเล่นที่ชอบวางอยู่ ต้องไปเล่นก่อน (ถ้าอยู่บนของ ให้กระโดดลงมาก่อน)
      const toy = this.restingToy();
      if (toy) {
        if (this.floor) this.startFall();
        else this.startChase(toy);
        return;
      }

      // ตามเมาส์
      if (W.follow && !this.floor && W.mouseX >= 0 && Math.abs(W.mouseX - this.x) > 140 && Math.random() < 0.7) {
        this.mode = "follow";
        this.actionTimer = setTimeout(() => this.chooseAction(), rand(4, 7) * 1000);
        return;
      }

      const r = Math.random();
      let loopSeconds = rand(2.5, 5.5);

      if (this.floor) {
        // อยู่บนของ: เดินไปมา นั่ง นอน หรือกระโดดลง
        if (r < 0.4) {
          this.dir = Math.random() < 0.5 ? -1 : 1;
          this.startMove("walk");
        } else if (r < 0.6) {
          this.startIdle();
        } else if (r < 0.78) {
          this.startSleep();
          loopSeconds = rand(5, 9);
        } else if (r < 0.88) {
          this.startPlay();
          return;
        } else {
          this.startFall();
          return;
        }
        this.actionTimer = setTimeout(() => this.chooseAction(), loopSeconds * 1000);
        return;
      }

      if (W.climb && r < 0.1) {
        const p = this.findPlatform();
        if (p) {
          this.startHop(p);
          return;
        }
      }

      const q = Math.random();
      if (q >= 0.62 && q < 0.74 && W.home && Math.random() < 0.75) {
        this.startGoHome(); // อยากนอน ไปนอนที่บ้าน
        return;
      }
      if (q < 0.38) {
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.startMove("walk");
      } else if (q < 0.5) {
        this.startIdle();
      } else if (q < 0.62) {
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.startMove("run");
        loopSeconds = rand(1.2, 2.4);
      } else if (q < 0.74) {
        this.startSleep();
        loopSeconds = rand(5, 9);
      } else if (q < 0.86) {
        this.startPlay(); // จบเองแล้วเรียก chooseAction ต่อ
        return;
      } else {
        this.dir = Math.random() < 0.5 ? -1 : 1;
        this.startJump(); // จบเองแล้วเรียก chooseAction ต่อ
        return;
      }
      this.actionTimer = setTimeout(() => this.chooseAction(), loopSeconds * 1000);
    }

    // ---------- เล่นด้วยกัน: ให้ social.js สั่งเป้าหมายมาที่นี่ ----------
    enterSocial() {
      clearTimeout(this.actionTimer);
      clearTimeout(this.homeTimer);
      this.releaseToy();
      this.chase = null;
      this.hop = null;
      this.hideBubble();
      this.mode = "social";
      this.goal = null;
    }

    // วิ่ง/เดินไปยังตำแหน่งที่ getX() ให้มา แล้วเรียก onArrive (tol < 0 = ไม่ถึงสักที วิ่งตามไปเรื่อยๆ)
    goTo(goal) {
      this.mode = "social";
      this.goal = { kind: "run", tol: 10, speedMul: 1, ...goal };
    }

    holdStill(animKey = "idleA", opts = {}) {
      this.mode = "social";
      this.goal = null;
      this.playAnim(animKey, opts);
    }

    // ---------- วงจรหลัก ----------
    render() {
      this.root.style.transform = `translate(${this.x - this.cw / 2}px, ${this.y}px)`;
      this.face.style.transform = this.anim && this.anim.flip && this.dir === -1 ? "scaleX(-1)" : "";
      this.hit.classList.toggle("dragging", this.mode === "drag");
    }

    frame(dt, time) {
      this.tickAnim(dt);

      // ตรวจว่าของที่ยืนอยู่ยังอยู่ที่เดิมไหม (เช่น หน้าเว็บเลื่อน หรือของหายไป)
      if (this.floor) {
        const p = this.platformBounds(this.floor.el);
        if (p) this.floor = p;
        else if (!AIRBORNE.has(this.mode)) this.startFall();
      }

      const m = this.mode;
      if (m === "walk" || m === "run") {
        this.x += this.dir * (m === "run" ? RUN_SPEED : WALK_SPEED) * dt;
        if (this.x <= this.minX() || this.x >= this.maxX()) {
          this.x = this.clampX(this.x);
          this.dir = -this.dir;
          this.startMove(m); // สลับไปใช้แถบภาพอีกด้าน
        }
      } else if (m === "jump") {
        this.x = this.clampX(this.x + this.dir * JUMP_SPEED * dt);
      } else if (m === "chase") {
        const toy = this.chase.toy;
        if (!toy.alive || time > this.chase.deadline) {
          this.releaseToy();
          if (toy.alive) removeToy(toy);
          this.chase = null;
          this.chooseAction();
        } else {
          const want = this.clampX(toy.x - this.chase.dir * TOY_GAP);
          const dx = want - this.x;
          if (Math.abs(dx) < 10) {
            this.arriveAtToy(toy);
          } else {
            this.dir = sign(dx);
            this.ensureMoveAnim("run");
            this.x += this.dir * Math.min(RUN_SPEED * dt, Math.abs(dx));
          }
        }
      } else if (m === "follow") {
        const dx = W.mouseX - this.x;
        if (W.mouseX < 0 || Math.abs(dx) < 90) {
          this.startIdle();
        } else {
          this.dir = sign(dx);
          const kind = Math.abs(dx) > 350 ? "run" : "walk";
          this.ensureMoveAnim(kind);
          this.x = this.clampX(this.x + this.dir * (kind === "run" ? RUN_SPEED : WALK_SPEED) * dt);
        }
      } else if (m === "hop") {
        this.hop.t += dt;
        const k = Math.min(1, this.hop.t / HOP_SECONDS);
        const target = this.platformBounds(this.hop.p.el);
        const y1 = (target ? target.top : this.hop.p.top) - this.ch + MARGIN;
        this.x = this.hop.x0 + (this.hop.x1 - this.hop.x0) * k;
        this.y = this.hop.y0 + (y1 - this.hop.y0) * k - 4 * HOP_ARC * k * (1 - k);
        if (k >= 1) this.finishHop();
      } else if (m === "gohome") {
        const dx = this.homeX() - this.x;
        if (Math.abs(dx) < 8) {
          this.enterHome();
        } else {
          this.dir = sign(dx);
          const kind = Math.abs(dx) > 200 ? "run" : "walk";
          this.ensureMoveAnim(kind);
          this.x += this.dir * Math.min((kind === "run" ? RUN_SPEED : WALK_SPEED) * dt, Math.abs(dx));
        }
      } else if (m === "inhome") {
        this.x = this.homeX();
        if (this.restingToy()) this.exitHome(); // มีของเล่นที่ชอบวางอยู่ ตื่นมาเล่น
      } else if (m === "social") {
        const g = this.goal;
        if (g) {
          const want = this.clampX(g.getX());
          const dx = want - this.x;
          const speed = (g.kind === "run" ? RUN_SPEED : WALK_SPEED) * g.speedMul;
          if (g.tol >= 0 && Math.abs(dx) <= g.tol) {
            this.goal = null;
            if (g.onArrive) g.onArrive();
          } else {
            if (Math.abs(dx) > 1) this.dir = sign(dx);
            this.ensureMoveAnim(g.kind);
            this.x += this.dir * Math.min(speed * dt, Math.abs(dx));
          }
        }
      } else if (m === "fall") {
        this.stepFall(dt);
      }

      if (!AIRBORNE.has(this.mode)) this.y = this.floorY();

      // ไม่ได้ยุ่งอยู่กับอย่างอื่น และมีของเล่นที่ชอบวางอยู่ → ไปเล่น
      if (this.mode === "idle" || this.mode === "walk" || this.mode === "run" || this.mode === "sleep" || this.mode === "follow") {
        const toy = this.restingToy();
        if (toy) {
          if (this.floor) this.startFall();
          else this.startChase(toy);
        }
      }

      this.renderHome();
      this.positionBubble();
      this.render();
    }

    stepFall(dt) {
      const prevFeet = this.y + this.ch - MARGIN;
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      this.x += this.vx * dt;
      this.vx *= Math.pow(0.7, dt);
      const lo = this.hitW / 2;
      const hi = Math.max(lo, window.innerWidth - this.hitW / 2);
      if (this.x < lo) { this.x = lo; this.vx = -this.vx * 0.4; }
      if (this.x > hi) { this.x = hi; this.vx = -this.vx * 0.4; }
      if (this.y < 0) { this.y = 0; this.vy = Math.abs(this.vy) * 0.35; } // ชนเพดานจอ ไม่ให้ลอยหลุดจอ
      // ถูกโยนลงมาตรงของบนหน้าเว็บ → ลงจอดบนนั้น
      const feet = this.y + this.ch - MARGIN;
      if (this.vy > 0 && this.throwTargets.length) {
        for (const t of this.throwTargets) {
          if (prevFeet <= t.top + 4 && feet >= t.top && this.x >= t.left + 10 && this.x <= t.right - 10) {
            const p = this.platformBounds(t.el);
            if (p) {
              this.floor = p;
              this.x = this.clampX(this.x);
              this.y = this.floorY();
              this.vy = 0;
              this.vx = 0;
              this.throwTargets = [];
              this.startLand();
              return;
            }
          }
        }
      }
      if (this.y >= this.groundY()) {
        this.y = this.groundY();
        this.vy = 0;
        this.vx = 0;
        this.throwTargets = [];
        this.startLand();
      }
    }

    // ---------- ปฏิสัมพันธ์: กด / ลาก / โยน ----------
    // ความเร็วเมาส์ (px/วินาที) จากตัวอย่างล่าสุด ถ้าหยุดมือก่อนปล่อยจะได้ศูนย์
    releaseVelocity() {
      const now = performance.now();
      const recent = this.dragSamples.filter((s) => now - s.t < 120);
      this.dragSamples = [];
      if (recent.length < 2 || now - recent[recent.length - 1].t > 90) return { vx: 0, vy: 0 };
      const a = recent[0];
      const b = recent[recent.length - 1];
      const dt = Math.max(0.016, (b.t - a.t) / 1000);
      const cap = (v) => Math.max(-1500, Math.min(1500, v));
      return { vx: cap((b.x - a.x) / dt), vy: cap((b.y - a.y) / dt) };
    }

    attachPointer() {
      const hit = this.hit;
      hit.addEventListener("pointerdown", (e) => {
        hit.setPointerCapture(e.pointerId);
        this.dragSamples = [];
        this.pointerStart = {
          px: e.clientX, py: e.clientY, offX: e.clientX - this.x, offY: e.clientY - this.y, moved: false,
        };
      });
      hit.addEventListener("pointermove", (e) => {
        const ps = this.pointerStart;
        if (!ps) return;
        if (!ps.moved) {
          if (Math.hypot(e.clientX - ps.px, e.clientY - ps.py) < DRAG_THRESHOLD) return;
          ps.moved = true;
          clearTimeout(this.actionTimer);
          this.hideBubble();
          this.startDrag();
        }
        this.x = this.screenClampX(e.clientX - ps.offX);
        this.y = Math.min(Math.max(0, e.clientY - ps.offY), this.groundY());
        this.dragSamples.push({ t: performance.now(), x: e.clientX, y: e.clientY });
        if (this.dragSamples.length > 12) this.dragSamples.shift();
      });
      hit.addEventListener("pointerup", () => {
        const ps = this.pointerStart;
        if (!ps) return;
        this.pointerStart = null;
        if (ps.moved) {
          // ปล่อยตอนเมาส์กำลังเคลื่อนที่ = โยน ถ้าตรงกับของบนหน้าเว็บ จะลงจอดบนนั้น
          const v = this.releaseVelocity();
          this.startFall(v.vx, v.vy, Math.hypot(v.vx, v.vy) > 150 ? this.listPlatforms() : []);
          return;
        }
        clearTimeout(this.actionTimer);
        this.releaseToy();
        this.chase = null;
        this.startReact();
      });
      hit.addEventListener("pointercancel", () => {
        if (this.pointerStart && this.pointerStart.moved) this.startFall();
        this.pointerStart = null;
      });
    }

    onResize() {
      this.x = this.screenClampX(this.x);
      if (!this.floor && !AIRBORNE.has(this.mode) && this.mode !== "social") {
        if (this.y > this.groundY()) this.y = this.groundY();
        else if (this.y < this.groundY()) this.startFall();
      }
    }

    start() {
      this.y = this.groundY();
      this.startIdle();
      this.renderHome();
      this.render();
      this.actionTimer = setTimeout(() => this.chooseAction(), 1200);
    }
  }

  // ======================================================================
  //  ของเล่น (ใช้ร่วมกันทุกตัว)
  // ======================================================================
  function renderToy(t) {
    t.el.style.transform = `translate(${t.x - TOY_SIZE / 2}px, ${t.y}px) rotate(${t.rot}deg)`;
  }

  function removeToy(t) {
    t.alive = false;
    t.el.remove();
    const i = W.toys.indexOf(t);
    if (i >= 0) W.toys.splice(i, 1);
  }

  function spawnToy(kind) {
    if (!W.running || !TOY_EMOJI[kind]) return;
    while (W.toys.length >= MAX_TOYS) removeToy(W.toys[0]);
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
      claimedBy: null,
      born: performance.now(),
    };
    W.toys.push(t);
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
    for (const t of [...W.toys]) {
      if (t.removeAt && now > t.removeAt) {
        removeToy(t);
        continue;
      }
      // ไม่มีใครชอบของเล่นชิ้นนี้ เก็บทิ้งหลังวางไว้สักพัก
      if (t.state === "rest" && !t.removeAt && now - t.born > 25000 && !W.pets.some((p) => p.sp.likes.includes(t.kind))) {
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

  // ======================================================================
  //  เล่นด้วยกัน: หมาเข้าไปชวน → ผลัดกันวิ่งไล่จับ → นั่ง/นอนกอดกัน
  // ======================================================================
  function petOf(id) {
    return W.pets.find((p) => p.sp.id === id) || null;
  }

  function ensureDuo() {
    if (W.duo) return W.duo;
    const dog = SP.dog;
    const w = dog.cell[0] * dog.scale;
    const h = dog.cell[1] * dog.scale;
    const el = document.createElement("div");
    el.className = "duo";
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.display = "none";
    const sprite = document.createElement("div");
    sprite.className = "sprite";
    sprite.style.backgroundImage = `url("${chrome.runtime.getURL(`${dog.dir}/interact.png`)}")`;
    sprite.style.backgroundSize = `${w * dog.sheets.interact}px ${h}px`;
    el.appendChild(sprite);
    shadow.appendChild(el);
    W.duo = { el, sprite, w, h, shown: false };
    return W.duo;
  }

  function showDuo(x, y) {
    const d = ensureDuo();
    d.el.style.display = "";
    d.el.style.transform = `translate(${x - d.w / 2}px, ${y}px)`;
    d.shown = true;
  }

  function setDuoFrame(i) {
    const d = ensureDuo();
    d.sprite.style.backgroundPosition = `${-i * d.w}px 0`;
  }

  function hideDuo() {
    if (W.duo) {
      W.duo.el.style.display = "none";
      W.duo.shown = false;
    }
  }

  function canPlaydate() {
    const dog = petOf("dog");
    const cat = petOf("cat");
    if (!W.running || W.social || !dog || !cat) return false;
    const ok = new Set(["idle", "walk", "run", "sleep", "follow", "jump", "play", "react", "land"]);
    return [dog, cat].every((p) => ok.has(p.mode) && !p.floor && !p.panelOpen && !p.thinking);
  }

  // manual = ผู้ใช้สั่งเอง (ถ้าทำไม่ได้จะแจ้งเหตุผล)
  function startPlaydate(manual = false) {
    const dog = petOf("dog");
    const cat = petOf("cat");
    if (!dog || !cat) {
      const p = dog || cat;
      if (manual && p) p.say("ต้องมีทั้งน้องหมาและน้องแมวถึงจะเล่นด้วยกันได้", 2500);
      return false;
    }
    if (!canPlaydate()) {
      if (manual) (dog.mode === "inhome" ? dog : cat).say("ตอนนี้ยังไม่ว่างเล่นนะ ลองใหม่อีกสักครู่", 2000);
      return false;
    }
    dog.enterSocial();
    cat.enterSocial();
    const side = sign(cat.x - dog.x) || 1; // หมาเข้าไปหาแมวจากด้านที่อยู่
    cat.dir = -side; // แมวหันหน้ามาหาหมา
    cat.holdStill("idleA");
    dog.dir = side;
    dog.goTo({
      kind: "run",
      getX: () => cat.x - side * APPROACH_GAP,
      onArrive: () => {
        dog.dir = side;
        dog.holdStill("invite", { loop: false, hold: 0.8 });
        dog.say("โฮ่ง! เล่นกันเถอะ!", 1500);
        cat.holdStill("invite", { loop: false, hold: 0.4 });
        cat.say("เมี๊ยว~", 1200);
        W.social.phase = "invite";
        W.social.t = 0;
      },
    });
    W.social = { phase: "approach", t: 0, dog, cat, runner: cat, chaser: dog, swaps: 0, pause: 0, tagT: 0, cuddleStep: -1 };
    return true;
  }

  function cancelSocial() {
    const s = W.social;
    if (!s) return;
    W.social = null;
    hideDuo();
    for (const p of [s.dog, s.cat]) {
      p.root.classList.remove("hidden");
      if (p.mode === "social") {
        p.goal = null;
        p.startIdle();
        p.actionTimer = setTimeout(() => p.chooseAction(), 800);
      }
    }
  }

  function beginTag(s) {
    s.phase = "tag";
    s.tagT = 0;
    setRunnerGoal(s);
    setChaserGoal(s);
  }

  // ผู้ถูกไล่วิ่งหนีออกจากตัวที่ไล่
  function setRunnerGoal(s) {
    const { runner, chaser } = s;
    runner.goTo({
      kind: "run",
      speedMul: 0.85,
      tol: -1,
      getX: () => runner.x + sign(runner.x - chaser.x) * 220,
    });
  }

  // ผู้ไล่วิ่งตามไปจนจับได้
  function setChaserGoal(s) {
    const { runner, chaser } = s;
    chaser.goTo({
      kind: "run",
      speedMul: 1.2,
      tol: 8,
      getX: () => runner.x - sign(runner.x - chaser.x) * 46,
      onArrive: () => tagCaught(s),
    });
  }

  function tagCaught(s) {
    if (W.social !== s || s.phase !== "tag") return;
    s.swaps++;
    s.phase = "tagpause";
    s.pause = 0.9;
    // ผู้ไล่จับได้ → สลับบทบาท: ตัวที่จับได้กลายเป็นผู้ถูกไล่ และวิ่งหนีทันที (ได้ออกตัวก่อน)
    // ส่วนตัวที่ถูกจับยืนดีใจรอก่อนค่อยออกไล่
    [s.runner, s.chaser] = [s.chaser, s.runner];
    s.runner.say(s.runner.sp.id === "dog" ? "จับได้แล้ว! ตาเธอไล่นะ!" : "จับได้แล้ว~ ไล่ฉันสิ!", 900);
    setRunnerGoal(s);
    s.chaser.holdStill("happy", { loop: false });
  }

  function beginCuddle(s) {
    s.phase = "meet";
    s.t = 0;
    const { dog, cat } = s;
    const mid = Math.min(Math.max((dog.x + cat.x) / 2, 120), window.innerWidth - 120);
    s.mid = mid;
    s.arrived = 0;
    for (const [p, off] of [[dog, -30], [cat, 30]]) {
      p.goTo({
        kind: "walk",
        tol: 6,
        getX: () => mid + off,
        onArrive: () => {
          p.dir = -sign(off); // หันหน้าเข้าหากัน
          p.holdStill("idleA");
          s.arrived++;
        },
      });
    }
  }

  function startCuddleScene(s) {
    s.phase = "cuddle";
    s.t = 0;
    s.cuddleStep = -1;
    s.dog.root.classList.add("hidden");
    s.cat.root.classList.add("hidden");
    showDuo(s.mid, s.dog.groundY());
  }

  function finishSocial(s) {
    if (W.social !== s) return;
    W.social = null;
    hideDuo();
    for (const p of [s.dog, s.cat]) {
      p.root.classList.remove("hidden");
      p.mode = "react";
      p.goal = null;
      p.playAnim("happy", { loop: false, hold: 0.4, onEnd: () => p.chooseAction() });
    }
    s.dog.say("สนุกจัง! โฮ่ง!", 1600);
    s.cat.say("เมี๊ยว~ 💖", 1600);
    s.dog.spawnHearts();
    s.cat.spawnHearts();
  }

  function updateSocial(dt) {
    const s = W.social;
    if (!s) return;
    s.t += dt;
    if (s.phase === "approach") {
      if (s.t > 9) cancelSocial(); // เข้าไม่ถึง ยกเลิก
    } else if (s.phase === "invite") {
      if (s.t >= 1.7) beginTag(s);
    } else if (s.phase === "tag") {
      s.tagT += dt;
      if (s.swaps >= TAG_ROUNDS || s.tagT > TAG_MAX_SECONDS) beginCuddle(s);
    } else if (s.phase === "tagpause") {
      s.pause -= dt;
      if (s.pause <= 0) {
        if (s.swaps >= TAG_ROUNDS) {
          beginCuddle(s);
        } else {
          s.phase = "tag";
          setChaserGoal(s); // ผู้ถูกไล่ออกวิ่งไปแล้ว ตอนนี้ผู้ไล่ค่อยตามไป
        }
      }
    } else if (s.phase === "meet") {
      if (s.arrived >= 2) startCuddleScene(s);
      else if (s.t > 7) cancelSocial();
    } else if (s.phase === "cuddle") {
      const step = Math.min(DUO_SEQUENCE.length - 1, Math.floor((s.t / CUDDLE_SECONDS) * DUO_SEQUENCE.length));
      if (step !== s.cuddleStep) {
        s.cuddleStep = step;
        setDuoFrame(DUO_SEQUENCE[step]);
        if (step % 2 === 0) s.dog.spawnHearts(W.duo.el);
      }
      if (s.t >= CUDDLE_SECONDS) finishSocial(s);
    }
  }

  function scheduleSocial() {
    clearTimeout(W.socialTimer);
    W.socialTimer = setTimeout(() => {
      if (W.playdate && canPlaydate() && Math.random() < 0.6) startPlaydate(false);
      scheduleSocial();
    }, rand(35, 70) * 1000);
  }

  // ======================================================================
  //  แผง (โน้ต / เว็บที่จำไว้ / แชท) และการตั้งค่า
  // ======================================================================
  function speciesInfo(p) {
    return {
      id: p.sp.id, label: p.sp.label, emoji: p.sp.emoji,
      welcome: p.sp.chat.welcome, storageKey: p.sp.chat.storageKey,
    };
  }

  function openPanel(pet, tab) {
    if (!W.panel || !pet) return;
    if (W.panelPet && W.panelPet !== pet) W.panelPet.panelOpen = false;
    W.panelPet = pet;
    W.panel.open(tab, speciesInfo(pet), W.pets.map(speciesInfo));
  }

  function createPanel() {
    if (typeof WebPetPanel === "undefined") return;
    W.panel = WebPetPanel.create(shadow, {
      onOpenChange(open) {
        const pet = W.panelPet;
        if (!pet) return;
        pet.panelOpen = open;
        if (open) {
          pet.hideBubble();
          if (!AIRBORNE.has(pet.mode) && pet.mode !== "inhome" && pet.mode !== "social") {
            clearTimeout(pet.actionTimer);
            pet.startIdle();
            pet.actionTimer = setTimeout(() => pet.chooseAction(), 4000);
          }
        } else {
          clearTimeout(pet.actionTimer);
          pet.actionTimer = setTimeout(() => pet.chooseAction(), 600);
        }
      },
      onThinking(on) {
        const pet = W.panelPet;
        if (!pet) return;
        pet.thinking = on;
        if (on) {
          clearTimeout(pet.actionTimer);
          if (!AIRBORNE.has(pet.mode) && pet.mode !== "inhome" && pet.mode !== "social") {
            pet.mode = "think";
            pet.playAnim("think"); // ท่าสงสัย ?
          }
        } else if (pet.mode === "think") {
          pet.chooseAction();
        }
      },
      onReply() {
        const pet = W.panelPet;
        if (!pet || AIRBORNE.has(pet.mode) || pet.mode === "inhome" || pet.mode === "social") return;
        clearTimeout(pet.actionTimer);
        pet.mode = "react";
        pet.playAnim("happy", { loop: false, hold: 0.3, onEnd: () => pet.chooseAction() });
        pet.spawnHearts();
      },
      onNoteSaved() {
        if (!W.panelPet) return;
        W.panelPet.say("จดให้แล้วนะ 📝", 1500);
        W.panelPet.spawnHearts();
      },
      onSwitchSpecies(id) {
        const pet = petOf(id);
        if (!pet) return;
        if (W.panelPet && W.panelPet !== pet) {
          W.panelPet.panelOpen = false;
          W.panelPet.thinking = false;
          clearTimeout(W.panelPet.actionTimer);
          W.panelPet.actionTimer = setTimeout(() => W.panelPet && W.panelPet.chooseAction(), 600);
        }
        W.panelPet = pet;
        pet.panelOpen = true;
        return speciesInfo(pet);
      },
    });
  }

  function setWho(who) {
    try { chrome.storage.sync.set({ petWho: who }); } catch { /* ไม่เป็นไร */ }
  }

  // ----- เจ้าของเว็บที่จำไว้: ทักทายตอนกลับมา -----
  function greetOnce() {
    if (W.greeted || typeof WebPetPanel === "undefined") return;
    W.greeted = true;
    setTimeout(async () => {
      try {
        const v = await WebPetPanel.visit();
        const pet = W.pets[0];
        if (!v || !W.running || !pet) return;
        const notes = v.notes ? ` · 📝 ${v.notes} โน้ต` : "";
        pet.say(`กลับมาที่ ${v.site.title || v.site.host} อีกแล้ว! (ครั้งที่ ${v.site.visits})${notes}`, 4500, true);
      } catch {
        // อ่านข้อมูลไม่ได้ (เช่น extension ถูก reload) — ข้ามไป
      }
    }, 1800);
  }

  // ----- วงจรหลัก (rAF เดียวสำหรับทุกตัว) -----
  function loop(time) {
    const dt = Math.min(0.05, (time - W.lastTime) / 1000 || 0);
    W.lastTime = time;
    updateToys(dt, time);
    for (const p of [...W.pets]) p.frame(dt, time);
    updateSocial(dt);
    W.rafId = requestAnimationFrame(loop);
  }

  function startWorld() {
    if (W.running) return;
    W.running = true;
    document.documentElement.appendChild(host);
    if (!W.panel) createPanel();
    W.lastTime = performance.now();
    W.rafId = requestAnimationFrame(loop);
    scheduleSocial();
  }

  function stopWorld() {
    if (!W.running && !host.isConnected) return;
    W.running = false;
    cancelAnimationFrame(W.rafId);
    clearTimeout(W.socialTimer);
    cancelSocial();
    for (const t of [...W.toys]) removeToy(t);
    for (const p of [...W.pets]) p.destroy();
    W.pets = [];
    W.panelPet = null;
    if (W.panel) W.panel.close();
    host.remove();
  }

  function addPet(sp) {
    const x = rand(0.25, 0.75) * window.innerWidth;
    const pet = new Pet(sp, x);
    W.pets.push(pet);
    pet.start();
    pet.say(sp.id === "dog" ? "โฮ่ง! มาแล้ว! 🐶" : "เมี๊ยว~ 🐱", 1500);
    greetOnce();
    return pet;
  }

  function removePet(pet) {
    if (W.social && (W.social.dog === pet || W.social.cat === pet)) cancelSocial();
    for (const t of W.toys) if (t.claimedBy === pet) t.claimedBy = null;
    if (W.panelPet === pet) {
      W.panelPet = null;
      if (W.panel) W.panel.close();
    }
    pet.destroy();
    W.pets = W.pets.filter((p) => p !== pet);
  }

  // ----- ตั้งค่า (เก็บแบบ global ใช้ร่วมกันทุกเว็บ) และคำสั่งจาก popup -----
  const DEFAULTS = {
    petEnabled: true, petWho: "cat", petFollow: false, petClimb: true, petHome: true, petPlaydate: true,
    petHomeX: SP.cat.home.defaultFrac, petDogHomeX: SP.dog.home.defaultFrac,
  };

  function applySettings(s) {
    W.follow = s.petFollow === true;
    W.climb = s.petClimb !== false;
    W.home = s.petHome !== false;
    W.playdate = s.petPlaydate !== false;
    W.enabled = s.petEnabled !== false;
    if (!W.enabled) {
      stopWorld();
      return;
    }
    startWorld();

    const who = ["cat", "dog", "both"].includes(s.petWho) ? s.petWho : "cat";
    const want = who === "both" ? ["cat", "dog"] : [who];
    for (const p of [...W.pets]) if (!want.includes(p.sp.id)) removePet(p);
    for (const id of want) if (!petOf(id)) addPet(SP[id]);

    for (const p of W.pets) {
      const v = s[p.sp.home.key];
      if (typeof v === "number" && !p.homeDrag) p.homeFrac = Math.min(1, Math.max(0, v));
      if (!W.home) {
        p.pendingHome = false;
        if (p.mode === "inhome") p.exitHome();
        else if (p.mode === "gohome") p.chooseAction();
      }
      if (!W.climb && p.floor) p.startFall();
    }
  }

  window.addEventListener("resize", () => {
    for (const p of W.pets) p.onResize();
  });

  document.addEventListener(
    "mousemove",
    (e) => {
      W.mouseX = e.clientX;
    },
    { passive: true }
  );

  try {
    chrome.storage.sync.get(DEFAULTS, applySettings);
    chrome.storage.onChanged.addListener((changes, area) => {
      if (area !== "sync") return;
      chrome.storage.sync.get(DEFAULTS, applySettings);
    });
    chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
      if (!msg || !W.running) return;
      if (msg.type === "pet-toy") spawnToy(msg.kind);
      else if (msg.type === "pet-open") openPanel(petOf(msg.species) || W.pets[0], msg.tab || "chat");
      else if (msg.type === "pet-gohome") for (const p of W.pets) p.goHome();
      else if (msg.type === "pet-play") startPlaydate(true);
      else return;
      sendResponse({ ok: true }); // ไม่ตอบกลับ popup จะเห็น lastError
    });
  } catch {
    // extension ถูก reload ขณะหน้าเปิดค้าง — ไม่ต้องทำอะไร
  }
})();
