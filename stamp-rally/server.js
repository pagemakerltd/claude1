// Stamp Rally — prototype server (Node 22+, no framework, SQLite built in)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env = process.env;
const PORT = Number(env.PORT || 3000);
const BASE_URL = env.BASE_URL || `http://localhost:${PORT}`;
const REQUIRED = Number(env.REQUIRED_STAMPS || 8);
const QR_TTL = Number(env.QR_TTL_SECONDS || 60);
const SESSION_TTL = 12 * 3600;
const SECRET = env.APP_SECRET || crypto.randomBytes(32).toString('hex');
const LINE_ID = env.LINE_CHANNEL_ID, LINE_SECRET = env.LINE_CHANNEL_SECRET;
const LINE_ON = Boolean(LINE_ID && LINE_SECRET);
const DEV_LOGIN = env.DEV_LOGIN === '1' || !LINE_ON; // no LINE creds => dev login
const isHttps = BASE_URL.startsWith('https');

if (!env.APP_SECRET) console.warn('! APP_SECRET not set — sessions reset on restart. Set it in production.');

// ---------- DB ----------
export function openDb(file) {
  if (file !== ':memory:') fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    CREATE TABLE IF NOT EXISTS users(
      id INTEGER PRIMARY KEY, line_id TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
      avatar_url TEXT, created_at TEXT DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS vendors(
      id INTEGER PRIMARY KEY, name TEXT NOT NULL, booth TEXT,
      is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS accounts(
      id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL, pin_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('vendor','staff','admin')),
      vendor_id INTEGER REFERENCES vendors(id), name TEXT,
      is_active INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS stamps(
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id),
      vendor_id INTEGER NOT NULL REFERENCES vendors(id),
      stamped_by INTEGER NOT NULL REFERENCES accounts(id),
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(user_id, vendor_id));
    CREATE TABLE IF NOT EXISTS redemptions(
      id INTEGER PRIMARY KEY,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
      redeemed_by INTEGER NOT NULL REFERENCES accounts(id),
      redeemed_at TEXT DEFAULT CURRENT_TIMESTAMP);
  `);
  return db;
}

// ---------- crypto helpers ----------
const b64u = (b) => Buffer.from(b).toString('base64url');
const sign = (data) => crypto.createHmac('sha256', SECRET).update(data).digest('base64url');
function makeToken(payload) { const p = b64u(JSON.stringify(payload)); return `${p}.${sign(p)}`; }
function readToken(tok) {
  if (typeof tok !== 'string') return null;
  const [p, s] = tok.split('.');
  if (!p || !s) return null;
  const good = sign(p);
  if (s.length !== good.length || !crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good))) return null;
  try {
    const d = JSON.parse(Buffer.from(p, 'base64url').toString());
    return d.exp > Date.now() / 1000 ? d : null;
  } catch { return null; }
}
const hashPin = (pin, salt = crypto.randomBytes(8).toString('hex')) =>
  `${salt}:${crypto.scryptSync(String(pin), salt, 32).toString('hex')}`;
function checkPin(pin, stored) {
  const [salt, h] = stored.split(':');
  const a = Buffer.from(h, 'hex'), b = crypto.scryptSync(String(pin), salt, 32);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- app ----------
export function createApp(db) {
  const q = (sql, ...a) => db.prepare(sql).get(...a);
  const qa = (sql, ...a) => db.prepare(sql).all(...a);
  const run = (sql, ...a) => db.prepare(sql).run(...a);

  // short manual codes (fallback if camera can't scan): code -> {u, exp}
  const codes = new Map();
  const newCode = (userId) => {
    for (const [c, v] of codes) if (v.exp < Date.now() / 1000 || v.u === userId) codes.delete(c);
    let c; do { c = String(crypto.randomInt(0, 1e6)).padStart(6, '0'); } while (codes.has(c));
    codes.set(c, { u: userId, exp: Date.now() / 1000 + QR_TTL });
    return c;
  };

  // simple in-memory rate limit: max N hits / window per key
  const hits = new Map();
  const recent = (key, windowSec) => { const now = Date.now() / 1000; return (hits.get(key) || []).filter((t) => t > now - windowSec); };
  const record = (key) => hits.set(key, [...recent(key, 3600), Date.now() / 1000]);
  const limited = (key, max, windowSec) => { record(key); return recent(key, windowSec).length > max; };

  // seed admin on first run
  if (!q(`SELECT 1 FROM accounts WHERE role='admin'`)) {
    const pin = env.ADMIN_PIN || String(crypto.randomInt(100000, 999999));
    run(`INSERT INTO accounts(username,pin_hash,role,name) VALUES('admin',?, 'admin','Admin')`, hashPin(pin));
    console.log(`\n  Admin account created → username: admin   PIN: ${pin}\n`);
  }

  // ----- sessions -----
  const setSession = (res, sess) => {
    const v = makeToken({ ...sess, exp: Math.floor(Date.now() / 1000) + SESSION_TTL });
    addCookie(res, `sid=${v}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL}${isHttps ? '; Secure' : ''}`);
  };
  const addCookie = (res, c) => res.setHeader('Set-Cookie', [...(res.getHeader('Set-Cookie') || []), c]);
  const cookies = (req) => Object.fromEntries((req.headers.cookie || '').split(/;\s*/).filter(Boolean)
    .map((c) => { const i = c.indexOf('='); return [c.slice(0, i), c.slice(i + 1)]; }));
  const session = (req) => readToken(cookies(req).sid);

  const reply = (res, status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  class HttpError extends Error { constructor(s, code, msg) { super(msg || code); this.s = s; this.code = code; } }
  const fail = (s, code, msg) => { throw new HttpError(s, code, msg); };

  function auth(req, ...roles) {
    const s = session(req);
    if (!s) fail(401, 'unauthenticated', 'กรุณาเข้าสู่ระบบ');
    if (s.kind === 'user') {
      if (roles.length && !roles.includes('user')) fail(403, 'forbidden', 'ไม่มีสิทธิ์');
      const u = q(`SELECT * FROM users WHERE id=?`, s.id);
      if (!u) fail(401, 'unauthenticated', 'กรุณาเข้าสู่ระบบ');
      return { kind: 'user', user: u };
    }
    const a = q(`SELECT * FROM accounts WHERE id=? AND is_active=1`, s.id);
    if (!a) fail(401, 'unauthenticated', 'กรุณาเข้าสู่ระบบ');
    if (roles.length && !roles.includes(a.role)) fail(403, 'forbidden', 'ไม่มีสิทธิ์');
    return { kind: 'account', account: a };
  }

  // resolve a scanned token / manual code to a user row
  function resolveUser({ token, code }) {
    let userId;
    if (token) {
      const d = readToken(token);
      if (!d || d.t !== 'uqr') fail(400, 'invalid_qr', 'QR ไม่ถูกต้องหรือหมดอายุ — ให้ผู้เล่นรีเฟรชแล้วสแกนใหม่');
      userId = d.u;
    } else if (code) {
      const c = codes.get(String(code).trim());
      if (!c || c.exp < Date.now() / 1000) fail(400, 'invalid_code', 'รหัสไม่ถูกต้องหรือหมดอายุ');
      userId = c.u;
    } else fail(400, 'invalid_qr', 'ไม่พบ QR');
    const u = q(`SELECT * FROM users WHERE id=?`, userId);
    if (!u) fail(404, 'no_user', 'ไม่พบผู้เล่น');
    return u;
  }

  const cardOf = (userId) => {
    const stamps = qa(`SELECT s.created_at, v.id vendor_id, v.name vendor, v.booth
                       FROM stamps s JOIN vendors v ON v.id=s.vendor_id
                       WHERE s.user_id=? ORDER BY s.id`, userId);
    const r = q(`SELECT redeemed_at FROM redemptions WHERE user_id=?`, userId);
    return { required: REQUIRED, count: stamps.length, stamps, complete: stamps.length >= REQUIRED,
             redeemed: Boolean(r), redeemed_at: r?.redeemed_at || null };
  };

  const pub = (u) => ({ id: u.id, name: u.name, avatar_url: u.avatar_url });
  const newUsername = (prefix) => `${prefix}${crypto.randomInt(1000, 9999)}`;
  const newPin = () => String(crypto.randomInt(100000, 999999));

  // ---------- routes: [method, path] -> handler(req, res, body, url) ----------
  const routes = {
    'GET /api/config': () => ({ required: REQUIRED, line: LINE_ON, dev_login: DEV_LOGIN, qr_ttl: QR_TTL }),

    'GET /api/me': (req) => {
      const a = auth(req);
      return a.kind === 'user'
        ? { role: 'user', user: pub(a.user) }
        : { role: a.account.role, name: a.account.name,
            vendor: a.account.vendor_id ? q(`SELECT id,name,booth FROM vendors WHERE id=?`, a.account.vendor_id) : null };
    },

    // --- user ---
    'GET /api/me/card': (req) => { const { user } = auth(req, 'user'); return { user: pub(user), ...cardOf(user.id) }; },
    'GET /api/me/qr': (req) => {
      const { user } = auth(req, 'user');
      const exp = Math.floor(Date.now() / 1000) + QR_TTL;
      return { token: makeToken({ t: 'uqr', u: user.id, n: crypto.randomBytes(4).toString('hex'), exp }),
               code: newCode(user.id), expires_at: exp, ttl: QR_TTL };
    },

    // --- vendor: stamp a user ---
    'POST /api/vendor/stamp': (req, _r, body) => {
      const { account } = auth(req, 'vendor');
      if (limited(`stamp:${account.id}`, 60, 60)) fail(429, 'rate_limited', 'สแกนถี่เกินไป รอสักครู่');
      const v = q(`SELECT * FROM vendors WHERE id=? AND is_active=1`, account.vendor_id);
      if (!v) fail(403, 'vendor_inactive', 'บูธนี้ถูกปิดใช้งาน');
      const user = resolveUser(body);
      if (q(`SELECT 1 FROM redemptions WHERE user_id=?`, user.id))
        fail(409, 'already_redeemed', `${user.name} แลกของรางวัลไปแล้ว`);
      try {
        run(`INSERT INTO stamps(user_id,vendor_id,stamped_by) VALUES(?,?,?)`, user.id, v.id, account.id);
      } catch (e) {
        if (String(e.message).includes('UNIQUE')) {
          fail(409, 'duplicate', `${user.name} ได้แสตมป์จากบูธนี้ไปแล้ว`);
        }
        throw e;
      }
      const c = cardOf(user.id);
      return { ok: true, user: pub(user), count: c.count, required: c.required, complete: c.complete };
    },
    'POST /api/vendor/lookup': (req, _r, body) => { // preview who the QR belongs to (no side effects)
      auth(req, 'vendor', 'staff');
      const user = resolveUser(body); const c = cardOf(user.id);
      return { user: pub(user), count: c.count, required: c.required, complete: c.complete, redeemed: c.redeemed };
    },
    'GET /api/vendor/today': (req) => {
      const { account } = auth(req, 'vendor');
      const r = q(`SELECT COUNT(*) n FROM stamps WHERE vendor_id=? AND date(created_at)=date('now')`, account.vendor_id);
      const total = q(`SELECT COUNT(*) n FROM stamps WHERE vendor_id=?`, account.vendor_id);
      const recent = qa(`SELECT u.name, s.created_at FROM stamps s JOIN users u ON u.id=s.user_id
                         WHERE s.vendor_id=? ORDER BY s.id DESC LIMIT 8`, account.vendor_id);
      return { today: r.n, total: total.n, recent };
    },

    // --- staff: redeem prize ---
    'POST /api/staff/redeem': (req, _r, body) => {
      const { account } = auth(req, 'staff', 'admin');
      if (limited(`redeem:${account.id}`, 30, 60)) fail(429, 'rate_limited', 'สแกนถี่เกินไป รอสักครู่');
      const user = resolveUser(body);
      const c = cardOf(user.id);
      if (c.redeemed) fail(409, 'already_redeemed', `${user.name} แลกของรางวัลไปแล้วเมื่อ ${c.redeemed_at}`);
      if (!c.complete) fail(409, 'not_complete', `${user.name} ยังสะสมไม่ครบ (${c.count}/${c.required})`);
      run(`INSERT INTO redemptions(user_id,redeemed_by) VALUES(?,?)`, user.id, account.id);
      return { ok: true, user: pub(user) };
    },

    // --- staff/vendor login (username + PIN) ---
    'POST /api/login': (req, res, body) => {
      const ip = req.socket.remoteAddress;
      // only FAILED attempts count (venues share one wifi/NAT IP)
      if (recent(`login:${ip}`, 60).length >= 10) fail(429, 'rate_limited', 'ลองเข้าสู่ระบบบ่อยเกินไป รอสักครู่');
      const a = q(`SELECT * FROM accounts WHERE username=? AND is_active=1`, String(body.username || '').trim().toLowerCase());
      if (!a || !checkPin(body.pin || '', a.pin_hash)) { record(`login:${ip}`); fail(401, 'bad_credentials', 'ชื่อผู้ใช้หรือ PIN ไม่ถูกต้อง'); }
      setSession(res, { kind: 'account', id: a.id });
      return { ok: true, role: a.role };
    },
    'POST /api/logout': (_q, res) => {
      addCookie(res, 'sid=; HttpOnly; Path=/; Max-Age=0'); return { ok: true };
    },

    // --- dev login (only when LINE is not configured, or DEV_LOGIN=1) ---
    'POST /api/dev-login': (_q, res, body) => {
      if (!DEV_LOGIN) fail(404, 'not_found');
      const name = String(body.name || '').trim().slice(0, 40);
      if (!name) fail(400, 'bad_request', 'กรุณาใส่ชื่อ');
      const lineId = `dev:${name.toLowerCase()}`;
      run(`INSERT INTO users(line_id,name) VALUES(?,?) ON CONFLICT(line_id) DO NOTHING`, lineId, name);
      setSession(res, { kind: 'user', id: q(`SELECT id FROM users WHERE line_id=?`, lineId).id });
      return { ok: true };
    },

    // --- admin ---
    'GET /api/admin/overview': (req) => {
      auth(req, 'admin');
      return {
        required: REQUIRED,
        players: q(`SELECT COUNT(*) n FROM users`).n,
        stamps: q(`SELECT COUNT(*) n FROM stamps`).n,
        completed: q(`SELECT COUNT(*) n FROM (SELECT user_id FROM stamps GROUP BY user_id HAVING COUNT(*)>=?)`, REQUIRED).n,
        redeemed: q(`SELECT COUNT(*) n FROM redemptions`).n,
        vendors: qa(`SELECT v.id, v.name, v.booth, v.is_active,
                       (SELECT COUNT(*) FROM stamps s WHERE s.vendor_id=v.id) stamps,
                       (SELECT username FROM accounts a WHERE a.vendor_id=v.id LIMIT 1) username
                     FROM vendors v ORDER BY v.id`),
        staff: qa(`SELECT id, username, name, is_active FROM accounts WHERE role='staff' ORDER BY id`),
      };
    },
    'POST /api/admin/vendors': (req, _r, body) => {
      auth(req, 'admin');
      const name = String(body.name || '').trim().slice(0, 60);
      if (!name) fail(400, 'bad_request', 'กรุณาใส่ชื่อบูธ');
      const vid = Number(run(`INSERT INTO vendors(name,booth) VALUES(?,?)`, name, String(body.booth || '').slice(0, 20)).lastInsertRowid);
      let username; do { username = newUsername('v'); } while (q(`SELECT 1 FROM accounts WHERE username=?`, username));
      const pin = newPin();
      run(`INSERT INTO accounts(username,pin_hash,role,vendor_id,name) VALUES(?,?, 'vendor',?,?)`, username, hashPin(pin), vid, name);
      return { ok: true, vendor_id: vid, username, pin }; // PIN shown once
    },
    'POST /api/admin/staff': (req, _r, body) => {
      auth(req, 'admin');
      const name = String(body.name || '').trim().slice(0, 60) || 'Staff';
      let username; do { username = newUsername('s'); } while (q(`SELECT 1 FROM accounts WHERE username=?`, username));
      const pin = newPin();
      run(`INSERT INTO accounts(username,pin_hash,role,name) VALUES(?,?, 'staff',?)`, username, hashPin(pin), name);
      return { ok: true, username, pin };
    },
    'POST /api/admin/vendors/toggle': (req, _r, body) => {
      auth(req, 'admin');
      const v = q(`SELECT * FROM vendors WHERE id=?`, Number(body.id));
      if (!v) fail(404, 'not_found', 'ไม่พบบูธ');
      const next = v.is_active ? 0 : 1;
      run(`UPDATE vendors SET is_active=? WHERE id=?`, next, v.id);
      run(`UPDATE accounts SET is_active=? WHERE vendor_id=?`, next, v.id);
      return { ok: true, is_active: next };
    },
    'POST /api/admin/accounts/reset-pin': (req, _r, body) => {
      auth(req, 'admin');
      const a = q(`SELECT * FROM accounts WHERE username=? AND role!='admin'`, String(body.username || ''));
      if (!a) fail(404, 'not_found', 'ไม่พบบัญชี');
      const pin = newPin();
      run(`UPDATE accounts SET pin_hash=? WHERE id=?`, hashPin(pin), a.id);
      return { ok: true, username: a.username, pin };
    },
  };

  // ---------- LINE Login (OAuth 2.1 / OIDC-style web login) ----------
  async function lineStart(req, res) {
    if (!LINE_ON) fail(404, 'not_found', 'LINE Login ยังไม่ได้ตั้งค่า');
    const state = crypto.randomBytes(16).toString('hex');
    addCookie(res, `st=${state}; HttpOnly; SameSite=Lax; Path=/; Max-Age=600${isHttps ? '; Secure' : ''}`);
    const u = new URL('https://access.line.me/oauth2/v2.1/authorize');
    u.search = new URLSearchParams({ response_type: 'code', client_id: LINE_ID,
      redirect_uri: `${BASE_URL}/auth/line/callback`, state, scope: 'profile openid' }).toString();
    res.writeHead(302, { Location: u.toString() }); res.end();
  }
  async function lineCallback(req, res, url) {
    const st = cookies(req).st, p = url.searchParams;
    if (!LINE_ON || !st || st !== p.get('state') || !p.get('code')) fail(400, 'bad_request', 'การเข้าสู่ระบบไม่สำเร็จ');
    const tok = await (await fetch('https://api.line.me/oauth2/v2.1/token', {
      method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'authorization_code', code: p.get('code'),
        redirect_uri: `${BASE_URL}/auth/line/callback`, client_id: LINE_ID, client_secret: LINE_SECRET }),
    })).json();
    if (!tok.access_token) fail(400, 'line_error', 'LINE ปฏิเสธการเข้าสู่ระบบ');
    const prof = await (await fetch('https://api.line.me/v2/profile', { headers: { Authorization: `Bearer ${tok.access_token}` } })).json();
    if (!prof.userId) fail(400, 'line_error', 'อ่านโปรไฟล์ LINE ไม่ได้');
    run(`INSERT INTO users(line_id,name,avatar_url) VALUES(?,?,?)
         ON CONFLICT(line_id) DO UPDATE SET name=excluded.name, avatar_url=excluded.avatar_url`,
      prof.userId, prof.displayName || 'Player', prof.pictureUrl || null);
    setSession(res, { kind: 'user', id: q(`SELECT id FROM users WHERE line_id=?`, prof.userId).id });
    res.writeHead(302, { Location: '/' }); res.end();
  }

  // ---------- static ----------
  const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
    '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
  const LIBS = { '/vendor/qrcode.js': 'node_modules/qrcode-generator/dist/qrcode.js',
                 '/vendor/jsqr.js': 'node_modules/jsqr/dist/jsQR.js' };
  const PAGES = { '/': 'index.html', '/scan': 'scan.html', '/admin': 'admin.html', '/staff-login': 'login.html' };
  function serveStatic(req, res, pathname) {
    let file;
    if (LIBS[pathname]) file = path.join(__dirname, LIBS[pathname]);
    else {
      const rel = PAGES[pathname] || pathname.slice(1);
      file = path.join(__dirname, 'public', rel);
      if (!file.startsWith(path.join(__dirname, 'public') + path.sep)) return reply(res, 403, { error: 'forbidden' });
    }
    fs.readFile(file, (err, data) => {
      if (err) return reply(res, 404, { error: 'not_found' });
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
        'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
      res.end(data);
    });
  }

  const readBody = (req) => new Promise((resolve, reject) => {
    let s = ''; req.on('data', (c) => { s += c; if (s.length > 1e5) { reject(new HttpError(413, 'too_large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new HttpError(400, 'bad_json', 'ข้อมูลไม่ถูกต้อง')); } });
  });

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, BASE_URL);
    try {
      if (req.method === 'GET' && url.pathname === '/auth/line') return await lineStart(req, res);
      if (req.method === 'GET' && url.pathname === '/auth/line/callback') return await lineCallback(req, res, url);
      const h = routes[`${req.method} ${url.pathname}`];
      if (h) {
        // CSRF guard: state-changing requests must be same-origin JSON
        if (req.method === 'POST') {
          const o = req.headers.origin;
          if (o && new URL(o).host !== new URL(BASE_URL).host && new URL(o).host !== req.headers.host) fail(403, 'forbidden', 'cross-origin');
        }
        const body = req.method === 'POST' ? await readBody(req) : {};
        return reply(res, 200, await h(req, res, body, url));
      }
      if (url.pathname.startsWith('/api/')) return reply(res, 404, { error: 'not_found' });
      if (req.method === 'GET') return serveStatic(req, res, url.pathname);
      reply(res, 405, { error: 'method_not_allowed' });
    } catch (e) {
      if (e instanceof HttpError) return reply(res, e.s, { error: e.code, message: e.message });
      console.error(e); reply(res, 500, { error: 'server_error', message: 'เกิดข้อผิดพลาด ลองใหม่อีกครั้ง' });
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const db = openDb(env.DB_FILE || path.join(__dirname, 'data', 'stamp.db'));
  createApp(db).listen(PORT, () => {
    console.log(`Stamp Rally running at ${BASE_URL}`);
    console.log(LINE_ON ? '  LINE Login: enabled' : '  LINE Login: not configured → using dev login (any name)');
  });
}
