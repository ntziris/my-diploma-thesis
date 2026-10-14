# Source provenance

This publication was assembled from the author's working materials on
12 October 2026 and expanded with the submitted deliverables on 14 October 2026.

- Application sources come from the working `Code/` directory, including its
  September frontend updates. They are not a byte-for-byte copy of the older
  source bundle in the submitted deliverables. The smart-contract README was
  carried over from that bundle.
- Thesis sources use the deliverable bundle's file selection with current
  contents from `Thesis/`, including subsequent library formatting and
  bibliography corrections and the accompanying citation style.
- The reusable template is maintained separately as [ntua-thesis-template-greek](https://github.com/ntziris/ntua-thesis-template-greek).
- Generated deployment logs, certificates, enclave images, dependency
  installations, old drafts, and administrative files are excluded.

The library document remains the citation reference. This source distribution
does not claim a byte-identical reproduction of its PDF or a new experimental
run: evaluation figures are regenerated from archived transaction effects.

The oracle extends [Mysten Labs' Nautilus](https://github.com/MystenLabs/nautilus).
The thesis-specific implementation is in
`code/enclave/src/nautilus-server/src/apps/art-tokenization/`. Upstream copyright
notices and the Apache-2.0 license are preserved.

## Demonstration media

All 14 recordings come from the submitted deliverables' `Videos/` directory.
Their contents are unchanged. The [media manifest](../videos/manifest.json) maps
short repository filenames to the originals and records SHA-256 hashes.
Video preview images were extracted from the recordings. All 28 submitted
screenshots are also available in [screenshots/](../screenshots/README.md).
The thesis keeps its own copies to preserve its build paths.

## Submitted documents and design files

- [thesis.pdf](../thesis.pdf) is the unmodified 157-page PDF from the deliverable bundle.
- [thesis-color.pdf](../thesis-color.pdf) is the unmodified 160-page edition with a decorated cover.
- Both PDFs were generated on 29 September 2026. They predate the library
  formatting and bibliography corrections in the current Typst source. The
  [library record](https://artemis.ece.ntua.gr/handle/123456789/20365) remains the
  reference for the published thesis.
- [diagrams/](../diagrams/README.md) contains all 14 UML diagrams in their three
  submitted formats, including editable Visual Paradigm projects.
- [graphics/](../graphics/README.md) preserves all 126 files from the supplementary
  graphics collection, including the working drawings and two Edraw projects.
- The reusable template is linked through its separate repository. The assignment
  form and two automatic Visual Paradigm backup files are not included.

The [deliverable manifest](deliverables-manifest.json) maps all 198 added PDFs,
diagram files, screenshots and graphics to their original filenames and SHA-256
hashes. These files are unchanged. Some assets are also used by the thesis source.
