// ================================================================================================
// config.typ: Thesis configuration
// ================================================================================================
// All parameters for the thesis body (main.typ) and the book cover (cover.typ) are defined here.
// ================================================================================================

#let config = (
    // Thesis identity
    title: [Σχεδίαση και Υλοποίηση Αποκεντρωμένης Εφαρμογής για Tokenization Έργων Τέχνης στο
        Οικοσύστημα του Sui Blockchain],
    subtitle: [],
    thesis_image: image("assets/figures/cover-art.svg", height: 25%),
    division: "Τομεας Τεχνολογιας Πληροφορικης και Υπολογιστων",

    // Author
    author: "Νικόλαος Τζιρής",
    author_uppercase: "ΝΙΚΟΛΑΟΥ Δ. ΤΖΙΡΗ",
    definite_article: "του", // "του" / "της" / "των"

    // Supervisor
    supervisor_label: "Επιβλέπων", // Επιβλέπων ή Επιβλέπουσα
    supervisor: "Παναγιώτης Τσανάκας",
    supervisor_title: "Καθηγητής Ε.Μ.Π.",

    // Co-supervisor (none to hide)
    co_supervisor_label: none, // Επιβλέπων ή Επιβλέπουσα ή none
    co_supervisor: none,
    co_supervisor_title: none,

    // Examination committee
    examination_date: "30η Σεπτεμβρίου 2026",
    first_examiner: "Παναγιώτης Τσανάκας",
    first_examiner_title: "Καθηγητής Ε.Μ.Π.",
    second_examiner: "Νικόλαος Λεονάρδος",
    second_examiner_title: "Επίκουρος Καθηγητής Ε.Μ.Π.",
    third_examiner: "Αριστείδης Παγουρτζής",
    third_examiner_title: "Καθηγητής Ε.Μ.Π.",

    // Publication
    pub_place_date: "Αθήνα, Σεπτέμβριος 2026",
    copyright_year: "2026",

    // Appearance
    accent_color: rgb("#002E6A"),
    secondary_color: none, // none = accent_color.darken(20%)
    serif_font: "Libertinus Serif",
    sans_font: "Libertinus Sans",
    code_font: "Ioskeley Mono",
    font_size: 11pt,

    // Page geometry
    paper: "a4",
    margin_top: 2.5cm,
    margin_bottom: 2.5cm,
    margin_inside: 3.5cm,
    margin_outside: 2.5cm,

    // Extra languages (syntax highlighting + codly badge)
    // Set extra_syntaxes: none or () to disable; extra_languages: none or (:) to disable.
    extra_syntaxes: ("assets/syntaxes/SuiMove.sublime-syntax",),
    extra_languages: (
        move: (
            name: "Sui Move",
            icon: box(
                image("assets/icons/sui_move.svg", height: 130%, fit: "contain"),
                inset: 0pt,
            ),
            color: rgb("#4DA2FF"),
        ),
    ),
)
