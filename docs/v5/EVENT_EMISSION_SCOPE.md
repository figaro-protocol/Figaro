# Event-Emission Scope Review

**Audit date:** 2026-04-26
**Scope:** Every `event` declared and `emit`ted across `src/` contracts after Phases 1–6 of the agreement-binding rework. For each event: signature, payload size, consumers, and recommendation on whether to keep current shape, shrink to a hash + IPFS body, or restructure.

**Bottom line:** No events should move to IPFS. The two largest events (`OrderCommitted` at 224B data, `Attestation` at 96B data + content in calldata) reflect deliberate architectural choices that survive scrutiny. The "we're emitting too much" framing turns out to be wrong — the bulky payload (`bytes content`) was already removed from event data in Phase 4a; what remains is reconstruction-load-bearing.

---

## Cost calibration

EVM `LOG` opcodes cost: **375 gas base + 375 gas/topic + 8 gas/byte** of data payload. So:
- A 32-byte indexed topic costs 375 + 8×32 = 631 gas in topic-write equivalents (but topics are queryable; data isn't).
- A 32-byte data field costs 8×32 = 256 gas.
- An empty event with 1 topic costs 375 + 375 = 750 gas.

For perspective: a `commit` call that performs two `safeTransferFrom` calls (~50k gas each) costs ~120k gas total. The 224-byte `OrderCommitted` event payload (~1800 gas) is ~1.5% of the call cost. Event-emission optimization is rarely the constraint.

**Calldata cost** for content bytes: **16 gas/non-zero byte, 4 gas/zero byte** as transaction input. So putting `bytes content` in calldata is 2× more expensive per byte than putting it in event data — but calldata isn't included in event topic-search indices and doesn't bloat indexer queries.

---

## Event catalog

### `FigaroCore.sol`

#### `OrderCommitted` — 🟢 KEEP CURRENT SHAPE

```solidity
event OrderCommitted(
    bytes32 indexed orderHash,        // topic
    bytes32 indexed processId,        // topic
    address indexed buyer,            // topic
    address seller,                   // 32B (padded)
    address currency,                 // 32B
    uint256 payment,                  // 32B
    uint256 cumulativeValue,          // 32B
    bytes32 agreementHash,            // 32B
    uint256 salt,                     // 32B
    uint256 deadline                  // 32B
);
```

**Payload:** 3 topics + 224B data ≈ 3.3k gas/emission.

**Consumers:** `sdk/src/state.ts:applyOrderCommitted` (ProcessGraph reconstruction); frontend hooks reading commitment state; The Graph indexers; agent SDK reconstructing Commitment structs.

**Why this shape is correct:** The comment at `FigaroCore.sol:33-34` is load-bearing — "Includes salt and deadline so agents can fully reconstruct Commitment structs from events alone (no calldata parsing)." Removing salt or deadline forces every reader to fetch and `decodeFunctionData` the underlying `commit` transaction, which means: (a) tx-receipt dependency for state reconstruction, (b) doubled RPC roundtrips per commit for indexers, (c) reorg sensitivity for indexer pipelines that prefer log-only state.

The payment + cumulativeValue + agreementHash fields are similarly load-bearing for the SDK's `ProcessGraph` and for downstream attestation-validation flows.

**Could we move the manifest to IPFS?** The `agreementHash` is already the merkle root of an off-chain manifest (the Agreement). The event carries the root, not the manifest. That's already the right separation — the manifest body is off-chain (typically IPFS-anchored via the application), and the on-chain commitment carries only the root. Nothing to migrate.

---

#### `OrderSeller` / `OrderCurrency` — 🟢 KEEP

```solidity
event OrderSeller(bytes32 indexed orderHash, address indexed seller);
event OrderCurrency(bytes32 indexed orderHash, address indexed currency);
```

**Payload:** 2 topics + 0B data ≈ 1.1k gas each.

**Why these exist:** EVM caps indexed event parameters at 3 (plus the event signature topic = 4 total). `OrderCommitted` already uses all three indexed slots (orderHash, processId, buyer). To filter the indexer query by seller or currency, two companion events emit those fields as topics.

**Could we drop them?** Only if every consumer is willing to filter by full-table scan (downloading all `OrderCommitted` events and filtering client-side). The Graph could do this; raw RPC consumers cannot efficiently. The companion events cost ~2.2k gas total per commit — negligible relative to the commit's ~120k gas.

**Recommendation:** Keep. The cost is small and the topic-indexability is a real ergonomic for indexer-light consumers.

---

#### `OrderResolved` — 🟢 KEEP

```solidity
event OrderResolved(
    bytes32 indexed orderHash,
    bytes32 indexed processId,
    uint256 sellerPayout,
    uint256 buyerPayout
);
```

**Payload:** 2 topics + 64B data ≈ 1.6k gas.

**Consumers:** `sdk/src/state.ts:applyOrderResolved` (ProcessGraph state transition); financial-reconstruction flows.

**Why correct:** Payouts are derivable from commit state + currency exchange rates, but emitting them inline saves every indexer from recomputing on the fly. Inline payouts also future-proof against hypothetical resolution paths that route through coordinators (none today, but cheap insurance).

---

#### `ProcessResolved` — 🟢 KEEP

```solidity
event ProcessResolved(bytes32 indexed processId, address indexed buyer, uint256 orderCount);
```

**Payload:** 2 topics + 32B data ≈ 1.1k gas. Minimal.

---

### `AttestationCoordinator.sol`

#### `Attestation` — 🟢 KEEP CURRENT SHAPE (the design that prompted this audit is correct)

```solidity
event Attestation(
    bytes32 indexed orderHash,
    bytes32 indexed processId,
    address indexed attester,
    bytes32 schemaId,                 // 32B
    uint8 stage,                      // 32B (padded)
    bytes32 contentRef                // 32B (= keccak256(content))
);
```

**Payload:** 3 topics + 96B data ≈ 1.9k gas.

**Critical clarification:** This event does NOT carry the full attestation `content` bytes. The `bytes content` parameter passed to `attestAsBuyer` / `attestAsSeller` lives in the **transaction calldata**, not in the event. The event carries only `contentRef = keccak256(content)` — a 32-byte verification digest.

**Reconstruction path:** indexers and frontends recover the full content via `getAttestationContent(txHash)` which calls `viem.decodeFunctionData` against the AC ABI on the transaction's calldata. This pattern was established in Phase 4a (per the backlog "Done in straggler-review session 2026-04-23 evening" — the GHG hook fix that mirrored frontend2's approach to the legacy frontend).

