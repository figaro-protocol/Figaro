# Figaro Protocol — Web3 Adversarial Audit

**Date**: 2026-04-26
**Auditor**: Claude Opus 4.7 (1M context), interactive audit dispatched as 4 parallel attack-class probes (validator/AC inputs, bonding economics, BatchVerifier+sequencer, composition chains).
**Companion to**: `docs/v5/SECURITY_AUDIT_AI.md` (Web3 normal-pass audit, same date). The normal pass covered standard checklist items; this pass is the hostile-frame complement, graded by **blast radius** rather than traditional severity.

## Disclaimer

This is an AI-generated adversarial audit. It complements but does not replace
adversarial review by a professional firm (Trail of Bits, Spearbit, Trust
Security, etc.). AI adversarial passes excel at exhaustive enumeration of
attack composition chains and at identifying where trust boundaries shift
between layers. Professional adversarial auditors bring red-team creativity,
economic-game modeling that AI lacks intuition for, and live exploit
development.

## Scope

The same post-amendment surface as the 2026-04-26 normal pass:

- 14 schema validators in `src/schemaValidators/` + `src/ISchemaValidator.sol` (10 original + 4 net-new from the 2026-04-26 GHG split: `figaro-ghg-disclosure-v1` was replaced by 5 sister schemas `figaro-ghg-protocol-v1`, `figaro-ghg-iso-14064-v1`, `figaro-ghg-pas-2050-v1`, `figaro-ghg-en-16258-v1`, `figaro-ghg-custom-v1` — same audit profile, standard identity now in schemaId not content)
- `src/AttestationCoordinator.sol` (Phase-4a/4b rewrite)
- `src/SchemaRegistry.sol`
- `src/FigaroCore.sol` + `src/CommitmentTypes.sol`
- `src/FigaroBatchVerifier.sol`
- `src/fig/FigToken.sol` + `src/fig/StagedMerkleAirdrop.sol`
- `src/OperatorRegistry.sol`, `src/DutchAuction.sol`, `src/IRoleResolver.sol`

## Adversarial framing

**Goal of an adversarial pass**: find what the standard checklist misses.
That includes:

- **Chained attacks**: low-severity findings that compose into high-severity attacks across two or more contracts.
- **Trust-boundary attacks**: attacks at the seam between protocol and external systems (sequencer, validators, downstream display, deployment discipline) — the kernel is sound, but the boundary is where reality intrudes.
- **MEV / ordering / mempool attacks**: anything where the attacker exploits transaction ordering rather than contract state.
- **Adversarial inputs**: deliberately malformed payloads, max-value inputs, edge cases the validator's spec doesn't explicitly bound.
- **Behavioral / coordination exploits**: attacks where the protocol enforces correctly but the attacker exploits the off-chain coordination assumption.

The 13 design-decision false positives in `DESIGN_DECISIONS.md` are skipped — they are the protocol's intentional shape, not vulnerabilities.

## Methodology

Four parallel attack-class probes, each told to think like an attacker (not a checklist auditor) and to grade by **blast radius**:

- **Catastrophic**: kernel invariant break (token conservation / contract solvency / buyer dominance / atomic resolution / immutable evidence / no-escape-hatch).
- **Severe**: funds-at-risk for arbitrary user, OR a high-stakes use-case (compliance schema capture, regulatory attestation forgery).
- **Moderate**: griefing or specific-target impact, no funds extraction.
- **Minor**: indexer/UX behavior, informational adversarial note.

Probes:
- **A** — Validator/AC adversarial inputs + hash-collision attempts
- **B** — Bonding economics + multi-party process exploitation
- **C** — BatchVerifier + sequencer trust boundary
- **D** — Cross-contract composition chains

Each probe was pre-loaded with `DESIGN_DECISIONS.md`, the normal-pass findings (`SECURITY_AUDIT_AI.md`), `SEQUENCER_TRUST_MODEL.md`, and the agreement-binding audit (`AGREEMENT_BINDING_AUDIT.md`).

---

## Headline result

**0 catastrophic, 0 severe (true), several moderate compositions, several minor adversarial notes.**

The kernel and its invariants survive adversarial scrutiny intact. The residual risk surface is concentrated at **trust boundaries between the protocol and external systems** — exactly where `SEQUENCER_TRUST_MODEL.md` and `DESIGN_DECISIONS.md` already locate it. The adversarial pass produced **no net-new actionable findings against the kernel**, but it strengthens the case for two specific protocol-extension cleanups already queued or recommended:

