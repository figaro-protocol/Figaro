# figaro-sequencer

The batch universe's public entry point: an HTTP relay that collects signed
protocol operations, assembles them into batches, proves each batch with SP1,
settles it against `FigaroBatchVerifier` — and **publishes what it settled**.

## Trust model — relay, not authority

`FigaroBatchVerifier.settleBatch` is **permissionless**: anyone can prove and
settle a batch, so this sequencer is one relay among any number — run your
own. Its honest powers are censor-or-delay, never forge: the SP1 proof binds
settlement to the EIP-712 structs both parties signed, and every admission
pre-check here (signature recovery, the kernel's witness gates) is the same
code the proof enforces — the mempool can only reject earlier, never accept
more. The endpoint holds no keys and grants no privilege; participants can
always fall back to direct `FigaroCore` submission.

### Publication inherits the same posture

`FigaroCore` does two things for an order: it settles it, and it **publishes**
it. `OrderCommitted` / `OrderSeller` / `OrderCurrency` carry the whole
commitment struct; `OrderResolved` / `ProcessResolved` carry the resolution
facts; and the two signatures that admitted the order sit in the commit
transaction's calldata, readable by anyone. The batch path settles the same
trade but publishes none of it — `FigaroBatchVerifier`'s public values carry
no order hashes, its storage is `stateRoot` + `batchCount`, and `BatchSettled`
names no order — so a batched order's buyer, seller, payment and
`agreementHash` exist only under the proven state root. The read routes below
close that gap: they mirror the kernel's publication role for the batch
universe.

**Everything published is verifiable by the reader, so a relay can omit or
delay, never forge:**

- the commitment struct hashes to the published `order_hash` and `process_id`
  (`keccak256(processId, structHash)`, the kernel's own derivation);
- both signatures recover to the `buyer` and `seller` named *inside* that
  struct. **Batch-path signatures are over the VERIFIER's EIP-712 domain, not
  `FigaroCore`'s** — `FigaroBatchVerifier` requires
  `pv.verifyingContract == address(this)`, so verify against the
  `verifying_contract` and `chain_id` each record carries;
- `seller_payout` / `buyer_payout` are a pure function of the signed struct
  (`2 × expectedCumulativeValue + payment`, and `payment`);
- the batch itself is anchored on chain by its `prev_state_root →
  new_state_root` transition and, when present, `settlement_tx`.

A relay that publishes a struct nobody signed publishes something that fails
these checks. A relay that publishes nothing is simply less useful than one
that does — which is why `404` here says "not in **this** relay's archive",
never "did not happen".

**Custody, honestly.** The parties always hold their own signed artifacts —
each keeps its copy of the commitment and the signatures it produced. A relay
is a convenience publisher, never the sole custodian: if every relay drops an
artifact, the parties still have it, and any of them can re-publish or
re-submit it.

**Attestations are already on chain.** `FigaroBatchVerifier` re-emits every
batched attestation as an `Attestation` event, so that family needs no relay
mirror — read it from the chain. The archive covers exactly the families the
kernel publishes that the batch path does not.

## Getting the binary

"Run your own" is the point — `settleBatch` is permissionless — so there are two
ways to get one, and the second is the one that proves anything.

**Prebuilt.** Each `v*` tag publishes
`figaro-sequencer-<tag>-<target>.tar.gz` for Linux x86_64 and macOS arm64 to the
repo's GitHub Releases, built by `.github/workflows/sequencer-release.yml`.
Download it, check the companion `.sha256`, extract, run. This removes a
toolchain install; it grants nothing and implies no hosted service.

**From source.** Needs the host Rust toolchain plus SP1 — `cargo prove`
cross-compiles the guest program that the sequencer embeds:

```sh
curl -L https://sp1up.succinct.xyz | bash && sp1up
cd prover && cargo build --release --locked -p figaro-sequencer --bin sequencer
```

Each release body records the commit, both toolchain versions, the exact build
invocation, and the guest program's verification key (the value
`FigaroBatchVerifier` pins as `programVKey`), so a prebuilt binary can be
**rebuilt and compared** rather than trusted. The trust model above is unchanged
either way: the relay is transport, not authority, and what you verify is the
proof and the chain — never the provenance of a download.

## Running locally against devnet

The sequencer is started explicitly — `devup` does not launch it.

```sh
# 1. Devnet up (anvil + deployed contracts) via the usual devup flow.
# 2. Start the sequencer with the deployed addresses:
cd prover
RPC_URL=http://127.0.0.1:8545 \
CHAIN_ID=31337 \
FIGARO_CORE_ADDRESS=0x... \
BATCH_VERIFIER_ADDRESS=0x... \
USAGE_COUNTER_ADDRESS=0x... \
cargo run -p figaro-sequencer --bin sequencer
```

The devnet build uses the SP1 mock prover against `MockSP1Verifier`. For a
real verifier, set `SP1_PROVER=cpu` (or `cuda`) so the sequencer self-proves
locally.

### Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `RPC_URL` | `http://127.0.0.1:8545` | Chain RPC endpoint |
| `CHAIN_ID` | `31337` | EIP-712 domain chain id |
| `FIGARO_CORE_ADDRESS` | zero | EIP-712 verifying contract (the kernel) |
| `BATCH_VERIFIER_ADDRESS` | zero | `FigaroBatchVerifier`; zero = prove-only dry run |
| `USAGE_COUNTER_ADDRESS` | zero | RPGF `UsageCounter`; zero = credit no usage |
| `SEQUENCER_PRIVATE_KEY` | anvil account 0 | Settlement tx signer (pays gas; no protocol privilege) |
| `LISTEN_ADDR` | `0.0.0.0:3001` | HTTP listen address |
| `BATCH_INTERVAL_SECS` | `10` | Batch assembly tick |
| `MAX_BATCH_OPS` | `100` | Max ops per assembled batch |
| `MEMPOOL_MAX_OPS` | `10000` | Pending-op queue cap |
| `MEMPOOL_MAX_USAGE_CLAIMS` | `10000` | Pending usage-claim queue cap |
| `MAX_BODY_BYTES` | `1048576` | Per-request HTTP body cap |
| `ARCHIVE_PATH` | `sequencer-archive.jsonl` | Publication journal; empty = in-memory only |
| `ARCHIVE_MAX_BATCHES` | `10000` | Retained settled batches (see Publication bounds) |

## HTTP API

All errors are structured JSON: `{ "error": "<reason>" }`.

### Submission

- `POST /submit` — body `{ "operation": <KernelOp> }` where `KernelOp` is the
  serde externally-tagged enum (`{"Commit":{…}}`, `{"Resolve":{…}}`,
  `{"AttestAsSeller":{…}}`, `{"AttestAsBuyer":{…}}`); the SDK's
  `SequencerClient` (`@figaro/sdk/agent`) emits exactly this wire format.
  `200 {"id": n}` on admission — idempotent: re-submitting the same semantic
  artifact (same order hash / process id / attestation identity) returns the
  original id and enqueues nothing. `400` on signature or witness-gate
  rejection, `422` on valid JSON that is not a `KernelOp` (wrong shape, unknown
  variant, missing field), `413` over `MAX_BODY_BYTES`, `415` on a wrong
  content type, `503` when the mempool is full.
- `POST /submit-usage` — body `{ "claim": <UsageClaim> }`.
  `200 {"pending": n}`; same error mapping (including `422` for valid JSON
  that is not a `UsageClaim`). Idempotent by claim BYTES — a weaker guarantee
  than `/submit`'s on-chain-identity dedup: a semantically identical claim
  serialized differently enqueues twice. Harmless (the guest re-proves and the
  counter gates), but do not rely on it as identity dedup.

### Status

- `GET /health` — liveness + bounded counts:
  `{ "status": "ok", "pending_ops", "pending_usage_claims", "batches_settled" }`.
- `GET /status` — the above plus the sequencer's local `state_root` mirror and
  the publication window:
  `{ "state_root", "pending_ops", "pending_usage_claims", "batches_settled",
  "archive": { "first_batch", "last_batch", "retained_batches", "max_batches" } }`.
  Read `archive` BEFORE replaying: a cursor older than `first_batch` means this
  relay has already dropped the gap.

### Publication — the kernel's events, for the batch universe

Same wire dialect as `/submit`: `Commitment` and `Signature` are the exact
serde shapes `SequencerOp` sends (`snake_case` fields; `B256`/`Address` as
`0x`-hex, `U256` as a **hex quantity** — `"0x7d0"`, not `"2000"`).

- `GET /orders/{orderHash}` — one order:
  ```jsonc
  {
    "order_hash": "0x…", "process_id": "0x…",
    // absent (null) if the committing batch has aged out of retention
    "commit": {
      "commitment": { /* the 9-field struct exactly as signed */ },
      "buyer_signature":  { "v": 28, "r": "0x…", "s": "0x…" },
      "seller_signature": { "v": 28, "r": "0x…", "s": "0x…" },
      "batch": { "batch": 1, "chain_id": 31337, "verifying_contract": "0x…",
                 "prev_state_root": "0x…", "new_state_root": "0x…",
                 "settlement_tx": "0x…" /* null on a dry run */,
                 "block_timestamp": 1000 }
    },
    // absent (null) while the process is still open
    "resolution": { "seller": "0x…", "seller_payout": "0x…",
                    "buyer_payout": "0x…", "batch": { … } }
  }
  ```
  `400` on a malformed hash, `404` when neither leg is retained.
- `GET /processes/{processId}` — the process's orders and its resolution facts:
  `{ "process_id", "orders": [ <the /orders shape, one per order> ],
     "resolution": { "buyer", "order_count", "buyer_signature", "batch" } | null }`.
  `resolution` is the `ProcessResolved` equivalent, plus the buyer signature
  that authorized it (the batched form of `msg.sender == rootBuyer`); each
  order's own `resolution` is its `OrderResolved` equivalent. `400` / `404`
  as above.
- `GET /batches?from=<n>&limit=<n>` — bounded replay of everything this relay
  has settled, for an indexer walking the batch universe the way it walks
  kernel logs:
  `{ "batches": [ { "batch", "chain_id", "verifying_contract",
  "prev_state_root", "new_state_root", "settlement_tx", "block_timestamp",
  "commits": [...], "resolutions": [...] } ], "next_cursor": n | null,
  "retained": { … } }`.
  `from` defaults to the oldest retained batch; `limit` defaults to 10 and is
  **clamped to 50** whatever the caller asks. Follow `next_cursor` until it is
  `null`. `400` on a non-numeric parameter.

`batch` numbers are **this relay's own settled sequence** — a cursor, not a
protocol identity. Another relay numbers its batches differently; the
chain-anchored identity is `new_state_root` + `settlement_tx`. The number
resumes from the archive across a restart, so it never collides with what was
already published.

## Mempool bounds

Admission is bounded (`MEMPOOL_MAX_OPS` / `MEMPOOL_MAX_USAGE_CLAIMS`).
Eviction policy is deterministic: **at capacity the arriving submission is
the one refused** (`503`). An acknowledged submission is never silently
dropped — it stays queued until a batch drains it, and is re-queued
(cap-exempt) if settlement fails transiently. Idempotency spans the pending
window; after a batch settles, a re-submission is dropped by the stateful
assembler filter instead.

## Publication bounds

`Mempool::drain` clears the queue and its dedup index at assembly — nothing
about a settled order survives there — so retention is its own thing.

- **In memory**: at most `ARCHIVE_MAX_BATCHES` settled batches, oldest evicted
  first, indices dropped with them. A public relay must not grow without
  limit; `/status` publishes the window so eviction is visible rather than
  silent.
- **On disk**: an append-only JSONL journal at `ARCHIVE_PATH` (one
  `BatchRecord` per line — no database; the crate adds no dependency for it).
  Replayed at startup, rebuilding the indices. It is **rotated**, not grown:
  once more than `ARCHIVE_MAX_BATCHES` lines have been appended since the last
  rewrite, the file is rewritten from the retained window (via a temp file +
  rename, so a crash mid-rewrite leaves the previous journal intact). The file
  therefore stays under 2× the window, and a rewrite costs O(window) once per
  window rather than per batch.
- Set `ARCHIVE_PATH=` (empty) for an in-memory-only relay — it then answers for
  the process's lifetime and forgets on restart.
- Publication **follows** settlement and never gates it: a journal write error
  is logged and the batch stays settled and readable in memory.
