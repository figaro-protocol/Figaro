/**
 * lib/shared/deploymentFingerprint.ts — a tamper-check a buyer runs before
 * signing a commit. It is the sha256 over the operative on-chain address set
 * of the deployment THIS page shows; anyone can recompute the same hash from
 * the canonical deployment record and compare, so a frontend serving swapped
 * addresses will not match.
 *
 * Cross-origin by design: this site shows a fingerprint, the repository serves
 * the deployment record, and neither origin's word alone is trusted — the buyer compares
 * two independently produced hashes. The serialization is byte-identical to the
 * documented `jq -j … | shasum -a 256` recipe on /docs/protocol/contracts: the
 * address fields below, each written `recordField=loweraddress`, sorted by
 * field name, joined with a newline, no trailing newline. The field names ARE
 * the deployment record's own keys, so the recipe extracts exactly these.
 *
 * The addresses are the page's deployment record's (`lib/shared/chains.ts`,
 * `pageRecord`): a published deployment record's own fields, or the build's own record.
 * The set is kept in lockstep with the deployment record and the docs recipe
 * by scripts/lint-deployment-fingerprint.sh, which reads the list below.
 */
import { sha256, isAddress } from "viem";
import { pageRecord } from "@/lib/shared/chains";

// fingerprint-fields:start
const OPERATIVE_FIELDS = [
    "agreementRegistry",
    "assemblyRegistry",
    "attestationCoordinator",
    "batchVerifier",
    "clauseRegistry",
    "figaroCore",
    "florinToken",
    "membersRegistry",
    "multisender",
    "permit2",
    "rpgfMinter",
    "swapQuoter",
    "swapRouter",
    "usageCounter",
    "witnessSwapAndCommitCoordinator",
] as const;
// fingerprint-fields:end

/** The canonical serialization the fingerprint hashes, or null when the
 *  operative set is incomplete — a fingerprint over a partial set would match
 *  no canonical deployment record, so it is better withheld than shown wrong. */
function canonicalSerialization(): string | null {
    const record = pageRecord();
    if (!record) return null;
    const lines: string[] = [];
    for (const field of OPERATIVE_FIELDS) {
        const value = record[field];
        if (!value || !isAddress(value, { strict: false })) continue;
        lines.push(`${field}=${value.toLowerCase()}`);
    }
    if (lines.length !== OPERATIVE_FIELDS.length) return null;
    return lines.sort().join("\n");
}

/** sha256 (hex, no `0x` prefix — matching `shasum -a 256`) over the operative
 *  on-chain address set of the deployment this page shows, or null when that
 *  set is incomplete. Pure and synchronous; safe to call in render. */
export function deploymentFingerprint(): string | null {
    const serialization = canonicalSerialization();
    if (serialization === null) return null;
    return sha256(new TextEncoder().encode(serialization)).slice(2);
}
