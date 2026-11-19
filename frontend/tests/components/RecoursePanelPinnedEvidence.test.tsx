/**
 * The evidence file `RecoursePanel` pins is public, so it carries private
 * content by its fingerprint only (`docs/DATA_LAYER.md`: a private witness's
 * content is never published, and a received copy is never sent on).
 *
 * Proves: with a private clause in the agreement and two private witnesses
 * this browser holds, one kept by its attester and one received from the
 * counterparty, the blob handed to `pinBlob` holds neither witness's content
 * nor any blinding value, and still names each by its fingerprint.
 *
 * The data the PDF renders is the real builder's (`buildAuditBundleData`
 * through `buildAuditBundlePdfBlob`); only the renderer is replaced, by one
 * that writes that data as the blob, so the assertion reads every value the
 * page could print.
 */
import { beforeAll, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { encodeAbiParameters, keccak256 } from "viem";
import type { Agreement, Hex } from "@figaro-protocol/sdk";
import type { Order } from "@/lib/core/store";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

const pinned = vi.hoisted(() => ({ blobs: [] as Blob[] }));
const held = vi.hoisted(() => ({ byRef: new Map<string, { content: `0x${string}`; values: Record<string, unknown>; received: boolean }>() }));
const chain = vi.hoisted(() => ({ attestations: [] as unknown[], agreements: new Map<string, unknown>() }));

vi.mock("wagmi", () => ({ usePublicClient: () => ({}), useChainId: () => 31337 }));
vi.mock("@/lib/shared/runtimeServicesContext", () => ({
    useRuntimeServices: () => ({
        evidenceTransport: {
            pinBlob: async (blob: Blob) => { pinned.blobs.push(blob); return "cid"; },
            unpin: async () => undefined,
        },
    }),
}));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreements: () => chain.agreements }));
vi.mock("@/lib/core/attestationIndexer", () => ({ getAttestationsByOrder: async () => chain.attestations }));
vi.mock("@/lib/registries/membersRegistryIndexer", () => ({ getAllMemberRegistered: async () => [], getActiveMembers: async () => [] }));
vi.mock("@/lib/data/audit/processTimeline", () => ({ buildProcessTimeline: async () => ({ missing: [] }) }));
vi.mock("@/lib/core/witnessContent", () => ({
    // The holder holds both witnesses: a file that read them would carry them.
    heldWitnessReader: () => (place: { contentRef: string }) => held.byRef.get(place.contentRef.toLowerCase()) ?? null,
}));
// The renderer writes the data the page would print as the blob.
vi.mock("@/lib/data/audit/pdfBundle", () => ({ AuditBundlePdf: ({ data }: { data: unknown }) => data }));
vi.mock("@react-pdf/renderer", () => ({
    pdf: (data: unknown) => ({
        toBlob: async () => new Blob([JSON.stringify(data, (_k, v: unknown) => (typeof v === "bigint" ? v.toString() : v))]),
    }),
}));

import { RecoursePanel } from "@/components/runtime/RecoursePanel";

const PROCESS = `0x${"ab".repeat(32)}` as const;
const ORDER = `0x${"0d".repeat(32)}`;
const CHECKOUT = `0x${"cd".repeat(32)}`;
const BUYER = "0x00000000000000000000000000000000000000b1";
const SELLER = "0x00000000000000000000000000000000000000a1";
const BLINDING = { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true };

