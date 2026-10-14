#!/usr/bin/env python3
"""Πίνακας και διάγραμμα κόστους για την ενότητα 6.2, από τα αποθηκευμένα effects."""
import json, os, re

HERE = os.path.dirname(__file__)
EFF = os.path.join(HERE, "..", "assets", "evaluation", "effects")
SVG = os.path.join(HERE, "..", "assets", "figures", "chap6", "gas-per-op.svg")
TYP = os.path.join(HERE, "..", "assets", "figures", "chap6", "gas-table.typ")

SUI_USD = 0.70                       # ισοτιμίες που δηλώνονται στο κείμενο
WAL_USD = 0.03
COMP, STOR = "#1f5fa8", "#a62626"    # επικυρωμένο ζεύγος
INK, MUTED, GRID = "#1f2933", "#6b7280", "#e3e6ea"

# Οι 18 συναλλαγές του πίνακα. Κάθε πράξη μπορεί να περιλαμβάνει περισσότερες από μία.
FLOW = [
    ("Έκδοση έργου",            ["8MLx9rbe2waesTgingkGsUUPSmLseFZ2sVpLfzzSfNSd",
                                 "3Tr52UtMrXtFEGp3pyUWjWBCBHqpCyoum3TshFe8wz1d",
                                 "FcJLbFVvh5Hs7CTXnuWS2B88yRCPsdLiojpFXUN5k5RQ"]),
    ("Έκδοση πιστοποιητικού",   ["7bwyvCtfCdWrY6ocfkXvTDxkgJEqPmdmE7pYCREYEyjb",
                                 "BEZqpBu6iWbtWe3Zd91dVz94BH8WqJJ62JUMqDwT4PPo",
                                 "5X5mfsS1diYoT5NwM9hbo7zZPiGcyReWWA8vTSy9sxzK"]),
    ("Καταχώριση παραλαβής",    ["AzNYCzZ63SpvVH27cZV7Ng2FSm5GYxxN9FH4DSCyJeNt"]),
    ("Δημιουργία αγγελίας",     ["129YwsxUshvuhjka7TLxu71cTLwRpi5BEGCqPgtgHEAR"]),
    ("Κλασματοποίηση",          ["5bQN3p2hHxAxT8NbaH35BiHENuUrsPz1v4HQmiuNyfgF"]),
    ("Αγορά, μεταπώληση",       ["GwA7mevDtvJRUQxpRBdb4bbUtBZkWtNNJFqJmcG8uw3j"]),
    ("Ανάθεση νέας γκαλερί",    ["EGtPuCN8Q6qRRQHyQv7CcZX7NtM3k4UxU3DpgWkgMYVC"]),
    ("Αγορά, πρωτογενής",       ["BdLt6jnfvXGjFgjDzPj8NqtCFXvQUeudtK2jUXwRKa65"]),
    ("Δήλωση απώλειας",         ["8W5MKPL1PKVBxQo4X7wbHUPzFL7vqdBMvhNPxS6kKXEM"]),
    ("Ακύρωση έκδοσης",         ["291aLjgCw1azMxzg5khZWTKcRY9bEsaDVRRPM43HDwma"]),
    ("Ακύρωση αγγελίας",        ["22D7Ku26raXtmh3367GfyPno9NwS4WMEskT5xVBcbPaG"]),
    ("Ανάκληση από το μητρώο",  ["CP5kuypXvnstpqRS53UjuUoNWJ9u2mWmTDZtB5PkJKnC"]),
    ("Εγγραφή στο μητρώο",      ["tDTHH9mwetEsdTYuswnb1VkF5zgs8oUU2YVfYKpJV5a"]),
    ("Ενοποίηση κλασμάτων",     ["C39T5eke7orWjAwXh6rCDco7LCcoUtaK8wRMNqd3Cy4D"]),
]


def gas(d):
    """Αέριο σε SUI και, χωριστά, η πληρωμή αποθήκευσης στο Walrus σε WAL."""
    tx = json.load(open(os.path.join(EFF, f"{d}.json"), encoding="utf-8"))
    g = tx["effects"]["gasUsed"]
    wal = sum(int(b["amount"]) for b in tx.get("balanceChanges", [])
              if "WAL" in b.get("coinType", "").upper())
    return (*(int(g[k]) for k in ("computationCost", "storageCost", "storageRebate")), -wal)


