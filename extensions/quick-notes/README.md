# Quick Notes

Chrome Extension (Manifest V3) จดโน้ตเร็วๆ จาก popup เก็บด้วย `chrome.storage.local`

## ติดตั้งเพื่อทดสอบ
1. เปิด `chrome://extensions` และเปิด **Developer mode**
2. กด **Load unpacked** แล้วเลือกโฟลเดอร์นี้
3. กดไอคอน extension → พิมพ์โน้ต → กด **บันทึกโน้ต** (หรือ Ctrl+Enter)

## โครงสร้าง
- `manifest.json` – การตั้งค่า extension (ใช้ permission `storage`)
- `popup.html/css/js` – ช่องพิมพ์โน้ต รายการโน้ต และปุ่มลบ
