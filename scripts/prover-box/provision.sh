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
    git curl build-essential pkg-config libssl-dev python3 docker.io \
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

# Node 22 (only needed if the driver ever runs box-side; the normal posture
# runs the driver on the laptop through an SSH tunnel)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# The SP1 build image of the same release — the docker guest build and the
# gnark wrap use it. This pull is by tag, to have the layers on the box;
# build-guest.sh pulls the image by its pinned digest and points the tag at
# that image before it builds, so the guest is compiled by the pinned image.
docker pull "ghcr.io/succinctlabs/sp1:$SP1_TAG"

# Swap: the Groth16 gnark wrap peaks ~18 GB inside docker. On a 30 GB host the
# OOM killer takes gnark-cli at the proving spike without this.
fallocate -l 48G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

echo PROVISION-COMPLETE