**Why the user's "too much emission" worry doesn't apply here:** The genuinely bulky data (sometimes hundreds of bytes for measurement schemas, future evidence schemas) is in calldata, not event payload. The event is already at the minimum useful shape — anything less and indexers couldn't filter by schemaId or know which stage was attested.

**Could we shrink further (e.g. drop `stage`)?** No — `stage` discriminates between handoff phases (preparation / pickup / delivered), GHG measurement maturity (estimate / measured / restated / verified), etc. Without it, indexers can't distinguish "ready" from "delivered" without decoding calldata.

**Could we move content to IPFS instead of calldata?** This was tried before Phase 4a and broke `useGHGDisclosure` — the keccak-only-decoder shape returned garbage when downstream consumers tried to recover grams from a hash. Reverting re-opens that failure mode. Phase 4a chose `bytes content` in calldata explicitly.

**Architectural symmetry:** The pattern is the right separation:
- **Indexable fields** (filterable per orderHash, processId, attester): topics.
- **Reconstruction fields** (needed without calldata): event data (schemaId, stage, contentRef).
- **Bulk content** (variable size, schema-specific): calldata, recovered via `decodeFunctionData`.
- **Meta-spec body** (schema JSON specs): IPFS, anchored via `SchemaRegistry.uriHash`.

---

#### `ValidatorSet` — 🟢 KEEP

```solidity
event ValidatorSet(bytes32 indexed schemaId, address indexed validator);
```