/** A clause no one has seen: a private committed set and a private witness stage. */
const SPEC = {
    clauseId: "test-private-reading",
    version: 1,
    title: "Private reading",
    description: "A private term and a private reading.",
    fields: [{ name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" }, BLINDING],
    stages: { "1": [{ name: "reading", type: "string", required: true, disposition: "private" }, BLINDING] },
    block: { design: { article: "terms" } },
};

const COMMITTED_BLINDING = `0x${"c0".repeat(32)}`;
const KEPT_BLINDING = `0x${"4b".repeat(32)}`;
const RECEIVED_BLINDING = `0x${"5e".repeat(32)}`;
const KEPT_READING = "kept-reading-7-degrees";
const RECEIVED_READING = "received-reading-9-degrees";

const witness = (reading: string, blinding: string) => {
    const content = encodeAbiParameters([{ type: "string" }, { type: "bytes32" }], [reading, blinding as Hex]);
    return { content, contentRef: keccak256(content) };
};

let clauseKey: Hex;

beforeAll(async () => {
    const { clauseKey: key, bytes } = pinSpec(SPEC);
    clauseKey = key;
    setClauseSpecFetcher(async () => bytes);
    await loadClauseSpec(clauseKey, "mem://private-reading");

    const kept = witness(KEPT_READING, KEPT_BLINDING);
    const received = witness(RECEIVED_READING, RECEIVED_BLINDING);
    held.byRef.set(kept.contentRef, { content: kept.content, values: { reading: KEPT_READING, blinding: KEPT_BLINDING }, received: false });
    held.byRef.set(received.contentRef, { content: received.content, values: { reading: RECEIVED_READING, blinding: RECEIVED_BLINDING }, received: true });
    const attestation = (attester: string, contentRef: string, n: number) => ({
        orderHash: ORDER, processId: PROCESS, attester, clauseId: clauseKey, stage: 1, contentRef,
        transactionHash: `0x${String(n).repeat(64)}`, blockNumber: n, universe: "direct",
    });
    chain.attestations = [attestation(SELLER, kept.contentRef, 1), attestation(BUYER, received.contentRef, 2)];
    const agreement: Agreement = {
        version: "a1",
        buyer: BUYER,
        seller: SELLER,
        clauses: [{ clause: clauseKey, data: { grade: "b", blinding: COMMITTED_BLINDING } }],
    } as Agreement;
    chain.agreements = new Map([[CHECKOUT, agreement]]);
});

const ORDERS = [{
    orderHash: ORDER, processId: PROCESS, buyer: BUYER, seller: SELLER, checkoutHash: CHECKOUT,
    runningTotal: 1n, payment: 1n, state: 0, sellerBond: 2n, buyerBond: 2n, salt: 0n, commitDeadline: 0n,
}] as unknown as Order[];

describe("RecoursePanel pins an evidence file with private content by its fingerprint only", () => {
    it("the pinned blob holds no private witness content, kept or received, and no blinding value", async () => {
        render(<RecoursePanel processId={PROCESS} orders={ORDERS} />);
        fireEvent.click(await screen.findByTestId("dispute-evidence-prepare"));
        await waitFor(() => expect(pinned.blobs).toHaveLength(1));
        const text = await pinned.blobs[0].text();

        for (const secret of [KEPT_READING, RECEIVED_READING, KEPT_BLINDING, RECEIVED_BLINDING, COMMITTED_BLINDING]) {
            expect(text.toLowerCase()).not.toContain(secret.toLowerCase().replace(/^0x/, ""));
        }
        for (const { content } of held.byRef.values()) {
            expect(text.toLowerCase()).not.toContain(content.toLowerCase().replace(/^0x/, ""));
        }
        // Each private piece is still named, by its fingerprint.
        for (const contentRef of held.byRef.keys()) expect(text.toLowerCase()).toContain(contentRef.toLowerCase());
        expect(text).toContain(`Content of private clause ${clauseKey}`);
    });

    it("names each private witness withheld from the public file, by its fingerprint, never as one its builder does not hold", async () => {
        pinned.blobs.length = 0;
        render(<RecoursePanel processId={PROCESS} orders={ORDERS} />);
        fireEvent.click(await screen.findByTestId("dispute-evidence-prepare"));
        await waitFor(() => expect(pinned.blobs).toHaveLength(1));
        const data = JSON.parse(await pinned.blobs[0].text()) as { missing: Array<{ part: string; reason: string }> };

        // The builder holds both witnesses (the mock above), and leaves both out.
        expect(data.missing.map((m) => m.reason).join("\n")).not.toContain("does not hold it");
        for (const contentRef of held.byRef.keys()) {
            const entry = data.missing.find((m) => m.part.includes(`contentRef ${contentRef}`));
            expect(entry?.reason).toContain("withheld from a file pinned in public");
            expect(entry?.reason).toContain(`its fingerprint, contentRef ${contentRef}`);
        }
    });
});
