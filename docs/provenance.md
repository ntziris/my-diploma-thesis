# Source provenance

This publication was assembled from the author's working materials on
12 October 2026.

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
Their contents are unchanged. The [media manifest](videos/manifest.json) maps
short repository filenames to the originals and records SHA-256 hashes.
Video preview images were extracted from the recordings. The README screenshot
gallery uses the screenshots already included with the thesis source.
