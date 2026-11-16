#!/usr/bin/env python3
"""UID Finder - วาง URL Facebook / Instagram หลายอัน แล้วได้เลข ID กลับมา

ใช้งาน:
    python3 uid_finder.py              # เปิดเว็บที่ http://127.0.0.1:8765
    python3 uid_finder.py urls.txt     # โหมด CLI อ่านจากไฟล์ (หรือ - สำหรับ stdin) พิมพ์ผล TSV
ไม่ต้องติดตั้งอะไรเพิ่ม (Python 3.8+ เท่านั้น)
"""
import json, os, re, sys, urllib.request, urllib.error, urllib.parse, gzip, zlib
from concurrent.futures import ThreadPoolExecutor
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

UA_BROWSER = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
              "(KHTML, like Gecko) Chrome/124.0 Safari/537.36")
UA_FB_BOT = "facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uaxyz.php)"
IG_APP_ID = "936619743392459"
MAX_URLS = int(os.environ.get("MAX_URLS", 100))  # กันใช้หนักเกินเมื่อขึ้นเว็บสาธารณะ

FB_HOSTS = re.compile(r"(^|\.)(facebook\.com|fb\.com|fb\.me|fb\.watch)$", re.I)
IG_HOSTS = re.compile(r"(^|\.)(instagram\.com|instagr\.am)$", re.I)
IG_RESERVED = {"p", "reel", "reels", "tv", "stories", "explore", "accounts", "direct", "s"}
FB_RESERVED = {"pages", "people", "groups", "profile.php", "permalink.php", "story.php",
               "photo", "photo.php", "watch", "events", "marketplace", "share", "sharer",
               "login", "help", "policies", "gaming", "hashtag", "public", "l.php"}

# regex สำหรับดึง ID จาก HTML ของ Facebook เรียงตามความน่าเชื่อถือ
FB_HTML_PATTERNS = [
    r'fb://(?:page|profile|group)/\??(?:id=)?(\d{5,})',
    r'"pageID"\s*:\s*"(\d{5,})"',
    r'"page_id"\s*:\s*"(\d{5,})"',
    r'"profile_id"\s*:\s*"?(\d{5,})',
    r'"entity_id"\s*:\s*"(\d{5,})"',
    r'"delegate_page_id"\s*:\s*"(\d{5,})"',
    r'"userID"\s*:\s*"(\d{5,})"',
    r'facebook\.com/profile\.php\?id=(\d{5,})',
    r'"owner"\s*:\s*\{"__typename":"[A-Za-z]+","id":"(\d{5,})"',
]
IG_HTML_PATTERNS = [
    r'"profile_id"\s*:\s*"(\d+)"',
    r'"user_id"\s*:\s*"(\d+)"',
    r'instagram://user\?username=[^"\']+"?[^>]*?(\d{5,})',
    r'"id"\s*:\s*"(\d{5,})"\s*,\s*"username"',
    r'"page_id"\s*:\s*"profile_(\d+)"',
]


def clean_url(raw):
    raw = raw.strip().strip('<>"\'')
    if not raw:
        return None
    if not re.match(r"^[a-z][a-z0-9+.-]*://", raw, re.I):
        raw = "https://" + raw.lstrip("/")
    return raw


def fetch(url, ua=UA_BROWSER, headers=None, timeout=15):
    h = {"User-Agent": ua, "Accept-Language": "en-US,en;q=0.9",
         "Accept": "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8",
         "Accept-Encoding": "gzip, deflate"}
    h.update(headers or {})
    req = urllib.request.Request(url, headers=h)
    with urllib.request.urlopen(req, timeout=timeout) as r:
        data = r.read()
        enc = r.headers.get("Content-Encoding", "")
        if enc == "gzip":
            data = gzip.decompress(data)
        elif enc == "deflate":
            data = zlib.decompress(data)
        return r.geturl(), data.decode("utf-8", "replace")


def first_match(patterns, text):
    for p in patterns:
        m = re.search(p, text)
        if m:
            return m.group(1)
    return None


def fb_from_url(u):
    """ดึงเลขจากตัว URL เลย ไม่ต้องยิงเน็ต"""
    q = urllib.parse.parse_qs(u.query)
    if "id" in q and q["id"][0].isdigit():
        return q["id"][0]
    parts = [p for p in u.path.split("/") if p]
    if parts and parts[0].lower() in ("pages", "people") and len(parts) >= 3:
        for p in reversed(parts):
            if p.isdigit():
                return p
    if parts and parts[0].lower() == "groups" and len(parts) >= 2 and parts[1].isdigit():
        return parts[1]
    if len(parts) == 1 and parts[0].isdigit():
        return parts[0]
    return None


