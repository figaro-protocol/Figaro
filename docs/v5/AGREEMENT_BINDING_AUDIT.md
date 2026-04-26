# Agreement-Binding Migration Audit

**Audit date:** 2026-04-26
**Scope:** Phases 1–6 of the agreement-binding rework (2026-04-23). Verifies that the migration from `agreementHash = keccak256(canonicalJSON(Agreement))` to `agreementHash = merkleRoot(sectionLeaves)` was implemented correctly across all five surfaces: Solidity, SDK, frontend, frontend2, Certora.

**Verdict summary:**

| # | Question | Verdict | Notes |
|---|---|---|---|
| 1 | Leaf canonicalization across 5 surfaces | 🟢 | Single source of truth via `getSectionDataBytes` |
| 2 | OZ sorted-pair hashing mirrors | 🟢 | Promote-on-odd convention, internally consistent |
| 3 | Single-section edge case | 🟢 | Explicitly tested |
| 4 | Duplicate schemaId behavior | 🟡 | Frontend rejects; SDK has no equivalent guard |
| 5 | Category-2 byte-equality | 🟢 | Single SDK encoder source-of-truth |
| 6 | Old-format coexistence | 🟢 | Clean cutover |
| 7 | Latent old-shape attest call sites | 🟢 | One yellow doc-rot finding |

---

## 1. Leaf canonicalization — 🟢 GREEN

**Question:** Is `keccak256(abi.encodePacked(schemaId, keccak256(sectionData)))` byte-identical across Solidity AC, SDK, frontend × 2, and the Certora summary?

**Findings:**

| Surface | File:line | Implementation |
|---|---|---|
| Solidity AC | `src/AttestationCoordinator.sol:224` | `keccak256(abi.encodePacked(schemaId, keccak256(sectionData)))` |
| Solidity test helper | `test/helpers/AgreementTestHelper.sol:17` | byte-identical to AC |
| SDK | `sdk/src/agreement.ts:135-136` | `keccak256(concat([schemaIdOf(schema), keccak256(getSectionDataBytes(section))]))` |
| frontend2 | `frontend2/lib/core/agreementManifest.ts:312-318` | byte-identical to SDK (via `require("viem")`) |
| frontend | `frontend/lib/core/agreementManifest.ts:312-318` | empty `diff` vs frontend2 — true twin |
| Certora | `certora/AttestationCoordinator.spec` | `validate` summarized as `NONDET`; leaf computation not symbolically reconstructed (acceptable — CVL cannot reason about hash collisions regardless) |

**`schemaIdOf` consistency:**
- SDK `sdk/src/agreement.ts:81-83`: `keccak256(toHex(new TextEncoder().encode(schemaKey)))`
- frontend2 `:217-223`: byte-identical (UTF-8 → keccak256)
- frontend: empty diff vs frontend2
- Solidity equivalent: `keccak256("schema-name")` literal — UTF-8 of an ASCII schema name is byte-identical to the ASCII bytes, both keccak'd produce the same `bytes32`. ✓

**`viem.concat` vs `abi.encodePacked` for fixed-size types:**
- `abi.encodePacked(bytes32, bytes32)` produces 64 bytes of direct concatenation (no length prefix, no padding).
- viem's `concat([0x...64chars, 0x...64chars])` produces the same 64-byte output.
- Equivalent for fixed-size `bytes32` operands. ✓

**Critical architectural finding — runtime `sectionData` alignment:**

The byte-equality between off-chain root computation and on-chain leaf reconstruction depends on the same `sectionData` bytes being produced at agreement-construction time AND at runtime-attest time. Verified at `frontend2/lib/mechanisms/useAttestationCoordinatorActions.ts:110`:

```ts
const sectionData = getSectionDataBytes(section);
```

This is the same function used inside `computeSectionLeaf`. Byte-equality is guaranteed by construction.

---

## 2. OZ sorted-pair hashing mirrors — 🟢 GREEN

**Question:** Does the SDK + frontend `hashPair` match OZ's commutative `keccak256(min(a,b) || max(a,b))` across all branch shapes?

**Findings:**

`hashPair` implementation (frontend2 `:324-332`, SDK `:140-144`, frontend = twin):
```ts
function hashPair(a, b) {
    return a.toLowerCase() < b.toLowerCase()
        ? keccak256(concat([a, b]))
        : keccak256(concat([b, a]));
}
```

- JS string `<` on equal-length, lowercase, hex-prefixed strings is byte-comparable to OZ's `bytes32 a < bytes32 b` (character codes for `0-9` and `a-f` ascend with byte values).
- `.toLowerCase()` is defensive — viem already returns lowercase.

**Tree construction (frontend2 `:338-354`, SDK twin):**
- Empty leaves → `bytes32(0)` (zero hash)
- Single leaf → returned as the root (no hashing)
- Even count → standard pairwise hashing
- **Odd count → unpaired leaf promoted unchanged** (OpenZeppelin "MerkleTree" convention, NOT Bitcoin-style duplication)

