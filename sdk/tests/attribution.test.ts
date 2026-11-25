/**
 * attributeProcessDesigns — which process design each process instantiated,
 * from the counter's process-design records and the provenance leaf's
 * attestations by either party to the order. Conflicting attestations leave a
 * process contested and unattributed; the counter's record wins.
 */
import { describe, expect, it } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { attributeProcessDesigns } from "../src/derive/attribution.js";
import type { OverlayEntry, OverlayGraph } from "../src/derive/overlay.js";
import { PROVENANCE_LEAF_KEY, provenanceLeafBytes } from "../src/agreement.js";
import { USAGE_KIND_AGREEMENT, USAGE_KIND_CLAUSE, USAGE_KIND_PROCESS } from "../src/rpgf/index.js";

const h = (label: string): Hex => keccak256(toHex(label));
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const SELLER = "0x00000000000000000000000000000000000000c1" as const;
const [P1, P2, P3] = [h("process-1"), h("process-2"), h("process-3")];
const [DESIGN_A, DESIGN_B] = [h("design-a"), h("design-b")];
const AGREEMENT = h("agreement");

/** A provenance-leaf attestation of `processId` naming (AGREEMENT, design). */
function entry(processId: Hex, design: Hex, attester: Hex, opts: { decoded?: boolean; block?: number } = {}): OverlayEntry {
    return {
        orderHash: h(`order-of-${processId}`),
        processId,
        attester,
        stage: 0,
        universe: "direct",
        blockNumber: opts.block ?? 1,
        // The fingerprint of the leaf's bytes: keccak256 of
        // {"agreementHash":…,"processDesignHash":…}.
        contentRef: keccak256(provenanceLeafBytes(AGREEMENT, design)),
        decoded: opts.decoded === false ? null : { agreementHash: AGREEMENT, processDesignHash: design },
    };
}

const graph = (entries: OverlayEntry[]): OverlayGraph => ({
    boundary: "protocol-derived", clauseKey: PROVENANCE_LEAF_KEY, spec: null, provenanceLeaf: true, entries,
});

describe("attributeProcessDesigns", () => {
    it("attributes from a provenance attestation by the buyer and by the seller alike", () => {
        const { byProcess, contested } = attributeProcessDesigns({
            overlays: [graph([entry(P1, DESIGN_A, BUYER), entry(P2, DESIGN_B, SELLER)])],
        });
        expect(byProcess.get(P1.toLowerCase())).toEqual({ processDesignHash: DESIGN_A, source: "attestation" });
        expect(byProcess.get(P2.toLowerCase())).toEqual({ processDesignHash: DESIGN_B, source: "attestation" });
        expect(contested.size).toBe(0);
    });

    it("attributes an undecoded attestation by its fingerprint against a loaded design's agreements", () => {
        const overlays = [graph([entry(P1, DESIGN_A, SELLER, { decoded: false })])];
        expect(attributeProcessDesigns({ overlays }).byProcess.size).toBe(0);
        const { byProcess } = attributeProcessDesigns({ overlays, designs: [{ processDesignHash: DESIGN_A, agreementHashes: [AGREEMENT] }] });
        expect(byProcess.get(P1.toLowerCase())?.processDesignHash).toBe(DESIGN_A);
    });

    it("never takes decoded bytes the fingerprint does not name", () => {
        const forged = { ...entry(P1, DESIGN_A, BUYER), decoded: { agreementHash: AGREEMENT, processDesignHash: DESIGN_B } };
        expect(attributeProcessDesigns({ overlays: [graph([forged])] }).byProcess.size).toBe(0);
    });

    it("leaves a process two attestations name two designs for contested and unattributed, whatever their order", () => {
        for (const entries of [
            [entry(P1, DESIGN_A, BUYER, { block: 1 }), entry(P1, DESIGN_B, SELLER, { block: 2 })],
            [entry(P1, DESIGN_B, SELLER, { block: 1 }), entry(P1, DESIGN_A, BUYER, { block: 2 })],
        ]) {
            const { byProcess, contested } = attributeProcessDesigns({ overlays: [graph(entries)] });
            expect(byProcess.has(P1.toLowerCase())).toBe(false);
            expect([...contested]).toEqual([P1.toLowerCase()]);
        }
        // Two attestations that agree attribute.
        const agree = attributeProcessDesigns({ overlays: [graph([entry(P1, DESIGN_A, BUYER), entry(P1, DESIGN_A, SELLER)])] });
        expect(agree.byProcess.get(P1.toLowerCase())?.processDesignHash).toBe(DESIGN_A);
    });

    it("the counter's process-design record wins over the attestations, and only that kind counts", () => {
        const { byProcess, contested } = attributeProcessDesigns({
            overlays: [graph([entry(P1, DESIGN_A, BUYER), entry(P1, DESIGN_B, SELLER)])],
            usageRecords: [
                { kind: USAGE_KIND_PROCESS, clauseOrProcess: DESIGN_B, processId: P1 },
                { kind: USAGE_KIND_AGREEMENT, clauseOrProcess: AGREEMENT, processId: P3 },
                { kind: USAGE_KIND_CLAUSE, clauseOrProcess: h("clause"), processId: P3 },
            ],
        });
        expect(byProcess.get(P1.toLowerCase())).toEqual({ processDesignHash: DESIGN_B, source: "usage-counter" });
        expect(contested.size).toBe(0);
        expect(byProcess.has(P3.toLowerCase())).toBe(false);
    });

    it("reads the provenance leaf's graph only", () => {
        const other: OverlayGraph = { ...graph([entry(P1, DESIGN_A, BUYER)]), clauseKey: h("a clause"), provenanceLeaf: false };
        expect(attributeProcessDesigns({ overlays: [other] }).byProcess.size).toBe(0);
    });
});
