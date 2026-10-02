# Dark Mode Toggle

Chrome Extension (Manifest V3) สลับเว็บเป็นโหมดมืดในคลิกเดียว จำค่าแยกตามโดเมน

## ติดตั้งเพื่อทดสอบ
1. เปิด `chrome://extensions`
2. เปิด **Developer mode** (มุมขวาบน)
3. กด **Load unpacked** แล้วเลือกโฟลเดอร์นี้
4. เปิดเว็บใดก็ได้ → กดไอคอน extension → กดปุ่มเปิดโหมดมืด

## โครงสร้าง
- `manifest.json` – การตั้งค่า extension
- `content.js` – ฉีด CSS (invert + hue-rotate) เข้าหน้าเว็บ และฟังการเปลี่ยนค่า
- `popup.html/css/js` – ปุ่มสลับใน popup เก็บค่าด้วย `chrome.storage.sync`
