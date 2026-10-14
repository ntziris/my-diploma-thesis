#import "@local/ntua-thesis-greek:0.1.0": *

// #[#metadata(none) <examination-committee-page>]

#context {
    // Variables from config.typ
    let accent_color = accent-color-state.get()
    let sans_font = sans-font-state.get()
    let division = division-state.get()
    let title = title-state.get()
    let subtitle = subtitle-state.get()
    let definite_article = definite-article-state.get()
    let author_uppercase = author-uppercase-state.get()
    let supervisor_label = supervisor-text-state.get()
    let supervisor = supervisor-state.get()
    let supervisor_title = supervisor-title-state.get()
    let co_supervisor_label = co-supervisor-text-state.get()
    let co_supervisor = co-supervisor-state.get()
    let co_supervisor_title = co-supervisor-title-state.get()
    let examination_date = examination-date-state.get()
    let first_examiner = first-examiner-state.get()
    let first_examiner_title = first-examiner-title-state.get()
    let second_examiner = second-examiner-state.get()
    let second_examiner_title = second-examiner-title-state.get()
    let third_examiner = third-examiner-state.get()
    let third_examiner_title = third-examiner-title-state.get()
    let pub_place_date = pub-place-date-state.get()

    // Institutional header
    ntua-header("pyrforos.svg", division, sans_font)

    align(
        horizon + center,
        block(
            above: 2cm,
            below: 2cm,
            stack(
                dir: ttb,
                diploma-block(
                    accent_color,
                    sans_font,
                    title,
                    subtitle,
                    definite_article,
                    author_uppercase,
                ),
                v(1fr),
                supervisor-block(
                    accent_color,
                    supervisor_label,
                    supervisor,
                    supervisor_title,
                    co_supervisor_label,
                    co_supervisor,
                    co_supervisor_title,
                ),
                v(1fr),
                [Εγκρίθηκε από την τριμελή εξεταστική επιτροπή την ] + examination_date + [.],
                v(2em),
                grid(
                    rows: 4,
                    columns: 3,
                    row-gutter: 1em,
                    column-gutter: 1em,
                    [_(Υπογραφή)_], [_(Υπογραφή)_], [_(Υπογραφή)_],
                    grid.cell(colspan: 3, v(5em)),
                    box(width: 1fr, repeat[.]),
                    box(width: 1fr, repeat[.]),
                    box(width: 1fr, repeat[.]),
                    first_examiner, second_examiner, third_examiner,
                    first_examiner_title, second_examiner_title, third_examiner_title,
                ),
                v(1fr),
                pub_place_date,
            ),
        ),
    )
}
