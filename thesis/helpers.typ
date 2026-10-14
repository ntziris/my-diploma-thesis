// ================================================================================================
// helpers.typ: Βοηθητικά εργαλεία σύνταξης (draft-only)
// ================================================================================================
// Σημειώσεις εκκρεμοτήτων που ξεχωρίζουν οπτικά στο PDF. Πριν από την τελική παράδοση,
// θέσε #let draft = false παρακάτω. Τότε το #todo εξαφανίζεται και το #todo-figure
// αποτυγχάνει με μήνυμα, ώστε να μην ξεχαστεί κανένα σχήμα.
// ================================================================================================

#let draft = true

// Αναφορά σε ενότητα με αριθμό μόνο: «ενότητα #sec(<sec-oracles>)».
#let sec(l) = ref(l, supplement: none)

// Παραπομπή με όνομα συγγραφέα: «Οι #acite("Mei και Moses", <Mei2002>)» τυπώνει «Mei και Moses [2]»
// και κάνει όνομα και αριθμό μαζί έναν σύνδεσμο προς την εγγραφή της βιβλιογραφίας. Το άρθρο
// («Ο», «Οι», «Η») μένει έξω. Εσωτερικά χρησιμοποιεί το form: "prose", που με το στυλ IEEE
// τυπώνει «S. P. Fraiberger, R. Sinatra, ... [17]», και αντικαθιστά τα ονόματα με το δικό μας.
#let acite(name, key, supplement: none) = {
    // Το prose μπορεί να βγει σε πολλά στοιχεία κειμένου (π.χ. «R. Mühlberger», « κ.ά.», « [71]»
    // για πάνω από έξι συγγραφείς). Κρατάμε μόνο το στοιχείο με την αγκύλη και βάζουμε μπροστά
    // το δικό μας όνομα. Τα υπόλοιπα στοιχεία σβήνονται.
    let re = regex("\[.+\]")
    show cite: it => {
        show regex(".+"): m => {
            let b = m.text.match(re)
            if b == none { none } else { [#name #b.text] }
        }
        it
    }
    cite(key, form: "prose", supplement: supplement)
}

#let todo-color = rgb("#B03A2E")

// Σημείωση εκκρεμότητας μέσα στο κείμενο.
#let todo(body) = if draft {
    block(
        width: 100%,
        breakable: true,
        stroke: 0.75pt + todo-color,
        radius: 4pt,
        clip: true,
        grid(
            columns: (4pt, 1fr),
            rows: (auto,),
            grid.cell(fill: todo-color)[],
            grid.cell(fill: todo-color.lighten(92%), inset: 8pt)[
                #set par(first-line-indent: 0pt, justify: false)
                #text(size: 8.5pt, weight: "bold", fill: todo-color)[TODO]
                #h(6pt)
                #text(size: 9.5pt)[#body]
            ],
        ),
    )
}

// Κράτηση θέσης για σχήμα που δεν έχει σχεδιαστεί ακόμη. Παράγει κανονικό #figure, οπότε
// η αρίθμηση, οι παραπομπές και ο Κατάλογος Σχημάτων είναι ήδη σωστά. Όταν ετοιμαστεί το
// αρχείο, αντικατέστησε την κλήση με #figure(image(...), caption: ...)<label>.
#let todo-figure(caption: [], label: none, file: none, height: 4.5cm, body) = {
    if not draft {
        panic("todo-figure: εκκρεμεί το σχήμα " + repr(file))
    }

    // Το height λειτουργεί ως ΕΛΑΧΙΣΤΟ ύψος. Ο μηδενικού πλάτους ορθοστάτης στην πρώτη
    // στήλη του πλέγματος επιβάλλει το ύψος, ενώ η γραμμή μεγαλώνει αν το κείμενο το
    // απαιτεί, ώστε η περιγραφή να μην ξεχειλίζει ποτέ από το πλαίσιο.
    let placeholder = block(
        width: 100%,
        breakable: false,
        stroke: (paint: todo-color, thickness: 0.75pt, dash: "dashed"),
        radius: 4pt,
        fill: todo-color.lighten(96%),
        inset: 12pt,
    )[
        #set par(first-line-indent: 0pt, justify: false)
        #set align(left + horizon)
        #grid(
            columns: (0pt, 1fr),
            box(width: 0pt, height: height),
            [
                #align(center)[
                    #text(size: 8.5pt, weight: "bold", fill: todo-color)[ΣΧΗΜΑ ΠΡΟΣ ΚΑΤΑΣΚΕΥΗ]
                    #if file != none {
                        linebreak()
                        text(size: 8.5pt, fill: todo-color, font: "Ioskeley Mono")[#file]
                    }
                ]
                #v(4pt)
                #pad(x: 8pt, text(size: 9.5pt)[#body])
            ],
        )
    ]

    let fig = figure(placeholder, caption: caption, kind: image, supplement: [Σχήμα])
    if label != none [ #fig #label ] else { fig }
}

// ================================================================================================
// Πίνακες παρουσίασης (κεφάλαια 8 και 9)
// ================================================================================================