1. **Implement `registerSchemaAndValidator` convenience method** (queued in backlog). Chain D-4 below shows the M-1 front-running risk has higher blast radius for high-stakes schemas (compliance/regulatory) than for low-stakes ones. Doc-only mitigation (DESIGN_DECISIONS #13, landed 2026-04-26) is sufficient for the bootstrap surface but leaves residual risk for schemas where the use case carries asymmetric stakes.
2. **Tighten `ISchemaValidator` purity guidance from "should be view" to "must be pure"** (Chain D-8 below). Currently the interface allows view, which permits external state reads; STATICCALL prevents writes but not non-determinism. All 10 production validators are pure, but third-party validators could be stateful. Small NatSpec + CLAUDE.md update.

Beyond these, the pass surfaces seven attack vectors that are **viable but bounded by design** — they are griefing/UX/indexer-discipline concerns the protocol already documents (or that depend on operational discipline at the sequencer/deployer/indexer layer).

---

## Findings

Numbered by probe + sequence. Blast-radius graded.

### Probe A — Validator/AC inputs + hash collision

#### A-1 — Attestation `stage` is attestation-time, not commitment-time
**Blast radius**: Minor
**Surface**: `AttestationCoordinator.sol:155, 180, 204` (event emission), validators per-schema
**Vector**: Attester supplies `stage` parameter; merkle inclusion proof binds only `(schemaId, sectionData)`, not stage. An attester with a valid clause proof can lie about stage (e.g., emit "stage 3 verified" against a clause that was committed for "stage 1 measured").
**Defended by**: Per-schema validators (e.g., GHG-Disclosure, Lifecycle, Restaurant, Driver) check stage bounds against their enum. The Category-1 design treats stage as a runtime envelope, not a commitment.
**Net assessment**: Not a vulnerability. The stage parameter is intentionally attestation-time per the protocol's runtime/commitment separation. Indexers that conflate stage with the committed clause's stage-of-record need to read the committed `sectionData` for the canonical stage, not the event's `stage` field. Worth documenting in `/help` schema interpretation guidance.

#### A-2 — Malicious validator with non-deterministic `schemaId()`
**Blast radius**: Severe (theoretical), **fully blocked in practice**
**Surface**: `AttestationCoordinator.setValidator` (line 117-124) — binds via `validator.schemaId()` self-attestation, ONCE.
**Vector**: An attacker deploys a validator whose `schemaId()` returns the legitimate ID at binding time but a different ID later. AC's binding check passes; the validator is permanently bound but reports inconsistent identity post-bind.
**Defended by**: (1) `STATICCALL` dispatch at `_validateContent:229` prevents any state mutation by the validator at runtime — non-determinism via storage reads is theoretically possible but cannot mutate state. (2) Validator deployment discipline: production validators are immutable bytecode with `bytes32 public constant override schemaId` — non-determinism is impossible by construction. (3) DESIGN #4 (no admin) means even if a malicious validator captures a binding, no rug-pull lever exists; the binding is locked.
**Net assessment**: Not viable for any currently-deployed validator. A future validator that uses a proxy pattern or storage-backed `schemaId()` would create a latent risk. The discipline is documented in DESIGN_DECISIONS #13 (atomic register+bind) and reinforced by the `external pure override` pattern across all 10 production validators.

#### A-3 — Leaf/internal-node hash conflation
**Blast radius**: Catastrophic (theoretical), **structurally impossible**
**Surface**: AttestationCoordinator merkle proof verification (`_validateContent:224-231`), OZ MerkleProof (sorted-pair).
**Vector**: Attacker constructs `(schemaId, sectionData)` such that `keccak256(schemaId || keccak256(sectionData))` matches an internal node hash, allowing a leaf to "open" a different proof path.
**Defended by**: Both leaf and internal-node preimages are 64 bytes (leaf: schemaId || sectionDataHash; node: min || max), so length-based collision is not a mitigation. The mitigation is **keccak256 collision resistance** itself — finding such a collision requires breaking keccak, which would compromise Ethereum entirely.
**Net assessment**: Withdrawn. Standard cryptographic assumption. The leaf format (`abi.encodePacked(bytes32, bytes32)`) has no length ambiguity.

#### A-4 — Commerce validator gas-griefing via unbounded line-item array
**Blast radius**: Minor
**Surface**: `FigaroCommerceV1Validator.validate` (line items array, no upper bound).
**Vector**: Attacker submits a 1M-item commerce attestation, exhausting gas during `abi.decode` + loop.
**Defended by**: Solidity 0.8 reverts cleanly on gas exhaustion; the validator is called as STATICCALL so the entire attestation reverts atomically. The attacker pays the failed-tx gas; no protocol state changes.
**Net assessment**: Self-griefing only. Aligns with INFO-8 reasoning (validators are syntactic gates; semantic bounds are off-chain).

#### A-5 — Geo validator UTF-8 multibyte bypass
**Blast radius**: Minor (attempted)
**Surface**: `FigaroGeoV1Validator._validateGeohash` byte-level loop.
**Vector**: Attacker supplies geohash with UTF-8 multibyte characters (e.g., "é" = `0xc3 0xa9`).
**Defended by**: Byte-level check `c >= 0x62 && c <= 0x7a` (lowercase b-z) rejects all bytes > 0x7a. UTF-8 high bytes (0x80-0xFF) all fall outside this range.
**Net assessment**: Defense holds. Byte-level character classification correctly rejects non-ASCII.

#### A-6 — Proximity validator zero-byte signature
**Blast radius**: Minor
**Surface**: `FigaroProximityV1Validator.validate` (signature length check).
**Vector**: Attacker submits 65-byte all-zero signature. Validator only checks length (65-512), not cryptographic validity.
**Defended by**: Validator is intentionally syntactic; cryptographic verification is downstream's responsibility.
**Net assessment**: Aligns with Category-1 design. Recommend `/help` document that proximity attestations require client-side signature verification before treating them as authoritative.

#### A-7 — Cross-section proof reuse across identical agreements
**Blast radius**: Moderate (theoretical)
**Surface**: AttestationCoordinator merkle proof verification.
**Vector**: Two orders with byte-identical agreement sections produce identical `agreementHash` values; a proof for order A's clause works for order B's identical clause.
**Defended by**: Two orders with identical agreements ARE the same agreement by hash. The proof is correctly portable. The `Attestation` event records the target's `orderHash` and `attester` truthfully.
**Net assessment**: Not an exploit. Multi-round process composition expects this — identical clauses across orders share inclusion proofs by design. DESIGN #2 already covers cross-order attestation; this is the stronger statement that even cross-process attestation works if agreements are identical (which is rare but not pathological).

#### A-8 — Attestation spam → indexer DoS
**Blast radius**: Minor (indexer concern)
**Surface**: Any `attest*` path on AttestationCoordinator.
**Vector**: Attacker with any committed order in process P spams attestations against any other order in P (DESIGN #2 cross-order pattern), saturating indexer event queues.
**Defended by**: Each attestation costs gas (validator gate + merkle proof verification + event emission). Spam is economically self-limiting.
**Net assessment**: Indexer-operational concern, not a protocol gap. Indexers should deduplicate by `(orderHash, schemaId, stage, contentRef)` and rate-limit per attester.

### Probe B — Bonding economics + multi-party process exploitation

#### B-1 — Weakest-link sub-tree griefing by low-bond seller
**Blast radius**: Moderate
**Surface**: FigaroCore atomic resolution + asymmetric bonding (`commit`, `resolveProcess`).
**Vector**: Attacker Eve inserts a small sub-order (low payment → low cumulative → low bond, e.g., $5 payment with $250 bond), then strategically defaults. Atomic resolution means upstream sellers (Bob $200 bond, Charlie $240 bond) cannot resolve without Eve. Eve's loss ($250) is bounded; total upstream lock is larger.
**Preconditions**: Buyer Alice must consent to Eve's sub-order via bilateral signature.
**Defended by**: Bilateral signature requirement — Alice is the gate. If Alice signs Eve's order, Alice has accepted Eve as a counterparty. Reputation/identity filtering is the off-chain mitigation.
**Net assessment**: Viable as **bounded griefing**; not value extraction. Eve cannot profit (her bond is forfeit). Composition-layer institutional risk: assemblies should pre-commit material sellers off-chain and treat post-genesis insertions with reputation scrutiny. Not a kernel concern; the bilateral-signature requirement is the gate. **THEORY.md Layer 2** (the micro-lending circle reputation effect) is the off-chain check this attack assumes is absent.

#### B-2 — Sequential seller renegotiation lock-in
**Blast radius**: Moderate
**Surface**: FigaroCore multi-round process composition.
**Vector**: Downstream seller Charlie refuses to sign a planned sub-order unless upstream seller Bob accepts a payment reduction. Bob's choice: refuse (lose his bond if Alice can't complete) or accept (lose part of his payment). Subgame-perfect rational outcome: Bob capitulates.
**Preconditions**: Alice must have left room for optional sellers (not fully pre-committed at root). Sequential dependency between sellers.
**Defended by**: Alice's buyer dominance (she can resolve with the subset who DID sign, even if it doesn't achieve her stated goal). Process-tree composition — Alice can route around Charlie via parallel sub-trees.
**Net assessment**: Viable institutional game, not a code bug. Dependency on full pre-commitment off-chain is the discipline. DESIGN #1 (multi-round bilateral signature) is the protocol-layer correctness; institutional design is the composition-layer mitigation.

