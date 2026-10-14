// παράγεται από scripts/make_gas_figures.py, μην το επεξεργάζεσαι
#let gain(v) = table.cell(fill: rgb("#dff2e3"))[#text(fill: rgb("#1e6f34"), weight: "bold")[#v]]
#let peak(v) = table.cell(fill: rgb("#fdf0cf"))[#text(fill: rgb("#8a5a00"), weight: "bold")[#v]]
#let none-cell = text(fill: luma(160))[-]

#table(
    columns: (1fr, auto, auto, auto, auto, auto, auto, auto),
    align: (left + horizon,) + (right + horizon,) * 7,
    stroke: 0.4pt + luma(170),
    inset: (x: 5pt, y: 4pt),
    fill: (x, y) => if y < 2 { none }
        else if x == 5 { rgb("#eef4fb") }
        else if calc.rem(y, 2) == 1 { luma(246) }
        else { none },
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
            [Έκδοση έργου], [3], [0,004830], [0,220750], [0,158057], peak[0,067523], [0,018294], [0,0478],
            [Έκδοση πιστοποιητικού], [3], [0,004600], [0,157419], [0,144890], [*0,017129*], [0,007633], [0,0122],
            [Καταχώριση παραλαβής], [1], [0,001000], [0,037240], [0,027244], [*0,010996*], [#none-cell], [0,0077],
            [Δημιουργία αγγελίας], [1], [0,001000], [0,024685], [0,016252], [*0,009433*], [#none-cell], [0,0066],
            [Κλασματοποίηση], [1], [0,001000], [0,035553], [0,028531], [*0,008022*], [#none-cell], [0,0056],
            [Αγορά, μεταπώληση], [1], [0,001000], [0,024214], [0,017727], [*0,007487*], [#none-cell], [0,0052],
            [Ανάθεση νέας γκαλερί], [1], [0,001000], [0,030278], [0,026868], [*0,004410*], [#none-cell], [0,0031],
            [Αγορά, πρωτογενής], [1], [0,001000], [0,021576], [0,015116], [*0,007461*], [#none-cell], [0,0052],
            [Δήλωση απώλειας], [1], [0,001000], [0,033037], [0,030502], [*0,003535*], [#none-cell], [0,0025],
            [Ακύρωση έκδοσης], [1], [0,001000], [0,027375], [0,024957], [*0,003418*], [#none-cell], [0,0024],
            [Ακύρωση αγγελίας], [1], [0,001000], [0,021409], [0,020149], [*0,002260*], [#none-cell], [0,0016],
            [Ανάκληση από το μητρώο], [1], [0,001000], [0,007015], [0,006884], [*0,001130*], [#none-cell], [0,0008],
            [Εγγραφή στο μητρώο], [1], [0,001000], [0,006954], [0,006945], [*0,001009*], [#none-cell], [0,0007],
            [Ενοποίηση κλασμάτων], [1], [0,001000], [0,031996], [0,032436], [*0,000560*], [#none-cell], [0,0004],
)
