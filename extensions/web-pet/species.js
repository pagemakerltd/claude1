// ข้อมูลของสัตว์เลี้ยงแต่ละชนิด: แถบภาพ ท่าทาง คำพูด และบ้าน
// โหลดก่อน content.js (ใช้ global ร่วมกันใน isolated world ของ extension)
var WebPetSpecies = (() => {
  const range = (n) => Array.from({ length: n }, (_, i) => i);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];

  // ----- บ้านแมว -----
  const CAT_HOME = `
    <svg viewBox="0 0 120 100" width="112" height="100" shape-rendering="crispEdges" aria-hidden="true">
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

  // ----- กระท่อมหมา -----
  const DOG_HOME = `
    <svg viewBox="0 0 120 100" width="112" height="100" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="12" y="46" width="96" height="52" fill="#d9b98a" stroke="#7a5a32" stroke-width="3"/>
      <rect x="12" y="60" width="96" height="4" fill="#c9a874"/>
      <rect x="12" y="76" width="96" height="4" fill="#c9a874"/>
      <polygon points="2,50 60,8 118,50" fill="#4f7fbf" stroke="#2c4a7a" stroke-width="3"/>
      <polygon points="16,48 60,16 104,48" fill="#6a97d4"/>
      <g class="win" fill="#fff3c4" stroke="#7a5a32" stroke-width="2">
        <rect x="52" y="22" width="16" height="10" rx="2"/>
      </g>
      <path d="M40 98 V72 a20 20 0 0 1 40 0 V98 Z" fill="#43301f" stroke="#2b1d14" stroke-width="3"/>
      <g class="sleeper">
        <ellipse cx="48" cy="82" rx="6" ry="9" fill="#9a6b3f"/><ellipse cx="72" cy="82" rx="6" ry="9" fill="#9a6b3f"/>
        <ellipse cx="60" cy="88" rx="13" ry="10" fill="#f5e6cf"/>
        <ellipse cx="54" cy="85" rx="5" ry="6" fill="#c08a52"/>
        <path d="M53 90 q3 3 6 0 M62 90 q3 3 6 0" stroke="#2b1d14" stroke-width="2" fill="none"/>
        <circle cx="60" cy="94" r="2" fill="#2b1d14"/>
      </g>
      <ellipse cx="60" cy="99" rx="54" ry="2" fill="rgba(0,0,0,.18)"/>
    </svg>`;


  // ----- บ้านพลูโต -----
  const PLUTO_HOME = `
    <svg viewBox="0 0 120 100" width="112" height="100" shape-rendering="crispEdges" aria-hidden="true">
      <rect x="12" y="46" width="96" height="52" fill="#c9a779" stroke="#6b4f2c" stroke-width="3"/>
      <rect x="12" y="62" width="96" height="4" fill="#b8956a"/>
      <rect x="12" y="78" width="96" height="4" fill="#b8956a"/>
      <polygon points="2,50 60,8 118,50" fill="#3b4a6b" stroke="#222c45" stroke-width="3"/>
      <polygon points="16,48 60,16 104,48" fill="#51638a"/>
      <g class="win">
        <rect x="38" y="19" width="44" height="14" rx="3" fill="#fff3c4" stroke="#222c45" stroke-width="2"/>
        <text x="60" y="30" text-anchor="middle" font-family="system-ui, sans-serif" font-size="10" font-weight="700" fill="#222c45">PLUTO</text>
      </g>
      <path d="M40 98 V72 a20 20 0 0 1 40 0 V98 Z" fill="#2f2418" stroke="#1d160e" stroke-width="3"/>
      <g class="sleeper">
        <ellipse cx="47" cy="82" rx="6" ry="9" fill="#3a2d22"/><ellipse cx="73" cy="82" rx="6" ry="9" fill="#3a2d22"/>
        <ellipse cx="60" cy="88" rx="13" ry="10" fill="#d9b27a"/>
        <ellipse cx="60" cy="80" rx="10" ry="5" fill="#4a3a2c"/>
        <path d="M53 90 q3 3 6 0 M62 90 q3 3 6 0" stroke="#1d160e" stroke-width="2" fill="none"/>
        <circle cx="60" cy="94" r="2" fill="#1d160e"/>
      </g>
      <ellipse cx="60" cy="99" rx="54" ry="2" fill="rgba(0,0,0,.18)"/>
    </svg>`;

  // ----- แมว -----
  const cat = {
    id: "cat",
    label: "น้องแมว",
    emoji: "🐱",
    dir: "images/cat",
    cell: [234, 141],
    scale: 0.8,
    hit: [80, 74],
    sheets: {
      idle: 7, blink: 4, happy: 3, walk_right: 7, walk_left: 7, run_right: 6, run_left: 5,
      jump: 6, fall_land: 5, play: 5, special: 4, sit_lie: 8, emote: 11,
    },
    anims: {
      idleA: { sheet: "idle", seq: [0, 1, 0, 2, 0, 3, 0, 4, 5, 6, 5, 4], fps: 3 },
      idleB: { sheet: "blink", seq: [0, 0, 0, 0, 1, 0, 0, 0, 2, 0, 0, 3], fps: 3 },
      walkRight: { sheet: "walk_right", seq: range(6), fps: 9, flip: false },
      walkLeft: { sheet: "walk_left", seq: range(6), fps: 9, flip: false },
      runRight: { sheet: "run_right", seq: range(6), fps: 12, flip: false },
      runLeft: { sheet: "run_left", seq: range(5), fps: 12, flip: false },
      sleep: { sheet: "sit_lie", seq: [5, 6], fps: 1.2 },
      jump: { sheet: "jump", seq: range(6), fps: 8 },
      fly: { sheet: "jump", seq: [2, 3, 2, 3], fps: 8 },
      tumble: { sheet: "fall_land", seq: [0], fps: 1 },
      land: { sheet: "fall_land", seq: [1, 2, 3, 4], fps: 4 },
      play: { sheet: "play", seq: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4], fps: 6 },
      happy: { sheet: "happy", seq: [0, 1, 2, 1, 2], fps: 6 },
      think: { sheet: "special", seq: [1, 1], fps: 1 },
      invite: { sheet: "happy", seq: [0, 1, 2, 1, 2], fps: 6 }, // ตอบรับคำชวนเล่น
    },
    // ปฏิกิริยาตอนถูกกด (สุ่ม)
    reaction() {
      const r = Math.random();
      if (r < 0.4) return { sheet: "happy", seq: [0, 1, 2, 1, 2], fps: 6, hold: 0.5 };
      if (r < 0.65) return { sheet: "special", seq: [2, 2, 2], fps: 3, hold: 0.4 };
      return { sheet: "emote", seq: [pick([2, 3, 4, 8, 10]), 3], fps: 1.5, hold: 0.3 };
    },
    likes: ["yarn", "fish", "ball"],
    // ท่าเวลาเจอของเล่น: play = เล่น, eat = กิน (ซ่อนของเล่นจริงไว้ระหว่างทำท่า)
    toyAnim(kind) {
      if (kind === "fish") return { say: "อร่อย! 🐟", spec: { sheet: "happy", seq: [0, 1, 2, 1, 2, 1, 2], fps: 6, hold: 0.5 } };
      return { spec: { sheet: "play", seq: [0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 4], fps: 6, hold: 0.3 } };
    },
    phrases: [
      "เมี๊ยว~", "ลูบหัวหน่อยสิ", "หิวแล้วนะ 🐟", "จั๊กจี้~", "พักสายตาหน่อยมั้ย? 👀",
      "ดื่มน้ำหรือยัง? 💧", "อยากเล่นด้วยจัง", "ลากฉันไปไหนก็ได้นะ", "ยืดเส้นยืดสายหน่อยนะ 🙆",
    ],
    landSay: "เมี๊ยว!",
    wakeSay: ["หาวว~ ตื่นแล้ว", "นอนอิ่มแล้ว ✨", "เมี๊ยว~"],
    social: { invite: "เมี๊ยว! ไล่จับกันมั้ย?", accept: "เมี๊ยว~", caught: "จับได้แล้ว~ ไล่ฉันสิ!", done: "เมี๊ยว~ 💖" },
    arrive: "เมี๊ยว~ 🐱",
    home: { svg: CAT_HOME, w: 112, h: 100, key: "petHomeX", defaultFrac: 0.88 },
    chat: { storageKey: "petChat", welcome: "เมี๊ยว~ มีอะไรอยากคุยกับฉันมั้ย? 🐾" },
    iconPath: "images/cat/icon.png",
  };

  // ----- หมา -----
  const dog = {
    id: "dog",
    label: "น้องหมา",
    emoji: "🐶",
    dir: "images/dog",
    cell: [194, 119],
    scale: 0.8,
    hit: [74, 66],
    sheets: {
      idle: 7, blink: 3, happy: 5, sit: 4, lie: 4, sleep: 5, walk_right: 6, walk_left: 5,
      run_right: 4, run_left: 5, jump: 4, fall_land: 3, play: 4, hurt: 5, special: 6, emote: 8,
      interact: 5, toys: 5, eat: 3, drink: 2, tricks: 4,
    },
    anims: {
      idleA: { sheet: "idle", seq: [0, 1, 2, 1, 0, 2, 0, 3, 0], fps: 3 },
      idleB: { sheet: "blink", seq: [0, 0, 0, 1, 0, 0, 2, 0, 0], fps: 3 },
      walkRight: { sheet: "walk_right", seq: range(6), fps: 10, flip: false },
      walkLeft: { sheet: "walk_left", seq: range(5), fps: 10, flip: false },
      runRight: { sheet: "run_right", seq: range(4), fps: 12, flip: false },
      runLeft: { sheet: "run_left", seq: range(5), fps: 12, flip: false },
      sleep: { sheet: "sleep", seq: [1, 3], fps: 1.2 },
      jump: { sheet: "jump", seq: range(4), fps: 6 },
      fly: { sheet: "jump", seq: [1, 2, 1, 2], fps: 8 },
      tumble: { sheet: "fall_land", seq: [0], fps: 1 },
      land: { sheet: "fall_land", seq: [1, 2, 2, 1], fps: 4 },
      play: { sheet: "play", seq: [0, 1, 1, 0, 1, 2, 3, 2, 1], fps: 5 },
      happy: { sheet: "happy", seq: [0, 1, 2, 1, 4], fps: 6 },
      think: { sheet: "emote", seq: [3, 3], fps: 1 },
      invite: { sheet: "tricks", seq: [0], fps: 1 }, // ก้มตัวชวนเล่น (play bow)
    },
    reaction() {
      const r = Math.random();
      if (r < 0.4) return { sheet: "happy", seq: [0, 1, 2, 1, 4], fps: 6, hold: 0.5 };
      if (r < 0.6) return { sheet: "special", seq: [0, 0, 0], fps: 3, hold: 0.4 };
      if (r < 0.75) return { sheet: "tricks", seq: [2, 2, 2], fps: 4, hold: 0.3 };
      return { sheet: "emote", seq: [pick([1, 2, 6, 7]), 2], fps: 1.5, hold: 0.3 };
    },
    likes: ["bone", "ball", "fish"],
    toyAnim(kind) {
      if (kind === "bone") return { say: "แทะๆ 🦴", spec: { sheet: "toys", seq: [3, 3, 4, 3, 3, 4], fps: 3, hold: 0.5 } };
      if (kind === "fish") return { spec: { sheet: "toys", seq: [1, 2, 1, 2, 1, 2], fps: 3, hold: 0.4 } };
      return { spec: { sheet: "play", seq: [0, 1, 1, 0, 1, 2, 3, 2, 1, 0, 1, 1], fps: 5, hold: 0.3 } };
    },
    phrases: [
      "โฮ่ง! 🐶", "เล่นกันมั้ย?", "หิวข้าวแล้ว 🍖", "พาไปเดินเล่นหน่อยสิ", "ดื่มน้ำหรือยัง? 💧",
      "ดีใจจังเลย!", "ลูบหัวหน่อย~", "ยืดเส้นยืดสายหน่อยนะ 🙆",
    ],
    landSay: "โอ๊ย! โฮ่ง!",
    wakeSay: ["หาววว~ ตื่นแล้ว", "นอนอิ่มแล้ว ✨", "โฮ่ง!"],
    social: { invite: "โฮ่ง! เล่นกันเถอะ!", accept: "โฮ่ง!", caught: "จับได้แล้ว! ตาเธอไล่นะ!", done: "สนุกจัง! โฮ่ง!" },
    arrive: "โฮ่ง! มาแล้ว! 🐶",
    home: { svg: DOG_HOME, w: 112, h: 100, key: "petDogHomeX", defaultFrac: 0.12 },
    chat: { storageKey: "petChatDog", welcome: "โฮ่ง! มีอะไรอยากเล่าให้ฉันฟังมั้ย? 🐾" },
    iconPath: "images/dog/icon.png",
  };

  // ----- พลูโต (ยอร์คเชียร์เทอร์เรีย) -----
  const pluto = {
    id: "pluto",
    label: "พลูโต",
    emoji: "🐕",
    dir: "images/pluto",
    cell: [156, 135],
    scale: 0.85,
    hit: [76, 70],
    sheets: {
      idle: 5, blink: 3, happy: 3, sad: 3, angry: 2, walk_right: 7, walk_left: 7, run_right: 6, run_left: 6,
      jump: 6, fall_land: 5, play: 7, spin: 5, sleep: 4, emote: 6,
    },
    anims: {
      idleA: { sheet: "idle", seq: [0, 1, 2, 3, 4, 3, 2, 1], fps: 3 },
      idleB: { sheet: "blink", seq: [0, 0, 1, 0, 0, 2, 0, 0], fps: 3 },
      walkRight: { sheet: "walk_right", seq: range(7), fps: 10, flip: false },
      walkLeft: { sheet: "walk_left", seq: range(7), fps: 10, flip: false },
      runRight: { sheet: "run_right", seq: range(6), fps: 12, flip: false },
      runLeft: { sheet: "run_left", seq: range(6), fps: 12, flip: false },
      sleep: { sheet: "sleep", seq: [0, 2], fps: 1.2 },
      jump: { sheet: "jump", seq: range(4), fps: 6 },
      fly: { sheet: "jump", seq: [1, 3, 1, 3], fps: 8 },
      tumble: { sheet: "fall_land", seq: [0], fps: 1 },
      land: { sheet: "fall_land", seq: [1, 2, 3, 4], fps: 4 },
      play: { sheet: "play", seq: [0, 1, 0, 1, 2, 3, 4, 5, 6], fps: 6 },
      happy: { sheet: "happy", seq: [0, 1, 2, 1], fps: 6 },
      think: { sheet: "emote", seq: [2, 2], fps: 1 },
      invite: { sheet: "happy", seq: [0, 1, 0, 1], fps: 6 },
    },
    reaction() {
      const r = Math.random();
      if (r < 0.35) return { sheet: "happy", seq: [0, 1, 2, 1], fps: 6, hold: 0.5 };
      if (r < 0.6) return { sheet: "spin", seq: [0, 1, 2, 3, 4], fps: 5, hold: 0.3 };
      if (r < 0.7) return { sheet: "play", seq: [2, 3, 4, 5, 4, 3], fps: 8, hold: 0.2 }; // หมุนตัวเป็นวง
      return { sheet: "emote", seq: [pick([0, 1, 3, 4, 5]), 1], fps: 1.5, hold: 0.3 };
    },
    likes: ["ball", "bone", "fish"],
    toyAnim(kind) {
      if (kind === "ball") return { say: "จับได้แล้ว! 🎾", spec: { sheet: "play", seq: [0, 1, 0, 1, 2, 3, 4, 5, 6], fps: 6, hold: 0.3 } };
      if (kind === "bone") return { say: "แทะๆ 🦴", spec: { sheet: "happy", seq: [0, 1, 2, 1, 0, 1, 2, 1], fps: 5, hold: 0.4 } };
      return { spec: { sheet: "spin", seq: [0, 1, 2, 3, 4], fps: 5, hold: 0.3 } };
    },
    phrases: [
      "โฮ่ง! พลูโตมาแล้ว 🐾", "เล่นลูกบอลกันมั้ย? 🎾", "พลูโตรักเธอนะ 💖", "ลูบหัวพลูโตหน่อย~",
      "พลูโตหิวแล้ว 🦴", "ดื่มน้ำหรือยัง? 💧", "พาพลูโตไปเดินเล่นหน่อยสิ", "ยืดเส้นยืดสายหน่อยนะ 🙆",
    ],
    landSay: "โอ๊ย! ไม่เป็นไร!",
    wakeSay: ["หาววว~ พลูโตตื่นแล้ว", "นอนอิ่มแล้ว ✨", "โฮ่ง!"],
    social: { invite: "โฮ่ง โฮ่ง! พลูโตชวนเล่น!", accept: "โฮ่ง!", caught: "จับได้แล้ว! ไล่พลูโตสิ!", done: "พลูโตสนุกจัง! 💖" },
    arrive: "โฮ่ง! พลูโตมาแล้ว! 🐕",
    home: { svg: PLUTO_HOME, w: 112, h: 100, key: "petPlutoHomeX", defaultFrac: 0.5 },
    chat: { storageKey: "petChatPluto", welcome: "โฮ่ง โฮ่ง! พลูโตเองนะ มีอะไรจะเล่าให้ฟังมั้ย? 🐾" },
    iconPath: "images/pluto/icon.png",
  };

  return { cat, dog, pluto, list: [cat, dog, pluto] };
})();
