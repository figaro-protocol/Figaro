#!/usr/bin/env bash
# Provision a fresh Ubuntu x86_64 host as a Figaro prover box — the rented
# machine that builds the reproducible guest and runs the sequencer in
# real-Groth16 mode (the relay-operator role; the laptop is not a proving
# host). Sizing that carried the 2026-08-20 run: 16 cores / 30 GB RAM /
# 150 GB disk, ~19 GB used after all builds.
#
# Reconstructed 2026-08-20 from the first box's requirements (its scripts
# lived only on the deleted host); the build/run scripts beside this one are
# verbatim from that session.
set -euxo pipefail

apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y \
    git curl build-essential pkg-config libssl-dev python3 docker.io \
    protobuf-compiler

# Rust (the sequencer + prover host toolchain)
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y
source "$HOME/.cargo/env"

git clone https://github.com/figaro-protocol/Figaro "$HOME/Figaro"

# SP1 (cargo prove + the succinct toolchain), at the release the lock names:
# the verification key is a function of the toolchain release, and a bare
# `sp1up` installs whatever is newest that day.
SP1_TAG=v$(awk '/^name = "sp1-sdk"$/{getline; gsub(/version = |"/, ""); print; exit}' "$HOME/Figaro/prover/Cargo.lock")
[ "$SP1_TAG" != "v" ] || { echo "could not read the sp1-sdk version from Cargo.lock"; exit 1; }
curl -L https://sp1up.succinct.xyz | bash
"$HOME/.sp1/bin/sp1up" --version "$SP1_TAG"

# Foundry (anvil for the fork rehearsal, cast for reads)
curl -L https://foundry.paradigm.xyz | bash
"$HOME/.foundry/bin/foundryup"

# Node 22 (only needed if the driver ever runs box-side; the normal posture
# runs the driver on the laptop through an SSH tunnel)
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs

# The SP1 build image of the same release — the docker guest build and the
# gnark wrap use it.
docker pull "ghcr.io/succinctlabs/sp1:$SP1_TAG"

# Swap: the Groth16 gnark wrap peaks ~18 GB inside docker. On a 30 GB host the
# OOM killer takes gnark-cli at the proving spike without this.
fallocate -l 48G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile

echo PROVISION-COMPLETE
