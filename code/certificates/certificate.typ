#import "@preview/tiaoma:0.3.0": qrcode

#let path = sys.inputs.at("data", default: none)
#if path == none {
    panic("δώστε το αρχείο: typst compile --input data=data/<id>.json certificate.typ")
}
#let data = json(path)

#let navy = rgb("#0b2a5b")
#let gold = rgb("#b08d57")
#let ink = rgb("#1f1a17")
#let cream = rgb("#fbf8f1")
#let muted = rgb("#6b625a")

#set page(
    paper: "a4",
    margin: (x: 16mm, top: 16mm, bottom: 16mm),
    fill: cream,
    background: {
        // double rule frame
        place(dx: 9mm, dy: 9mm, rect(
            width: 210mm - 18mm,
            height: 297mm - 18mm,
            stroke: 1.6pt + navy,
        ))
        place(dx: 11mm, dy: 11mm, rect(
            width: 210mm - 22mm,
            height: 297mm - 22mm,
            stroke: 0.5pt + gold,
        ))
    },
)
#set text(font: "Libertinus Serif", size: 10.5pt, fill: ink, lang: "el")
#set par(justify: true, leading: 0.62em)
#show link: set text(fill: navy)

#let gr-upper(s) = {
    let out = upper(s)
    for (from, to) in (
        ("Ά", "Α"),
        ("Έ", "Ε"),
        ("Ή", "Η"),
        ("Ί", "Ι"),
        ("Ό", "Ο"),
        ("Ύ", "Υ"),
        ("Ώ", "Ω"),
    ) {
        out = out.replace(from, to)
    }
    out
}
#let rule = line(length: 100%, stroke: 0.5pt + gold)
#let tag(body) = text(size: 7.5pt, tracking: 0.12em, fill: muted, gr-upper(body))
#let mono(body) = text(font: "Libertinus Mono", size: 7pt, body)
#let explorer = data.chain.at("explorer", default: "https://suiscan.xyz/" + data.chain.network)

#align(center)[
    #text(size: 8.5pt, tracking: 0.32em, fill: gold)[ΠΙΣΤΟΠΟΙΗΜΕΝΗ ΓΚΑΛΕΡΙ]
    #v(1.5mm)
    #text(size: 18pt, weight: "bold", fill: navy)[#data.gallery.name]
    #v(0.5mm)
    #text(size: 9pt, fill: muted)[#data.gallery.subtitle]
]
#v(2.5mm)
#align(center)[
    #line(length: 38%, stroke: 0.6pt + gold)
    #v(2mm)
    #text(size: 21pt, weight: "bold", tracking: 0.08em, fill: navy)[ΠΙΣΤΟΠΟΙΗΤΙΚΟ ΓΝΗΣΙΟΤΗΤΑΣ]
    #v(1.2mm)
    #text(size: 10pt, tracking: 0.26em, fill: muted)[CERTIFICATE OF AUTHENTICITY]
    #v(2mm)
    #line(length: 38%, stroke: 0.6pt + gold)
]
#v(3mm)

#grid(
    columns: (auto, 1fr),
    column-gutter: 7mm,
    align: (left + horizon, left + horizon),
    box(stroke: 0.5pt + gold, inset: 2mm, fill: white)[
        #image(data.artwork.image, height: 46mm)
    ],
    [
        #tag("Αφορά το έργο")
        #v(2mm)
        #text(size: 17pt, style: "italic", fill: ink)[#data.artwork.title]
        #v(1.5mm)
        #text(size: 12pt)[#data.artwork.artist_name, #data.artwork.year]
        #v(4mm)
        #grid(
            columns: (auto, auto),
            column-gutter: 8mm,
            row-gutter: 3mm,
            [#tag("Μέσο / υλικό") #v(0.8mm) #text(size: 10.5pt)[#data.artwork.medium]],
            [#tag("Διαστάσεις") #v(0.8mm) #text(size: 10.5pt)[#data.artwork.dimensions]],
        )
    ],
)
#v(3mm)
#rule
#v(3mm)

#tag("Δήλωση της γκαλερί")
#v(2mm)
#block(inset: (left: 6mm, right: 6mm))[
    #set text(size: 11pt, style: "italic")
    #set par(leading: 0.62em, first-line-indent: 0pt)
    #data.statement
]
#v(3mm)
#rule
#v(3mm)

#let addr(kind, id) = link(explorer + "/" + kind + "/" + id, mono(id))
#grid(
    columns: (1fr, auto),
    column-gutter: 6mm,
    [
        #tag("Καταγραφή στην αλυσίδα")
        #v(2.5mm)
        #set par(first-line-indent: 0pt, justify: false)
        #grid(
            columns: (auto, 1fr),
            column-gutter: 4mm,
            row-gutter: 2.2mm,
            tag("Δίκτυο"), mono[#data.chain.network],
            tag("Αναγνωριστικό"), addr("object", data.artwork.id),
            tag("Γκαλερί"), addr("account", data.gallery.address),
            tag("Πακέτο"), addr("object", data.chain.package),
        )
        #v(2.5mm)
        #text(size: 7.8pt, fill: muted)[
            Το πιστοποιητικό αυτό αντιστοιχεί στο αντικείμενο `Certificate` που είναι προσαρτημένο
            στο έργο στην αλυσίδα SUI και εκδόθηκε από τη διεύθυνση της γκαλερί, η οποία ήταν
            εγγεγραμμένη και ενεργή στο μητρώο πιστοποιημένων γκαλερί κατά την έκδοση. Η επαλήθευση
            γίνεται με μόνο το αναγνωριστικό του έργου, από οποιονδήποτε, χωρίς λογαριασμό: #link(
                data.chain.verify_url,
            )
        ]
    ],
    align(top)[
        #box(fill: white, inset: 3mm, stroke: 0.5pt + gold)[
            #qrcode(data.chain.verify_url, width: 26mm, options: (fg-color: navy, bg-color: white))
        ]
        #v(0.6mm)
        #align(center)[#text(size: 8.5pt, fill: muted)[Σάρωση για επαλήθευση]]
    ],
)
#v(3mm)
#rule
#v(3mm)

#grid(
    columns: (1fr, auto),
    column-gutter: 6mm,
    align: (left + bottom, right + bottom),
    [
        #set par(justify: false)
        #grid(
            columns: (auto, auto, auto),
            column-gutter: 7mm,
            row-gutter: 2mm,
            tag("Αριθμός"), tag("Ημερομηνία"), tag("Τόπος"),
            text(size: 10.5pt)[#box(data.certificate.number)],
            text(size: 10.5pt)[#box(data.certificate.date)],
            text(size: 10.5pt)[#box(data.certificate.place)],
        )
    ],
    [
        #tag("Για τη γκαλερί")
        #v(7mm)
        #line(length: 55mm, stroke: 0.5pt + ink)
        #v(1mm)
        #text(size: 10pt, weight: "bold")[#data.gallery.name]
    ],
)