#### B-3 — Cumulative value false claim
**Blast radius**: Catastrophic (theoretical), **fully blocked**
**Surface**: `FigaroCore.commit` (sub-order path).
**Vector**: Attacker commits sub-order with false `expectedCumulativeValue` to inflate or deflate bond requirements.
**Defended by**: `expectedCumulativeValue` is in the EIP-712 `Commitment` struct; signature binds it; orderHash derives from structHash. A fabricated value produces a different orderHash that doesn't match any committed entry.
**Net assessment**: Cryptographically impossible. Verified by Certora `cumulativeValueMonotonic` rule.

#### B-4 — Selective order omission in `resolveProcess`
**Blast radius**: Severe (theoretical), **fully blocked**
**Surface**: `FigaroCore.resolveProcess`.
**Vector**: Buyer attempts to resolve a 4-order process with only 3 commitment payloads, cherry-picking which sellers get paid.
**Defended by**: Contract enforces `commitments.length == ps.activeOrderCount`; mismatch reverts.
**Net assessment**: Blocked at the kernel layer. Atomic resolution is on-chain enforced.

#### B-5 — Resolved-process re-opening griefing (proposal spam)
**Blast radius**: Minor
**Surface**: DESIGN #1 (multi-round process re-opening).
**Vector**: Attacker repeatedly proposes new sub-orders to a resolved process; buyer must manually refuse each one off-chain.
**Defended by**: Bilateral signature — buyer's silence is the refusal. No on-chain cost to buyer.
**Net assessment**: UX friction only. No financial exposure. Wallet-level filtering or whitelist mitigates.