def rows():
    out = []
    for label, ds in FLOW:
        c = s = r = w = 0
        for d in ds:
            a, b, e, wl = gas(d)
            c, s, r, w = c + a, s + b, r + e, w + wl
        out.append({"label": label, "txs": len(ds), "comp": c, "stor": s,
                    "reb": r, "net": c + s - r, "wal": w})
    return out


def sui(n, dec=6):
    """MIST σε SUI, με ελληνικό υποδιαστολικό κόμμα."""
    return f"{n / 1e9:.{dec}f}".replace(".", ",")


def typst(rs):
    def money(r):
        return f"{r['net'] / 1e9 * SUI_USD + r['wal'] / 1e9 * WAL_USD:.4f}".replace(".", ",")

    top = max(r["net"] for r in rs)                      # η ακριβότερη πράξη, σε κεχριμπαρένιο
    def net_cell(r):
        """Η στήλη «καθαρό» φέρει το νόημα, οπότε χρωματίζεται."""
        v = sui(r["net"])
        if r["net"] < 0:
            return f'gain[{v}]'
        if r["net"] == top:
            return f'peak[{v}]'
        return f'[*{v}*]'

    body = "\n".join(
        f'            [{r["label"]}], [{r["txs"]}], [{sui(r["comp"])}], [{sui(r["stor"])}], '
        f'[{sui(r["reb"])}], {net_cell(r)}, '
        f'[{sui(r["wal"]) if r["wal"] else "#none-cell"}], '
        f'[{money(r)}],' for r in rs)
    return f'''// παράγεται από scripts/make_gas_figures.py, μην το επεξεργάζεσαι
#let gain(v) = table.cell(fill: rgb("#dff2e3"))[#text(fill: rgb("#1e6f34"), weight: "bold")[#v]]
#let peak(v) = table.cell(fill: rgb("#fdf0cf"))[#text(fill: rgb("#8a5a00"), weight: "bold")[#v]]
#let none-cell = text(fill: luma(160))[-]

#table(
    columns: (1fr, auto, auto, auto, auto, auto, auto, auto),
    align: (left + horizon,) + (right + horizon,) * 7,
    stroke: 0.4pt + luma(170),
    inset: (x: 5pt, y: 4pt),
    fill: (x, y) => if y < 2 {{ none }}
        else if x == 5 {{ rgb("#eef4fb") }}
        else if calc.rem(y, 2) == 1 {{ luma(246) }}
        else {{ none }},
    table.cell(fill: luma(235), align: center + horizon, rowspan: 2)[*Πράξη*],
    table.cell(fill: luma(235), align: center + horizon, rowspan: 2)[*Συν.*],
    table.cell(fill: rgb("#dce8f5"), align: center + horizon, colspan: 4)[*Αλυσίδα SUI*],
    table.cell(fill: luma(235), align: center + horizon)[*Walrus*],
    table.cell(fill: luma(235), align: center + horizon, rowspan: 2)[*Δολάρια*],
    table.cell(fill: rgb("#eaf1f9"), align: center + horizon)[υπολογισμός],
    table.cell(fill: rgb("#eaf1f9"), align: center + horizon)[αποθήκευση],
    table.cell(fill: rgb("#eaf1f9"), align: center + horizon)[επιστροφή],
    table.cell(fill: rgb("#c9dcef"), align: center + horizon)[*καθαρό*],
    table.cell(fill: luma(242), align: center + horizon)[WAL],
{body}
)
'''


