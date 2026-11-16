export async function api(path, body) {
  const r = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(d.message || 'เกิดข้อผิดพลาด'); e.status = r.status; e.code = d.error; throw e; }
  return d;
}
export const $ = (s, el = document) => el.querySelector(s);
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function toast(msg, ok = true, ms = 3500) {
  document.querySelectorAll('.toast').forEach((t) => t.remove());
  const t = document.createElement('div'); t.className = `toast ${ok ? 'ok' : 'bad'}`; t.textContent = msg;
  document.body.append(t); setTimeout(() => t.remove(), ms);
}
export function qrSvg(text) {
  const qr = window.qrcode(0, 'M'); qr.addData(text); qr.make();
  return qr.createSvgTag({ cellSize: 6, margin: 0, scalable: true });
}
export async function logout() { await api('/api/logout', {}); location.href = '/'; }
