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

# The build image is named by its digest, never by its tag alone: a tag can be
# moved to another image, and the image compiles the guest, so another image
# is another key from the same sources. The digest is the one the registry
# gives for the tag below; a new SP1 release has no digest here, and the build
# refuses until its digest is read from the registry and written in. The
# pinned image is pulled by digest and the tag is pointed at it on this
# machine, so `cargo prove build --docker --tag` runs that image.
SP1_IMAGE="ghcr.io/succinctlabs/sp1"
case "$SP1_TAG" in
  v6.8.1) SP1_IMAGE_DIGEST="sha256:e672d7160039916f40a6a4c2ea4cb0c8cd3dab120fdb24d08560d386ad8f59c2" ;;
  *) echo "no pinned digest for the SP1 build image $SP1_TAG: read it from the registry and add it here"; exit 1 ;;
esac
docker pull "$SP1_IMAGE@$SP1_IMAGE_DIGEST"
docker tag "$SP1_IMAGE@$SP1_IMAGE_DIGEST" "$SP1_IMAGE:$SP1_TAG"
echo "SP1 build image: $SP1_IMAGE:$SP1_TAG = $SP1_IMAGE_DIGEST"

cd "$REPO_ROOT/prover/program"
cargo prove build --docker --tag "$SP1_TAG"

cd "$REPO_ROOT/prover"
sha256sum target/elf-compilation/docker/riscv64im-succinct-zkvm-elf/release/figaro-prover
mkdir -p target/elf-compilation/riscv64im-succinct-zkvm-elf/release
cp target/elf-compilation/docker/riscv64im-succinct-zkvm-elf/release/figaro-prover \
   target/elf-compilation/riscv64im-succinct-zkvm-elf/release/figaro-prover

SP1_SKIP_PROGRAM_BUILD=true SP1_VKEY_ONLY=1 cargo run -p figaro-prove-test --release 2>&1 | tail -3
echo BUILD-GUEST-COMPLETE
