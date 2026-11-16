// End-to-end smoke test: user QR -> vendor stamps x8 -> staff redeems. Run: npm test
import assert from 'node:assert/strict';
process.env.APP_SECRET = 't'; process.env.ADMIN_PIN = '123456'; process.env.PORT = '0';
const { openDb, createApp } = await import('../server.js');
const srv = createApp(openDb(':memory:'));
await new Promise((r) => srv.listen(0, r));
const base = `http://localhost:${srv.address().port}`;

const client = () => {
  let sid = '';
  return async (path, body) => {
    const r = await fetch(base + path, { method: body === undefined ? 'GET' : 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: sid }, body: body === undefined ? undefined : JSON.stringify(body) });
    const m = (r.headers.getSetCookie?.() || []).find((c) => c.startsWith('sid=')); if (m) sid = m.split(';')[0];
    return { status: r.status, ...(await r.json()) };
  };
};
const admin = client(), staff = client(), anon = client();
assert.equal((await admin('/api/login', { username: 'admin', pin: '000000' })).status, 401, 'bad pin rejected');
assert.equal((await admin('/api/login', { username: 'admin', pin: '123456' })).role, 'admin');

const vendors = [];
for (let i = 1; i <= 8; i++) {
  const v = await admin('/api/admin/vendors', { name: `Booth ${i}`, booth: `A${i}` });
  const c = client(); assert.equal((await c('/api/login', { username: v.username, pin: v.pin })).role, 'vendor');
  vendors.push(c);
}
const s = await admin('/api/admin/staff', { name: 'Desk' });
await staff('/api/login', { username: s.username, pin: s.pin });

const player = client();
await player('/api/dev-login', { name: 'Somchai' });
assert.equal((await anon('/api/me/card')).status, 401);
assert.equal((await player('/api/vendor/stamp', {})).status, 403, 'user cannot stamp');

const qr = () => player('/api/me/qr');
for (let i = 0; i < 8; i++) {
  const r = await vendors[i]('/api/vendor/stamp', { token: (await qr()).token });
  assert.equal(r.count, i + 1);
  if (i === 0) {
    assert.equal((await vendors[0]('/api/vendor/stamp', { token: (await qr()).token })).error, 'duplicate', 'same vendor twice blocked');
  }
  if (i < 7) assert.equal((await staff('/api/staff/redeem', { token: (await qr()).token })).error, 'not_complete');
}
assert.equal((await vendors[0]('/api/vendor/stamp', { token: 'garbage.sig' })).error, 'invalid_qr');
assert.equal((await vendors[0]('/api/vendor/stamp', { code: (await qr()).code })).status, 409, 'manual code resolves to user');
assert.equal((await vendors[0]('/api/staff/redeem', { token: (await qr()).token })).status, 403, 'vendor cannot redeem');

const card = await player('/api/me/card'); assert.ok(card.complete && !card.redeemed);
assert.equal((await staff('/api/staff/redeem', { code: (await qr()).code })).ok, true);
assert.equal((await staff('/api/staff/redeem', { token: (await qr()).token })).error, 'already_redeemed');
assert.equal((await player('/api/me/card')).redeemed, true);

const o = await admin('/api/admin/overview');
assert.deepEqual([o.players, o.stamps, o.completed, o.redeemed], [1, 8, 1, 1]);
const t = await admin('/api/admin/vendors/toggle', { id: o.vendors[1].id });
assert.equal(t.is_active, 0);
assert.equal((await vendors[1]('/api/me')).status, 401, 'disabled vendor locked out');
console.log('✓ all smoke tests passed'); srv.close();
