# Link Highlighter & Extractor

Chrome Extension (Manifest V3) ไฮไลต์ลิงก์ในหน้าเว็บ และดึงลิงก์ทั้งหมดมาดู กรอง copy หรือ export เป็น CSV

## ติดตั้งเพื่อทดสอบ
1. เปิด `chrome://extensions` และเปิด **Developer mode**
2. กด **Load unpacked** แล้วเลือกโฟลเดอร์นี้
3. เปิดเว็บใดก็ได้ → กดไอคอน extension → **ดึงลิงก์** หรือ **ไฮไลต์**

## ฟีเจอร์
- **ไฮไลต์** – ทำให้ลิงก์ทุกอันในหน้าเด่นเป็นสีเหลือง กดอีกครั้งเพื่อปิด
- **ดึงลิงก์** – รวบรวมลิงก์ http/https (ตัดลิงก์ซ้ำ) แสดงข้อความและ URL
- **กรอง** – พิมพ์เพื่อกรองตามข้อความหรือ URL
- **Copy** – คัดลอก URL ที่แสดงอยู่ (บรรทัดละลิงก์)
- **Export CSV** – บันทึกเป็น `links.csv` (คอลัมน์ text, url) รองรับภาษาไทยใน Excel

## โครงสร้าง
- `manifest.json` – ใช้ permission `activeTab` และ `scripting` (ทำงานเฉพาะแท็บที่กดใช้)
- `popup.html/css/js` – UI และสคริปต์ที่ฉีดเข้าหน้าเว็บด้วย `chrome.scripting.executeScript`
