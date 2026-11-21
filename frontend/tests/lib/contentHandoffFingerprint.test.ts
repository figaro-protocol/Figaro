/**
 * The content hand-off's public stage-1 fingerprint, read from the clause in
 * `clauses/` (`figaro-content-handoff`), whose stage-1 set is private.
 *
 * Proves: one artifact delivered under two orders gives two different public
 * fingerprints, since each attestation draws its own blinding value. An
 * outsider who guesses the artifact cannot confirm the guess against the
 * fingerprint. The counterparty, with the artifact and the value the sealed
 * envelope carries, recomputes the fingerprint and keeps the content as its
 * copy; a tampered artifact misses it. The content is never pinned, and the
 * evidence file pinned in public carries neither the artifact's hash nor the
 * blinding value, while the counterparty's own evidence file reads its copy.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { decodeContentFromSpec, encodeContentFromSpec, type ClauseSpec } from "@figaro-protocol/sdk/clauses";
import {
    completionEvidenceAnchor,
    contentDigestOf,
    contentHashOfBytes,
    keepVerifiedCompletionEvidence,
    prepareCompletionEvidence,
} from "@/lib/data/handoff/contentDelivery";
import { heldWitnessReader, publishWitnessContent } from "@/lib/core/witnessContent";
import { extractProcessLogs, WITHHELD_FROM_PUBLIC_FILE } from "@/lib/data/audit/processLogsExtract";
import { getClauseSpec, type ClauseSpecWithBlock } from "@/lib/shared/clauseSpecSource";
import type { Order } from "@/lib/core/store";
import { keyOf, primeClauseSpecs } from "./primeClauseSpecs";

const ARTIFACT = new TextEncoder().encode("the freelancer's final cut, version 3");
const ORDER_ONE = `0x${"1a".repeat(32)}` as Hex;
const ORDER_TWO = `0x${"2b".repeat(32)}` as Hex;
const SELLER = "0x2222222222222222222222222222222222222222";
const BUYER = { address: "0x1111111111111111111111111111111111111111", chainId: 31337 };

let clauseKey: Hex;
let spec: ClauseSpecWithBlock;
/** The stage the spec marks for its delivery evidence (`block.runtime.contentDigest`). */
let COMPLETION_STAGE: number;

beforeAll(async () => {
    await primeClauseSpecs(["figaro-content-handoff"]);
    clauseKey = keyOf("figaro-content-handoff");
    spec = getClauseSpec(clauseKey)!;
    COMPLETION_STAGE = contentDigestOf(spec)!.stage;
});

/** The sender's evidence for one delivery; the reference clause marks where it goes. */
function prepared(contentHash: Hex) {
    const evidence = prepareCompletionEvidence(spec, contentHash);
    if (!evidence) throw new Error("the spec marks no delivery evidence");
    return evidence;
}

/** The Attestation event the sender's stage-1 filing emits on one order. */
function attestation(orderHash: Hex, content: Hex) {
    return {
        orderHash, processId: `0x${"ab".repeat(32)}`, attester: SELLER, clauseId: clauseKey,
        stage: COMPLETION_STAGE, contentRef: keccak256(content), transactionHash: null, blockNumber: 9,
    };
}

