#!/usr/bin/env bash
# Build the guest program REPRODUCIBLY (in the pinned SP1 docker image), inject
# the docker ELF where include_elf! resolves for host builds, and print the
# program verification key — the value FigaroBatchVerifier pins as programVKey.
#
# The injection + SP1_SKIP_PROGRAM_BUILD discipline is load-bearing: a plain
# host build would silently replace the reproducible ELF with a native one, and
# the release gate has already caught host/docker vkey divergence once.
set -euxo pipefail
export PATH="$HOME/.sp1/bin:$HOME/.cargo/bin:$PATH"

cd "$HOME/Figaro/prover/program"
cargo prove build --docker --tag v6.4.0

cd "$HOME/Figaro/prover"
sha256sum target/elf-compilation/docker/riscv64im-succinct-zkvm-elf/release/figaro-prover
mkdir -p target/elf-compilation/riscv64im-succinct-zkvm-elf/release
cp target/elf-compilation/docker/riscv64im-succinct-zkvm-elf/release/figaro-prover \
   target/elf-compilation/riscv64im-succinct-zkvm-elf/release/figaro-prover

SP1_SKIP_PROGRAM_BUILD=true SP1_VKEY_ONLY=1 cargo run -p figaro-prove-test --release 2>&1 | tail -3
echo BUILD-GUEST-COMPLETE