#### B-6 — Cumulative value overflow attack
**Blast radius**: Catastrophic (theoretical), **fully blocked**
**Surface**: `FigaroCore.resolveProcess` payout calculation (`expectedCumulativeValue * 2 + payment`).
**Vector**: Construct sub-orders summing to near `type(uint256).max / 2` to trigger overflow at payout.
**Defended by**: Explicit guard `expectedCumulativeValue > type(uint256).max / 3` reverts; Solidity 0.8 checked arithmetic provides a second layer; gas ceiling (~2,145 orders/process) functionally caps cumulative growth far below saturation.
**Net assessment**: Triple-defended. Verified by Halmos `check_cumulativeValueMonotonic` and Certora.

### Probe C — BatchVerifier + sequencer trust boundary

#### C-1 — Unbounded event/position arrays → batch-wide gas DoS
**Blast radius**: Moderate (liveness, not safety)
**Surface**: `FigaroBatchVerifier.settleBatch` event re-emission loops + position settlement loop.
**Vector**: Sequencer (or attacker via sequencer compromise) submits a batch with millions of events or positions, exhausting gas mid-execution.
**Defended by**: DESIGN #10 ("ZK proof is the single authority; no redundant on-chain batch guards"). The constraint is **prover-side cardinality limits** documented in `SEQUENCER_TRUST_MODEL.md`. On-chain, the batch reverts atomically if it OOMs — no partial state corruption.
**Net assessment**: Not a kernel break. **Liveness assumption on the sequencer**: if the sequencer is compromised, batched operations cannot land but FigaroCore direct-path operations remain available. Operational mitigation: sequencer client should enforce cardinality limits before proof generation.

#### C-2 — Selective approval revocation as batch-wide DoS extortion
**Blast radius**: Moderate (extends INFO-3)
**Surface**: `FigaroBatchVerifier._executePositions` + ERC20 `safeTransferFrom` + sequencer mempool latency.
**Vector**: Attacker has a small position in batch N. Observes the proof submission tx in mempool; revokes their approval in a higher-priority tx; batch reverts; other batch participants are griefed. Attacker's cost is the revocation gas (~21K).
**Defended by**: SEQUENCER_TRUST_MODEL.md INFO-3 documents the operational mitigation (sequencer must re-verify approvals immediately before submission). Cannot be enforced on-chain without per-position state tracking, which breaks the stateless design.
**Net assessment**: Real adversarial scenario, mitigated only at the sequencer-operations layer. The kernel is unaffected — direct-path FigaroCore settlement bypasses the batch entirely. **Recommendation**: SEQUENCER_TRUST_MODEL.md should be augmented with a concrete "selective adversarial approval revocation" scenario alongside the existing accidental-revocation note.