**Proof generation (frontend2 `:406-426`, SDK twin):**
- `siblingIdx < layer.length` guard ensures the "promoted odd" leaf adds NO sibling to the proof at that layer.
- The number of proof entries equals the actual number of pair-hashings the leaf traversed — compatible with OZ's `MerkleProof.verify`, which simply walks the proof.

**Why this works on-chain:** OZ's `MerkleProof.verify` doesn't enforce a specific construction strategy — it only walks the proof, hashing pairwise. Since our off-chain construction and proof-generation both apply the same promote-on-odd rule, the proof length matches the actual hashing path. Verification succeeds.

---

## 3. Single-section edge case — 🟢 GREEN

**Question:** Does a one-section agreement produce a root + empty proof that `MerkleProof.verify` accepts?

**Findings:**
- `buildMerkleRoot` short-circuits `length === 1` to return `layer[0]`. Root == leaf. ✓
- `buildSectionInclusionProof` produces an empty proof array (the `while (layer.length > 1)` loop never enters).
- On-chain `MerkleProof.verify(emptyProof, root, leaf)` returns `leaf == root`, which is `true`.

**Test coverage:**
- `sdk/tests/agreement.test.ts:69` — "single-section root equals the leaf"
- `sdk/tests/agreement.test.ts:89` — "single section: empty proof verifies"
- Frontend manifest tests cover the same.

---

## 4. Duplicate schemaId behavior — 🟡 YELLOW

**Question:** What happens if an agreement carries two sections with the same schemaId?

**Findings:**

| Layer | Behavior |
|---|---|
| Frontend `buildAgreement` (`agreementManifest.ts:495-516`) | **Rejects** with thrown error listing duplicates |
| Frontend `buildAgreement` (frontend twin) | Same — empty diff |
| SDK `agreement.ts` | **No `buildAgreement` analog** — consumers bring their own `Agreement`. No duplicate guard in `computeAgreementHash`, `computeSectionLeaf`, or `buildSectionInclusionProof`. |
| `getSectionById` / `buildSectionInclusionProof` | Use `Array.find()` — return the FIRST match. Second duplicate is unreachable. |
| Solidity AC | **Indifferent** — verifies leaf-in-tree only. Both leaves of a duplicate pair are in the merkle tree; either could be attested under given the matching proof. |

**Risk assessment:**

In normal frontend-mediated flows, the duplicate guard in `buildAgreement` prevents the issue at construction time. However:

- An external SDK consumer constructing an `Agreement` directly (without going through `buildAgreement`) gets no guard.
- If such an Agreement reaches signing, both duplicate leaves enter the signed merkle root.
- At runtime, only the first duplicate is reachable via `getSectionById` (frontend hooks default path).
- On-chain, both can land — the second's attestation would succeed if the caller manually constructs the proof for it.

**Recommendation:**

Add a duplicate guard to the SDK. Two options:

1. **Add `buildAgreement` to the SDK** with the same dedup logic, mirroring the frontend twin. Encourage all Agreement construction to flow through it.
2. **Add the guard inside `computeAgreementHash`** so any consumer attempting to compute a root over duplicate-schema sections gets a thrown error.

Option 2 is stricter (catches the issue regardless of how the Agreement was assembled). Recommend option 2 plus exporting a builder for ergonomics.

---

## 5. Category-2 byte-equality — 🟢 GREEN

**Question:** Do the 5 SDK encoders and the 5 frontend section builders produce byte-identical bytes for the same logical input across all enum/string normalizations?

**Findings:**

The frontend does NOT have its own Category-2 encoders. `frontend2/lib/core/agreementManifest.ts:240-288` (`getCategory2Encoder`) imports the SDK's encoders directly via `require("@figaro/core/schemas")`:

```ts
const { encodeHandoffContent, encodeGeoContent, encodeFulfilmentContent,
        encodeGHGContent, encodeCommerceContent } = schemasMod;
```

Single source of truth — no parallel implementation to drift. ✓

**Note (2026-04-26 post-audit)**: `encodeGHGContent` was renamed to
`encodeGHGScopeContent` as part of the GHG enum split (one validator per
accounting standard — `figaro-ghg-protocol-v1`, `figaro-ghg-iso-14064-v1`,
`figaro-ghg-pas-2050-v1`, `figaro-ghg-en-16258-v1`, `figaro-ghg-custom-v1`).
The dispatch in `getCategory2Encoder` now has 5 case-branches all routing to
the shared `encodeGHGScopeContent`. Single-source-of-truth property unchanged.

`getSectionDataBytes` (line 298-305) routes Category-2 through these encoders; Category-1 (lifecycle, proximity, restaurant, driver) falls through to canonical JSON.

The runtime hook (`useAttestationCoordinatorActions.ts:110`) calls `getSectionDataBytes` to construct the `sectionData` it passes to AC. Default content at line 136 / 164 is `content ?? sectionData` — for Category-2 byte-equality is satisfied by construction when content is omitted.

