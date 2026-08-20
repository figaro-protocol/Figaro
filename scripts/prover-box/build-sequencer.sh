#!/usr/bin/env bash
# Build the sequencer release binary embedding the ALREADY-INJECTED docker ELF
# (run build-guest.sh first), then run the guest drift tests against the same
# ELF. SP1_SKIP_PROGRAM_BUILD on every cargo invocation keeps sp1_build from
# replacing the reproducible ELF with a host build.
set -euxo pipefail
export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$PATH"

cd "$HOME/Figaro/prover"
SP1_SKIP_PROGRAM_BUILD=true cargo build --release --locked -p figaro-sequencer --bin sequencer
SP1_SKIP_PROGRAM_BUILD=true cargo test --release --locked -p figaro-prove-test
ls -la target/release/sequencer
echo BUILD-SEQUENCER-COMPLETE
