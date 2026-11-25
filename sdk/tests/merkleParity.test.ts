/**
 * Merkle parity vectors — the three-way cross-language lock for the
 * agreement tree.
 *
 * The SDK builds the agreement's merkle root (`checkoutHash`) and each
 * clause's inclusion proof; `AttestationCoordinator` and `UsageCounter`
 * verify those proofs on the direct path through OpenZeppelin `MerkleProof`,
 * and the guest verifies them on the batch path through
 * `prover/lib/src/merkle.rs`. Each of the three has its own tests; none of
 * those locks two implementations to each other.
 *
 * This file freezes SDK-built roots, leaves and proofs into
 * `test/fixtures/merkle-vectors.json`. `test/core/attestation/MerkleParityTest.t.sol`
 * rebuilds every leaf from its clause key and clause bytes the way the two
 * consumers do and verifies every proof with OpenZeppelin;
 * `prover/lib/tests/merkle_parity.rs` does the same through the guest's
 * verifier. The EIP-712 lock (`eip712Parity.test.ts`) is the sibling.
 *
 * Three agreements: three clauses (an odd leaf count, so one node is promoted
 * unpaired), one clause (an empty proof, leaf == root), and one clause plus
 * the format's topology leaf (an empty list: the root of its process) and
 * the reserved provenance leaf (the agreement format's own leaf, keyed by
 * `PROVENANCE_LEAF_KEY` and reproduced from the two keys it names — the
 * registered agreement and the assembly, taken from the third assembly of
 * `assembly-vectors.json` — what both consumers rebuild for an agreement or
 * assembly claim). The topology leaf enters the root and its vector
 * (`topology`: the edges, the committed bytes and the leaf) is frozen for a
 * reader rebuilding the root; neither on-chain consumer rebuilds it, since
 * its shape is no clause leaf's and nothing attests or counts it.
 * `topologyVectors` holds a topology leaf on its own: `one-edge`, the leaf of
 * an order that follows `keccak256("an order this order follows")`, the
 * edge `TopologyLeafNeverOpensTest.t.sol` builds its tree over.
 *
 *   1. Regenerate the fixture on `HARVEST_MERKLE_VECTORS=1`.
 *   2. On `AGREEMENT_FUZZ_SEED=<n>`, write GENERATED agreements in the
 *      fixture's format to `test/fixtures/streams/agreements.json`: the
 *      differential fuzz (`scripts/test-cross-impl-fuzz.sh`) points the
 *      Solidity and Rust legs at that file through `MERKLE_VECTORS`.
 *   3. Otherwise, assert the SDK still reproduces the frozen bytes.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
    PROVENANCE_LEAF_KEY,
    buildProvenanceInclusionProof,
    buildSignedClauseInclusionProof,
    canonicalize,
    computeCheckoutHash,
    computeTopologyLeaf,
    provenanceLeafBytes,
    topologyLeafBytes,
    type Agreement,
} from "../src/agreement.js";
import { agreementArb } from "./propertyArbs.js";
import { agreementHashOf, processDesignHashOf } from "../src/assembly.js";
import { ASSEMBLY_THREE, REGISTERED_DESIGN, K } from "./assemblyVectors.js";
import { writeHarvestedFixture } from "./harvest.js";
import { keccak256, toBytes, type Hex } from "viem";

const FUZZ_PATH = path.resolve(__dirname, "../../test/fixtures/streams/agreements.json");
const FIXTURE_PATH = path.resolve(__dirname, "../../test/fixtures/merkle-vectors.json");

const THREE: Agreement = {
    version: "a1",
    buyer: "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    seller: "0xAd29D7a8aD3639F97798c768202F27C1dE81DC55",
    clauses: [
        { clause: K("figaro-modalities"), data: { modality: "delivery" } },
        { clause: K("figaro-geolocation"), data: { hops: 2, origin: "site-7" } },
        { clause: K("figaro-applicable-law"), data: { law: "ch" } },
    ],
};

const ONE: Agreement = {
    version: "a1",
    buyer: "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    seller: "0xAd29D7a8aD3639F97798c768202F27C1dE81DC55",
    clauses: [{ clause: K("figaro-modalities"), data: { modality: "pickup" } }],
};
/** One clause, the root's empty topology, and the design it was instantiated from. */
const WITH_DESIGN: Agreement = {
    version: "a1",
    buyer: "0x0376AAc07Ad725E01357B1725B5ceC61aE10473c",
    seller: "0xAd29D7a8aD3639F97798c768202F27C1dE81DC55",
    clauses: [
        { clause: K("figaro-commerce"), data: { lineItems: [{ itemId: "i-7", name: "Item", quantity: 1, unitPrice: "7" }] } },
    ],
    follows: [],
    provenance: { agreementHash: agreementHashOf(REGISTERED_DESIGN), processDesignHash: processDesignHashOf(ASSEMBLY_THREE) },
};

