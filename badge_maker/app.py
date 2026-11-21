"""Badge Maker - โปรแกรมสร้างป้ายชื่อ/บัตร จาก Template + ฐานข้อมูล (Windows, Tkinter)"""
import os
import sys
import tkinter as tk
from tkinter import colorchooser, filedialog, messagebox, simpledialog, ttk

from PIL import Image, ImageTk

import core

HANDLE = 9  # px ของจุดจับย่อ/ขยาย


class App(tk.Tk):
    def __init__(self):
        super().__init__()
        self.title("Badge Maker - สร้างป้ายชื่อ / บัตร")
        self.geometry("1280x800")
        self.db = core.DB()
        self.tpl = None
        self.sel = None            # field ที่เลือก (dict)
        self.scale = 1.0
        self._photo = None
        self._loading = False
        self._after = None
        self._drag = None
        self._build()
        self.refresh_templates()

    # ------------------------------------------------------------ UI skeleton
    def _build(self):
        top = ttk.Frame(self, padding=6)
        top.pack(fill="x")
        ttk.Label(top, text="Template:").pack(side="left")
        self.tpl_var = tk.StringVar()
        self.tpl_cb = ttk.Combobox(top, textvariable=self.tpl_var, state="readonly", width=32)
        self.tpl_cb.pack(side="left", padx=4)
        self.tpl_cb.bind("<<ComboboxSelected>>", lambda e: self.select_template())
        for text, cmd in [("＋ ใหม่", self.new_template), ("คัดลอก", self.dup_template),
                          ("เปลี่ยนชื่อ", self.rename_template), ("ลบ", self.del_template)]:
            ttk.Button(top, text=text, command=cmd).pack(side="left", padx=2)

        self.nb = ttk.Notebook(self)
        self.nb.pack(fill="both", expand=True, padx=6, pady=(0, 6))
        self.t_edit = ttk.Frame(self.nb)
        self.t_data = ttk.Frame(self.nb)
        self.t_exp = ttk.Frame(self.nb)
        self.nb.add(self.t_edit, text="  1. ออกแบบ Template  ")
        self.nb.add(self.t_data, text="  2. ข้อมูล (ฐานข้อมูล)  ")
        self.nb.add(self.t_exp, text="  3. สร้างป้ายแบบ Batch  ")
        self.nb.bind("<<NotebookTabChanged>>", lambda e: self.on_tab())
        self._build_editor()
        self._build_data()
        self._build_export()

    # ------------------------------------------------------------ templates
    def refresh_templates(self, select_id=None):
        self.templates = self.db.templates()
        self.tpl_cb["values"] = [t["name"] for t in self.templates]
        if not self.templates:
            self.tpl = None
            self.tpl_var.set("")
        else:
            idx = 0
            want = select_id or (self.tpl["id"] if self.tpl else None)
            for i, t in enumerate(self.templates):
                if t["id"] == want:
                    idx = i
            self.tpl_cb.current(idx)
        self.select_template()

    def select_template(self):
        i = self.tpl_cb.current()
        self.tpl = self.templates[i] if 0 <= i < len(self.templates) else None
        self.sel = None
        self.load_template_ui()
        self.refresh_data()
        self.redraw()

    def new_template(self):
        dlg = NewTemplateDialog(self)
        self.wait_window(dlg)
        if not dlg.result:
            return
        name, wmm, hmm, dpi = dlg.result
        try:
            tid = self.db.create_template(name, core.mm_to_px(wmm, dpi), core.mm_to_px(hmm, dpi), dpi)
        except Exception:
            return messagebox.showerror("ผิดพลาด", "ชื่อ Template นี้มีอยู่แล้ว")
        self.refresh_templates(tid)

    def dup_template(self):
        if not self.tpl:
            return
        name = simpledialog.askstring("คัดลอก", "ชื่อ Template ใหม่:", parent=self,
                                      initialvalue=self.tpl["name"] + " (copy)")
        if name:
            recs = messagebox.askyesno("คัดลอก", "คัดลอกข้อมูลในฐานข้อมูลไปด้วยหรือไม่?")
            try:
                tid = self.db.duplicate_template(self.tpl["id"], name, recs)
            except Exception:
                return messagebox.showerror("ผิดพลาด", "ชื่อซ้ำ")
            self.refresh_templates(tid)

    def rename_template(self):
        if not self.tpl:
            return
        name = simpledialog.askstring("เปลี่ยนชื่อ", "ชื่อใหม่:", parent=self, initialvalue=self.tpl["name"])
        if name:
            self.tpl["name"] = name
            try:
                self.db.save_template(self.tpl)
            except Exception:
                return messagebox.showerror("ผิดพลาด", "ชื่อซ้ำ")
            self.refresh_templates()

    def del_template(self):
        if self.tpl and messagebox.askyesno("ลบ", f"ลบ '{self.tpl['name']}' พร้อมข้อมูลทั้งหมด?"):
            self.db.delete_template(self.tpl["id"])
            self.tpl = None
            self.refresh_templates()

    def save(self):
        if self.tpl:
            self.db.save_template(self.tpl)

    def on_tab(self):
        t = self.nb.index(self.nb.select())
        if t == 0:
            self.redraw()
        elif t == 1:
            self.refresh_data()
        elif t == 2:
            self.refresh_export()

    # ============================================================ EDITOR TAB
    def _build_editor(self):
        left = ttk.Frame(self.t_edit)
        left.pack(side="left", fill="both", expand=True)
        self.canvas = tk.Canvas(left, bg="#6b6b6b", highlightthickness=0)
        self.canvas.pack(fill="both", expand=True)
        self.canvas.bind("<Configure>", lambda e: self.redraw())
        self.canvas.bind("<ButtonPress-1>", self.on_press)
        self.canvas.bind("<B1-Motion>", self.on_motion)
        self.canvas.bind("<ButtonRelease-1>", self.on_release)

        right = ttk.Frame(self.t_edit, width=360, padding=6)
        right.pack(side="right", fill="y")
        right.pack_propagate(False)

        box = ttk.LabelFrame(right, text="Template", padding=4)
        box.pack(fill="x")
        self.size_lbl = ttk.Label(box, text="")
        self.size_lbl.pack(anchor="w")
        r = ttk.Frame(box)
        r.pack(fill="x", pady=2)
        ttk.Button(r, text="สีพื้นหลัง", command=self.pick_bg_color).pack(side="left")
        ttk.Button(r, text="รูปพื้นหลัง...", command=self.pick_bg_image).pack(side="left", padx=4)
        ttk.Button(r, text="ล้างรูป", command=self.clear_bg_image).pack(side="left")

        fb = ttk.LabelFrame(right, text="ช่องข้อมูล (เพิ่ม/ลบจำนวนจุดได้)", padding=4)
        fb.pack(fill="x", pady=6)
        self.flist = tk.Listbox(fb, height=6, exportselection=False)
        self.flist.pack(fill="x")
        self.flist.bind("<<ListboxSelect>>", self.on_list_select)
        r = ttk.Frame(fb)
        r.pack(fill="x", pady=2)
        ttk.Button(r, text="＋ ข้อความ", command=lambda: self.add_field("text")).pack(side="left")
        ttk.Button(r, text="＋ รูปภาพ", command=lambda: self.add_field("image")).pack(side="left", padx=4)
        ttk.Button(r, text="ทำซ้ำ", command=self.copy_field).pack(side="left")
        ttk.Button(r, text="ลบ", command=self.del_field).pack(side="left", padx=4)

        self.props = ttk.LabelFrame(right, text="คุณสมบัติของช่องที่เลือก", padding=4)
        self.props.pack(fill="both", expand=True)
        self._build_props()

    def _build_props(self):
        p = self.props
        self.v = {k: tk.StringVar() for k in
                  ("name", "x", "y", "w", "h", "font", "size", "align", "valign", "default", "fit", "shape")}
        self.v_autofit = tk.BooleanVar()
        self.v_wrap = tk.BooleanVar()
        self.color_btn = None

        def row(label, widget_factory, r):
            ttk.Label(p, text=label).grid(row=r, column=0, sticky="w", pady=1)
            w = widget_factory()
            w.grid(row=r, column=1, columnspan=3, sticky="ew", pady=1)
            return w

        row("ชื่อช่อง", lambda: ttk.Entry(p, textvariable=self.v["name"]), 0)
        for i, (k, lbl) in enumerate([("x", "X"), ("y", "Y"), ("w", "กว้าง"), ("h", "สูง")]):
            ttk.Label(p, text=lbl).grid(row=1 + i // 2, column=(i % 2) * 2, sticky="w")
            ttk.Spinbox(p, from_=0, to=20000, width=7, textvariable=self.v[k]).grid(
                row=1 + i // 2, column=(i % 2) * 2 + 1, sticky="w", pady=1)
        self.text_frame = ttk.Frame(p)
        self.text_frame.grid(row=3, column=0, columnspan=4, sticky="ew", pady=(6, 0))
        tf = self.text_frame
        ttk.Label(tf, text="ฟอนต์").grid(row=0, column=0, sticky="w")
        self.font_cb = ttk.Combobox(tf, textvariable=self.v["font"], values=list(core.font_catalog()), width=28)
        self.font_cb.grid(row=0, column=1, columnspan=3, sticky="ew")
        ttk.Button(tf, text="เพิ่มไฟล์ฟอนต์...", command=self.add_font_file).grid(
            row=1, column=1, columnspan=3, sticky="w", pady=1)
        ttk.Label(tf, text="ขนาด (px)").grid(row=2, column=0, sticky="w")
        ttk.Spinbox(tf, from_=6, to=2000, width=7, textvariable=self.v["size"]).grid(row=2, column=1, sticky="w")
        self.color_btn = tk.Button(tf, text="สีตัวอักษร", width=10, command=self.pick_text_color)
        self.color_btn.grid(row=2, column=2, columnspan=2, sticky="e")
        ttk.Label(tf, text="แนวนอน").grid(row=3, column=0, sticky="w")
        ttk.Combobox(tf, textvariable=self.v["align"], values=["left", "center", "right"],
                     state="readonly", width=8).grid(row=3, column=1, sticky="w")
        ttk.Label(tf, text="แนวตั้ง").grid(row=3, column=2, sticky="e")
        ttk.Combobox(tf, textvariable=self.v["valign"], values=["top", "middle", "bottom"],
                     state="readonly", width=8).grid(row=3, column=3, sticky="w")
        ttk.Checkbutton(tf, text="ย่อขนาดอัตโนมัติให้พอดีกรอบ", variable=self.v_autofit).grid(
            row=4, column=0, columnspan=4, sticky="w")
        ttk.Checkbutton(tf, text="ตัดบรรทัดอัตโนมัติ", variable=self.v_wrap).grid(
            row=5, column=0, columnspan=4, sticky="w")
        ttk.Label(tf, text="ข้อความตั้งต้น\n(ใช้เมื่อไม่มีข้อมูล)").grid(row=6, column=0, sticky="w")
        ttk.Entry(tf, textvariable=self.v["default"]).grid(row=6, column=1, columnspan=3, sticky="ew")

        self.img_frame = ttk.Frame(p)
        self.img_frame.grid(row=3, column=0, columnspan=4, sticky="ew", pady=(6, 0))
        imf = self.img_frame
        ttk.Label(imf, text="การจัดรูป").grid(row=0, column=0, sticky="w")
        ttk.Combobox(imf, textvariable=self.v["fit"], values=["cover", "contain", "stretch"],
                     state="readonly", width=10).grid(row=0, column=1, sticky="w")
        ttk.Label(imf, text="cover=ตัดให้เต็มกรอบ  contain=เห็นครบ  stretch=ยืด",
                  foreground="#666").grid(row=1, column=0, columnspan=3, sticky="w")
        ttk.Label(imf, text="รูปทรง").grid(row=2, column=0, sticky="w")
        ttk.Combobox(imf, textvariable=self.v["shape"], values=["rect", "round", "ellipse"],
                     state="readonly", width=10).grid(row=2, column=1, sticky="w")
        ttk.Label(imf, text="รูปตั้งต้น").grid(row=3, column=0, sticky="w")
        ttk.Button(imf, text="เลือก...", command=self.pick_default_image).grid(row=3, column=1, sticky="w")
        p.columnconfigure(1, weight=1)
        for k, var in self.v.items():
            var.trace_add("write", lambda *a, k=k: self.on_prop(k))
        self.v_autofit.trace_add("write", lambda *a: self.on_prop("autofit"))
        self.v_wrap.trace_add("write", lambda *a: self.on_prop("wrap"))
        self.set_props_enabled(False)

    def set_props_enabled(self, on):
        for fr in (self.props,):
            for ch in fr.winfo_children():
                self._enable(ch, on)

    def _enable(self, w, on):
        if isinstance(w, ttk.Widget):
            try:
                w.state(["!disabled"] if on else ["disabled"])
            except tk.TclError:
                pass
        else:
            try:
                w.configure(state="normal" if on else "disabled")
            except tk.TclError:
                pass
        for c in w.winfo_children():
            self._enable(c, on)

    def load_template_ui(self):
        t = self.tpl
        self.size_lbl.config(text="" if not t else
                             f"ขนาด {t['width']}×{t['height']} px  ({t['width']/t['dpi']*25.4:.1f}×"
                             f"{t['height']/t['dpi']*25.4:.1f} mm @ {t['dpi']} dpi)")
        self.flist.delete(0, "end")
        if t:
            for f in t["fields"]:
                self.flist.insert("end", self.field_label(f))
        self.load_props()

    @staticmethod
    def field_label(f):
        return ("🔤 " if f["type"] == "text" else "🖼 ") + f["name"]

    def load_props(self):
        f = self.sel
        self._loading = True
        try:
            self.set_props_enabled(bool(f))
            if not f:
                for var in self.v.values():
                    var.set("")
                return
            for k in self.v:
                self.v[k].set(str(f.get(k, "")))
            self.v_autofit.set(f.get("autofit", True))
            self.v_wrap.set(f.get("wrap", False))
            if f["type"] == "text":
                self.img_frame.grid_remove()
                self.text_frame.grid()
                self.color_btn.config(bg=f.get("color", "#000000"),
                                      fg="white" if sum(core._hex(f.get("color", "#000000"))) < 380 else "black")
            else:
                self.text_frame.grid_remove()
                self.img_frame.grid()
        finally:
            self._loading = False

    def on_prop(self, key):
        if self._loading or not self.sel:
            return
        f = self.sel
        if key == "autofit":
            f["autofit"] = self.v_autofit.get()
        elif key == "wrap":
            f["wrap"] = self.v_wrap.get()
        else:
            val = self.v[key].get()
            if key in ("x", "y", "w", "h", "size"):
                try:
                    val = max(1 if key in ("w", "h", "size") else -5000, int(float(val)))
                except ValueError:
                    return
            if key == "name":
                val = val.strip()
                if not val or any(o is not f and o["name"] == val for o in self.tpl["fields"]):
                    return
                self.db.rename_field_in_records(self.tpl["id"], f["name"], val)
                f["name"] = val
                i = self.tpl["fields"].index(f)
                self.flist.delete(i)
                self.flist.insert(i, self.field_label(f))
                self.flist.selection_set(i)
            else:
                f[key] = val
        self.save()
        self.schedule_redraw()

    def pick_text_color(self):
        if self.sel:
            c = colorchooser.askcolor(self.sel.get("color", "#000000"), parent=self)[1]
            if c:
                self.sel["color"] = c
                self.save()
                self.load_props()
                self.schedule_redraw()

    def pick_bg_color(self):
        if self.tpl:
            c = colorchooser.askcolor(self.tpl["bg_color"], parent=self)[1]
            if c:
                self.tpl["bg_color"] = c
                self.save()
                self.redraw()

    def pick_bg_image(self):
        if not self.tpl:
            return
        p = filedialog.askopenfilename(parent=self, filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.webp")])
        if p:
            import shutil, uuid
            name = uuid.uuid4().hex[:10] + os.path.splitext(p)[1].lower()
            shutil.copy2(p, core.BG_DIR / name)
            self.tpl["bg_image"] = name
            self.save()
            self.redraw()

    def clear_bg_image(self):
        if self.tpl:
            self.tpl["bg_image"] = ""
            self.save()
            self.redraw()

    def add_font_file(self):
        p = filedialog.askopenfilename(parent=self, filetypes=[("Font", "*.ttf *.otf *.ttc")])
        if p:
            import shutil
            shutil.copy2(p, core.HOME / "fonts")
            core.font_catalog.cache_clear()
            core.load_font.cache_clear()
            self.font_cb["values"] = list(core.font_catalog())
            messagebox.showinfo("ฟอนต์", "เพิ่มฟอนต์แล้ว เลือกจากรายการได้เลย")

    def pick_default_image(self):
        if self.sel:
            p = filedialog.askopenfilename(parent=self, filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.webp")])
            if p:
                self.sel["default"] = core.store_image(p)
                self.save()
                self.schedule_redraw()

    # fields add/delete
    def add_field(self, kind):
        if not self.tpl:
            return messagebox.showinfo("Template", "สร้าง Template ก่อน")
        base = "text" if kind == "text" else "photo"
        names = {f["name"] for f in self.tpl["fields"]}
        n = 1
        while f"{base}{n}" in names:
            n += 1
        f = core.new_field(kind, f"{base}{n}", self.tpl["width"], self.tpl["height"])
        self.tpl["fields"].append(f)
        self.save()
        self.sel = f
        self.load_template_ui()
        self.flist.selection_set("end")
        self.load_props()
        self.redraw()

    def copy_field(self):
        if self.sel:
            import copy, uuid
            f = copy.deepcopy(self.sel)
            f["id"] = uuid.uuid4().hex[:8]
            base = f["name"].rstrip("0123456789") or f["name"]
            names = {x["name"] for x in self.tpl["fields"]}
            n = 2
            while f"{base}{n}" in names:
                n += 1
            f["name"] = f"{base}{n}"
            f["x"] += 20
            f["y"] += 20
            self.tpl["fields"].append(f)
            self.save()
            self.sel = f
            self.load_template_ui()
            self.flist.selection_set("end")
            self.load_props()
            self.redraw()

    def del_field(self):
        if self.sel and messagebox.askyesno("ลบช่อง", f"ลบช่อง '{self.sel['name']}' ?"):
            self.tpl["fields"].remove(self.sel)
            self.sel = None
            self.save()
            self.load_template_ui()
            self.redraw()

    def on_list_select(self, _e):
        s = self.flist.curselection()
        if s and self.tpl:
            self.sel = self.tpl["fields"][s[0]]
            self.load_props()
            self.redraw_overlay()

    # canvas drawing
    def schedule_redraw(self):
        if self._after:
            self.after_cancel(self._after)
        self._after = self.after(150, self.redraw)

    def redraw(self):
        self._after = None
        c = self.canvas
        c.delete("all")
        if not self.tpl:
            c.create_text(30, 30, anchor="nw", fill="white", font=("Segoe UI", 14),
                          text="กด '＋ ใหม่' ด้านบนเพื่อสร้าง Template แรก")
            return
        cw, ch = max(c.winfo_width(), 50), max(c.winfo_height(), 50)
        self.scale = min((cw - 30) / self.tpl["width"], (ch - 30) / self.tpl["height"])
        recs = self.db.records(self.tpl["id"])
        sample = recs[0]["data"] if recs else {}
        img = core.render(self.tpl, sample, preview=True)
        sw, sh = max(1, int(img.width * self.scale)), max(1, int(img.height * self.scale))
        self._photo = ImageTk.PhotoImage(img.resize((sw, sh), Image.LANCZOS))
        self.ox, self.oy = (cw - sw) // 2, (ch - sh) // 2
        c.create_image(self.ox, self.oy, anchor="nw", image=self._photo)
        self.redraw_overlay()

    def redraw_overlay(self):
        c = self.canvas
        c.delete("ov")
        if not self.tpl:
            return
        for f in self.tpl["fields"]:
            x0, y0, x1, y1 = self.f_rect(f)
            on = f is self.sel
            c.create_rectangle(x0, y0, x1, y1, outline="#e11d48" if on else "#2563eb",
                               width=2 if on else 1, dash=() if on else (4, 3), tags="ov")
            if on:
                c.create_rectangle(x1 - HANDLE, y1 - HANDLE, x1 + HANDLE, y1 + HANDLE,
                                   fill="#e11d48", outline="white", tags="ov")

    def f_rect(self, f):
        s = self.scale
        x0 = self.ox + f["x"] * s
        y0 = self.oy + f["y"] * s
        return x0, y0, x0 + f["w"] * s, y0 + f["h"] * s

    def on_press(self, e):
        if not self.tpl:
            return
        if self.sel:
            x0, y0, x1, y1 = self.f_rect(self.sel)
            if abs(e.x - x1) <= HANDLE + 3 and abs(e.y - y1) <= HANDLE + 3:
                self._drag = ("resize", e.x, e.y, self.sel["w"], self.sel["h"])
                return
        hit = None
        for f in reversed(self.tpl["fields"]):
            x0, y0, x1, y1 = self.f_rect(f)
            if x0 <= e.x <= x1 and y0 <= e.y <= y1:
                hit = f
                break
        self.sel = hit
        self.flist.selection_clear(0, "end")
        if hit:
            self.flist.selection_set(self.tpl["fields"].index(hit))
            self._drag = ("move", e.x, e.y, hit["x"], hit["y"])
        else:
            self._drag = None
        self.load_props()
        self.redraw_overlay()

    def on_motion(self, e):
        if not self._drag or not self.sel:
            return
        kind, sx, sy, a, b = self._drag
        dx, dy = (e.x - sx) / self.scale, (e.y - sy) / self.scale
        if kind == "move":
            self.sel["x"], self.sel["y"] = int(a + dx), int(b + dy)
        else:
            self.sel["w"], self.sel["h"] = max(10, int(a + dx)), max(10, int(b + dy))
        self.redraw_overlay()

    def on_release(self, _e):
        if self._drag and self.sel:
            self._drag = None
            self.save()
            self.load_props()
            self.redraw()

    # ============================================================ DATA TAB
    def _build_data(self):
        bar = ttk.Frame(self.t_data, padding=6)
        bar.pack(fill="x")
        for text, cmd in [("＋ เพิ่มแถว", self.add_row), ("แก้ไข", self.edit_row),
                          ("ลบที่เลือก", self.del_rows), ("นำเข้ารูปทั้งโฟลเดอร์...", self.imp_folder),
                          ("นำเข้า CSV...", self.imp_csv)]:
            ttk.Button(bar, text=text, command=cmd).pack(side="left", padx=2)
        self.tree = ttk.Treeview(self.t_data, show="headings", selectmode="extended")
        sb = ttk.Scrollbar(self.t_data, command=self.tree.yview)
        self.tree.configure(yscrollcommand=sb.set)
        sb.pack(side="right", fill="y")
        self.tree.pack(fill="both", expand=True, padx=6, pady=(0, 6))
        self.tree.bind("<Double-1>", lambda e: self.edit_row())
        ttk.Label(self.t_data, foreground="#555", text="ฐานข้อมูลเก็บแยกตาม Template: คอลัมน์ = ช่องที่ออกแบบไว้, "
                  "ช่องรูปจะถูกคัดลอกเก็บไว้ในโปรแกรม").pack(anchor="w", padx=8, pady=(0, 6))

    def refresh_data(self):
        self.tree.delete(*self.tree.get_children())
        if not self.tpl:
            self.tree["columns"] = ()
            return
        cols = [f["name"] for f in self.tpl["fields"]]
        self.tree["columns"] = ["#"] + cols
        self.tree.heading("#", text="#")
        self.tree.column("#", width=50, anchor="center")
        for f in self.tpl["fields"]:
            self.tree.heading(f["name"], text=("🖼 " if f["type"] == "image" else "") + f["name"])
            self.tree.column(f["name"], width=160)
        for i, r in enumerate(self.db.records(self.tpl["id"]), 1):
            vals = [i] + [("(รูป)" if r["data"].get(f["name"]) else "") if f["type"] == "image"
                          else r["data"].get(f["name"], "") for f in self.tpl["fields"]]
            self.tree.insert("", "end", iid=str(r["id"]), values=vals)

    def add_row(self):
        if not self.tpl or not self.tpl["fields"]:
            return messagebox.showinfo("ข้อมูล", "ต้องมี Template ที่มีช่องข้อมูลอย่างน้อย 1 ช่องก่อน")
        dlg = RecordDialog(self, self.tpl, {})
        self.wait_window(dlg)
        if dlg.result is not None:
            self.db.add_record(self.tpl["id"], dlg.result)
            self.refresh_data()

    def edit_row(self):
        s = self.tree.selection()
        if not s or not self.tpl:
            return
        rid = int(s[0])
        rec = next(r for r in self.db.records(self.tpl["id"]) if r["id"] == rid)
        dlg = RecordDialog(self, self.tpl, rec["data"])
        self.wait_window(dlg)
        if dlg.result is not None:
            self.db.update_record(rid, dlg.result)
            self.refresh_data()

    def del_rows(self):
        s = self.tree.selection()
        if s and messagebox.askyesno("ลบ", f"ลบ {len(s)} แถว?"):
            self.db.delete_records([int(i) for i in s])
            self.refresh_data()

    def imp_folder(self):
        if not self.tpl:
            return
        d = filedialog.askdirectory(parent=self, title="เลือกโฟลเดอร์รูป (ชื่อไฟล์ = ชื่อคน)")
        if d:
            try:
                n = core.import_image_folder(self.db, self.tpl, d)
            except ValueError as ex:
                return messagebox.showerror("ผิดพลาด", str(ex))
            self.refresh_data()
            messagebox.showinfo("นำเข้า", f"นำเข้า {n} รูป\n(ชื่อไฟล์ถูกใส่ในช่องข้อความช่องแรก)")

    def imp_csv(self):
        if not self.tpl:
            return
        p = filedialog.askopenfilename(parent=self, filetypes=[("CSV", "*.csv")],
                                       title="หัวคอลัมน์ต้องตรงกับชื่อช่อง; ช่องรูปใส่ path ไฟล์")
        if p:
            n = core.import_csv(self.db, self.tpl, p)
            self.refresh_data()
            messagebox.showinfo("นำเข้า", f"นำเข้า {n} แถว")

    # ============================================================ EXPORT TAB
    def _build_export(self):
        f = ttk.Frame(self.t_exp, padding=14)
        f.pack(fill="both", expand=True)
        self.x_scope = tk.StringVar(value="all")
        ttk.Label(f, text="เลือกข้อมูล", font=("Segoe UI", 11, "bold")).grid(row=0, column=0, sticky="w")
        ttk.Radiobutton(f, text="ทุกแถวในฐานข้อมูล", variable=self.x_scope, value="all").grid(row=1, column=0, sticky="w")
        ttk.Radiobutton(f, text="เฉพาะแถวที่เลือกไว้ในแท็บ 'ข้อมูล'", variable=self.x_scope,
                        value="sel").grid(row=2, column=0, sticky="w")
        self.x_count = ttk.Label(f, text="")
        self.x_count.grid(row=3, column=0, sticky="w", pady=(0, 10))

        ttk.Label(f, text="A) บันทึกเป็นไฟล์ภาพแยกทีละใบ", font=("Segoe UI", 11, "bold")).grid(row=4, column=0, sticky="w")
        r = ttk.Frame(f)
        r.grid(row=5, column=0, sticky="w", pady=2)
        self.x_fmt = tk.StringVar(value="PNG")
        ttk.Combobox(r, textvariable=self.x_fmt, values=["PNG", "JPG"], state="readonly", width=6).pack(side="left")
        ttk.Label(r, text="  ตั้งชื่อไฟล์จากช่อง:").pack(side="left")
        self.x_name = tk.StringVar()
        self.x_name_cb = ttk.Combobox(r, textvariable=self.x_name, state="readonly", width=18)
        self.x_name_cb.pack(side="left")
        ttk.Button(r, text="เริ่มสร้าง → เลือกโฟลเดอร์", command=self.do_images).pack(side="left", padx=10)

        ttk.Label(f, text="B) จัดหลายใบลงกระดาษ แล้วบันทึกเป็น PDF (พร้อมพิมพ์/ตัด)",
                  font=("Segoe UI", 11, "bold")).grid(row=6, column=0, sticky="w", pady=(16, 0))
        r = ttk.Frame(f)
        r.grid(row=7, column=0, sticky="w", pady=2)
        self.x_page = tk.StringVar(value="A4")
        ttk.Combobox(r, textvariable=self.x_page, values=["A4", "A3", "Letter"], state="readonly", width=7).pack(side="left")
        self.x_land = tk.BooleanVar()
        ttk.Checkbutton(r, text="แนวนอน", variable=self.x_land).pack(side="left", padx=6)
        ttk.Label(r, text="ขอบ(mm)").pack(side="left")
        self.x_margin = tk.StringVar(value="8")
        ttk.Spinbox(r, from_=0, to=50, width=4, textvariable=self.x_margin).pack(side="left", padx=2)
        ttk.Label(r, text="ระยะห่าง(mm)").pack(side="left")
        self.x_gap = tk.StringVar(value="2")
        ttk.Spinbox(r, from_=0, to=30, width=4, textvariable=self.x_gap).pack(side="left", padx=2)
        ttk.Button(r, text="สร้าง PDF...", command=self.do_pdf).pack(side="left", padx=10)

        self.x_prog = ttk.Progressbar(f, length=420)
        self.x_prog.grid(row=8, column=0, sticky="w", pady=20)

    def refresh_export(self):
        names = [f["name"] for f in self.tpl["fields"] if f["type"] == "text"] if self.tpl else []
        self.x_name_cb["values"] = ["(เลขลำดับ)"] + names
        if self.x_name.get() not in self.x_name_cb["values"]:
            self.x_name.set(names[0] if names else "(เลขลำดับ)")
        n = len(self.db.records(self.tpl["id"])) if self.tpl else 0
        self.x_count.config(text=f"ในฐานข้อมูลมี {n} แถว  |  เลือกอยู่ {len(self.tree.selection())} แถว")

    def chosen_records(self):
        if not self.tpl:
            return []
        recs = self.db.records(self.tpl["id"])
        if self.x_scope.get() == "sel":
            ids = {int(i) for i in self.tree.selection()}
            recs = [r for r in recs if r["id"] in ids]
        if not recs:
            messagebox.showinfo("ไม่มีข้อมูล", "ไม่มีแถวข้อมูลให้สร้าง")
        return recs

    def progress(self, i, n):
        self.x_prog["maximum"], self.x_prog["value"] = n, i
        self.update_idletasks()

    def open_path(self, p):
        try:
            os.startfile(p)  # Windows
        except Exception:
            pass

    def do_images(self):
        recs = self.chosen_records()
        if not recs:
            return
        d = filedialog.askdirectory(parent=self, title="เลือกโฟลเดอร์ปลายทาง")
        if not d:
            return
        nf = self.x_name.get()
        n = core.export_images(self.tpl, recs, d, self.x_fmt.get(),
                               None if nf.startswith("(") else nf, self.progress)
        messagebox.showinfo("เสร็จแล้ว", f"สร้างแล้ว {n} ไฟล์")
        self.open_path(d)

    def do_pdf(self):
        recs = self.chosen_records()
        if not recs:
            return
        p = filedialog.asksaveasfilename(parent=self, defaultextension=".pdf", filetypes=[("PDF", "*.pdf")])
        if not p:
            return
        try:
            pages = core.export_pdf_sheets(self.tpl, recs, p, self.x_page.get(), float(self.x_margin.get()),
                                           float(self.x_gap.get()), self.x_land.get(), self.progress)
        except Exception as ex:
            return messagebox.showerror("ผิดพลาด", str(ex))
        messagebox.showinfo("เสร็จแล้ว", f"สร้าง PDF {pages} หน้า")
        self.open_path(p)


# ================================================================ dialogs
class NewTemplateDialog(tk.Toplevel):
    PRESETS = {"บัตรพนักงาน CR80 แนวตั้ง (54×86 mm)": (54, 86), "บัตรพนักงาน CR80 แนวนอน (86×54 mm)": (86, 54),
               "ป้ายชื่อ 90×60 mm": (90, 60), "ป้ายชื่อ 100×70 mm": (100, 70), "A6 (105×148 mm)": (105, 148),
               "กำหนดเอง": (60, 90)}

    def __init__(self, master):
        super().__init__(master)
        self.title("สร้าง Template ใหม่")
        self.result = None
        self.transient(master)
        self.grab_set()
        f = ttk.Frame(self, padding=12)
        f.pack()
        self.name = tk.StringVar(value="ป้ายชื่อพนักงาน")
        self.preset = tk.StringVar(value=list(self.PRESETS)[0])
        self.w = tk.StringVar(value="54")
        self.h = tk.StringVar(value="86")
        self.dpi = tk.StringVar(value="300")
        ttk.Label(f, text="ชื่อ").grid(row=0, column=0, sticky="w")
        ttk.Entry(f, textvariable=self.name, width=34).grid(row=0, column=1, columnspan=3)
        ttk.Label(f, text="ขนาด").grid(row=1, column=0, sticky="w")
        cb = ttk.Combobox(f, textvariable=self.preset, values=list(self.PRESETS), state="readonly", width=34)
        cb.grid(row=1, column=1, columnspan=3)
        cb.bind("<<ComboboxSelected>>", self.on_preset)
        ttk.Label(f, text="กว้าง×สูง (mm)").grid(row=2, column=0, sticky="w")
        ttk.Entry(f, textvariable=self.w, width=7).grid(row=2, column=1, sticky="w")
        ttk.Entry(f, textvariable=self.h, width=7).grid(row=2, column=2, sticky="w")
        ttk.Label(f, text="ความละเอียด (dpi)").grid(row=3, column=0, sticky="w")
        ttk.Combobox(f, textvariable=self.dpi, values=["150", "300", "600"], width=6).grid(row=3, column=1, sticky="w")
        ttk.Button(f, text="สร้าง", command=self.ok).grid(row=4, column=3, pady=10, sticky="e")

    def on_preset(self, _e):
        w, h = self.PRESETS[self.preset.get()]
        self.w.set(str(w))
        self.h.set(str(h))

    def ok(self):
        try:
            self.result = (self.name.get().strip() or "Template", float(self.w.get()),
                           float(self.h.get()), int(self.dpi.get()))
        except ValueError:
            return messagebox.showerror("ผิดพลาด", "ตัวเลขไม่ถูกต้อง", parent=self)
        self.destroy()


class RecordDialog(tk.Toplevel):
    def __init__(self, master, tpl, data):
        super().__init__(master)
        self.title("ข้อมูล 1 แถว")
        self.result = None
        self.transient(master)
        self.grab_set()
        self.tpl = tpl
        self.vars = {}
        self.imgs = {k: v for k, v in data.items()}
        f = ttk.Frame(self, padding=12)
        f.pack()
        for i, fld in enumerate(tpl["fields"]):
            ttk.Label(f, text=fld["name"]).grid(row=i, column=0, sticky="w", pady=2)
            if fld["type"] == "text":
                v = tk.StringVar(value=data.get(fld["name"], ""))
                self.vars[fld["name"]] = v
                ttk.Entry(f, textvariable=v, width=40).grid(row=i, column=1, columnspan=2)
            else:
                lbl = ttk.Label(f, text="(มีรูป)" if data.get(fld["name"]) else "(ยังไม่มีรูป)", width=26)
                lbl.grid(row=i, column=1, sticky="w")
                ttk.Button(f, text="เลือกรูป...", command=lambda n=fld["name"], l=lbl: self.pick(n, l)).grid(row=i, column=2)
        ttk.Button(f, text="บันทึก", command=self.ok).grid(row=len(tpl["fields"]), column=2, pady=10, sticky="e")

    def pick(self, name, lbl):
        p = filedialog.askopenfilename(parent=self, filetypes=[("Images", "*.png *.jpg *.jpeg *.bmp *.webp *.gif")])
        if p:
            self.imgs[name] = core.store_image(p)
            lbl.config(text=os.path.basename(p))

    def ok(self):
        out = {k: v.get() for k, v in self.vars.items()}
        for fld in self.tpl["fields"]:
            if fld["type"] == "image" and self.imgs.get(fld["name"]):
                out[fld["name"]] = self.imgs[fld["name"]]
        self.result = out
        self.destroy()


if __name__ == "__main__":
    App().mainloop()
