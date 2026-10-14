#!/usr/bin/env python3
"""A desktop bench that plays the external sources of the report channel."""
# Usage: python3 simulator.py [--package 0x..] [--node https://../graphql]

from __future__ import annotations

import argparse
import json
import pathlib
import queue
import threading
import time
import tkinter as tk
from tkinter import font as tkfont
from tkinter import ttk

import channel
import keys

def default_package() -> str:
    dep = pathlib.Path(__file__).resolve().parent.parent / "scripts" / "deployment.testnet.json"
    if dep.exists():
        try:
            pkg = json.loads(dep.read_text()).get("packageId", "")
            if pkg:
                return pkg
        except Exception:
            pass
    return "0x3da1733b1b551e8b55851cd82c06ef02acb970e8996988153ba8db1c271d2b5d"

DEFAULT_PACKAGE = default_package()

STATE_PATH = keys.KEY_DIR.parent / "simulator.json"

PAPER = "#f9f8f5"
CARD = "#ffffff"
INK = "#221e1b"
MUTED = "#6d665f"
BORDER = "#e0dcd6"
INPUT = "#d3cdc5"
ACCENT = "#002f6b"
ON_ACCENT = "#f9f8f5"
SECONDARY = "#f1eeea"
OK_FG = "#1e6742"
WARN_FG = "#894306"
BAD_FG = "#a12521"

CONDITION_TONE = (OK_FG, WARN_FG, BAD_FG, BAD_FG)

OFFSETS = [
    ("τώρα", 0),
    ("πριν από 5 λεπτά", -300_000),
    ("πριν από 11 λεπτά (πολύ παλιά)", -660_000),
    ("σε 5 λεπτά (μπροστά)", 300_000),
]

def plural(n: int, one: str, many: str) -> str:
    return f"{n} {one if n == 1 else many}"

def short(value: str | None, head: int = 10, tail: int = 6) -> str:
    if not value:
        return "—"
    return value if len(value) <= head + tail + 1 else f"{value[:head]}…{value[-tail:]}"

def clock(ms: int | float | str | None) -> str:
    try:
        return time.strftime("%H:%M:%S", time.localtime(int(ms) / 1000))
    except (TypeError, ValueError):
        return "—"

def stamp(ms: int | float | str | None) -> str:
    try:
        when = time.localtime(int(ms) / 1000)
    except (TypeError, ValueError):
        return "—"
    today = time.localtime()
    same_day = (when.tm_year, when.tm_yday) == (today.tm_year, today.tm_yday)
    return time.strftime("%H:%M:%S" if same_day else "%d/%m/%Y %H:%M", when)

def load_state() -> dict:
    try:
        return json.loads(STATE_PATH.read_text())
    except (OSError, ValueError):
        return {}

def save_state(state: dict) -> None:
    try:
        STATE_PATH.parent.mkdir(parents=True, exist_ok=True)
        STATE_PATH.write_text(json.dumps(state, indent=2, ensure_ascii=False) + "\n")
    except OSError:
        pass

