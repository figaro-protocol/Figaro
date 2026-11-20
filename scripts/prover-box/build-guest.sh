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

# The repository root is this script's own checkout, two levels up, so a box
# reproduces the key from any checkout path. The host path does not enter the
# ELF: `cargo prove build --docker` mounts the prover workspace at the fixed
# in-container path /root/program and builds there (sp1-build's
# `create_docker_command`), so only paths relative to the workspace reach the
# compiler.
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

# The key is built only from the release revision, the one every bench ran at
# and the stack is broadcast from: the checkout must be clean and must build
# what it builds (scripts/check-release-revision.mjs). The revision is the
# first argument or RELEASE_COMMIT, a full sha (checkout-release.sh prints it);
# a missing one refuses.
#
#   ./build-guest.sh <release sha>        (or RELEASE_COMMIT=<sha> ./build-guest.sh)
node "$REPO_ROOT/scripts/check-release-revision.mjs" "${1:-${RELEASE_COMMIT:-}}"

# The SP1 release the guest is built in is the lock's sp1-sdk version — the
# read the CI workflows make — so the box, CI and the library agree.
SP1_TAG=v$(awk '/^name = "sp1-sdk"$/{getline; gsub(/version = |"/, ""); print; exit}' "$REPO_ROOT/prover/Cargo.lock")
[ "$SP1_TAG" != "v" ] || { echo "could not read the sp1-sdk version from Cargo.lock"; exit 1; }
cd "$REPO_ROOT/prover/program"
cargo prove build --docker --tag "$SP1_TAG"

cd "$REPO_ROOT/prover"
sha256sum target/elf-compilation/docker/riscv64im-succinct-zkvm-elf/release/figaro-prover
mkdir -p target/elf-compilation/riscv64im-succinct-zkvm-elf/release
cp target/elf-compilation/docker/riscv64im-succinct-zkvm-elf/release/figaro-prover \
   target/elf-compilation/riscv64im-succinct-zkvm-elf/release/figaro-prover

SP1_SKIP_PROGRAM_BUILD=true SP1_VKEY_ONLY=1 cargo run -p figaro-prove-test --release 2>&1 | tail -3
echo BUILD-GUEST-COMPLETE