// Κελί πίνακα δικαιωμάτων: "y" επιτρέπεται, "n" δεν επιτρέπεται, "c" υπό προϋπόθεση.
#let _right-cell(v) = {
    let (fill, glyph, col) = if v == "y" {
        (rgb("#dff2e3"), sym.checkmark, rgb("#1e6f34"))
    } else if v == "n" {
        (rgb("#f9dede"), sym.times, rgb("#a62626"))
    } else {
        (rgb("#fdf0cf"), sym.checkmark, rgb("#8a5a00"))
    }
    table.cell(fill: fill, align: center + horizon)[#text(
        fill: col,
        weight: "bold",
        size: 10pt,
    )[#glyph]]
}

// Πίνακας δικαιωμάτων: γραμμές = πράξεις ή σελίδες, στήλες = ρόλοι.
// rows: πίνακας από (ετικέτα, (τιμές...), προϋπόθεση).
#let role-matrix(roles, rows, first: [Πράξη], note: true, inset-y: 3.5pt) = {
    set par(justify: false)
    set text(size: 8pt, hyphenate: false)
    let n = roles.len()
    let cols = (1.4fr,) + (auto,) * n + (if note { (2.2fr,) } else { () })
    let aligns = (left + horizon,) + (center,) * n + (left + horizon,)
    table(
        columns: cols,
        align: aligns,
        stroke: 0.4pt + luma(170),
        inset: (x: 4pt, y: inset-y),
        table.header(
            table.cell(fill: luma(235))[*#first*],
            ..roles.map(r => table.cell(fill: luma(235), align: center + horizon)[*#r*]),
            ..(if note { (table.cell(fill: luma(235))[*Υπό προϋπόθεση*],) } else { () }),
        ),
        ..rows
            .map(r => (
                ([#r.at(0)],) + r.at(1).map(_right-cell) + (if note { ([#r.at(2)],) } else { () })
            ))
            .flatten(),
    )
}

#let role-legend(cond: true, condition-label: [υπό την προϋπόθεση της τελευταίας στήλης]) = {
    set text(size: 8.5pt)
    grid(
        columns: if cond { 3 } else { 2 },
        column-gutter: 14pt,
        [#box(fill: rgb("#dff2e3"), inset: 3pt)[#text(
                fill: rgb("#1e6f34"),
                weight: "bold",
            )[#sym.checkmark]] επιτρέπεται],
        [#box(fill: rgb("#f9dede"), inset: 3pt)[#text(
                fill: rgb("#a62626"),
                weight: "bold",
            )[#sym.times]] δεν επιτρέπεται],
        ..(
            if cond {
                (
                    [#box(fill: rgb("#fdf0cf"), inset: 3pt)[#text(
                            fill: rgb("#8a5a00"),
                            weight: "bold",
                        )[#sym.checkmark]] #condition-label],
                )
            } else { () }
        ),
    )
}

// Κάρτα συνάρτησης του πακέτου Move: ιδιότητες και παράμετροι, όπως μια κάρτα endpoint.
#let fn-card(
    module: "",
    name: "",
    caller: [],
    pre: [],
    effect: [],
    event: [],
    params: (),
) = {
    set par(justify: false, first-line-indent: 0pt)
    set text(size: 9pt, hyphenate: false)
    let key(k) = table.cell(fill: luma(240))[*#k*]
    block(breakable: false, below: 10pt)[
        #block(below: 6pt)[
            #table(
                columns: (auto, 1fr),
                align: (left + horizon, left + horizon),
                stroke: 0.4pt + luma(170),
                inset: (x: 6pt, y: 4.5pt),
                key[Συνάρτηση], [#raw(module + "::" + name)],
                key[Ποιος καλεί], caller,
                key[Προϋποθέσεις], pre,
                key[Αποτέλεσμα], effect,
                key[Γεγονός], event,
            )
        ]
        #if params.len() > 0 {
            block[
                #text(size: 8.5pt, weight: "bold")[Παράμετροι]
                #v(2pt)
                #table(
                    columns: (auto, auto, 1fr),
                    align: (left + horizon, left + horizon, left + horizon),
                    stroke: 0.4pt + luma(170),
                    inset: (x: 6pt, y: 4pt),
                    table.header(
                        table.cell(fill: luma(240))[*Όνομα*],
                        table.cell(fill: luma(240))[*Τύπος*],
                        table.cell(fill: luma(240))[*Περιγραφή*],
                    ),
                    ..params.map(p => ([#raw(p.at(0))], [#raw(p.at(1))], p.at(2))).flatten(),
                )
            ]
        }
    ]
}

// Πίνακας πεδίων μιας φόρμας της διεπαφής: αύξων αριθμός, πεδίο, οδηγίες.
#let field-table(rows) = {
    set par(justify: false)
    set text(size: 8.5pt, hyphenate: false)
    table(
        columns: (auto, auto, 1fr),
        align: (center + horizon, left + horizon, left + horizon),
        stroke: 0.4pt + luma(170),
        inset: (x: 6pt, y: 4.5pt),
        table.header(
            table.cell(fill: luma(240))[*\#*],
            table.cell(fill: luma(240))[*Πεδίο*],
            table.cell(fill: luma(240))[*Οδηγίες*],
        ),
        ..rows.enumerate().map(((i, r)) => ([#(i + 1)], [*#r.at(0)*], r.at(1))).flatten(),
    )
}
