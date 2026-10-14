# Reproduce the thesis artifacts

## Archived transaction-cost evaluation

Run from the repository root with Python 3:

```sh
python3 thesis/scripts/make_gas_figures.py
```

The script reads `thesis/assets/evaluation/effects/` and recreates the table and
SVG in `thesis/assets/figures/chap6/`. Its `FLOW` mapping identifies the 18
transactions selected for the table. `thesis/digests.json` records the broader
flow. USD amounts use the historical illustrative exchange rates declared in
the script and thesis. This reproduces calculations from archived observations.
It does not rerun transactions against today's testnet.

## Application checks

| Component | Prerequisites | Command from that directory |
| --- | --- | --- |
| `code/smart-contracts` | Sui CLI, thesis guide targets 1.78+ | `sui move test` |
| `code/enclave/src/nautilus-server` | Rust toolchain declared in `code/enclave/rust-toolchain.toml`, C/C++ build tools | `cargo test --locked` |
| `code/frontend` | Node.js, pnpm | `pnpm install --frozen-lockfile`, then `pnpm lint` and `pnpm build` |
| `code/source-simulator` | Python 3.11+, cryptography | `python3 keys.py` |

Dependency installation may require network access. These checks do not deploy
contracts or start AWS infrastructure. Nitro image generation and deployment
are separate steps in [the installation guide](../code/README.md).

## Thesis PDF

Clone the separate [ntua-thesis-template-greek](https://github.com/ntziris/ntua-thesis-template-greek) repository and follow its README
to install `@local/ntua-thesis-greek:0.1.0`. Then, from this repository:

```sh
cd thesis
just all
```

Requirements are Typst, just, Poppler's `pdfinfo`, Libertinus Serif and Libertinus
Sans. Ioskeley Mono is bundled with its license. On first use, Typst may download
the preview packages imported by the template.

Outputs are the library PDF, decorated spiral PDF, paperback body, and paperback
cover. See [the thesis README](../thesis/README.md) for their paths.
