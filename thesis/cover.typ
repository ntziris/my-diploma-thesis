// ================================================================================================
// cover.typ: Book cover spread for NTUA thesis (back cover | spine | front cover)
// ================================================================================================
// Compile with: just cover        (compiles main.pdf, counts pages, produces cover.pdf)
// ================================================================================================

#import "@local/ntua-thesis-greek:0.1.0": *
#import "config.typ": config
#import "back_matter/back_cover.typ": (
    back-cover-content-gap, back-cover-github-url, back-cover-isbn, back-cover-text,
)

#let page-count = int(sys.inputs.at("page_count", default: "200"))

#show: cover-wrap.with(
    ..config,
    content: back-cover-text,
    content_gap: back-cover-content-gap,
    github_url: back-cover-github-url,
    isbn: back-cover-isbn,

    // Spine font sizes
    spine_title_font_size: auto,
    spine_label_font_size: auto,

    // Canvas geometry
    page_count: page-count,
    paper_thickness_per_page: 0.1mm,
    spine_safe_margin: 2mm,
)