class Simulator(ttk.Frame):
    def __init__(self, root: tk.Tk, package: str, node: str, endpoint: str = "") -> None:
        super().__init__(root, padding=0, style="Page.TFrame")
        self.root = root
        self.pack(fill="both", expand=True)
        self.jobs: queue.Queue = queue.Queue()
        self.state = load_state()
        self.busy = 0
        self.timer: str | None = None
        self.logged_endpoint: str | None = None

        self.package = tk.StringVar(value=package or DEFAULT_PACKAGE)
        if self.state.get("package") and self.state.get("package") != self.package.get():
            self.state["artwork"] = ""
            self.state["artworks"] = []
        self.node = tk.StringVar(value=node or self.state.get("node") or channel.DEFAULT_GRAPHQL)
        self.endpoint = tk.StringVar(value=endpoint)
        self.artwork = tk.StringVar(value=self.state.get("artwork", ""))
        self.condition = tk.IntVar(value=1)
        self.offset = tk.StringVar(value=OFFSETS[0][0])
        self.repeat = tk.BooleanVar(value=False)
        self.every = tk.StringVar(value="10")
        self.status = tk.StringVar(value="")

        self.policy: dict | None = None
        self.catalogue: dict[str, str] = {}   # what the field shows -> artwork id
        self.artwork_choices: list[str] = []
        self.sources: dict[str, keys.Source] = {}
        self.entries: dict[str, dict | None] = {}

        self.fonts()
        self.styles()
        self.build()
        self.after(100, self.drain)
        self.reload_sources()
        self.connect()

    def fonts(self) -> None:
        families = set(tkfont.families())
        sans = next((f for f in ("Noto Sans", "DejaVu Sans", "Liberation Sans") if f in families), "TkDefaultFont")
        serif = next((f for f in ("Noto Serif", "DejaVu Serif", "Liberation Serif") if f in families), sans)
        mono = next((f for f in ("Noto Sans Mono", "DejaVu Sans Mono", "Liberation Mono") if f in families), "TkFixedFont")
        self.f_body = (sans, 10)
        self.f_small = (sans, 9)
        self.f_medium = (sans, 10, "bold")
        self.f_title = (serif, 16)
        self.f_card = (serif, 11)
        self.f_mark = (serif, 15, "bold")
        self.f_mono = (mono, 9)

    def styles(self) -> None:
        self.root.configure(background=PAPER)
        s = ttk.Style()
        try:
            s.theme_use("clam")
        except tk.TclError:
            pass
        s.configure("Page.TFrame", background=PAPER)
        s.configure("Card.TFrame", background=CARD, borderwidth=1, relief="solid", bordercolor=BORDER)
        s.configure("CardBody.TFrame", background=CARD, borderwidth=0)
        s.configure("Body.TLabel", background=CARD, foreground=INK, font=self.f_body)
        s.configure("Muted.TLabel", background=CARD, foreground=MUTED, font=self.f_small)
        s.configure("Medium.TLabel", background=CARD, foreground=INK, font=self.f_medium)
        s.configure("CardTitle.TLabel", background=CARD, foreground=INK, font=self.f_card)
        s.configure("Mono.TLabel", background=CARD, foreground=INK, font=self.f_mono)
        s.configure("PageTitle.TLabel", background=PAPER, foreground=INK, font=self.f_title)
        s.configure("PageMuted.TLabel", background=PAPER, foreground=MUTED, font=self.f_small)
        s.configure("Ok.TLabel", background=CARD, foreground=OK_FG, font=self.f_small)
        s.configure("Warn.TLabel", background=CARD, foreground=WARN_FG, font=self.f_small)
        s.configure("Bad.TLabel", background=CARD, foreground=BAD_FG, font=self.f_small)

        s.configure(
            "Primary.TButton",
            background=ACCENT, foreground=ON_ACCENT, font=self.f_medium,
            borderwidth=0, focuscolor=ACCENT, padding=(14, 7),
        )
        s.map("Primary.TButton", background=[("active", "#023a80"), ("disabled", SECONDARY)],
              foreground=[("disabled", MUTED)])
        s.configure(
            "Quiet.TButton",
            background=CARD, foreground=INK, font=self.f_small,
            borderwidth=1, bordercolor=INPUT, focuscolor=CARD, padding=(10, 5),
        )
        s.map("Quiet.TButton", background=[("active", SECONDARY)], bordercolor=[("active", ACCENT)])
        s.configure("TEntry", fieldbackground=CARD, bordercolor=INPUT, foreground=INK,
                    insertcolor=INK, padding=5)
        s.map("TEntry", bordercolor=[("focus", ACCENT)])
        s.configure("TCheckbutton", background=CARD, foreground=INK, font=self.f_small,
                    focuscolor=CARD)
        s.configure("Cond.Toolbutton", background=CARD, foreground=INK, font=self.f_small,
                    focuscolor=CARD, padding=(4, 5), borderwidth=1, bordercolor=INPUT)
        s.map("Cond.Toolbutton",
              background=[("selected", ACCENT), ("active", SECONDARY)],
              foreground=[("selected", ON_ACCENT)])
        s.configure("Field.TButton", background=CARD, foreground=INK, font=self.f_small,
                    borderwidth=1, bordercolor=INPUT, focuscolor=CARD, padding=(8, 5), anchor="w")
        s.map("Field.TButton", bordercolor=[("active", ACCENT)], background=[("active", CARD)])
        s.configure("Mark.TLabel", background=PAPER, foreground=ACCENT, font=self.f_mark)
        s.configure("Treeview", background=CARD, fieldbackground=CARD, foreground=INK,
                    font=self.f_body, borderwidth=0, rowheight=26)
        s.configure("Treeview.Heading", background=CARD, foreground=MUTED, font=self.f_small,
                    borderwidth=0, relief="flat")
        s.map("Treeview", background=[("selected", SECONDARY)], foreground=[("selected", INK)])

    def card(self, parent: tk.Widget, title: str, note: str | None = None, wrap: int = 520) -> ttk.Frame:
        outer = ttk.Frame(parent, style="Card.TFrame", padding=13)
        ttk.Label(outer, text=title, style="CardTitle.TLabel").pack(anchor="w")
        if note:
            ttk.Label(outer, text=note, style="Muted.TLabel", wraplength=wrap, justify="left").pack(
                anchor="w", pady=(3, 0)
            )
        body = ttk.Frame(outer, style="CardBody.TFrame")
        body.pack(fill="both", expand=True, pady=(10, 0))
        return body

    def row(self, parent: tk.Widget, label: str, value: str = "—", mono: bool = False,
            wrap: int = 360) -> tk.StringVar:
        var = tk.StringVar(value=value)
        line = ttk.Frame(parent, style="CardBody.TFrame")
        line.pack(fill="x", pady=1)
        ttk.Label(line, text=label, style="Muted.TLabel", width=22).pack(side="left", anchor="n")
        text = ttk.Label(line, textvariable=var, style="Mono.TLabel" if mono else "Body.TLabel",
                         wraplength=wrap, justify="left")
        text.pack(side="left", anchor="n", fill="x", expand=True)
        def rewrap(event: tk.Event) -> None:
            if abs(event.width - text.cget("wraplength")) > 4:
                text.configure(wraplength=max(120, event.width - 4))
        text.bind("<Configure>", rewrap)
        return var

    def picker(self, parent: tk.Widget, after: tk.Widget, var: tk.StringVar, choices):
        holder = ttk.Frame(parent, style="CardBody.TFrame")
        listbox = tk.Listbox(
            holder, font=self.f_small, background=CARD, foreground=INK,
            selectbackground=SECONDARY, selectforeground=INK, activestyle="none",
            highlightthickness=1, highlightcolor=INPUT, highlightbackground=INPUT,
            borderwidth=0, height=1,
        )
        bar = ttk.Scrollbar(holder, orient="vertical", command=listbox.yview)
        listbox.configure(yscrollcommand=bar.set)
        listbox.pack(side="left", fill="x", expand=True)

        def hide() -> None:
            holder.pack_forget()

        def pick(_event: tk.Event) -> None:
            selection = listbox.curselection()
            if selection:
                var.set(listbox.get(selection[0]))
            hide()

        def toggle() -> None:
            if holder.winfo_ismapped():
                hide()
                return
            values = list(choices() if callable(choices) else choices)
            listbox.delete(0, "end")
            for value in values or ["(κανένα ακόμη)"]:
                listbox.insert("end", value)
            listbox.configure(height=min(6, max(1, len(values) or 1)))
            # the bar appears only when the list is taller than the box
            if len(values) > 6:
                bar.pack(side="right", fill="y")
            else:
                bar.pack_forget()
            holder.pack(fill="x", pady=(4, 0), after=after)

        listbox.bind("<<ListboxSelect>>", pick)
        button = ttk.Button(parent, text="▾", style="Field.TButton", width=2, command=toggle)
        return button

    def build(self) -> None:
        self.root.title("Προσομοιωτής εξωτερικών πηγών")

        head = ttk.Frame(self, style="Page.TFrame", padding=(20, 12, 20, 4))
        head.pack(fill="x")
        ttk.Label(head, text="ArtTokenization", style="Mark.TLabel").pack(side="right", anchor="n")
        ttk.Label(head, text="Προσομοιωτής εξωτερικών πηγών", style="PageTitle.TLabel").pack(anchor="w")

        bar = ttk.Frame(self, style="Page.TFrame", padding=(20, 6, 20, 6))
        bar.pack(fill="x")
        ttk.Label(bar, textvariable=self.status, style="PageMuted.TLabel").pack(side="right", padx=(8, 0))
        ttk.Button(bar, text="Ανάγνωση αλυσίδας", style="Quiet.TButton", command=self.connect).pack(side="right")
        ttk.Label(bar, text="Πακέτο", style="PageMuted.TLabel").pack(side="left")
        ttk.Entry(bar, textvariable=self.package, font=self.f_mono).pack(
            side="left", fill="x", expand=True, padx=(6, 14))
        ttk.Label(bar, text="Κόμβος", style="PageMuted.TLabel").pack(side="left")
        ttk.Entry(bar, textvariable=self.node, font=self.f_mono).pack(
            side="left", fill="x", expand=True, padx=(6, 14))

        self.build_log()
        body = self.scrollable()
        body.columnconfigure(0, weight=3, uniform="col")
        body.columnconfigure(1, weight=4, uniform="col")
        body.rowconfigure(0, weight=1)

        left = ttk.Frame(body, style="Page.TFrame")
        left.grid(row=0, column=0, sticky="nsew", padx=(0, 8))
        right = ttk.Frame(body, style="Page.TFrame")
        right.grid(row=0, column=1, sticky="nsew")

        self.build_sources(left)
        self.build_channel(right)
        self.build_reading(right)

    def scrollable(self) -> ttk.Frame:
        holder = ttk.Frame(self, style="Page.TFrame")
        holder.pack(fill="both", expand=True)
        canvas = tk.Canvas(holder, background=PAPER, highlightthickness=0, borderwidth=0)
        bar = ttk.Scrollbar(holder, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=bar.set)
        bar.pack(side="right", fill="y")
        canvas.pack(side="left", fill="both", expand=True)

        inner = ttk.Frame(canvas, style="Page.TFrame", padding=(20, 6, 20, 10))
        window = canvas.create_window((0, 0), window=inner, anchor="nw")
        inner.bind("<Configure>", lambda _e: canvas.configure(scrollregion=canvas.bbox("all")))
        canvas.bind("<Configure>", lambda e: canvas.itemconfigure(window, width=e.width))

        def wheel(event: tk.Event) -> None:
            # The log has its own scrollbar; let it keep its wheel.
            if isinstance(event.widget, tk.Text):
                return
            step = -1 if getattr(event, "num", 0) == 4 or getattr(event, "delta", 0) > 0 else 1
            canvas.yview_scroll(step, "units")

        for sequence in ("<Button-4>", "<Button-5>", "<MouseWheel>"):
            self.bind_all(sequence, wheel)
        self.canvas = canvas
        return inner

    def build_sources(self, parent: tk.Widget) -> None:
        body = self.card(parent, "Πηγές")
        body.master.pack(fill="both", expand=True)

        self.list = ttk.Treeview(body, columns=("name", "state"), show="headings", height=4,
                                 selectmode="browse")
        self.list.heading("name", text="Συσκευή", anchor="w")
        self.list.heading("state", text="Μητρώο", anchor="e")
        self.list.column("name", width=140, anchor="w")
        self.list.column("state", width=150, anchor="e")
        self.list.pack(fill="x")
        self.list.bind("<<TreeviewSelect>>", lambda _e: self.on_source())
        self.list.tag_configure("active", foreground=OK_FG)
        self.list.tag_configure("revoked", foreground=BAD_FG)
        self.list.tag_configure("unknown", foreground=MUTED)

        self.v_address = self.row(body, "Διεύθυνση", mono=True, wrap=285)
        self.v_entry = self.row(body, "Εγγραφή", wrap=285)
        self.v_activity = self.row(body, "Αναφορές της πηγής", wrap=285)

        buttons = ttk.Frame(body, style="CardBody.TFrame")
        buttons.pack(fill="x", pady=(12, 0))
        ttk.Button(buttons, text="Νέα πηγή", style="Quiet.TButton", command=self.new_source).pack(side="left")
        ttk.Button(buttons, text="Αντιγραφή", style="Quiet.TButton",
                   command=self.copy_address).pack(side="left", padx=6)
        ttk.Button(buttons, text="Ανανέωση", style="Quiet.TButton",
                   command=self.refresh_source).pack(side="right")

        answer = self.card(parent, "Τι λέει η αλυσίδα")
        answer.master.pack(fill="x", pady=(10, 0))
        self.v_log = self.row(answer, "Μητρώο αναφορών", wrap=285)
        self.v_last = self.row(answer, "Τελευταία κατάσταση", wrap=285)

    def build_channel(self, parent: tk.Widget) -> None:
        body = self.card(parent, "Το κανάλι, όπως το δημοσίευσε η αρχή")
        body.master.pack(fill="x")
        self.v_endpoint = self.row(body, "Σημείο εισόδου", mono=True)
        self.v_window = self.row(body, "Παράθυρο συνάθροισης")
        self.v_enclave = self.row(body, "Αποδεκτός θάλαμος", mono=True)

    def build_reading(self, parent: tk.Widget) -> None:
        body = self.card(parent, "Ένδειξη")
        body.master.pack(fill="both", expand=True, pady=(10, 0))

        line = ttk.Frame(body, style="CardBody.TFrame")
        line.pack(fill="x", pady=2)
        ttk.Label(line, text="Έργο", style="Muted.TLabel", width=22).pack(side="left")
        ttk.Entry(line, textvariable=self.artwork, font=self.f_mono).pack(
            side="left", fill="x", expand=True)
        self.picker(body, line, self.artwork, lambda: self.artwork_choices).pack(
            in_=line, side="left", padx=(4, 0))
        ttk.Button(line, text="Έλεγχος", style="Quiet.TButton", command=self.inspect).pack(side="left", padx=(6, 0))

        ttk.Label(body, text="Κατάσταση", style="Muted.TLabel").pack(anchor="w", pady=(10, 3))
        segmented = ttk.Frame(body, style="CardBody.TFrame")
        segmented.pack(fill="x")
        for value, label in enumerate(keys.CONDITIONS):
            ttk.Radiobutton(segmented, text=label, value=value, variable=self.condition,
                            style="Cond.Toolbutton").pack(side="left", fill="x", expand=True,
                                                          padx=(0, 3))

        line = ttk.Frame(body, style="CardBody.TFrame")
        line.pack(fill="x", pady=2)
        ttk.Label(line, text="Χρόνος παρατήρησης", style="Muted.TLabel", width=22).pack(side="left")
        ttk.Label(line, textvariable=self.offset, style="Body.TLabel").pack(side="left")
        self.picker(body, line, self.offset, [label for label, _ in OFFSETS]).pack(
            in_=line, side="left", padx=(8, 0))

        line = ttk.Frame(body, style="CardBody.TFrame")
        line.pack(fill="x", pady=(14, 0))
        ttk.Button(line, text="Αποστολή ένδειξης", style="Primary.TButton",
                   command=self.send).pack(side="left")
        ttk.Checkbutton(line, text="κάθε", variable=self.repeat, command=self.tick,
                        style="TCheckbutton").pack(side="left", padx=(12, 4))
        ttk.Entry(line, textvariable=self.every, width=4, font=self.f_mono).pack(side="left")
        ttk.Label(line, text="δευτερόλεπτα", style="Muted.TLabel").pack(side="left", padx=(4, 0))

    def build_log(self) -> None:
        wrap = ttk.Frame(self, style="Page.TFrame", padding=(20, 6, 20, 12))
        wrap.pack(side="bottom", fill="x")
        box = ttk.Frame(wrap, style="Card.TFrame", padding=1)
        box.pack(fill="both")
        self.out = tk.Text(box, height=5, wrap="word", font=self.f_mono, background=CARD,
                           foreground=INK, relief="flat", padx=12, pady=10,
                           highlightthickness=0, borderwidth=0)
        bar = ttk.Scrollbar(box, orient="vertical", command=self.out.yview)
        self.out.configure(yscrollcommand=bar.set, state="disabled")
        bar.pack(side="right", fill="y")
        self.out.pack(side="left", fill="both", expand=True)
        self.out.tag_configure("ok", foreground=OK_FG)
        self.out.tag_configure("bad", foreground=BAD_FG)
        self.out.tag_configure("dim", foreground=MUTED)

    def bg(self, label: str, work, then=None) -> None:
        self.busy += 1
        self.status.set("…")

        def run() -> None:
            try:
                result = work()
            except Exception as error:  # noqa: BLE001  every failure is a log line
                self.post(lambda error=error: self.log(f"{label}: {error}", "bad"))
            else:
                if then:
                    self.post(lambda result=result: then(result))
            finally:
                self.post(self.done)

        threading.Thread(target=run, daemon=True).start()

    def done(self) -> None:
        self.busy = max(0, self.busy - 1)
        self.status.set("…" if self.busy else "")

    def post(self, callback) -> None:
        self.jobs.put(callback)

    def drain(self) -> None:
        while True:
            try:
                callback = self.jobs.get_nowait()
            except queue.Empty:
                break
            try:
                callback()
            except Exception as error:  # noqa: BLE001
                self.log(f"σφάλμα διεπαφής: {error}", "bad")
        self.after(100, self.drain)

    def log(self, text: str, tag: str = "dim") -> None:
        self.out.configure(state="normal")
        self.out.insert("end", f"{time.strftime('%H:%M:%S')}  {text}\n", tag)
        self.out.see("end")
        self.out.configure(state="disabled")

    def chain(self) -> channel.Chain:
        return channel.Chain(self.node.get().strip(), self.package.get().strip())

    def remember(self) -> None:
        self.state.update(
            package=self.package.get().strip(),
            node=self.node.get().strip(),
            artwork=self.artwork_id(),
        )
        artwork = self.artwork_id()
        if artwork:
            rest = [a for a in self.state.get("artworks", []) if a != artwork]
            self.state["artworks"] = [artwork] + rest[:19]
        save_state(self.state)

    def reload_sources(self) -> None:
        self.sources = {}
        for name in keys.names():
            try:
                self.sources[name] = keys.load(name)
            except Exception as error:  # noqa: BLE001
                self.log(f"{name}: {error}", "bad")
        self.fill_sources()
        wanted = self.state.get("source")
        if wanted in self.sources:
            self.list.selection_set(wanted)
        elif self.sources:
            self.list.selection_set(next(iter(self.sources)))

    def state_of(self, name: str) -> tuple[str, str]:
        entry = self.entries.get(name)
        if entry is None:
            return "άγνωστη", "unknown"
        return ("καταχωρημένη", "active") if entry.get("active") else ("ανακληθείσα", "revoked")

    def fill_sources(self) -> None:
        self.list.delete(*self.list.get_children())
        for name in self.sources:
            label, tag = self.state_of(name)
            self.list.insert("", "end", iid=name, values=(name, label), tags=(tag,))

    def selected(self) -> keys.Source | None:
        selection = self.list.selection()
        return self.sources.get(selection[0]) if selection else None

    def on_source(self) -> None:
        source = self.selected()
        if not source:
            return
        self.state["source"] = source.name
        save_state(self.state)
        self.v_address.set(source.address)
        self.v_entry.set("…")
        self.v_activity.set("…")
        self.refresh_source()

    def refresh_sources(self) -> None:
        chain = self.chain()
        for source in list(self.sources.values()):
            self.bg(
                f"μητρώο {source.name}",
                lambda s=source: chain.registry_entry(s.address),
                lambda entry, s=source: self.on_entry(s.name, entry),
            )

    def on_entry(self, name: str, entry: dict | None) -> None:
        self.entries[name] = entry
        label, tag = self.state_of(name)
        self.list.item(name, values=(name, label), tags=(tag,))
        chosen = self.selected()
        if chosen and chosen.name == name:
            self.show_entry(entry)

    def show_entry(self, entry: dict | None) -> None:
        if entry is None:
            self.v_entry.set("δεν είναι καταχωρημένη, οι ενδείξεις της θα απορρίπτονται")
        else:
            state = "ενεργή" if entry.get("active") else "ανακληθείσα"
            since = stamp(entry.get("since"))
            self.v_entry.set(
                f"{entry.get('name') or '—'}, {entry.get('kind') or '—'}, {state} από {since}"
            )

    def refresh_source(self) -> None:
        source = self.selected()
        if not source:
            return
        chain = self.chain()

        def work() -> tuple[dict | None, dict | None]:
            return chain.registry_entry(source.address), chain.activity(source.address)

        def then(result) -> None:
            entry, activity = result
            self.on_entry(source.name, entry)
            if activity:
                self.v_activity.set(
                    plural(int(activity.get("reports") or 0), "αναφορά", "αναφορές")
                    + f", τελευταία στις {stamp(activity.get('last_at'))}"
                )
            else:
                self.v_activity.set("καμία αναφορά ακόμη")

        self.bg("μητρώο πηγών", work, then)

    def new_source(self) -> None:
        name = ask(self.root, self, "Νέα πηγή", "Όνομα συσκευής, π.χ. sensor-hall-4")
        if not name:
            return
        name = name.strip()
        if not name or "/" in name or name.startswith("."):
            self.log("μη έγκυρο όνομα συσκευής", "bad")
            return
        try:
            source = keys.create(name)
        except Exception as error:  # noqa: BLE001
            self.log(str(error), "bad")
            return
        self.log(f"νέα πηγή {name}, διεύθυνση {source.address}", "ok")
        self.log(
            "το κλειδί γράφτηκε έξω από το repository. Καταχωρήστε τη διεύθυνση από τη σελίδα "
            "διαχείρισης, αλλιώς ο θάλαμος θα απορρίπτει τις ενδείξεις της."
        )
        self.reload_sources()
        self.list.selection_set(name)

    def copy_address(self) -> None:
        source = self.selected()
        if not source:
            return
        self.root.clipboard_clear()
        self.root.clipboard_append(source.address)
        self.log("η διεύθυνση αντιγράφηκε")

    def connect(self) -> None:
        current_pkg = self.package.get().strip()
        if self.state.get("package") and self.state.get("package") != current_pkg:
            self.state["artwork"] = ""
            self.state["artworks"] = []
            self.artwork.set("")
            self.catalogue = {}
            self.artwork_choices = []
        self.remember()
        chain = self.chain()
        self.bg("ανάγνωση αλυσίδας", chain.policy, self.on_policy)
        self.bg("κατάλογος", chain.artworks, self.on_catalogue)
        self.refresh_sources()
        self.refresh_source()

    def on_catalogue(self, works: list[dict]) -> None:
        self.catalogue = {
            f"{w['title']} · {w['artist']} · {short(w['id'], 8, 4)}": w["id"] for w in works
        }
        remembered = [a for a in self.state.get("artworks", []) if a not in self.catalogue.values()]
        self.artwork_choices = list(self.catalogue) + remembered
        if works:
            self.log(f"ο κατάλογος δίνει {len(works)} {'έργο' if len(works) == 1 else 'έργα'}")
        else:
            self.log("ο κατάλογος είναι κενός (δεν έχουν εκδοθεί έργα ακόμη)")

    def on_policy(self, policy: dict) -> None:
        self.policy = policy
        self.v_endpoint.set(policy["endpoint"] or "δεν έχει δημοσιευτεί")
        self.v_window.set(f"{policy['windowMs'] // 1000} δευτερόλεπτα")
        self.v_enclave.set(policy["acceptedEnclave"] or "κανείς, το κανάλι δεν καταγράφει")
        self.log(
            f"το κανάλι απάντησε: παράθυρο {policy['windowMs'] // 1000}s, "
            f"σημείο εισόδου {policy['endpoint'] or 'κενό'}",
            "ok",
        )

    def target(self) -> str:
        manual = self.endpoint.get().strip()
        published = (self.policy or {}).get("endpoint", "")
        if manual:
            return manual
        if published:
            return published
        raise channel.ChannelError(
            "η αρχή δεν έχει δημοσιεύσει σημείο εισόδου και δεν δόθηκε χειροκίνητο"
        )

    def artwork_id(self) -> str:
        text = self.artwork.get().strip()
        return self.catalogue.get(text, text)

    def send(self) -> None:
        source = self.selected()
        artwork = self.artwork_id()
        try:
            if not source:
                raise channel.ChannelError("διαλέξτε πηγή")
            if not artwork.startswith("0x"):
                raise channel.ChannelError("δώστε το αναγνωριστικό του έργου")
            endpoint = self.target()
        except channel.ChannelError as error:
            self.log(str(error), "bad")
            return

        offset = next(value for label, value in OFFSETS if label == self.offset.get())
        observed_at = int(time.time() * 1000) + offset
        condition = self.condition.get()
        request = source.sign(artwork, condition, observed_at)
        self.remember()

        def then(accepted: dict) -> None:
            self.log(
                f"{keys.CONDITIONS[condition]} για {short(artwork)}: η ένδειξη έγινε δεκτή, "
                f"{accepted['readings']} στο παράθυρο, κλείνει στις {clock(accepted['closes_at'])}",
                "ok",
            )
            # The chain is the answer that counts, so it is re-read on the spot.
            self.refresh_chain()

        if endpoint != self.logged_endpoint:
            self.log(f"αποστολή προς {endpoint}")
            self.logged_endpoint = endpoint
        self.bg("ένδειξη", lambda: channel.send_reading(endpoint, request), then)

    def tick(self) -> None:
        if self.timer is not None:
            self.after_cancel(self.timer)
            self.timer = None
        if not self.repeat.get():
            return
        self.send()
        try:
            seconds = max(2, int(self.every.get()))
        except ValueError:
            seconds = 10
        self.timer = self.after(seconds * 1000, self.tick)

    def inspect(self) -> None:
        artwork = self.artwork_id()
        if not artwork.startswith("0x"):
            self.log("δώστε το αναγνωριστικό του έργου", "bad")
            return
        chain = self.chain()

        def then(work: dict | None) -> None:
            if not work or "title" not in work:
                self.log(f"το {short(artwork)} δεν φαίνεται να είναι έργο", "bad")
                return
            self.log(f"{work.get('title')}, {work.get('artist_name')}", "ok")

        self.bg("έλεγχος έργου", lambda: chain.artwork(artwork), then)
        self.refresh_chain()

    def refresh_chain(self) -> None:
        artwork = self.artwork_id()
        if not artwork.startswith("0x"):
            return
        chain = self.chain()

        def then(log: dict | None) -> None:
            if not log:
                self.v_log.set("το έργο δεν έχει καταχώριση φύλαξης, καμία αναφορά δεν μπορεί να γραφτεί")
                self.v_last.set("—")
                return
            self.v_log.set(
                plural(log["count"], "αναφορά", "αναφορές")
                + f", {log['notOk']} με πρόβλημα"
            )
            self.v_last.set(
                f"{keys.CONDITIONS[log['lastCondition']]}, στις {stamp(log['lastAt'])}"
                if log["count"]
                else "καμία ακόμη"
            )

        self.bg("μητρώο αναφορών", lambda: chain.report_log(artwork), then)
        self.refresh_source()

