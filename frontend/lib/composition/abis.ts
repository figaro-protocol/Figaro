/**
 * lib/composition/abis.ts — ABIs for contracts the frontend COMPOSES with.
 *
 * These are NOT core. Core is the five Figaro contracts (kernel +
 * Clause/Seller/Assembly registries + FIG) + the agnostic ERC-20 — those live
 * in `@figaro/core` and `lib/kernel/contracts.ts`, enforced by
 * `scripts/lint-core-contract-abis.sh`. Everything here is a contract the
 * protocol composes WITH (attestation),
 * so its ABI carries no privilege and lives outside core.
 *
 * STEP-2 TARGET (open-world): the frontend should learn a composed contract's
 * ABI + how to invoke it from the registered clause/assembly spec at runtime
 * (IPFS), the way it already learns clauses — so adding a contract needs no
 * code. Until then these are bundled here, quarantined out of core. They are
 * prior knowledge to be removed, not a pattern to copy.
 */
import { parseAbi, parseAbiItem } from "viem";
import { COMMITMENT_TUPLE } from "@figaro/core";

// ── AttestationCoordinator ───────────────────────────────────────────────────
//
// ⚠️  DEFECT — STEP 2: this contract is wrongly coupled to FigaroCore. It takes
// kernel `Commitment` structs and re-derives roles against core
// (`_requireKnownCommitment`). The open-world design is that the UI derives
// buyer/seller from the INDEXER, and role authorization goes through
// `IRoleResolver` — NOT a FigaroCore call. The contract is to be redesigned to
// drop the `Commitment` args + the `core` dependency; this ABI (and the
// `COMMITMENT_TUPLE` import) dies with that change. Bundled here only so the
// runtime-attest + audit beats work in the interim.
export const ATTESTATION_COORDINATOR_ABI = parseAbi([
    "function core() view returns (address)",
    `function attestAsSeller(${COMMITMENT_TUPLE} role, ${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    `function attestAsBuyer(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    `function attestViaResolver(${COMMITMENT_TUPLE} target, bytes32 clauseId, uint8 stage, bytes sectionData, bytes32[] proof, bytes content) external`,
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
    "error InvalidInclusionProof(bytes32 agreementHash, bytes32 clauseId)",
]);

export const EV_ATTESTATION = parseAbiItem(
    "event Attestation(bytes32 indexed orderHash, bytes32 indexed processId, address indexed attester, bytes32 clauseId, uint8 stage, bytes32 contentRef)",
);
