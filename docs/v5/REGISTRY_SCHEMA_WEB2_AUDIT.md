# Registry & Schema Web2/Web3 Audit

**Audit date:** 2026-04-26
**Scope:** Every registry-shaped contract and schema-shaped surface in the protocol — `SchemaRegistry`, `OperatorRegistry`, `AttestationCoordinator.schemaValidator` mapping, the `ISchemaValidator` pattern, the deploy-script bootstrap, and the frontend ship-list / block-registry surfaces. Concern raised by user: "we have managed to move off-chain all of the web2 thinking for FigaroCore, but I suspect web2 has crept back in through the registries and schemas."

**Bottom line:** The on-chain protocol surface is mostly clean. The web2 patterns that have crept in are **convention-layer, not protocol-layer** — they don't break Nash equilibrium, no admin can rug them, and forks can replace them. The risk is subtler: if downstream consumers treat the frontend ship-list as the canonical "valid schemas" source, the convention layer becomes a de facto gatekeeper that recreates the centralized-arbiter problem the protocol was designed to escape. One contract — `OperatorRegistry` — has on-chain state shape that smells web2-y but doesn't enforce anything kernel-level (it's advisory metadata).

---

## The frame: two different things called "web2"

Conflating these is what causes confusion:

**Protocol-layer web2** = on-chain admin / owner / pause / mutable bindings under a single party / lifecycle gates / discretionary timeouts. **These break Nash equilibrium** — they create exit paths that degrade MAD, give one party privileged status the others cannot match, or introduce trusted parties the protocol claims to eliminate.

**Convention-layer web2** = curated lists / "official" catalogs / PR pipelines / ship-lists maintained by a single team / docs-page checklists. **These don't break the protocol** — anyone can deploy, register, and use without ever appearing in Figaro the org's lists. But they CAN become de facto gatekeeping if downstream consumers (integrators, regulators, other frontends) treat them as authoritative sources of truth. The risk is sociotechnical, not cryptographic.

The protocol must defend the first absolutely. The second is a discipline question — make the curation EXPLICITLY a convention, not an enforcement, and design the surfaces so forks find it natural to curate their own.

---

## Per-surface audit

### `src/SchemaRegistry.sol` — 🟢 CLEAN

Permissionless event-only schema anchoring. No owner, no admin, no pause. The contract's docstring explicitly notes V3's Ownable + activate/deactivate state machine + getters were REMOVED in V5 (lines 24–27). All that survives:
- `mapping(bytes32 => bool) registered` (dedup guard)
- `registerSchema(bytes32 schemaId, uint64 version, bytes32 uriHash) external` — anyone can call. First-write succeeds, replays revert. No party privileged.
- `setMechanismSchema(bytes32 schemaId) external` — any contract can self-declare which schema it uses.
- Two events. That's the entire contract.

The dedup guard is the only on-chain state. Schema metadata (version, uriHash) lives in the `SchemaRegistered` event, not in storage. Indexers reconstruct.

**"Once registered, a schema cannot be removed or deactivated. Schema governance is a convention-layer concern, not enforcement."** — the contract's own docstring states the discipline.

About as web3-pure as a registry can be.

### `src/AttestationCoordinator.sol` schemaValidator binding — 🟢 CLEAN

The `setValidator(schemaId, validator)` function (line 117–124):
- External, no auth gate — anyone can call.
- First-write-wins: rebind reverts (`ValidatorAlreadySet`).
- Validator self-attests its `schemaId()` via the `ISchemaValidator` interface; mismatch reverts (`InvalidValidatorBinding`).
- "preserves the no-admin invariant and prevents validator-swap rug-pulls" — explicit in the docstring.

The COST of first-write-wins: if the deployed validator is buggy, the schemaId is permanently bound. New validator must register under a new schemaId. This cost is the price of immutability — it's the right tradeoff for protocol surface.

### `src/ISchemaValidator.sol` + concrete validators — 🟢 CLEAN

Interface contract:
- `validate(...) external view` — pure read path, reverts on invalid.
- `schemaId() external view returns (bytes32)` — binding self-attestation.
- "Validators MUST be pure/view. No storage writes. No external calls."

Representative concrete (`FigaroHandoffV1Validator.sol`):
- `pure` function (no state read).
- `bytes32 public constant override schemaId = keccak256("figaro-handoff-v1")` — immutable, no constructor arg, no admin set.
- No constructor body. No mutable state. No upgrade path. No fees.

This pattern repeated 10 times across `src/schemaValidators/`. Clean by construction.

### `src/OperatorRegistry.sol` — 🟢 CLEAN as of 2026-04-26 (web2-strip shipped)

Recommendation 2 from the prior audit was implemented. The contract now
mirrors SchemaRegistry's shape: per-operator on-chain state collapsed to a
single dedup guard plus the registration timestamp that backs the lock.

**Current state surface:**
```solidity
mapping(address => bool)    internal _registered;
mapping(address => uint256) internal _registeredAt;
```

**External functions:** `register(role, metadataURI) payable` + `withdraw()`.
**Events:** `OperatorRegistered(operator, role, metadataURI)` +
`OperatorWithdrawn(operator, deposit)`.

**Removed (web2-strip 2026-04-26):**
- `_role` mapping → role is event-only data (in `OperatorRegistered`).
- `_active` mapping → operator availability is signal-by-availability
  off-chain, not registry state.
- `updateProfile(role, metadataURI)` → switching role/metadata happens via
  withdraw + re-register. The dedup guard clears on withdraw, so the same
  address can re-register with new values; the lock period restarts on
  each fresh registration, preserving the Sybil cost on every role
  reassertion.
- `deactivate()` / `reactivate()` → removed as web2 lifecycle CRUD.
- `OperatorUpdated` / `OperatorDeactivated` / `OperatorReactivated` events
  → removed alongside their emitters.
- Errors `NotActive`, `AlreadyDeactivated`, `AlreadyActive`, `StillActive`
  → removed.

**Kernel-discipline check:** the contract was the only on-chain surface
holding mutable per-user lifecycle state. The strip restores symmetry with
SchemaRegistry (event-sourced metadata, dedup guard only on-chain). The
kernel itself never read this state — there was no `gateOn(operator_active)`
anywhere in FigaroCore — so the strip is a contract-and-prover refactor,
not a kernel change.

**`OperatorRole` enum** — kept as a parameter on `register` (and as a typed
field in the `OperatorRegistered` event) for indexer convenience. Recommendation
4 from the prior audit (drop the enum entirely; move to `metadataURI` body)
was deferred — the enum is event-only data with no on-chain enforcement
beyond rejecting `OperatorRole.None`, which is a cheap shape check rather
than a curation gate. If the {Merchant, Driver, Both} taxonomy proves
limiting, the enum can be widened or removed without breaking the dedup /
lock model.

**Deposit lock period** — unchanged and still the correct Sybil-resistance
mechanism. The lock makes "1 ETH = N identities over time" expensive in
TIME as well as capital. Lock duration is a deploy-time choice (`365 days`
on devnet); rationale: long enough that recycling deposits across identities
is uneconomic relative to honest participation, short enough that exit is
practical. Worth recording in deployment notes once mainnet duration is set.

**Prover coordination (2026-04-26):** the strip is a coordinated contract +
SP1 prover release. `prover/lib/src/types.rs` lost three `KernelOp` variants
(`UpdateOperator`, `DeactivateOperator`, `ReactivateOperator`); two state
fields (`operator_roles`, `operator_active`) collapsed to one
(`operators_registered`); the public-values format changed (genesis state
root flipped from `0x10fc52ca…` to `0xb34b2328…`), which breaks any
pre-existing batch proofs. Devnet only, no mainnet impact. Frontend2 mirrors
the strip: `useOperatorRegistry` exposes only `useRegisterOperator` +
`useWithdrawDeposit` + read-only hooks; the indexer reconstructs operator
state from `OperatorRegistered` minus `OperatorWithdrawn`; the
`OperatorOnboarding` UI shows a registration form when not registered and
a profile + withdraw panel when registered.

### `src/FigaroBatchVerifier.sol` — 🟢 CLEAN

ZK-proven batched protocol operations:
- "no owner, no fee, no upgrade path. If the program changes, deploy a new verifier."
- Authority comes from the SP1 proof, not the verifier owner.
- Anyone can submit a proof; the verifier checks it against the immutable `programVKey`.
- Re-emits protocol-compatible events (Attestation, SchemaRegistered, etc.) — this can look like an admin pattern ("settling on behalf of users") but the underlying authority is purely cryptographic.

The `WARNING: Batch events use the same topic hashes as direct-path events. Indexers MUST filter by contract address` is a topic-hash-collision concern (M-3 audit finding), not a centralization concern.

### `script/Deploy.s.sol` bootstrap — 🟢 CLEAN, with caveat

Deploys the protocol surface and registers 11 schemas + binds 10 validators at deploy time:
```solidity
schemas.registerSchema(keccak256("figaro-topology-v1"), 1, keccak256("ipfs://figaro-topology/v1"));
schemas.registerSchema(keccak256("figaro-handoff-v1"), 1, keccak256("ipfs://figaro-handoff/v1"));
// ... etc.
attestation.setValidator(keccak256("figaro-handoff-v1"), address(new FigaroHandoffV1Validator()));
// ... etc.
```

This is BOOTSTRAP, not curation:
- Anyone can register additional schemas after deploy (`SchemaRegistry.registerSchema` is permissionless).
- Anyone can bind validators to schemaIds the deploy script didn't claim (`AttestationCoordinator.setValidator` is permissionless).
- The first-write-wins binding means Figaro the org captured the binding for "figaro-*" schemaIds. A third party who wants their own handoff schema deploys it as `uber-handoff-v1` with their own validator. The protocol allows any schemaId namespace.

**Caveat — sociotechnical risk via naming prestige.** The "figaro-" prefix is purely convention; the protocol doesn't enforce it. But if the ecosystem treats "figaro-*" as authoritative, the convention becomes a chokepoint. New schemas under other namespaces face uphill adoption. This isn't a contract problem — it's a docs / framing / community-design problem. Worth being explicit on the `/schemas` page that "figaro-*" is one author's namespace, not THE namespace.

### Frontend `/schemas` page (ship-list) — 🟡 CONVENTION-LAYER WEB2

The page lists "Eleven reference schemas" and presents step 8 of the "Adding your own" checklist as: **"List your schema on the builders page 'Schema validators in force' section."**

This is a centralized PR pipeline. To be "official" you file a PR against Figaro's repo to add yourself to the list. That IS a curation gate, sitting at the docs/UI layer.

**Why this doesn't break the protocol:**
- A schema that ships a JSON spec, an SDK encoder, a validator, and gets registered on-chain works identically whether or not it appears on the `/schemas` page.
- An indexer reading SchemaRegistry events sees every registered schema, "official" or not.
- Forks of the frontend get to curate their own ship-list.

**Why it's still worth examining:**
- New entrants reading `/schemas` see "eleven reference schemas, here's how to add yours: file a PR with us." That subtly suggests Figaro the org is the curator of "valid Figaro schemas." Repeated across enough surfaces, this becomes the centralized-arbiter the protocol was designed to escape — at the docs layer rather than the protocol layer.
- The page's tone is good ("Standards bodies. Domain methodologists. Legal-form publishers." → "anchor it as a Figaro schema"), but step 8 quietly reintroduces the gate.

**Recommendation:**
1. **Reframe step 8.** Replace "List your schema on the builders page" with: "Optional — submit a PR to add your schema to the figaro-protocol/Figaro-Prototype2 reference catalogue. Your schema is fully valid and usable without this step; the catalogue is one author's curated reference, not a protocol-level requirement." Make explicit that the page is a reference, not a registration.
2. **Surface third-party schemas.** Add a section showing schemas registered on-chain that are NOT in Figaro's ship-list — a "Recently registered (third-party)" feed sourced directly from `SchemaRegistered` events. This makes the permissionless reality visible in the UI.
3. **De-prefix the canonical examples in copy.** Where the page currently says "ten first-party schemas ship today: topology, handoff, commerce..." consider rewording to emphasize they're examples, not ground truth. The "first-party" framing is the most loaded — it implies a second-party, a hierarchy.

### Frontend `blockMetadata.ts` (designer block registry) — 🟡 CONVENTION-LAYER

In-memory singleton block registry, populated by `registerAllModules()`. The designer palette renders only blocks in this registry. Forks of the frontend curate their own.

Same pattern as the schema ship-list, same verdict: doesn't break the protocol, but shapes adoption. Less load-bearing because it's clearly a frontend tool (palette = display surface), and because the path "you can build your own designer that consumes a different block set" is structurally obvious.

Worth a sentence in the developer docs: "The designer's block palette is one frontend's curated UX. The protocol's composition surface is the on-chain registries; the designer is one way to express assemblies, not THE way."

### `frontend2/lib/shared/schemaSpecSource.ts` preload — 🟢 CLEAN (frontend caching)

Module-level preload of the JSON spec files (currently topology + handoff; the others are present but not pre-loaded). This is purely a caching choice — the spec files exist, can be loaded async, and are cache-hit on subsequent reads. No curation.

### The `categories` field shipped 2026-04-26 — 🟢 CLEAN

Open taxonomy in JSON specs. Anyone can extend. Doesn't gate or curate. The choice to keep it off-chain (per user direction same day) was the right call — putting it on-chain would have created a closed-vs-open-taxonomy governance question that's avoided entirely by leaving it as a JSON convention.

### `MechanismAssembly.enabled` / `MechanismAssembly.visibility` — 🟢 CLEAN (reviewed 2026-04-26)

Initial review flagged these as "soft curation in assembly metadata" alongside the OperatorRegistry strip. On closer inspection both are authoring-time fields on the assembly *spec* — the assembly author declares "this mechanism is enabled in this assembly" and "this role is primary / secondary / hidden in this UI" when they author the assembly JSON. There is no mutable on-chain state behind them; the runtime reads the JSON to compute what to instantiate (`deriveAssemblyModel.ts`) and what to render (`deriveRoleContextsFromAssembly.ts`, `RoleSwitcherModule.tsx`).

This is structurally different from the OperatorRegistry `_active` flag that was stripped:
- OperatorRegistry `_active` was mutable on-chain state on permissionless self-registered identity. The strip removed lifecycle CRUD on a stateless registry.
- MechanismAssembly `enabled` / `visibility` are immutable fields baked into the published assembly spec. Different assembly = different spec = different fields. There's no `setEnabled()` / `setVisibility()` mutator anywhere.

Verdict: not web2 lifecycle CRUD. Authoring-time configuration on a content-addressed document, same category as a JSON config field. No strip needed.

### `CatalogueItem.available` — 🟢 CLEAN (reviewed 2026-04-26)

Same shape: a field on the merchant's IPFS-pinned catalogue document. Merchant publishes a fresh catalogue when they want to mark items unavailable; the field lives in their own JSON document. No on-chain state, no contract surface, no lifecycle CRUD. No strip needed.

---

## Summary verdict per surface

| Surface | Web2 patterns? | Verdict |
|---|---|---|
| `SchemaRegistry.sol` | None — explicitly stripped from V3 | 🟢 |
| `AttestationCoordinator.schemaValidator` mapping | None — first-write-wins, no admin | 🟢 |
| `ISchemaValidator` + concrete validators | None — pure functions, no state | 🟢 |
| `OperatorRegistry.sol` | Soft — on-chain user-state shape, deployer-chosen lock duration | 🟡 advisory |
| `FigaroBatchVerifier.sol` | None — ZK-proven, no upgrade | 🟢 |
| Deploy script bootstrap | None — bootstrap, not curation | 🟢 |
| Frontend `/schemas` page | Yes — "list your schema with us" PR pipeline | 🟡 convention |
| Frontend `blockMetadata` | Yes — frontend curates its block palette | 🟡 convention |
| `categories` field (off-chain JSON) | None — open taxonomy | 🟢 |

---

## Action items

### Priority 1 — protocol-layer hygiene (low effort, high clarity)

1. **OperatorRegistry docstring update.** Add a prominent "FigaroCore does not gate any operation on operator state; this registry is advisory metadata for off-chain discovery surfaces" note. One paragraph in the contract header. No code change.
2. **OperatorRegistry lock-duration justification.** Document what Sybil attack the lock defends against and what changes if it's zero. Either in the contract docstring or in `docs/v5/DESIGN_DECISIONS.md` (which already catalogs 11 patterns that look like vulnerabilities but are correct by design — this would be #12).

### Priority 2 — convention-layer hygiene (small effort, defends against centralization-via-prestige)

3. **`/schemas` page — reframe step 8.** "Optional — submit a PR to add your schema to the reference catalogue. Your schema is fully valid and usable without this step." Removes the implicit gate.
4. **`/schemas` page — surface third-party schemas.** Live feed of `SchemaRegistered` events from chain, not just the curated 11.
5. **Drop the "first-party" framing.** Replace with "reference examples" or "Figaro-authored examples." Removes the hierarchy implication.
6. **Developer docs note on `blockMetadata`.** "The designer's block palette is one frontend's curated UX. The protocol's composition surface is the on-chain registries."

### Priority 3 — structural cleanup (medium effort, fully optional)

7. **OperatorRegistry restructure.** Move `_role` and `_active` to event-only (mirror SchemaRegistry pattern). Keep deposit-lock state on-chain (load-bearing for ETH custody). This is a breaking change to the contract — defer until OperatorRegistry has more concrete usage to motivate the work, OR fold into a future audit pass.
8. **Drop the `OperatorRole` enum.** Move role to `metadataURI` body. Removes the protocol-level fixed taxonomy. Same breaking-change tradeoff as item 7.

---

## The deeper point

The user's intuition — "we may have reintroduced web2 through the registries and schemas" — is the right reflex. The risk surface is real, but it has shifted: in V3 the contracts themselves carried web2 (Ownable, activate/deactivate). V5 has cleanly stripped that. The web2 patterns now live one layer up: in the deploy script's choice of which schemas to bootstrap, in the frontend's ship-list, in the docs' "list your schema with us" checklist.

These convention-layer patterns don't break the protocol. They CAN, however, become a centralized-arbiter pattern via sociotechnical drift — if every integrator treats the Figaro-org ship-list as canonical, the convention becomes a gatekeeper as effective as an on-chain admin would have been.

The defense isn't "remove the curation." Some curation is useful — reference examples accelerate adoption. The defense is to make EXPLICIT that the curation is a convention, not an enforcement, and to surface third-party participation visibly so the permissionless reality stays in front of every user.

The protocol's job is to be permissionless. The org's job is to make sure no one mistakes Figaro the org's curated catalogue for the protocol's authoritative truth.
