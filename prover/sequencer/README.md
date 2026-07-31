# figaro-sequencer

The batch universe's public entry point: an HTTP relay that collects signed
protocol operations, assembles them into batches, proves each batch with SP1,
and settles it against `FigaroBatchVerifier`.

## Trust model — relay, not authority

`FigaroBatchVerifier.settleBatch` is **permissionless**: anyone can prove and
settle a batch, so this sequencer is one relay among any number — run your
own. Its honest powers are censor-or-delay, never forge: the SP1 proof binds
settlement to the EIP-712 structs both parties signed, and every admission
pre-check here (signature recovery, the kernel's witness gates) is the same
code the proof enforces — the mempool can only reject earlier, never accept
more. The endpoint holds no keys and grants no privilege; participants can
always fall back to direct `FigaroCore` submission.

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

## HTTP API

All errors are structured JSON: `{ "error": "<reason>" }`.

- `POST /submit` — body `{ "operation": <KernelOp> }` where `KernelOp` is the
  serde externally-tagged enum (`{"Commit":{…}}`, `{"Resolve":{…}}`,
  `{"AttestAsSeller":{…}}`, `{"AttestAsBuyer":{…}}`); the SDK's
  `SequencerClient` (`@figaro/sdk/agent`) emits exactly this wire format.
  `200 {"id": n}` on admission — idempotent: re-submitting the same semantic
  artifact (same order hash / process id / attestation identity) returns the
  original id and enqueues nothing. `400` on signature or witness-gate
  rejection, `413` over `MAX_BODY_BYTES`, `503` when the mempool is full.
- `POST /submit-usage` — body `{ "claim": <UsageClaim> }`.
  `200 {"pending": n}`; same error mapping. Idempotent by claim BYTES — a
  weaker guarantee than `/submit`'s on-chain-identity dedup: a semantically
  identical claim serialized differently enqueues twice. Harmless (the guest
  re-proves and the counter gates), but do not rely on it as identity dedup.
- `GET /health` — liveness + bounded counts:
  `{ "status": "ok", "pending_ops", "pending_usage_claims", "batches_settled" }`.
- `GET /status` — the above plus the sequencer's local `state_root` mirror.

There is no other read surface: settled state is read from the chain.

## Mempool bounds

Admission is bounded (`MEMPOOL_MAX_OPS` / `MEMPOOL_MAX_USAGE_CLAIMS`).
Eviction policy is deterministic: **at capacity the arriving submission is
the one refused** (`503`). An acknowledged submission is never silently
dropped — it stays queued until a batch drains it, and is re-queued
(cap-exempt) if settlement fails transiently. Idempotency spans the pending
window; after a batch settles, a re-submission is dropped by the stateful
assembler filter instead.