#### C-3 — Cross-chain proof replay
**Blast radius**: Severe (theoretical), **blocked**
**Surface**: `FigaroBatchVerifier.settleBatch` public-values decoding.
**Vector**: Valid batch proof from chain A submitted on chain B.
**Defended by**: `pv.chainId != block.chainid` reverts (line 191); `pv.verifyingContract != address(this)` reverts (line 195). Both fields are part of the SP1 public values, cryptographically bound to the proof.
**Net assessment**: Blocked. The defense is airtight against both cross-chain and cross-deployment replay.

#### C-4 — Migration-time genesis-root foot-gun
**Blast radius**: Minor
**Surface**: `FigaroBatchVerifier` constructor (`_initialRoot` not zero-checked — INFO-9 in normal pass).
**Vector**: A new BatchVerifier deployment uses the old verifier's final state root as `_initialRoot`. An attacker who has a proof from the old contract's history could in principle resubmit it — but the proof's `pv.verifyingContract` is bound to the OLD contract's address, so submission to the new address reverts.
**Defended by**: `pv.verifyingContract` check at line 195. Proofs are address-bound; cross-deployment replay is blocked even with shared state roots.
**Net assessment**: No actual vulnerability; the migration scenario doesn't open an exploit path. INFO-9 stands as a fail-fast deployment-hygiene recommendation, not a security gap.

#### C-5 — Sequencer MEV via batch ordering
**Blast radius**: Minor (designed)
**Surface**: Sequencer's choice of batch order.
**Vector**: Sequencer with multiple competing valid proofs chooses which to submit first; competing batches that depend on the pre-submission state become invalid (`prevRoot != stateRoot` guard).
**Defended by**: SEQUENCER_TRUST_MODEL.md explicitly: sequencer is trusted for liveness AND ordering. State-root continuity is correct (prevents double-apply); ordering is sequencer's decision.
**Net assessment**: Accepted design. Documented. If fairness-in-ordering becomes load-bearing for a future use case, sequencer rotation or VRF-based ordering would address it; not a current concern.

#### C-6 — Re-emitted events ambiguity
**Blast radius**: Minor (indexer-discipline)
**Surface**: `FigaroBatchVerifier` re-emits Attestation/SchemaRegistered/etc. with the same topic hashes as direct-path emissions.
**Vector**: An indexer that doesn't filter by contract address conflates direct-path events with batch-re-emitted events; a malicious batch could in principle inject events that an indexer reads as direct-path.
**Defended by**: Contract has WARNING comments at every re-emit site (lines 96-127). CLAUDE.md and AUDIT_REPORT.md document the requirement that indexers filter by contract address. The ZK proof constrains what events can be re-emitted (safety is enforced by the prover).
**Net assessment**: Indexer-operational concern. Documented. Recommend SDK/indexer boilerplate add explicit contract-address filtering as a defense-in-depth.

### Probe D — Composition / chained attacks across contracts