def ask(root: tk.Tk, app: Simulator, title: str, prompt: str) -> str | None:
    top = tk.Toplevel(root, background=CARD)
    top.title(title)
    top.transient(root)
    top.resizable(False, False)
    frame = ttk.Frame(top, style="Card.TFrame", padding=16)
    frame.pack(fill="both", expand=True)
    ttk.Label(frame, text=prompt, style="Body.TLabel").pack(anchor="w")
    value = tk.StringVar()
    entry = ttk.Entry(frame, textvariable=value, width=40, font=app.f_mono)
    entry.pack(fill="x", pady=10)
    entry.focus_set()
    answer: dict[str, str | None] = {"value": None}

    def accept() -> None:
        answer["value"] = value.get()
        top.destroy()

    buttons = ttk.Frame(frame, style="CardBody.TFrame")
    buttons.pack(fill="x")
    ttk.Button(buttons, text="Εντάξει", style="Primary.TButton", command=accept).pack(side="right")
    ttk.Button(buttons, text="Άκυρο", style="Quiet.TButton", command=top.destroy).pack(side="right", padx=6)
    top.bind("<Return>", lambda _e: accept())
    top.bind("<Escape>", lambda _e: top.destroy())
    top.grab_set()
    root.wait_window(top)
    return answer["value"]

def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--package", default="", help="the package id the device is provisioned with")
    parser.add_argument("--node", default="", help=f"Sui GraphQL service (default {channel.DEFAULT_GRAPHQL})")
    parser.add_argument("--endpoint", default="",
                        help="send here instead of the address the authority published")
    args = parser.parse_args()

    keys.selftest()
    root = tk.Tk()
    root.geometry("1140x880")
    root.minsize(820, 520)
    Simulator(root, args.package, args.node, args.endpoint)
    root.mainloop()

if __name__ == "__main__":
    main()
