# IEEE bibliography for the library submission

`ieee-library.csl` derives from the Citation Style Language project's
[IEEE style](https://github.com/citation-style-language/styles/blob/master/ieee.csl),
retrieved on 2026-10-01 (upstream metadata: 2024-03-27).
The original authors and CC BY-SA 3.0 license are preserved in the CSL file.
This adaptation is distributed under the same license.

The adaptation follows the library's example for web pages:
quoted title, website, publication date when known, URL, and `(accessed Mon. DD, YYYY)`.
It retains authors when supplied, and the upstream formatting for other source types.
The website name falls back to `publisher`, because Typst does not map an online
entry's `organization` or `journaltitle` to CSL's container title.

Use `@online` for websites, `date` for a verified publication date, `publisher`
for the website name, and `urldate` for the actual consultation date. Do not
substitute the consultation year for a missing publication year. Use `@report`
for white papers and reports; duplicate their `institution` in `publisher` so
that Typst prints the issuing institution. The same applies to a thesis's school.

Typst 0.15.1 does not import the BibLaTeX `eid` field. For journal articles with
an article identifier instead of pages, preserve `eid` and also set
`note = {Art. no. IDENTIFIER}`, leaving `pages` absent. The style prints this
note in the locator position only when the journal article has no page range.
Do not put descriptive notes there for such articles.

`main.typ` scopes English (US) and the bibliography's paragraph spacing locally,
while retaining the Greek heading “Βιβλιογραφία”. Citation keys and numbering
continue to be managed by Typst.