#### D-1 — Malicious resolver self-authorization (latent attestViaResolver)
**Blast radius**: Moderate (latent — no current production caller)
**Composition**: `AttestationCoordinator.attestViaResolver` + `IRoleResolver` (untrusted) + DESIGN #3 (buyer == seller permitted).
**Vector**: Attacker deploys an IRoleResolver contract, commits an order naming that contract as seller (self-signed via DESIGN #3), then calls `attestViaResolver`. The resolver returns `true` for the attacker's own authorization.
**Defended by**: Inclusion proof check still fires (the attestation must reference a clause in the signed agreement); validator gate still fires. The attestation event records the attester truthfully. The attacker is attesting against their own self-signed order — no third-party harm.
**Net assessment**: Not an exploit per se. The resolver path is intended to support Level-3 mechanism contracts; if a future mechanism uses an upgradeable resolver, the resolver becomes a critical trust boundary. **Recommendation**: When the first production caller adopts `attestViaResolver`, document the resolver as a trust-critical component on par with the validator (similar to DESIGN #13's atomic-binding discipline for validators).

#### D-2 — Approval-revocation DoS chained with sequencer reputation
**Blast radius**: Moderate (composition of C-2 with off-chain reputation)
**Composition**: C-2 mechanism + a hypothetical off-chain sequencer-reputation tracker.
**Vector**: Attacker repeatedly forces batches involving specific counterparties to revert, degrading the sequencer's perceived reliability OR degrading the counterparty's perceived reliability if the tracker doesn't distinguish "batch failed because attacker revoked" from "batch failed because legitimate party did something wrong."
**Defended by**: Same as C-2. Reputation systems must attribute revert-cause correctly.
**Net assessment**: Off-chain reputation-system design concern. The protocol exposes the building blocks (per-participant approval state, per-batch revert events); reputation systems should attribute correctly.

#### D-3 — Unbounded GHG grams + downstream display overflow
**Blast radius**: Moderate (extends INFO-8)
**Composition**: `FigaroGHGMeasurementV1Validator` (accepts `type(uint256).max`) + downstream summation in frontend/indexer.
**Vector**: Attacker (a process participant per DESIGN #2) submits an attestation with `grams = type(uint256).max`. A frontend view summing grams across attestations overflows or displays nonsensically. A user making a compliance/procurement decision sees corrupted aggregates.
**Defended by**: On-chain: nothing (validator is intentionally syntactic per Category-1 design). Off-chain: INFO-8 recommends frontend/indexer apply semantic bounds.
**Net assessment**: Not a kernel vulnerability. Recommend `/help` document that GHG attestations are self-attested and that aggregate displays should bound input values. Add client-side bounds-checking in frontend GHG summation hooks (a small SDK utility could centralize this).

#### D-4 — M-1 front-running for high-stakes schemas (regulatory capture)
**Blast radius**: Severe (for compliance/regulatory schemas)
**Composition**: `AttestationCoordinator.setValidator` (M-1) + a high-stakes third-party schema registered post-deploy.
**Vector**: A regulated entity registers `figaro-compliance-v1` (or similar). Attacker monitors `SchemaRegistered` events and binds a malicious validator (one returning the correct `schemaId()` from self-attestation but containing adversarial `validate()` logic) before the legitimate operator binds theirs. The schemaId is permanently captured. The attacker can selectively reject or accept attestations, breaking regulatory trust for any party using that schema.
**Defended by**: Doc-only mitigation (DESIGN_DECISIONS #13 + CLAUDE.md "Third-party schema deployment" subsection + copilot-instructions.md mirror, all landed 2026-04-26). Bootstrap surface is safe (atomic register+bind in `script/Deploy.s.sol:181-219`).
**Net assessment**: **The composition consequence raises the case for the optional `registerSchemaAndValidator` convenience method**. For low-stakes schemas, doc-only is sufficient. For high-stakes schemas (compliance, jurisdictional reporting, regulated standards), the deployment-discipline mitigation depends entirely on the schema author's competence; one careless deploy script captures the schema permanently.

**Recommendation**: Promote the queued `registerSchemaAndValidator` convenience method (currently in `project_backlog_2026-04-22.md`) from "optional" to "recommended before any high-stakes schema is registered post-deploy." Concretely: implement before the first non-figaro-* schema lands, regardless of the OperatorRegistry-strip schedule.

**Status (2026-04-26 follow-up)**: **LANDED** as `src/SchemaRegistrationHelper.sol` — a stateless, no-admin composer that bundles the two writes atomically. Helper-contract design preserves the kernel-discipline principle of keeping `SchemaRegistry` and `AttestationCoordinator` as independently-addressable primitives. Schema authors who use the helper get atomic-bind; those who choose the two-call path retain registrar-identity (their address as `SchemaRegistered.registrar` instead of the helper's address) at the cost of the front-running window. Trade-off documented in DESIGN_DECISIONS.md #13.

#### D-5 — FIG token cap composition (closed)
**Blast radius**: Minor
**Composition**: FigToken minter registration + supply cap.
**Vector**: Pre-INFO-1-fix, an attacker (or careless deployer) could register multiple minters whose combined caps exceeded MAX_SUPPLY.
**Defended by**: INFO-1 fix landed (`totalRegisteredCap` sum-enforcement at `src/fig/FigToken.sol:51`); Certora `totalRegisteredCapWithinMaxSupply` rule.
**Net assessment**: Closed. Composition chain shown for completeness.

#### D-6 — OperatorRegistry deactivation as discovery-layer griefing
**Blast radius**: Minor
**Composition**: `OperatorRegistry.deactivate` + indexer's `getActiveOperators` filter + assembly hardcoded operator routing.
**Vector**: An operator deactivates strategically; indexers filter them out; some assemblies hardcode the operator's address and continue routing requests; users see inconsistent availability across assemblies.
**Defended by**: On-chain: deactivation is the operator's choice and is reversible. Off-chain: assemblies and indexers must agree on filter semantics.
**Net assessment**: Behavioral / UX-layer concern. Connects to the queued OperatorRegistry web2-strip — once `_active` is removed, this attack surface disappears entirely. Worth noting as additional motivation for the strip when it's prioritized.

#### D-7 — DutchAuction win without commit (off-chain expectation mismatch)
**Blast radius**: Minor
**Composition**: `DutchAuction.claim` (no funds held, DESIGN #9) + `FigaroCore.commit` (independent) + off-chain reputation expectation.
**Vector**: Attacker wins a low-clearing-price auction by claiming it themselves, then never commits to FigaroCore. Buyer's expected driver doesn't materialize.
**Defended by**: DutchAuction holds no funds; no financial loss. Buyer can route to a different driver.
**Net assessment**: Coordination-layer concern. Recommend any off-chain reputation system tracking "auction wins" require an on-chain `OrderCommitted` event linked to the same driver address; auction wins alone are signal, not commitment.

#### D-8 — Validator view-function statefulness risk
**Blast radius**: Moderate (latent for third-party validators)
**Composition**: `ISchemaValidator` interface (declares `view`, not `pure`) + AC's STATICCALL dispatch.
**Vector**: A third-party validator implements `validate` as `external view` (matching the interface) but reads external state (e.g., `FigaroCore.processes[processId]`). Two attestations with the same `(schemaId, content, sectionData)` validate at time T1 (state X) and revert at T2 (state Y). The same logical attestation is non-deterministic depending on chain state at the moment of the call.
**Defended by**: STATICCALL prevents writes (INFO-7 already documents this). All 10 production validators are pure with no external reads.
**Net assessment**: Latent risk for third-party validators. Currently not exploitable (no stateful validators deployed). **Recommendation**: Strengthen the `ISchemaValidator` interface NatSpec from "must be pure/view" to "must be pure (no external state reads); a stateful validator is non-deterministic and breaks attestation reproducibility." Mirror in CLAUDE.md "Adding a new schema" checklist. Optionally: change the interface declaration from `view` to `pure` — breaking change for any in-flight third-party validator, but eliminates the surface entirely.

---

## Cross-cutting observations

### Where trust boundaries shift between layers

The adversarial pass surfaces a consistent pattern: **the kernel is correctly sealed; risk migrates to the boundary layers as the protocol's surface widens.** Concretely:

- **Kernel boundary** (FigaroCore): closed. Bond math, signature requirements, atomic resolution, monotonic state — all formally verified.
- **Protocol-extension boundary** (AttestationCoordinator + validators + SchemaRegistry): closed by design, with two known seams that depend on deployment discipline:
  - Validator binding (M-1 / D-4 / DESIGN #13) — atomicity is the deployer's job.
  - Validator purity (INFO-7 / D-8) — convention, enforced by STATICCALL but not by interface.
- **Runtime boundary** (FigaroBatchVerifier + sequencer): liveness-trusted by SEQUENCER_TRUST_MODEL. Approval-revocation timing (C-2 / D-2) is the operational responsibility most often missed by integrators.
- **Discovery boundary** (OperatorRegistry + indexers + frontends): advisory only. Behavioral exploitation is possible (D-6) but produces no protocol-level harm; this is the least load-bearing surface.

### Adversarial pass strengthens the case for two queued items

1. **`registerSchemaAndValidator` convenience method** (currently queued under "🧰 Open" in backlog). D-4 shows the M-1 risk has higher blast radius for high-stakes schemas. Doc-only mitigation is sufficient for the bootstrap surface but creates ongoing operational risk as the protocol attracts third-party schemas. **Recommendation**: implement before the first high-stakes third-party schema is announced.
2. **`OperatorRegistry` web2-strip** (currently queued under "🧼 Open"). D-6 (deactivation griefing) is one of several composition concerns that disappear once the lifecycle flag is removed. Confirms the strip's value beyond pure web2/web3 hygiene.

### One adversarial pass-only recommendation

**Tighten validator purity discipline** (D-8): change `ISchemaValidator` interface NatSpec from "must be pure/view" to "must be pure (no external state reads)"; mirror in CLAUDE.md schema checklist; optionally change interface declaration from `view` to `pure`. This is small, low-risk, and forecloses a latent class of non-determinism bugs in third-party validators.

---

## Summary table

| # | Vector | Blast radius | Status | Action |
|---|---|---|---|---|
| A-1 | Stage-lying in attestation event | Minor | Not a vulnerability (intentional separation) | Document in `/help` |
| A-2 | Validator `schemaId()` non-determinism | Severe (theoretical) | Blocked by STATICCALL + immutable bytecode | None |
| A-3 | Leaf/node hash conflation | Catastrophic (theoretical) | Requires keccak collision | None |
| A-4 | Commerce gas-griefing | Minor | Self-griefing only | None |
| A-5 | Geo UTF-8 bypass | Minor | Defense holds | None |
| A-6 | Proximity zero-byte sig | Minor | Syntactic gate only; downstream verifies | Document |
| A-7 | Cross-section proof reuse | Moderate (theoretical) | Correct by design (identical agreements) | None |
| A-8 | Attestation spam | Minor | Indexer-discipline | Indexer dedup |
| B-1 | Weakest-link sub-tree griefing | Moderate | Bilateral signature is the gate | Off-chain reputation |
| B-2 | Sequential renegotiation lock-in | Moderate | Buyer dominance + composition | Pre-commitment discipline |
| B-3 | False cumulative value | Catastrophic (theoretical) | Cryptographically blocked | None (Certora-verified) |
| B-4 | Selective order omission | Severe (theoretical) | Kernel-enforced | None |
| B-5 | Resolved-process re-opening spam | Minor | Bilateral signature; UX friction only | Wallet-level filter |
| B-6 | Cumulative overflow | Catastrophic (theoretical) | Triple-defended | None (Halmos-verified) |
| C-1 | Unbounded event/position arrays | Moderate (liveness) | Sequencer self-policing per DESIGN #10 | Document in SEQUENCER_TRUST_MODEL |
| C-2 | Selective approval revocation DoS | Moderate (extends INFO-3) | Sequencer operational layer | Augment SEQUENCER_TRUST_MODEL |
| C-3 | Cross-chain proof replay | Severe (theoretical) | Blocked by chainId+contract checks | None |
| C-4 | Migration genesis-root foot-gun | Minor | INFO-9 already documented | Optional zero-check |
| C-5 | Sequencer MEV via ordering | Minor (designed) | Documented in SEQUENCER_TRUST_MODEL | None |
| C-6 | Re-emitted events ambiguity | Minor (indexer) | Documented warnings + CLAUDE.md | SDK boilerplate |
| D-1 | Malicious resolver self-auth | Moderate (latent) | No current caller | Document when adopted |
| D-2 | Approval revoke + reputation chain | Moderate | Off-chain reputation-system concern | Attribution discipline |
| D-3 | GHG grams + display overflow | Moderate (extends INFO-8) | Frontend/indexer concern | Client-side bounds check |
| D-4 | M-1 + high-stakes schema capture | **Severe (case strengthened)** | Doc-only mitigation in place | **Implement `registerSchemaAndValidator`** |
| D-5 | FIG cap composition | Minor (closed) | INFO-1 fix landed | None |
| D-6 | Operator deactivation griefing | Minor | Discovery-layer; obviated by web2-strip | Strengthen case for queued strip |
| D-7 | DutchAuction win without commit | Minor | Coordination-layer | Reputation-system attribution |
| D-8 | Validator view-function statefulness | **Moderate (latent)** | INFO-7 covers; not yet exploitable | **Tighten interface to "must be pure"** |

---

## Net assessment

**Zero new actionable findings against the kernel itself.** FigaroCore and the surrounding contracts withstand adversarial scrutiny — the formal verification suite (Certora 27 rules, Halmos 11 properties, TLA+ 15 invariants, Echidna 7 properties) is correctly sealing the bond-math and coordination invariants the adversarial probe attempted to break.

**Two protocol-extension recommendations strengthened by adversarial reasoning:**
1. Implement `registerSchemaAndValidator` (currently queued in backlog) before the first high-stakes third-party schema is announced. The M-1 / D-4 capture risk is acceptable for the bootstrap surface and for low-stakes schemas; for compliance/regulatory schemas it is a permanent capture risk that doc-only mitigation cannot fully close.
2. Tighten `ISchemaValidator` purity discipline from "must be pure/view" to "must be pure" (NatSpec + CLAUDE.md schema checklist). Optionally change the interface from `view` to `pure`. Forecloses the D-8 non-determinism class for third-party validators.

**Operational-layer documentation augmentation recommended:**
- `SEQUENCER_TRUST_MODEL.md`: add concrete "selective adversarial approval revocation" scenario (C-2 / D-2) alongside the existing accidental-revocation note.
- `/help` schema interpretation: document that attestation `stage` is attestation-time, not commitment-time (A-1); proximity attestations are syntactic gates, not signature-verified (A-6); GHG aggregates are self-attested and require client-side bounds-checking (D-3).
- SDK / indexer boilerplate: explicit contract-address filtering for re-emitted events (C-6).

**No critical, no high (true) — composition risks bounded by the protocol's design at every layer except where deployment discipline or sequencer operations take over, which is exactly where the protocol's documentation already locates them.**
