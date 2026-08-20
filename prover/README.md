# `prover/` — the SP1 batch-settlement proof apparatus

A Rust Cargo workspace of five crates that together let anyone prove and
settle a batch of Figaro commitments against `FigaroBatchVerifier`, without
touching `FigaroCore` per-order. Architecture, trust model, and what the
sequencer is/isn't trusted for → `docs/SCALING_STRATEGY.md`. This file is
just: what the crates are, how to build the toolchain, and how to run the
tests.

## The five crates

| Crate (dir) | Package name | What it is |
|---|---|---|
| `clause/` | `figaro-clause` | Generic clause-validation engine — the Rust mirror of `@figaro-protocol/sdk/clauses` (TS Layer A). Validates any clause spec supplied as witness input; used by both the guest program and the sequencer. No per-clause code, by design. |
| `lib/` | `figaro-kernel` | The off-chain mirror of `FigaroCore`'s commit/resolve logic plus the witness gates (spec-identity substitution, content-hash mismatch, inclusion failure, attest-after-resolve) and the RPGF usage bridge. Depends on `figaro-clause` for Layer B content validation. |
| `program/` | `figaro-prover` | The SP1 guest program — `figaro-kernel` compiled to the RISC-V zkVM target. Its compiled ELF's hash IS the verification key `FigaroBatchVerifier` pins as `programVKey`, so this crate's toolchain determines whether a proof verifies at all. |
| `script/` | `figaro-prove-test` | Host-side proving harness (binary `prove`): SP1 mock-executor guest tests, in-VM gate-rejection tests, and (`SP1_REAL_PROOF=1`) a real local SP1 Core proof of the canonical batch. |
| `sequencer/` | `figaro-sequencer` | The public relay binary (`sequencer`) — mempool, batch assembler, prover driver, submitter, and publication archive. One relay among any number; `docs/SCALING_STRATEGY.md` + `sequencer/README.md` own the trust model. |

## Prerequisites

1. **Rust**, pinned via the committed [`rust-toolchain.toml`](./rust-toolchain.toml)
   — `rustup` picks it up automatically inside this directory; no manual
   `rustup default` needed for local work.
2. **SP1** (`cargo prove` + the `succinct` Rust toolchain that cross-compiles
   the guest program to `riscv64im-succinct-zkvm-elf`). Install with `sp1up`
   (lifted from the release workflow's own rebuild instructions,
   `.github/workflows/sequencer-release.yml`):

   ```bash
   curl -L https://sp1up.succinct.xyz | bash
   sp1up --version v6.3.1
   ```

   The version **must match** the `sp1-sdk` / `sp1-build` / `sp1-zkvm`
   version resolved in `prover/Cargo.lock` — a mismatch silently changes the
   guest ELF, and therefore the verification key. See the version comment in
   `Cargo.lock` / `sequencer-release.yml`'s `SP1_VERSION` if either drifts
   from the value above.

## Building and testing

```bash
cd prover
cargo fetch          # pull crates.io deps (CONTRIBUTING.md quickstart)
cargo test           # all five crates, one suite — see docs/TESTING.md "Rust" for the inventory
```

`cargo test -p figaro-sequencer` (etc.) scopes to a single crate.
`script/` (`figaro-prove-test`) additionally supports `SP1_REAL_PROOF=1
cargo test -p figaro-prove-test` to generate and verify a real local SP1 Core
proof rather than the mock executor.

## Reproducibility

The guest ELF is embedded at compile time (`sp1_sdk::include_elf!` in
`sequencer/src/prover.rs`), so the Rust toolchain and the SP1 version are not
cosmetic build trivia — see `rust-toolchain.toml`'s header comment and
`.github/workflows/sequencer-release.yml` for the full rebuild-and-compare
recipe that ships with every tagged release.

## Architecture

`docs/SCALING_STRATEGY.md` owns the proof-based batch-scaling design: what
the sequencer is trusted for (transport, never authority — settlement is
permissionless), the mempool → assemble → prove → submit pipeline, and how
this composes with the direct `FigaroCore` path.