describe("the hand-off's stage-1 fingerprint is bound to its own order", () => {
    it("the registered clause declares its stage-1 set private, with one blinding field", () => {
        const stage = spec.stages?.[COMPLETION_STAGE] ?? [];
        expect(stage.filter((f) => f.blinding === true)).toHaveLength(1);
        expect(stage.every((f) => f.disposition === "private")).toBe(true);
    });

    it("one artifact delivered under two orders gives two different public fingerprints", () => {
        const hash = contentHashOfBytes(ARTIFACT);
        const one = prepared(hash);
        const two = prepared(hash);
        expect(one.blinding).toMatch(/^0x[0-9a-f]{64}$/);
        expect(one.blinding).not.toBe(two.blinding);
        expect(keccak256(one.content)).not.toBe(keccak256(two.content));
        // Each content holds the artifact's hash: the value differs, not the evidence.
        expect(decodeContentFromSpec(spec, one.content, { stage: COMPLETION_STAGE }).contentHash).toBe(hash);
        expect(decodeContentFromSpec(spec, two.content, { stage: COMPLETION_STAGE }).contentHash).toBe(hash);
    });

    it("an outsider who guesses the artifact cannot confirm it against the fingerprint", () => {
        const filed = keccak256(prepared(contentHashOfBytes(ARTIFACT)).content);
        const guessedHash = contentHashOfBytes(ARTIFACT);
        expect(filed).not.toBe(guessedHash);
        expect(filed).not.toBe(keccak256(guessedHash));
        // Its best try encodes the guess with a value it must invent.
        for (const invented of [`0x${"00".repeat(32)}`, `0x${"01".repeat(32)}`, `0x${"ff".repeat(32)}`]) {
            const attempt = encodeContentFromSpec(spec, { contentHash: guessedHash, blinding: invented }, { stage: COMPLETION_STAGE });
            expect(keccak256(attempt)).not.toBe(filed);
        }
    });

    it("the counterparty recomputes the fingerprint from the artifact and the value it is sent, and a tampered artifact misses it", () => {
        const evidence = prepared(contentHashOfBytes(ARTIFACT));
        const filed = keccak256(evidence.content);
        expect(completionEvidenceAnchor(spec, { contentHash: contentHashOfBytes(ARTIFACT), blinding: evidence.blinding })).toBe(filed);
        const tampered = new Uint8Array(ARTIFACT);
        tampered[0] ^= 0x01;
        expect(completionEvidenceAnchor(spec, { contentHash: contentHashOfBytes(tampered), blinding: evidence.blinding })).not.toBe(filed);
        // Without the value no verdict is given.
        expect(completionEvidenceAnchor(spec, { contentHash: contentHashOfBytes(ARTIFACT) })).toBeNull();
    });

    it("the content is never pinned, and the evidence file pinned in public carries neither the artifact's hash nor the value", async () => {
        window.localStorage.clear();
        const hash = contentHashOfBytes(ARTIFACT);
        const evidence = prepared(hash);
        const pinKeccakRawBlock = vi.fn();
        await publishWitnessContent({ clauseId: clauseKey, stage: COMPLETION_STAGE, content: evidence.content, ipfs: { pinKeccakRawBlock } });
        expect(pinKeccakRawBlock).not.toHaveBeenCalled();

        // The counterparty keeps what it verified as its copy of the filing.
        expect(keepVerifiedCompletionEvidence(BUYER, spec, { orderHash: ORDER_ONE, clauseId: clauseKey }, { contentHash: hash, blinding: evidence.blinding })).toBe("kept");

        const order = { orderHash: ORDER_ONE } as unknown as Order;
        const atts = [attestation(ORDER_ONE, evidence.content)];
        const publicFile = JSON.stringify(extractProcessLogs(order, atts, WITHHELD_FROM_PUBLIC_FILE));
        expect(publicFile).toContain(keccak256(evidence.content));
        expect(publicFile.toLowerCase()).not.toContain(hash.slice(2).toLowerCase());
        expect(publicFile.toLowerCase()).not.toContain(evidence.blinding!.slice(2).toLowerCase());
        expect(publicFile).not.toContain(toHex(ARTIFACT).slice(2));

        // The counterparty's own file reads its copy, the artifact's hash included.
        const ownFile = JSON.stringify(extractProcessLogs(order, atts, heldWitnessReader(BUYER)));
        expect(ownFile.toLowerCase()).toContain(hash.slice(2).toLowerCase());
    });

    it("a copy is kept only for the place the content hashes to: another order's attestation reads none", () => {
        window.localStorage.clear();
        const hash = contentHashOfBytes(ARTIFACT);
        const evidence = prepared(hash);
        keepVerifiedCompletionEvidence(BUYER, spec, { orderHash: ORDER_ONE, clauseId: clauseKey }, { contentHash: hash, blinding: evidence.blinding });
        const other = { orderHash: ORDER_TWO } as unknown as Order;
        const otherFile = JSON.stringify(extractProcessLogs(other, [attestation(ORDER_TWO, evidence.content)], heldWitnessReader(BUYER)));
        expect(otherFile.toLowerCase()).not.toContain(hash.slice(2).toLowerCase());
    });
});
