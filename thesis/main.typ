// ================================================================================================
// main.typ: User entry point for the NTUA thesis
// ================================================================================================

#import "@local/ntua-thesis-greek:0.1.0": *
#import "config.typ": config

// Output mode
//
// Controls which covers and decorations are included in the output PDF.
//   just spiral     -> binding=spiral:            full PDF for spiral binding
//   just paperback  -> binding=paperback:         body-only PDF for paperback binding
//   just library    -> binding=library:           full PDF for Artemis digital library
//                      (no logo, no cover border, no back cover, no color, no life)
#let binding = sys.inputs.at("binding", default: "spiral")

// All configuration lives in config.typ. You don't need to change something here.
#let _config = if binding == "library" {
    config + (accent_color: black, secondary_color: black)
} else { config }
// Paths in extra_syntaxes are resolved relative to this file (template/).
#set raw(syntaxes: if _config.extra_syntaxes == none { () } else { _config.extra_syntaxes })

#show: thesis-setup.with(
    .._config,
    include_covers: binding != "paperback",
    show_cover_decorations: binding != "library",
)

// Glossary Setup
#import "back_matter/glossary.typ": entry-list
#show: make-glossary
#register-glossary(entry-list)

// Front Matter

#{
    set page(margin: 2cm, header: none, footer: none)
    if binding != "paperback" { blank-pagebreak(to: "odd") }
    include "front_matter/examination_committee.typ"
    include "front_matter/copyright.typ"
    dedication("Στην αδελφή μου Ελευθερία")
}
#include "front_matter/abstract.typ"
#blank-pagebreak(to: "odd")
#include "front_matter/acknowledgements.typ"
#blank-pagebreak(to: "odd")


// Table of contents

#outline(title: [Περιεχόμενα], depth: 3, target: parts-and-headings)
#outline(title: [Κατάλογος Σχημάτων], depth: 1, target: figure.where(kind: image))
#outline(title: [Κατάλογος Πινάκων], depth: 1, target: figure.where(kind: table))
// #outline(title: [Κατάλογος Αλγορίθμων], depth: 1, target: figure.where(kind: "Algorithm"))
// #outline(title: [Κατάλογος Πηγαίων Κωδίκων], depth: 1, target: figure.where(kind: "Code"))

// Body Matter

#include "body_matter/chap1.typ"
#include "body_matter/chap2.typ"
#include "body_matter/chap3.typ"
#include "body_matter/chap4.typ"
#include "body_matter/chap5.typ"
#include "body_matter/chap6.typ"
#include "body_matter/chap7.typ"

// Back Matter

// Glossary

#numless[= Συντομεύσεις και ακρωνύμια]
#print-glossary(entry-list)

// Bibliography

#{
    set text(lang: "en", region: "US")
    set par(spacing: 1em)
    bibliography(
        "bibliography.bib",
        title: [Βιβλιογραφία],
        style: "citation_styles/ieee-library.csl",
    )
}

// Final Pages (Optional)
//
// Generates the final pages of the thesis (blank sheet(s) + colored back cover).
// Skipped in paperback mode: the back cover is part of cover.pdf instead.
// (Optional) Pass github_url to add a white QR code (e.g. for a code repository).
// (Optional) Pass isbn to add a white EAN-13 barcode on the right.
#import "back_matter/back_cover.typ": (
    back-cover-content-gap, back-cover-github-url, back-cover-isbn, back-cover-text,
)
#if binding != "paperback" and binding != "library" {
    back-cover(
        content: back-cover-text,
        content_gap: back-cover-content-gap,
        github_url: back-cover-github-url,
        isbn: back-cover-isbn,
    )
}
