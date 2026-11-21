"""แกนหลักของโปรแกรม (ไม่ผูกกับ GUI): ฐานข้อมูล, ฟอนต์, การเรนเดอร์ Template, การส่งออก"""
from __future__ import annotations

import csv
import json
import os
import shutil
import sqlite3
import sys
import uuid
from functools import lru_cache
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont, ImageOps

# ----------------------------------------------------------------- paths
def app_home() -> Path:
    env = os.environ.get("BADGEMAKER_HOME")
    if env:
        p = Path(env)
    elif sys.platform.startswith("win"):
        p = Path(os.environ.get("APPDATA", Path.home())) / "BadgeMaker"
    else:
        p = Path.home() / ".badgemaker"
    p.mkdir(parents=True, exist_ok=True)
    (p / "images").mkdir(exist_ok=True)
    (p / "fonts").mkdir(exist_ok=True)   # วางไฟล์ฟอนต์เพิ่มเองได้ที่นี่
    (p / "backgrounds").mkdir(exist_ok=True)
    return p


HOME = app_home()
DB_PATH = HOME / "badge_maker.db"
IMAGES_DIR = HOME / "images"
BG_DIR = HOME / "backgrounds"

# ----------------------------------------------------------------- fonts
def _font_dirs() -> list[Path]:
    dirs = [HOME / "fonts"]
    if sys.platform.startswith("win"):
        dirs.append(Path(os.environ.get("WINDIR", "C:/Windows")) / "Fonts")
        local = os.environ.get("LOCALAPPDATA")
        if local:
            dirs.append(Path(local) / "Microsoft/Windows/Fonts")
    else:
        dirs += [Path("/usr/share/fonts"), Path.home() / ".fonts",
                 Path("/Library/Fonts"), Path("/System/Library/Fonts")]
    return dirs


@lru_cache(maxsize=1)
def font_catalog() -> dict[str, tuple[str, int]]:
    """ชื่อฟอนต์ (เช่น 'Tahoma Bold') -> (path, index)"""
    cat: dict[str, tuple[str, int]] = {}
    for d in _font_dirs():
        if not d.exists():
            continue
        for f in d.rglob("*"):
            if f.suffix.lower() not in (".ttf", ".otf", ".ttc"):
                continue
            idx = 0
            while idx < 32:
                try:
                    ft = ImageFont.truetype(str(f), 12, index=idx)
                    fam, style = ft.getname()
                except Exception:
                    break
                name = fam if style.lower() in ("regular", "book", "normal") else f"{fam} {style}"
                cat.setdefault(name, (str(f), idx))
                if f.suffix.lower() != ".ttc":
                    break
                idx += 1
    return dict(sorted(cat.items(), key=lambda kv: kv[0].lower()))


DEFAULT_FONT_PREFS = ["Leelawadee UI", "Tahoma", "Segoe UI", "Arial", "Loma", "DejaVu Sans"]


@lru_cache(maxsize=256)
def load_font(name: str, size: int):
    size = max(4, int(size))
    cat = font_catalog()
    cands = [name] + DEFAULT_FONT_PREFS
    for n in cands:
        if n in cat:
            path, idx = cat[n]
            try:
                return ImageFont.truetype(path, size, index=idx)
            except Exception:
                pass
    return ImageFont.load_default(size)


