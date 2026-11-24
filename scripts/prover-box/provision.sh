#!/usr/bin/env bash
# Provision a fresh Ubuntu x86_64 host as a Figaro prover box — the rented
# machine that builds the reproducible guest and runs the sequencer in
# real-Groth16 mode (the relay-operator role; the laptop is not a proving
# host). Sizing that carried the first real run: 16 cores / 30 GB RAM /
# 150 GB disk, ~19 GB used after all builds.
#
# Reconstructed from the first box's requirements (its scripts
# lived only on the deleted host); the build/run scripts beside this one are
# verbatim from that session.
#
#   ./provision.sh <release-commit> [<checkout dir>]
#   RELEASE_COMMIT=<sha> FIGARO_DIR=<checkout dir> ./provision.sh
#   SWAP_GB=0 ./provision.sh <release-commit>     # no swap file (a rehearsal in a container)
#
# The checkout is put at the release commit the maintainer names
# (checkout-release.sh), never at `main`: the verification key is a function
# of the guest's bytes, and the SP1 release below is read from that commit's
# prover/Cargo.lock. The checkout directory is the second argument or
# FIGARO_DIR, default $HOME/Figaro; a second box at another path builds the
# same key, since the build reads only paths inside the workspace
# (build-guest.sh).
set -euxo pipefail

RELEASE_COMMIT="${1:-${RELEASE_COMMIT:-}}"
FIGARO_DIR="${2:-${FIGARO_DIR:-$HOME/Figaro}}"
[ -n "$RELEASE_COMMIT" ] || { echo "usage: provision.sh <release-commit> [<checkout dir>] (or RELEASE_COMMIT=<sha> FIGARO_DIR=<dir>)"; exit 1; }

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git curl jq build-essential pkg-config libssl-dev python3 docker.io \
    protobuf-compiler libprotobuf-dev

# Rust (the sequencer + prover host toolchain)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

bash "$(dirname "${BASH_SOURCE[0]}")/checkout-release.sh" "$RELEASE_COMMIT" "$FIGARO_DIR"

# SP1 (cargo prove + the succinct toolchain), at the release the lock names:
# the verification key is a function of the toolchain release, and a bare
# `sp1up` installs whatever is newest that day.
SP1_TAG=v$(awk '/^name = "sp1-sdk"$/{getline; gsub(/version = |"/, ""); print; exit}' "$FIGARO_DIR/prover/Cargo.lock")
[ "$SP1_TAG" != "v" ] || { echo "could not read the sp1-sdk version from Cargo.lock"; exit 1; }
curl -L https://sp1up.succinct.xyz | bash
"$HOME/.sp1/bin/sp1up" --version "$SP1_TAG"

# Foundry (anvil for the fork rehearsal, cast for reads)
curl -L https://foundry.paradigm.xyz | bash
# The release CI pins (.github/workflows/foundry-ci.yml); a bare foundryup
# installs whatever is newest that day.
"$HOME/.foundry/bin/foundryup" --install v1.5.1
# A command sent over ssh reads no .bashrc, where foundryup sets the path:
# the scripts beside this one call `cast` bare (run-sequencer.sh), so the
# four tools are put where every shell finds them.
for tool in forge cast anvil chisel; do
    ln -sf "$HOME/.foundry/bin/$tool" "/usr/local/bin/$tool"
done

# Node 22: the deploy wrapper, the seeding and the live-batch driver run on
# it when they run from this machine.
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# What a deploy or a seeding from this checkout reads: the contracts'
# libraries (submodules), the root's and the frontend's packages, and the
# SDK built. --ignore-scripts keeps the root's commit hooks off this machine.
git -C "$FIGARO_DIR" submodule update --init --recursive
(cd "$FIGARO_DIR" && npm ci --ignore-scripts && npm --prefix sdk run build)
(cd "$FIGARO_DIR/frontend" && npm ci --ignore-scripts)

# The SP1 build image of the same release, which compiles the guest. This
# pull is by tag, to have the layers on the box; build-guest.sh pulls the
# image by its pinned digest and points the tag at that image before it
# builds, so the guest is compiled by the pinned image.
docker pull "ghcr.io/succinctlabs/sp1:$SP1_TAG"

# What a Groth16 proof fetches when it is made, fetched now so that the
# first real proof waits on no download: the gnark image, which SP1 names by
# its circuit version, and the circuit files, which SP1 downloads into
# ~/.sp1/circuits/groth16/<circuit version> on the first proof. SP1 pins
# neither by a checksum; the image's digest is printed here for the run's
# log, and the circuit files' address is only checked to answer.
(cd "$FIGARO_DIR/prover" && cargo fetch --locked)
CIRCUIT_VERSION=$(cat "$HOME"/.cargo/registry/src/*/sp1-prover-"${SP1_TAG#v}"/SP1_CIRCUIT_VERSION)
[ -n "$CIRCUIT_VERSION" ] || { echo "could not read SP1's circuit version from the sp1-prover crate"; exit 1; }
docker pull "ghcr.io/succinctlabs/sp1-gnark:$CIRCUIT_VERSION"
docker image inspect --format 'SP1_GNARK_IMAGE={{index .RepoDigests 0}}' "ghcr.io/succinctlabs/sp1-gnark:$CIRCUIT_VERSION"
curl -fsSIL "https://sp1-circuits.s3-us-east-2.amazonaws.com/$CIRCUIT_VERSION-groth16.tar.gz" > /dev/null \
    || { echo "the Groth16 circuit files of $CIRCUIT_VERSION do not answer at SP1's address"; exit 1; }

# Swap: the Groth16 gnark wrap peaked ~18 GB inside docker on the first box,
# under an earlier SP1 release; no real proof has been made at this one. On a
# 30 GB host the OOM killer takes gnark-cli at the proving spike without this.
# SWAP_GB=0 skips it: a rehearsal of this script in a container has no
# room for the file and no leave to turn swap on.
SWAP_GB="${SWAP_GB:-48}"
if [ "$SWAP_GB" != "0" ]; then
    fallocate -l "${SWAP_GB}G" /swapfile
    chmod 600 /swapfile
    mkswap /swapfile
    swapon /swapfile
fi

echo PROVISION-COMPLETE