def svg(rs):
    rs = sorted(rs, key=lambda r: -r["net"])
    L, R, TOP, BOT, ROW, BARH = 176, 96, 56, 40, 30, 17
    W = 880
    H = TOP + len(rs) * ROW + BOT
    plot = W - L - R
    hi = max(r["comp"] + r["stor"] for r in rs)
    sc = plot / hi
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}">']
    for v in range(0, int(hi) + 1, 50_000_000):
        x = L + v * sc
        o.append(f'<line x1="{x:.1f}" y1="{TOP - 10}" x2="{x:.1f}" y2="{TOP + len(rs) * ROW - 8}" '
                 f'stroke="{GRID}" stroke-width="1"/>')
        o.append(f'<text x="{x:.1f}" y="{TOP + len(rs) * ROW + 12}" font-family="sans-serif" '
                 f'font-size="11" fill="{MUTED}" text-anchor="middle">{("0" if v==0 else f"{v/1e9:.2f}".replace(".",","))}</text>')
    o.append(f'<text x="{L + plot / 2:.1f}" y="{H - 8}" font-family="sans-serif" font-size="11" '
             f'fill="{MUTED}" text-anchor="middle">SUI</text>')
    lx = L
    for lab, col in (("υπολογισμός", COMP), ("αποθήκευση", STOR)):
        o.append(f'<rect x="{lx}" y="18" width="12" height="12" rx="2" fill="{col}"/>')
        o.append(f'<text x="{lx + 18}" y="28.5" font-family="sans-serif" font-size="12" '
                 f'fill="{INK}">{lab}</text>')
        lx += 18 + len(lab) * 7.2 + 26
    for i, r in enumerate(rs):
        y = TOP + i * ROW
        cy = y + BARH * 0.5 + 4.2
        o.append(f'<text x="{L - 12}" y="{cy:.1f}" font-family="sans-serif" font-size="12" '
                 f'fill="{INK}" text-anchor="end">{r["label"]}</text>')
        wc, ws = r["comp"] * sc, r["stor"] * sc
        o.append(f'<rect x="{L}" y="{y}" width="{wc:.1f}" height="{BARH}" fill="{COMP}"/>')
        rr = min(4.0, ws)
        x2 = L + wc + 2
        o.append(f'<path d="M{x2:.1f},{y} H{x2 + ws - 2 - rr:.1f} A{rr},{rr} 0 0 1 '
                 f'{x2 + ws - 2:.1f},{y + rr:.1f} V{y + BARH - rr:.1f} A{rr},{rr} 0 0 1 '
                 f'{x2 + ws - 2 - rr:.1f},{y + BARH} H{x2:.1f} Z" fill="{STOR}"/>')
        net = f'{r["net"] / 1e9:.4f}'.replace(".", ",")
        o.append(f'<text x="{L + wc + ws + 10:.1f}" y="{cy:.1f}" font-family="sans-serif" '
                 f'font-size="11" fill="{MUTED}">καθαρό {net}</text>')
    o.append("</svg>")
    return "\n".join(o)


if __name__ == "__main__":
    rs = rows()
    os.makedirs(os.path.dirname(SVG), exist_ok=True)
    open(SVG, "w", encoding="utf-8").write(svg(rs))
    open(TYP, "w", encoding="utf-8").write(typst(rs))
    print(f"{'πράξη':26}{'συν':>4}{'καθαρό SUI':>14}{'WAL':>12}{'δολάρια':>10}")
    for r in sorted(rs, key=lambda r: -r["net"]):
        print(f'{r["label"]:26}{r["txs"]:>4}{sui(r["net"]):>14}'
              f'{(sui(r["wal"]) if r["wal"] else "—"):>12}'
              f'{r["net"]/1e9*SUI_USD + r["wal"]/1e9*WAL_USD:>10.4f}')
    cyc = [r for r in rs if r["label"] in ("Έκδοση έργου", "Καταχώριση παραλαβής",
           "Έκδοση πιστοποιητικού", "Κλασματοποίηση", "Δημιουργία αγγελίας", "Αγορά, πρωτογενής")]
    t = sum(r["net"] for r in cyc); tw = sum(r["wal"] for r in cyc)
    print(f"\nπλήρης κύκλος ως την πρώτη πώληση: {sui(t)} SUI + {sui(tw)} WAL "
          f"= {t/1e9*SUI_USD + tw/1e9*WAL_USD:.3f} δολάρια")
    aw = sum(r["wal"] for r in rs)
    print(f"σύνολο WAL όλης της ροής: {sui(aw)} WAL = {aw/1e9*WAL_USD:.5f} δολάρια")
