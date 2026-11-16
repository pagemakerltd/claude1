# UID Finder
วาง URL Facebook / Instagram หลายอัน -> ได้เลข ID

รันในเครื่อง: `python3 uid_finder.py` แล้วเปิด http://127.0.0.1:8765

## ขึ้นเป็นเว็บไซต์
ใช้ Dockerfile ได้กับ Render / Railway / Fly.io / Google Cloud Run (Deploy from GitHub, root = `uid-finder`)
ตัวแปรเสริม: `MAX_URLS` (ค่าเริ่มต้น 100 ต่อครั้ง)
ข้อควรระวัง: Facebook/Instagram บล็อก IP ของ datacenter ง่ายกว่า IP บ้าน ผลอาจไม่เสถียรบนโฮสต์
ควรใส่รหัสผ่านถ้าไม่อยากให้คนอื่นใช้ฟรี
