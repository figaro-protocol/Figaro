/**
 * lib/shared/deploymentFingerprint.ts — a tamper-check a buyer runs before
 * signing a commit. It is the sha256 over the operative on-chain address set
 * THIS client was built with; anyone can recompute the same hash from the
 * canonical deployment record and compare, so a frontend serving swapped
 * addresses will not match.
 *
 * Cross-origin by design: this site shows a fingerprint, the repository serves
 * the record, and neither origin's word alone is trusted — the buyer compares
 * two independently produced hashes. The serialization is byte-identical to the
 * documented `jq -j … | shasum -a 256` recipe on /docs/protocol/contracts: the
 * address fields below, each written `recordField=loweraddress`, sorted by
 * field name, joined with a newline, no trailing newline. The field names ARE
 * the deployment record's own keys, so the recipe extracts exactly these.
 *
 * SWC inlines process.env.NEXT_PUBLIC_* only when read DIRECTLY (never via a
 * dynamic key), so every field is a literal reference. The set is kept in
 * lockstep with the record and the docs recipe by
 * scripts/lint-deployment-fingerprint.sh.
 */
import { sha256, isAddress } from "viem";

const OPERATIVE_ADDRESSES: readonly (readonly [string, string | undefined])[] = [
    ["assemblyRegistry", process.env.NEXT_PUBLIC_ASSEMBLY_REGISTRY],
    ["attestationCoordinator", process.env.NEXT_PUBLIC_ATTESTATION_COORDINATOR],
    ["batchVerifier", process.env.NEXT_PUBLIC_BATCH_VERIFIER],
    ["clauseRegistry", process.env.NEXT_PUBLIC_CLAUSE_REGISTRY],
    ["figaroCore", process.env.NEXT_PUBLIC_FIGARO_CORE],
    ["florinToken", process.env.NEXT_PUBLIC_FLORIN_TOKEN_ADDRESS],
    ["membersRegistry", process.env.NEXT_PUBLIC_MEMBERS_REGISTRY],
    ["permit2", process.env.NEXT_PUBLIC_PERMIT2],
    ["rpgfMinter", process.env.NEXT_PUBLIC_RPGF_MINTER],
    ["swapQuoter", process.env.NEXT_PUBLIC_SWAP_QUOTER],
    ["swapRouter", process.env.NEXT_PUBLIC_SWAP_ROUTER],
    ["usageCounter", process.env.NEXT_PUBLIC_USAGE_COUNTER],
    ["witnessSwapAndCommitCoordinator", process.env.NEXT_PUBLIC_WITNESS_SWAP_AND_COMMIT_COORDINATOR],
];

/** The canonical serialization the fingerprint hashes, or null when the
 *  operative set is incomplete — a fingerprint over a partial set would match
 *  no canonical record, so it is better withheld than shown wrong. */
function canonicalSerialization(): string | null {
    const lines: string[] = [];
    for (const [field, value] of OPERATIVE_ADDRESSES) {
        if (!value || !isAddress(value, { strict: false })) continue;
        lines.push(`${field}=${value.toLowerCase()}`);
    }
    if (lines.length !== OPERATIVE_ADDRESSES.length) return null;
    return lines.sort().join("\n");
}

/** sha256 (hex, no `0x` prefix — matching `shasum -a 256`) over the operative
 *  on-chain address set this client is built with, or null when that set is
 *  incomplete. Pure and synchronous; safe to call in render. */
export function deploymentFingerprint(): string | null {
    const serialization = canonicalSerialization();
    if (serialization === null) return null;
    return sha256(new TextEncoder().encode(serialization)).slice(2);
}
