# The prover box — a rented Groth16 host for the batch universe

The relay operator's machine: builds the reproducible guest, runs the
sequencer with a real prover, and settles batches against `FigaroBatchVerifier`
— the role the protocol's cost model assigns to whoever operates a relay,
never to the protocol or its users. The laptop is not a proving host
(Succinct's Groth16 wrap floor is ~14 GB through the `sp1-gnark` docker image;
measured peak ~18 GB, ~6–7 min per wrap on 16 CPU cores).

First run: 2026-08-20 — the layered rehearsal that caught the guest's
public-values encoding bug on a fork before a live wei moved, then settled the
first two real batches on public Sepolia.

## Order of operations

On a fresh Ubuntu x86_64 host (16 cores / 30 GB RAM / 150 GB disk is the
proven sizing):

```sh
./provision.sh          # toolchains, repo clone, sp1 image, 48G swapfile
./build-guest.sh        # docker-reproducible ELF + inject + print the vkey
./build-sequencer.sh    # sequencer release binary + guest drift tests
```

`build-guest.sh` prints `SP1_PROGRAM_VKEY=…` — this MUST equal the deployed
`FigaroBatchVerifier.programVKey()` or every proof reverts `ProofInvalid()`.
Check before proving, not after a 7-minute wrap.

**Layer 2 — fork rehearsal** (spends nothing; the fork inherits live balances):

```sh
FORK_RPC=<keyed Sepolia RPC> ./run-fork.sh
# deploy a validation pair onto the fork if the guest changed (new vkey),
# then:
SEQUENCER_PRIVATE_KEY=<key> BATCH_VERIFIER=<addr> USAGE_COUNTER=<addr> \
  ./run-sequencer.sh
```

**Layer 3 — live** (same launcher, live RPC and the committed record's pair):

```sh
SEQUENCER_PRIVATE_KEY=<key> BATCH_VERIFIER=<record> USAGE_COUNTER=<record> \
  RPC_TARGET=https://ethereum-sepolia-rpc.publicnode.com ./run-sequencer.sh
```

The driver runs on the **laptop** against either target, through an SSH
tunnel — same invocation for fork and live, which is the rehearsal property:

```sh
ssh -f -N -L 18546:127.0.0.1:8546 -L 13001:127.0.0.1:3001 root@<box>
cd frontend && RPC_URL=<chain rpc or http://127.0.0.1:18546> \
  SEQUENCER_URL=http://127.0.0.1:13001 \
  BATCH_BUYER_KEY=… BATCH_SELLER_KEY=… npm run batch:drive
```

## Lessons the first run paid for

- **Swap is not optional.** The gnark wrap was OOM-killed at ~18 GB on the
  30 GB host until the 48G swapfile existed. The kill shows up as
  "Docker command failed" with exit status 137 buried in the panic.
- **Fork upstream must be a keyed RPC.** anvil's fork backend panicked
  mid-`eth_estimateGas` on the keyless public endpoint and took the fork's
  state with it.
- **`SP1_SKIP_PROGRAM_BUILD=true` on every host cargo invocation** after the
  docker ELF is injected — otherwise `sp1_build` replaces it with a native
  build and the embedded vkey silently diverges from the docker one.
- **`FIGARO_CORE_ADDRESS` is set to the BATCH VERIFIER** in `run-sequencer.sh`:
  the batch universe's EIP-712 domain is the verifier, never `FigaroCore`.
- **Watch the sequencer's log, not just `/status`.** A deterministic settle
  revert is retried as transient and `/status` has no failure counter (both
  punch-listed), so a dead batch is invisible to a polling driver.
- **Deleting the box deletes the relay archive** — the batched orders' only
  off-chain publication. The parties' own persisted records
  (`frontend/batch-records/`) are the custody that survives it.

Sequencer environment reference: `prover/sequencer/README.md`. Driver
environment reference: the header of `frontend/scripts/drive-live-batch.mjs`.