def resolve_facebook(url):
    u = urllib.parse.urlparse(url)
    uid = fb_from_url(u)
    if uid:
        return uid, "จาก URL"
    last_err = "ไม่พบ ID ในหน้าเว็บ (อาจถูก Facebook บล็อก/ต้องล็อกอิน)"
    # ลองหลาย host/UA เพราะ www มักโดนบล็อกง่ายกว่า
    path = u.path + (("?" + u.query) if u.query else "")
    for host, ua in (("www.facebook.com", UA_FB_BOT), ("mbasic.facebook.com", UA_BROWSER),
                     ("m.facebook.com", UA_BROWSER), ("www.facebook.com", UA_BROWSER)):
        try:
            final, html = fetch(f"https://{host}{path}", ua)
            uid = fb_from_url(urllib.parse.urlparse(final))
            uid = uid or first_match(FB_HTML_PATTERNS, html)
            if uid:
                return uid, f"จากหน้าเว็บ ({host})"
        except Exception as e:  # noqa
            last_err = f"{type(e).__name__}: {e}"
    return None, last_err


def ig_username(u):
    parts = [p for p in u.path.split("/") if p]
    if parts and parts[0].lower() not in IG_RESERVED:
        return parts[0]
    return None


def resolve_instagram(url):
    u = urllib.parse.urlparse(url)
    name = ig_username(u)
    if not name:
        return None, "URL นี้ไม่ใช่หน้าโปรไฟล์ (ใช้ลิงก์ instagram.com/ชื่อผู้ใช้)"
    last_err = "ไม่พบ ID (Instagram อาจจำกัดการเรียก ลองใหม่ภายหลัง)"
    try:
        _, body = fetch("https://i.instagram.com/api/v1/users/web_profile_info/?username="
                        + urllib.parse.quote(name),
                        headers={"x-ig-app-id": IG_APP_ID, "Accept": "*/*"})
        uid = json.loads(body)["data"]["user"]["id"]
        return str(uid), "จาก API"
    except Exception as e:  # noqa
        last_err = f"{type(e).__name__}: {e}"
    try:
        _, html = fetch(f"https://www.instagram.com/{urllib.parse.quote(name)}/")
        uid = first_match(IG_HTML_PATTERNS, html)
        if uid:
            return uid, "จากหน้าเว็บ"
    except Exception as e:  # noqa
        last_err = f"{type(e).__name__}: {e}"
    return None, last_err


def resolve(raw):
    url = clean_url(raw)
    out = {"input": raw.strip(), "platform": "", "id": "", "note": ""}
    if not url:
        return None
    try:
        host = urllib.parse.urlparse(url).hostname or ""
        if FB_HOSTS.search(host):
            out["platform"] = "facebook"
            uid, note = resolve_facebook(url)
        elif IG_HOSTS.search(host):
            out["platform"] = "instagram"
            uid, note = resolve_instagram(url)
        else:
            uid, note = None, "รองรับเฉพาะ Facebook / Instagram"
    except Exception as e:  # noqa
        uid, note = None, f"{type(e).__name__}: {e}"
    out["id"], out["note"] = uid or "", note
    return out


def resolve_many(text, workers=6):
    lines = []
    seen = set()
    for ln in re.split(r"[\r\n]+", text):
        for tok in ln.split():  # รองรับหลาย URL ในบรรทัดเดียว
            if tok and tok not in seen:
                seen.add(tok)
                lines.append(tok)
    lines = lines[:MAX_URLS]
    with ThreadPoolExecutor(workers) as ex:
        return [r for r in ex.map(resolve, lines) if r]


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def _send(self, code, body, ctype):
        b = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(b)))
        self.end_headers()
        self.wfile.write(b)

    def do_GET(self):
        page = (Path(__file__).parent / "index.html").read_bytes()
        self._send(200, page, "text/html; charset=utf-8")

    def do_POST(self):
        n = min(int(self.headers.get("Content-Length", 0)), 1_000_000)
        text = json.loads(self.rfile.read(n) or b"{}").get("text", "")
        self._send(200, json.dumps(resolve_many(text)), "application/json")


def main():
    if len(sys.argv) > 1:
        src = sys.stdin.read() if sys.argv[1] == "-" else Path(sys.argv[1]).read_text()
        for r in resolve_many(src):
            print(f"{r['input']}\t{r['id'] or 'ERROR'}\t{r['note']}")
        return
    # ขึ้นเว็บจริง: ตั้ง HOST=0.0.0.0 และ PORT ตามที่โฮสต์กำหนด (Dockerfile ตั้งให้แล้ว)
    host = os.environ.get("HOST", "127.0.0.1")
    port = int(os.environ.get("PORT", 8765))
    print(f"เปิดเบราว์เซอร์ที่ http://{host}:{port}  (Ctrl+C เพื่อออก)")
    ThreadingHTTPServer((host, port), Handler).serve_forever()


if __name__ == "__main__":
    main()