# ----------------------------------------------------------------- models
def new_field(kind: str, name: str, w: int, h: int) -> dict:
    f = {
        "id": uuid.uuid4().hex[:8], "type": kind, "name": name,
        "x": w // 10, "y": h // 10, "w": w // 2, "h": h // 8 if kind == "text" else w // 3,
        "default": "",
    }
    if kind == "text":
        f.update(font="Tahoma" if "Tahoma" in font_catalog() else
                 next(iter(font_catalog()), ""), size=max(12, h // 20),
                 color="#000000", align="center", valign="middle",
                 autofit=True, wrap=False)
    else:
        f.update(fit="cover", shape="rect")
    return f


def mm_to_px(mm: float, dpi: int) -> int:
    return max(1, round(mm / 25.4 * dpi))


# ----------------------------------------------------------------- database
class DB:
    def __init__(self, path: Path = DB_PATH):
        self.con = sqlite3.connect(path)
        self.con.row_factory = sqlite3.Row
        self.con.executescript("""
        CREATE TABLE IF NOT EXISTS templates(
            id INTEGER PRIMARY KEY, name TEXT UNIQUE, width INT, height INT, dpi INT,
            bg_color TEXT, bg_image TEXT, fields TEXT);
        CREATE TABLE IF NOT EXISTS records(
            id INTEGER PRIMARY KEY, template_id INT REFERENCES templates(id) ON DELETE CASCADE,
            data TEXT);
        PRAGMA foreign_keys=ON;""")

    # templates
    def templates(self):
        return [self._tpl(r) for r in self.con.execute("SELECT * FROM templates ORDER BY name")]

    def template(self, tid):
        r = self.con.execute("SELECT * FROM templates WHERE id=?", (tid,)).fetchone()
        return self._tpl(r) if r else None

    @staticmethod
    def _tpl(r):
        d = dict(r)
        d["fields"] = json.loads(d["fields"] or "[]")
        return d

    def create_template(self, name, width, height, dpi=300, bg_color="#FFFFFF") -> int:
        cur = self.con.execute(
            "INSERT INTO templates(name,width,height,dpi,bg_color,bg_image,fields) VALUES(?,?,?,?,?,?,?)",
            (name, width, height, dpi, bg_color, "", "[]"))
        self.con.commit()
        return cur.lastrowid

    def save_template(self, t):
        self.con.execute(
            "UPDATE templates SET name=?,width=?,height=?,dpi=?,bg_color=?,bg_image=?,fields=? WHERE id=?",
            (t["name"], t["width"], t["height"], t["dpi"], t["bg_color"], t["bg_image"],
             json.dumps(t["fields"], ensure_ascii=False), t["id"]))
        self.con.commit()

    def delete_template(self, tid):
        self.con.execute("DELETE FROM records WHERE template_id=?", (tid,))
        self.con.execute("DELETE FROM templates WHERE id=?", (tid,))
        self.con.commit()

    def duplicate_template(self, tid, new_name, with_records=False) -> int:
        t = self.template(tid)
        nid = self.create_template(new_name, t["width"], t["height"], t["dpi"], t["bg_color"])
        t2 = dict(t, id=nid, name=new_name)
        self.save_template(t2)
        if with_records:
            for r in self.records(tid):
                self.add_record(nid, r["data"])
        return nid

    # records
    def records(self, tid):
        return [{"id": r["id"], "data": json.loads(r["data"])} for r in
                self.con.execute("SELECT * FROM records WHERE template_id=? ORDER BY id", (tid,))]

    def add_record(self, tid, data) -> int:
        cur = self.con.execute("INSERT INTO records(template_id,data) VALUES(?,?)",
                               (tid, json.dumps(data, ensure_ascii=False)))
        self.con.commit()
        return cur.lastrowid

    def update_record(self, rid, data):
        self.con.execute("UPDATE records SET data=? WHERE id=?",
                         (json.dumps(data, ensure_ascii=False), rid))
        self.con.commit()

    def delete_records(self, rids):
        self.con.executemany("DELETE FROM records WHERE id=?", [(r,) for r in rids])
        self.con.commit()

    def rename_field_in_records(self, tid, old, new):
        if old == new:
            return
        for r in self.records(tid):
            if old in r["data"]:
                r["data"][new] = r["data"].pop(old)
                self.update_record(r["id"], r["data"])


def store_image(path: str) -> str:
    """คัดลอกรูปเข้าฐานข้อมูล (โฟลเดอร์ images) คืนชื่อไฟล์ใหม่"""
    ext = Path(path).suffix.lower() or ".png"
    name = uuid.uuid4().hex[:12] + ext
    shutil.copy2(path, IMAGES_DIR / name)
    return name


def resolve_image(value: str) -> Path | None:
    if not value:
        return None
    p = IMAGES_DIR / value
    if p.exists():
        return p
    p = Path(value)
    return p if p.exists() else None


IMAGE_EXTS = (".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tif", ".tiff")


def import_image_folder(db: DB, tpl: dict, folder: str) -> int:
    """หนึ่งรูป = หนึ่งแถว: ชื่อไฟล์ -> ช่องข้อความแรก, รูป -> ช่องรูปแรก"""
    img_f = next((f for f in tpl["fields"] if f["type"] == "image"), None)
    txt_f = next((f for f in tpl["fields"] if f["type"] == "text"), None)
    if not img_f:
        raise ValueError("Template นี้ยังไม่มีช่องรูปภาพ")
    n = 0
    for p in sorted(Path(folder).iterdir()):
        if p.suffix.lower() in IMAGE_EXTS:
            data = {img_f["name"]: store_image(str(p))}
            if txt_f:
                data[txt_f["name"]] = p.stem
            db.add_record(tpl["id"], data)
            n += 1
    return n


def import_csv(db: DB, tpl: dict, csv_path: str) -> int:
    """หัวคอลัมน์ = ชื่อช่อง; ช่องรูปใส่ path ของไฟล์ (เต็ม หรือเทียบกับไฟล์ CSV)"""
    raw = Path(csv_path).read_bytes()
    for enc in ("utf-8-sig", "cp874"):
        try:
            text = raw.decode(enc)
            break
        except UnicodeDecodeError:
            continue
    else:
        text = raw.decode("utf-8", "replace")
    rows = csv.DictReader(text.splitlines())
    types = {f["name"]: f["type"] for f in tpl["fields"]}
    base = Path(csv_path).parent
    n = 0
    for row in rows:
        data = {}
        for k, v in row.items():
            if k is None or k.strip() not in types or v is None:
                continue
            k, v = k.strip(), v.strip()
            if types[k] == "image" and v:
                p = Path(v)
                p = p if p.is_absolute() else base / p
                if p.exists():
                    v = store_image(str(p))
                else:
                    v = ""
            data[k] = v
        if data:
            db.add_record(tpl["id"], data)
            n += 1
    return n


# ----------------------------------------------------------------- render
def _hex(c, fallback=(0, 0, 0)):
    try:
        c = c.lstrip("#")
        return tuple(int(c[i:i + 2], 16) for i in (0, 2, 4))
    except Exception:
        return fallback


def _wrap(draw, text, font, max_w):
    lines = []
    for para in text.split("\n"):
        cur = ""
        # ภาษาไทยไม่มีช่องว่างคั่นคำ -> ตัดตามตัวอักษรเมื่อไม่มี space
        tokens = para.split(" ") if " " in para else list(para)
        sep = " " if " " in para else ""
        for tk in tokens:
            trial = tk if not cur else cur + sep + tk
            if draw.textlength(trial, font=font) <= max_w or not cur:
                cur = trial
            else:
                lines.append(cur)
                cur = tk
        lines.append(cur)
    return lines


def _draw_text(img, f, text):
    w, h = int(f["w"]), int(f["h"])
    layer = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    size = int(f.get("size", 24))
    wrap = f.get("wrap", False)

    def layout(sz):
        font = load_font(f.get("font", ""), sz)
        lines = _wrap(d, text, font, w) if wrap else text.split("\n")
        asc, desc = font.getmetrics()
        lh = int((asc + desc) * 1.1)
        widest = max((d.textlength(l, font=font) for l in lines), default=0)
        return font, lines, lh, asc, widest

    font, lines, lh, asc, widest = layout(size)
    if f.get("autofit", True):
        while size > 6 and (widest > w or lh * len(lines) > h):
            size -= 1
            font, lines, lh, asc, widest = layout(size)
    total = lh * len(lines)
    va = f.get("valign", "middle")
    y = 0 if va == "top" else (h - total) // 2 if va == "middle" else h - total
    color = _hex(f.get("color", "#000000")) + (255,)
    for line in lines:
        lw = d.textlength(line, font=font)
        al = f.get("align", "center")
        x = 0 if al == "left" else (w - lw) / 2 if al == "center" else w - lw
        d.text((x, y), line, font=font, fill=color, anchor="la")
        y += lh
    img.alpha_composite(layer, (int(f["x"]), int(f["y"])))


def _draw_image(img, f, path):
    w, h = int(f["w"]), int(f["h"])
    with Image.open(path) as im:
        im = ImageOps.exif_transpose(im).convert("RGBA")
    fit = f.get("fit", "cover")
    if fit == "cover":
        im = ImageOps.fit(im, (w, h), Image.LANCZOS)
    elif fit == "contain":
        im = ImageOps.contain(im, (w, h), Image.LANCZOS)
        canvas = Image.new("RGBA", (w, h), (0, 0, 0, 0))
        canvas.paste(im, ((w - im.width) // 2, (h - im.height) // 2))
        im = canvas
    else:
        im = im.resize((w, h), Image.LANCZOS)
    shape = f.get("shape", "rect")
    if shape != "rect":
        mask = Image.new("L", (w * 2, h * 2), 0)
        md = ImageDraw.Draw(mask)
        if shape == "ellipse":
            md.ellipse((0, 0, w * 2 - 1, h * 2 - 1), fill=255)
        else:
            md.rounded_rectangle((0, 0, w * 2 - 1, h * 2 - 1), radius=min(w, h) // 5 * 2, fill=255)
        mask = mask.resize((w, h), Image.LANCZOS)
        a = Image.composite(im.getchannel("A"), Image.new("L", (w, h), 0), mask)
        im.putalpha(a)
    img.alpha_composite(im, (int(f["x"]), int(f["y"])))


def _placeholder(img, f, label):
    d = ImageDraw.Draw(img)
    x, y, w, h = int(f["x"]), int(f["y"]), int(f["w"]), int(f["h"])
    d.rectangle((x, y, x + w, y + h), fill=(225, 225, 225, 255), outline=(150, 150, 150, 255))
    d.line((x, y, x + w, y + h), fill=(190, 190, 190, 255))
    d.line((x, y + h, x + w, y), fill=(190, 190, 190, 255))


def render(tpl: dict, data: dict | None = None, preview: bool = False) -> Image.Image:
    """วาด Template + ข้อมูลหนึ่งแถวเป็นภาพ RGB
    preview=True: ช่องที่ว่างจะแสดงชื่อช่อง / กรอบรูปแทน (ใช้ในหน้าแก้ Template)"""
    data = data or {}
    W, H = int(tpl["width"]), int(tpl["height"])
    img = Image.new("RGBA", (W, H), _hex(tpl.get("bg_color", "#FFFFFF"), (255, 255, 255)) + (255,))
    bg = tpl.get("bg_image")
    if bg:
        p = BG_DIR / bg
        if p.exists():
            with Image.open(p) as b:
                img.alpha_composite(ImageOps.fit(b.convert("RGBA"), (W, H), Image.LANCZOS))
    for f in tpl["fields"]:
        val = data.get(f["name"], "") or f.get("default", "")
        if f["type"] == "text":
            if not val and preview:
                val = f["name"]
            if val:
                _draw_text(img, f, str(val))
        else:
            p = resolve_image(val)
            if p:
                try:
                    _draw_image(img, f, p)
                    continue
                except Exception:
                    pass
            if preview:
                _placeholder(img, f, f["name"])
    return img.convert("RGB")


# ----------------------------------------------------------------- export
def safe_name(s: str) -> str:
    s = "".join(c for c in s if c not in '\\/:*?"<>|').strip()
    return s or "card"


def export_images(tpl, records, folder, fmt="PNG", name_field=None, progress=None) -> int:
    out = Path(folder)
    out.mkdir(parents=True, exist_ok=True)
    used: set[str] = set()
    for i, r in enumerate(records, 1):
        base = safe_name(str(r["data"].get(name_field, ""))) if name_field else ""
        base = base or f"{i:03d}"
        name, k = base, 2
        while name in used:
            name, k = f"{base}_{k}", k + 1
        used.add(name)
        img = render(tpl, r["data"])
        ext = "jpg" if fmt == "JPG" else "png"
        if fmt == "JPG":
            img.save(out / f"{name}.{ext}", quality=95, dpi=(tpl["dpi"],) * 2)
        else:
            img.save(out / f"{name}.{ext}", dpi=(tpl["dpi"],) * 2)
        if progress:
            progress(i, len(records))
    return len(records)


def export_pdf_sheets(tpl, records, path, page="A4", margin_mm=8, gap_mm=2,
                      landscape=False, progress=None) -> int:
    """จัดหลายใบลงหน้ากระดาษ (A4/A3/Letter) พร้อมช่องว่างสำหรับตัด -> PDF หลายหน้า"""
    dpi = int(tpl["dpi"])
    sizes = {"A4": (210, 297), "A3": (297, 420), "Letter": (215.9, 279.4)}
    pw_mm, ph_mm = sizes.get(page, sizes["A4"])
    if landscape:
        pw_mm, ph_mm = ph_mm, pw_mm
    PW, PH = mm_to_px(pw_mm, dpi), mm_to_px(ph_mm, dpi)
    m, g = mm_to_px(margin_mm, dpi), mm_to_px(gap_mm, dpi)
    cw, ch = int(tpl["width"]), int(tpl["height"])
    cols = max(1, (PW - 2 * m + g) // (cw + g))
    rows = max(1, (PH - 2 * m + g) // (ch + g))
    per = cols * rows
    pages = []
    for start in range(0, max(len(records), 1), per):
        sheet = Image.new("RGB", (PW, PH), "white")
        d = ImageDraw.Draw(sheet)
        for j, r in enumerate(records[start:start + per]):
            cx, cy = m + (j % cols) * (cw + g), m + (j // cols) * (ch + g)
            sheet.paste(render(tpl, r["data"]), (cx, cy))
            d.rectangle((cx, cy, cx + cw - 1, cy + ch - 1), outline=(170, 170, 170))
            if progress:
                progress(start + j + 1, len(records))
        pages.append(sheet)
    pages[0].save(path, "PDF", resolution=float(dpi), save_all=True, append_images=pages[1:])
    return len(pages)
