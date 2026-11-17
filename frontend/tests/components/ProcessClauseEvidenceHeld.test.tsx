/**
 * The audit page and the evidence file agree on what this device holds. A
 * private attestation whose content this browser kept is shown as held, never
 * named missing; only one it does not hold is named missing.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ORDER = `0x${"0a".repeat(32)}`;
const PROCESS = `0x${"ab".repeat(32)}`;
const HELD_REF = `0x${"e1".repeat(32)}`;
const NOT_HELD_REF = `0x${"e2".repeat(32)}`;
const ORDERS = { status: "present", value: [{ orderHash: ORDER, processId: PROCESS, checkoutHash: `0x${"cd".repeat(32)}`, buyer: "0x1", seller: "0x2" }] };
const { rows } = vi.hoisted(() => ({ rows: [] as unknown[] }));

vi.mock("wagmi", () => ({ usePublicClient: () => ({ chain: { id: 31337 } }) }));
vi.mock("@/hooks/useProcessOrders", () => ({ useProcessOrders: () => ORDERS }));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreementReads: () => new Map() }));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));
vi.mock("@/lib/composition/indexer", () => ({ getAttestationsByOrder: async () => rows }));
vi.mock("@/lib/audit/signatureVerdicts", () => ({ verifyOrderCommitSignatures: async () => { throw new Error("no verdict"); } }));
vi.mock("@/lib/composition/witnessContent", () => ({
    resolveHeldWitnessContent: async () => null,
    // This device holds the content of one attestation only.
    readHeldWitness: (place: { contentRef: string }) =>
        place.contentRef === HELD_REF ? { content: "0x00", values: { reading: "7" } } : null,
}));
vi.mock("@/components/runtime/WitnessPinErasure", () => ({ WitnessPinErasure: () => null }));
vi.mock("@/components/runtime/CredentialVerifyButton", () => ({ CredentialVerifyButton: () => null }));

import { ProcessClauseEvidence } from "@/app/(app)/audit/_components/ProcessClauseEvidence";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

const spec = pinSpec({
    clauseId: "figaro-test-held-stage",
    version: 1,
    title: "Held stage",
    description: "A made-up clause with a private stage-1 witness.",
    fields: [{ name: "term", type: "string", required: true }],
    stages: {
        "1": [
            { name: "reading", type: "string", required: true, disposition: "private" },
            { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
        ],
    },
    block: {
        design: { article: "test-article", scope: "agreement", nestsUnder: null, fills: [], composes: null },
        checkout: { catalogueFills: [], profileFills: [] },
        runtime: { interaction: null, fields: [] },
    },
});

beforeAll(async () => {
    setClauseSpecFetcher(async () => spec.bytes);
    await loadClauseSpec(spec.clauseKey, "mem://held-spec");
});

const row = (ref: string) => ({
    orderHash: ORDER, processId: PROCESS, attester: "0x00000000000000000000000000000000000000a1",
    clauseId: spec.clauseKey, stage: 1, contentRef: ref, transactionHash: null, blockNumber: 5, universe: "direct",
});

describe("ProcessClauseEvidence names missing only what this device does not hold", () => {
    it("a held private attestation is not named missing; one not held is", async () => {
        rows.splice(0, rows.length, row(HELD_REF), row(NOT_HELD_REF));
        render(<ProcessClauseEvidence processId={PROCESS} />);
        await screen.findAllByTestId(`audit-content-ref-${spec.clauseKey}-1`);
        const block = await screen.findByTestId("audit-missing-parts");
        expect(block.textContent).toContain(NOT_HELD_REF);
        expect(block.textContent).not.toContain(HELD_REF);
    });
});