**Note on UI enum drift:** The cast `asAny(data.mode)` at frontend2:258 means upstream UI strings must already match SDK encoder enum values. The 2026-04-23 normalizers in `orderAgreement.ts` map known UI aliases (`meet-at-door` → `face-to-face`, `iso-14064-1` → `ISO-14064`, etc.). Unknown enums throw at the encoder boundary — by-design behavior.

---

## 6. Old-format agreement coexistence — 🟢 GREEN

**Question:** Are there any committed agreements (devnet snapshots, fixtures, test data) still using the pre-Phase-2 `keccak256(canonicalJSON(Agreement))` hash format?

**Findings:**

No production-code references to the legacy hash format:
- No `JSON.stringify(Agreement)` patterns in `sdk/src` or `lib/core` of either frontend tree.
- No `computeAgreementHashV1`, `legacyAgreementHash`, or similar fallback symbols.
- `canonicalizeAgreement` is preserved in the manifest but only used for serialization (localStorage, IPFS) — not for hashing.

Clean cutover. No migration code path or backwards-compatibility shim left behind.

---

## 7. Latent old-shape attest call sites — 🟢 GREEN (with one yellow doc-rot)

**Question:** Are there call sites still using the pre-Phase-4a 5-arg `attestAsBuyer(bytes32 contentRef, ...)` shape that would silently fail?

**Findings — write paths (all on new ABI):**

| File:line | Caller | Shape |
|---|---|---|
| `frontend2/lib/mechanisms/useAttestationCoordinatorActions.ts:135` | `submitSellerAttestation` | New 7-arg `attestAsSeller` |
| `frontend2/lib/mechanisms/useAttestationCoordinatorActions.ts:163` | `submitBuyerAttestation` | New 6-arg `attestAsBuyer` |
| `frontend/lib/mechanisms/useAttestationCoordinatorActions.ts:135,163` | Same — empty diff | Same |
| `sdk/src/agent/autonomous.ts:86-106` | `attestAsSeller` direct fn | New shape (9 params: walletClient, coordinator, role, target, schemaId, stage, sectionData, proof, content) |
| `sdk/src/agent/autonomous.ts:112-131` | `attestAsBuyer` direct fn | New shape (8 params) |

No third-party callers of `attest*` functions in production code outside these centralized paths.

Note: SDK `attestViaResolver` is missing from `autonomous.ts` (only seller + buyer covered). Not a regression — `attestViaResolver` is a Level-3 latent path with no production callers per CLAUDE.md, so its absence in the agent SDK is consistent with current scope. Document in a future SDK extension if a Level-3 mechanism adopts the resolver path.

**Findings — read paths:**

`useGHGDisclosure.ts` and `deliveryCoordinatorEvents.ts` both reference `contentRef`, but only when reading the Attestation event. Post-Phase-4a, the AC emits `contentRef = keccak256(content)` (a verifiable digest). Indexers compare `keccak256(fetchedContent)` against the event's `contentRef`. This pattern is correct.

**Yellow finding — stale comments in delivery coordinator events:**

`frontend2/lib/mechanisms/deliveryCoordinatorEvents.ts:7,74` and `frontend/lib/mechanisms/deliveryCoordinatorEvents.ts:7,74` contain comments stating:

> "proof data (band, nonce, deviceSig) is off-chain in contentRef"

This is **stale**. Post-Phase-4a, proof data is in the on-chain `bytes content` payload (encoded via `encodeAbiParameters([uint8, bytes32, bytes], ...)`). `contentRef` is the keccak digest, not an off-chain pointer.

**Recommended fix:** update the comments to reflect that proof data is in the on-chain `content` bytes; `contentRef` is `keccak256(content)` for verification only.

---

## Action items

1. **🟡 SDK duplicate-schema guard** — add a guard in `computeAgreementHash` (and optionally a `buildAgreement` exported helper) to mirror the frontend's dedup. Defensive against external SDK consumers constructing `Agreement` objects directly.
2. **🟡 deliveryCoordinatorEvents doc rot** — update stale comments in both frontend trees to reflect the post-Phase-4a content-bytes model. Single-line edit per file.

Both items are low-effort. No implementation correctness issues found. The migration was implemented correctly across all five surfaces with single-source-of-truth discipline (SDK encoders consumed by frontend; same `getSectionDataBytes` used at root-construction time and runtime-attest time).

---

## Resolution (2026-04-26 same-session)

Both action items shipped:

1. **SDK dedup guard** — `sdk/src/agreement.ts:165-174`: `computeAgreementHash` now scans for duplicate schema keys before computing leaves and throws with a list of duplicates. Regression test added at `sdk/tests/agreement.test.ts` (`computeAgreementHash > rejects agreements with duplicate schema keys`). SDK now 256/256 passing (was 255).
2. **deliveryCoordinatorEvents doc refresh** — `frontend{,2}/lib/mechanisms/deliveryCoordinatorEvents.ts` lines 6–11 and 73–76 rewritten in both trees. `contentRef` now correctly described as `keccak256(content)` (verification digest), with proof bytes living in the on-chain `content` payload. Twin diff back to empty.
