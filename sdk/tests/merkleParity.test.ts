/**
 * Merkle parity vectors — the three-way cross-language lock for the
 * agreement tree.
 *
 * The SDK builds the agreement's merkle root (`agreementHash`) and each
 * section's inclusion proof; `AttestationCoordinator` and `UsageCounter`
 * verify those proofs on the direct path through OpenZeppelin `MerkleProof`,
 * and the guest verifies them on the batch path through
 * `prover/lib/src/merkle.rs`. Each of the three has its own tests; none of
 * those locks two implementations to each other.
 *
 * This file freezes SDK-built roots, leaves and proofs into
 * `test/fixtures/merkle-vectors.json`. `test/core/attestation/MerkleParityTest.t.sol`
 * rebuilds every leaf from its clause key and section bytes the way the two
 * consumers do and verifies every proof with OpenZeppelin;
 * `prover/lib/tests/merkle_parity.rs` does the same through the guest's
 * verifier. The EIP-712 lock (`eip712Parity.test.ts`) is the sibling.
 *
 * Two agreements: three sections (an odd leaf count, so one node is promoted
 * unpaired) and one section (an empty proof, leaf == root).
 *
 *   1. Regenerate the fixture on `HARVEST_MERKLE_VECTORS=1`.
 *   2. Otherwise, assert the SDK still reproduces the frozen bytes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
    buildSectionInclusionProof,
    canonicalize,
    computeAgreementHash,
    type Agreement,
} from "../src/agreement.js";

const FIXTURE_PATH = path.resolve(__dirname, "../../test/fixtures/merkle-vectors.json");

const THREE: Agreement = {
    version: "a1",
    buyer: "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    seller: "0xAd29D7a8aD3639F97798c768202F27C1dE81DC55",
    sections: [
        { clause: "figaro-modalities", version: 1, data: { modality: "delivery" } },
        { clause: "figaro-provenance", version: 1, data: { hops: 2, origin: "kitchen-7" } },
        { clause: "figaro-applicable-law", version: 1, data: { law: "ch" } },
    ],
};

const ONE: Agreement = {
    version: "a1",
    buyer: "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    seller: "0xAd29D7a8aD3639F97798c768202F27C1dE81DC55",
    sections: [{ clause: "figaro-modalities", version: 1, data: { modality: "pickup" } }],
};

function vectorFor(label: string, agreement: Agreement) {
    return {
        label,
        agreementHash: computeAgreementHash(agreement),
        sectionCount: agreement.sections.length,
        sections: agreement.sections.map((section) => {
            const { leaf, proof } = buildSectionInclusionProof(agreement, section.clause);
            return {
                clause: section.clause,
                version: section.version,
                // The canonical-JSON bytes the leaf hashes: keccak256 of this
                // string is the section hash both on-chain consumers take.
                sectionData: canonicalize(section.data),
                leaf,
                proof,
            };
        }),
    };
}

function build() {
    return {
        agreementCount: 2,
        agreements: [vectorFor("three-sections", THREE), vectorFor("one-section", ONE)],
    };
}

describe("Merkle parity vectors — the three-way lock", () => {
    if (process.env.HARVEST_MERKLE_VECTORS === "1") {
        it("regenerates test/fixtures/merkle-vectors.json", () => {
            mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
            writeFileSync(FIXTURE_PATH, `${JSON.stringify(build(), null, 4)}\n`);
        });
        return;
    }

    it("the SDK reproduces the frozen fixture byte-for-byte", () => {
        expect(existsSync(FIXTURE_PATH), "fixture missing — harvest with HARVEST_MERKLE_VECTORS=1").toBe(true);
        const frozen = readFileSync(FIXTURE_PATH, "utf8");
        expect(`${JSON.stringify(build(), null, 4)}\n`).toBe(frozen);
    });
});
