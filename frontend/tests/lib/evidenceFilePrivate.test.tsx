/**
 * The evidence file a party hands a forum holds what lets the forum recompute
 * each private fingerprint: each private clause's blinding value, and the
 * party's own kept private witness content (bytes and values), so the forum
 * hashes the content to its `contentRef` and rebuilds each clause leaf as the
 * hash appendix tells it to. Who holds the content decides what the file
 * holds: a party that holds a piece puts it in; a piece it does not hold (a
 * withheld clause, another party's private witness) is named as missing.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { keccak256, type Hex } from "viem";
import { buildOrderAgreement, publicForm, type Agreement } from "@figaro-protocol/sdk";
import { encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
vi.mock("@react-pdf/renderer", () => {
    const passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
    return { Document: passthrough, Page: passthrough, View: passthrough, Text: passthrough, StyleSheet: { create: <T,>(s: T) => s } };
});

import { buildAuditBundle } from "@/lib/audit/auditBundle";
import { AuditBundlePdf } from "@/lib/audit/pdfBundle";
import type { AttestationRecord } from "@/lib/composition/indexer";
import { OrderState, type Order } from "@/lib/core/store";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";

const BUYER = "0x00000000000000000000000000000000000000b1";
const SELLER = "0x00000000000000000000000000000000000000a1";
const BLINDING = `0x${"3c".repeat(32)}`;

const PRIVATE = pinSpec({
    clauseId: "test-evidence-private",
    version: 1,
    title: "Private grade",
    description: "A private committed value and a private witness stage.",
    fields: [
        { name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" },
        { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
    ],
    stages: {
        "1": [
            { name: "reading", type: "string", required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
    },
});

let agreement: Agreement;
let order: Order;
let witness: Hex;
let witnessValues: Record<string, unknown>;
let attestations: AttestationRecord[];

beforeAll(async () => {
    setClauseSpecFetcher(async () => PRIVATE.bytes);
    await loadClauseSpec(PRIVATE.clauseKey, "mem://evidence-private");
    const built = buildOrderAgreement(BUYER, SELLER, { [PRIVATE.clauseKey]: { grade: "b", blinding: BLINDING } }, specSource());
    agreement = built.agreement;
    order = {
        orderHash: `0x${"0a".repeat(32)}`, processId: `0x${"ab".repeat(32)}`, buyer: BUYER, seller: SELLER,
        checkoutHash: built.checkoutHash, cumulativeValue: 1n, payment: 1n, state: OrderState.Active,
        sellerBond: 2n, buyerBond: 2n, salt: 1n, deadline: 1n,
    } as Order;
    witnessValues = { reading: "41.2", blinding: `0x${"c7".repeat(32)}` };
    witness = encodeContentFromSpec(getClauseSpec(PRIVATE.clauseKey)!, witnessValues, { stage: 1 });
    attestations = [{
        orderHash: order.orderHash, processId: order.processId, attester: SELLER, clauseId: PRIVATE.clauseKey,
        stage: 1, contentRef: keccak256(witness), transactionHash: null, blockNumber: 7,
    }];
});

describe("the evidence file, built by the party that holds the private content", () => {
    it("holds each private clause's blinding value, so the forum rebuilds the clause leaf", () => {
        const bundle = buildAuditBundle(order, agreement, attestations, { heldWitness: () => ({ content: witness, values: witnessValues }) });
        expect(bundle.clauseData.blindingValues).toEqual([{ clauseKey: PRIVATE.clauseKey, field: "blinding", value: BLINDING }]);
        // The clause's terms are listed without it, as every reader lists them.
        expect(JSON.stringify(bundle.clauseData.clauses)).not.toContain("3c3c");
    });

    it("holds its own private witness content, bytes and values, which hash to the attestation's contentRef", () => {
        const bundle = buildAuditBundle(order, agreement, attestations, { heldWitness: () => ({ content: witness, values: witnessValues }) });
        const [event] = bundle.processLogs.logs[0].events;
        expect(event.heldContent).toBe(witness);
        expect(keccak256(event.heldContent!)).toBe(event.contentRef);
        expect(event.heldValues).toEqual(witnessValues);
        expect(bundle.missing.filter((m) => m.part.includes(event.contentRef))).toEqual([]);
    });
});

describe("the evidence file, built by a reader that does not hold the private content", () => {
    it("names a withheld clause's content and blinding value as missing, and holds no blinding value", () => {
        const withheld = publicForm(agreement, specSource());
        const bundle = buildAuditBundle(order, withheld, attestations);
        expect(bundle.clauseData.blindingValues).toEqual([]);
        expect(bundle.missing).toContainEqual(expect.objectContaining({
            part: expect.stringContaining(`Content of private clause ${PRIVATE.clauseKey}`),
            reason: expect.stringMatching(/withheld.*blinding value/),
        }));
    });

    it("names a private witness it does not hold as missing", () => {
        const bundle = buildAuditBundle(order, agreement, attestations, { heldWitness: () => null });
        const [event] = bundle.processLogs.logs[0].events;
        expect(event.heldContent).toBeUndefined();
        expect(bundle.missing).toContainEqual(expect.objectContaining({
            part: expect.stringContaining(`Content of the private attestation of clause ${PRIVATE.clauseKey.toLowerCase()}, stage 1, contentRef ${keccak256(witness)}`),
        }));
    });
});

describe("the evidence file's pages show what its builder holds", () => {
    it("the clause-data page shows the blinding value, and the process-log page the held content's values and bytes", () => {
        const bundle = buildAuditBundle(order, agreement, attestations, { heldWitness: () => ({ content: witness, values: witnessValues }) });
        const { container } = render(
            <AuditBundlePdf data={{
                processId: order.processId, buyer: BUYER, missing: [], generatedAt: new Date(0),
                perOrderBundles: [bundle], documents: [],
            } as unknown as Parameters<typeof AuditBundlePdf>[0]["data"]} />,
        );
        const text = container.textContent ?? "";
        expect(text).toContain(BLINDING);
        expect(text).toContain("41.2");
        expect(text).toContain(witnessValues.blinding as string);
        expect(text).toContain(witness);
    });

    it("says of each private filing it holds whether its builder kept it when filing or received it from the counterparty", () => {
        const pdfText = (received: boolean) => {
            const bundle = buildAuditBundle(order, agreement, attestations, { heldWitness: () => ({ content: witness, values: witnessValues, received }) });
            expect(bundle.processLogs.logs[0].events[0].heldReceived).toBe(received);
            const { container } = render(
                <AuditBundlePdf data={{
                    processId: order.processId, buyer: BUYER, missing: [], generatedAt: new Date(0),
                    perOrderBundles: [bundle], documents: [],
                } as unknown as Parameters<typeof AuditBundlePdf>[0]["data"]} />,
            );
            const text = container.textContent ?? "";
            container.remove();
            return text;
        };
        // The seller attested; the buyer received a copy sealed to it.
        expect(pdfText(true)).toContain(`Copy received from the attester ${SELLER}, its counterparty on this order, and kept in the browser profile this file was built in.`);
        expect(pdfText(false)).toContain(`Copy kept in the browser profile this file was built in, when the attester ${SELLER} filed the attestation from it.`);
    });
});