**Payload:** 2 topics + 0B data. Minimal. First-write-wins lifecycle event.

---

### `SchemaRegistry.sol`

#### `SchemaRegistered` — 🟢 KEEP (canonical IPFS-anchored pattern)

```solidity
event SchemaRegistered(
    bytes32 indexed schemaId,
    uint64 version,
    bytes32 uriHash,
    address indexed registrar
);
```

**Payload:** 2 topics + 64B data.

**Why this is the reference pattern:** `uriHash` is the hash of an off-chain URI (typically IPFS) that holds the JSON schema spec. The event carries: (a) the schemaId for filtering, (b) the version, (c) the hash anchoring off-chain spec content, (d) the registrar for accountability. The actual spec body — potentially many KB — lives on IPFS.

This is the model future events should follow when the body genuinely is large (>512B) AND content-addressed lookup is acceptable (i.e., not load-bearing for hot reconstruction paths).

---

#### `MechanismSchemaSet` — 🟢 KEEP

```solidity
event MechanismSchemaSet(address indexed mechanism, bytes32 indexed schemaId);
```

**Payload:** 2 topics + 0B data. Minimal. Pure lifecycle binding.

---

### `OperatorRegistry.sol`

#### `OperatorRegistered` / `OperatorUpdated` — 🟡 CONSIDER

```solidity
event OperatorRegistered(address indexed operator, OperatorRole role, string metadataURI);
event OperatorUpdated(address indexed operator, OperatorRole role, string metadataURI);
```

**Payload:** 1 topic + variable data (`string metadataURI` is unbounded).

**Concern:** `metadataURI` is the only unbounded-size field across the contract surface. A malicious or careless operator could emit arbitrarily large strings, paying ~16 gas/byte (calldata cost during the call) plus 8 gas/byte (event emission). Practically self-limited by gas, but worth a sanity bound.

**Recommendation:** Add a length cap on `metadataURI` (suggest 512 bytes). This isn't a security issue — the operator pays for their own waste — but it caps event-data bloat for all indexers downstream. Alternative: emit `keccak256(metadataURI)` only and require operators to pin the URI body off-chain (mirrors the SchemaRegistry pattern).

The IPFS-anchored shape (`bytes32 indexed operator, OperatorRole role, bytes32 metadataURIHash`) is structurally cleaner and matches the SchemaRegistry idiom. Cost: small migration for indexers that read metadata strings inline.

**Action item:** add a length cap (low effort) OR migrate to a hash-only emission (medium effort, more architecturally consistent). Defer until the operator-registry surface gets a use beyond the current sketch.

---

#### `OperatorDeactivated` / `OperatorReactivated` — 🟢 KEEP

Topic-only events, minimal cost.

#### `OperatorWithdrawn` — 🟢 KEEP

```solidity
event OperatorWithdrawn(address indexed operator, uint256 deposit);
```

1 topic + 32B data. Minimal.

---

### `DutchAuction.sol`

All four events (`AuctionCreated`, `AuctionClaimed`, `AuctionCancelled`, `AuctionExpired`) are at minimum useful shape. `AuctionCreated` carries `maxPrice` + `currency` inline (4 fields total in 64B data + 3 topics) — these are needed for indexers to compute the descending-price curve without re-fetching auction storage on every block. 🟢 KEEP all.

---

### `FigaroBatchVerifier.sol`

Re-emits protocol events. Same shapes as the corresponding canonical events in AC, SchemaRegistry, OperatorRegistry. The `BatchSettled` summary event adds 32B for `positionCount` over the bare 3-topic minimum. 🟢 KEEP — payload minimum already.

**Note:** the topic-hash collision warnings at lines 96, 102, 112, etc. are an indexer-discipline issue, not an emission-scope issue. Indexers MUST filter by contract address. Audit finding M-3 covers this.

---

### `FigToken.sol`

#### `MinterRegistered` — 🟢 KEEP

1 topic + 32B data. Minimum useful shape. Lifecycle event.

---

