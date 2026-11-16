# Stamp Rally (prototype)

ผู้เล่นสะสมแสตมป์ครบ 8 บูธเพื่อแลกของรางวัล — **Vendor สแกน QR ของผู้เล่น** เพื่อมอบแสตมป์

Node 22.5+ (ใช้ `node:sqlite` ในตัว) · ไม่มี framework · หน้าเว็บ vanilla JS · PWA-friendly

## เริ่มใช้งาน
```bash
npm install
npm start            # http://localhost:3000  (จะพิมพ์ PIN ของ admin ตอนรันครั้งแรก)
npm test             # end-to-end smoke test
```
1. เข้า `/staff-login` ด้วย `admin` + PIN → `/admin` เพิ่มบูธ/ทีมงาน (ระบบแสดง username + PIN ครั้งเดียว)
2. บูธ/ทีมงานล็อกอินที่ `/staff-login` → ไปหน้า `/scan` อัตโนมัติ
3. ผู้เล่นเปิด `/` → เข้าสู่ระบบ → แสดง QR ให้บูธสแกน

## LINE Login
สร้าง LINE Login channel ที่ LINE Developers แล้วตั้ง Callback URL เป็น `${BASE_URL}/auth/line/callback`
```bash
LINE_CHANNEL_ID=... LINE_CHANNEL_SECRET=... BASE_URL=https://your.domain APP_SECRET=<random> npm start
```
ถ้าไม่ตั้ง LINE จะใช้ "dev login" (พิมพ์ชื่ออะไรก็ได้) สำหรับทดสอบ — ปิดได้โดยตั้ง LINE ครบและไม่ใส่ `DEV_LOGIN=1`

## Config (env)
`PORT` `BASE_URL` `APP_SECRET` `ADMIN_PIN` `REQUIRED_STAMPS`(8) `QR_TTL_SECONDS`(60) `DB_FILE` `DEV_LOGIN`

## หมายเหตุ production
- **ต้องใช้ HTTPS** ไม่งั้นเบราว์เซอร์ไม่ยอมเปิดกล้อง (localhost ยกเว้น)
- ตั้ง `APP_SECRET` คงที่ ไม่งั้น session หลุดทุกครั้งที่ restart
- Rate limit / รหัส 6 หลักเก็บใน memory → ใช้ได้กับ instance เดียว (หลาย instance ต้องย้ายไป Redis/DB)
- SQLite เหมาะกับงานอีเวนต์ขนาดเล็ก–กลาง; ย้ายไป Postgres ได้โดยแก้เฉพาะ `openDb` + query ใน `server.js`
