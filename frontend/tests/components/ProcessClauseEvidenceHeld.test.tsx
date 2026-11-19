/**
 * The audit page and the evidence file agree on what this device holds. A
 * private attestation whose content this browser kept is shown as held, never
 * named missing; only one it does not hold is named missing. A private
 * clause whose content the agreement withholds leaves its place empty and is
 * named once in the list of what the evidence file lacks; a clause signed
 * with no field says so.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";

const ORDER = `0x${"0a".repeat(32)}`;
const PROCESS = `0x${"ab".repeat(32)}`;
const HELD_REF = `0x${"e1".repeat(32)}`;
const NOT_HELD_REF = `0x${"e2".repeat(32)}`;
const ORDERS = { status: "present", value: [{ orderHash: ORDER, processId: PROCESS, checkoutHash: `0x${"cd".repeat(32)}`, buyer: "0x1", seller: "0x2" }] };
const { rows, agreementReads } = vi.hoisted(() => ({ rows: [] as unknown[], agreementReads: new Map<string, unknown>() }));

vi.mock("wagmi", () => ({ usePublicClient: () => ({ chain: { id: 31337 } }) }));
vi.mock("@/hooks/useProcessOrders", () => ({ useProcessOrders: () => ORDERS }));
vi.mock("@/hooks/useProcessAgreements", () => ({ useProcessAgreementReads: () => agreementReads }));
vi.mock("@/lib/registries/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));
vi.mock("@/lib/core/attestationIndexer", () => ({ getAttestationsByOrder: async () => rows }));
vi.mock("@/lib/data/audit/signatureVerdicts", () => ({ verifyOrderCommitSignatures: async () => { throw new Error("no verdict"); } }));
vi.mock("@/lib/core/witnessContent", () => ({
    resolveHeldWitnessContent: async () => null,
    // This device holds the content of one attestation only.
    heldWitnessReader: () => (place: { contentRef: string }) =>
        place.contentRef === HELD_REF ? { content: "0x00", values: { reading: "7" } } : null,
}));
vi.mock("@/components/runtime/WitnessPinErasure", () => ({ WitnessPinErasure: () => null }));
vi.mock("@/lib/core/useWitnessHolder", () => ({ useWitnessHolder: () => ({ address: "0x0000000000000000000000000000000000000002", chainId: 31337 }) }));
vi.mock("@/components/runtime/CredentialVerifyButton", () => ({ CredentialVerifyButton: () => null }));

import { ProcessClauseEvidence } from "@/app/(app)/audit/_components/ProcessClauseEvidence";
import { buildOrderAgreement, publicForm } from "@figaro-protocol/sdk";
import { loadClauseSpec, setClauseSpecFetcher, specSource } from "@/lib/shared/clauseSpecSource";
import { present } from "@/lib/shared/networkRead";
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
        runtime: { interaction: null },
    },
});

// A private committed value: its content is withheld from the public form of
// the agreement, which carries only its data hash.
const privateSpec = pinSpec({
    clauseId: "figaro-test-withheld-term",
    version: 1,
    title: "Withheld term",
    description: "A made-up clause with a private committed value.",
    fields: [
        { name: "grade", type: "string", required: true, disposition: "private" },
        { name: "blinding", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
    ],
});

// A clause that declares no committed field: the parties sign it with none.
const emptySpec = pinSpec({
    clauseId: "figaro-test-no-field",
    version: 1,
    title: "No committed field",
    description: "A made-up clause whose stage 0 declares no field.",
    fields: [],
    stages: { "1": [{ name: "note", type: "string", required: true }] },
});

beforeAll(async () => {
    const bytes = new Map([[spec.clauseKey, spec.bytes], [privateSpec.clauseKey, privateSpec.bytes], [emptySpec.clauseKey, emptySpec.bytes]]);
    setClauseSpecFetcher(async (uri: string) => bytes.get(uri.replace("mem://", "") as `0x${string}`)!);
    for (const key of bytes.keys()) await loadClauseSpec(key, `mem://${key}`);
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

describe("ProcessClauseEvidence tells a withheld clause from a clause signed with no field", () => {
    const BUYER = "0x00000000000000000000000000000000000000b1";
    const SELLER = "0x00000000000000000000000000000000000000a1";

    async function renderWith(values: Record<string, Record<string, unknown>>, withhold: boolean) {
        const built = buildOrderAgreement(BUYER, SELLER, values, specSource());
        const agreement = withhold ? publicForm(built.agreement, specSource()) : built.agreement;
        agreementReads.clear();
        agreementReads.set(ORDERS.value[0].checkoutHash, present(agreement));
        rows.splice(0, rows.length);
        render(<ProcessClauseEvidence processId={PROCESS} />);
        return screen.findByTestId(`audit-order-${ORDER}`);
    }

    it("a private clause whose content is withheld: its place is empty, and the list of what the file lacks names it once", async () => {
        const block = await renderWith({ [privateSpec.clauseKey]: { grade: "b", blinding: `0x${"3c".repeat(32)}` } }, true);
        expect(block.textContent).toContain("Withheld term");
        expect(block.textContent).not.toContain("Committed with no field values.");
        expect(screen.getByTestId(`audit-clause-${privateSpec.clauseKey}`).textContent).toBe("Withheld term");
        const text = screen.getByTestId("audit-clause-evidence").textContent ?? "";
        expect(text.match(/Content of private clause/g) ?? []).toHaveLength(1);
        expect(screen.getByTestId("audit-missing-parts").textContent).toContain(`Content of private clause ${privateSpec.clauseKey}`);
    });

    it("a clause with public committed fields and a private stage, in the agreement's public form: its committed values show in its place, and its content is not named missing", async () => {
        // A set never mixes public and private fields (`fieldSetRulesHold`,
        // sdk/src/clauses/spec.ts), so a clause holds both as a public stage 0
        // and a private later stage; the public form withholds only a clause
        // whose committed set is private (`publicForm`).
        const block = await renderWith({ [spec.clauseKey]: { term: "agreed" } }, true);
        expect(block.textContent).toContain("Held stage");
        expect(screen.getByTestId(`audit-clause-${spec.clauseKey}`).textContent).toContain("agreed");
        expect(screen.getByTestId(`audit-clause-${spec.clauseKey}`).textContent).not.toContain("Committed with no field values.");
        expect(screen.queryByTestId("audit-missing-parts")?.textContent ?? "").not.toContain("Content of private clause");
    });

    it("a clause signed with no field: its place says it was committed with no field values, and nothing is named missing", async () => {
        const block = await renderWith({ [emptySpec.clauseKey]: {} }, false);
        expect(block.textContent).toContain("No committed field");
        expect(screen.getByTestId(`audit-clause-${emptySpec.clauseKey}`).textContent).toContain("Committed with no field values.");
        expect(screen.queryByTestId("audit-missing-parts")?.textContent ?? "").not.toContain("Content of private clause");
    });
});