### `StagedMerkleAirdrop.sol`

#### `Claimed` — 🟢 KEEP

```solidity
event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount);
```

2 topics + 32B data. Minimum useful shape.

---

## Per-event verdict summary

| Contract | Event | Payload | Verdict |
|---|---|---|---|
| FigaroCore | OrderCommitted | 3 topics + 224B | 🟢 keep — load-bearing for log-only reconstruction |
| FigaroCore | OrderSeller | 2 topics + 0B | 🟢 keep — works around 3-index limit |
| FigaroCore | OrderCurrency | 2 topics + 0B | 🟢 keep — same |
| FigaroCore | OrderResolved | 2 topics + 64B | 🟢 keep |
| FigaroCore | ProcessResolved | 2 topics + 32B | 🟢 keep |
| AttestationCoordinator | **Attestation** | **3 topics + 96B + content in calldata** | **🟢 keep — current design is correct** |
| AttestationCoordinator | ValidatorSet | 2 topics + 0B | 🟢 keep |
| SchemaRegistry | SchemaRegistered | 2 topics + 64B (uriHash) | 🟢 keep — reference pattern |
| SchemaRegistry | MechanismSchemaSet | 2 topics + 0B | 🟢 keep |
| OperatorRegistry | OperatorRegistered | 1 topic + variable string | 🟡 cap or hash |
| OperatorRegistry | OperatorUpdated | 1 topic + variable string | 🟡 cap or hash |
| OperatorRegistry | OperatorDeactivated/Reactivated | 1 topic | 🟢 keep |
| OperatorRegistry | OperatorWithdrawn | 1 topic + 32B | 🟢 keep |
| DutchAuction | All 4 | minimum useful | 🟢 keep |
| FigaroBatchVerifier | All re-emissions | mirrors source | 🟢 keep |
| FigToken | MinterRegistered | 1 topic + 32B | 🟢 keep |
| StagedMerkleAirdrop | Claimed | 2 topics + 32B | 🟢 keep |

---

## Design principle for new events

When adding a new event to the contract surface:

1. **Indexed (topic) fields** — for everything that should be filterable by a topic-search query (orderHash, processId, schemaId, attester). Cap at 3 indexed parameters.
2. **Inline data fields** — for fields a state-reconstructing indexer needs without an extra RPC roundtrip. Default-include lifecycle data (timestamps, payouts, role discriminators).
3. **Hash references (32B digests)** — for content that is large or accessed less frequently than the event is queried. Examples: `contentRef = keccak256(content)`, `uriHash = keccak256(off-chain spec URI)`.
4. **Bulk content in calldata** — for variable-size payloads recoverable via `decodeFunctionData(txHash)`. Keep out of event data so indexer queries stay fast.
5. **IPFS-anchored body** — for content that is genuinely too large for either calldata or event data (>~10KB). Anchor via `bytes32 contentHash` in the event; serve body off-chain.

**Default to inline event data** for payloads under ~512 bytes when state reconstruction depends on the field. Move to hash-anchored only when the body grows substantially or when content-addressed lookup is acceptable.

The user's original concern — "we may be emitting too many variables, maybe move to IPFS" — turns out to apply only to one event family (the `OperatorRegistry` `metadataURI` strings). Everything else is at or near minimum useful shape, with the bulky `bytes content` already routed through calldata rather than event data.

---

## Action items

1. **🟡 OperatorRegistry metadataURI cap** — add a length bound (suggest ≤512 bytes) on `metadataURI` in `register` / `update` to cap event-data growth. Low effort, no migration needed for current tests/fixtures (sketch surface uses short URIs). Alternative: migrate to `bytes32 metadataURIHash` for symmetry with SchemaRegistry; defer until OperatorRegistry has a use beyond its current sketch state.

No other changes warranted. The Phase 4a decision to put attestation `content` in calldata (not event data) was correct — the user's "too many emitted variables" concern is mostly an artifact of seeing the AC ABI signature without the calldata-vs-event-data distinction. The genuinely bulky payload was already kept out of event topics.
