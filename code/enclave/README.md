# Artwork condition-report oracle

The thesis report channel extends [Nautilus](https://github.com/MystenLabs/nautilus)
with an application that authenticates signed source readings, aggregates them
into time windows, signs condition reports, and submits them to Sui.

The deployment runs inside an AWS Nitro Enclave. Sui Move contracts verify
attestation and enforce the authority's accepted enclave and channel configuration.
This is a research prototype; the included upstream template has not undergone a
security audit.

## Application code

`src/nautilus-server/src/apps/art-tokenization/` contains:

- `reading.rs`: reading validation and condition selection.
- `ledger.rs`: window state and pending reports.
- `scheduler.rs`: closing windows and submitting queued reports.
- `chain.rs`: Sui interaction and configuration.
- `mod.rs`: API handlers, report payloads, and integration.

The local Move dependency in `move/enclave/` supplies the Nautilus enclave
primitives used by the application's report contract.

## Local tests

```sh
cd src/nautilus-server
cargo test --locked
```

Tests exercise application logic without an AWS instance. Rust is pinned in
`rust-toolchain.toml`; dependencies are recorded in `Cargo.lock`.

## Deployment

Follow [the application installation guide](../README.md), particularly steps
5–9, to build the image, declare measurements, configure the host, and accept
the registered enclave. `out/` and secret files are excluded from Git.

## Attribution

This directory includes modified Nautilus source and build infrastructure from
Mysten Labs. Its [Apache-2.0 license](LICENSE) and upstream notices are preserved.
The artwork report application is described in the
[diploma thesis](https://artemis.ece.ntua.gr/handle/123456789/20365).
