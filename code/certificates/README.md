# Certificates of authenticity

One-page Typst template for the document a certified gallery attaches to an
artwork's on-chain `Certificate` (stored publicly on Walrus, linked from the
object, opened from the artwork page).

Needs `typst`, and `node` 22 or newer with `pnpm` for the fetcher. The template
asks for Libertinus Serif and Libertinus Mono, which Typst does not bundle:
install them, otherwise Typst falls back to another serif without warning and
the page still builds, looking different.

    pnpm install                                   # once: the Sui SDK for the fetcher
    node fetch-artwork.mjs <artwork id> [--number GA-2026-0002] [--place Αθήνα]
    # -> data/<id>.json (edit the statement) and assets/<id>.jpg
    ./build.sh data/<id>.json                      # asks for the findings if missing, -> out/<id>.pdf

`build.sh` fills the findings of the examination into the statement, from
`--findings` or from what you type at the prompt. An empty answer writes
`default_findings`, the constant at the top of the script, so a build never
stops half way and works without a terminal too.

`fetch-artwork.mjs` reads the artwork, its custody record and the gallery's
registry entry from a public full node (gRPC), and downloads the preview image
from a Walrus aggregator. The deployment ids come from
`../scripts/deployment.testnet.json`. The QR code and the verification link
point at the application's verify page, which reads the chain directly.

Layout: `certificate.typ` (the template, the only file here that is versioned
apart from the two scripts) and three directories the scripts fill and nothing
tracks: `data/` (one JSON per certificate), `assets/` (artwork previews),
`out/` (built PDFs). Start from a real artwork id, not from a sample.