function vectorFor(label: string, agreement: Agreement) {
    const provenance = agreement.provenance === undefined ? undefined : (() => {
        const { leaf, proof } = buildProvenanceInclusionProof(agreement);
        return {
            // The reserved key and the bytes the leaf hashes: both consumers
            // rebuild the leaf from these two, exactly as for a clause.
            leafKey: PROVENANCE_LEAF_KEY,
            agreementHash: agreement.provenance.agreementHash,
            processDesignHash: agreement.provenance.processDesignHash,
            clauseData: Buffer.from(
                provenanceLeafBytes(agreement.provenance.agreementHash, agreement.provenance.processDesignHash).slice(2),
                "hex",
            ).toString("utf8"),
            leaf,
            proof,
        };
    })();
    const topology = agreement.follows === undefined ? undefined : {
        follows: agreement.follows,
        clauseData: Buffer.from(topologyLeafBytes(agreement.follows).slice(2), "hex").toString("utf8"),
        leaf: computeTopologyLeaf(agreement.follows),
    };
    return {
        label,
        checkoutHash: computeCheckoutHash(agreement),
        clauseCount: agreement.clauses.length,
        ...(provenance ? { provenance } : {}),
        ...(topology ? { topology } : {}),
        clauses: agreement.clauses.map((clauseEntry) => {
            const { leaf, proof } = buildSignedClauseInclusionProof(agreement, clauseEntry.clause);
            return {
                clauseKey: clauseEntry.clause,
                // The canonical-JSON bytes the leaf hashes: keccak256 of this
                // string is the clause data hash both on-chain consumers take.
                clauseData: canonicalize(clauseEntry.data),
                leaf,
                proof,
            };
        }),
    };
}

/** A topology leaf on its own: the edges, the committed bytes and the leaf
 *  (`computeTopologyLeaf`). */
function topologyVectorFor(label: string, follows: readonly Hex[]) {
    return {
        label,
        follows,
        clauseData: Buffer.from(topologyLeafBytes(follows).slice(2), "hex").toString("utf8"),
        leaf: computeTopologyLeaf(follows),
    };
}

/** The one edge `TopologyLeafNeverOpensTest.t.sol` builds its tree over:
 *  `keccak256("an order this order follows")`. */
const ONE_EDGE_FOLLOWED = keccak256(toBytes("an order this order follows"));

function build() {
    return {
        agreementCount: 3,
        agreements: [vectorFor("three-clauses", THREE), vectorFor("one-clause", ONE), vectorFor("one-clause-a-topology-and-a-design", WITH_DESIGN)],
        // The topology leaf of an order that follows one order: a reader of
        // the fixture rebuilds it from `follows` and `clauseData`.
        topologyVectors: [topologyVectorFor("one-edge", [ONE_EDGE_FOLLOWED])],
    };
}

/** Generated agreements, one to six clauses each, in the fixture's format. */
function buildGenerated(seed: number, count: number) {
    const agreements = fc.sample(agreementArb(1), { seed, numRuns: count });
    return {
        seed,
        agreementCount: agreements.length,
        agreements: agreements.map((agreement, i) => vectorFor(`generated-${i}`, agreement)),
    };
}

describe("Merkle parity vectors — the three-way lock", () => {
    if (process.env.AGREEMENT_FUZZ_SEED !== undefined) {
        it("writes generated agreements to test/fixtures/streams/agreements.json", () => {
            const seed = Number(process.env.AGREEMENT_FUZZ_SEED);
            const count = Number(process.env.AGREEMENT_FUZZ_COUNT ?? "64");
            expect(Number.isSafeInteger(seed), "AGREEMENT_FUZZ_SEED is an integer").toBe(true);
            const generated = buildGenerated(seed, count);
            expect(generated.agreementCount).toBe(count);
            mkdirSync(path.dirname(FUZZ_PATH), { recursive: true });
            writeFileSync(FUZZ_PATH, `${JSON.stringify(generated, null, 4)}\n`);
        });
        return;
    }

    if (process.env.HARVEST_MERKLE_VECTORS === "1") {
        it("regenerates test/fixtures/merkle-vectors.json", () => {
            writeHarvestedFixture(FIXTURE_PATH, `${JSON.stringify(build(), null, 4)}\n`);
        });
        return;
    }

    it("the one-edge topology leaf is the one TopologyLeafNeverOpensTest.t.sol hard-codes", () => {
        const sol = readFileSync(path.resolve(__dirname, "../../test/core/attestation/TopologyLeafNeverOpensTest.t.sol"), "utf8");
        const pinned = /SDK_ONE_EDGE_TOPOLOGY_LEAF\s*=\s*(0x[0-9a-fA-F]{64})/.exec(sol)?.[1];
        expect(pinned, "the Foundry test pins the one-edge leaf").toBeDefined();
        expect(computeTopologyLeaf([ONE_EDGE_FOLLOWED])).toBe(pinned);
        const frozen = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as { topologyVectors: { label: string; leaf: Hex }[] };
        expect(frozen.topologyVectors.find((v) => v.label === "one-edge")?.leaf).toBe(pinned);
    });

    it("the SDK reproduces the frozen fixture byte-for-byte", () => {
        expect(existsSync(FIXTURE_PATH), "fixture missing — harvest with HARVEST_MERKLE_VECTORS=1").toBe(true);
        const frozen = readFileSync(FIXTURE_PATH, "utf8");
        expect(`${JSON.stringify(build(), null, 4)}\n`).toBe(frozen);
    });
});
